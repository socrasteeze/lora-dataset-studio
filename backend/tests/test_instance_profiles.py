"""Profile identity, current-install preservation and one-active-process safety."""
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

import instance_profiles as profiles


@pytest.fixture()
def store(tmp_path):
    root = tmp_path / 'install'
    root.mkdir()
    return profiles.ProfileStore(root=root, environ={})


def test_default_is_the_existing_instance_without_a_copy_or_migration(store):
    original = store.root / 'data'
    original.mkdir()
    (original / 'studio.db').write_bytes(b'original bytes')
    (store.root / 'config.json').write_text('{"server": {"port": 5100}}', encoding='utf-8')
    row = store.get('default')
    assert row['name'] == 'Default'
    assert row['port'] == 5100
    assert Path(row['paths']['LDS_DATA_DIR']) == original
    assert Path(row['paths']['LDS_CONFIG']) == store.root / 'config.json'
    assert not store.home.exists()
    named = store.create('Example')
    assert store.get('default') == row
    assert (original / 'studio.db').read_bytes() == b'original bytes'
    assert Path(named['paths']['LDS_DATA_DIR']) != original


def test_default_preserves_explicit_legacy_paths_and_environment(tmp_path):
    environment = {key: str(tmp_path / key.lower()) for key in profiles.PATH_KEYS}
    environment['LDS_CONFIG'] = str(tmp_path / 'settings.json')
    environment['HF_TOKEN'] = 'synthetic-token'
    store = profiles.ProfileStore(root=tmp_path, environ=environment)
    child = store.child_environment('default')
    for key in profiles.PATH_KEYS:
        assert child[key] == environment[key]
    assert child['HF_TOKEN'] == 'synthetic-token'


def test_every_profile_shares_the_default_data_dir_for_models_and_envs(store):
    named = store.create('Example')
    default_data = store.get('default')['paths']['LDS_DATA_DIR']
    assert store.child_environment(named['id'])['LDS_SHARED_DATA_DIR'] == default_data
    assert store.child_environment('default')['LDS_SHARED_DATA_DIR'] == default_data
    assert named['paths']['LDS_DATA_DIR'] != default_data


def test_a_recorded_lock_port_does_not_move_the_shared_address(store):
    data = store.root / 'data'
    data.mkdir()
    (data / 'server.lock').write_text(json.dumps({
        'pid': 424242, 'host': '127.0.0.1', 'port': 5051,
    }), encoding='utf-8')
    (store.root / 'config.json').write_text('{"server": {"port": 5100}}', encoding='utf-8')
    store.environ['LDS_PORT'] = '5050'
    assert store.get('default')['port'] == 5050
    created = store.create('Example')
    assert created['port'] == 5050
    assert store.browser_url('default') == 'http://127.0.0.1:5050/'


def test_new_profiles_start_empty_and_do_not_inherit_secrets(store):
    store.environ.update({key: 'synthetic-secret' for key in profiles.SECRET_KEYS})
    store.environ['LDS_ALLOW_SECOND_INSTANCE'] = '1'
    one = store.create('Example One')
    two = store.create('Example Two')
    assert one['id'] != two['id']
    assert one['port'] == two['port'] == store.get('default')['port'] == 5050
    for row in (one, two):
        environment = store.child_environment(row['id'])
        assert all(key not in environment for key in profiles.SECRET_KEYS)
        assert 'LDS_ALLOW_SECOND_INSTANCE' not in environment
        assert environment['LDS_AUTO_PORT'] == '0'
        assert environment['LDS_PORT'] == environment['LDS_PROFILE_PORT'] == '5050'
        assert 'LDS_BIND_MANAGED' not in environment
        settings = json.loads(Path(environment['LDS_CONFIG']).read_text(encoding='utf-8'))
        assert set(settings) == {'server'}
        assert settings['server']['host'] == '0.0.0.0'
        assert settings['server']['require_token'] is False
        assert not settings['server'].get('access_token')
        assert Path(environment['LDS_ENV']).read_bytes() == b''
        assert all(Path(environment[key]).is_dir() for key in (
            'LDS_DATA_DIR', 'LDS_PLUGINS_DIR', 'LDS_EXTENSIONS_DIR'))


def test_a_new_profile_mints_a_token_only_when_require_token_is_on(store):
    opted = store.create('Locked', config={'server': {'require_token': True}})
    settings = json.loads(Path(opted['paths']['LDS_CONFIG']).read_text(encoding='utf-8'))
    assert settings['server']['require_token'] is True
    assert len(settings['server']['access_token']) >= 24


def test_enable_lan_leaves_the_token_gate_off(store):
    row = store.create('Example')
    with store.enable_lan(row['id'], '0.0.0.0'):
        settings = json.loads(Path(row['paths']['LDS_CONFIG']).read_text(encoding='utf-8'))
    assert settings['server']['host'] == '0.0.0.0'
    assert settings['server']['require_token'] is False
    assert not settings['server'].get('access_token')


def test_enable_lan_keeps_an_opted_in_token(store):
    row = store.create('Example', config={'server': {'host': '127.0.0.1', 'require_token': True}})
    before = json.loads(Path(row['paths']['LDS_CONFIG']).read_text(encoding='utf-8'))
    with store.enable_lan(row['id'], '192.0.2.9'):
        settings = json.loads(Path(row['paths']['LDS_CONFIG']).read_text(encoding='utf-8'))
    assert settings['server']['host'] == '192.0.2.9'
    assert settings['server']['require_token'] is True
    assert settings['server']['access_token'] == before['server']['access_token']


def test_selection_defaults_to_the_current_install_and_survives_store_reopen(store):
    assert store.selected() == 'default'
    store.select('default')
    original = store.get('default')
    store.environ['LDS_DATA_DIR'] = str(store.root / 'unrelated')
    assert store.get('default') == original
    named = store.create('Example')
    store.select(named['id'])
    reopened = profiles.ProfileStore(home=store.home, root=store.root, environ={})
    assert reopened.selected() == named['id']


def test_switch_request_is_consumed_once_by_the_source_supervisor(store):
    named = store.create('Example')
    store.request_switch('default', named['id'])
    assert store.selected() == 'default'
    assert store.consume_switch('default') == named['id']
    assert store.selected() == named['id']
    assert store.consume_switch('default') is None


def test_stale_switch_request_does_not_change_the_selected_profile(store):
    named = store.create('Example')
    store.request_switch('default', named['id'])
    with pytest.raises(profiles.ProfileError):
        store.consume_switch(named['id'])
    assert store.selected() == 'default'


@pytest.mark.parametrize('name', ['', ' ', 'a' * 61, 'bad\nname'])
def test_invalid_names_are_refused_before_writes(store, name):
    with pytest.raises(profiles.ProfileError):
        store.create(name)
    assert not store.registry.exists()


def test_duplicate_names_and_changed_paths_are_refused(store):
    store.create('Example')
    with pytest.raises(profiles.ProfileError):
        store.create('example')
    document = json.loads(store.registry.read_text(encoding='utf-8'))
    document['profiles'][1]['paths']['LDS_DATA_DIR'] = str(store.root / 'data')
    store.registry.write_text(json.dumps(document), encoding='utf-8')
    with pytest.raises(profiles.ProfileError):
        store.profiles()


def test_corrupt_registry_never_silently_becomes_default(store):
    store.home.mkdir()
    store.registry.write_text('broken', encoding='utf-8')
    with pytest.raises(profiles.ProfileError):
        store.get('default')


def test_os_lease_rejects_a_second_process_and_releases_after_exit(store):
    lock = store.home / 'active.lock'
    script = (
        'from instance_profiles import FileLease, ProfileError\n'
        'import sys\n'
        'try:\n'
        '    with FileLease(sys.argv[1]): pass\n'
        'except ProfileError: sys.exit(4)\n'
    )
    command = [sys.executable, '-c', script, str(lock)]
    with profiles.FileLease(lock):
        assert subprocess.run(command, cwd=Path(profiles.__file__).parent).returncode == 4
    assert subprocess.run(command, cwd=Path(profiles.__file__).parent).returncode == 0


def test_legacy_live_default_blocks_a_named_launch_before_app_import(store, monkeypatch):
    import single_instance
    named = store.create('Example')
    monkeypatch.setattr(single_instance, 'read_lock', lambda _path: {'pid': 424242})
    monkeypatch.setattr(single_instance, 'pid_alive', lambda _pid: True)
    with pytest.raises(profiles.ProfileError, match='already running'):
        store.check_other_work(named['id'])


@pytest.mark.parametrize('key,value', [
    ('training_in_progress', True), ('training_pid', 424242),
    ('lora_train_queue', [{'dataset_id': 1}]), ('comfyui_stalled_barrier', True),
])
def test_unfinished_default_work_blocks_switching_but_allows_recovery(store, key, value):
    import single_instance
    named = store.create('Example')
    data = Path(store.get('default')['paths']['LDS_DATA_DIR'])
    data.mkdir()
    with sqlite3.connect(data / 'studio.db') as connection:
        connection.execute('CREATE TABLE system_state (key TEXT PRIMARY KEY, value TEXT)')
        connection.execute('INSERT INTO system_state VALUES (?, ?)', (key, json.dumps({'v': value})))
    with pytest.raises(profiles.ProfileError, match='unfinished work'):
        store.check_other_work(named['id'])
    assert single_instance.read_lock(data) is None
    store.check_other_work('default')


def test_unreadable_database_blocks_other_profiles_without_modifying_it(store):
    named = store.create('Example')
    data = Path(store.get('default')['paths']['LDS_DATA_DIR'])
    data.mkdir()
    database = data / 'studio.db'
    database.write_bytes(b'not a database')
    with pytest.raises(profiles.ProfileError, match='checked safely'):
        store.check_other_work(named['id'])
    assert database.read_bytes() == b'not a database'


def test_runtime_keeps_supervised_restart_ownership(store, monkeypatch):
    monkeypatch.setattr(profiles.os, 'environ', dict(profiles.os.environ))
    monkeypatch.setenv('LDS_PROFILES_HOME', str(store.home))
    monkeypatch.setenv('LDS_PROFILE_ID', 'default')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setattr(profiles, 'ProfileStore', lambda: store)
    monkeypatch.setattr(store, 'check_other_work', lambda _ident: None)
    lease = profiles.prepare_runtime()
    try:
        import os
        assert os.environ['LDS_RESTART_MODE'] == 'supervisor'
    finally:
        lease.__exit__()


def test_secret_inventory_covers_every_application_key(app):
    from app.config import SECRET_KEYS
    assert set(SECRET_KEYS).issubset(profiles.SECRET_KEYS)


def test_busy_runtime_does_not_change_paths_or_honor_the_old_bypass(store, monkeypatch):
    environment = {'LDS_ALLOW_SECOND_INSTANCE': '1', 'LDS_PROFILE_ID': 'default'}
    monkeypatch.setattr(profiles.os, 'environ', environment)
    monkeypatch.setattr(profiles, 'ProfileStore', lambda: store)
    with profiles.FileLease(store.home / 'active.lock'):
        with pytest.raises(profiles.ProfileError):
            profiles.prepare_runtime()
    assert environment == {'LDS_ALLOW_SECOND_INSTANCE': '1', 'LDS_PROFILE_ID': 'default'}


@pytest.mark.parametrize('table, statement', [
    ('image_generation_queue', "INSERT INTO image_generation_queue VALUES ('processing')"),
    ('bank_queue_entry', 'INSERT INTO bank_queue_entry VALUES (1)'),
])
def test_persisted_work_queues_block_another_profile(store, table, statement):
    named = store.create('Example')
    data = Path(store.get('default')['paths']['LDS_DATA_DIR'])
    data.mkdir()
    with sqlite3.connect(data / 'studio.db') as connection:
        column = 'status TEXT' if table == 'image_generation_queue' else 'id INTEGER'
        connection.execute(f'CREATE TABLE {table} ({column})')
        connection.execute(statement)
    with pytest.raises(profiles.ProfileError):
        store.check_other_work(named['id'])
    store.check_other_work('default')


def test_profile_gate_precedes_every_application_import():
    import ast
    tree = ast.parse(Path(profiles.__file__).with_name('run.py').read_text(encoding='utf-8'))
    app_import = next(index for index, node in enumerate(tree.body)
                      if isinstance(node, ast.ImportFrom) and node.module == 'app')
    assert any(isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
               and node.func.id == 'prepare_runtime'
               for statement in tree.body[:app_import] for node in ast.walk(statement))


def test_browser_reopen_uses_the_shared_port_and_that_profiles_token(store, monkeypatch):
    import single_instance
    row = store.create('Example')
    Path(row['paths']['LDS_CONFIG']).write_text(json.dumps({
        'server': {'access_token': 'synthetic token', 'port': 5200},
    }), encoding='utf-8')
    monkeypatch.setattr(single_instance, 'read_lock', lambda _data: {'host': '0.0.0.0', 'port': 5200})
    assert store.browser_url(row['id']) == 'http://127.0.0.1:5050/?token=synthetic+token'


def test_legacy_recorded_port_migrates_without_removing_profile_data(store):
    (store.root / 'config.json').write_text('{"server": {"port": 5050}}', encoding='utf-8')
    named = store.create('Example')
    marker = Path(named['paths']['LDS_DATA_DIR']) / 'keep.txt'
    marker.write_text('kept', encoding='utf-8')
    document = json.loads(store.registry.read_text(encoding='utf-8'))
    for row in document['profiles']:
        row['port'] = 5051
    store.registry.write_text(json.dumps(document), encoding='utf-8')
    reloaded = profiles.ProfileStore(home=store.home, root=store.root, environ={})
    rows = reloaded.profiles()
    assert [row['port'] for row in rows] == [5050, 5050]
    assert [row['id'] for row in rows] == [row['id'] for row in document['profiles']]
    assert marker.read_text(encoding='utf-8') == 'kept'
    saved = json.loads(reloaded.registry.read_text(encoding='utf-8'))
    assert [row['port'] for row in saved['profiles']] == [5050, 5050]
    assert [row['paths'] for row in saved['profiles']] == [row['paths'] for row in document['profiles']]
    environment = reloaded.child_environment(named['id'])
    assert environment['LDS_PORT'] == environment['LDS_PROFILE_PORT'] == '5050'
    assert environment['LDS_DATA_DIR'] == named['paths']['LDS_DATA_DIR']


def test_settings_report_the_active_profile_and_owned_training_paths(app, client, monkeypatch):
    monkeypatch.setenv('LDS_PROFILE_ID', '1' * 32)
    monkeypatch.setenv('LDS_PROFILE_NAME', 'Example')
    response = client.get('/api/instance-profile')
    assert response.status_code == 200
    assert response.get_json() == {'id': '1' * 32, 'name': 'Example'}
    runtime = client.get('/api/settings').get_json()['runtime']['profile']
    assert runtime['name'] == 'Example'
    assert set(runtime['training']) == {'datasets', 'output', 'jobs'}
