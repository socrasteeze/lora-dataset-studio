"""The ◉ Graph of a VIDEO dataset's local run and its training samples.

The image workspace's lineage renderer is a pure layout over ``{nodes, edges}``.
This fork trains video locally only, so the video answer is deliberately one
local node with checkpoint pills and no rented-pod genealogy. A pill's preview
is the training sample ai-toolkit rendered at that step, not a Studio render.

THE LOCAL NODE. A local video run has no row anywhere (the folder IS the run:
`video_training_local`), so its node borrows a `record_id` that can collide
with nothing a cloud run will ever have — the dataset id, NEGATED. The layout
only ever compares ids for equality and maps them; nothing sorts or ranks them
(the refuter's brief covers this premise).

THE PILL IS A STEP. As everywhere else on this lane: a Wan 2.2 save is two
files at one step, so a pill carries `files` and one download per file, and
`filename`/`download_url` (what the shared renderers read) name its FIRST file
only as a handle — never as "the" file.

SAMPLES. ai-toolkit writes a sample every `sample_every` steps into the run's
`samples/` folder, named `<ts>__<step>_<promptidx>.<ext>`. The EXTENSION is
the model's: Wan 2.2 writes an ANIMATED WEBP (ai-toolkit's SampleConfig forces
`webp` for any multi-frame sample and the Wan 2.2 model does not override it),
MiniMax H3 and LTX write `.mp4`, a stills set writes `.jpg` — verified at the
source by the refuter, 2026-09-03. So `_SAMPLE_RE` accepts them all, and the
POSTER of a sample is always a STILL: ai-toolkit's own `.thumbs/<name>.jpg`
when it wrote one (it does, since mid-2025, next to every sample), else the
first frame — cut by PIL for an animated WebP/GIF, by the video bank's frame
writer (PyAV) for an mp4 — cached under the app's data dir. Serving the
sample itself as its poster was the first version of this file, and on a Wan
graph it made every pill thumbnail download and animate the whole clip.
Samples sit under the local save root.
"""
import json
import logging
import os
import re

from .. import config as cfg
from . import lora_training as lt
from . import video_checkpoints as vck
from . import video_targets
from . import video_training_local as vtl

logger = logging.getLogger(__name__)

# `<timestamp>__<step>_<promptidx>.<ext>` — the image lane's `_SAMPLE_RE` with
# the video containers added. Anything else in the folder is not a sample.
_SAMPLE_RE = re.compile(r'__(\d+)_(\d+)\.(mp4|webm|mov|gif|webp|png|jpe?g)$', re.IGNORECASE)
# Containers a <video> plays (PyAV cuts their first frame)…
_VIDEO_EXTS = ('.mp4', '.webm', '.mov')
# …and animations a browser plays inside an <img> (PIL reads their first frame).
_ANIMATION_EXTS = ('.webp', '.gif')
_POSTER_CACHE = 'video_samples'
# Where ai-toolkit writes its own 300 px poster of every sample it saves.
_AITK_THUMBS = '.thumbs'


def _target_label(profile) -> str | None:
    """The card's variant chip: the target's catalogue LABEL ("Wan 2.2 T2V
    A14B"), not its key ("wan22_14b") — the shared chip uppercases whatever it
    is handed, and a key uppercased is a code, a label uppercased is words."""
    if not profile:
        return None
    try:
        return (video_targets.get(profile) or {}).get('label') or str(profile)
    except Exception:               # an unknown or retired profile key
        return str(profile)


def local_record_id(ds) -> int:
    """The local run's node id: the dataset id negated (see the module doc)."""
    return -int(ds.id)


# ── samples ─────────────────────────────────────────────────────────────────


def samples_dir(ds, run=None) -> str | None:
    """Where the local lane's samples are, or None when it has no folder."""
    if run is not None:                 # DIVERGENCE 4: no rented-pod lane
        return None
    try:
        return os.path.join(str(vtl.save_root(ds)), 'samples')
    except RuntimeError:                # no local trainer configured
        return None


def sample_kind(filename) -> str:
    """'video' (a container a <video> plays), 'animation' (a WebP/GIF a browser
    plays inside an <img>, which is what Wan 2.2's samples are) or 'image'."""
    name = str(filename or '').lower()
    if name.endswith(_VIDEO_EXTS):
        return 'video'
    if name.endswith(_ANIMATION_EXTS):
        return 'animation'
    return 'image'


def list_samples(ds, run=None) -> list:
    """``[{filename, step, prompt_idx, kind}]`` newest step first, then prompt
    order. `kind` tells the client what plays it (see `sample_kind`); the
    poster route serves a STILL for every kind."""
    d = samples_dir(ds, run)
    if not d or not os.path.isdir(d):
        return []
    out = []
    for name in os.listdir(d):
        m = _SAMPLE_RE.search(name)
        if not m:
            continue
        out.append({'filename': name, 'step': int(m.group(1)),
                    'prompt_idx': int(m.group(2)), 'kind': sample_kind(name)})
    out.sort(key=lambda s: (-s['step'], s['prompt_idx']))
    return out


def sample_path(ds, run, filename) -> str | None:
    """Resolve ONE sample by basename through the lane's own listing — a request
    names a file, never a path."""
    if not filename or os.path.basename(filename) != filename:
        return None
    if not any(s['filename'] == filename for s in list_samples(ds, run)):
        return None
    path = os.path.join(samples_dir(ds, run), filename)
    return path if os.path.isfile(path) else None


def _first_frame_still(src, dst) -> bool:
    """The first frame of an animated WebP/GIF as a JPEG, through PIL — no
    PyAV needed for the format Wan 2.2 writes. False on anything unreadable."""
    try:
        from PIL import Image
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with Image.open(src) as im:
            im.seek(0)
            frame = im.convert('RGB')
            frame.thumbnail((480, 480))
            frame.save(dst, 'JPEG', quality=82)
        return True
    except Exception:                       # noqa: BLE001 — any decode error
        return False


def poster_path(ds, run, filename) -> str | None:
    """A STILL of one sample, whatever the sample is: the image itself for an
    image sample; for a clip or an animation, ai-toolkit's own `.thumbs/` jpg
    when it wrote one, else the first frame cut once and cached under the data
    dir (PIL for WebP/GIF, the video bank's PyAV writer for mp4). None when the
    sample is not there or no frame can be cut — the pill then simply shows no
    thumbnail. Never the sample itself for a moving one: a Wan sample is a
    4-17 MB animated WebP, and a thumbnail that IS the clip animates it."""
    from .video_bank_service import _write_thumbnail
    src = sample_path(ds, run, filename)
    if not src:
        return None
    kind = sample_kind(filename)
    if kind == 'image':
        return src
    own = os.path.join(os.path.dirname(src), _AITK_THUMBS, filename + '.jpg')
    if os.path.isfile(own):
        return own
    lane = f'local_{int(ds.id)}'
    cache = cfg.data_dir() / 'cache' / _POSTER_CACHE / lane
    dst = str(cache / (filename + '.jpg'))
    try:
        if os.path.isfile(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            return dst
    except OSError:
        pass
    if kind == 'animation':
        return dst if _first_frame_still(src, dst) else None
    return dst if _write_thumbnail(src, 0.0, dst) else None


def _sample_urls(ds, run, sample) -> dict:
    q = f"filename={sample['filename']}"
    base = f'/api/video-dataset/{int(ds.id)}/train/sample'
    return {'url': f'{base}?{q}', 'poster_url': f'{base}/poster?{q}'}


# ── the tree ────────────────────────────────────────────────────────────────


def _pills(ds, steps, paths, deployed, samples) -> list:
    """One pill per STEP, with the fields the shared renderers read, the
    video lane's own (`files`, `download_urls`) and the previews: the sample
    of prompt 0 at that step as the thumbnail, the count of samples at it."""
    by_step = {}
    for s in samples:
        by_step.setdefault(s['step'], []).append(s)
    out = []
    for s in steps:
        rows = vck._step_rows([s], paths.get, deployed)[0]
        files = rows['files']
        names = [f['filename'] for f in files]
        urls = [f'/api/video-dataset/{ds.id}/train/checkpoint?filename={n}' for n in names]
        at_step = by_step.get(s['step']) if s['step'] is not None else None
        first = min(at_step, key=lambda x: x['prompt_idx']) if at_step else None
        pill = {
            'step': s['step'], 'final': bool(s['final']),
            'filename': names[0] if names else None, 'files': files,
            'download_url': urls[0] if urls else None, 'download_urls': urls,
            'present': bool(names),
            'testable': rows['deployed'],
            'deployed_filename': (files[0]['deployed_as'] if files and rows['deployed'] else None),
            'undeployable': bool(files) and all(f['undeployable'] for f in files),
            'preview_count': len(at_step or []),
        }
        if first is not None:
            pill.update({'preview_status': 'ready', **{k: v for k, v in
                         _sample_urls(ds, None, first).items() if k == 'poster_url'}})
            pill['preview_url'] = pill.pop('poster_url')
            pill['sample_url'] = _sample_urls(ds, None, first)['url']
        else:
            pill['preview_url'] = None
            pill['preview_status'] = None
        out.append(pill)
    return out


def local_total_steps(ds) -> int | None:
    """The step count the local run was launched with, read from the job
    config the launcher wrote (`<jobs_dir>/<run_name>.json`, ai-toolkit's own
    format). None when there is no such file — the final save then keeps
    `step: None` and the label says "Final" without inventing a number."""
    try:
        path = os.path.join(str(lt._jobs_dir()), vtl.local_run_name(ds) + '.json')
        with open(path, encoding='utf-8') as fh:
            job = json.load(fh)
        for proc in (job.get('config') or {}).get('process') or []:
            steps = (proc.get('train') or {}).get('steps')
            if steps:
                return int(steps)
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError):
        return None
    return None


def _local_node(ds, deployed) -> dict | None:
    saves = vck._local_saves(ds)
    if not saves:
        return None
    total = local_total_steps(ds)
    steps = vck._group_saves_by_step(saves, target=total)
    active = bool(vtl.video_training_progress(ds.id, ds.user_id)['active'])
    pills = _pills(ds, steps, saves, deployed, list_samples(ds, None))
    return {
        'record_id': local_record_id(ds), 'run_id': None, 'source': 'local',
        'parent_record_id': None, 'resumed_from': None, 'origin_unknown': False,
        'dataset_id': ds.id, 'dataset_name': ds.name,
        'train_type': 'video', 'variant': _target_label(ds.target_profile),
        'base_model': '', 'version': None, 'steps': total,
        'config': {}, 'note': '', 'has_note': False, 'is_current': False,
        'created_at': None, 'finished_at': None,
        'status': 'training' if active else None, 'active': active,
        'training_mode': 'lora', 'run_name': vtl.local_run_name(ds),
        'checkpoints': pills, 'saves': len(saves), 'checkpoint_ready': bool(pills),
    }


def tree(user_id, dataset_id) -> dict:
    """The local run in the image-lineage shape, or an empty safe shape."""
    ds = vck._dataset(user_id, dataset_id)
    deployed = vck._deployed_index()
    local = _local_node(ds, deployed)
    nodes = [local] if local is not None else []
    return {'root_id': None, 'current_id': None, 'nodes': nodes, 'edges': [],
            'single': True}


def resolve_run(ds, run_id):
    """Resolve only the local lane; numbered rented-pod runs are absent here."""
    if run_id in (None, '', 'local', 'null'):
        return None
    raise LookupError('video training run not found')
