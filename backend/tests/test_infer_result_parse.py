"""One parser for what an `infer/*.py` script prints — because the hub and the
peer used to disagree about it, and the peer's stricter reading silently threw
away completed work (see test_peer_worker_infer.py)."""
from app.services.infer_stream import parse_result_json

# What InsightFace really prints on stdout before the result line. Kept short
# and path-free on purpose: the shape is the point, not anyone's disk.
BANNER = (
    "Applied providers: ['CPUExecutionProvider'], with options: {}\n"
    "find model: models/antelopev2/scrfd_10g_bnkps.onnx detection\n"
    "set det-size: (640, 640)\n"
)


def test_a_dependency_banner_before_the_result_does_not_hide_it():
    """The bug, in one line: a healthy faces pass prints a banner first."""
    out = BANNER + '{"ok": true, "results": {"a.png": {"state": "ok"}}}'
    assert parse_result_json(out) == {
        'ok': True, 'results': {'a.png': {'state': 'ok'}}}


def test_the_last_object_wins():
    """joycaption_infer prints one line PER IMAGE and its summary last, so
    first-match would return a single caption instead of the whole pass."""
    out = ('{"i": 1, "caption": "a cat"}\n'
           '{"i": 2, "caption": "a dog"}\n'
           '{"captions": {"a.png": "a cat", "b.png": "a dog"}, "errors": {}}')
    assert parse_result_json(out)['captions'] == {'a.png': 'a cat',
                                                  'b.png': 'a dog'}


def test_no_json_anywhere_is_none_not_an_exception():
    assert parse_result_json(BANNER) is None
    assert parse_result_json('') is None
    assert parse_result_json(None) is None


def test_a_truncated_last_line_falls_back_to_the_last_whole_one():
    out = '{"ok": true, "results": {}}\n{"ok": fal'
    assert parse_result_json(out) == {'ok': True, 'results': {}}


def test_a_bare_list_is_not_a_result():
    """The protocol is an object. A stray JSON array must not be mistaken for
    one, or the callers' .get() would raise instead of reporting."""
    assert parse_result_json('[1, 2, 3]') is None
