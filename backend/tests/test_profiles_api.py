"""In-app profile actions use isolated registries and a stubbed restart."""
import json
from pathlib import Path
import threading
from types import SimpleNamespace

import pytest


@pytest.fixture()
def profiles_app(tmp_path, monkeypatch):
    from public_plugin_fixture import create_test_app, dispose_test_app
    from instance_profiles import ProfileStore
    app = create_test_app(tmp_path / 'runtime', monkeypatch)
    from app import config as cfg
    from app.routes import profiles
    store = ProfileStore(root=tmp_path, environ={
        'LDS_DATA_DIR': str(cfg._data_dir()), 'LDS_CONFIG': str(cfg._config_path()),
        'LDS_ENV': str(cfg.ENV_PATH)})
    monkeypatch.setattr(profiles, 'ProfileStore', lambda: store)
    monkeypatch.setenv('LDS_PROFILE_ID', 'default')
    monkeypatch.delenv('LDS_PROFILE_SWITCH_SUPPORTED', raising=False)
    try:
        yield app, store
    finally:
        dispose_test_app(app)


def test_creating_a_profile_preserves_access_without_copying_settings(profiles_app):
    app, store = profiles_app
    app.config['LDS_BOUND_HOST'] = '0.0.0.0'
    result = app.test_client().post('/api/profiles', json={'name': 'Example'}).get_json()
    assert result['ok']
    row = store.get(result['profile']['id'])
    settings = json.loads(Path(row['paths']['LDS_CONFIG']).read_text())
    assert set(settings) == {'server'}
    assert settings['server']['host'] == '0.0.0.0'
    assert len(settings['server']['access_token']) >= 24
    assert Path(row['paths']['LDS_ENV']).read_bytes() == b''
    assert store.selected() == 'default'


def test_an_old_supervisor_cannot_accept_a_switch(profiles_app, monkeypatch):
    app, store = profiles_app
    target = store.create('Example')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    client = app.test_client()
    assert client.get('/api/profiles').get_json()['can_switch'] is False
    assert client.post('/api/profiles/switch', json={'profile_id': target['id']}).status_code == 409
    assert not (store.home / 'switch.json').exists()


def test_switch_records_the_target_before_scheduling_restart(profiles_app, monkeypatch):
    from app.routes import profiles
    from app.services import updater
    app, store = profiles_app
    target = store.create('Example')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setenv('LDS_PROFILE_SWITCH_SUPPORTED', '1')
    finished = threading.Event()
    finished.set()
    gate = SimpleNamespace(finished=finished, release=lambda: None)
    monkeypatch.setattr(profiles, 'freeze_profile_work', lambda: gate)
    seen = []

    def schedule(**options):
        seen.append((json.loads((store.home / 'switch.json').read_text()), options))
        return True

    monkeypatch.setattr(updater, 'schedule_restart', schedule)
    response = app.test_client().post('/api/profiles/switch', json={'profile_id': target['id']})
    assert response.status_code == 200
    assert response.get_json()['profile_id'] == target['id']
    assert seen == [({'source': 'default', 'target': target['id']}, {'block_during_update': True})]
    assert store.selected() == 'default'
    response.close()


def test_busy_profile_does_not_write_a_switch_request(profiles_app, monkeypatch):
    from app.plugins.restart import RestartBlocked
    from app.routes import profiles
    app, store = profiles_app
    target = store.create('Example')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setenv('LDS_PROFILE_SWITCH_SUPPORTED', '1')

    def busy():
        raise RestartBlocked('Example work is running.')

    monkeypatch.setattr(profiles, 'freeze_profile_work', busy)
    response = app.test_client().post('/api/profiles/switch', json={'profile_id': target['id']})
    assert response.status_code == 409
    assert not (store.home / 'switch.json').exists()


def test_profile_freeze_excludes_its_writer_but_refuses_inflight_reads():
    from app.plugins.restart import RestartBlocked, _Gate
    gate = _Gate()
    own, other = object(), object()
    gate.writers.add(own)
    gate.readers.add(other)
    with pytest.raises(RestartBlocked):
        gate.freeze(own, 'Example profile change.')
    assert gate.frozen is False
    gate.readers.clear()
    gate.freeze(own, 'Example profile change.')
    assert gate.frozen is True
    gate.release()
