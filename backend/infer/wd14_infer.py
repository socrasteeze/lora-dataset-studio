"""WD14 tagger — SmilingWolf's WD SwinV2 Tagger v3 (ONNX), run by the DEDICATED
ML interpreter (onnxruntime is not guaranteed to be in the Flask venv). Same
subprocess pattern as face_mask_infer.py / face_score_infer.py.

WHAT IT PRODUCES. One `{tag: confidence}` map per image, drawn from the ~10 000
booru tags in selected_tags.csv — `blonde_hair 0.98, shirt 0.91, outdoors 0.72`.
It is a multi-label CLASSIFIER, not a captioner: no sentence, no trigger word,
and nothing here ever writes a caption. The bank stores the map in its own column
and slices a big dump by it (see app/services/wd14_tagger.py for why that is a
different job from captioning).

stdin  : {"images": [paths...], "threshold": float, "models_dir": path,
          "model_files": {name: {"url": str, "min_bytes": int}}}
stdout : last line = JSON {"ok", "results": {path: {tag: conf}}, "ratings": {...},
                           "errors": {path: reason}}
Logs -> stderr.

PROGRESS PROTOCOL (stderr, read by app/services/wd14_tagger.py):
  `[wd14] phase=<name>` then `[wd14] i/N` per image — the same idiom, and here for
  the same reason: the per-image counter alone LIES about the wait. On a first run
  the model is a ~400 MB download and the ONNX session costs seconds to build, all
  of it BEFORE image 1. Phases: `starting` (interpreter + heavy imports),
  `downloading` (a model file is absent), `loading` (InferenceSession), `tagging`
  (the per-image loop).

WHY cv2 AND NOT PILLOW. A dedicated ML interpreter is only guaranteed to hold what
requirements-ml.txt puts there, and Pillow is not part of this capability's set.
cv2 also decodes from BYTES we read ourselves, which is the only unicode-safe way
in on Windows (cv2.imread cannot open a path with non-ASCII characters at all) —
and cv2's native BGR is exactly the channel order this model was trained on, so
the usual RGB->BGR flip is a step we simply never take.
"""
import json
import os
import sys

# Library banners belong on the progress channel, not the result one: a bare
# print() from a dependency landing on stdout ahead of the JSON line has cost a
# completed pass its results before. _OUT is the REAL stdout; sys.stdout now
# points at stderr, so anything a library prints is progress output.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infer_io import claim_result_stream  # noqa: E402
_OUT = claim_result_stream(__name__)

# selected_tags.csv's `category` column. 9 = the four mutually-exclusive content
# ratings, 0 = general descriptive tags (the ones triage actually filters on),
# 4 = character names. Kept apart because they answer different questions and
# mixing them makes a facet list unreadable.
_CAT_RATING = 9
_CAT_GENERAL = 0
_CAT_CHARACTER = 4

# Images per forward pass. The model's batch axis is dynamic, and batching is
# most of the speed on CPU; 8 keeps peak memory modest (8 x 448 x 448 x 3 x 4 B
# ~ 19 MB of input) on the small machines this pass exists to serve.
_BATCH = 8

_DOWNLOAD_TIMEOUT = 120


def _log(msg):
    print(msg, file=sys.stderr, flush=True)


def _phase(name):
    """Announce a named stage. Unbuffered: a phase line that arrives after the
    phase is over is worse than none."""
    _log(f'[wd14] phase={name}')


def _fetch(url, dest, min_bytes):
    """Download one model file to `dest`. Lands as .part and is renamed only once
    it is complete and plausibly sized, so an interrupted run can never leave
    something that LOOKS like a model — every readiness check downstream trusts
    the file's presence, so a truncated file here would poison all of them."""
    import urllib.request
    part = dest + '.part'
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(url, timeout=_DOWNLOAD_TIMEOUT) as resp:
        total = int(resp.headers.get('content-length') or 0)
        done = 0
        next_mark = 0
        with open(part, 'wb') as fh:
            while True:
                chunk = resp.read(4 * 1024 * 1024)
                if not chunk:
                    break
                fh.write(chunk)
                done += len(chunk)
                if done >= next_mark:
                    pct = f' ({done * 100 // total}%)' if total else ''
                    _log(f'[wd14] {os.path.basename(dest)} '
                         f'{done / 1e6:.0f}/{total / 1e6:.0f} MB{pct}')
                    next_mark = done + 50 * 1024 * 1024
    if done < min_bytes:
        os.remove(part)
        raise RuntimeError(
            f'{os.path.basename(dest)} downloaded as only {done} bytes — that is '
            'not the model (the host most likely returned an error page)')
    os.replace(part, dest)


def _ensure_models(models_dir, model_files):
    """Make sure both model files are on disk, fetching what is missing. Returns
    True when anything had to be downloaded, so the caller can name the phase
    BEFORE it starts rather than explaining a five-minute wait afterwards."""
    needed = []
    for name, spec in (model_files or {}).items():
        path = os.path.join(models_dir, name)
        try:
            if os.path.getsize(path) >= int(spec.get('min_bytes') or 0):
                continue
        except OSError:
            pass
        needed.append((name, spec))
    if not needed:
        return False
    _phase('downloading')
    for name, spec in needed:
        _log(f"[wd14] fetching {name}")
        _fetch(spec['url'], os.path.join(models_dir, name),
               int(spec.get('min_bytes') or 0))
    return True


def _load_tags(csv_path):
    """selected_tags.csv -> (names, categories), index-aligned with the model's
    output columns. Order is the file's order and must not be sorted: column i of
    the model IS row i of this file, and a reordering would silently relabel every
    tag in the app."""
    import csv
    names, cats = [], []
    with open(csv_path, newline='', encoding='utf-8') as fh:
        for row in csv.DictReader(fh):
            names.append((row.get('name') or '').strip())
            try:
                cats.append(int(row.get('category')))
            except (TypeError, ValueError):
                cats.append(_CAT_GENERAL)
    return names, cats


def preprocess(img, size):
    """One decoded BGR image -> the model's input tensor for that image.

    Pad to a SQUARE with WHITE first, then resize. Both details are the model's,
    not ours: it was trained on white-padded squares, and cropping to square
    instead would throw away the edges of a portrait — which on a bank of tall
    phone photos is exactly where the clothing is.
    """
    import cv2
    import numpy as np
    if img.ndim == 2:                                   # greyscale
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:                             # composite alpha on white
        alpha = img[:, :, 3:4].astype(np.float32) / 255.0
        img = (img[:, :, :3].astype(np.float32) * alpha
               + 255.0 * (1.0 - alpha)).astype(np.uint8)
    h, w = img.shape[:2]
    side = max(h, w)
    top, left = (side - h) // 2, (side - w) // 2
    img = cv2.copyMakeBorder(img, top, side - h - top, left, side - w - left,
                             cv2.BORDER_CONSTANT, value=(255, 255, 255))
    # INTER_AREA is the correct kernel when shrinking (almost always here) and
    # avoids the aliasing INTER_CUBIC introduces on a big downscale.
    interp = cv2.INTER_AREA if side > size else cv2.INTER_CUBIC
    img = cv2.resize(img, (size, size), interpolation=interp)
    # 0..255 floats, NOT normalised — this model folds the scaling into itself.
    return img.astype(np.float32)


def _read_image(path):
    """Decode from bytes we read ourselves. cv2.imread cannot open a non-ASCII
    path on Windows, and a bank is full of names it did not choose."""
    import cv2
    import numpy as np
    with open(path, 'rb') as fh:
        data = fh.read()
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
        images = payload.get('images') or []
        threshold = float(payload.get('threshold') or 0.35)
        models_dir = payload.get('models_dir') or ''
        model_files = payload.get('model_files') or {}
    except Exception as e:  # noqa: BLE001 — must exit as clean JSON, never a mute traceback
        print(json.dumps({"ok": False, "error": f"payload: {e}"}), file=_OUT)
        return 1
    if not models_dir:
        print(json.dumps({"ok": False, "error": "no models_dir given"}), file=_OUT)
        return 1

    # First line out of the child: everything above is microseconds, everything
    # below is seconds to minutes.
    _phase('starting')
    try:
        import cv2  # noqa: F401 — used by the helpers above
        import numpy as np
        import onnxruntime
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"import: {type(e).__name__}: {e}"}), file=_OUT)
        return 1

    try:
        _ensure_models(models_dir, model_files)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"model download failed: {e}"}), file=_OUT)
        return 1

    _phase('loading')
    try:
        names, cats = _load_tags(os.path.join(models_dir, 'selected_tags.csv'))
        available = onnxruntime.get_available_providers()
        # CUDA when the runtime really has it, CPU otherwise. CPU is a supported,
        # expected path here — the parent already decided whether to hold the GPU
        # window based on the same provider list, so the two cannot disagree.
        providers = (['CUDAExecutionProvider', 'CPUExecutionProvider']
                     if 'CUDAExecutionProvider' in available else ['CPUExecutionProvider'])
        session = onnxruntime.InferenceSession(
            os.path.join(models_dir, 'model.onnx'), providers=providers)
        inp = session.get_inputs()[0]
        size = int(inp.shape[1])
        input_name = inp.name
        output_name = session.get_outputs()[0].name
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"model load failed: {type(e).__name__}: {e}"}),
              file=_OUT)
        return 1
    _log(f'[wd14] provider={session.get_providers()[0]} input={size}x{size} tags={len(names)}')

    results, ratings, errors = {}, {}, {}
    total = len(images)
    _phase('tagging')
    done = 0
    for start in range(0, total, _BATCH):
        chunk = images[start:start + _BATCH]
        batch, kept = [], []
        for p in chunk:
            try:
                img = _read_image(p)
                if img is None:
                    raise ValueError('unreadable')
                batch.append(preprocess(img, size))
                kept.append(p)
            except Exception as e:  # noqa: BLE001 — one bad file must not kill the pass
                errors[p] = str(e)
                done += 1
                _log(f'[wd14] {done}/{total} ERROR {e}')
        if not batch:
            continue
        try:
            probs = session.run([output_name], {input_name: np.stack(batch)})[0]
        except Exception as e:  # noqa: BLE001 — a failed batch loses that batch, not the run
            for p in kept:
                errors[p] = f'inference failed: {e}'
                done += 1
                _log(f'[wd14] {done}/{total} ERROR {e}')
            continue
        for p, row in zip(kept, probs):
            general, rate = {}, {}
            for i, score in enumerate(row):
                if i >= len(names):
                    break
                s = float(score)
                if cats[i] == _CAT_RATING:
                    # Ratings are reported IN FULL, never thresholded: they are
                    # four mutually-exclusive alternatives, so "none passed the
                    # cut" is not a meaningful answer — the argmax always is.
                    rate[names[i]] = round(s, 4)
                elif s >= threshold and cats[i] in (_CAT_GENERAL, _CAT_CHARACTER):
                    general[names[i]] = round(s, 4)
            results[p] = general
            ratings[p] = rate
            done += 1
            _log(f'[wd14] {done}/{total} tags={len(general)}')
    print(json.dumps({"ok": True, "results": results, "ratings": ratings,
                      "errors": errors}), file=_OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
