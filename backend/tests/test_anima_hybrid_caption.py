"""PixAI + VLM captions, and Anima Auto using the configured vision model."""
import os

from app.services.pixai_tagger import NOT_INSTALLED


def _kept(svc, ds):
    from app.models import FaceDatasetImage
    folder = svc._dataset_dir(ds.id)
    os.makedirs(folder, exist_ok=True)
    name = 'kept.webp'
    with open(os.path.join(folder, name), 'wb') as fh:
        fh.write(b'not-a-real-image')
    img = FaceDatasetImage(dataset_id=ds.id, source='import', status='keep',
                           filename=name, framing='face')
    svc.db.session.add(img)
    svc.db.session.commit()
    return img


def test_hybrid_joins_normalized_tags_and_one_vlm_line(app, monkeypatch):
    from app.config import LOCAL_USER
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc
    from app.services import pixai_tagger
    from app.services import vision_llm

    seen = {}

    def _tags(paths, **_kw):
        return {'ok': True, 'results': {paths[0]: {
            'general': {'1girl': 0.9, 'blue_eyes': 0.8, 'looking_at_viewer': 0.4,
                        'score_8_up': 0.95, 'gwen_(fortnite)': 0.2},
            'rating': {'safe': 0.7},
        }}, 'errors': {}, 'model': 'pixai-tagger-v1.0'}

    def _describe(_data, prompt, **kw):
        seen['prompt'] = prompt
        seen['model'] = kw.get('model')
        return 'She sits by the window.\nSoft daylight.'

    monkeypatch.setattr(pixai_tagger, 'missing_snapshot', lambda path=None: False)
    monkeypatch.setattr(pixai_tagger, 'caption_images', _tags)
    monkeypatch.setattr(vision_llm, 'describe_image', _describe)
    monkeypatch.setattr(vision_llm, 'unload_vision_model', lambda **_kw: None)
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Hy', 'zchar_hy', train_type='anima')
        img = _kept(svc, ds)
        svc.set_caption_options(LOCAL_USER, ds.id, {'backend': 'pixai_hybrid'})
        n = svc.caption_images(LOCAL_USER, ds.id, report={})
        row = svc.db.session.get(FaceDatasetImage, img.id)
        assert n == 1
        assert row.caption_origin == 'pixai_hybrid'
        assert '\n' not in row.caption
        assert row.caption == (
            'score_8_up, safe, 1girl, looking at viewer, gwen \\(fortnite\\). '
            'She sits by the window. Soft daylight.'
        )
        assert 'zchar_hy' not in row.caption
        assert 'blue eyes' not in row.caption
        assert 'Tags detected:' in seen['prompt']
        assert 'character trigger' in seen['prompt']
        assert seen['model'] == 'huihui_ai/qwen3-vl-abliterated:8b-instruct'


def test_hybrid_refuses_when_the_weights_are_missing(app, monkeypatch):
    from app.config import LOCAL_USER
    from app.services import face_dataset_service as svc
    from app.services import vision_llm

    def _no_vision(*_a, **_k):
        raise AssertionError('vision model ran without PixAI weights')

    monkeypatch.setattr(vision_llm, 'describe_image', _no_vision)
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Miss', 'zchar_miss', train_type='anima')
        _kept(svc, ds)
        svc.set_caption_options(LOCAL_USER, ds.id, {'backend': 'pixai_hybrid'})
        try:
            svc.caption_images(LOCAL_USER, ds.id)
        except RuntimeError as exc:
            assert str(exc) == NOT_INSTALLED
        else:
            raise AssertionError('missing PixAI weights did not fail the caption pass')


def test_anima_auto_skips_joycaption_and_uses_the_configured_model(app, monkeypatch):
    from app.config import LOCAL_USER, save_config
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc
    from app.services import vision_llm
    import app.services.joycaption as joy

    seen = {}
    joy_calls = []

    def _joy(paths, **_k):
        joy_calls.append(list(paths))
        return {}

    def _describe(_data, _prompt, **kw):
        seen['model'] = kw.get('model')
        return 'A short factual caption.'

    monkeypatch.setattr(joy, 'is_available', lambda: True)
    monkeypatch.setattr(joy, 'caption_images_joycaption', _joy)
    monkeypatch.setattr(vision_llm, 'describe_image', _describe)
    monkeypatch.setattr(vision_llm, 'unload_vision_model', lambda **_kw: None)
    with app.app_context():
        save_config({'captioning': {
            'backend': 'auto', 'anima_auto_model': 'anima-test-model'}})
        ds = svc.create_dataset(LOCAL_USER, 'Au', 'zchar_au', train_type='anima')
        img = _kept(svc, ds)
        n = svc.caption_images(LOCAL_USER, ds.id)
        row = svc.db.session.get(FaceDatasetImage, img.id)
        assert n == 1
        assert row.caption == 'A short factual caption.'
        assert row.caption_origin == 'ollama'
        assert seen['model'] == 'anima-test-model'
        assert joy_calls == []
        plain = svc.create_dataset(LOCAL_USER, 'Z', 'zchar_z', train_type='zimage')
        _kept(svc, plain)
        svc.caption_images(LOCAL_USER, plain.id)
        assert joy_calls, 'a non-Anima Auto pass did not try JoyCaption'
