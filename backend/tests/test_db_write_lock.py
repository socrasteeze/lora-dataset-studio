"""🔒 SQLite write contention — curating must survive a running pass.

SQLite allows ONE writer at a time. A bank pass writes in batches for minutes
while the user curates another bank, and every collision used to reach the
browser as a bare HTTP 500 ("unable to complete action") with the ✓/✕ silently
lost. Three guarantees are pinned here:

* the connection actually waits (``PRAGMA busy_timeout``) instead of failing
  on the first collision;
* a service write REPLAYS its whole unit of work on a lock error — re-issuing
  only ``commit()`` would save nothing, because the rollback discarded it;
* if the replays still lose, the API answers a retryable 503 + ``db_busy``,
  never a 500.
"""
import os
import time

import pytest
from PIL import Image
from sqlalchemy.exc import OperationalError

from app import SQLITE_BUSY_TIMEOUT_MS
from app.extensions import db
from app.services import image_bank_service as banks
from app.utils.dbbusy import is_locked_error, write_with_retry


def _locked(msg='database is locked'):
    return OperationalError('UPDATE bank_image ...', {}, Exception(msg))


def _save(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', (32, 32), (90, 90, 90)).save(path, 'JPEG', quality=90)


@pytest.fixture()
def bank(client, tmp_path):
    src = tmp_path / 'dump'
    _save(str(src / 'a.jpg'))
    _save(str(src / 'b.jpg'))
    r = client.post('/api/bank/create', json={'name': 'dump', 'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id']


def test_connections_wait_for_the_write_lock(app, monkeypatch):
    """A 5 s wait was routinely blown through by a batch commit; the busy timeout
    has to be generous enough that a well-behaved pass never starves a click."""
    monkeypatch.delenv('LDS_SQLITE_BUSY_TIMEOUT_MS', raising=False)
    with app.app_context():
        got = db.session.execute(db.text('PRAGMA busy_timeout')).scalar()
    assert got == SQLITE_BUSY_TIMEOUT_MS
    assert SQLITE_BUSY_TIMEOUT_MS >= 15000


def test_the_busy_timeout_can_be_dropped_for_a_hunt(monkeypatch):
    """LDS_SQLITE_BUSY_TIMEOUT_MS is the debugging posture, not a setting.

    At the shipped 15 s a pass holding the write lock is ABSORBED by the wait —
    only its victims are visible, and they never name the holder. Dropping the
    wait to ~500 ms surfaces the holder in seconds. It must be an env override
    and not a config key precisely so it cannot be left on by accident: at
    500 ms an ordinary click fails during a perfectly normal batch save.
    """
    from app import _busy_timeout_ms

    monkeypatch.delenv('LDS_SQLITE_BUSY_TIMEOUT_MS', raising=False)
    assert _busy_timeout_ms() == SQLITE_BUSY_TIMEOUT_MS

    monkeypatch.setenv('LDS_SQLITE_BUSY_TIMEOUT_MS', '500')
    assert _busy_timeout_ms() == 500

    # A typo must not silently disable the wait — that would turn every
    # collision into an instant failure across the whole app.
    monkeypatch.setenv('LDS_SQLITE_BUSY_TIMEOUT_MS', 'soon')
    assert _busy_timeout_ms() == SQLITE_BUSY_TIMEOUT_MS
    monkeypatch.setenv('LDS_SQLITE_BUSY_TIMEOUT_MS', '0')
    assert _busy_timeout_ms() == SQLITE_BUSY_TIMEOUT_MS


def test_is_locked_error_only_matches_the_transient_collision():
    assert is_locked_error(_locked())
    assert is_locked_error(_locked('database table is locked'))
    assert not is_locked_error(_locked('no such column: bank_image.nope'))
    assert not is_locked_error(ValueError('nope'))


def test_write_with_retry_replays_the_whole_unit_of_work(app, monkeypatch):
    """The rollback throws the staged changes away, so a retry that only
    re-committed would report success and save NOTHING. Assert fn re-runs."""
    with app.app_context():
        monkeypatch.setattr('app.utils.dbbusy.time.sleep', lambda _s: None)
        calls = {'fn': 0, 'commit': 0}
        real_commit = db.session.commit

        def flaky_commit():
            calls['commit'] += 1
            if calls['commit'] == 1:
                raise _locked()
            return real_commit()

        def unit():
            calls['fn'] += 1
            return 'done'

        monkeypatch.setattr(db.session, 'commit', flaky_commit)
        assert write_with_retry(unit) == 'done'
        assert calls['fn'] == 2          # replayed, not just re-committed
        assert calls['commit'] == 2


def test_write_with_retry_gives_up_on_a_real_fault(app, monkeypatch):
    with app.app_context():
        monkeypatch.setattr('app.utils.dbbusy.time.sleep', lambda _s: None)
        calls = {'fn': 0}

        def boom():
            calls['fn'] += 1
            raise _locked('no such table: bank_image')

        with pytest.raises(OperationalError):
            write_with_retry(boom)
        assert calls['fn'] == 1          # not a lock error -> no replay


def test_a_lost_write_race_is_a_retryable_503_not_a_500(client, bank, monkeypatch):
    """The last resort: every replay lost. The user must get an honest, machine-
    readable 'try again' (the SPA replays it) — never an opaque server error."""
    monkeypatch.setattr('app.utils.dbbusy.time.sleep', lambda _s: None)
    monkeypatch.setattr(banks, 'write_with_retry',
                        lambda _fn, **_kw: (_ for _ in ()).throw(_locked()))
    image_id = client.get(f'/api/bank/{bank}/images').get_json()['images'][0]['id']
    r = client.post(f'/api/bank/{bank}/images/status',
                    json={'ids': [image_id], 'status': 'reject'})
    assert r.status_code == 503
    body = r.get_json()
    assert body['db_busy'] is True
    assert 'not saved' in body['error']
    assert r.headers.get('Retry-After')


def test_a_status_write_survives_one_lost_race(client, app, bank, monkeypatch):
    """End to end: the reject lands even though the first commit collided with a
    background pass — which is the whole point of the retry belt."""
    monkeypatch.setattr('app.utils.dbbusy.time.sleep', lambda _s: None)
    image_id = client.get(f'/api/bank/{bank}/images').get_json()['images'][0]['id']
    state = {'n': 0}
    real_commit = db.session.commit

    def flaky_commit():
        state['n'] += 1
        if state['n'] == 1:
            raise _locked()
        return real_commit()

    monkeypatch.setattr(db.session, 'commit', flaky_commit)
    r = client.post(f'/api/bank/{bank}/images/status',
                    json={'ids': [image_id], 'status': 'reject'})
    monkeypatch.undo()
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['changed'] == 1
    with app.app_context():
        assert banks.bank_payload('local', bank)['counts']['reject'] == 1


# --- the diagnostic: name the HOLDER, not the victim -------------------------

def test_dbtrace_is_off_unless_a_threshold_is_configured(monkeypatch):
    """It must cost nothing when nobody asked for it."""
    from app.utils import dbtrace

    monkeypatch.delenv('LDS_DB_TRACE', raising=False)
    assert dbtrace.threshold_seconds(None) == 0.0
    assert dbtrace.threshold_seconds(0) == 0.0
    assert dbtrace.install(None, 0) is False

    # config.json turns it on; the env var overrides config for a one-off hunt.
    assert dbtrace.threshold_seconds(2) == 2.0
    monkeypatch.setenv('LDS_DB_TRACE', '0.5')
    assert dbtrace.threshold_seconds(2) == 0.5
    # A typo is off, not "trace everything".
    monkeypatch.setenv('LDS_DB_TRACE', 'yes')
    assert dbtrace.threshold_seconds(None) == 0.0


def test_dbtrace_names_the_thread_and_statement_holding_the_write_lock(
        app, tmp_path, monkeypatch, caplog):
    """The reason this ships instead of being scaffolding.

    "database is locked" is raised on the connection that gave up WAITING. It
    names the victim and says nothing about the holder, which is why the same
    bug — a pass holding the write transaction across slow non-DB work — got
    diagnosed from scratch three times. This asserts the log finally answers
    "who?": the thread name and the statement that opened the transaction.
    """
    import logging
    import threading
    from app.utils import dbtrace

    monkeypatch.setattr(dbtrace, '_POLL_SECONDS', 0.02)
    monkeypatch.setenv('LDS_DB_TRACE', '0.05')
    assert dbtrace.install(None) is True
    me = threading.current_thread()
    original_name = me.name
    try:
        with caplog.at_level(logging.WARNING, logger='app.utils.dbtrace'):
            with app.app_context():
                # Named BEFORE the statement: the tracer records the thread that
                # OPENED the transaction, which is the whole point — renaming
                # afterwards would test nothing.
                me.name = 'bank-7-framing'
                # Open a write transaction and then do "slow work" inside it —
                # exactly the shape utils/dbbusy says a pass must never have.
                db.session.execute(db.text(
                    'UPDATE image_bank SET name = name'))
                time.sleep(0.4)
                db.session.commit()
        held = [r.getMessage() for r in caplog.records
                if 'write transaction held' in r.getMessage()]
    finally:
        me.name = original_name
        dbtrace.shutdown()

    assert held, 'the tracer never reported a transaction it was holding open'
    assert 'bank-7-framing' in held[0], held[0]
    assert 'UPDATE image_bank' in held[0], held[0]


def test_dbtrace_never_logs_bound_parameters(app, monkeypatch, caplog):
    """Privacy (CLAUDE.md): parameters carry the user's own folder paths.

    The statement is enough to identify the opener. Logging the values that
    went into it would put a real source path into a file people paste into
    bug reports — which is the one thing the redaction helpers exist to stop.
    """
    import logging
    from app.utils import dbtrace

    secret = 'E:/very/private/photos/2019'
    monkeypatch.setattr(dbtrace, '_POLL_SECONDS', 0.02)
    monkeypatch.setenv('LDS_DB_TRACE', '0.05')
    assert dbtrace.install(None) is True
    try:
        with caplog.at_level(logging.WARNING, logger='app.utils.dbtrace'):
            with app.app_context():
                db.session.execute(
                    db.text('UPDATE image_bank SET source_path = :p'),
                    {'p': secret})
                time.sleep(0.4)
                db.session.commit()
        text = '\n'.join(r.getMessage() for r in caplog.records)
    finally:
        dbtrace.shutdown()

    assert 'write transaction held' in text, 'the tracer did not run at all'
    assert secret not in text, 'the tracer logged a bound parameter'
