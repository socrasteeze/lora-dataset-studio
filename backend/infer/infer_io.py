"""Keep an infer script's RESULT channel clean.

Every `backend/infer/*.py` script speaks the same contract: JSON on stdin, one
JSON result line on stdout, progress on stderr. The scripts honour it. Their
DEPENDENCIES do not — InsightFace announces each model it resolves with a bare
`print()`, so a faces pass that worked perfectly still emitted a dozen banner
lines onto the result channel ahead of its answer.

The parents tolerate that now (`infer_stream.parse_result_json` reads the last
JSON line rather than the whole buffer), but tolerating noise is the second line
of defence, not the first: a caller that does the obvious `json.loads(stdout)` —
which the peer worker did, and which cost a completed face pass its results —
should get a buffer with nothing in it but the result.

So: point `sys.stdout` at stderr for the whole run and print the result to the
REAL stdout. Anything a library prints becomes progress output, which is where it
belonged; nothing else moves.

    from infer_io import claim_result_stream
    _OUT = claim_result_stream(__name__)
    ...
    print(json.dumps({'ok': True, ...}), file=_OUT, flush=True)

`__name__` is not decoration — the redirect happens ONLY when the script is the
process, never when it is imported. These modules are imported by each other
(face_embed_infer pulls a helper out of face_score_infer) and by the test suite,
and a module-level side effect on `sys.stdout` would follow the importer around:
claiming on import took stdout away from pytest and broke five unrelated tests
in a suite that passed one file at a time.
"""
from __future__ import annotations
import sys


class _ResultStream:
    """Writes to the claimed stdout, or to whatever `sys.stdout` is right now.

    Late-bound on purpose. An imported module has claimed nothing, so its writes
    must follow the current stdout — which under pytest is swapped per test."""

    def write(self, s):
        return (getattr(sys, '_lds_result_stream', None) or sys.stdout).write(s)

    def flush(self):
        stream = getattr(sys, '_lds_result_stream', None) or sys.stdout
        return stream.flush()


_STREAM = _ResultStream()


def claim_result_stream(module_name=None):
    """Return the stream to print results to.

    When `module_name` is `'__main__'` (this script IS the process), redirect
    `sys.stdout` to stderr first, so a library's bare `print()` lands on the
    progress channel. Anything else — imported, or an unnamed caller — changes
    no global state. Idempotent either way."""
    if module_name in (None, '__main__') and \
            getattr(sys, '_lds_result_stream', None) is None:
        sys._lds_result_stream = sys.stdout
        sys.stdout = sys.stderr
    return _STREAM
