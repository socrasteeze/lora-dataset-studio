"""The infer scripts' result channel must carry the result and nothing else.

The parents read the last JSON line rather than the whole buffer, so a banner no
longer breaks a pass (test_infer_result_parse.py). This is the other half: the
scripts stop emitting the banner onto that channel at all, so a caller doing the
obvious `json.loads(stdout)` gets a clean buffer. Tolerance is the second line of
defence; this is the first."""
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

INFER_DIR = Path(__file__).resolve().parents[1] / 'infer'
# Support modules, not passes: they answer through their caller.
# `_harness.py` is the same shape as `infer_io.py` here — its `_emit` prints
# via `print(json.dumps(...))`, but it is upstream's shared helper, never
# imported for that call by a fork script (see DIVERGENCE 5 in
# test_infer_harness_contract.py); every actual caller claims its own stream.
NOT_A_PASS = {'bank_image_guard.py', 'infer_io.py', '_harness.py',
              'convert_comfy_zimage_to_diffusers.py'}


@pytest.fixture(autouse=True)
def _isolate_the_claim():
    """The claim is a process-wide global — that is the point in a script, and a
    liability in a suite. Restoring it is not optional: leaving it set pointed a
    later test's result writes at a dead StringIO, and three unrelated tests
    failed only when this file ran before them."""
    had = hasattr(sys, '_lds_result_stream')
    prev = getattr(sys, '_lds_result_stream', None)
    if had:
        del sys._lds_result_stream
    yield
    if had:
        sys._lds_result_stream = prev
    elif hasattr(sys, '_lds_result_stream'):
        del sys._lds_result_stream


def _infer_io():
    """Load it from backend/infer/ without putting that folder on sys.path for
    the whole suite — the scripts there share names with nothing, but a test run
    should not be able to shadow an app module by accident."""
    spec = importlib.util.spec_from_file_location('lds_infer_io',
                                                  INFER_DIR / 'infer_io.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_claim_result_stream_moves_library_prints_to_stderr(monkeypatch):
    import io as _io

    claim_result_stream = _infer_io().claim_result_stream

    fake_out, fake_err = _io.StringIO(), _io.StringIO()
    monkeypatch.setattr(sys, 'stdout', fake_out)
    monkeypatch.setattr(sys, 'stderr', fake_err)

    out = claim_result_stream('__main__')

    assert sys.stdout is fake_err, 'a bare print() must now be progress output'
    print('the result', file=out)
    assert fake_out.getvalue() == 'the result\n', 'the result left the buffer'


def test_importing_a_pass_does_not_steal_stdout_from_its_importer(monkeypatch):
    """The flaw this file exists to prevent. These modules import each other
    (face_embed_infer pulls a helper out of face_score_infer) and the suite
    imports them too. Claiming on IMPORT redirected the importer's stdout for
    the rest of the process — five unrelated tests failed in a full run and
    passed one file at a time, which is the worst way to find out."""
    import io as _io

    claim_result_stream = _infer_io().claim_result_stream

    fake_out, fake_err = _io.StringIO(), _io.StringIO()
    monkeypatch.setattr(sys, 'stdout', fake_out)
    monkeypatch.setattr(sys, 'stderr', fake_err)

    out = claim_result_stream('face_score_infer')

    assert sys.stdout is fake_out, "an import moved the importer's stdout"
    print('result', file=out)
    assert fake_out.getvalue() == 'result\n', 'an imported module lost its result'


def test_claiming_twice_keeps_the_first_real_stdout(monkeypatch):
    """A run where two modules claim must not hand the second one stderr — that
    module would print its result into the void."""
    import io as _io

    claim_result_stream = _infer_io().claim_result_stream

    fake_out, fake_err = _io.StringIO(), _io.StringIO()
    monkeypatch.setattr(sys, 'stdout', fake_out)
    monkeypatch.setattr(sys, 'stderr', fake_err)

    first, second = claim_result_stream(), claim_result_stream()
    print('a', file=first)
    print('b', file=second)

    assert fake_out.getvalue() == 'a\nb\n'
    assert fake_err.getvalue() == ''


def test_a_dependency_banner_really_stays_off_stdout(tmp_path):
    """End to end through a real interpreter — the mechanism, not a mock of it.
    A library prints; the script prints its result; only the result comes out."""
    script = tmp_path / 'pretend_infer.py'
    script.write_text(
        'import json, os, sys\n'
        f'sys.path.insert(0, {str(INFER_DIR)!r})\n'
        'from infer_io import claim_result_stream\n'
        '_OUT = claim_result_stream()\n'
        # exactly what InsightFace does: a bare print, from library code
        'print("Applied providers: [\'CPUExecutionProvider\']")\n'
        'print("set det-size: (640, 640)")\n'
        'print(json.dumps({"ok": True, "results": {}}), file=_OUT)\n',
        encoding='utf-8')

    p = subprocess.run([sys.executable, str(script)], capture_output=True,
                       text=True, timeout=60)

    assert p.stdout.strip() == '{"ok": true, "results": {}}'
    assert 'Applied providers' in p.stderr, 'the banner must survive as progress'


def test_every_pass_prints_its_result_to_the_claimed_stream():
    """A new script (or a new exit branch in an old one) that prints its result
    with a bare `print(json.dumps(...))` puts it back on the polluted channel."""
    offenders = []
    for path in sorted(INFER_DIR.glob('*.py')):
        if path.name in NOT_A_PASS:
            continue
        src = path.read_text(encoding='utf-8')
        if 'print(json.dumps(' not in src:
            continue
        assert 'claim_result_stream(__name__)' in src, (
            f'{path.name} must claim stdout, and only when it IS the process')
        for i, line in enumerate(src.splitlines(), 1):
            if 'print(json.dumps(' in line and 'file=' not in line:
                # a multi-line call carries file=_OUT on a later line
                tail = '\n'.join(src.splitlines()[i - 1:i + 3])
                if 'file=_OUT' not in tail:
                    offenders.append(f'{path.name}:{i}')
    assert not offenders, f'result printed to the polluted stdout: {offenders}'
