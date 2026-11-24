"""In-app profile actions use isolated registries and a stubbed restart."""
import json
from pathlib import Path
import sqlite3
import threading

import pytest


@pytest.fixture()
def profiles_app(tmp_path, monkeypatch):
    from public_plugin_fixture import create_test_app, dispose_test_app
    from instance_profiles import ProfileStore
    app = create_test_app(tmp_path / 'runtime', monkeypatch)
    from app import config as cfg
    from app.routes import profiles
    from app.services import global_stop
    store = ProfileStore(root=tmp_path, environ={
        'LDS_DATA_DIR': str(cfg._data_dir()), 'LDS_CONFIG': str(cfg._config_path()),
        'LDS_ENV': str(cfg.ENV_PATH)})
    monkeypatch.setattr(profiles, 'ProfileStore', lambda: store)
    monkeypatch.setattr(global_stop, 'stop_everything', lambda _app, _user_id: {'targets': []})
    monkeypatch.setenv('LDS_PROFILE_ID', 'default')
    monkeypatch.delenv('LDS_PROFILE_SWITCH_SUPPORTED', raising=False)
    try:
        yield app, store
    finally:
        dispose_test_app(app)


@pytest.mark.parametrize('bound_host', ['0.0.0.0', '127.0.0.1', '::1', '192.0.2.9'])
def test_creating_a_profile_defaults_to_lan_without_copying_settings(profiles_app, bound_host):
    app, store = profiles_app
    app.config['LDS_BOUND_HOST'] = bound_host
    result = app.test_client().post('/api/profiles', json={'name': 'Example'}).get_json()
    assert result['ok']
    assert result['profile']['port'] == store.get('default')['port']
    row = store.get(result['profile']['id'])
    settings = json.loads(Path(row['paths']['LDS_CONFIG']).read_text())
    assert set(settings) == {'server'}
    assert settings['server']['host'] == (bound_host if bound_host == '192.0.2.9' else '0.0.0.0')
    assert settings['server']['require_token'] is False
    assert not settings['server'].get('access_token')
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


@pytest.mark.parametrize('remote,host_override', [('127.0.0.1', None), ('198.51.100.9', '0.0.0.0')])
def test_switch_records_the_target_before_scheduling_restart(profiles_app, monkeypatch, remote, host_override):
    from app.services import updater
    app, store = profiles_app
    target = store.create('Example')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setenv('LDS_PROFILE_SWITCH_SUPPORTED', '1')
    if host_override:
        monkeypatch.setenv('LDS_HOST', host_override)
    seen = []

    def schedule(**options):
        seen.append((json.loads((store.home / 'switch.json').read_text()), options))
        return True

    monkeypatch.setattr(updater, 'schedule_restart', schedule)
    response = app.test_client().post('/api/profiles/switch', json={'profile_id': target['id']},
                                      environ_overrides={'REMOTE_ADDR': remote})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['profile_id'] == target['id']
    assert payload['port'] == store.shared_port()
    from urllib.parse import urlsplit
    assert urlsplit(payload['destination']).port == payload['port']
    assert seen == [({'source': 'default', 'target': target['id']}, {'delay': 0.3, 'block_during_update': True})]
    assert store.selected() == 'default'
    response.close()


@pytest.mark.parametrize('stop_state', ['stopped', 'unconfirmed', 'failed', 'exception'])
def test_switch_proceeds_with_queued_work_and_stuck_requests(profiles_app, monkeypatch, stop_state):
    from app.config import LOCAL_USER
    from app.plugins import restart
    from app.services import global_stop, updater
    from instance_profiles import FileLease
    app, store = profiles_app
    target = store.create('Example')
    inactive = store.create('Inactive')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setenv('LDS_PROFILE_SWITCH_SUPPORTED', '1')
    monkeypatch.setattr(restart, '_READ_DRAIN_SECONDS', 0)
    gate = app.extensions[restart._EXTENSION]
    gate.writers.add(object())
    gate.readers[object()] = '/api/example-poll'
    gate.frozen = True
    gate.message = 'Example profile move.'
    source_db = Path(store.get('default')['paths']['LDS_DATA_DIR']) / 'studio.db'
    with sqlite3.connect(source_db) as connection:
        connection.execute('CREATE TABLE bank_queue_entry (bank_id INTEGER)')
        connection.execute('INSERT INTO bank_queue_entry (bank_id) VALUES (1)')
    inactive_db = Path(inactive['paths']['LDS_DATA_DIR']) / 'studio.db'
    inactive_db.write_bytes(b'not a database')
    seen = []

    def stop(current, user_id):
        assert current is app
        assert user_id == LOCAL_USER
        assert gate.switching
        seen.append('stop')
        if stop_state == 'exception':
            raise RuntimeError('Example stop failure')
        return {'targets': [{'name': 'Bank queue', 'state': stop_state}]}

    def schedule(**_options):
        assert gate.switching
        assert gate.readers and gate.writers
        seen.append('restart')
        return True

    monkeypatch.setattr(global_stop, 'stop_everything', stop)
    monkeypatch.setattr(updater, 'schedule_restart', schedule)
    with FileLease(store.home / 'transition.lock'):
        response = app.test_client().post('/api/profiles/switch', json={'profile_id': target['id']})
    assert response.status_code == 200
    assert seen == ['stop', 'restart']
    assert json.loads((store.home / 'switch.json').read_text())['target'] == target['id']
    with sqlite3.connect(source_db) as connection:
        assert connection.execute('SELECT bank_id FROM bank_queue_entry').fetchall() == [(1,)]
    assert inactive_db.read_bytes() == b'not a database'


def test_switch_stops_work_outside_the_shared_stop_path(profiles_app, monkeypatch):
    from types import SimpleNamespace

    from app.config import LOCAL_USER
    from app.extensions import db
    from app.models import ImageGenerationQueue, ImageSourceJob
    from app.services import image_sources, profile_switch_work, updater

    app, store = profiles_app
    target = store.create('Example')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setenv('LDS_PROFILE_SWITCH_SUPPORTED', '1')
    control = image_sources.runtime(app)
    control['active'] = 'example-active'
    seen = []
    app.extensions['video_auto_continue'] = SimpleNamespace(
        lock=threading.RLock(), record={'state': {'id': 'example-auto', 'enabled': True}},
        stop=lambda session: seen.append(session), thread=None,
    )
    with app.app_context():
        for job_id, state in [('example-active', 'running'), ('example-waiting', 'queued')]:
            db.session.add(ImageSourceJob(id=job_id, user_id=LOCAL_USER, state=state,
                                          provider='example.invalid', url='https://example.invalid/',
                                          destination='bank'))
        db.session.add(ImageGenerationQueue(job_id='example-render', user_id=LOCAL_USER))
        db.session.commit()

    def schedule(**_options):
        assert control['cancel'].is_set()
        assert db.session.get(ImageSourceJob, 'example-waiting').state == 'cancelled'
        render = ImageGenerationQueue.query.filter_by(job_id='example-render').one()
        assert render.status == 'cancelled'
        assert render.error_message == 'Cancelled during a profile switch.'
        seen.append('restart')
        return True

    monkeypatch.setattr(profile_switch_work, '_dispatch_auto_resolved_cancellation', seen.append)
    monkeypatch.setattr(updater, 'schedule_restart', schedule)
    response = app.test_client().post('/api/profiles/switch', json={'profile_id': target['id']})
    assert response.status_code == 200
    assert seen == ['example-auto', 'example-render', 'restart']


def test_switch_does_not_require_plugin_restart_safety(profiles_app, monkeypatch):
    from app.plugins import restart
    from app.services import updater
    app, store = profiles_app
    target = store.create('Example')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setenv('LDS_PROFILE_SWITCH_SUPPORTED', '1')
    monkeypatch.delitem(app.extensions, restart._EXTENSION)
    monkeypatch.delitem(app.extensions, 'lds_plugins')
    monkeypatch.setattr(updater, 'schedule_restart', lambda **_options: True)
    assert app.test_client().post('/api/profiles/switch', json={'profile_id': target['id']}).status_code == 200


@pytest.mark.parametrize('token', [None, 'example-target-token'])
@pytest.mark.parametrize('outcome', ['scheduled', 'refused', 'failed'])
@pytest.mark.parametrize('remote,bound_host', [('198.51.100.9', '0.0.0.0'), ('127.0.0.1', '127.0.0.1')])
def test_profile_switch_defaults_legacy_lan_and_rolls_back(profiles_app, monkeypatch, token, outcome, remote, bound_host):
    from urllib.parse import parse_qs, urlsplit
    from app import config as cfg
    from app.plugins.restart import _EXTENSION
    from app.services import updater
    app, store = profiles_app
    cfg.save_config({'server': {'access_token': 'example-source-token'}})
    settings = {'server': {'host': '127.0.0.1', 'require_token': False},
                'example': {'keep': 'target-setting'}}
    if token:
        settings['server']['access_token'] = token
    target = store.create('Example', config=settings)
    # Emulate an older profile with its original local-only settings.
    Path(target['paths']['LDS_CONFIG']).write_text(json.dumps(settings), encoding='utf-8')
    source_path = Path(store.get('default')['paths']['LDS_CONFIG'])
    source_bytes = source_path.read_bytes()
    app.config['LDS_BOUND_HOST'] = bound_host
    monkeypatch.delenv('LDS_HOST', raising=False)
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setenv('LDS_PROFILE_SWITCH_SUPPORTED', '1')
    gate = app.extensions[_EXTENSION]
    seen = []

    def schedule(**_options):
        seen.append(json.loads((store.home / 'switch.json').read_text()))
        if outcome == 'failed':
            raise OSError('Example restart failure')
        return outcome == 'scheduled'

    monkeypatch.setattr(updater, 'schedule_restart', schedule)
    response = app.test_client().post('/api/profiles/switch',
        json={'profile_id': target['id']},
        environ_overrides={'REMOTE_ADDR': remote})
    saved = json.loads(Path(target['paths']['LDS_CONFIG']).read_text())
    assert source_path.read_bytes() == source_bytes
    assert store.selected() == 'default'
    if outcome == 'scheduled':
        assert response.status_code == 200
        assert saved['server']['host'] == '0.0.0.0'
        assert saved['server']['require_token'] is False
        query = parse_qs(urlsplit(response.get_json()['destination']).query)
        if token:
            assert saved['server']['access_token'] == token
            assert query.get('token') == [token]
        else:
            assert not saved['server'].get('access_token')
            assert 'token' not in query
        assert saved['server'].get('access_token') != 'example-source-token'
        assert saved['example'] == settings['example']
        assert gate.switching
    else:
        assert response.status_code == 409
        assert saved == settings
        assert not (store.home / 'switch.json').exists()
        assert not gate.switching
        assert app.test_client().get('/api/profiles').status_code == 200
    assert len(seen) == 1
    response.close()


def test_profile_switch_does_not_override_a_local_host_environment(profiles_app, monkeypatch):
    app, store = profiles_app
    target = store.create('Example')
    path = Path(target['paths']['LDS_CONFIG'])
    original = path.read_bytes()
    app.config['LDS_BOUND_HOST'] = '0.0.0.0'
    monkeypatch.setenv('LDS_HOST', '127.0.0.1')
    monkeypatch.setenv('LDS_RESTART_MODE', 'supervisor')
    monkeypatch.setenv('LDS_PROFILE_SWITCH_SUPPORTED', '1')
    response = app.test_client().post('/api/profiles/switch',
        json={'profile_id': target['id']},
        environ_overrides={'REMOTE_ADDR': '198.51.100.9'})
    assert response.status_code == 409
    assert 'code' not in response.get_json()
    assert path.read_bytes() == original
    assert not (store.home / 'switch.json').exists()


def test_profile_freeze_excludes_its_writer_but_refuses_inflight_reads():
    from app.plugins.restart import RestartBlocked, _Gate
    gate = _Gate()
    own, other = object(), object()
    gate.writers.add(own)
    gate.readers[other] = '/api/example'
    with pytest.raises(RestartBlocked):
        gate.freeze(own, 'Example profile change.')
    assert gate.frozen is False
    gate.readers.clear()
    gate.freeze(own, 'Example profile change.')
    assert gate.frozen is True
    gate.release()


def test_profile_switch_gives_a_brief_concurrent_read_time_to_finish(profiles_app):
    from app.plugins.restart import _EXTENSION, drain_for_profile_switch
    app, _store = profiles_app
    gate = app.extensions[_EXTENSION]
    poll = object()
    gate.readers[poll] = '/api/example-poll'

    def finish_poll():
        with gate.lock:
            gate.readers.pop(poll, None)
            gate.lock.notify_all()

    timer = threading.Timer(0.05, finish_poll)
    timer.start()
    try:
        with app.test_request_context(), drain_for_profile_switch():
            assert not gate.readers
            assert app.test_client().get('/api/profiles').status_code == 503
    finally:
        timer.join()


def test_profile_freeze_still_refuses_a_read_that_will_not_drain():
    """Bank moves still require an idle server."""
    from app.plugins.restart import RestartBlocked, _Gate
    gate = _Gate()
    own, stuck = object(), object()
    gate.writers.add(own)
    gate.readers[stuck] = '/api/example-stuck'
    with pytest.raises(RestartBlocked, match='still running'):
        gate.freeze(own, 'Example profile change.', drain_timeout=0.1)
    assert gate.frozen is False


def test_a_poll_arriving_during_the_drain_is_turned_away(profiles_app):
    """New reads must not refill the set a freeze is waiting to empty.

    Without this the drain could wait out its whole timeout while the
    dashboard's 2s pollers kept handing it fresh reads.
    """
    from app.plugins.restart import _EXTENSION
    app, _store = profiles_app
    gate = app.extensions[_EXTENSION]
    with gate.lock:
        gate.draining = True
    try:
        response = app.test_client().get('/api/profiles')
        assert response.status_code == 503
        assert response.get_json()['code'] == 'restarting'
    finally:
        with gate.lock:
            gate.draining = False
            gate.lock.notify_all()
    assert app.test_client().get('/api/profiles').status_code == 200


def test_a_cold_capability_probe_does_not_block_a_profile_change():
    """REGRESSION — /api/capabilities takes ~10s on a cold cache.

    It probes installed tooling and answers in milliseconds once warm, so a
    setup re-check just before a click left it running well past the drain and
    the switch refused for the whole probe. It guards no state a profile change
    waits for, so it must never enter the reader set.
    """
    from app.plugins.restart import _UNBLOCKING_READS
    assert '/api/capabilities' in _UNBLOCKING_READS


def test_the_capability_probe_is_admitted_without_being_counted(profiles_app, monkeypatch):
    """The exempt path is admitted and served, but never counted as in flight."""
    from app.plugins import restart
    from app.plugins.restart import _EXTENSION
    app, _store = profiles_app
    gate = app.extensions[_EXTENSION]
    seen = {}

    @app.route('/__probe_caps')
    def _probe():
        from flask import jsonify as _j
        seen['readers'] = dict(gate.readers)
        return _j({'ok': True})

    monkeypatch.setattr(restart, '_UNBLOCKING_READS', frozenset(('/__probe_caps',)))
    assert app.test_client().get('/__probe_caps').status_code == 200
    assert seen['readers'] == {}, 'an exempt probe must not count as work in flight'
    # A freeze proceeds immediately even while such a probe is in flight.
    own = object()
    gate.readers.clear()
    gate.freeze(own, 'Example profile change.', drain_timeout=0.1)
    assert gate.frozen is True
    gate.release()
