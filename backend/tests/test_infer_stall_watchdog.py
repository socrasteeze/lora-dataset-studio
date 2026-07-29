"""🗃️ Image bank — a wedged infer child must not hold the GPU forever.

Reported: ✨ Score "gets stuck" after `bank_scoring.python` was pointed at
ComfyUI's Python, and everything afterwards answers "GPU busy".

The two halves of that:

* pointing Score at a CUDA interpreter flips `_resolve_score_device()` to
  `('cuda', True)`, so the pass now takes `gpu_exclusive_vision_window` —
  covered by test_bank_score_gpu_window.py;
* nothing bounded the child. The parent sat in a blocking `proc.stdout.read()`,
  and the window's TTL could not save it either: gpu_window's heartbeat re-arms
  the TTL for as long as the window is open, so a wedged child held
  `vision_in_progress` until the app was restarted — not for 30 minutes, but
  indefinitely.

These tests pin the bound, and pin that the window is released on the way out.
"""
import re
import threading
import time
from contextlib import contextmanager

import pytest


class _FakeProc:
    """A child that accepts a payload and then says nothing, ever — until it is
    killed, which is exactly the hang being bounded."""

    def __init__(self):
        self.returncode = None
        self.killed = threading.Event()
        self.stdin = _Sink()
        self.stdout = _BlockingStream(self.killed)
        self.stderr = iter(())          # never emits a line

    def kill(self):
        self.returncode = -9
        self.killed.set()

    def wait(self):
        self.killed.wait(timeout=10)
        return self.returncode


class _Sink:
    def write(self, _s):
        pass

    def close(self):
        pass


class _BlockingStream:
    def __init__(self, killed):
        self._killed = killed

    def read(self):
        self._killed.wait(timeout=10)
        return ''


@contextmanager
def _tracking_window(state):
    state['open'] = True
    try:
        yield
    finally:
        state['open'] = False


def _drive(banks, tmp_path, window, stall_timeout=0.3):
    return banks._drive_infer_subprocess(
        object(), 'python', 'script.py', '{}', str(tmp_path / 'cache'),
        re.compile(r'\[score\] (\d+)/(\d+)'), window,
        stall_label='scoring', stall_timeout=stall_timeout)


def test_a_silent_child_is_stopped_instead_of_hanging_forever(app, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks

    proc = _FakeProc()
    monkeypatch.setattr(banks.subprocess, 'Popen', lambda *a, **k: proc)
    monkeypatch.setattr(banks, '_INFER_STALL_POLL', 0.05)
    monkeypatch.setattr(banks, '_INFER_CANCEL_GRACE', 0.1)
    monkeypatch.setattr(banks.bank_jobs, 'set_cancel_hook', lambda job, hook: None)

    started = time.monotonic()
    with pytest.raises(banks.InferStalled) as exc:
        _drive(banks, tmp_path, _tracking_window({}))
    elapsed = time.monotonic() - started

    assert proc.killed.is_set(), 'the wedged child must actually be killed'
    assert elapsed < 5, 'the watchdog must fire on its own timeout, not the test timeout'
    # The message has to name the way out — someone reading it has no reason to
    # connect "GPU busy" to an interpreter they picked last week.
    assert 'Back to the app default' in str(exc.value)


def test_the_gpu_window_is_released_when_the_child_is_killed(app, tmp_path, monkeypatch):
    """The point of the whole change: a stall must not survive as a permanent
    "GPU busy"."""
    from app.services import image_bank_service as banks

    proc = _FakeProc()
    monkeypatch.setattr(banks.subprocess, 'Popen', lambda *a, **k: proc)
    monkeypatch.setattr(banks, '_INFER_STALL_POLL', 0.05)
    monkeypatch.setattr(banks, '_INFER_CANCEL_GRACE', 0.1)
    monkeypatch.setattr(banks.bank_jobs, 'set_cancel_hook', lambda job, hook: None)

    state = {}
    with pytest.raises(banks.InferStalled):
        _drive(banks, tmp_path, _tracking_window(state))
    assert state['open'] is False, 'the GPU-exclusive window must be closed on the way out'


def test_a_stall_is_not_reported_as_the_user_stopping_it(app, tmp_path, monkeypatch):
    """A stall raises. If it returned `cancelled` instead, _score_job would take
    the "Stopped — N images scored" branch and the bank would end up marked done
    for a pass that never ran."""
    from app.services import image_bank_service as banks

    proc = _FakeProc()
    monkeypatch.setattr(banks.subprocess, 'Popen', lambda *a, **k: proc)
    monkeypatch.setattr(banks, '_INFER_STALL_POLL', 0.05)
    monkeypatch.setattr(banks, '_INFER_CANCEL_GRACE', 0.1)
    monkeypatch.setattr(banks.bank_jobs, 'set_cancel_hook', lambda job, hook: None)

    with pytest.raises(banks.InferStalled):
        _drive(banks, tmp_path, _tracking_window({}))
    assert issubclass(banks.InferStalled, RuntimeError), \
        'bank_jobs surfaces RuntimeError as a failed pass — a stall is a failure'


def test_a_talking_child_is_never_killed_for_being_slow(app, tmp_path, monkeypatch):
    """The watchdog watches for SILENCE, not for progress. A pass that logs while
    getting nowhere is a different bug; killing it here would be guessing — and a
    slow machine must never be policed."""
    from app.services import image_bank_service as banks

    class _Chatty(_FakeProc):
        def __init__(self):
            super().__init__()
            self._lines = self._talk()
            self.stderr = self._lines

        def _talk(self):
            # Well past the stall timeout in total, but never silent for it.
            for i in range(8):
                time.sleep(0.05)
                yield f'[score] {i}/8\n'
            self.returncode = 0
            self.killed.set()

    proc = _Chatty()
    monkeypatch.setattr(banks.subprocess, 'Popen', lambda *a, **k: proc)
    monkeypatch.setattr(banks, '_INFER_STALL_POLL', 0.02)
    monkeypatch.setattr(banks.bank_jobs, 'set_cancel_hook', lambda job, hook: None)
    monkeypatch.setattr(banks.bank_jobs, 'progress', lambda job, **kw: None)

    data, _tail, rc = _drive(banks, tmp_path, _tracking_window({}), stall_timeout=0.2)
    assert rc == 0
    assert data == {}
