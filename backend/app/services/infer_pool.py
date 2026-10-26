"""Resident infer workers for the bank queue: load each model once per drain.

The queue runs one bank at a time and every pass used to start a fresh child
per bank — a torch or onnxruntime import plus a model load, for the same model,
up to 322 times in a row. While a local queue lane drains (``keep_warm``), the
three model families the handoff names (WD14 tags, Score/CLIP, Faces/
InsightFace) run under ``backend/infer/resident.py`` instead, and the next
bank's pass reuses the loaded process.

The drivers did not change shape. ``popen`` returns either a real
``subprocess.Popen`` (cold path: not warm, another script, or a worker that
cannot start) or a per-request object with the same surface the drivers use —
``stdin.write/close``, ``stdout.read``, iterate ``stderr``, ``poll``, ``wait``,
``kill``, ``returncode`` — so the cancel file, the stall watchdog and
``InferStalled`` behave exactly as before.

Rules:
* A worker is reused only for the exact same argv, environment and cwd.
* One request per worker at a time; a second concurrent caller gets its own.
* ``kill()`` kills the worker. A worker that dies mid-request is reported as a
  failed child, exactly as today, and is never reused or silently re-run.
* Workers go away when the drain ends, after ``IDLE_SECONDS`` unused, on queue
  cancel/clear, when the queue has to wait for the GPU or another job, and when
  a GPU window is refused (ComfyUI or training wants the card back).
"""
import logging
import os
import queue
import subprocess
import threading
import time
from contextlib import contextmanager

from .. import config as cfg

logger = logging.getLogger(__name__)

RESIDENT_SCRIPTS = frozenset({'wd14_infer.py', 'bank_score_infer.py',
                              'face_embed_infer.py'})
_HARNESS = str(cfg.BACKEND_DIR / 'infer' / 'resident.py')
END_KEY = '__resident__'
END_ERR = '[resident] end'

# Long enough to bridge the other passes of one bank (Watermark, Framing,
# Medium) between two uses of the same family; short enough that a worker left
# over from a pass that ran last holds no VRAM for long.
IDLE_SECONDS = 120.0
_REAP_POLL = 10.0
# How long `wait()` gives the stderr reader to reach the end marker once the
# result is in. The marker follows the result immediately; missing it means
# the stream is out of step, so that worker is not reused.
_END_GRACE = 10.0

_lock = threading.Lock()
_warm = 0
_generation = 0
_idle: dict = {}            # key -> _Worker not checked out
_reaper = None


def _popen_kwargs(env, cwd):
    return dict(stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, encoding='utf-8',
                errors='replace', env=env, cwd=cwd,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


class _Worker:
    """One resident child and the two threads that read its pipes."""

    def __init__(self, key, argv, env, cwd, generation):
        self.key = key
        self.script = os.path.basename(argv[-1])
        self.generation = generation
        self.requests = 0
        self.last_used = time.monotonic()
        self.proc = subprocess.Popen(argv, **_popen_kwargs(env, cwd))
        self.out = queue.Queue()
        self.err = queue.Queue()
        for stream, sink in ((self.proc.stdout, self.out), (self.proc.stderr, self.err)):
            threading.Thread(target=self._pump, args=(stream, sink), daemon=True,
                             name=f'infer-resident:{self.script}').start()

    @staticmethod
    def _pump(stream, sink):
        try:
            for line in stream:
                sink.put(line)
        except (OSError, ValueError):
            pass
        sink.put(None)

    def alive(self):
        return self.proc.poll() is None

    def kill(self):
        try:
            self.proc.kill()
        except OSError:
            pass
        try:
            self.proc.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            pass


class _Stdin:
    def __init__(self, request):
        self._request = request
        self._parts = []

    def write(self, data):
        self._parts.append(data)
        return len(data)

    def close(self):
        # One request per line. A raw newline can only sit between JSON tokens
        # (inside a string it is invalid JSON), so folding it to a space keeps
        # the payload's meaning.
        payload = ''.join(self._parts).replace('\r', ' ').replace('\n', ' ')
        proc = self._request.worker.proc
        proc.stdin.write(payload + '\n')
        proc.stdin.flush()


class _Stdout:
    def __init__(self, request):
        self._request = request

    def read(self):
        request = self._request
        lines = []
        while True:
            line = request.worker.out.get()
            if line is None:
                break
            if END_KEY in line and line.lstrip().startswith('{'):
                from .infer_stream import parse_result_json
                marker = parse_result_json(line) or {}
                if marker.get(END_KEY) == 'end':
                    request.rc = marker.get('rc', 0)
                    break
            lines.append(line)
        request.out_done.set()
        return ''.join(lines)


class _Stderr:
    def __init__(self, request):
        self._request = request

    def __iter__(self):
        request = self._request
        try:
            while True:
                line = request.worker.err.get()
                if line is None:
                    return
                if line.startswith(END_ERR):
                    request.err_marker = True
                    return
                yield line
        finally:
            request.err_done.set()


class _Request:
    """One request to a resident worker, shaped like the Popen it replaces."""

    def __init__(self, worker):
        self.worker = worker
        self.pid = worker.proc.pid
        self.rc = None
        self.err_marker = False
        self.out_done = threading.Event()
        self.err_done = threading.Event()
        self.returncode = None
        self.stdin = _Stdin(self)
        self.stdout = _Stdout(self)
        self.stderr = _Stderr(self)
        self._finished = False

    def poll(self):
        return self.returncode

    def kill(self):
        # A driver's grace or budget timer can fire just after the request
        # finished; by then the worker is back in the pool and not ours to kill.
        if not self._finished:
            self.worker.kill()

    def wait(self, timeout=None):
        if self._finished:
            return self.returncode
        self.out_done.wait(timeout)
        healthy = self.rc is not None
        if healthy:
            healthy = self.err_done.wait(_END_GRACE) and self.err_marker
        self._finished = True
        if healthy and self.worker.alive():
            self.returncode = self.rc
            _checkin(self.worker)
        else:
            self.worker.kill()
            code = self.worker.proc.returncode
            self.returncode = code if code is not None else -1
        return self.returncode


def _cold(argv, env, cwd):
    return subprocess.Popen(argv, **_popen_kwargs(env, cwd))


def popen(argv, *, env, cwd=None):
    """Start ``argv`` (``[python, ..., script]``) for one request. Returns a
    real Popen unless the queue is draining and ``script`` is resident."""
    script = os.path.basename(str(argv[-1]))
    if not _warm or script not in RESIDENT_SCRIPTS:
        return _cold(argv, env, cwd)
    key = (tuple(str(a) for a in argv), tuple(sorted((env or {}).items())), cwd)
    retired = []
    with _lock:
        worker = _idle.pop(key, None)
        # Same script, different interpreter or settings: that worker can never
        # be reused, so it should not hold its model until the idle timeout.
        for k in [k for k, w in _idle.items() if w.script == script]:
            retired.append(_idle.pop(k))
        generation = _generation
    for old in retired:
        old.kill()
    if worker is not None and not worker.alive():
        worker.kill()
        worker = None
    if worker is None:
        try:
            worker = _Worker(key, [*argv[:-1], _HARNESS, argv[-1]], env, cwd, generation)
        except OSError as e:
            logger.warning('infer pool: could not start a resident %s (%s) — '
                           'running it one-shot', script, e)
            return _cold(argv, env, cwd)
        logger.info('infer pool: started a resident %s (pid %s)', script, worker.proc.pid)
    else:
        logger.info('infer pool: reusing the resident %s (pid %s, request %s)',
                    script, worker.proc.pid, worker.requests + 1)
    worker.requests += 1
    return _Request(worker)


def _checkin(worker):
    with _lock:
        if (_warm and worker.generation == _generation
                and worker.key not in _idle):
            worker.last_used = time.monotonic()
            _idle[worker.key] = worker
            return
    worker.kill()


def shutdown(reason):
    """Stop every idle worker now; a checked-out one stops when it returns."""
    global _generation
    with _lock:
        _generation += 1
        workers = list(_idle.values())
        _idle.clear()
    for worker in workers:
        worker.kill()
    if workers:
        logger.info('infer pool: stopped %s resident worker(s) — %s', len(workers), reason)


def _reap_loop():
    while True:
        time.sleep(_REAP_POLL)
        now = time.monotonic()
        with _lock:
            expired = [k for k, w in _idle.items() if now - w.last_used >= IDLE_SECONDS]
            workers = [_idle.pop(k) for k in expired]
        for worker in workers:
            logger.info('infer pool: stopped the idle resident %s (pid %s)',
                        worker.script, worker.proc.pid)
            worker.kill()


@contextmanager
def keep_warm():
    """Let resident workers serve requests while this block runs. The bank
    queue holds it for a local drain; the last holder out stops them all."""
    global _warm, _reaper
    with _lock:
        _warm += 1
        if _reaper is None:
            _reaper = threading.Thread(target=_reap_loop, daemon=True,
                                       name='infer-pool-reaper')
            _reaper.start()
    try:
        yield
    finally:
        with _lock:
            _warm -= 1
            last = _warm == 0
        if last:
            shutdown('the queue is empty')
