"""Supervised restart: LDS_SUPERVISOR=1 exits 3 and spawns nothing.

The unsupervised path (bare python / IDE / portable launcher) must keep
today's detached-helper behaviour unchanged — that path cannot be updated
out of if broken.
"""
import time

import pytest

from app.services import updater

pytestmark = pytest.mark.filterwarnings(
    'ignore::pytest.PytestUnhandledThreadExceptionWarning')


class _ExitCalled(SystemExit):
    """Raised by the os._exit mock so control flow stops like a real exit."""
    def __init__(self, code):
        super().__init__(code)
        self.code = code


@pytest.fixture(autouse=True)
def _no_real_exit(monkeypatch):
    """Capture os._exit codes instead of killing the test process.

    Real ``os._exit`` never returns; the mock must raise so the supervised
    branch cannot fall through into the detached-helper path.
    """
    exits = []

    def _fake_exit(code):
        exits.append(code)
        raise _ExitCalled(code)

    monkeypatch.setattr(updater.os, '_exit', _fake_exit)
    return exits


def test_supervised_restart_exits_3_and_spawns_nothing(monkeypatch, _no_real_exit):
    spawned = []
    monkeypatch.setenv('LDS_SUPERVISOR', '1')
    monkeypatch.setattr(updater.subprocess, 'Popen',
                        lambda *a, **k: spawned.append((a, k)) or None)

    updater.schedule_restart(delay=0.01)
    for _ in range(50):
        if _no_real_exit:
            break
        time.sleep(0.02)
    time.sleep(0.05)
    assert _no_real_exit == [3]
    assert spawned == []


def test_unsupervised_restart_spawns_detached_helper(monkeypatch, _no_real_exit):
    spawned = []

    class _FakeProc:
        pass

    def fake_popen(*a, **k):
        spawned.append({'args': a, 'kwargs': k})
        return _FakeProc()

    monkeypatch.delenv('LDS_SUPERVISOR', raising=False)
    monkeypatch.setattr(updater.subprocess, 'Popen', fake_popen)

    updater.schedule_restart(delay=0.01)
    for _ in range(50):
        if _no_real_exit:
            break
        time.sleep(0.02)
    time.sleep(0.05)
    assert _no_real_exit == [0]
    assert len(spawned) == 1
    # Helper is `python -c <code>` — the unsupervised path.
    args = spawned[0]['args'][0]
    assert '-c' in args
