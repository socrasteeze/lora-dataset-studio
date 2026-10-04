"""PixAI Tagger v1.0, in the isolated data/envs/pixai interpreter.

stdin  : {"images": [paths...], "models_dir": path, "device": "auto"|"cuda"|"cpu"}
stdout : last line = JSON {"ok", "model", "results": {path: {category: {tag: score}}},
                           "errors": {path: reason}}
Logs -> stderr. ``[pixai] phase=...`` then ``[pixai] i/N``.

The model card's local-folder call is:

    pipeline(model=folder, image_processor=folder, trust_remote_code=True)

``device`` is this app's addition (auto|cuda|cpu). No task name: the card does
not pass one. No threshold argument: the pipeline's per-category defaults stay.

Caption time does not fetch. Hub offline flags are set before transformers is
imported, and ``models_dir`` must already be a directory. There is no
snapshot_download in this file.
"""
from __future__ import annotations

import json
import os
import sys

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_DATASETS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infer_io import claim_result_stream  # noqa: E402

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


def _categories(output):
    """The card returns ``tagger(image)['results']`` with category maps."""
    if isinstance(output, list):
        output = output[0] if output else {}
    if not isinstance(output, dict):
        return {}
    results = output.get('results', output)
    return results if isinstance(results, dict) else {}


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
    _phase('loading')
    try:
        from PIL import Image
        from transformers import pipeline
        tagger = pipeline(
            model=models_dir,
            image_processor=models_dir,
            trust_remote_code=True,
            device=_device_index(request.get('device')),
        )
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 ? the parent surfaces this string
        _fail(f'could not load the local PixAI snapshot: {exc}')
    _phase('tagging')
    results = {}
    errors = {}
    total = len(images)
    for index, path in enumerate(images, 1):
        try:
            with Image.open(path) as image:
                frame = image.convert('RGB')
                results[path] = _categories(tagger(frame))
        except Exception as exc:  # noqa: BLE001 ? one bad file does not kill the batch
            errors[path] = str(exc)
        _log(f'[pixai] {index}/{total}')
    json.dump({'ok': True, 'model': MODEL_ID, 'results': results, 'errors': errors},
              _OUT)
    _OUT.write('\n')
    _OUT.flush()


if __name__ == '__main__':
    main()
