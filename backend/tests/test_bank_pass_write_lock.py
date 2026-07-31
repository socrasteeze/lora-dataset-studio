"""🔒 A running vision pass must not own SQLite's write lock.

The reported failure: jobs queued and nothing ran for about an hour, the second
machine's heartbeat 503ing every 20 s (15 s ``busy_timeout`` + the peer's 5 s
error backoff), and ``database is locked`` raised out of the GPU window's
heartbeat. A framing/watermark pass was running the whole time.

The mechanism, and why it is invisible in ordinary tests. Flask-SQLAlchemy runs
with defaults, so ``expire_on_commit=True`` and ``autoflush=True``:

1. the pass loads the whole bank as ORM rows and commits every 25 successes;
2. that commit EXPIRES every loaded row;
3. the next lazy pull of the generator reads ``bank.source_path`` and
   ``row.relpath`` — both expired — which emits a refresh SELECT;
4. ``autoflush`` turns that SELECT into a flush, which OPENS the write
   transaction;
5. ``vision_pool`` refills the pool before it yields, so the transaction is
   then held across the next 25 Ollama calls — ~20 s measured, against a 15 s
   ``busy_timeout``.

Every output is correct throughout, which is why no existing test caught it.
The defect is a timing property, so it is asserted as the thing the user
actually loses: **a click made while the pass runs must land.** The probe below
is that click, issued from a connection the app does not own, with 300 ms of
patience — a well-behaved pass commits in single-digit milliseconds, so every
attempt must win. Using the real 15 000 ms timeout here would make this test
pass against the bug, just slowly.

Every test here was verified to FAIL against the unfixed code before being kept
— and one of them had to be rewritten to earn that, which is recorded in its
own docstring rather than quietly fixed.
"""
import os
import sqlite3
import threading
import time

import pytest

from app.services.image_bank_service import _VISION_FLUSH_EVERY
from test_bank_vision_concurrency import (VisionSpy, _allow_pass, _mkbank,
                                          _patch_vision)


def _file_backed_app(tmp_path):
    """The suite's ``app`` fixture forces sqlite:///:memory:, where a second
    connection sees an EMPTY database — so contention cannot be observed at all.
    Precedent for a file-backed app: test_watermarks.py."""
    from app import create_app
    return create_app({
        'TESTING': True,
        'WTF_CSRF_ENABLED': False,
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{tmp_path / "studio.db"}',
    })


class _Curator:
    """A person clicking ✓ on another bank while the pass runs."""

    def __init__(self, db_path):
        self.db_path = str(db_path)
        self.results = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name='curator', daemon=True)

    def _run(self):
        conn = sqlite3.connect(self.db_path, timeout=0.3)
        try:
            while not self._stop.is_set():
                try:
                    conn.execute('UPDATE image_bank SET name = name')
                    conn.commit()
                    self.results.append(True)
                except sqlite3.OperationalError as e:
                    if 'locked' not in str(e).lower():
                        raise
                    conn.rollback()
                    self.results.append(False)
                time.sleep(0.02)
        finally:
            conn.close()

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join(timeout=3)

    def verdict(self):
        lost = self.results.count(False)
        assert len(self.results) > 20, (
            f'the probe only got {len(self.results)} attempts in — it did not '
            'really overlap the pass, so this proves nothing')
        assert lost == 0, (
            f'{lost}/{len(self.results)} clicks lost the write lock while the '
            'pass ran — the pass is holding the transaction across its vision '
            'calls (see this module docstring)')


@pytest.mark.parametrize('pass_name', ['framing', 'watermark'])
def test_a_vision_pass_never_blocks_a_click(tmp_path, monkeypatch, pass_name):
    from app.services import image_bank_service as svc

    application = _file_backed_app(tmp_path)
    client = application.test_client()
    bank_id, _src = _mkbank(client, tmp_path, 60, name=f'LOCK{pass_name}')

    _allow_pass(monkeypatch)
    # 60 ms per call: long enough that a held transaction is unmissable against
    # the probe's 300 ms patience, short enough to keep the test quick.
    answer = ('{"framing": "face"}' if pass_name == 'framing'
              else '{"watermark": false}')
    _patch_vision(monkeypatch, VisionSpy(answer=answer, delay=0.06))

    start = svc.start_framing if pass_name == 'framing' else svc.start_watermark
    with _Curator(tmp_path / 'studio.db') as curator:
        with application.app_context():
            job = start(application, 'local', bank_id, rescan=True)

    assert job['error'] is None, job['error']
    curator.verdict()


def test_a_degraded_ollama_still_saves_as_it_goes(tmp_path, monkeypatch):
    """The second, independent bug: the flush gate counted SUCCESSES.

    When every call fails, the watermark pass still writes — it stamps
    `watermark_state = 'error'` on each row. The old gate was `checked % 25`,
    and `checked` only advanced on the branch where the model ANSWERED, so a
    run of failures never reached a flush at all.

    Note what this is and is not. Once the results are staged as plain data
    rather than on ORM rows, the counter no longer affects how long the write
    lock is held — that was measured, and a version of this test asserting the
    lock DID pass against the old counter, which is exactly the "green for the
    wrong reason" trap. What the counter actually costs is durability and
    memory: an unbounded buffer, and a pass killed at image 9 999 of 10 000
    losing every stamp. So that is what is asserted — mid-pass, from a
    connection the app does not own, because after the pass the `finally`
    flush hides the difference completely.
    """
    from app.services import image_bank_service as svc

    application = _file_backed_app(tmp_path)
    client = application.test_client()
    bank_id, _src = _mkbank(client, tmp_path, 60, name='DEGRADED')
    db_path = str(tmp_path / 'studio.db')
    landed_midway = {}

    def always_fails(index):
        if index == 45:
            # A second connection sees only COMMITTED work — which is the
            # point: has anything been saved yet, or is it all still buffered?
            conn = sqlite3.connect(db_path, timeout=2.0)
            try:
                landed_midway['n'] = conn.execute(
                    "SELECT count(*) FROM bank_image "
                    "WHERE bank_id = ? AND watermark_state = 'error'",
                    (bank_id,)).fetchone()[0]
            finally:
                conn.close()
        raise RuntimeError('ollama went away')

    _allow_pass(monkeypatch)
    _patch_vision(monkeypatch, VisionSpy(delay=0.03, on_call=always_fails))

    with application.app_context():
        job = svc.start_watermark(application, 'local', bank_id, rescan=True)

    assert job['error'] is None, job['error']
    assert 'n' in landed_midway, 'the probe point was never reached'
    assert landed_midway['n'] >= _VISION_FLUSH_EVERY, (
        f"only {landed_midway['n']} of ~40 failures had been saved 45 images "
        'into the pass — the flush gate is counting successes again, so a '
        'pass that dies mid-run loses everything it had learned')
    # And the whole run still lands, so this is not green by doing nothing.
    with application.app_context():
        from app.models import BankImage
        assert BankImage.query.filter_by(bank_id=bank_id,
                                         watermark_state='error').count() == 60


def test_creating_a_bank_saves_as_it_walks(tmp_path, monkeypatch):
    """_register_bank flushed in the loop and committed ONCE at the end.

    A flush opens the write transaction just as a commit does, but never closes
    it — so creating a bank held SQLite's single writer across up to
    BANK_MAX_FILES (50 000) os.path.getsize syscalls. refresh_bank hit exactly
    this and was fixed by changing flush to commit; its comment says so. The
    twin below it never got the same fix.

    Asserted as durability rather than as a stopwatch: at realistic test sizes
    50 000 syscalls' worth of hold cannot be reproduced, so a timing assertion
    here would be the kind that passes both ways. Mid-walk visibility from a
    second connection discriminates exactly and deterministically — under the
    old code NOTHING is committed until the very end.
    """
    from app import config as cfg

    count = 600                      # > the 500-row batch, so a flush is due
    src = tmp_path / 'many'
    src.mkdir()
    blob = (tmp_path / 'seed.jpg')
    from PIL import Image
    Image.new('RGB', (8, 8)).save(str(blob), 'JPEG')
    payload = blob.read_bytes()
    for i in range(count):
        (src / f'{i:04d}.jpg').write_bytes(payload)

    application = _file_backed_app(tmp_path)
    client = application.test_client()
    db_path = str(tmp_path / 'studio.db')
    landed_midway = {}

    real_getsize = os.path.getsize
    state = {'n': 0}

    def counting_getsize(path):
        state['n'] += 1
        if state['n'] == 560:        # past the first batch boundary
            conn = sqlite3.connect(db_path, timeout=2.0)
            try:
                landed_midway['n'] = conn.execute(
                    'SELECT count(*) FROM bank_image').fetchone()[0]
            finally:
                conn.close()
        return real_getsize(path)

    monkeypatch.setattr(os.path, 'getsize', counting_getsize)
    with application.app_context():
        cfg.save_config({})
        r = client.post('/api/bank/create',
                        json={'name': 'MANY', 'folder': str(src)})
    assert r.status_code == 200, r.get_json()

    assert 'n' in landed_midway, 'the probe point was never reached'
    assert landed_midway['n'] >= 500, (
        f'only {landed_midway["n"]} rows were committed 560 files into the '
        'walk — the insert loop is flushing instead of committing, so it holds '
        'the write lock for the whole walk')


def test_a_vision_pass_holds_no_long_write_transaction(tmp_path, monkeypatch):
    """The same invariant stated directly, using the shipped diagnostic.

    The probe above asserts the CONSEQUENCE (a click is lost). This asserts the
    CAUSE. Run against the unfixed pass it reported, twice:

        db write transaction held 0.3s by thread MainThread
          — opened by: UPDATE bank_image SET framing=? WHERE bank_image.id = ?
        db write transaction RELEASED after 0.5s

    Worth reading carefully, because it corrects the obvious guess: the
    statement NAMED is the autoflushed UPDATE of the previous batch, not the
    refresh SELECT that triggered the autoflush. The SELECT is what fires, but
    a SELECT does not open a write transaction — the UPDATE flushed ahead of it
    does. Same mechanism, different statement in the log.
    """
    import logging
    from app.services import image_bank_service as svc
    from app.utils import dbtrace

    application = _file_backed_app(tmp_path)
    client = application.test_client()
    bank_id, _src = _mkbank(client, tmp_path, 60, name='TRACE')

    _allow_pass(monkeypatch)
    _patch_vision(monkeypatch, VisionSpy(answer='{"framing": "face"}', delay=0.06))
    monkeypatch.setattr(dbtrace, '_POLL_SECONDS', 0.02)
    monkeypatch.setenv('LDS_DB_TRACE', '0.3')

    assert dbtrace.install(None) is True
    try:
        with _caplog_warnings('app.utils.dbtrace') as records:
            with application.app_context():
                job = svc.start_framing(application, 'local', bank_id, rescan=True)
    finally:
        dbtrace.shutdown()

    assert job['error'] is None, job['error']
    held = [r for r in records if 'write transaction held' in r]
    assert not held, (
        'the pass held the write transaction across its vision calls:\n  '
        + '\n  '.join(held))


class _caplog_warnings:
    """caplog is a fixture; this pass runs inline and needs a plain handler."""

    def __init__(self, logger_name):
        self.logger = __import__('logging').getLogger(logger_name)
        self.records = []

    def __enter__(self):
        import logging

        outer = self

        class _H(logging.Handler):
            def emit(self, record):
                outer.records.append(record.getMessage())

        self._handler = _H()
        self._handler.setLevel(logging.WARNING)
        self.logger.addHandler(self._handler)
        self._old = self.logger.level
        self.logger.setLevel(logging.WARNING)
        return self.records

    def __exit__(self, *exc):
        self.logger.removeHandler(self._handler)
        self.logger.setLevel(self._old)
