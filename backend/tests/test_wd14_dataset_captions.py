"""WD14 dataset caption dispatch, storage and preview without model inference."""
import os
from types import SimpleNamespace

import pytest

from app.config import LOCAL_USER, save_config
from app.models import FaceDatasetImage
from app.services import face_dataset_service as svc
from app.services import wd14_tagger as w


@pytest.fixture(autouse=True)
def ready(monkeypatch):
    monkeypatch.setattr(w, 'missing_model_files', lambda: [])
    monkeypatch.setattr(w, 'is_available', lambda: True)
    monkeypatch.setattr(w, 'gpu_refusal', lambda: None)
    monkeypatch.setattr(w, 'tag_images',
                        lambda *a, **kw: pytest.fail('Unexpected tagger call'))


def _kept(ds):
    folder = svc._dataset_dir(ds.id)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, 'sample.webp'), 'wb') as fh:
        fh.write(b'invented-image-bytes')
    img = FaceDatasetImage(dataset_id=ds.id, source='import', status='keep',
                           filename='sample.webp', framing='face')
    svc.db.session.add(img)
    svc.db.session.commit()
    return img


@pytest.mark.parametrize('kind,include_character', [('character', False), ('style', True)])
def test_caption_dispatch_uses_threshold_kind_rules_and_origin(app, monkeypatch, kind,
                                                             include_character):
    seen = {}

    def tags(paths, **kw):
        seen.update(kw)
        kw['on_progress']({'phase': 'tagging', 'done': 1})
        scores = {'smile': 0.9, 'outdoors': 0.8, 'blue_eyes': 0.7}
        if kw['include_character']:
            scores['invented_character'] = 0.6
        return {'ok': True, 'results': {paths[0]: scores}}

    monkeypatch.setattr(w, 'tag_images', tags)
    with app.app_context():
        save_config({'wd14': {'threshold': 0.42}})
        ds = svc.create_dataset(LOCAL_USER, 'Sample', 'sample_token',
                                kind=kind, train_type='sdxl')
        img = _kept(ds)
        svc.set_caption_options(LOCAL_USER, ds.id, {'backend': 'wd14'})
        report = {}
        assert svc.caption_images(LOCAL_USER, ds.id, report=report) == 1
        row = svc.db.session.get(FaceDatasetImage, img.id)
        assert row.caption_origin == 'wd14'
        assert 'smile' in row.caption
        if kind == 'character':
            assert 'blue_eyes' not in row.caption
        assert ('invented_character' in row.caption) is include_character
        assert report == {'wd14': 1, 'model': w.MODEL_ID}
    assert seen['threshold_value'] == 0.42
    assert seen['include_character'] is include_character


def test_caption_options_route_keeps_wd14_identifier(app):
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Sample', 'sample_token', train_type='sdxl')
        dataset_id = ds.id
    client = app.test_client()
    url = f'/api/dataset/{dataset_id}/caption/options'
    response = client.post(url, json={'backend': 'wd14'})
    assert response.status_code == 200
    assert response.get_json()['options']['backend'] == 'wd14'
    assert client.get(url).get_json()['options']['backend'] == 'wd14'


@pytest.mark.parametrize('kind,train_type,mode,reason', [
    ('concept', 'sdxl', None, w.CONCEPT_REFUSAL),
    ('character', 'zimage', None, w.PROSE_REFUSAL),
    ('character', 'sdxl', 'prose', w.PROSE_REFUSAL),
])
def test_dataset_refuses_concepts_and_prose(app, kind, train_type, mode, reason):
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Sample', 'sample_token', kind=kind,
                                train_type=train_type, concept_desc='invented pose')
        svc.set_caption_options(LOCAL_USER, ds.id, {'backend': 'wd14'})
        with pytest.raises(RuntimeError, match=reason):
            svc.caption_images(LOCAL_USER, ds.id, mode=mode)
        if mode is None:
            with pytest.raises(RuntimeError, match=reason):
                svc._preview_wd14_caption(ds, None, 'sample.webp', str)


@pytest.mark.parametrize('missing,available,gpu,reason', [
    (['model.onnx'], True, None, w.NOT_INSTALLED),
    ([], False, None, w.NOT_INSTALLED),
    ([], True, 'GPU unavailable', 'GPU unavailable'),
])
def test_batch_and_preview_refuse_unavailable_tools(app, monkeypatch, missing, available,
                                                  gpu, reason):
    monkeypatch.setattr(w, 'missing_model_files', lambda: missing)
    monkeypatch.setattr(w, 'is_available', lambda: available)
    monkeypatch.setattr(w, 'gpu_refusal', lambda: gpu)
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Sample', 'sample_token', train_type='sdxl')
        svc.set_caption_options(LOCAL_USER, ds.id, {'backend': 'wd14'})
        with pytest.raises(RuntimeError, match=reason):
            svc.caption_images(LOCAL_USER, ds.id)
        with pytest.raises(RuntimeError, match=reason):
            svc._preview_wd14_caption(ds, None, 'sample.webp', str)


def test_bank_caption_path_refuses_wd14():
    with pytest.raises(RuntimeError, match='Bank Tags pass'):
        svc.caption_paths(['sample.webp'], backend='wd14')


def test_failed_tagger_reports_its_error_in_batch_and_preview(app, monkeypatch):
    monkeypatch.setattr(w, 'tag_images', lambda *a, **kw: {
        'ok': False, 'error': 'synthetic inference failure'})
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Sample', 'sample_token', train_type='sdxl')
        img = _kept(ds)
        svc.set_caption_options(LOCAL_USER, ds.id, {'backend': 'wd14'})
        with pytest.raises(RuntimeError, match='synthetic inference failure'):
            svc.caption_images(LOCAL_USER, ds.id)
        with pytest.raises(RuntimeError, match='synthetic inference failure'):
            svc.preview_caption(LOCAL_USER, ds.id, img.id)
        assert not img.caption


def test_empty_preview_stays_empty_after_omission(monkeypatch):
    monkeypatch.setattr(w, 'tag_images', lambda paths, **kw: {
        'ok': True, 'results': {paths[0]: {'blue_eyes': 0.8}}})
    monkeypatch.setattr(svc, '_with_camera_pose_phrase',
                        lambda *a: pytest.fail('Empty caption gained a camera phrase'))
    result = svc._preview_wd14_caption(
        SimpleNamespace(kind='character', train_type='sdxl'), None, 'sample.webp', lambda _: '')
    assert result['caption'] == '' and result['chars'] == 0


def test_preview_dispatch_is_one_image_and_does_not_write(app, monkeypatch):
    seen = []

    def tags(paths, **kw):
        seen.append((paths, kw))
        return {'ok': True, 'results': {paths[0]: {'smile': 0.8}}}

    monkeypatch.setattr(w, 'tag_images', tags)
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Sample', 'sample_token', train_type='sdxl')
        img = _kept(ds)
        img.caption = 'original caption'
        img.caption_origin = 'asserted'
        svc.db.session.commit()
        result = svc.preview_caption(LOCAL_USER, ds.id, img.id, backend='wd14')
        assert result['caption'] == 'smile'
        assert result['chars'] == 5
        assert result['model'] == w.MODEL_ID
        assert result['duration_ms'] >= 0
        assert result['cancelled'] is False
        svc.db.session.expire_all()
        assert img.caption == 'original caption'
        assert img.caption_origin == 'asserted'
    assert len(seen) == 1 and len(seen[0][0]) == 1
    assert seen[0][1]['include_character'] is False


def test_store_accounts_for_empty_vanished_protected_and_cleaned_rows(monkeypatch):
    rows = {i: SimpleNamespace(caption='', caption_origin=None) for i in (1, 3, 4, 5)}
    rows[3].caption, rows[3].caption_origin = 'keep this', 'asserted'
    todo = [(i, f'sample-{i}.webp') for i in range(1, 6)]
    scores = {path: {'smile': 0.9} for _, path in todo}
    scores[todo[3][1]] = {}
    scores[todo[4][1]] = {'omit': 0.9}
    monkeypatch.setattr(w, 'tag_images', lambda *a, **kw: {'ok': True, 'results': scores})
    monkeypatch.setattr(svc, '_live_image_row', rows.get)
    commits, progress = [], []
    monkeypatch.setattr(svc, 'db', SimpleNamespace(session=SimpleNamespace(
        commit=lambda: commits.append(True))))
    monkeypatch.setattr(svc.dataset_activity, 'cancel_requested', lambda _: False)
    monkeypatch.setattr(svc.dataset_activity, 'progress', lambda token, **kw: progress.append(kw))
    monkeypatch.setattr(svc.dataset_activity, 'bump', lambda *a: None)
    monkeypatch.setattr(svc, '_with_camera_pose_phrase', lambda img, cap: cap + ', camera pose')
    monkeypatch.setattr(svc, '_cap_caption', lambda cap: cap + ', capped')
    report, outcome = {}, {}
    n = svc._store_wd14_dataset_captions(
        SimpleNamespace(kind='character'), todo, token='sample', dataset_id=1,
        force=True, spare_asserted=True, cleaner=lambda cap: '' if cap == 'omit' else cap,
        report=report, outcome=outcome)
    assert n == len(commits) == 1
    assert rows[1].caption == 'smile, camera pose, capped'
    assert rows[1].caption_origin == 'wd14'
    assert rows[3].caption == 'keep this'
    assert rows[4].caption == rows[5].caption == ''
    assert outcome['skipped'] == 2 and outcome['skipped_reason']
    assert progress[-1]['done'] == 5
    assert report == {'wd14': 1, 'model': w.MODEL_ID}


def test_cancel_after_inference_writes_nothing(monkeypatch):
    cancelled = [False]

    def tags(paths, **kw):
        cancelled[0] = True
        return {'ok': True, 'results': {paths[0]: {'smile': 0.8}}}

    monkeypatch.setattr(w, 'tag_images', tags)
    monkeypatch.setattr(svc.dataset_activity, 'cancel_requested', lambda _: cancelled[0])
    monkeypatch.setattr(svc.dataset_activity, 'progress', lambda *a, **kw: None)
    monkeypatch.setattr(svc, '_live_image_row', lambda _: pytest.fail('Cancelled pass wrote'))
    assert svc._store_wd14_dataset_captions(
        SimpleNamespace(kind='character'), [(1, 'sample.webp')], token='sample', dataset_id=1,
        force=False, spare_asserted=False, cleaner=str, report={}, outcome={}) == 0


def test_cancel_before_inference_never_starts_tagger(monkeypatch):
    monkeypatch.setattr(svc.dataset_activity, 'cancel_requested', lambda _: True)
    assert svc._store_wd14_dataset_captions(
        SimpleNamespace(kind='character'), [(1, 'sample.webp')], token='sample', dataset_id=1,
        force=False, spare_asserted=False, cleaner=str, report={}, outcome={}) == 0


def test_auto_never_calls_wd14(app, monkeypatch):
    from app.services import joycaption
    from app.services import pixai_tagger

    monkeypatch.setattr(pixai_tagger, 'is_installed', lambda: False)
    monkeypatch.setattr(joycaption, 'is_available', lambda: True)
    monkeypatch.setattr(joycaption, 'caption_images_joycaption',
                        lambda paths, **kw: {path: 'smile' for path in paths})
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Sample', 'sample_token', train_type='sdxl')
        _kept(ds)
        svc.set_caption_options(LOCAL_USER, ds.id, {'backend': 'auto'})
        report = {}
        assert svc.caption_images(LOCAL_USER, ds.id, report=report) == 1
        assert report['joycaption'] == 1
        assert 'wd14' not in report
