"""🏷️ WD14 tagger — the image bank's Tags pass.

WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT.

This is a CLASSIFIER, not a captioner. It runs SmilingWolf's WD14 ONNX model
(~400 MB) and answers one question per image: which of ~10 000 booru tags apply,
each with a confidence. `blonde_hair 0.98, shirt 0.91, outdoors 0.72`. It does
not write a sentence, it has no opinion about a trigger word, and it never
touches a caption — its output lives in its own column (BankImage.tags).

That separation is the whole point. Captioning a 9 000-image dump with JoyCaption
or an Ollama vision model costs hours of GPU time, and you have to do it BEFORE
you can tell which images you even want to keep. This pass costs a fraction of
that, runs on a CPU-only machine, and exists to answer the triage question — show
me the blonde ones, drop the ones in a hat — so the expensive captioner only ever
runs on the keepers. Captioning stays exactly what it was; this is what happens
before it.

Runs in the ML interpreter, never in-process: onnxruntime is an optional extra
(requirements-ml.txt) and the Flask venv is not guaranteed to have it. Same
subprocess contract as face_mask.py / face_similarity.py — JSON on stdin, one
JSON line on stdout, progress on stderr.
"""
from __future__ import annotations
import json
import logging
import os
import re
import sys

from .. import config as cfg
from .infer_stream import run_infer_script, stderr_tail

logger = logging.getLogger(__name__)

_SCRIPT = str(cfg.BACKEND_DIR / 'infer' / 'wd14_infer.py')

# --- The model ------------------------------------------------------------------
# SmilingWolf's WD SwinV2 Tagger v3 — the ONE the community standardised on for
# booru tagging, published as a plain ONNX file plus the CSV that names its output
# columns. Both are needed: the .onnx alone emits 10 861 anonymous floats.
#
# MODEL_ID is stored in every tagged row (see the `tags` JSON), so a later model
# swap can be told apart from a re-run of this one. Treat it the way catalog
# labels are treated in CLAUDE.md rule 7: it lands in user databases, so it gets
# an alias path rather than a rename.
MODEL_ID = 'wd-swinv2-tagger-v3'
_HF_REPO = 'SmilingWolf/wd-swinv2-tagger-v3'
_HF_BASE = f'https://huggingface.co/{_HF_REPO}/resolve/main'

# filename -> (url, minimum plausible size in bytes). The size floor is what makes
# an HTML error page or a truncated transfer fail HERE, loudly, instead of at
# `onnxruntime.InferenceSession` with an unreadable protobuf error.
MODEL_FILES = {
    'model.onnx': (f'{_HF_BASE}/model.onnx', 300 * 1024 * 1024),
    'selected_tags.csv': (f'{_HF_BASE}/selected_tags.csv', 100 * 1024),
}

# Confidence bounds. Clamped SERVER-side for the same reason face_mask clamps its
# knobs: a hand-edited config.json or a stale UI must degrade to a usable value,
# never silently tag nothing (threshold 1.0) or everything (threshold 0.0).
THRESHOLD_MIN, THRESHOLD_MAX = 0.05, 0.95

# The four stderr shapes the child prints. Named phases, not just a counter: the
# per-image count lies about the wait when a ~400 MB download and an ONNX session
# load both happen before image 1, and a bar frozen at 0/N reads as a hang.
_PHASE_RE = re.compile(r'\[wd14\] phase=([a-z_]+)')
_COUNT_RE = re.compile(r'\[wd14\] (\d+)/(\d+)')

PHASES = ('starting', 'downloading', 'loading', 'tagging')


def parse_progress_line(line: str) -> dict | None:
    """One stderr line -> a progress record, or None if it says nothing about
    progress. PURE, so the grammar is testable without a subprocess."""
    m = _PHASE_RE.search(line or '')
    if m and m.group(1) in PHASES:
        return {'phase': m.group(1)}
    m = _COUNT_RE.search(line or '')
    if m:
        # Reaching image 1 proves the model is loaded whatever phase line was last
        # seen, so the counter carries the phase — a dropped `phase=tagging` can
        # never leave the UI stuck on "Loading…".
        return {'phase': 'tagging', 'done': int(m.group(1)), 'total': int(m.group(2))}
    return None


def _clamp(value, low, high, fallback):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return fallback
    if v != v:  # NaN
        return fallback
    return max(low, min(high, v))


def threshold() -> float:
    """Configured confidence cut, clamped. 0.35 is the tagger's own default."""
    return _clamp(cfg.get('wd14.threshold'), THRESHOLD_MIN, THRESHOLD_MAX,
                  cfg.defaults()['wd14']['threshold'])


def wd14_python() -> str:
    """Interpreter the tagger runs in: wd14.python > masks.python > sys.executable.

    The masks fallback is not laziness — this capability needs onnxruntime and
    nothing else, which is a strict subset of what rembg and insightface already
    pull in. A user who put those in a dedicated 3.10–3.12 env has a working
    tagger interpreter already, and resolving to sys.executable instead would
    make the app install a second copy of onnxruntime into an env that cannot use
    it. setup_installer._capability_python('wd14') calls THIS function, so the
    install target and the later import cannot drift (issue #24's failure mode)."""
    return cfg.get('wd14.python') or cfg.get('masks.python') or sys.executable


def models_dir() -> str:
    """Where the two model files live. `wd14.models_root` overrides it; the
    default sits under the app's data dir next to the other cached weights."""
    root = (cfg.get('wd14.models_root') or '').strip()
    if root:
        return os.path.join(root, 'wd14')
    return str(cfg.data_dir() / 'models' / 'wd14')


def model_path(name: str) -> str:
    return os.path.join(models_dir(), name)


def missing_model_files() -> list[str]:
    """Names of the model files that are absent or implausibly small. Empty means
    the tagger can run offline right now. Read by capabilities.probe_wd14 — which
    is why a truncated download counts as MISSING rather than present: reporting
    ✓ for a half-downloaded 400 MB file would light up the Tags button for a pass
    that can only die on image 1."""
    out = []
    for name, (_url, min_bytes) in MODEL_FILES.items():
        path = model_path(name)
        try:
            if os.path.getsize(path) < min_bytes:
                out.append(name)
        except OSError:
            out.append(name)
    return out


def is_available() -> bool:
    """Delegated to the probe, never re-derived — the same rule face_mask follows,
    so there is exactly one definition of "the tagger is installed"."""
    from ..capabilities import probe_wd14
    return probe_wd14()['ok']


def uses_gpu() -> bool:
    """Whether a run would take the CUDA execution provider. The CALLER needs this
    before starting: a CUDA run must hold the GPU-exclusive window (unloading
    ComfyUI, blocking a training start) and a CPU run must never hold one. False
    is the common, healthy answer — see capabilities.wd14_gpu_available."""
    from ..capabilities import wd14_gpu_available
    return bool(wd14_gpu_available())


def default_timeout(n_images: int) -> int:
    """Budget for one batch. Scaled with the set for the reason face_similarity
    documents: a timeout returns NO partial results, so a fixed ceiling would
    throw away an hour of work on a big bank. The floor covers the worst first
    run — a ~400 MB download plus a cold ONNX session load — and ~1.5 s/image is
    the honest CPU figure (a CUDA run finishes far inside it)."""
    return max(1800, 600 + int(2 * max(0, n_images)))


def tag_images(image_paths, threshold_value=None, timeout=None,
               on_progress=None) -> dict:
    """Tag `image_paths`. Returns a dict carrying `ok`; on failure it also carries
    a human `error` and an `error_kind` in {unavailable, failed, timeout}.

    The reason is KEPT, not swallowed. face_mask's generation path throws it away
    on purpose because a training export must never be blocked by a missing
    optional model — but this pass has no such fallback: a tag pass that quietly
    yields nothing is indistinguishable from a bank where nothing matched, which
    is exactly how a broken scorer once looked like a green "0/14 done".

    On success: {'ok': True, 'results': {path: {tag: confidence}}, 'model': ...}.
    The FULL model output above the threshold is returned — the caller stores all
    of it so re-thresholding later costs no inference at all.
    """
    images = [p for p in (image_paths or []) if p and os.path.isfile(p)]
    if not images:
        return {'ok': True, 'results': {}, 'model': MODEL_ID}
    thr = _clamp(threshold_value, THRESHOLD_MIN, THRESHOLD_MAX, threshold())
    payload = json.dumps({
        'images': images,
        'threshold': thr,
        'models_dir': models_dir(),
        # The child does the fetching, so it is handed the whole spec rather than
        # a hardcoded copy of it: one place defines which model this is.
        'model_files': {name: {'url': url, 'min_bytes': min_bytes}
                        for name, (url, min_bytes) in MODEL_FILES.items()},
    })
    budget = int(timeout) if timeout else default_timeout(len(images))

    def _on_line(line):
        rec = parse_progress_line(line)
        if rec and on_progress:
            on_progress(rec)

    try:
        stdout, stderr_lines, rc, timed_out = run_infer_script(
            wd14_python(), _SCRIPT, payload, budget, _on_line)
    except OSError as e:
        logger.warning('wd14: could not start the tagger: %s', e)
        return {'ok': False, 'error_kind': 'unavailable',
                'error': f'could not start the tagger: {e}'}
    if timed_out:
        return {'ok': False, 'error_kind': 'timeout',
                'error': f'tagging timed out after {budget}s'}
    line = next((ln for ln in reversed((stdout or '').splitlines())
                 if ln.strip().startswith('{')), '')
    if not line:
        tail = stderr_tail(stderr_lines)
        logger.warning('wd14: no JSON on stdout (rc=%s) stderr=%s', rc, tail)
        return {'ok': False, 'error_kind': 'failed',
                'error': f'the tagger stopped unexpectedly (exit {rc})'
                         + (f': {tail}' if tail else '')}
    try:
        data = json.loads(line)
    except json.JSONDecodeError as e:
        logger.warning('wd14: unreadable output: %s', e)
        return {'ok': False, 'error_kind': 'failed',
                'error': f'unreadable tagger output: {e}'}
    if not data.get('ok'):
        logger.warning('wd14: failed: %s', data.get('error'))
        return {'ok': False, 'error_kind': 'failed',
                'error': str(data.get('error') or 'tagging failed')}
    data.setdefault('model', MODEL_ID)
    data.setdefault('threshold', thr)
    return data


# --- Persistence helpers --------------------------------------------------------
# Pure string/JSON math, no session and no ORM import: the bank pass calls these
# from its worker loop, and the tests exercise them without a database.

def tags_blob(tag_scores: dict, model: str = MODEL_ID,
              threshold_value: float | None = None) -> str:
    """The JSON stored in BankImage.tags. Keeps the FULL scored output, so moving
    the threshold re-filters an already-tagged bank with zero new inference —
    the same read-time-thresholds contract the bank's quality scores follow."""
    scores = {str(k): round(float(v), 4)
              for k, v in sorted((tag_scores or {}).items(),
                                 key=lambda kv: -float(kv[1]))}
    return json.dumps({'model': model,
                       'threshold': float(threshold_value if threshold_value
                                          is not None else threshold()),
                       'tags': scores})


def tags_text(tag_scores) -> str:
    """The denormalised column the tag FILTER reads, as `,tag_a,tag_b,`.

    The leading and trailing commas are load-bearing, not decoration. The filter
    is a SQL `LIKE '%,blonde_hair,%'`, and without the sentinels a search for
    `blonde_hair` would also match `blonde_hair_ribbon` — the exact
    whole-tag-only semantics frontend/src/utils/tagFilter.js already promises for
    booru captions, kept identical here so one word means one thing in both
    places. Empty stays EMPTY (not ',,'): an untagged row must match no filter.
    """
    names = list(tag_scores or {})
    if not names:
        return ''
    return ',' + ','.join(str(n) for n in names) + ','


def parse_tags_blob(blob) -> dict:
    """Stored JSON -> {tag: confidence}. Tolerant by design: a row written by a
    future build, a truncated string or NULL yields {} rather than raising into
    a listing that would otherwise render a whole bank."""
    if not blob:
        return {}
    try:
        data = json.loads(blob)
    except (TypeError, ValueError):
        return {}
    tags = data.get('tags') if isinstance(data, dict) else None
    if not isinstance(tags, dict):
        return {}
    out = {}
    for k, v in tags.items():
        try:
            out[str(k)] = float(v)
        except (TypeError, ValueError):
            continue
    return out
