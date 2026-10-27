"""Profile-local reusable PixAI category maps. Never writes a caption or sidecar."""
from __future__ import annotations

import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path

from ..extensions import db
from ..models import PixaiTagCache
from .bank_transfer_metadata import content_fingerprint_path


@lru_cache(maxsize=4)
def _signature(files):
    digest = hashlib.sha256()
    for path, _size, _mtime, _ctime in files:
        digest.update(Path(path).name.encode('utf-8'))
        with open(path, 'rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
    return digest.hexdigest()


def model_signature():
    from . import pixai_tagger
    root = Path(pixai_tagger.models_dir())
    paths = sorted(p for p in root.rglob('*') if p.is_file()
                   and p.suffix in ('.json', '.py', '.safetensors'))
    if not any(p.suffix == '.safetensors' for p in paths):
        raise RuntimeError('Install PixAI Tagger in Setup before pre-tagging.')
    paths.append(Path(pixai_tagger._SCRIPT))
    files = []
    for path in paths:
        stat = path.stat()
        files.append((str(path), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns))
    signature = _signature(tuple(files))
    # Do not bless a model replaced while its signature was being computed.
    if any((os.stat(path).st_size, os.stat(path).st_mtime_ns, os.stat(path).st_ctime_ns)
           != (size, mtime, ctime) for path, size, mtime, ctime in files):
        raise RuntimeError('PixAI changed during preparation. Run pre-tagging again.')
    return signature


def cache_key(model, fingerprint):
    return hashlib.sha256(f'{model}:{fingerprint}'.encode('ascii')).hexdigest()


def fingerprint(path):
    try:
        return content_fingerprint_path(path)
    except (OSError, ValueError):
        return None


def proves_image(key, image_fingerprint):
    """Whether a Bank receipt independently proves these exact image bytes."""
    if not key or not image_fingerprint:
        return False
    with db.session.no_autoflush:
        row = db.session.get(PixaiTagCache, key)
    if row is None:
        return False
    try:
        payload = json.loads(row.payload)
    except (ValueError, TypeError):
        return False
    facts = payload.get('image_facts') if isinstance(payload, dict) else None
    return isinstance(facts, dict) and facts.get('sha256') == image_fingerprint


def caption_images(paths, infer, *, use_cache=True, on_progress=None, should_stop=None):
    """Reuse raw scores only for identical bytes, weights, config and preprocessing."""
    model = model_signature()
    hashes, keys, results, facts, errors = {}, {}, {}, {}, {}
    misses, verified = [], set()
    for index, path in enumerate(paths):
        if should_stop and should_stop():
            break
        signature = fingerprint(path)
        hashes[path] = signature
        key = cache_key(model, signature) if signature else None
        with db.session.no_autoflush:
            row = db.session.get(PixaiTagCache, key) if use_cache and key else None
        payload = None
        if row:
            try:
                payload = json.loads(row.payload)
            except (ValueError, TypeError):
                pass
        if (isinstance(payload, dict) and isinstance(payload.get('results'), dict)
                and isinstance(payload.get('image_facts'), dict)
                and payload['image_facts'].get('sha256') == signature
                and payload.get('model_signature') == model):
            results[path] = payload['results']
            facts[path] = payload['image_facts']
            keys[path] = key
        else:
            misses.append(path)
        if on_progress and (index + 1) % 32 == 0:
            on_progress({'phase': 'cache', 'done': len(results)})
    hits = len(results)
    stopped = bool(should_stop and should_stop())
    output = {'ok': True, 'results': {}, 'errors': {}, 'image_facts': {}, 'stats': {}}
    if misses and not stopped:
        def progress(rec):
            if on_progress:
                rec = dict(rec)
                if rec.get('done') is not None:
                    rec['done'] += hits
                on_progress(rec)
        output = infer(misses, progress)
        if not output.get('ok'):
            return output
        errors.update(output.get('errors') or {})
        # A changed model must not publish results under its previous identity.
        if model_signature() != model:
            raise RuntimeError('PixAI changed during tagging. Run pre-tagging again.')
        pending = []
        for path, raw in (output.get('results') or {}).items():
            source = (output.get('image_facts') or {}).get(path) or {}
            signature = source.get('sha256')
            if (path not in hashes or not signature or signature != hashes[path]
                    or signature != fingerprint(path)):
                errors[path] = 'Image changed during pre-tagging. Run pre-tagging again.'
                continue
            verified.add(path)
            key = cache_key(model, signature)
            results[path], facts[path], keys[path] = raw, source, key
            pending.append({'key': key, 'payload': json.dumps({
                'model_signature': model, 'results': raw, 'image_facts': source})})
        if pending:
            from sqlalchemy.dialects.sqlite import insert
            # Only this cache table is written. Captions and unrelated ORM edits stay untouched.
            statement = insert(PixaiTagCache)
            with db.engine.begin() as connection:
                connection.execute(statement.on_conflict_do_update(
                    index_elements=['key'], set_={'payload': statement.excluded.payload}), pending)
    # Cache hits also require a final source check before a caller can publish them.
    # Fresh results were hashed again just above; reading them a third time adds nothing.
    if model_signature() != model:
        raise RuntimeError('PixAI changed during tagging. Run pre-tagging again.')
    for path in list(results):
        if path not in verified and fingerprint(path) != facts[path].get('sha256'):
            results.pop(path)
            facts.pop(path)
            keys.pop(path, None)
            errors[path] = 'Image changed during pre-tagging. Run pre-tagging again.'
    output.update(results=results, image_facts=facts, errors=errors, cache_keys=keys,
                  cancelled=stopped or output.get('cancelled', False))
    output['stats'] = dict(output.get('stats') or {}, cache_hits=hits,
                           cache_misses=len(misses), returned=len(results))
    return output
