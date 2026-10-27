"""Resident PixAI adapter: one model and bounded CPU preparation for one GPU lane.

Keep the one-shot worker and its cache identity unchanged. This adapter changes
model lifetime and preparation scheduling, never image transforms or thresholds.
The resident harness serializes requests and the host retains its GPU lease.
"""
from __future__ import annotations

from collections import deque
from concurrent.futures import ThreadPoolExecutor
from functools import wraps
import gc
import importlib
from pathlib import Path

from bank_image_guard import _pillow_bomb_threshold, effective_limits
from pass_resources import prepare_workers


def _model_stamp(folder):
    paths = sorted(p for p in Path(folder).rglob('*') if p.is_file()
                   and p.suffix in ('.py', '.json', '.safetensors'))
    return tuple((str(p), p.stat().st_size, p.stat().st_mtime_ns,
                  p.stat().st_ctime_ns) for p in paths)


def enable(module):
    """Install only inside this dedicated, serial PixAI resident process."""
    import transformers
    factory = transformers.pipeline
    # Resolving this lazy export can replace transformers in sys.modules.
    # Install on the resolved module, which the unchanged worker imports next.
    transformers = importlib.import_module('transformers')
    state = {'key': None, 'pipeline': None, 'loads': 0, 'reused': False}

    @wraps(factory)
    def pipeline(*args, **kwargs):
        key = (repr(args), repr(sorted(kwargs.items())), _model_stamp(kwargs['model']))
        state['reused'] = state['pipeline'] is not None and state['key'] == key
        if not state['reused']:
            # A changed model/device must release the previous model, rather
            # than retaining every configuration until the process exits.
            state['pipeline'] = None
            state['key'] = None
            gc.collect()
            import torch
            if torch.cuda.is_initialized():
                torch.cuda.empty_cache()
            loaded = factory(*args, **kwargs)
            state['pipeline'], state['key'] = loaded, key
            state['loads'] += 1
        return state['pipeline']

    transformers.pipeline = pipeline
    tag_images = module._tag_images
    prepare = module._prepare_image

    @wraps(tag_images)
    def prepared_images(tagger, images, *, device_index, cancel_file=None):
        workers = min(4, prepare_workers()) if device_index >= 0 else 1
        if workers == 1 or len(images) < 2:
            output = tag_images(tagger, images, device_index=device_index,
                                cancel_file=cancel_file)
        else:
            depth = min(8, len(images))
            pending = deque()
            cursor = 0
            pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix='pixai-prepare')
            # Pillow's threshold is process-global. Hold one outer scope until
            # every preparation thread finishes; the unchanged inner guards
            # then need no competing process-global threshold changes.
            with _pillow_bomb_threshold(effective_limits()[1]):
                try:
                    while cursor < depth:
                        path = images[cursor]
                        pending.append((path, pool.submit(prepare, path, tagger)))
                        cursor += 1

                    def prepared(path, _tagger):
                        nonlocal cursor
                        expected, future = pending.popleft()
                        if expected != path:
                            raise RuntimeError('PixAI preparation order changed')
                        if cursor < len(images) and not module._cancelled(cancel_file):
                            next_path = images[cursor]
                            pending.append((next_path, pool.submit(prepare, next_path, tagger)))
                            cursor += 1
                        return future.result()

                    module._prepare_image = prepared
                    output = tag_images(tagger, images, device_index=device_index,
                                        cancel_file=cancel_file)
                finally:
                    module._prepare_image = prepare
                    for _path, future in pending:
                        future.cancel()
                    pool.shutdown(wait=True, cancel_futures=True)
        output['stats'].update(resident=True, model_reused=state['reused'],
                               model_loads=state['loads'], prepare_workers=workers,
                               prefetch_images=min(8, len(images)) if workers > 1 else 1)
        return output

    module._tag_images = prepared_images
