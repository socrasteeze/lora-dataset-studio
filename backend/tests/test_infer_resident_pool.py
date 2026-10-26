"""The bank queue keeps WD14, Score and Faces loaded from one bank to the next.

Every pass used to start a fresh child per bank, so a queue of 322 banks paid
the same torch/onnxruntime import and model load 322 times per family. While
the local lane drains, infer_pool serves those three scripts from a resident
worker (backend/infer/resident.py) instead.

These tests drive the real harness with a fake infer script (invented data,
no model) that reports its pid and how many times its "model" loaded.
"""
from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import textwrap
import threading
import time

import pytest

INFER = pathlib.Path(__file__).resolve().parents[1] / 'infer'

_FAKE = textwrap.dedent('''
    import json, os, sys, time
    sys.path.insert(0, {infer!r})
    from infer_io import claim_result_stream
    import model_memo
    _OUT = claim_result_stream(__name__)
    LOADS = []

    def main():
        req = json.loads(sys.stdin.read())
        model_memo.memo(('fake', req.get('model', 'a')),
                        lambda: LOADS.append(1) or len(LOADS))
        print('[fake] 1/1', file=sys.stderr, flush=True)
        if req.get('sleep'):
            time.sleep(30)
        if req.get('crash'):
            raise RuntimeError('boom')
        if req.get('exit'):
            sys.stderr.flush()
            os._exit(3)
        print(json.dumps({{'ok': True, 'pid': os.getpid(), 'loads': len(LOADS),
                          'n': req.get('n')}}), file=_OUT)
        return 0

    if __name__ == '__main__':
        sys.exit(main())
''')


@pytest.fixture
def pool():
    from app.services import infer_pool
    infer_pool.shutdown('test start')
    yield infer_pool
    infer_pool.shutdown('test end')


@pytest.fixture
def fake(tmp_path):
    """A fake script under a resident name, and one under any other name."""
    source = _FAKE.format(infer=str(INFER))
    (tmp_path / 'wd14_infer.py').write_text(source, encoding='utf-8')
    (tmp_path / 'other_infer.py').write_text(source, encoding='utf-8')
    return tmp_path


def _env(**extra):
    env = dict(os.environ)
    env.update(extra)
    return env


def _run(pool, script, payload, env=None, on_line=None):
    """One request through infer_pool, read the way the drivers read it."""
    from app.services.infer_stream import parse_result_json
    proc = pool.popen([sys.executable, str(script)], env=env or _env())
    lines = []

    def _drain():
        for line in proc.stderr:
            lines.append(line.strip())
            if on_line:
                on_line(proc, line)

    reader = threading.Thread(target=_drain, daemon=True)
    reader.start()
    proc.stdin.write(json.dumps(payload))
    proc.stdin.close()
    stdout = proc.stdout.read()
    proc.wait()
    reader.join(timeout=10)
    return parse_result_json(stdout) or {}, lines, proc


def test_outside_a_drain_every_request_is_a_plain_child(pool, fake):
    first, _, proc = _run(pool, fake / 'wd14_infer.py', {'n': 1})
    second, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 2})
    assert isinstance(proc, subprocess.Popen)
    assert first['ok'] and second['ok']
    assert first['pid'] != second['pid']


def test_two_banks_share_one_worker_and_one_model_load(pool, fake):
    with pool.keep_warm():
        first, _, proc = _run(pool, fake / 'wd14_infer.py', {'n': 1})
        second, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 2})
    assert not isinstance(proc, subprocess.Popen)
    assert (first['n'], second['n']) == (1, 2)
    assert first['pid'] == second['pid'], 'the second bank must reuse the worker'
    assert second['loads'] == 1, 'the model must load once, not once per bank'
    assert proc.returncode == 0


def test_a_script_outside_the_three_families_stays_one_shot(pool, fake):
    with pool.keep_warm():
        _, _, proc = _run(pool, fake / 'other_infer.py', {'n': 1})
    assert isinstance(proc, subprocess.Popen)


def test_progress_lines_stay_with_their_own_request(pool, fake):
    with pool.keep_warm():
        _, first, _ = _run(pool, fake / 'wd14_infer.py', {'n': 1})
        _, second, _ = _run(pool, fake / 'wd14_infer.py', {'n': 2})
    for lines in (first, second):
        assert lines.count('[fake] 1/1') == 1
        assert not any(line.startswith(pool.END_ERR) for line in lines)


def test_the_end_of_the_drain_stops_the_worker(pool, fake):
    with pool.keep_warm():
        _, _, proc = _run(pool, fake / 'wd14_infer.py', {'n': 1})
    assert proc.worker.proc.poll() is not None
    assert not pool._idle


def test_an_idle_worker_is_stopped_after_the_timeout(pool, fake):
    with pool.keep_warm():
        _, _, proc = _run(pool, fake / 'wd14_infer.py', {'n': 1})
        worker = proc.worker
        pool._reap(time.monotonic())
        assert worker.alive(), 'a worker used just now must stay'
        pool._reap(time.monotonic() + pool.IDLE_SECONDS + 1)
        assert not worker.alive()
        assert not pool._idle


def test_shutdown_stops_idle_and_returning_workers(pool, fake):
    with pool.keep_warm():
        _, _, idle = _run(pool, fake / 'wd14_infer.py', {'n': 1})
        pool.shutdown('GPU wanted')
        assert not idle.worker.alive()

        def _stop_mid_request(proc, _line):
            pool.shutdown('GPU wanted')

        result, _, busy = _run(pool, fake / 'wd14_infer.py', {'n': 2},
                               on_line=_stop_mid_request)
        assert result['ok'], 'a request in flight still finishes'
        assert not busy.worker.alive(), 'and its worker is not kept afterwards'


def test_a_crash_is_reported_and_the_next_bank_gets_a_fresh_worker(pool, fake):
    with pool.keep_warm():
        first, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 1})
        crashed, _, proc = _run(pool, fake / 'wd14_infer.py', {'crash': True})
        after, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 3})
    assert crashed['ok'] is False and 'boom' in crashed['error']
    assert proc.returncode == 1
    assert after['ok'] and after['pid'] != first['pid']


def test_a_worker_that_dies_mid_request_fails_that_request_only(pool, fake):
    with pool.keep_warm():
        first, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 1})
        died, _, proc = _run(pool, fake / 'wd14_infer.py', {'exit': True})
        after, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 3})
    assert died == {}
    assert proc.returncode == 3
    assert after['ok'] and after['pid'] != first['pid']


def test_kill_through_the_request_kills_the_worker(pool, fake):
    """The drivers' stall watchdog and Stop grace call proc.kill()."""
    def _kill(proc, _line):
        threading.Timer(0.2, proc.kill).start()

    with pool.keep_warm():
        first, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 1})
        started = time.monotonic()
        killed, _, proc = _run(pool, fake / 'wd14_infer.py', {'sleep': True},
                               on_line=_kill)
        assert time.monotonic() - started < 20
        after, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 3})
    assert killed == {}
    assert proc.returncode not in (None, 0)
    assert after['pid'] != first['pid']


def test_changed_settings_retire_the_old_worker(pool, fake):
    with pool.keep_warm():
        first, _, old = _run(pool, fake / 'wd14_infer.py', {'n': 1},
                             env=_env(LDS_TEST_SETTING='a'))
        second, _, _ = _run(pool, fake / 'wd14_infer.py', {'n': 2},
                            env=_env(LDS_TEST_SETTING='b'))
    assert first['pid'] != second['pid']
    assert not old.worker.alive()


def test_the_local_lane_holds_the_pool_warm_while_it_drains(app, pool, monkeypatch):
    from app.services import bank_queue
    seen = []
    # _worker_loop stamps its lane on a thread-local; keep it off this thread.
    monkeypatch.setattr(bank_queue, '_current', threading.local())
    monkeypatch.setattr(bank_queue, '_drain', lambda _app: seen.append(pool._warm))
    bank_queue._worker_loop(app, bank_queue._LOCAL_LANE)
    bank_queue._worker_loop(app, '4fa2b7c1-0000-4000-8000-000000000001')
    assert seen == [1, 0], 'local lane warm, peer lane not'
    assert pool._warm == 0


def test_the_inline_testing_drain_stays_one_shot(app, pool, monkeypatch):
    from app.services import bank_queue
    seen = []

    def _next(_app):
        seen.append(pool._warm)
        return False

    monkeypatch.setattr(bank_queue, '_process_next', _next)
    bank_queue._drain(app)
    assert seen == [0]


def test_a_queue_that_has_to_wait_gives_the_vram_back(app, pool, monkeypatch):
    from app.services import bank_jobs, bank_queue
    from app.services import image_bank_service as banks

    busy = iter(['training is running on the GPU'])
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: next(busy, None))
    monkeypatch.setattr(bank_jobs, 'running', lambda _b: False)
    monkeypatch.setattr(bank_jobs, 'wait_for_end', lambda seen, timeout: True)
    monkeypatch.setattr(banks, 'start_pipeline', lambda *_a, **_k: None)
    reasons = []
    monkeypatch.setattr(pool, 'shutdown', reasons.append)
    entry = {'bank_id': 41, 'user_id': 'local', 'steps': ['scan'],
             'reject_flags': [], 'resolve_dups': False, 'device_id': None,
             'enqueued_at': 0, 'state': 'pending'}
    bank_queue.reset(durable=False)
    with bank_queue._lock:
        bank_queue._queue.append(entry)
    try:
        with app.app_context():
            assert bank_queue._process_next(app) is True
    finally:
        bank_queue.reset(durable=False)
    assert any('training is running' in r for r in reasons), reasons


def test_a_refused_gpu_window_gives_the_vram_back(app, pool, monkeypatch):
    from app.gpu_window import GpuBusyError, gpu_exclusive_vision_window
    from app.job_queue import queue_manager

    reasons = []
    monkeypatch.setattr(pool, 'shutdown', reasons.append)
    with app.app_context():
        queue_manager._set_system_state('training_in_progress', True)
        try:
            with pytest.raises(GpuBusyError, match='training'):
                with gpu_exclusive_vision_window():
                    pass
        finally:
            queue_manager._set_system_state('training_in_progress', False)
    assert reasons == ['the GPU window was refused']
