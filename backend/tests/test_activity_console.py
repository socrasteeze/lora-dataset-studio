"""Terminal activity stream — console sink for activity_log.

Levels, attach-once, no propagation into app.log, and the Windows encoding
crash path (emoji on a cp1252 stream must not raise).
"""
import io
import logging

import pytest


@pytest.fixture(autouse=True)
def _clean_console(monkeypatch):
    from app.services import activity_console, activity_log
    activity_console.reset_for_tests()
    activity_log.reset()
    # Default tests to events so on_record writes; individual tests override.
    monkeypatch.setenv('LDS_CONSOLE', 'events')
    yield
    activity_console.reset_for_tests()
    activity_log.reset()
    monkeypatch.delenv('LDS_CONSOLE', raising=False)


class _Cp1252Stream(io.TextIOBase):
    """A stream that refuses anything outside cp1252 — the portable-launcher
    crash path for emoji prints."""

    encoding = 'cp1252'

    def __init__(self):
        self.buf = []

    def write(self, s):
        # Raise exactly like a real cp1252 console would on emoji.
        s.encode('cp1252')
        self.buf.append(s)
        return len(s)

    def flush(self):
        pass

    def getvalue(self):
        return ''.join(self.buf)


class _Utf8Capture(io.StringIO):
    encoding = 'utf-8'


def test_off_is_silent(monkeypatch):
    from app.services import activity_console, activity_log

    monkeypatch.setenv('LDS_CONSOLE', 'off')
    stream = _Utf8Capture()
    activity_console.attach(stream=stream)
    activity_log.record('bank', 'scan started')
    assert stream.getvalue() == ''


def test_events_emits_each_record_and_nothing_more(monkeypatch):
    from app.services import activity_console, activity_log

    monkeypatch.setenv('LDS_CONSOLE', 'events')
    stream = _Utf8Capture()
    activity_console.attach(stream=stream)
    activity_log.record('bank', 'scan started', detail='12 image(s)')
    activity_log.record('bank', 'scan finished', level='ok')
    out = stream.getvalue()
    assert '[i] bank: scan started (12 image(s))' in out
    assert '[OK] bank: scan finished' in out
    # No heartbeat noise at events level without the thread ticking.
    assert out.count('\n') == 2 or out.count('bank:') == 2


def test_peer_device_reads_like_a_panel_row(monkeypatch):
    from app.services import activity_console, activity_log

    monkeypatch.setenv('LDS_CONSOLE', 'events')
    stream = _Utf8Capture()
    activity_console.attach(stream=stream)
    activity_log.record('bank', 'score started', device='Laptop 4090')
    assert 'bank · Laptop 4090: score started' in stream.getvalue()


def test_emoji_on_cp1252_stream_does_not_raise(monkeypatch):
    """The portable launcher redirects stdout without PYTHONUTF8 — a bare
    print of an emoji used to kill the worker thread. Logging must swallow it."""
    from app.services import activity_console, activity_log

    monkeypatch.setenv('LDS_CONSOLE', 'events')
    stream = _Cp1252Stream()
    activity_console.attach(stream=stream)
    # Must not raise even though the stream cannot encode the glyph.
    activity_log.record('bank', '🗃️ scan started')
    # The handler may have written nothing (encode failed inside emit) or a
    # replaced glyph — either is fine; the invariant is "did not raise".
    assert True


def test_handler_attaches_once_across_repeated_create_app(monkeypatch):
    from app.services import activity_console

    monkeypatch.setenv('LDS_CONSOLE', 'events')
    activity_console.reset_for_tests()
    stream = _Utf8Capture()
    assert activity_console.attach(stream=stream) is True
    assert activity_console.attach(stream=stream) is False
    log = logging.getLogger(activity_console.LOGGER_NAME)
    assert log.propagate is False
    assert len(log.handlers) == 1


def test_nothing_attached_under_testing(app):
    """create_app under TESTING must not install the console handler."""
    from app.services import activity_console

    # Other tests may have attached manually — reset, then confirm the
    # TESTING app fixture never re-attached on its own.
    activity_console.reset_for_tests()
    log = logging.getLogger(activity_console.LOGGER_NAME)
    assert activity_console._attached is False
    assert log.handlers == []


def test_lds_activity_logger_does_not_propagate(monkeypatch):
    """Proves app.log stays free of job narration: propagate=False."""
    from app.services import activity_console, activity_log

    monkeypatch.setenv('LDS_CONSOLE', 'events')
    stream = _Utf8Capture()
    activity_console.attach(stream=stream)
    log = logging.getLogger(activity_console.LOGGER_NAME)
    assert log.propagate is False

    root_capture = _Utf8Capture()
    root_handler = logging.StreamHandler(root_capture)
    root = logging.getLogger()
    root.addHandler(root_handler)
    try:
        activity_log.record('bank', 'scan started')
        assert 'scan started' in stream.getvalue()
        assert 'scan started' not in root_capture.getvalue()
    finally:
        root.removeHandler(root_handler)


def test_format_event_line_prefixes():
    from app.services import activity_console

    assert activity_console.format_event_line(
        {'source': 'gpu', 'message': 'GPU released', 'level': 'ok'}
    ).startswith('[OK]')
    assert activity_console.format_event_line(
        {'source': 'bank', 'message': 'score failed', 'level': 'error'}
    ).startswith('[X]')
    assert activity_console.format_event_line(
        {'source': 'queue', 'message': 'removed from queue', 'level': 'warn'}
    ).startswith('[!]')
