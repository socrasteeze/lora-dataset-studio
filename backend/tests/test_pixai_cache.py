"""Synthetic cache identity and caption-preservation regressions. No model required."""
import shutil

import pytest

from app.extensions import db
from app.models import BankImage, ImageBank, PixaiTagCache
from app.services import pixai_cache as cache


def setup_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, 'model_signature', lambda: 'model-one')
    source = tmp_path / 'input.png'
    source.write_bytes(b'synthetic image bytes')
    calls = []

    def infer(paths, _progress):
        calls.append(list(paths))
        return {'ok': True, 'results': {p: {'general': {'smile': .9}} for p in paths},
                'image_facts': {p: {'sha256': cache.fingerprint(p), 'transparent': False}
                                for p in paths}, 'errors': {}}
    return source, infer, calls


def test_identical_copy_reuses_scores_without_changing_caption_or_wd14(app, monkeypatch, tmp_path):
    source, infer, calls = setup_cache(monkeypatch, tmp_path)
    target = tmp_path / 'copy.png'
    shutil.copyfile(source, target)
    with app.app_context():
        bank = ImageBank(name='Synthetic', source_path=str(tmp_path))
        db.session.add(bank)
        db.session.flush()
        row = BankImage(bank_id=bank.id, relpath='input.png', caption='invented caption',
                        caption_origin='asserted', tags='invented WD14 data')
        db.session.add(row)
        db.session.commit()
        before = cache.caption_images([str(source)], infer)
        after = cache.caption_images([str(target)], infer)
        assert len(calls) == 1
        assert after['stats']['cache_hits'] == 1
        assert after['results'][str(target)] == before['results'][str(source)]
        db.session.expire_all()
        assert row.caption == 'invented caption'
        assert row.caption_origin == 'asserted'
        assert row.tags == 'invented WD14 data'


def test_changed_image_bytes_require_new_inference(app, monkeypatch, tmp_path):
    source, infer, calls = setup_cache(monkeypatch, tmp_path)
    with app.app_context():
        cache.caption_images([str(source)], infer)
        source.write_bytes(b'different synthetic bytes')
        result = cache.caption_images([str(source)], infer)
        assert len(calls) == 2
        assert result['stats']['cache_hits'] == 0


def test_changed_model_requires_new_inference(app, monkeypatch, tmp_path):
    source, infer, calls = setup_cache(monkeypatch, tmp_path)
    with app.app_context():
        cache.caption_images([str(source)], infer)
        monkeypatch.setattr(cache, 'model_signature', lambda: 'model-two')
        result = cache.caption_images([str(source)], infer)
        assert len(calls) == 2
        assert result['stats']['cache_hits'] == 0


def test_changed_source_during_inference_is_not_cached(app, monkeypatch, tmp_path):
    source, infer, _calls = setup_cache(monkeypatch, tmp_path)

    def changing(paths, progress):
        result = infer(paths, progress)
        source.write_bytes(b'replaced synthetic bytes')
        return result
    with app.app_context():
        result = cache.caption_images([str(source)], changing)
        assert not result['results']
        assert str(source) in result['errors']
        assert PixaiTagCache.query.count() == 0


def test_changed_model_during_inference_is_not_cached(app, monkeypatch, tmp_path):
    source, infer, _calls = setup_cache(monkeypatch, tmp_path)

    def changing(paths, progress):
        result = infer(paths, progress)
        monkeypatch.setattr(cache, 'model_signature', lambda: 'model-two')
        return result
    with app.app_context(), pytest.raises(RuntimeError, match='PixAI changed'):
        cache.caption_images([str(source)], changing)
    with app.app_context():
        assert PixaiTagCache.query.count() == 0


def test_cancel_before_cache_lookup_does_not_start_inference(app, monkeypatch, tmp_path):
    source, infer, calls = setup_cache(monkeypatch, tmp_path)
    with app.app_context():
        result = cache.caption_images([str(source)], infer, should_stop=lambda: True)
        assert result['cancelled'] is True
        assert calls == []


def test_independent_receipt_proves_only_the_same_bytes(app):
    import json
    with app.app_context():
        db.session.add(PixaiTagCache(key='synthetic-key', payload=json.dumps({
            'image_facts': {'sha256': 'a' * 64}})))
        db.session.commit()
        assert cache.proves_image('synthetic-key', 'a' * 64)
        assert not cache.proves_image('synthetic-key', 'b' * 64)
        assert not cache.proves_image('absent', 'a' * 64)


def test_each_image_is_read_twice_not_four_times(app, monkeypatch, tmp_path):
    """A miss is hashed for the lookup and once more before it is cached; a hit
    for the lookup and the final check. Big Banks paid two extra full reads."""
    import hashlib
    source, _infer, _calls = setup_cache(monkeypatch, tmp_path)
    reads = []
    real = cache.content_fingerprint_path
    monkeypatch.setattr(cache, 'content_fingerprint_path',
                        lambda path: reads.append(path) or real(path))

    def infer(paths, _progress):
        # The worker hashes the bytes it decoded itself; that read is not ours.
        return {'ok': True, 'results': {p: {'general': {'smile': .9}} for p in paths},
                'image_facts': {p: {'sha256': hashlib.sha256(open(p, 'rb').read()).hexdigest()}
                                for p in paths}, 'errors': {}}
    with app.app_context():
        miss = cache.caption_images([str(source)], infer)
        assert miss['stats']['cache_misses'] == 1 and miss['cache_keys']
        assert len(reads) == 2
        reads.clear()
        hit = cache.caption_images([str(source)], infer)
        assert hit['stats']['cache_hits'] == 1 and hit['cache_keys']
        assert len(reads) == 2
