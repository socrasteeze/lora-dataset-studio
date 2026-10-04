"""PixAI Tagger v1.0 ? booru captions for a dataset, never a bank tag column.

A CLASSIFIER that writes the dataset caption itself when the operator picks the
``pixai`` backend and the caption mode is booru (SDXL's default, or Anima when
they choose booru). It is not WD14: that pass fills BankImage.tags and stays
there. It is not part of Auto. Auto remains JoyCaption, then the local LLM.

The weights live under the app data directory by default.
``pixai.models_root`` replaces the parent only. This module never creates
the snapshot folder and never downloads it. Setup does
both, and only after an explicit click.

The interpreter is ``data/envs/pixai`` (or ``pixai.python`` when that override
is not the app, WD14, or ai-toolkit Python). trust_remote_code runs in that
process against the local folder, with the hub forced offline.
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

_SCRIPT = str(cfg.BACKEND_DIR / 'infer' / 'pixai_infer.py')

# Stored on the pass report. The origin column stores the backend id ``pixai``,
# not this string: renaming a model id in a user database needs an alias.
MODEL_ID = 'pixai-tagger-v1.0'
HF_REPO = 'pixai-labs/pixai-tagger-v1.0'

# The single weights folder. Not data/models, not the ComfyUI junction, not
# the v0.9 ONNX tree Dataset Manager keeps for a different model.
FOLDER_NAME = 'pixai-tagger-v1.0'

CONCEPT_REFUSAL = 'PixAI Tagger does not caption concept datasets.'
PROSE_REFUSAL = (
    'PixAI Tagger only writes booru tag captions. '
    'SDXL uses booru by default; Anima can choose booru. '
    'Prose captioning stays on JoyCaption or the local LLM.'
)
BANK_REFUSAL = (
    'PixAI Tagger writes booru dataset captions only. '
    'It does not describe bank images, and Auto does not switch to it.'
)

DEVICES = ('auto', 'cuda', 'cpu')
_PHASE_RE = re.compile(r'\[pixai\] phase=([a-z_]+)')
_COUNT_RE = re.compile(r'\[pixai\] (\d+)/(\d+)')
PHASES = ('starting', 'loading', 'tagging')


def models_dir() -> str:
    """Absolute snapshot folder. Does not create it.

    Blank ``pixai.models_root`` means the app data directory's ``models``. A set value replaces
    that parent, and the folder name stays ``pixai-tagger-v1.0``.
    """
    root = (cfg.get('pixai.models_root') or '').strip()
    parent = root or str(cfg.data_dir() / 'models')
    return os.path.join(parent, FOLDER_NAME)


def _norm(path: str) -> str:
    return os.path.normcase(os.path.normpath(path or ''))


def _managed_python() -> str:
    env = cfg.data_dir() / 'envs' / 'pixai'
    folder = 'Scripts' if os.name == 'nt' else 'bin'
    exe = 'python.exe' if os.name == 'nt' else 'python'
    return str(env / folder / exe)


def _forbidden_runtime(python: str) -> bool:
    """True when ``python`` is an interpreter this model must not load inside.

    The app venv has no transformers. WD14's interpreter is the ONNX one.
    The ai-toolkit venv is the training environment; a trust_remote_code model
    does not get installed or selected there.
    """
    targets = {_norm(sys.executable)}
    for key in ('wd14.python', 'aitoolkit.python'):
        value = (cfg.get(key) or '').strip()
        if value:
            targets.add(_norm(value))
    root = (cfg.get('aitoolkit.dir') or '').strip()
    if root:
        leaf = os.path.join('venv', 'Scripts' if os.name == 'nt' else 'bin',
                            'python.exe' if os.name == 'nt' else 'python')
        targets.add(_norm(os.path.join(root, leaf)))
    return _norm(python) in targets


def pixai_python() -> str:
    """Isolated interpreter. A forbidden override falls back to data/envs/pixai."""
    managed = _managed_python()
    chosen = (cfg.get('pixai.python') or '').strip()
    if not chosen or _norm(chosen) == _norm(managed) or _forbidden_runtime(chosen):
        return managed
    return chosen


def missing_snapshot(path: str | None = None) -> bool:
    """True unless the local folder has config.json and a weight file.

    A missing directory is missing. This function does not create one, and a
    short or unrelated file does not count as the snapshot.
    """
    root = path or models_dir()
    if not os.path.isfile(os.path.join(root, 'config.json')):
        return True
    try:
        names = os.listdir(root)
    except OSError:
        return True
    for name in names:
        lower = name.lower()
        if lower.endswith('.safetensors') or lower in (
                'pytorch_model.bin', 'model.safetensors.index.json'):
            return False
    return True


def device() -> str:
    """``pixai.device``: auto | cuda | cpu. Anything else reads as auto."""
    value = str(cfg.get('pixai.device') or 'auto').strip().lower()
    return value if value in DEVICES else 'auto'


def concept_refusal(kind) -> str | None:
    """Concept datasets stay on the prose captioner. None when this kind is allowed."""
    if (kind or '').strip().lower() == 'concept':
        return CONCEPT_REFUSAL
    return None


def resolved_mode(train_type, mode=None) -> str:
    """Same default as the dataset caption recipe: SDXL is booru, everything else prose."""
    chosen = (mode or '').strip().lower()
    if chosen:
        return chosen
    family = (train_type or 'zimage').strip().lower()
    return 'booru' if family == 'sdxl' else 'prose'


def include_character_tags(kind) -> bool:
    """Character names are an identity lock on a character dataset.

    Blank kind is character (the column default). Style, and any other
    non-character kind that was not already refused, may keep them.
    """
    return (kind or 'character').strip().lower() != 'character'


def _ordered_tags(scores) -> list[str]:
    if not isinstance(scores, dict):
        return []
    ranked = []
    for key, value in scores.items():
        name = str(key).strip()
        if not name:
            continue
        try:
            score = float(value)
        except (TypeError, ValueError):
            score = 0.0
        ranked.append((-score, name))
    ranked.sort()
    return [name for _score, name in ranked]


def booru_caption(results, *, include_character: bool) -> str:
    """Pipeline ``results`` -> comma-separated booru tags.

    The pipeline already applied its own category thresholds. This does not
    re-threshold. ``general`` always. ``character`` only when asked. Other
    categories (style, copyright, meta, rating) stay out of the caption.
    """
    blob = results if isinstance(results, dict) else {}
    names = _ordered_tags(blob.get('general'))
    if include_character:
        names.extend(_ordered_tags(blob.get('character')))
    seen = []
    for name in names:
        if name not in seen:
            seen.append(name)
    return ', '.join(seen)


def parse_progress_line(line: str) -> dict | None:
    """One stderr line -> a progress record, or None."""
    match = _PHASE_RE.search(line or '')
    if match and match.group(1) in PHASES:
        return {'phase': match.group(1)}
    match = _COUNT_RE.search(line or '')
    if match:
        return {'phase': 'tagging', 'done': int(match.group(1)),
                'total': int(match.group(2))}
    return None


def default_timeout(n_images: int) -> int:
    """Load budget plus a few seconds an image. No download allowance: the
    snapshot has to already be on disk or the pass refuses before it starts."""
    return max(900, 300 + 8 * max(0, n_images))


def _offline_env() -> dict:
    env = os.environ.copy()
    env['HF_HUB_OFFLINE'] = '1'
    env['TRANSFORMERS_OFFLINE'] = '1'
    env['HF_DATASETS_OFFLINE'] = '1'
    env['HF_HUB_DISABLE_TELEMETRY'] = '1'
    return env


def caption_images(image_paths, timeout=None, on_progress=None) -> dict:
    """Tag ``image_paths`` into raw category maps. Does not format or store.

    Success: ``{ok, results: {path: {general, character}}, errors, model}``.
    The pipeline's default thresholds are left alone. An empty path list is a
    success and does not start the interpreter.
    """
    images = [p for p in (image_paths or []) if p and os.path.isfile(p)]
    if not images:
        return {'ok': True, 'results': {}, 'errors': {}, 'model': MODEL_ID}
    if missing_snapshot():
        return {'ok': False, 'error_kind': 'unavailable', 'model': MODEL_ID,
                'error': f'PixAI Tagger weights are not in {models_dir()}'}
    python = pixai_python()
    if not os.path.isfile(python):
        return {'ok': False, 'error_kind': 'unavailable', 'model': MODEL_ID,
                'error': 'PixAI Tagger Python is not installed '
                         f'({_managed_python()})'}
    payload = json.dumps({
        'images': images,
        'models_dir': models_dir(),
        'device': device(),
    })
    budget = int(timeout) if timeout else default_timeout(len(images))

    def _on_line(line):
        rec = parse_progress_line(line)
        if rec and on_progress:
            on_progress(rec)

    try:
        stdout, stderr_lines, rc, timed_out = run_infer_script(
            python, _SCRIPT, payload, budget, _on_line, env=_offline_env())
    except OSError as exc:
        logger.warning('pixai: could not start the tagger: %s', exc)
        return {'ok': False, 'error_kind': 'unavailable', 'model': MODEL_ID,
                'error': f'could not start the tagger: {exc}'}
    if timed_out:
        return {'ok': False, 'error_kind': 'timeout', 'model': MODEL_ID,
                'error': f'tagging timed out after {budget}s'}
    line = next((ln for ln in reversed((stdout or '').splitlines())
                 if ln.strip().startswith('{')), '')
    if not line:
        tail = stderr_tail(stderr_lines)
        logger.warning('pixai: no JSON on stdout (rc=%s) stderr=%s', rc, tail)
        return {'ok': False, 'error_kind': 'failed', 'model': MODEL_ID,
                'error': f'the tagger stopped unexpectedly (exit {rc})'
                         + (f': {tail}' if tail else '')}
    try:
        data = json.loads(line)
    except json.JSONDecodeError as exc:
        logger.warning('pixai: unreadable output: %s', exc)
        return {'ok': False, 'error_kind': 'failed', 'model': MODEL_ID,
                'error': f'unreadable tagger output: {exc}'}
    if not data.get('ok'):
        logger.warning('pixai: failed: %s', data.get('error'))
        return {'ok': False, 'error_kind': 'failed', 'model': MODEL_ID,
                'error': str(data.get('error') or 'tagging failed')}
    data.setdefault('model', MODEL_ID)
    data.setdefault('results', {})
    data.setdefault('errors', {})
    return data
