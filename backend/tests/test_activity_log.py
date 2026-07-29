"""📋 The app-wide activity log — "is it stuck?", answerable in one place.

Owner request: *"a verbose log similar to how ComfyUI handles queued jobs, so I
can actually see a full log of what's going on… so I can see if it's stuck or
not having to switch between pages."*

Two invariants matter more than the contents:

* **it can never break the work it describes** — recording is best-effort and
  swallowed whole, because the one thing worse than no visibility is visibility
  that takes down a pass;
* **`stale_seconds` is the answer to "is it stuck"** — a bar frozen at 34% and a
  bar that will move again in two seconds are drawn identically, and only the
  age of the last update tells them apart.
"""
import time

import pytest
from PIL import Image


@pytest.fixture(autouse=True)
def _clean():
    from app.services import activity_log, bank_jobs, dataset_activity
    activity_log.reset()
    bank_jobs.reset()
    dataset_activity.reset()
    yield
    activity_log.reset()
    bank_jobs.reset()
    dataset_activity.reset()


def _bank(tmp_path, name='Dump', n=2):
    from app.services import image_bank_service as banks
    src = tmp_path / name
    src.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        Image.new('RGB', (32, 32), (i * 30, 90, 160)).save(str(src / f'{i}.jpg'))
    bank, _added = banks.create_bank('local', name, str(src))
    return bank.id


# --- the ring ----------------------------------------------------------------

def test_events_come_back_oldest_first_with_a_cursor(app):
    from app.services import activity_log

    for i in range(5):
        activity_log.record('bank', f'event {i}')
    rows = activity_log.events()
    assert [r['message'] for r in rows] == [f'event {i}' for i in range(5)]
    # The cursor is what lets the panel APPEND instead of redrawing — a full
    # redraw every two seconds loses the user's scroll position mid-read.
    newer = activity_log.events(since=rows[2]['id'])
    assert [r['message'] for r in newer] == ['event 3', 'event 4']
    assert activity_log.events(since=rows[-1]['id']) == []


def test_the_ring_is_bounded_so_an_overnight_run_is_not_a_leak(app, monkeypatch):
    from app.services import activity_log

    monkeypatch.setattr(activity_log, '_events',
                        type(activity_log._events)(maxlen=5))
    for i in range(20):
        activity_log.record('bank', f'e{i}')
    rows = activity_log.events()
    assert len(rows) == 5
    assert [r['message'] for r in rows] == [f'e{i}' for i in range(15, 20)]


def test_recording_never_raises_whatever_it_is_handed(app):
    """It must be impossible for a logging bug to take down a pass."""
    from app.services import activity_log

    class Exploding:
        def __str__(self):
            raise RuntimeError('boom')

    activity_log.record('bank', Exploding())          # must not raise
    activity_log.record(None, None, level='nonsense')
    activity_log.record('bank', 'fine')
    assert any(r['message'] == 'fine' for r in activity_log.events())


def test_an_unknown_level_degrades_to_info_rather_than_being_dropped(app):
    from app.services import activity_log

    activity_log.record('bank', 'hello', level='catastrophic')
    assert activity_log.events()[-1]['level'] == 'info'


# --- what the sources record --------------------------------------------------

def test_a_bank_pass_records_its_start_and_its_finish(app, tmp_path):
    from app.services import activity_log, bank_jobs

    with app.app_context():
        bank_id = _bank(tmp_path)
        bank_jobs.start(app, bank_id, 'scan', lambda job: None, total=2)
        messages = [r['message'] for r in activity_log.events()]
        assert 'scan started' in messages
        assert 'scan finished' in messages


def test_a_pass_that_raises_is_recorded_as_an_error_not_a_finish(app, tmp_path):
    from app.services import activity_log, bank_jobs

    def _boom(job):
        raise RuntimeError('disk full')

    with app.app_context():
        bank_id = _bank(tmp_path)
        bank_jobs.start(app, bank_id, 'score', _boom)
        rows = activity_log.events()
        failed = [r for r in rows if r['level'] == 'error']
        assert failed and 'score failed' in failed[0]['message']
        assert 'disk full' in failed[0]['detail']
        assert not any(r['message'] == 'score finished' for r in rows)


def test_the_gpu_window_records_taking_and_releasing_the_card(app):
    """The window unloads ComfyUI, blocks training and makes everything else
    answer "GPU busy" — and until now it did all of that with no visible trace
    anywhere, which is precisely why a stuck flag was so confusing."""
    from app import gpu_window
    from app.services import activity_log

    with app.app_context():
        with gpu_window.gpu_exclusive_vision_window(flag_ttl=5):
            pass
    messages = [r['message'] for r in activity_log.events() if r['source'] == 'gpu']
    assert 'GPU taken exclusively' in messages
    assert 'GPU released' in messages


# --- the snapshot: is it stuck? ----------------------------------------------

def test_a_running_pass_reports_the_age_of_its_last_update(app, tmp_path):
    from app.services import activity_log, bank_jobs

    with app.app_context():
        bank_id = _bank(tmp_path)
        # A job left live (never finished), touched a while ago.
        job = {'kind': 'score', 'done': 3, 'total': 100, 'error': None,
               'cancelled': False, 'finished': False, 'detail': 'scoring (CPU)',
               'started_at': time.time() - 600, '_touched': time.time() - 600,
               '_cancel_hook': None, 'pipeline': None}
        with bank_jobs._lock:
            bank_jobs._jobs[bank_id] = job
        snap = activity_log.snapshot('local')
        row = next(r for r in snap['running'] if r.get('bank_id') == bank_id)
        assert row['what'] == 'score'
        assert row['done'] == 3 and row['total'] == 100
        assert row['stale_seconds'] >= 590, \
            'the AGE is the only thing that separates slow from stuck'
        assert row['label'] == 'Dump', 'named, not "#7" — this is a user-facing panel'


def test_the_snapshot_names_the_gpu_flags_even_when_nothing_is_running(app):
    """A flag with nothing behind it is the most confusing state this app
    produces; the panel is where it becomes obvious."""
    from app.job_queue import queue_manager
    from app.services import activity_log

    with app.app_context():
        queue_manager._set_system_state('vision_in_progress', 'tok')
        snap = activity_log.snapshot('local')
        assert snap['running'] == []
        assert snap['gpu_flags']['vision_in_progress'] is True
        queue_manager._set_system_state('vision_in_progress', None)


def test_the_snapshot_survives_a_broken_source(app, monkeypatch):
    """One failing section must not empty the whole panel."""
    from app.services import activity_log, bank_jobs

    def _boom():
        raise RuntimeError('registry exploded')

    with app.app_context():
        monkeypatch.setattr(bank_jobs, 'live_bank_ids', _boom)
        snap = activity_log.snapshot('local')
        assert snap['running'] == []
        assert 'gpu_flags' in snap and 'bank_queue' in snap


# --- the route ----------------------------------------------------------------

def test_the_route_returns_the_snapshot_and_the_events(app, client):
    from app.services import activity_log

    with app.app_context():
        activity_log.record('bank', 'scan started')
    body = client.get('/api/system/activity').get_json()
    assert 'running' in body and 'gpu_flags' in body and 'bank_queue' in body
    assert [e['message'] for e in body['events']] == ['scan started']


def test_the_route_honours_the_since_cursor(app, client):
    from app.services import activity_log

    with app.app_context():
        activity_log.record('bank', 'first')
        activity_log.record('bank', 'second')
    first_id = client.get('/api/system/activity').get_json()['events'][0]['id']
    body = client.get(f'/api/system/activity?since={first_id}').get_json()
    assert [e['message'] for e in body['events']] == ['second']


def test_a_junk_cursor_is_ignored_rather_than_500ing(app, client):
    from app.services import activity_log

    with app.app_context():
        activity_log.record('bank', 'only')
    r = client.get('/api/system/activity?since=nonsense&limit=nonsense')
    assert r.status_code == 200
    assert [e['message'] for e in r.get_json()['events']] == ['only']
