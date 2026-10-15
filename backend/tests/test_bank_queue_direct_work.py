"""Direct Bank passes stay visible and hold queued work on their machine."""
import threading

import pytest

from app.services import bank_jobs, bank_queue

PEER = '4fa2b7c1-0000-4000-8000-000000000001'
OTHER_PEER = '4fa2b7c1-0000-4000-8000-000000000002'


@pytest.fixture(autouse=True)
def reset_work():
    bank_jobs.reset()
    bank_queue.reset(durable=False)
    yield
    bank_jobs.reset()
    bank_queue.reset(durable=False)


def direct_job(bank_id=1, device_id=None, reserve_ids=None):
    job = bank_jobs.reserve(bank_id, 'score', reserve_ids=reserve_ids)
    with bank_jobs._lock:
        job['_launched'] = True
        job['device_id'] = device_id
    return job


def entry(bank_id=2, device_id=None):
    return {'bank_id': bank_id, 'user_id': 'local', 'steps': ['scan'],
            'reject_flags': [], 'resolve_dups': False, 'device_id': device_id,
            'enqueued_at': 0, 'state': 'pending'}


def test_direct_work_holds_a_queued_bank_even_when_no_gpu_flag_is_set(app, monkeypatch):
    from app.services import image_bank_service as banks
    held, release = threading.Event(), threading.Event()
    launched = []
    job = direct_job()
    queued = entry()
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr(banks, 'start_pipeline', lambda *_a, **_k: launched.append(queued['bank_id']))

    def wait(_seen):
        held.set()
        assert release.wait(5)

    monkeypatch.setattr(bank_queue, '_wait_for_a_job_to_end', wait)
    with bank_queue._lock:
        bank_queue._queue.append(queued)

    def process():
        with app.app_context():
            bank_queue._process_next(app)

    worker = threading.Thread(target=process, daemon=True)
    worker.start()
    try:
        assert held.wait(5)
        assert launched == []
        assert queued['state'] == 'pending'
        assert queued['waiting_for'] == 'another Bank operation is running on this machine'
        snapshot = bank_queue.snapshot()
        assert snapshot['active_jobs'][0]['bank_id'] == 1
        assert snapshot['items'][0]['bank_id'] == 2
    finally:
        bank_jobs.abort(job)
        release.set()
        worker.join(timeout=5)
    assert not worker.is_alive()
    assert launched == [2]


def test_active_rows_are_deduplicated_and_do_not_include_video_or_unstarted_reservations():
    job = direct_job(reserve_ids=[4])
    direct_job('video:1')
    bank_jobs.reserve(3, 'scan')
    rows = bank_jobs.active_bank_jobs()
    assert len(rows) == 1
    assert rows[0]['bank_ids'] == (1, 4)
    assert rows[0]['kind'] == 'score'
    bank_jobs.abort(job)
    assert bank_jobs.active_bank_jobs() == []


@pytest.mark.parametrize('active_device,queued_device,blocked', [
    (None, None, True), (PEER, PEER, True),
    (PEER, None, False), (None, PEER, False), (PEER, OTHER_PEER, False),
])
def test_a_direct_pass_only_holds_its_machine(active_device, queued_device, blocked):
    direct_job(device_id=active_device)
    assert bool(bank_queue._active_work_reason(entry(device_id=queued_device))) is blocked


def test_bank_aliases_hold_the_same_bank_across_machines():
    direct_job(reserve_ids=[2])
    assert bank_queue._active_work_reason(entry(device_id=PEER)) == 'another pass is running on this bank'


def test_direct_work_in_a_name_group_holds_the_group_on_another_machine(monkeypatch):
    direct_job()
    queued = {**entry(device_id=PEER), 'group_key': 'example-group'}
    monkeypatch.setattr(bank_queue, '_group_key_of', lambda *_args: 'example-group')
    assert bank_queue._active_work_reason(queued) == 'another pass is running on this Bank group'


def test_a_queued_running_pipeline_is_not_listed_twice():
    direct_job()
    with bank_queue._lock:
        bank_queue._queue.append({**entry(bank_id=1), 'state': 'running'})
    snapshot = bank_queue.snapshot()
    assert snapshot['active_jobs'] == []
    assert snapshot['running_bank_ids'] == [1]


@pytest.mark.parametrize('device_id,expected', [('local', None), ('  ' + PEER + '  ', PEER)])
def test_started_work_keeps_its_normalized_device_identity(app, device_id, expected):
    captured = []
    bank_jobs.start(app, 1, 'scan', lambda _job: captured.extend(bank_jobs.active_bank_jobs()),
                    device_id=device_id)
    assert captured[0]['device_id'] == expected
