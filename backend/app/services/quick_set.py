"""Quick set: one or two reference photos become a new training dataset.

The orbit is the H3 reference-to-video graph this app already builds
(`lds_sdk.h3_render.build_workflow`, mode ``ref2va``). Each kept frame is then
reinforced by Qwen-Image-2.1 edit (default) or by the existing Krea 2 Identity
Edit engine. ComfyUI work goes through the image queue, so it shares the same
GPU lock as every other local render. Face scoring and captioning keep the
windows those passes already open.

Nothing here overwrites a dataset. A name that already exists is refused.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import threading
import uuid
from PIL import Image

from .. import config as cfg

logger = logging.getLogger(__name__)

ENGINES = ('qwen21', 'krea2')
FRAMINGS = ('full', 'medium', 'close')
FRAMING_COLUMN = {'full': 'body', 'medium': 'bust', 'close': 'face'}
FRAMING_PHRASE = {'full': 'full body', 'medium': 'medium shot', 'close': 'close-up'}
# Orbit position 0 is the front. The subject turns so the camera next sees
# their right side, then the back, then their left side.
_ANGLE_BANDS = (
    (22.5, 'front view'),
    (67.5, 'three-quarter right view'),
    (112.5, 'side right view'),
    (157.5, 'three-quarter back right view'),
    (202.5, 'back view'),
    (247.5, 'three-quarter back left view'),
    (292.5, 'side left view'),
    (337.5, 'three-quarter left view'),
    (360.0, 'front view'),
)
ORBIT_PROMPT = (
    'A slow full 360-degree turntable orbit of the same person. Neutral standing '
    'pose, arms relaxed, one steady turn until they face the camera again. Keep '
    'the same outfit, hair, and body. Keep the reference background when it is '
    'already plain; otherwise use a plain neutral studio background. No zoom, no '
    'cut, no second person, no text.'
)
QWEN_POSITIVE = (
    'keep exactly the same framing, crop and camera distance as image 1; '
    'same person as image 2; natural skin texture, visible pores, not plastic, '
    'not airbrushed'
)
_TEXT_ENCODER_CANONICAL = 'qwen3vl_8b.safetensors'
_TEXT_ENCODER_TOKENS = ('qwen3vl_8b', 'qwen3_vl_8b', 'qwen3-vl-8b')
_UNET_TOKENS = ('qwen_image_2.1_int8_convrot',)
_VAE_TOKENS = ('texture_fix_vae_for_qwen_image_2.1',)
_DETAIL_TOKENS = ('qwen2.1-detail-fix-2.0', 'qwen2.1-detail-fix')
_TURBO_TOKENS = ('qwen_image_2.1_turbo_lora_avg_rank_178',)
_IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
_DURATION_RE = re.compile(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)')
_JOBS = {}
_LOCK = threading.Lock()


class QuickSetError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = int(status)


class QuickSetCancelled(QuickSetError):
    def __init__(self):
        super().__init__('Stopped.', status=200)


def defaults():
    return dict(cfg.DEFAULTS['quick_set'])


def block():
    stored = cfg.get('quick_set')
    merged = defaults()
    if isinstance(stored, dict):
        merged.update(stored)
    return merged


def even_indices(count, want):
    """Positions spread across ``count`` items, both ends included."""
    count = int(count)
    want = int(want)
    if count <= 0 or want <= 0:
        return []
    if count <= want:
        return list(range(count))
    if want == 1:
        return [0]
    out = []
    seen = set()
    for i in range(want):
        idx = int(round(i * (count - 1) / (want - 1)))
        if idx not in seen:
            seen.add(idx)
            out.append(idx)
    return out


def blur_score(image):
    """Variance of the Laplacian on a small grayscale copy. Flat is near 0."""
    gray = image.convert('L')
    gray.thumbnail((96, 96))
    width, height = gray.size
    if width < 3 or height < 3:
        return 0.0
    px = list(gray.get_flattened_data())

    def at(x, y):
        return px[y * width + x]

    total = 0.0
    total_sq = 0.0
    n = 0
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            lap = (at(x, y - 1) + at(x, y + 1) + at(x - 1, y) + at(x + 1, y)
                   - 4 * at(x, y))
            total += lap
            total_sq += lap * lap
            n += 1
    mean = total / n
    return total_sq / n - mean * mean


def dhash(image):
    """64-bit difference hash. Identical images share a hash."""
    small = image.convert('L').resize((9, 8))
    px = list(small.get_flattened_data())
    bits = 0
    for y in range(8):
        row = y * 9
        for x in range(8):
            bits = (bits << 1) | (1 if px[row + x] > px[row + x + 1] else 0)
    return bits


def hamming(left, right):
    return (int(left) ^ int(right)).bit_count()


def pick_frames(frames, *, sample=45, blur_min=8.0, hash_distance=6):
    """Even sample, then drop blurry frames and near-duplicates.

    ``frames`` is a sequence of ``{index, blur, phash}`` in any order. The
    sample is by list order after sorting on ``index`` (orbit order). A later
    frame within ``hash_distance`` of one already kept is dropped.
    """
    ordered = sorted(frames or [], key=lambda row: int(row['index']))
    chosen = set(even_indices(len(ordered), int(sample)))
    sampled = [ordered[i] for i in range(len(ordered)) if i in chosen]
    sharp = [row for row in sampled if float(row['blur']) >= float(blur_min)]
    kept = []
    seen = []
    for row in sharp:
        digest = int(row['phash'])
        if any(hamming(digest, prev) <= int(hash_distance) for prev in seen):
            continue
        kept.append(row)
        seen.append(digest)
    return kept


def angle_tag(index, total):
    """View tag for one orbit frame. ``index`` is the source frame, not the crop."""
    total = max(1, int(total))
    degrees = (float(index) % total) / total * 360.0
    for limit, label in _ANGLE_BANDS:
        if degrees < limit:
            return label
    return 'front view'


def framing_phrase(framing):
    return FRAMING_PHRASE.get(framing, 'full body')


def assign_framing(position):
    return FRAMINGS[int(position) % len(FRAMINGS)]


def crop_box(width, height, framing, face=None):
    """Pixel box ``(left, top, right, bottom)`` inside the frame.

    ``face`` is ``(x, y, w, h)`` when a face was found. Without one, medium and
    close crops stay centred. ``full`` is the whole frame.
    """
    width = int(width)
    height = int(height)
    if framing == 'full' or width < 2 or height < 2:
        return (0, 0, max(width, 0), max(height, 0))
    if face:
        x, y, fw, fh = (float(v) for v in face)
        cx = x + fw / 2.0
        cy = y + fh / 2.0
        if framing == 'close':
            bw, bh = fw * 2.4, fh * 2.8
        else:
            bw, bh = fw * 3.2, fh * 5.0
    else:
        frac = 0.45 if framing == 'close' else 0.72
        bw, bh = width * frac, height * frac
        cx, cy = width / 2.0, height / 2.0
    bw = max(2.0, min(float(bw), float(width)))
    bh = max(2.0, min(float(bh), float(height)))
    left = max(0, min(int(round(cx - bw / 2.0)), width - 2))
    top = max(0, min(int(round(cy - bh / 2.0)), height - 2))
    right = max(left + 1, min(width, int(round(left + bw))))
    bottom = max(top + 1, min(height, int(round(top + bh))))
    return (left, top, right, bottom)


def output_size(frame_w, frame_h, *, long_side=1536, max_pixels=2_000_000, step=16):
    """Portrait 2:3 lands on 1024x1536. Other aspects keep their ratio, at most 2 MP."""
    frame_w = max(1, int(frame_w))
    frame_h = max(1, int(frame_h))
    step = max(1, int(step))
    long_side = max(step, int(long_side))
    aspect = frame_w / frame_h
    if frame_h >= frame_w:
        height = long_side
        width = max(step, int(round(height * aspect / step)) * step)
    else:
        width = long_side
        height = max(step, int(round((width / aspect) / step)) * step)
    while width * height > int(max_pixels) and (width > step or height > step):
        width = max(step, int(width * 0.9 / step) * step)
        height = max(step, int(height * 0.9 / step) * step)
    return int(width), int(height)


def merge_caption(caption, angle, framing):
    """Caption text plus the view tags. The trigger word is not added here."""
    tags = f'{angle}, {framing_phrase(framing)}'
    text = ' '.join(str(caption or '').split())
    if tags.casefold() in text.casefold():
        return text
    return f'{text}, {tags}' if text else tags


def cull_scored(rows, limit):
    """Highest identity score first. Rows with no face, or no score, are dropped."""
    ranked = []
    for order, row in enumerate(rows or []):
        if row.get('state') == 'no_face':
            continue
        sim = row.get('sim')
        if isinstance(sim, bool) or not isinstance(sim, (int, float)):
            continue
        ranked.append((float(sim), order, row))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    cap = max(0, int(limit))
    return [row for _sim, _order, row in ranked[:cap]]


def build_qwen21_workflow(frame_name, ref_name, prompt, *, unet, clip, vae,
                          detail_lora, width, height, seed, turbo=True,
                          turbo_lora=None, detail_strength=1.0, turbo_strength=1.0,
                          sigmas=None, turbo_cfg=1.0, steps=25, cfg=4.0,
                          sampler='euler', scheduler='simple', clip_type='qwen_image',
                          filename_prefix='quickset'):
    """Qwen-Image-2.1 edit graph. Pure: every loader name is passed in.

    Turbo on chains the turbo LoRA and samples with ``SamplerCustomAdvanced``
    plus ``ManualSigmas``, euler, CFG 1. Turbo off omits that LoRA and uses a
    KSampler at 25 steps, CFG 4, simple scheduler. That off path is untested
    on a live install.
    """
    sigmas = sigmas if sigmas is not None else defaults()['turbo_sigmas']
    model = '4'
    graph = {
        '1': {'class_type': 'UNETLoader',
              'inputs': {'unet_name': unet, 'weight_dtype': 'default'}},
        '2': {'class_type': 'CLIPLoader',
              'inputs': {'clip_name': clip, 'type': clip_type, 'device': 'default'}},
        '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': vae}},
        '4': {'class_type': 'LoraLoaderModelOnly',
              'inputs': {'model': ['1', 0], 'lora_name': detail_lora,
                         'strength_model': float(detail_strength)},
              '_meta': {'title': 'Detail LoRA'}},
        '6': {'class_type': 'LoadImage', 'inputs': {'image': frame_name},
              '_meta': {'title': 'Orbit frame'}},
        '7': {'class_type': 'LoadImage', 'inputs': {'image': ref_name},
              '_meta': {'title': 'Reference'}},
        '8': {'class_type': 'ImageScale',
              'inputs': {'image': ['6', 0], 'upscale_method': 'lanczos',
                         'width': int(width), 'height': int(height),
                         'crop': 'disabled'}},
        '9': {'class_type': 'VAEEncode',
              'inputs': {'pixels': ['8', 0], 'vae': ['3', 0]}},
        '10': {'class_type': 'TextEncodeQwenImageEditPlus',
               'inputs': {'clip': ['2', 0], 'prompt': prompt, 'vae': ['3', 0],
                          'image1': ['8', 0], 'image2': ['7', 0]},
               '_meta': {'title': 'Positive'}},
        '11': {'class_type': 'TextEncodeQwenImageEditPlus',
               'inputs': {'clip': ['2', 0], 'prompt': '', 'vae': ['3', 0],
                          'image1': ['8', 0], 'image2': ['7', 0]},
               '_meta': {'title': 'Negative'}},
        '12': {'class_type': 'FluxKontextMultiReferenceLatentMethod',
               'inputs': {'conditioning': ['10', 0],
                          'reference_latents_method': 'index_timestep_zero'}},
        '13': {'class_type': 'FluxKontextMultiReferenceLatentMethod',
               'inputs': {'conditioning': ['11', 0],
                          'reference_latents_method': 'index_timestep_zero'}},
    }
    if turbo:
        graph['5'] = {
            'class_type': 'LoraLoaderModelOnly',
            'inputs': {'model': ['4', 0], 'lora_name': turbo_lora,
                       'strength_model': float(turbo_strength)},
            '_meta': {'title': 'Turbo LoRA'},
        }
        model = '5'
        graph['14'] = {'class_type': 'RandomNoise',
                       'inputs': {'noise_seed': int(seed)}}
        graph['15'] = {'class_type': 'KSamplerSelect',
                       'inputs': {'sampler_name': sampler}}
        graph['16'] = {'class_type': 'ManualSigmas',
                       'inputs': {'sigmas': str(sigmas)}}
        graph['17'] = {'class_type': 'CFGGuider',
                       'inputs': {'model': [model, 0], 'positive': ['12', 0],
                                  'negative': ['13', 0], 'cfg': float(turbo_cfg)}}
        graph['18'] = {'class_type': 'SamplerCustomAdvanced',
                       'inputs': {'noise': ['14', 0], 'guider': ['17', 0],
                                  'sampler': ['15', 0], 'sigmas': ['16', 0],
                                  'latent_image': ['9', 0]}}
        samples = ['18', 0]
    else:
        graph['14'] = {
            'class_type': 'KSampler',
            'inputs': {'seed': int(seed), 'steps': int(steps), 'cfg': float(cfg),
                       'sampler_name': sampler, 'scheduler': scheduler,
                       'denoise': 1.0, 'model': [model, 0], 'positive': ['12', 0],
                       'negative': ['13', 0], 'latent_image': ['9', 0]},
        }
        samples = ['14', 0]
    graph['19'] = {'class_type': 'VAEDecode',
                   'inputs': {'samples': samples, 'vae': ['3', 0]}}
    graph['20'] = {'class_type': 'SaveImage',
                   'inputs': {'images': ['19', 0], 'filename_prefix': filename_prefix}}
    return graph


def _loader_name(folder, abs_path):
    from . import comfy_model_paths
    target = os.path.abspath(abs_path)
    for root in comfy_model_paths.search_roots(folder):
        base = os.path.abspath(str(root))
        prefix = base.lower() + os.sep
        if target.lower().startswith(prefix):
            return os.path.relpath(target, base)
    return os.path.basename(target)


def _resolve_slot(folder, configured, canonical, tokens, key):
    """Canonical relative name first, then a narrow token. A changed pin that
    is missing is a stop."""
    from . import comfy_model_paths
    pin = str(configured or '').strip()
    shipped = str(canonical or '').strip()
    if pin:
        found = comfy_model_paths.resolve_model_file(folder, pin)
        if found:
            return _loader_name(folder, found)
        if pin != shipped:
            raise QuickSetError(
                f'{key} is set to {os.path.basename(pin)!r}, and that file is not on disk.',
                status=409)
    found = comfy_model_paths.find_model_by_name(
        folder, os.path.basename(shipped or pin), tokens)
    if not found:
        raise QuickSetError(f'Quick set is missing {key}.', status=409)
    return found


def resolve_qwen21(conf=None, *, turbo=True):
    """Loader names for the Qwen 2.1 edit graph, or ``QuickSetError``.

    The turbo LoRA is required only when Turbo is on. The off path does not
    load it.
    """
    conf = conf if conf is not None else block()
    text = str(conf.get('text_encoder') or '').strip()
    names = {
        'unet': _resolve_slot('diffusion_models', conf.get('unet'), conf.get('unet'),
                              _UNET_TOKENS, 'quick_set.unet'),
        'clip': _resolve_slot('text_encoders', text, _TEXT_ENCODER_CANONICAL,
                              _TEXT_ENCODER_TOKENS, 'quick_set.text_encoder'),
        'vae': _resolve_slot('vae', conf.get('vae'), conf.get('vae'),
                             _VAE_TOKENS, 'quick_set.vae'),
        'detail_lora': _resolve_slot('loras', conf.get('detail_lora'), conf.get('detail_lora'),
                                     _DETAIL_TOKENS, 'quick_set.detail_lora'),
    }
    if turbo:
        names['turbo_lora'] = _resolve_slot(
            'loras', conf.get('turbo_lora'), conf.get('turbo_lora'),
            _TURBO_TOKENS, 'quick_set.turbo_lora')
    return names


def orbit_workflow(reference_name, *, seed, frames=None, megapixels=None,
                   accel=None, filename_prefix='qs_orbit'):
    """One H3 reference-to-video orbit. ``reference_name`` is a Comfy input name."""
    from lds_sdk import h3_render
    conf = block()
    built = h3_render.build_workflow(
        prompt=ORBIT_PROMPT,
        mode='ref2va',
        references=[{'kind': 'image', 'name': reference_name}],
        ref_base='official',
        ref_image_size='max',
        frames=conf['h3_frames'] if frames is None else frames,
        megapixels=conf['h3_megapixels'] if megapixels is None else megapixels,
        aspect='portrait',
        accel=(conf.get('h3_accel') if accel is None else accel) or None,
        sage=False,
        seed=seed,
        filename_prefix=filename_prefix,
    )
    return built


def dataset_name_taken(user_id, name):
    from ..models import FaceDataset
    want = str(name or '').strip().casefold()
    if not want:
        return False
    rows = FaceDataset.query.filter_by(user_id=str(user_id)).all()
    return any((row.name or '').strip().casefold() == want for row in rows)


def _as_bool(value, default):
    if value is None or value == '':
        return bool(default)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in ('0', 'false', 'off', 'no')


def _as_int(value, default, low, high, label):
    if value is None or value == '':
        number = int(default)
    else:
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise QuickSetError(f'{label} must be a whole number.') from None
    if number < low or number > high:
        raise QuickSetError(f'{label} must be from {low} to {high}.')
    return number


def validate_fields(user_id, fields, image_count):
    """Check the request before any file is copied or any job starts."""
    fields = fields or {}
    name = str(fields.get('name') or '').strip()
    trigger = str(fields.get('trigger') or '').strip()
    if not name:
        raise QuickSetError('Enter a name.')
    if len(name) > 100:
        raise QuickSetError('Name must be 100 characters or fewer.')
    if not trigger:
        raise QuickSetError('Enter a trigger word.')
    if len(trigger) > 60:
        raise QuickSetError('Trigger word must be 60 characters or fewer.')
    engine = str(fields.get('engine') or 'qwen21').strip().lower()
    if engine not in ENGINES:
        raise QuickSetError('Engine must be qwen21 or krea2.')
    count = _as_int(fields.get('target_count'), block()['target_count'], 1, 120, 'Count')
    if image_count < 1 or image_count > 2:
        raise QuickSetError('Use 1 or 2 images.')
    if dataset_name_taken(user_id, name):
        raise QuickSetError('That name is already a dataset. Choose another name.', status=409)
    return {
        'name': name,
        'trigger': trigger,
        'engine': engine,
        'turbo': _as_bool(fields.get('turbo'), True),
        'target_count': count,
    }


def _image_ok(path):
    ext = os.path.splitext(path)[1].lower()
    if ext not in _IMAGE_EXTS:
        return False
    try:
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        return False


def _copy_inputs(paths, dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    saved = []
    for index, src in enumerate(paths, start=1):
        if not src or not os.path.isfile(src) or not _image_ok(src):
            raise QuickSetError('Each image must be a readable picture.')
        dest = os.path.join(dest_dir, f'ref-{index}.png')
        with Image.open(src) as im:
            im.convert('RGB').save(dest, 'PNG')
        saved.append(dest)
    return saved


def _work_root(job_id):
    return os.path.join(str(cfg.data_dir()), 'quick_set', job_id)


def public_job(job):
    return {
        'id': job['id'],
        'status': job['status'],
        'stage': job['stage'],
        'message': job['message'],
        'done': job['done'],
        'total': job['total'],
        'thumbnails': list(job['thumbnails']),
        'dataset_id': job['dataset_id'],
        'error': job['error'],
    }


def get_job(job_id):
    with _LOCK:
        job = _JOBS.get(str(job_id))
        return public_job(job) if job else None


def thumb_path(job_id, index):
    if not re.fullmatch(r'[0-9a-f]{32}', str(job_id or '')):
        return None
    try:
        index = int(index)
    except (TypeError, ValueError):
        return None
    if index < 0:
        return None
    path = os.path.join(_work_root(job_id), 'thumbs', f'thumb-{index:02d}.jpg')
    root = os.path.abspath(_work_root(job_id))
    full = os.path.abspath(path)
    if not full.startswith(root + os.sep) or not os.path.isfile(full):
        return None
    return full


def start(user_id, fields, image_paths):
    """Copy the references, refuse a taken name, and start the background job."""
    spec = validate_fields(user_id, fields, len(image_paths or []))
    job_id = uuid.uuid4().hex
    refs = _copy_inputs(image_paths, os.path.join(_work_root(job_id), 'in'))
    job = {
        'id': job_id,
        'status': 'running',
        'stage': 'orbit',
        'message': 'Rendering the orbit.',
        'done': 0,
        'total': 0,
        'thumbnails': [],
        'dataset_id': None,
        'error': None,
        'cancel': False,
        'comfy_job': None,
        'user_id': str(user_id),
        'spec': spec,
        'refs': refs,
    }
    with _LOCK:
        _JOBS[job_id] = job
    from flask import current_app
    app = current_app._get_current_object()
    threading.Thread(target=_run_safe, args=(app, job_id), daemon=True).start()
    return public_job(job)


def cancel(job_id, user_id):
    with _LOCK:
        job = _JOBS.get(str(job_id))
        if job is None or job['user_id'] != str(user_id):
            return None
        job['cancel'] = True
        comfy_job = job.get('comfy_job')
    if comfy_job:
        from ..job_queue import queue_manager
        try:
            queue_manager.cancel_job(comfy_job, user_id=str(user_id))
        except Exception:
            logger.exception('quick set: cancel of the render failed')
    return get_job(job_id)


def _update(job_id, **fields):
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return
        job.update(fields)


def _cancelled(job_id):
    with _LOCK:
        job = _JOBS.get(job_id)
        return bool(job and job['cancel'])


def _set_comfy(job_id, comfy_job):
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            job['comfy_job'] = comfy_job


def _run_safe(app, job_id):
    with app.app_context():
        try:
            _run(job_id)
        except QuickSetCancelled:
            _update(job_id, status='cancelled', stage='cancelled', message='Stopped.',
                    error=None, comfy_job=None)
        except QuickSetError as exc:
            _update(job_id, status='failed', stage='failed', message=str(exc),
                    error=str(exc), comfy_job=None)
        except Exception:
            logger.exception('quick set: job failed')
            _update(job_id, status='failed', stage='failed',
                    message='Quick set failed. See the server log.',
                    error='Quick set failed. See the server log.', comfy_job=None)
        finally:
            from ..extensions import db
            db.session.remove()


def _check_cancel(job_id):
    if _cancelled(job_id):
        raise QuickSetCancelled()


def _enqueue(user_id, workflow, prompt, timeout_s, staged):
    from ..job_queue import queue_manager
    job_id = str(uuid.uuid4())
    queue_manager.add_job(
        job_type='image', user_id=str(user_id), workflow_data=workflow,
        prompt=prompt or '', job_id=job_id,
        metadata={'is_quick_set': True, 'processing_timeout_seconds': int(timeout_s),
                  'staged_inputs': list(staged or [])})
    return job_id


def _wait_comfy(owner_id, comfy_job, timeout_s):
    import time
    from ..extensions import db
    from ..models import ImageGenerationQueue
    deadline = time.monotonic() + max(1, int(timeout_s))
    while True:
        if _cancelled(owner_id):
            from ..job_queue import queue_manager
            queue_manager.cancel_job(comfy_job)
            raise QuickSetCancelled()
        db.session.rollback()
        row = ImageGenerationQueue.query.filter_by(job_id=comfy_job).first()
        if row is not None and row.status in (
                'completed', 'failed', 'cancelled', 'stalled', 'cancel_requested'):
            if row.status != 'completed':
                detail = row.error_message or 'The render failed.'
                raise QuickSetError(detail, status=502)
            return row.result_filename
        if time.monotonic() >= deadline:
            from ..job_queue import queue_manager
            queue_manager.cancel_job(comfy_job)
            raise QuickSetError('The render timed out.', status=504)
        time.sleep(0.5)


def _take_output(filename):
    from .face_dataset_service import _comfy_output_dir
    from ..utils.comfyui import fetch_output_image_bytes
    if not filename:
        return None
    out_dir = _comfy_output_dir()
    src = os.path.join(out_dir, filename) if out_dir else None
    if src and os.path.isfile(src):
        with open(src, 'rb') as handle:
            data = handle.read()
        try:
            os.remove(src)
        except OSError:
            pass
        if data:
            return data
    return fetch_output_image_bytes(filename)


def _duration_seconds(ffmpeg, path):
    proc = subprocess.run([ffmpeg, '-hide_banner', '-i', path],
                          capture_output=True, text=True, timeout=60)
    match = _DURATION_RE.search(proc.stderr or '')
    if not match:
        return 0.0
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def _extract_frames(video_path, dest_dir, count):
    from .ffmpeg_tools import ffmpeg_path
    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        raise QuickSetError(
            'ffmpeg is not available. Install the video tools, then run Quick set again.',
            status=503)
    duration = _duration_seconds(ffmpeg, video_path)
    if duration <= 0:
        raise QuickSetError('The orbit video has no duration.', status=502)
    os.makedirs(dest_dir, exist_ok=True)
    rate = max(1, int(count)) / duration
    pattern = os.path.join(dest_dir, 'frame_%03d.png')
    proc = subprocess.run(
        [ffmpeg, '-y', '-i', video_path, '-vf', f'fps={rate:.8f}', '-vsync', 'vfr', pattern],
        capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise QuickSetError('Could not read frames from the orbit video.', status=502)
    return sorted(
        os.path.join(dest_dir, name) for name in os.listdir(dest_dir)
        if name.startswith('frame_') and name.endswith('.png'))


def _input_dir():
    from ..utils import comfy_fs
    folder = cfg.comfyui_dir('input')
    if not folder:
        raise QuickSetError('ComfyUI is not configured.', status=409)
    return comfy_fs.ensure_input_usable(str(folder))


def _save_thumb(job_id, image, index):
    folder = os.path.join(_work_root(job_id), 'thumbs')
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'thumb-{index:02d}.jpg')
    copy = image.convert('RGB')
    copy.thumbnail((256, 256))
    copy.save(path, 'JPEG', quality=80)
    url = f'/api/quick-set/{job_id}/thumb/{index}'
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            thumbs = list(job['thumbnails'])
            thumbs.append(url)
            job['thumbnails'] = thumbs


def _face_box(score):
    """``bbox`` is x, y, w, h as fractions of the frame. ``bbox_frac`` is only an area."""
    raw = (score or {}).get('bbox')
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        box = tuple(float(v) for v in raw)
    except (TypeError, ValueError):
        return None
    if min(box) < 0 or max(box) > 1.5:
        return None
    return box


def _run(job_id):
    with _LOCK:
        job = _JOBS[job_id]
        user_id = job['user_id']
        spec = dict(job['spec'])
        refs = list(job['refs'])
    conf = block()
    _check_cancel(job_id)
    video = _render_orbit(job_id, user_id, refs[0])
    _check_cancel(job_id)
    _update(job_id, stage='frames', message='Picking frames.', done=0, total=0)
    crops = _pick_and_crop(job_id, video, refs, conf)
    if not crops:
        raise QuickSetError('No sharp frame survived the orbit.', status=422)
    _check_cancel(job_id)
    rendered = _reinforce(job_id, user_id, spec, refs[0], crops, conf)
    if not rendered:
        raise QuickSetError('Every frame failed to render.', status=502)
    _check_cancel(job_id)
    _update(job_id, stage='cull', message='Scoring identity.')
    kept = _cull(refs, rendered, spec['target_count'])
    if not kept:
        raise QuickSetError('No result kept a face.', status=422)
    _check_cancel(job_id)
    if dataset_name_taken(user_id, spec['name']):
        raise QuickSetError('That name is already a dataset. Choose another name.', status=409)
    _update(job_id, stage='save', message='Saving the dataset.')
    dataset_id = _save_dataset(user_id, spec, kept)
    _check_cancel(job_id)
    _update(job_id, stage='captions', message='Writing captions.', dataset_id=dataset_id)
    _caption(user_id, dataset_id, kept)
    _update(job_id, status='done', stage='done', message='Dataset ready.',
            dataset_id=dataset_id, done=len(kept), total=len(kept), comfy_job=None)


def _render_orbit(job_id, user_id, reference):
    from ..utils import comfy_fs
    input_dir = _input_dir()
    staged_name = f'lds_vref_{uuid.uuid4().hex}.png'
    staged = os.path.basename(comfy_fs.stage_input_image(reference, staged_name, input_dir))
    built = orbit_workflow(staged, seed=uuid.uuid4().int % 1_000_000_000_000,
                           filename_prefix=f'qs_orbit_{job_id[:8]}')
    comfy_job = _enqueue(user_id, built['workflow'], ORBIT_PROMPT, 7200, [staged])
    _set_comfy(job_id, comfy_job)
    filename = _wait_comfy(job_id, comfy_job, 7200)
    _set_comfy(job_id, None)
    data = _take_output(filename)
    if not data:
        raise QuickSetError('The orbit video did not come back.', status=502)
    dest = os.path.join(_work_root(job_id), 'orbit.mp4')
    with open(dest, 'wb') as handle:
        handle.write(data)
    return dest


def _pick_and_crop(job_id, video, refs, conf):
    frames = _extract_frames(video, os.path.join(_work_root(job_id), 'frames'),
                             int(conf['sample_frames']))
    measured = []
    for index, path in enumerate(frames):
        with Image.open(path) as image:
            image.load()
            measured.append({'index': index, 'path': path, 'blur': blur_score(image),
                             'phash': dhash(image), 'width': image.width,
                             'height': image.height})
    kept = pick_frames(measured, sample=int(conf['sample_frames']),
                       blur_min=float(conf['blur_min']),
                       hash_distance=int(conf['hash_distance']))
    total = max(1, len(frames))
    boxes = _reference_boxes(refs, [row['path'] for row in kept])
    crops = []
    folder = os.path.join(_work_root(job_id), 'crops')
    os.makedirs(folder, exist_ok=True)
    for position, row in enumerate(kept):
        framing = assign_framing(position)
        box = boxes.get(row['path'])
        face = None
        if box is not None:
            x, y, w, h = box
            face = (x * row['width'], y * row['height'], w * row['width'], h * row['height'])
        left, top, right, bottom = crop_box(row['width'], row['height'], framing, face)
        dest = os.path.join(folder, f'crop-{position:02d}.png')
        with Image.open(row['path']) as image:
            image.convert('RGB').crop((left, top, right, bottom)).save(dest, 'PNG')
        crops.append({
            'path': dest,
            'framing': framing,
            'angle': angle_tag(row['index'], total),
            'index': row['index'],
        })
    return crops


def _reference_boxes(refs, paths):
    """Best-effort face boxes. A scorer that is not installed leaves crops centred."""
    if not paths:
        return {}
    try:
        from . import face_similarity
        scores, error = face_similarity.score_dataset_faces(refs[0], paths)
    except Exception:
        logger.exception('quick set: frame face boxes failed')
        return {}
    if error or not scores:
        return {}
    boxes = {}
    for path, score in scores.items():
        frac = _face_box(score)
        if frac is not None and score.get('state') != 'no_face':
            boxes[path] = frac
    return boxes


def _reinforce(job_id, user_id, spec, reference, crops, conf):
    _update(job_id, stage='reinforce', message='Reinforcing frames.',
            done=0, total=len(crops))
    rendered = []
    for position, crop in enumerate(crops):
        _check_cancel(job_id)
        _update(job_id, done=position, total=len(crops),
                message=f'Reinforcing {position + 1} of {len(crops)}.')
        try:
            path = _render_one(job_id, user_id, spec, reference, crop, conf, position)
        except QuickSetCancelled:
            raise
        except QuickSetError as exc:
            logger.warning('quick set: frame %s failed: %s', position, exc)
            continue
        rendered.append({**crop, 'path': path})
        with Image.open(path) as image:
            _save_thumb(job_id, image, len(rendered) - 1)
    _update(job_id, done=len(crops), total=len(crops))
    return rendered


def _render_one(job_id, user_id, spec, reference, crop, conf, position):
    from ..utils import comfy_fs
    input_dir = _input_dir()
    if spec['engine'] == 'krea2':
        return _render_krea(job_id, user_id, reference, crop, position)
    names = resolve_qwen21(conf, turbo=bool(spec['turbo']))
    frame_staged = f'edit_source_{uuid.uuid4().hex[:8]}_frame.png'
    ref_staged = f'edit_ref1_{uuid.uuid4().hex[:8]}_ref.png'
    frame_name = os.path.basename(
        comfy_fs.stage_input_image(crop['path'], frame_staged, input_dir))
    ref_name = os.path.basename(
        comfy_fs.stage_input_image(reference, ref_staged, input_dir))
    with Image.open(crop['path']) as image:
        width, height = output_size(
            image.width, image.height, long_side=int(conf['long_side']),
            max_pixels=int(float(conf['max_megapixels']) * 1_000_000))
    graph = build_qwen21_workflow(
        frame_name, ref_name, QWEN_POSITIVE,
        unet=names['unet'], clip=names['clip'], vae=names['vae'],
        detail_lora=names['detail_lora'], turbo_lora=names.get('turbo_lora'),
        width=width, height=height, seed=uuid.uuid4().int % (2 ** 31),
        turbo=bool(spec['turbo']), detail_strength=float(conf['detail_strength']),
        turbo_strength=float(conf['turbo_strength']), sigmas=conf['turbo_sigmas'],
        turbo_cfg=float(conf['turbo_cfg']), steps=int(conf['steps']),
        cfg=float(conf['cfg']), sampler=str(conf['sampler']),
        scheduler=str(conf['scheduler']), clip_type=str(conf['clip_type']),
        filename_prefix=f'qs_out_{job_id[:8]}_{position:02d}')
    comfy_job = _enqueue(user_id, graph, QWEN_POSITIVE, 1800, [frame_name, ref_name])
    _set_comfy(job_id, comfy_job)
    filename = _wait_comfy(job_id, comfy_job, 1800)
    _set_comfy(job_id, None)
    data = _take_output(filename)
    if not data:
        raise QuickSetError('A reinforced frame did not come back.', status=502)
    dest = os.path.join(_work_root(job_id), 'out', f'out-{position:02d}.png')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'wb') as handle:
        handle.write(data)
    return dest


def _render_krea(job_id, user_id, reference, crop, position):
    from . import krea_edit_helper as keh
    comfy_job = keh.enqueue_krea_edit(
        user_id, os.path.basename(crop['path']), QWEN_POSITIVE,
        source_path=crop['path'], extra_ref_paths=[reference],
        extra_metadata={'is_quick_set': True, 'processing_timeout_seconds': 1800})
    _set_comfy(job_id, comfy_job)
    filename = _wait_comfy(job_id, comfy_job, 1800)
    _set_comfy(job_id, None)
    data = _take_output(filename)
    if not data:
        raise QuickSetError('A reinforced frame did not come back.', status=502)
    dest = os.path.join(_work_root(job_id), 'out', f'out-{position:02d}.png')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'wb') as handle:
        handle.write(data)
    return dest


def _best_scores(refs, paths):
    from . import face_similarity
    merged = {path: {'state': 'no_face', 'sim': None} for path in paths}
    any_ok = False
    for ref in refs:
        scores, error = face_similarity.score_dataset_faces(ref, paths)
        if error:
            raise QuickSetError(error.get('detail') or 'Face scoring failed.', status=503)
        any_ok = True
        for path, score in (scores or {}).items():
            current = merged.get(path) or {'state': 'no_face', 'sim': None}
            sim = score.get('sim')
            state = score.get('state')
            if state == 'no_face':
                continue
            if isinstance(sim, (int, float)) and not isinstance(sim, bool):
                if current.get('sim') is None or float(sim) > float(current['sim']):
                    merged[path] = {'state': state, 'sim': float(sim)}
            elif current.get('sim') is None and state:
                merged[path] = {'state': state, 'sim': None}
    if not any_ok:
        raise QuickSetError('Face scoring failed.', status=503)
    return merged


def _cull(refs, rendered, limit):
    scores = _best_scores(refs, [row['path'] for row in rendered])
    rows = []
    for row in rendered:
        score = scores.get(row['path']) or {}
        rows.append({**row, 'sim': score.get('sim'), 'state': score.get('state')})
    return cull_scored(rows, limit)


def _save_dataset(user_id, spec, kept):
    from ..extensions import db
    from ..models import FaceDatasetImage
    from . import face_dataset_service as fds
    from .dataset_storage import ensure_dataset_dir
    ds = fds.create_dataset(user_id, spec['name'], spec['trigger'], kind=None)
    folder = ensure_dataset_dir(ds.id)
    for index, row in enumerate(kept):
        filename = f'{user_id}_quickset_{uuid.uuid4().hex[:8]}.png'
        dest = os.path.join(folder, filename)
        shutil.copy2(row['path'], dest)
        image = FaceDatasetImage(
            dataset_id=ds.id, source='generated', status='keep', filename=filename,
            framing=FRAMING_COLUMN.get(row['framing'], 'unknown'),
            variation_label=f"{row['angle']}, {framing_phrase(row['framing'])}"[:120])
        db.session.add(image)
        row['image_id'] = None
        db.session.flush()
        row['image_id'] = image.id
        row['filename'] = filename
    db.session.commit()
    return ds.id


def _caption(user_id, dataset_id, kept):
    from ..extensions import db
    from ..models import FaceDatasetImage
    from . import face_dataset_service as fds
    try:
        fds.caption_images(user_id, dataset_id)
    except Exception:
        logger.exception('quick set: caption pass failed')
    for row in kept:
        image = db.session.get(FaceDatasetImage, row.get('image_id'))
        if image is None:
            continue
        image.caption = merge_caption(image.caption, row['angle'], row['framing'])
    db.session.commit()
