"""PixAI Tagger v1.0, in the isolated data/envs/pixai interpreter.

stdin  : {"images": [paths...], "models_dir": path, "device": "auto"|"cuda"|"cpu",
          "cancel_file": optional local stop sentinel}
stdout : last line = JSON {"ok", "model", "results": {path: {category: {tag: score}}},
                           "errors": {path: reason}, "image_facts", "stats", "cancelled"}
Logs -> stderr. ``[pixai] phase=...`` then ``[pixai] i/N``.

The model card's local-folder call is:

    pipeline(model=folder, image_processor=folder, trust_remote_code=True)

``device`` is this app's addition (auto|cuda|cpu). No task name: the card does
not pass one. No threshold argument: the pipeline's per-category defaults stay.
CUDA starts with four images per batch and backs off on memory pressure. CPU
keeps one image per batch. The prepared processor owns resize, alpha compositing
and normalization. EXIF orientation and source facts come from bounded bytes.

Caption time does not fetch. Hub offline flags are set before transformers is
imported, and ``models_dir`` must already be a directory. There is no
snapshot_download in this file.
"""
from __future__ import annotations

import json
import os
import sys
import gc
import hashlib
import io
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_DATASETS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infer_io import claim_result_stream  # noqa: E402
from bank_image_guard import (  # noqa: E402
    _pillow_bomb_threshold, effective_limits, read_validated_bank_image,
)

_OUT = claim_result_stream(__name__)

MODEL_ID = 'pixai-tagger-v1.0'


def _log(msg):
    print(msg, file=sys.stderr, flush=True)


def _phase(name):
    _log(f'[pixai] phase={name}')


def _fail(error):
    json.dump({'ok': False, 'model': MODEL_ID, 'error': error}, _OUT)
    _OUT.write('\n')
    _OUT.flush()
    raise SystemExit(1)


def _device_index(choice):
    """pipeline(device=) index. cuda refuses a CPU-only interpreter."""
    import torch
    choice = (choice or 'auto').strip().lower()
    if choice == 'cpu':
        return -1
    if choice == 'cuda':
        if not torch.cuda.is_available():
            _fail('GPU tagging is selected, but the PixAI Python has no CUDA. '
                  'Set the PixAI Tagger device to Auto or CPU.')
        return 0
    return 0 if torch.cuda.is_available() else -1


def _cancelled(path):
    return bool(path) and os.path.isfile(path)


def _prepare_image(path, tagger):
    """Decode one bounded snapshot, retain source facts, then keep only its tensor."""
    from PIL import Image, ImageOps

    data = read_validated_bank_image(path)
    with _pillow_bomb_threshold(effective_limits()[1]), Image.open(io.BytesIO(data)) as raw:
        with ImageOps.exif_transpose(raw) as frame:
            facts = {'width': frame.width, 'height': frame.height,
                     'transparent': False, 'sha256': hashlib.sha256(data).hexdigest()}
            if 'A' in frame.getbands() or 'transparency' in frame.info:
                with frame.convert('RGBA') as rgba:
                    with rgba.getchannel('A') as alpha:
                        facts['transparent'] = alpha.getextrema()[0] < 255
            # The prepared local processor owns alpha compositing, resize and
            # normalization. Do not drop alpha or substitute a second transform.
            prepared = tagger.preprocess(frame)
    return prepared, facts


def _infer_batch(tagger, prepared, torch):
    """Use the installed pipeline's public forward path without iterator unbatching."""
    inputs = {'model_input': torch.cat([item['model_input'] for item in prepared], dim=0)}
    output = tagger.forward(inputs)
    rows = output.get('results') if isinstance(output, dict) else None
    if not isinstance(rows, list) or len(rows) != len(prepared):
        raise ValueError('PixAI returned an incomplete image batch')
    if any(not isinstance(row, dict) for row in rows):
        raise ValueError('PixAI returned invalid category maps')
    return rows


def _is_oom(exc):
    text = str(exc).lower()
    return 'out of memory' in text or 'cuda_error_out_of_memory' in text


def _tag_images(tagger, images, *, device_index, cancel_file=None):
    """Bound preparation and CUDA batches; retry smaller batches without losing alignment."""
    import torch

    target = 4 if device_index >= 0 else 1
    results, errors, facts = {}, {}, {}
    index = handled = retries = 0
    stopped = False
    started = time.perf_counter()
    while index < len(images):
        if _cancelled(cancel_file):
            stopped = True
            break
        batch = []
        while index < len(images) and len(batch) < target:
            if _cancelled(cancel_file):
                stopped = True
                break
            path = images[index]
            index += 1
            try:
                prepared, source = _prepare_image(path, tagger)
                batch.append((path, prepared, source))
            except Exception as exc:
                errors[path] = f'Image preparation failed: {type(exc).__name__}'
                handled += 1
                _log(f'[pixai] {handled}/{len(images)}')
        offset = 0
        attempt_size = target
        while offset < len(batch) and not stopped:
            if _cancelled(cancel_file):
                stopped = True
                break
            current = batch[offset:offset + attempt_size]
            failed = None
            try:
                rows = _infer_batch(tagger, [item[1] for item in current], torch)
            except Exception as exc:
                failed = ('GPU memory exhausted' if _is_oom(exc)
                          else f'Tagging failed: {type(exc).__name__}')
            if failed:
                # Exit the exception scope before collecting CUDA tensors from
                # the failed forward pass. Keep precision and thresholds intact.
                gc.collect()
                if device_index >= 0:
                    torch.cuda.empty_cache()
                if len(current) > 1:
                    attempt_size = max(1, len(current) // 2) if failed == 'GPU memory exhausted' else 1
                    if failed == 'GPU memory exhausted':
                        target = min(target, attempt_size)
                    retries += 1
                    _log(f'[pixai] retry batch_size={attempt_size}')
                    continue
                errors[current[0][0]] = failed
            else:
                for (path, _prepared, source), row in zip(current, rows):
                    results[path] = row
                    facts[path] = source
            offset += len(current)
            handled += len(current)
            _log(f'[pixai] {handled}/{len(images)}')
        del batch
        if stopped:
            break
    stats = {'device': 'cuda' if device_index >= 0 else 'cpu',
             'batch_size': target, 'batch_retries': retries,
             'processed': handled, 'seconds': round(time.perf_counter() - started, 3)}
    return {'ok': True, 'model': MODEL_ID, 'results': results, 'errors': errors,
            'image_facts': facts, 'cancelled': stopped, 'stats': stats}


def main():
    _phase('starting')
    try:
        request = json.loads(sys.stdin.read() or '{}')
    except json.JSONDecodeError as exc:
        _fail(f'unreadable request: {exc}')
    models_dir = request.get('models_dir') or ''
    images = [p for p in (request.get('images') or []) if p]
    if not os.path.isdir(models_dir):
        _fail(f'local PixAI snapshot is not on disk: {models_dir}')
    cancel_file = request.get('cancel_file') or None
    if not images or _cancelled(cancel_file):
        json.dump({'ok': True, 'model': MODEL_ID, 'results': {}, 'errors': {},
                   'image_facts': {}, 'cancelled': bool(images)}, _OUT)
        _OUT.write('\n')
        return
    _phase('loading')
    started = time.perf_counter()
    try:
        from transformers import pipeline
        device_index = _device_index(request.get('device'))
        tagger = pipeline(
            model=models_dir,
            image_processor=models_dir,
            trust_remote_code=True,
            device=device_index,
        )
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 ? the parent surfaces this string
        _fail(f'could not load the local PixAI snapshot: {exc}')
    load_seconds = time.perf_counter() - started
    _phase('tagging')
    output = _tag_images(tagger, images, device_index=device_index, cancel_file=cancel_file)
    output['stats']['load_seconds'] = round(load_seconds, 3)
    _log('[pixai] ' + json.dumps(output['stats']))
    json.dump(output, _OUT)
    _OUT.write('\n')
    _OUT.flush()


if __name__ == '__main__':
    main()
