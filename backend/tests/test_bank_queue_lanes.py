"""One lane per machine — and one merged group is still one unit.

A single global worker drained everything, so a bank sent to a compute peer sat
behind local work. The remote entry already skipped the local-GPU gate, but it
still had to wait for that one thread, which meant renting a second machine
bought nothing in wall-clock.

The rule the lanes must not break, stated by the owner: a bank can only be
processed by one machine at a time. Two separate banks are fine; the same bank —
including merged banks, which are counted as one — cannot be split and processed
simultaneously.
"""
from __future__ import annotations

import threading
import time

import pytest

PEER = '4fa2b7c1-0000-4000-8000-000000000001'
PEER_B = '4fa2b7c1-0000-4000-8000-000000000002'


@pytest.fixture(autouse=True)
def _clean(app):
    from app.services import bank_queue
    bank_queue.reset()
    yield
    bank_queue.reset()


def _entry(bank_id, device_id=None, group_key=None, state='pending'):
    """The shape enqueue() builds — hand-built so the claim can be tested as
    pure logic, with no threads and no database."""
    return {'bank_id': bank_id, 'user_id': 'local', 'steps': ['scan'],
            'reject_flags': [], 'resolve_dups': False, 'device_id': device_id,
            'group_key': group_key, 'enqueued_at': 0, 'state': state}


def _seed(entries):
    from app.services import bank_queue
    with bank_queue._lock:
        bank_queue._queue.extend(entries)


# --- the claim ---------------------------------------------------------------

def test_two_local_banks_never_overlap(app):
    """The local lane stays strictly serial — unchanged behaviour, now load
    bearing: it is the only thing keeping two pipelines off one card."""
    from app.services import bank_queue
    _seed([_entry(1), _entry(2)])
    first = bank_queue._claim_next(bank_queue._LOCAL_LANE)
    assert first['bank_id'] == 1
    assert bank_queue._claim_next(bank_queue._LOCAL_LANE) is None


def test_a_local_and_a_remote_bank_are_claimed_at_the_same_time(app):
    """The whole point: different machines, no waiting on each other."""
    from app.services import bank_queue
    _seed([_entry(1), _entry(2, device_id=PEER)])
    assert bank_queue._claim_next(bank_queue._LOCAL_LANE)['bank_id'] == 1
    assert bank_queue._claim_next(PEER)['bank_id'] == 2


def test_two_peers_get_a_lane_each(app):
    from app.services import bank_queue
    _seed([_entry(1, device_id=PEER), _entry(2, device_id=PEER_B)])
    assert bank_queue._claim_next(PEER)['bank_id'] == 1
    assert bank_queue._claim_next(PEER_B)['bank_id'] == 2


def test_two_banks_on_the_SAME_peer_never_overlap(app):
    """One lane per peer and no more — a peer pulls one job at a time, so a
    second lane would queue over there, invisible to this queue's reporting."""
    from app.services import bank_queue
    _seed([_entry(1, device_id=PEER), _entry(2, device_id=PEER)])
    assert bank_queue._claim_next(PEER)['bank_id'] == 1
    assert bank_queue._claim_next(PEER) is None


def test_the_claim_is_atomic(app):
    """_next_pending SELECTED without claiming, so two workers got the same
    object, both passed the identity check, both set state='running', and the
    loser's BankJobBusy handler reset it to 'pending' while the winner ran it."""
    from app.services import bank_queue
    _seed([_entry(1), _entry(1, device_id=PEER)])
    a = bank_queue._claim_next()
    b = bank_queue._claim_next()
    assert a is not None
    assert b is None or b is not a, 'the same entry was handed out twice'


def test_a_claim_released_by_a_busy_bank_can_be_claimed_again(app):
    from app.services import bank_queue
    _seed([_entry(1)])
    e = bank_queue._claim_next(bank_queue._LOCAL_LANE)
    assert bank_queue._claim_next(bank_queue._LOCAL_LANE) is None
    e['state'], e['claimed'] = 'pending', False       # the BankJobBusy path
    assert bank_queue._claim_next(bank_queue._LOCAL_LANE) is e


def test_fifo_is_preserved_within_a_lane(app):
    from app.services import bank_queue
    _seed([_entry(1, device_id=PEER), _entry(2), _entry(3, device_id=PEER)])
    # #2 is local and must not jump the peer lane's order.
    first = bank_queue._claim_next(PEER)
    assert first['bank_id'] == 1
    first['state'] = 'running'
    bank_queue._queue.remove(first)
    assert bank_queue._claim_next(PEER)['bank_id'] == 3


# --- the group rule ----------------------------------------------------------

def test_two_members_of_one_merged_group_never_overlap_even_on_two_machines(app):
    """The requirement the lanes would otherwise break. The user sees ONE card
    for a merged group; running two members at once would show that single card
    in two conflicting states."""
    from app.services import bank_queue
    _seed([_entry(1, group_key='Ada'), _entry(2, device_id=PEER, group_key='Ada')])
    assert bank_queue._claim_next(bank_queue._LOCAL_LANE)['bank_id'] == 1
    assert bank_queue._claim_next(PEER) is None, \
        'one card, two machines, two simultaneous states'


def test_banks_in_DIFFERENT_groups_still_run_side_by_side(app):
    from app.services import bank_queue
    _seed([_entry(1, group_key='Ada'), _entry(2, device_id=PEER, group_key='Bo')])
    assert bank_queue._claim_next(bank_queue._LOCAL_LANE)['bank_id'] == 1
    assert bank_queue._claim_next(PEER)['bank_id'] == 2


def test_an_ungrouped_bank_is_a_group_of_one(app):
    """No special case: the unit key falls back to the bank itself, which is
    also what stops the same bank being claimed twice under two spellings."""
    from app.services import bank_queue
    _seed([_entry(7), _entry(7, device_id=PEER)])
    assert bank_queue._claim_next(bank_queue._LOCAL_LANE)['bank_id'] == 7
    assert bank_queue._claim_next(PEER) is None


def test_enqueue_records_the_group_from_the_SERVER_not_the_client(app, tmp_path):
    from app.services import bank_queue
    from test_image_bank import _mkbank, flat

    with app.app_context():
        client = app.test_client()
        a, _ = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='Twinned')
        b, _ = _mkbank(client, tmp_path, {'b.jpg': flat()}, name='Twinned')
        from app.services import bank_queue as bq
        bq.reset()
        import unittest.mock as _m
        with _m.patch.object(bank_queue, '_process_next', lambda _app: False):
            bank_queue.enqueue(app, 'local', a, steps=['scan'])
            bank_queue.enqueue(app, 'local', b, steps=['scan'])
        keys = {e['group_key'] for e in bank_queue._queue}
        assert keys == {'Twinned'}, 'two banks sharing a name are one group'


# --- the worker ---------------------------------------------------------------

def test_a_blocked_lane_keeps_its_worker_alive(app):
    """A lane whose only work is held by another lane's group must not end its
    drain — nothing would restart it when the group frees up, and the entry
    would sit pending forever."""
    from app.services import bank_queue
    bank_queue._POLL_SECONDS = 0.01
    try:
        held = _entry(1, group_key='Ada', state='running')
        _seed([held, _entry(2, device_id=PEER, group_key='Ada')])
        bank_queue._current.lane = PEER
        try:
            assert bank_queue._process_next(app) is True, \
                'the peer lane gave up and its worker would have died'
        finally:
            del bank_queue._current.lane
    finally:
        bank_queue._POLL_SECONDS = 2.0


def test_an_idle_lane_does_end_its_drain(app):
    from app.services import bank_queue
    _seed([_entry(1)])
    bank_queue._current.lane = PEER
    try:
        assert bank_queue._process_next(app) is False
    finally:
        del bank_queue._current.lane


def test_one_bank_is_never_split_across_two_machines(app):
    """Within a bank this is free — _pipeline_job is a plain sequential loop and
    the hub BLOCKS inside _await_remote_job while the peer works, so the split is
    across time, not machines. Pinned so a future "optimisation" cannot quietly
    parallelise the step loop and start a hub step while the peer still has one.
    """
    import inspect

    from app.services import image_bank_service as banks
    src = inspect.getsource(banks._pipeline_job)
    assert 'for i, step in enumerate(steps):' in src
    for parallel in ('Thread(', 'ThreadPool', 'as_completed', 'gather('):
        assert parallel not in src, f'the step loop grew {parallel}'


def test_the_snapshot_can_name_every_running_bank(app):
    """running_bank_id can only name one, and there are now as many as there
    are machines. It stays for existing readers; the list is the truth."""
    from app.services import bank_queue
    _seed([_entry(1, state='running'),
           _entry(2, device_id=PEER, state='running'), _entry(3)])
    snap = bank_queue.snapshot()
    assert snap['running_bank_ids'] == [1, 2]
    assert snap['running_bank_id'] == 1


def test_local_and_remote_pipelines_actually_overlap(app, monkeypatch):
    """End to end through _process_next on two threads: the local run is held
    open, and the peer's must start anyway."""
    from app.services import bank_jobs, bank_queue
    from app.services import image_bank_service as banks

    monkeypatch.setattr(bank_queue, '_POLL_SECONDS', 0.01)
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr(bank_jobs, 'running', lambda _b: False)
    started, release = [], threading.Event()

    def _start(_app, _uid, bank_id, *a, **k):
        started.append(bank_id)
        if k.get('device_id') is None:
            release.wait(5)         # the local run stays open

    monkeypatch.setattr(banks, 'start_pipeline', _start)
    _seed([_entry(1), _entry(2, device_id=PEER)])

    def _run(lane):
        bank_queue._current.lane = lane
        bank_queue._process_next(app)

    threads = [threading.Thread(target=_run, args=(lane,), daemon=True)
               for lane in (bank_queue._LOCAL_LANE, PEER)]
    for t in threads:
        t.start()
    deadline = time.time() + 5
    while len(started) < 2 and time.time() < deadline:
        time.sleep(0.01)
    release.set()
    for t in threads:
        t.join(timeout=5)

    assert sorted(started) == [1, 2], (
        'the peer bank waited for the local one to finish — the single worker '
        'is what made renting a second machine pointless')
