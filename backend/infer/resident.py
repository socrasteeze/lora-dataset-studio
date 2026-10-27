"""Serve one infer script for many requests, so its models load once.

The bank queue drains bank after bank, and every pass used to start a fresh
child per bank: a torch/onnxruntime import and a model load each time, for the
same model. While the queue drains, app/services/infer_pool.py starts THIS
harness instead, and it keeps the script imported (and, through model_memo,
its models loaded) between banks.

argv   : resident.py <script>    (only the scripts in RESIDENT_SCRIPTS)
stdin  : one request per line, exactly the JSON the script reads in one-shot mode
per request:
  the script's own stderr progress and stdout result line, unchanged, then
  stderr `[resident] end rc=<n>` and stdout `{"__resident__": "end", "rc": <n>}`

Both streams carry an end marker so the parent can tell where request N's
progress stops and request N+1's begins. Stdin EOF ends the worker. An uncaught
exception ends it too: the parent reports the failed request as it does a
crashed one-shot child, and no later request runs in a process whose state
nobody can vouch for.
"""
import importlib.util
import io
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
from infer_io import claim_result_stream  # noqa: E402
import model_memo  # noqa: E402

# Claimed as the process: stdout -> stderr for library banners, and the offline
# guard installed, exactly as the script would do when run directly. The script
# itself is imported under another name, so its own claim changes nothing.
_OUT = claim_result_stream(__name__)

RESIDENT_SCRIPTS = frozenset({'wd14_infer.py', 'bank_score_infer.py',
                              'face_embed_infer.py', 'pixai_infer.py',
                              'bank_semantic_infer.py', 'watermark_detect_infer.py'})
END_KEY = '__resident__'
END_ERR = '[resident] end'


def _end(rc, exiting=False):
    """Close one request. ``exiting`` tells the parent this process is about to
    end, so it must not hand it the next request."""
    sys.stderr.flush()
    _OUT.flush()
    print(f'{END_ERR} rc={rc}', file=sys.stderr, flush=True)
    print(json.dumps({END_KEY: 'end', 'rc': rc, 'exiting': exiting}), file=_OUT)
    _OUT.flush()


def _load(script):
    name = os.path.basename(script)
    spec = importlib.util.spec_from_file_location(
        'lds_resident_' + os.path.splitext(name)[0], script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if name == 'pixai_infer.py':
        from pixai_resident import enable
        enable(module)
    return module


def main() -> int:
    script = sys.argv[1] if len(sys.argv) > 1 else ''
    if os.path.basename(script) not in RESIDENT_SCRIPTS:
        print(json.dumps({'ok': False, 'error': f'not a resident script: {script}'}),
              file=_OUT)
        _end(2, exiting=True)
        return 2
    model_memo.ENABLED = True
    try:
        module = _load(script)
    except Exception as e:  # noqa: BLE001 — clean JSON, never a mute traceback
        print(json.dumps({'ok': False, 'error': f'import: {type(e).__name__}: {e}'}),
              file=_OUT)
        _end(1, exiting=True)
        return 1
    stdin = sys.stdin
    for line in stdin:
        if not line.strip():
            continue
        sys.stdin = io.StringIO(line)
        healthy = True
        try:
            rc = module.main()
        except SystemExit as e:
            rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        except BaseException as e:  # noqa: BLE001
            print(json.dumps({'ok': False, 'error': f'{type(e).__name__}: {e}'}),
                  file=_OUT)
            rc = 1
            healthy = False
        finally:
            sys.stdin = stdin
        _end(rc if isinstance(rc, int) else 0, exiting=not healthy)
        if not healthy:
            return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
