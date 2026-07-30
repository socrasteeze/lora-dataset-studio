"""Terminal sink for activity_log — narrate the app's work in the console.

A second consumer of the same events the Activity panel shows, so the two
surfaces cannot tell different stories. Attaches a dedicated non-propagating
logger (``lds.activity``) with one StreamHandler: that keeps Werkzeug's
request-line flood off the console (root already has the RotatingFileHandler)
and keeps ``data/app.log`` free of job narration.

Levels (``console.level``, overridable by ``LDS_CONSOLE``):

* ``off``       — nothing (headless / service)
* ``events``    — every activity_log event (default)
* ``heartbeat`` — + one line per running job every ``console.heartbeat_seconds``
* ``all``       — + progress ticks from the snapshot, ≤1 per job per second

Never raises into the work it describes. Windows encoding crashes (emoji on a
cp1252 stream under the portable launcher) are absorbed by logging + the
stdout reconfigure in ``run.py``.
"""
from __future__ import annotations

import logging
import os
import sys
import threading
import time

LOGGER_NAME = 'lds.activity'
LEVELS = ('off', 'events', 'heartbeat', 'all')

_lock = threading.Lock()
_attached = False
_heartbeat: threading.Thread | None = None
_stop = threading.Event()
# job_key -> last emit monotonic time (progress throttle at level=all)
_last_progress: dict[str, float] = {}
# job_key -> last (done, total) we printed (skip unchanged)
_last_progress_state: dict[str, tuple] = {}
_handler_stream = None  # set by tests to a StringIO / fake stream


def _cfg_level() -> str:
    env = (os.environ.get('LDS_CONSOLE') or '').strip().lower()
    if env in LEVELS:
        return env
    try:
        from .. import config as cfg
        raw = str(cfg.get('console.level', 'events') or 'events').strip().lower()
        return raw if raw in LEVELS else 'events'
    except Exception:  # noqa: BLE001
        return 'events'


def _cfg_heartbeat_seconds() -> float:
    try:
        from .. import config as cfg
        val = float(cfg.get('console.heartbeat_seconds', 30) or 30)
        return max(5.0, min(val, 600.0))
    except Exception:  # noqa: BLE001
        return 30.0


def _logger() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)


def _prefix_for_level(level: str) -> str:
    if level == 'ok':
        return '[OK]'
    if level == 'warn':
        return '[!]'
    if level == 'error':
        return '[X]'
    return '[i]'


def _event_prefix(source, device=None) -> str:
    src = str(source or '').strip() or 'app'
    device = str(device).strip() if device else ''
    return f'{src} · {device}' if device else src


def _running_where(device=None) -> str:
    device = str(device).strip() if device else ''
    return f' · on {device}' if device else ''


def _emit(line: str, log_level=logging.INFO) -> None:
    """Write one console line. Never raises."""
    try:
        _logger().log(log_level, line)
    except Exception:  # noqa: BLE001
        pass


def format_event_line(event: dict) -> str:
    """Same shape as the Activity panel row (eventPrefix + message + detail)."""
    tag = _prefix_for_level(event.get('level') or 'info')
    head = _event_prefix(event.get('source'), event.get('device'))
    msg = str(event.get('message') or '')
    detail = event.get('detail')
    body = f'{head}: {msg}' if msg else head
    if detail:
        body = f'{body} ({detail})'
    return f'{tag} {body}'


def on_record(event: dict) -> None:
    """Called from activity_log.record after a successful append. Never raises."""
    try:
        if _cfg_level() == 'off':
            return
        _emit(format_event_line(event))
    except Exception:  # noqa: BLE001
        pass


def attach(stream=None) -> bool:
    """Install the non-propagating StreamHandler once. Returns True when newly
    attached. ``stream`` is for tests (a StringIO); production uses stderr."""
    global _attached, _handler_stream
    with _lock:
        if _attached:
            return False
        log = _logger()
        log.propagate = False
        log.setLevel(logging.INFO)
        # Drop any leftover handlers from a previous process/test.
        for h in list(log.handlers):
            log.removeHandler(h)
        target = stream if stream is not None else sys.stderr
        _handler_stream = target
        handler = logging.StreamHandler(target)
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter('%(message)s'))
        # errors='replace' on the stream is handled by run.py's reconfigure;
        # StreamHandler itself swallows emit failures.
        log.addHandler(handler)
        _attached = True
        return True


def detach() -> None:
    """Test helper: tear the handler and heartbeat down."""
    global _attached, _heartbeat, _handler_stream
    _stop.set()
    with _lock:
        log = _logger()
        for h in list(log.handlers):
            log.removeHandler(h)
        _attached = False
        _handler_stream = None
        _last_progress.clear()
        _last_progress_state.clear()
    t = _heartbeat
    if t is not None and t.is_alive() and t is not threading.current_thread():
        t.join(timeout=1.0)
    _heartbeat = None
    _stop.clear()


def start_heartbeat(app=None) -> None:
    """Start the background heartbeat/progress thread when the level wants it."""
    global _heartbeat
    level = _cfg_level()
    if level not in ('heartbeat', 'all'):
        return
    with _lock:
        if _heartbeat is not None and _heartbeat.is_alive():
            return
        _stop.clear()
        _heartbeat = threading.Thread(
            target=_heartbeat_loop, args=(app,),
            name='lds-activity-console', daemon=True)
        _heartbeat.start()


def _job_key(row: dict) -> str:
    kind = row.get('kind') or row.get('source') or 'job'
    bid = row.get('bank_id')
    did = row.get('dataset_id')
    if bid is not None:
        return f'bank:{bid}:{kind}'
    if did is not None:
        return f'dataset:{did}:{kind}'
    return f'{kind}:{row.get("name") or row.get("label") or id(row)}'


def _format_running_line(row: dict, *, tick: bool = False) -> str:
    kind = row.get('kind') or 'job'
    name = row.get('name') or row.get('label') or ''
    done = row.get('done')
    total = row.get('total')
    where = _running_where(row.get('device'))
    progress = ''
    if done is not None and total:
        progress = f' {done}/{total}'
    elif done is not None:
        progress = f' {done}'
    stale = row.get('stale_seconds')
    stale_bit = f', silent {int(stale)}s' if stale and stale >= 60 else ''
    verb = 'still running' if tick else 'running'
    head = f'{kind}'
    if name:
        head = f'{kind} {name}'
    return f'[i] {head}{progress}{where} — {verb}{stale_bit}'


def _heartbeat_loop(app) -> None:
    # First tick after a full interval so we don't double-print start events.
    interval = _cfg_heartbeat_seconds()
    while not _stop.wait(interval):
        try:
            level = _cfg_level()
            if level not in ('heartbeat', 'all'):
                continue
            interval = _cfg_heartbeat_seconds()
            snap = _take_snapshot(app)
            if not snap:
                continue
            running = snap.get('running') or []
            now = time.monotonic()
            for row in running:
                key = _job_key(row)
                if level == 'all':
                    state = (row.get('done'), row.get('total'))
                    last_t = _last_progress.get(key, 0.0)
                    if state != _last_progress_state.get(key) and (now - last_t) >= 1.0:
                        _last_progress[key] = now
                        _last_progress_state[key] = state
                        _emit(_format_running_line(row, tick=True))
                        continue
                # heartbeat: one line per running job each interval
                if level == 'heartbeat':
                    _emit(_format_running_line(row, tick=False))
            # Drop throttle state for jobs that finished
            live = {_job_key(r) for r in running}
            for k in list(_last_progress):
                if k not in live:
                    _last_progress.pop(k, None)
                    _last_progress_state.pop(k, None)
        except Exception:  # noqa: BLE001
            pass


def _take_snapshot(app) -> dict | None:
    try:
        from . import activity_log
        from ..config import LOCAL_USER
        if app is not None:
            with app.app_context():
                return activity_log.snapshot(LOCAL_USER)
        return activity_log.snapshot(LOCAL_USER)
    except Exception:  # noqa: BLE001
        return None


def reset_for_tests() -> None:
    """Full teardown used by the test suite."""
    detach()
