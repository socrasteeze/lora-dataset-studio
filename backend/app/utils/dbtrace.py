"""🔎 Diagnostic: name the connection that is sitting on SQLite's write lock.

OFF by default. `LDS_DB_TRACE=2` (seconds), or `diagnostics.db_trace_seconds`
in config.json, turns it on.

It exists because this app has now shipped the same bug three times — a
background pass opening the write transaction and then doing slow non-DB work
inside it, which is exactly the rule ``utils/dbbusy`` states it must not — and
every time the only evidence was ``database is locked`` raised on the VICTIM.
That message names the connection that gave up waiting; it says nothing at all
about the one that was holding. This says who, on which thread, since when, and
with which statement the transaction opened.

Two design choices worth keeping:

* **The raw ``sqlite3.Connection.in_transaction`` flag, not SQLAlchemy's
  ``begin`` event.** pysqlite defers the real ``BEGIN`` until a data-modifying
  statement, so the engine event fires for read-only work too and would report
  a lock nobody holds. WAL readers never block the writer; a false positive
  here would send the next investigation down the same dead end this module was
  written to end.
* **The watchdog re-reads the flag before it warns, and reports while the hold
  is still in progress.** A commit is issued on the DBAPI connection, not
  through a cursor, so no execute event fires when a transaction ENDS — polling
  the flag is what makes "is it still held?" answerable at all. Reporting live
  also means you can go and look at the running pass, which an after-the-fact
  line does not give you.

Privacy (CLAUDE.md): the statement text is logged, the bound parameters never
are — parameters carry the user's own folder paths. The truncated statement is
run through ``redact_user_paths`` anyway. ``test_no_personal_data.py`` cannot
catch a runtime leak, so this has to be right by construction.
"""
import logging
import os
import threading
import time

from sqlalchemy import event
from sqlalchemy.engine import Engine

from .redact import redact_user_paths

logger = logging.getLogger(__name__)

# How often the watchdog looks. Well under any useful threshold, and a plain
# attribute read per tracked connection — cheap enough not to distort what it
# is measuring.
_POLL_SECONDS = 0.5
# Enough of the statement to identify the opener; the interesting ones are
# short (a refresh SELECT, an UPDATE) and a truncated tail costs nothing.
_SQL_CHARS = 200

_lock = threading.Lock()
_open = {}          # id(raw connection) -> {'conn', 't0', 'sql', 'thread', 'warned'}
_threshold = 0.0
_stop = threading.Event()
_watchdog = None
_installed = False


def _raw(conn):
    """The DBAPI connection under a SQLAlchemy Connection, or None."""
    try:
        return conn.connection.dbapi_connection
    except Exception:
        return None


def _in_transaction(raw) -> bool:
    """True while sqlite is inside an explicit transaction (autocommit off)."""
    try:
        return bool(raw.in_transaction)
    except Exception:
        # Not sqlite, or a closed connection. Either way we cannot judge it, and
        # a diagnostic must never invent a hold it did not observe.
        return False


def _after_cursor_execute(conn, cursor, statement, parameters, context, many):
    raw = _raw(conn)
    if raw is None:
        return
    key = id(raw)
    if _in_transaction(raw):
        with _lock:
            if key not in _open:
                _open[key] = {
                    'conn': raw,
                    't0': time.monotonic(),
                    # Statement only. NEVER `parameters`.
                    'sql': redact_user_paths(' '.join(str(statement).split())[:_SQL_CHARS]),
                    'thread': threading.current_thread().name,
                    'warned': False,
                }
    else:
        _release(key)


def _release(key) -> None:
    with _lock:
        info = _open.pop(key, None)
    if info and info['warned']:
        logger.warning('db write transaction RELEASED after %.1fs by thread %s',
                       time.monotonic() - info['t0'], info['thread'])


def _tick() -> None:
    now = time.monotonic()
    with _lock:
        tracked = list(_open.items())
    for key, info in tracked:
        # Re-read the flag: a COMMIT never passes through a cursor event, so a
        # stale record here is the normal case, not an error.
        if not _in_transaction(info['conn']):
            _release(key)
            continue
        held = now - info['t0']
        if held >= _threshold and not info['warned']:
            info['warned'] = True
            logger.warning(
                'db write transaction held %.1fs by thread %s — opened by: %s',
                held, info['thread'], info['sql'])


def _run() -> None:
    while not _stop.wait(_POLL_SECONDS):
        try:
            _tick()
        except Exception:      # a diagnostic must never take the app down
            logger.exception('dbtrace watchdog tick failed')


def threshold_seconds(config_value=None) -> float:
    """Seconds a write transaction may be held before it is reported.

    ``LDS_DB_TRACE`` wins over config so a one-off hunt needs no config edit and
    leaves nothing behind. 0, unset or unparseable = off.
    """
    raw = os.environ.get('LDS_DB_TRACE')
    if raw is None or not str(raw).strip():
        raw = config_value
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        return 0.0
    return value if value > 0 else 0.0


def install(app=None, config_value=None) -> bool:
    """Start tracing if a positive threshold is configured. Returns whether it ran.

    Registered on the Engine CLASS, like the PRAGMA listener in ``app/__init__``
    and for the same reason: app-factory tests create several apps, and a
    per-app listener would stack duplicates.
    """
    global _threshold, _watchdog, _installed
    seconds = threshold_seconds(config_value)
    if seconds <= 0 or _installed:
        return False
    _threshold = seconds
    event.listen(Engine, 'after_cursor_execute', _after_cursor_execute)
    _stop.clear()
    _watchdog = threading.Thread(target=_run, name='dbtrace', daemon=True)
    _watchdog.start()
    _installed = True
    logger.warning('dbtrace ON — reporting write transactions held over %.1fs. '
                   'This is a diagnostic; unset LDS_DB_TRACE when done.', seconds)
    return True


def shutdown() -> None:
    """Stop the watchdog. For tests; the daemon thread dies with the process."""
    global _installed
    _stop.set()
    if _watchdog is not None:
        _watchdog.join(timeout=2)
    try:
        event.remove(Engine, 'after_cursor_execute', _after_cursor_execute)
    except Exception:
        pass
    with _lock:
        _open.clear()
    _installed = False
