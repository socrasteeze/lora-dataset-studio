"""🗃️ Image bank — a Stop pressed before the infer child starts must still stop it.

Reported: a Launch-all pipeline sat on "Stopping" while the face pass kept
counting. The activity log showed the stop at 16:56:13; the face helper was
spawned at 16:56:42. The stop landed while the face step was still reading its
35 000 rows, so ``cancel()`` fired the PREVIOUS step's hook (a dead child). The
driver then removed the stale sentinel, launched a fresh child and registered a
fresh hook without ever reading the flag that was already set — so the child ran
to the end of the bank.
"""
import os
import re
import threading
import time

from app.services import bank_jobs


class _SentinelChild:
    """A child that stops cleanly as soon as its cancel sentinel exists, the way
    backend/infer/*.py do, and otherwise runs far past the test's patience."""

    def __init__(self, cancel_file):
        self.cancel_file = cancel_file
        self.returncode = None
        self.stdin = _Sink()
        self.stdout = self
        self.stderr = iter(())
        self.saw_cancel = threading.Event()

    def read(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if os.path.exists(self.cancel_file):
                self.saw_cancel.set()
                self.returncode = 0
                return '{"ok": true, "cancelled": true}\n'
            time.sleep(0.01)
        self.returncode = 0
        return '{"ok": true}\n'

    def kill(self):
        self.returncode = -9

    def wait(self):
        return self.returncode


class _Sink:
    def write(self, _s):
        pass

    def close(self):
        pass


def test_a_stop_that_landed_before_launch_stops_the_child(app, tmp_path, monkeypatch):
    from contextlib import nullcontext
    from app.services import image_bank_service as banks

    cache = str(tmp_path / 'faces.npz')
    child = _SentinelChild(cache + '.cancel')
    monkeypatch.setattr(banks.subprocess, 'Popen', lambda *a, **k: child)
    monkeypatch.setattr(banks.bank_jobs, 'progress', lambda job, **kw: None)

    bank_jobs.reset()
    try:
        job = bank_jobs.reserve(9001, 'pipeline')
        assert bank_jobs.cancel(9001) is True     # Stop pressed during the prep

        data, _tail, _rc = banks._drive_infer_subprocess(
            job, 'python', 'script.py', '{}', cache,
            re.compile(r'\[embed\] (\d+)/(\d+)'), nullcontext(),
            stall_label='face', stall_timeout=60)
    finally:
        bank_jobs.reset()

    assert child.saw_cancel.is_set(), \
        'the child must be told to stop when the job was already cancelled'
    assert data.get('cancelled') is True
