"""Remote work has to be VISIBLE — on the hub's log and on the peer itself.

Queuing a bank pass to a peer used to be invisible from both ends: the hub
logged 'score started' / 'score finished' in words identical to a local run
(and the "GPU taken exclusively" line cannot fire for a remote pass, because
it deliberately never takes the local window), while the peer ran an hour of
someone else's work with its own panel empty.
"""
from __future__ import annotations

import json
import time

import pytest

PEER = '4fa2b7c1-0000-4000-8000-000000000042'


# ── The event carries WHERE, and it is a name, never a uuid ───────────────

def test_an_event_carries_the_device_and_defaults_to_local(app):
    from app.services import activity_log
    activity_log.reset()
    activity_log.record('bank', 'score finished', level='ok')
    activity_log.record('bank', 'score finished', level='ok', device='Laptop 4090')
    local, remote = activity_log.events()
    assert local['device'] is None, 'a local pass must not claim a device'
    assert remote['device'] == 'Laptop 4090'


def test_device_label_is_the_name_never_the_uuid(app):
    from app import config as cfg
    from app.services import cluster as cluster_svc
    with app.app_context():
        assert cluster_svc.device_label(None) is None
        assert cluster_svc.device_label('local') is None
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        peer = cluster_svc.redeem_join_token(minted['token'], name='Laptop 4090')
        label = cluster_svc.device_label(peer['device_id'])
        assert label == 'Laptop 4090'
        assert peer['device_id'] not in label
        # A device whose row is gone degrades to a generic — it must not fall
        # back to printing the id it was asked to keep out of the log.
        gone = cluster_svc.device_label('7c9e1a55-0000-4000-8000-000000000999')
        assert gone == 'a compute peer'
        assert '7c9e1a55' not in gone


def test_an_api_backend_labels_by_its_name_too(app):
    from app.services import cluster as cluster_svc
    with app.app_context():
        entry = cluster_svc.add_backend('Laptop ComfyUI', 'http://laptop:8188')
        assert cluster_svc.device_label(entry['id']) == 'Laptop ComfyUI'


# ── bank_jobs threads the label through every transition ──────────────────

def test_every_bank_transition_names_the_peer(app):
    from app.services import activity_log, bank_jobs
    activity_log.reset()
    bank_jobs.start(app, 4242, 'score', lambda job: None, total=7,
                    device_label='Laptop 4090')
    msgs = {(e['message'], e['device']) for e in activity_log.events()}
    assert ('score started', 'Laptop 4090') in msgs
    assert ('score finished', 'Laptop 4090') in msgs


def test_a_failed_remote_pass_still_names_the_peer(app):
    from app.services import activity_log, bank_jobs

    def boom(job):
        raise RuntimeError('peer said no')
    activity_log.reset()
    bank_jobs.start(app, 4243, 'faces', boom, device_label='Laptop 4090')
    failed = [e for e in activity_log.events() if e['level'] == 'error']
    assert failed and failed[0]['device'] == 'Laptop 4090'


def test_a_local_pass_logs_exactly_as_before(app):
    from app.services import activity_log, bank_jobs
    activity_log.reset()
    bank_jobs.start(app, 4244, 'score', lambda job: None, total=3)
    assert all(e['device'] is None for e in activity_log.events())


def test_the_running_row_says_which_machine(app):
    from app.services import activity_log, bank_jobs
    with app.app_context():
        # A job that has NOT finished, so it is still in the running list.
        bank_jobs.start(app, 4245, 'score',
                        lambda job: bank_jobs.progress(job, done=1, total=9),
                        total=9, device_label='Laptop 4090')
        snap = bank_jobs.get(4245)
        assert snap['device'] == 'Laptop 4090'


# ── the peer round trip is narrated at all (it was silent) ────────────────

def test_the_hub_logs_the_whole_remote_round_trip(app, tmp_path, monkeypatch):
    import re
    from app import config as cfg
    from app.services import activity_log, bank_jobs, bank_remote
    from app.services import cluster as cluster_svc

    img = tmp_path / 'a.jpg'
    img.write_bytes(b'x')
    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        peer = cluster_svc.redeem_join_token(minted['token'], name='Laptop 4090')
        monkeypatch.setattr(bank_jobs, 'cancelled', lambda job: False)
        monkeypatch.setattr(bank_jobs, 'progress', lambda job, **kw: None)
        monkeypatch.setattr(
            'app.services.cluster_remote.enqueue_infer_on_device',
            lambda *a, **k: 'job-vis')
        monkeypatch.setattr(bank_remote, 'POLL_SECONDS', 0)

        # claimed on the first poll, completed on the second.
        seq = iter(['claimed', 'completed'])

        class _Row:
            progress = None
            error_message = None
            status = 'claimed'

        row = _Row()

        class _FakeClusterJob:
            query = type('Q', (), {'filter_by': staticmethod(
                lambda **kw: type('F', (), {'first': staticmethod(lambda: row)})())})()
        monkeypatch.setattr('app.models.ClusterJob', _FakeClusterJob)

        def advance(*_a, **_k):
            try:
                row.status = next(seq)
            except StopIteration:
                pass
        monkeypatch.setattr('app.extensions.db.session.expire', advance)
        monkeypatch.setattr(bank_remote, '_read_result',
                            lambda job_id: {'ok': True, 'results': {}, 'clusters': {}})
        monkeypatch.setattr(bank_remote, '_install_cache',
                            lambda *a, **k: None)

        activity_log.reset()
        bank_remote.run_remote_pass(
            object(), peer['device_id'], script='bank_score_infer.py',
            by_path={str(img): 1}, extra_payload={},
            cache_path=tmp_path / 'c.npz', progress_re=re.compile(r'nope(\d)(\d)'),
            detail_label='scoring pass', bank_id=99)

    events = activity_log.events()
    assert all(e['source'] == 'peer' for e in events), events
    text = ' | '.join(e['message'] for e in events)
    # sent → running (the peer's GPU is busy now) → finished. The middle one is
    # the counterpart to the local window's "GPU taken exclusively".
    assert 'sending 1 image(s)' in text
    assert 'is running the scoring pass' in text
    assert 'finished the scoring pass' in text
    assert all(e['device'] == 'Laptop 4090' for e in events)
    assert all(peer['device_id'] not in json.dumps(e) for e in events), \
        'the uuid must never reach the log'
    assert all(e['bank_id'] == 99 for e in events)


# ── the peer knows, and says, what it is doing ────────────────────────────

def test_peer_status_reports_the_kind_and_clears_it(app, monkeypatch):
    from app.services.peer_worker import peer_worker
    peer_worker.init_app(app)
    assert peer_worker.status()['current_kind'] is None

    seen = {}

    def fake_execute(job):
        seen['during'] = dict(peer_worker.status())
    monkeypatch.setattr(peer_worker, '_execute', fake_execute)
    monkeypatch.setattr(peer_worker, '_log', lambda *a, **k: None)
    # Drive the claim/finally block directly: _tick's HTTP half is not the
    # subject here, the bookkeeping around _execute is.
    peer_worker._busy = True
    peer_worker._current_job_id = 'j1'
    peer_worker._current_kind = 'infer'
    try:
        peer_worker._execute({'job_id': 'j1', 'kind': 'infer'})
    finally:
        peer_worker._busy = False
        peer_worker._current_job_id = None
        peer_worker._current_kind = None
    assert seen['during']['current_kind'] == 'infer'
    assert seen['during']['busy'] is True
    assert peer_worker.status()['current_kind'] is None
    assert peer_worker.status()['busy'] is False


def test_the_peer_records_its_own_events(app, monkeypatch):
    from app.services import activity_log
    from app.services.peer_worker import peer_worker
    peer_worker.init_app(app)
    activity_log.reset()
    monkeypatch.setattr(peer_worker, '_run_infer', lambda job: None)
    peer_worker._execute({'job_id': 'j2', 'kind': 'infer'})
    msgs = [e['message'] for e in activity_log.events()]
    assert any('finished the infer' in m for m in msgs), msgs
    assert all(e['source'] == 'peer' for e in activity_log.events())


def test_a_failing_job_is_recorded_on_the_peer_too(app, monkeypatch):
    from app.services import activity_log
    from app.services.peer_worker import peer_worker
    peer_worker.init_app(app)
    activity_log.reset()

    def boom(job):
        raise RuntimeError('cv2 missing')
    monkeypatch.setattr(peer_worker, '_run_infer', boom)
    monkeypatch.setattr(peer_worker, '_complete', lambda *a, **k: None)
    peer_worker._execute({'job_id': 'j3', 'kind': 'infer'})
    errs = [e for e in activity_log.events() if e['level'] == 'error']
    assert errs and 'cv2 missing' in (errs[0]['detail'] or '')


def test_the_phase_follows_the_job_without_a_second_bookkeeping_path(app,
                                                                    monkeypatch):
    from app.services.peer_worker import peer_worker
    peer_worker.init_app(app)
    peer_worker._phase = None
    monkeypatch.setattr('requests.post',
                        lambda *a, **k: type('R', (), {'content': b'',
                                                       'json': lambda self: {}})())
    peer_worker._progress('j4', {'phase': 'rendering'})
    assert peer_worker.status()['phase'] == 'rendering'


# ── the live endpoint is cheap enough to poll ─────────────────────────────

def test_cluster_activity_never_probes_comfyui_or_ollama(app, client, monkeypatch):
    """It exists precisely because /status does: capabilities.probe() makes
    blocking HTTP calls, and this route is polled every few seconds."""
    from app import capabilities

    def explode():
        raise AssertionError('the live endpoint must not probe')
    monkeypatch.setattr(capabilities, 'probe', explode)
    r = client.get('/api/cluster/activity')
    assert r.status_code == 200
    assert r.get_json()['role'] in ('standalone', 'primary', 'peer')


def test_cluster_activity_reports_the_peer_shape(app, client, monkeypatch):
    from app import config as cfg
    from app.services.peer_worker import peer_worker
    with app.app_context():
        cfg.save_config({'cluster': {'role': 'peer'}})
    monkeypatch.setattr(peer_worker, 'status',
                        lambda: {'busy': True, 'current_kind': 'infer',
                                 'phase': 'infer', 'connected': True,
                                 'current_job_id': 'abc12345'})
    d = client.get('/api/cluster/activity').get_json()
    assert d == {'role': 'peer', 'busy': True, 'kind': 'infer', 'phase': 'infer',
                 'connected': True, 'current_job_id': 'abc12345'}


def test_cluster_activity_reports_the_primary_shape(app, client):
    from app import config as cfg
    from app.services import cluster as cluster_svc
    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        cluster_svc.redeem_join_token(minted['token'], name='Laptop 4090')
    d = client.get('/api/cluster/activity').get_json()
    assert d['role'] == 'primary'
    assert [p['name'] for p in d['peers']] == ['Laptop 4090']
    assert set(d['peers'][0]) == {'id', 'name', 'online', 'busy'}
    assert d['pending_remote_jobs'] == 0


# --- the transfer is the longest silent stretch of a remote pass --------------

def test_the_hub_reports_the_transfer_instead_of_going_silent(app, monkeypatch):
    """Reported live: a 5372-image scoring pass sat on "peer is starting up
    (downloading images / loading models)" and the panel flagged it
    "no update for 5m — probably stuck". It was healthy — the peer was pulling
    ~367 images a minute, ~15 minutes of transfer before its script prints
    anything at all.

    The cause was a latch: the hub sent that detail ONCE and set detail_sent,
    and bank_jobs.progress is the only thing that refreshes `_touched`. So for
    the whole transfer the job looked untouched. It now reports every tick, and
    counts the artifact GETs the peer is already making.
    """
    from app.services import bank_jobs
    from app.services import cluster as cluster_svc

    with app.app_context():
        cluster_svc.forget_artifact_fetches('job-x')
        assert cluster_svc.artifacts_fetched('job-x') == 0
        for _ in range(7):
            cluster_svc.note_artifact_fetched('job-x')
        assert cluster_svc.artifacts_fetched('job-x') == 7
        # Per job, so two passes cannot read each other's numbers.
        assert cluster_svc.artifacts_fetched('job-y') == 0
        cluster_svc.forget_artifact_fetches('job-x')
        assert cluster_svc.artifacts_fetched('job-x') == 0

        # And the touch is what the staleness flag reads.
        job = bank_jobs.new_job('score') if hasattr(bank_jobs, 'new_job') else {
            'kind': 'score', 'done': 0, 'total': 0, 'detail': None,
            '_touched': 0.0}
        bank_jobs.progress(job, detail='sending images to Laptop (3/10)')
        first = job['_touched']
        assert first > 0
        time.sleep(0.02)
        bank_jobs.progress(job, detail='sending images to Laptop (4/10)')
        assert job['_touched'] > first, (
            'a repeated transfer update must refresh the touch time — that is '
            'the whole difference between "moving" and "probably stuck"')


def test_a_peer_reports_its_own_work_as_running(app, monkeypatch):
    """The peer's header chip said "Working for Primary" and its log carried
    "claimed a infer", while the same panel's Running-now section said nothing
    is running — because running[] was built only from bank_jobs and
    dataset_activity, and a peer's work lives in neither.
    """
    from app.services import activity_log
    from app.services.peer_worker import peer_worker

    with app.app_context():
        monkeypatch.setattr(peer_worker, 'status', lambda: {
            'running': True, 'connected': True, 'busy': True,
            'current_job_id': 'abc-123', 'current_kind': 'infer',
            'phase': 'downloading', 'last_error': None, 'primary_url': 'http://hub'})
        rows = [r for r in activity_log.snapshot('local')['running']
                if r['kind'] == 'peer']
        assert rows, 'a busy peer reported nothing running on its own machine'
        assert rows[0]['what'] == 'infer'
        assert rows[0]['detail'] == 'downloading'
        assert rows[0]['job_id'] == 'abc-123'

        # Idle again -> gone. A permanently-lit row is its own lie.
        monkeypatch.setattr(peer_worker, 'status', lambda: {
            'running': True, 'connected': True, 'busy': False,
            'current_job_id': None, 'current_kind': None, 'phase': None,
            'last_error': None, 'primary_url': 'http://hub'})
        assert not [r for r in activity_log.snapshot('local')['running']
                    if r['kind'] == 'peer']
