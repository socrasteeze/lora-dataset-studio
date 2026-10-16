"""A completed test cannot leave a queued Bank or worker in the next test.

The file stays on one xdist worker under loadfile. The first case deliberately
leaves synthetic memory for the shared fixture to remove at the test boundary.
"""
from app.services import bank_queue


def test_a_synthetic_queue_and_worker_can_be_left_at_the_test_boundary():
    with bank_queue._lock:
        bank_queue._queue.append({'bank_id': 17})
    with bank_queue._worker_lock:
        bank_queue._workers['fixture-lane'] = object()
    assert bank_queue._queue
    assert bank_queue._workers


def test_the_next_case_sees_no_queue_or_worker_from_the_previous_case():
    try:
        assert bank_queue._queue == []
        assert bank_queue._workers == {}
    finally:
        # Even a broken fixture must not let this regression poison later files.
        bank_queue.reset(durable=False)
