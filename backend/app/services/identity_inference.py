"""Explicit, CPU-only extraction using prepared local model runtimes."""
from __future__ import annotations

import csv
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from .. import config as cfg
from . import face_models, infer_stream
from .identity_learning import FACE_MODEL


class RecognitionUnavailable(ValueError):
    pass


def extract(items, kind):
    if kind == 'person':
        from .face_similarity import _scoring_python, is_available
        if not is_available() or not face_models._pack_present(face_models.models_root()):
            raise RecognitionUnavailable('Prepare Face Scoring in Setup > Quality Tools.')
        payload = json.dumps({'items': items, 'models_root': face_models.models_root(),
                              'model_key': FACE_MODEL})
        stdout, _, returncode, timeout = infer_stream.run_infer_script(
            _scoring_python(), str(cfg.BACKEND_DIR / 'infer' / 'identity_face_infer.py'),
            payload, max(180, 60+len(items)*15))
        result = infer_stream.parse_result_json(stdout)
        if timeout or returncode or not result or not result.get('ok'):
            raise RecognitionUnavailable('Face recognition failed. Check Setup > Quality Tools.')
        return result.get('results')
    from PIL import Image, ImageOps
    from .clip_image_encoder import ImageEncoder, ImageEncodeError, unavailable_reason
    reason = unavailable_reason()
    if reason:
        raise RecognitionUnavailable('Prepare Bank Scoring in Setup > Quality Tools.')
    # Temporary upright crops belong to the runtime only and have generic names.
    temporary_root = cfg.data_dir() / 'identity' / 'temporary'
    temporary_root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='batch-', dir=temporary_root) as directory:
        paths, positions = [], []
        results = [{'state': 'unreadable', 'subjects': []} for _ in items]
        for position, item in enumerate(items):
            try:
                with Image.open(item['path']) as raw:
                    if raw.width * raw.height > 64*1024*1024:
                        results[position]['state'] = 'too_large'
                        continue
                    image = ImageOps.exif_transpose(raw).convert('RGB')
                    box = item.get('region')
                    if box:
                        x, y, w, h = box
                        image = image.crop((round(x*image.width), round(y*image.height),
                                            round((x+w)*image.width), round((y+h)*image.height)))
                    if min(image.size) < 16:
                        results[position]['state'] = 'too_small'
                        continue
                    target = Path(directory) / f'input-{position:04d}.png'
                    image.save(target, format='PNG')
                paths.append(target)
                positions.append(position)
            except (OSError, ValueError):
                continue
        if not paths:
            return results
        try:
            with ImageEncoder(use_gpu=False) as encoder:
                vectors = encoder.encode(paths)
        except ImageEncodeError:
            raise RecognitionUnavailable('Image recognition failed. Check Setup > Quality Tools.') from None
        for position, vector in zip(positions, vectors):
            if vector is not None:
                results[position] = {'state': 'measured', 'subjects': [{
                    'region': items[position].get('region'), 'vector': vector.tolist()}]}
        return results


def character_tags(paths, engine):
    if engine == 'pixai':
        from . import pixai_tagger
        result = pixai_tagger.caption_images(paths, force_cpu=True)
        if not result.get('ok'):
            raise RecognitionUnavailable('Prepare PixAI Tagger in Setup > Quality Tools.')
        return {path: categories.get('character', {})
                for path, categories in (result.get('results') or {}).items()}
    from . import wd14_tagger
    if not wd14_tagger.is_available() or wd14_tagger.missing_model_files():
        raise RecognitionUnavailable('Prepare WD14 in Setup > Quality Tools.')
    # The CSV and model must be the same prepared package. Never infer a
    # character category from spelling or from a generated training caption.
    with open(wd14_tagger.model_path('selected_tags.csv'), encoding='utf-8') as stream:
        names = {row['name'] for row in csv.DictReader(stream) if row.get('category') == '4'}
    # Identity tagging does not take the GPU from an active training/generation.
    result = wd14_tagger.tag_images(paths, force_cpu=True)
    if not result.get('ok'):
        raise RecognitionUnavailable('Character tagging failed. Check Setup > Quality Tools.')
    return {path: {name: score for name, score in tags.items() if name in names}
            for path, tags in (result.get('results') or {}).items()}
