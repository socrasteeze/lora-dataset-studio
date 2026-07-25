"""SQLite write-contention helpers — keep curating while a pass is running.

SQLite allows exactly ONE writer at a time. A bank pass (scan, score, watermark,
the cross-bank "Launch all" queue) writes in batches for minutes on end, while
the person using the app is curating ANOTHER bank and issuing small writes:
✓/✕ on an image, resolving a duplicate group, creating or renaming a bank.

When those two collide, SQLite waits ``PRAGMA busy_timeout`` and then raises
``OperationalError: database is locked`` — which used to reach the browser as a
bare HTTP 500 and an "unable to complete action" toast, with the click silently
lost. Two layers fix that:

* ``write_with_retry`` — the service-side belt. A rollback DISCARDS the pending
  changes, so a correct retry has to re-run the whole unit of work, not just
  re-issue ``commit()``. That's why this takes a callable.
* ``is_locked_error`` + the app-level handler in ``create_app`` — the last
  resort: an honest, retryable 503 (``db_busy``) instead of a 500, which the
  front-end replays transparently.

Neither layer replaces the real rule: a background pass must never hold the
write transaction open across slow non-DB work (GPU calls, folder walks, numpy).
Compute first, then open the transaction and commit promptly.
"""
import logging
import random
import time

from sqlalchemy.exc import OperationalError

from ..extensions import db

logger = logging.getLogger(__name__)

# What the user is told when even the retries lost the race. Deliberately says
# the change was NOT saved (so nobody walks away believing a reject landed) and
# that retrying is the fix — the background pass releases the lock constantly.
DB_BUSY_MESSAGE = ('The database is busy — a background pass is writing to it. '
                   'Your change was not saved; try again in a moment.')

# sqlite3 spells the two write-lock collisions this way; both are transient and
# both are worth retrying. Any other OperationalError is a real fault and is
# re-raised untouched.
_LOCK_MARKERS = ('database is locked', 'database table is locked')

_DEFAULT_ATTEMPTS = 3
_DEFAULT_BASE_DELAY = 0.25


def is_locked_error(exc) -> bool:
    """True for the transient 'another connection holds the write lock' error."""
    if not isinstance(exc, OperationalError):
        return False
    text = str(getattr(exc, 'orig', None) or exc).lower()
    return any(marker in text for marker in _LOCK_MARKERS)


def write_with_retry(fn, attempts=_DEFAULT_ATTEMPTS, base_delay=_DEFAULT_BASE_DELAY):
    """Run ``fn()`` (which mutates the session) and commit, retrying the WHOLE
    unit of work when SQLite reports a writer collision.

    ``fn`` must be re-runnable: after a lock error the session is rolled back,
    which throws away everything it staged, so replaying only the commit would
    silently save nothing. Returns whatever ``fn`` returns. Anything that isn't
    a lock error — and the last attempt — propagates unchanged.
    """
    for attempt in range(1, attempts + 1):
        try:
            result = fn()
            db.session.commit()
            return result
        except OperationalError as e:
            db.session.rollback()
            if attempt == attempts or not is_locked_error(e):
                raise
            delay = base_delay * (2 ** (attempt - 1)) + random.random() * 0.1
            logger.info('sqlite writer busy — replaying the write in %.2fs '
                        '(attempt %d/%d)', delay, attempt, attempts)
            time.sleep(delay)
    raise AssertionError('unreachable')  # pragma: no cover
