"""The GPU window must not leave a flag behind that nothing is holding.

Owner-reported, after cancelling a bank pass: "I had even canceled it and now
it's showing this" — every launch afterwards refused with *a vision/GPU pass is
already running*, for about half an hour.

The mechanism. `gpu_exclusive_vision_window` keeps a heartbeat that re-arms the
flag's TTL for as long as the window is open, so a legitimate long pass cannot
have the GPU pulled out from under it. Closing the window used to order itself
against that heartbeat with `heartbeat.join(timeout=5)` and a comment saying
beats are two fast local DB ops. That holds until SQLite's single write lock is
contended — which this app hits often enough to carry `write_with_retry` and a
`db_busy` error shape. When the join times out:

    beat passes its stop-check, reads the flag as still ours
    close clears the flag
    beat completes its write, re-arming with a fresh 1800s TTL, then exits

leaving a flag no process is holding and no heartbeat will refresh. Every bank
pass, every queued bank and every training start then refuses for the full TTL.

The fix makes the beat's check-and-rearm and the close's check-and-clear one
mutually-exclusive critical section. These tests drive the interleaving directly
rather than hoping to hit it by timing.
"""
import threading
import time

import pytest


def _flag(app):
    from app.job_queue import queue_manager
    with app.app_context():
        return queue_manager._get_system_state('vision_in_progress')


def test_a_beat_that_wakes_during_close_can_never_re_arm_the_flag(app, monkeypatch):
    """The documented interleaving, driven DETERMINISTICALLY rather than by
    timing. This test is the reason the fix exists, so it has to fail without
    it — two earlier versions passed either way and proved nothing.

    Where to park matters. The beat is held inside its WRITE, and for longer
    than the close's `join(timeout=5)`, because that join is exactly what used
    to make the race look closed:

        beat reads the flag as ours, starts its write   <- parked here, 6s
        close sets stop, joins, TIMES OUT at 5s, clears the flag
        beat's write lands: the token is back, with a fresh TTL, and no
        heartbeat behind it

    Parking the READ instead would deadlock against the fix (the beat holds the
    guard there), which is itself the fix working — but it would not exercise
    the timeout that made the old code wrong.
    """
    from app import gpu_window
    from app.job_queue import queue_manager

    # Timing is forced by three constants that cannot all be shrunk:
    #   beat interval = max(floor, flag_ttl/3)   -> a short TTL means a short wait
    #   the close's join timeout is 5s, hardcoded -> the stall must exceed it
    #   the flag's own TTL must outlive the whole sequence, or it self-expires
    #   and the assertion passes for the wrong reason (this is what made the
    #   THIRD version of this test green against the unfixed code).
    # flag_ttl=18 gives a 6s beat interval and a flag alive until t=18s.
    monkeypatch.setattr(gpu_window, '_HEARTBEAT_FLOOR_SECONDS', 0.05)
    # gpu_window._normalise_flag_ttl floors flag_ttl at _MIN_FLAG_TTL_SECONDS
    # (30, a production safety floor upstream added); without lowering it here
    # too, flag_ttl=18 below would silently become 30 and this test's whole
    # timing derivation (interval, TTL lifetime) would no longer hold.
    monkeypatch.setattr(gpu_window, '_MIN_FLAG_TTL_SECONDS', 0.01)
    beat_writing = threading.Event()
    real_set = queue_manager._set_system_state
    held = {'once': False}

    def stalled_set(key, value, ttl_seconds=None):
        if (key == 'vision_in_progress'
                and threading.current_thread().name == 'vision-window-heartbeat'
                and not held['once']):
            held['once'] = True
            beat_writing.set()
            # Longer than the close's join timeout — a contended SQLite write.
            time.sleep(6)
        return real_set(key, value, ttl_seconds=ttl_seconds)

    with app.app_context():
        # The heartbeat renews from its OWN thread via _in_app_context, which
        # falls back to queue_manager._app when Flask's app context (thread-
        # local) isn't already pushed there. TESTING=True skips _start_workers
        # (and therefore init_app) at app creation, so without this the beat
        # can never push a context at all and "loses ownership" on its very
        # first renewal — same idiom as test_job_queue.py.
        queue_manager.init_app(app)
        monkeypatch.setattr(queue_manager, '_set_system_state', stalled_set)
        with gpu_window.gpu_exclusive_vision_window(flag_ttl=18):
            assert beat_writing.wait(timeout=12), 'no beat ever reached its write'
        # The window has closed. Give the stalled beat time to land its write.
        time.sleep(7)

    assert _flag(app) is None, \
        'a beat that finished after the close re-armed a flag nothing is holding'


def test_the_flag_is_gone_the_instant_the_window_closes(app, monkeypatch):
    """No grace period: the next launch happens immediately after a cancel, and
    it must not be refused."""
    from app import gpu_window
    from app.services import image_bank_service as banks

    monkeypatch.setattr(gpu_window, '_HEARTBEAT_FLOOR_SECONDS', 0.01)
    monkeypatch.setattr(gpu_window, '_MIN_FLAG_TTL_SECONDS', 0.01)
    with app.app_context():
        with gpu_window.gpu_exclusive_vision_window(flag_ttl=0.5):
            assert banks._gpu_busy_reason() is not None   # correctly busy inside
        assert banks._gpu_busy_reason() is None, \
            'the very next launch after a cancel must not see "GPU busy"'


def test_an_exception_inside_the_window_still_clears_the_flag(app, monkeypatch):
    """A pass that raises — a stalled helper, a crash mid-scan — is exactly when
    the flag is most likely to be stranded."""
    from app import gpu_window

    monkeypatch.setattr(gpu_window, '_HEARTBEAT_FLOOR_SECONDS', 0.01)
    monkeypatch.setattr(gpu_window, '_MIN_FLAG_TTL_SECONDS', 0.01)
    with app.app_context():
        with pytest.raises(RuntimeError):
            with gpu_window.gpu_exclusive_vision_window(flag_ttl=0.5):
                time.sleep(0.05)
                raise RuntimeError('the helper died')
    assert _flag(app) is None


def test_a_long_pass_still_keeps_its_flag_alive(app, monkeypatch):
    """The heartbeat's whole reason for existing must survive the fix: a pass
    that outlives its TTL must NOT have the GPU taken from under it."""
    from app import gpu_window
    from app.job_queue import queue_manager

    monkeypatch.setattr(gpu_window, '_HEARTBEAT_FLOOR_SECONDS', 0.02)
    monkeypatch.setattr(gpu_window, '_MIN_FLAG_TTL_SECONDS', 0.01)
    with app.app_context():
        # See the comment in test_a_beat_that_wakes_during_close_can_never_
        # re_arm_the_flag: the heartbeat needs queue_manager._app to push its
        # own context, which TESTING=True never sets up on its own.
        queue_manager.init_app(app)
        with gpu_window.gpu_exclusive_vision_window(flag_ttl=0.12):
            time.sleep(0.5)                 # several TTLs' worth
            assert _flag(app) is not None, 'the flag lapsed under a live pass'
    assert _flag(app) is None


def test_a_window_re_acquired_by_someone_else_is_never_stomped(app, monkeypatch):
    """The pre-existing guarantee, re-pinned: if our flag lapsed and another
    caller took the window, closing ours must not clear THEIR flag."""
    from app import gpu_window
    from app.job_queue import queue_manager

    monkeypatch.setattr(gpu_window, '_HEARTBEAT_FLOOR_SECONDS', 0.01)
    monkeypatch.setattr(gpu_window, '_MIN_FLAG_TTL_SECONDS', 0.01)
    with app.app_context():
        with gpu_window.gpu_exclusive_vision_window(flag_ttl=5):
            # Simulate a lapse + re-acquisition by a different caller.
            queue_manager._set_system_state('vision_in_progress', 'someone-else',
                                            ttl_seconds=60)
        assert _flag(app) == 'someone-else'
        queue_manager._set_system_state('vision_in_progress', None)
