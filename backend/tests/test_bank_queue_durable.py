"""The Launch-all queue survives a restart.

WHAT WAS WRONG. The queue was a module-level list and nothing else. Its own
docstring said so — "In-memory ONLY — the queue dies with the process; a restart
starts empty" — and treated that as a property rather than a defect, on the
grounds that committed scores stay so a re-run only pays for what is missing.

That reasoning covers the COST of losing an entry. It does not cover losing it
SILENTLY, which is what actually happened: you queue eleven banks, go to bed,
the machine reboots for an update, and in the morning the panel is empty with no
row, no log line and no report saying anything was dropped. Nine hours of GPU
time did not happen and nothing anywhere says why. "It only pays for what is
missing" is true of a re-run somebody knows to start.

THE SHAPE, borrowed from the sibling dataset-manager project, whose queue keeps
`cancel_requested` as a COLUMN for the same reason: state that must outlive the
process cannot live in the process. Here the in-memory FIFO stays exactly as it
is — the lane, unit and atomic-claim logic is intricate and well covered — and
every mutation is mirrored into a table beside it. The list is the working copy;
the table is the record. On boot the list is rebuilt from the table.

A RUNNING ENTRY COMES BACK PENDING. The pipeline that was running it died with
the process, so nothing is running any more. Leaving it 'running' would park the
whole lane behind a job that will never finish — the failure this project has
already shipped once, in the peer job rows a dead peer left claimed forever.
"""
import pytest

from app.services import bank_queue


@pytest.fixture(autouse=True)
def frozen(app, monkeypatch):
    """No worker: entries stay put so their durable half can be inspected."""
    bank_queue.reset()
    monkeypatch.setattr(bank_queue, '_ensure_worker', lambda _app: None)
    monkeypatch.setattr(bank_queue, '_drain', lambda _app: None)
    monkeypatch.setattr(bank_queue, '_process_next', lambda _app: False)
    yield
    bank_queue.reset()


def _restart(app):
    """What a process restart does: the module's memory goes, the table stays."""
    bank_queue.reset(durable=False)
    bank_queue.restore(app)


def test_a_queued_bank_is_still_queued_after_a_restart(app):
    bank_queue.enqueue(app, 'local', 1, steps=['scan'])
    bank_queue.enqueue(app, 'local', 2, steps=['scan', 'score'])

    _restart(app)

    items = bank_queue.snapshot()['items']
    assert [i['bank_id'] for i in items] == [1, 2], 'order is the queue'
    assert [i['position'] for i in items] == [1, 2]


def test_everything_the_run_needs_survives_it(app):
    """A restored entry has to be launchable, not merely countable. Each of
    these decides what the pipeline actually does."""
    bank_queue.enqueue(app, 'local', 7, steps=['scan', 'score'],
                       reject_flags=['blur'], resolve_dups=True)

    _restart(app)

    item = bank_queue.snapshot()['items'][0]
    assert item['steps'] == ['scan', 'score']
    assert item['reject_flags'] == ['blur']
    assert item['resolve_dups'] is True
    assert item['enqueued_at']


def test_a_running_entry_comes_back_pending_not_running(app):
    """Its pipeline died with the process. Left 'running' it would park the
    lane behind a job that can never finish — the same shape as a peer job a
    dead peer left claimed forever."""
    bank_queue.enqueue(app, 'local', 3, steps=['scan'])
    bank_queue.snapshot()          # touch it before mutating, as the worker would
    with bank_queue._lock:
        bank_queue._queue[0]['state'] = 'running'
        bank_queue._queue[0]['claimed'] = True

    _restart(app)

    item = bank_queue.snapshot()['items'][0]
    assert item['state'] == 'pending'
    assert bank_queue._queue[0].get('claimed') is not True, 'a stale claim blocks the lane'


def test_a_cancelled_bank_does_not_come_back(app):
    bank_queue.enqueue(app, 'local', 4, steps=['scan'])
    bank_queue.enqueue(app, 'local', 5, steps=['scan'])
    assert bank_queue.cancel(4) is True

    _restart(app)

    assert [i['bank_id'] for i in bank_queue.snapshot()['items']] == [5]


def test_a_cleared_queue_does_not_come_back(app):
    bank_queue.enqueue(app, 'local', 6, steps=['scan'])
    bank_queue.enqueue(app, 'local', 8, steps=['scan'])
    assert bank_queue.clear() == 2

    _restart(app)

    assert bank_queue.snapshot()['items'] == []


def test_a_finished_bank_does_not_come_back(app):
    """`_remove` is the one exit every completed run takes."""
    bank_queue.enqueue(app, 'local', 9, steps=['scan'])
    assert bank_queue._remove(9) is True

    _restart(app)

    assert bank_queue.snapshot()['items'] == []


def test_the_device_a_bank_was_sent_to_survives(app, monkeypatch):
    """Otherwise a restart silently repatriates the whole overnight queue onto
    this machine — the one outcome renting the second machine was meant to
    avoid, and it would look like the queue simply being slow."""
    monkeypatch.setattr('app.services.image_bank_service._remote_pass_device',
                        lambda device_id: None)
    monkeypatch.setattr('app.services.image_bank_service.refuse_steps_for_device',
                        lambda device_id, steps: None)
    bank_queue.enqueue(app, 'local', 10, steps=['scan'], device_id='peer-abc')

    _restart(app)

    assert bank_queue.snapshot()['items'][0]['device_id'] == 'peer-abc'


def test_restoring_twice_does_not_duplicate_the_queue(app):
    """Boot is not the only caller — anything that restores a second time must
    not double every entry, which would run each bank twice."""
    bank_queue.enqueue(app, 'local', 11, steps=['scan'])

    _restart(app)
    bank_queue.restore(app)

    assert [i['bank_id'] for i in bank_queue.snapshot()['items']] == [11]


def test_a_durable_write_that_fails_never_breaks_the_queue(app, monkeypatch):
    """The record is worth having; it is not worth failing a launch for. Same
    call this module already makes for its activity-log mirror: lazy and
    swallowed."""
    def _boom(*_a, **_k):
        raise RuntimeError('disk full')

    monkeypatch.setattr(bank_queue, '_persist_add', _boom)
    monkeypatch.setattr(bank_queue, '_persist_remove', _boom)

    assert bank_queue.enqueue(app, 'local', 12, steps=['scan']) == 1
    assert [i['bank_id'] for i in bank_queue.snapshot()['items']] == [12]
    assert bank_queue.cancel(12) is True


def test_a_bank_that_finished_during_its_own_insert_does_not_come_back(app, monkeypatch):
    """The window between appending to the FIFO and writing the row.

    The row cannot be written under `_lock` — `_claim_next` runs there and the
    module's own comment forbids a query in it — so the insert happens after the
    lock is released. A worker left alive by an EARLIER enqueue can claim, run
    and remove the entry in that gap. `_remove`'s delete then finds no row yet,
    the insert lands afterwards, and the next boot re-runs a bank that already
    finished.

    Microseconds wide and never observed. It is closed rather than documented
    because the failure is invisible: the bank simply runs again one morning.
    """
    from app.services import bank_queue as bq

    real_add = bq._persist_add

    def _add_then_vanish(entry):
        real_add(entry)
        # Exactly what the worker would have done, at the worst moment.
        with bq._lock:
            bq._queue.remove(entry)

    monkeypatch.setattr(bq, '_persist_add', _add_then_vanish)
    bank_queue.enqueue(app, 'local', 13, steps=['scan'])

    _restart(app)

    assert bank_queue.snapshot()['items'] == [], \
        'a finished bank was left in the stored queue and would run again'
