"""Dataset Auto-Crop scope boundaries using invented images only."""
import io
import json
from pathlib import Path

from PIL import Image
import pytest


@pytest.fixture
def crop_scope(app, monkeypatch):
    from app.extensions import db
    from app.models import FaceDataset, FaceDatasetImage
    from app.services import face_dataset_service as service, vision_llm

    with app.app_context():
        datasets = [FaceDataset(user_id='local', name='Example', trigger_word='example'),
                    FaceDataset(user_id='local', name='Other', trigger_word='other')]
        db.session.add_all(datasets)
        db.session.commit()
        rows = {}
        originals = {}
        for index, status in enumerate(('keep', 'pending', 'reject', 'foreign')):
            dataset_id = datasets[status == 'foreign'].id
            directory = Path(service._dataset_dir(dataset_id))
            directory.mkdir(parents=True, exist_ok=True)
            filename = f'example-{index}.png'
            output = io.BytesIO()
            Image.new('RGB', (1000, 800), (index * 40, 90, 120)).save(output, 'PNG')
            original = output.getvalue()
            (directory / filename).write_bytes(original)
            row = FaceDatasetImage(dataset_id=dataset_id, filename=filename, framing='face',
                                   status=status if status != 'foreign' else 'keep')
            db.session.add(row)
            rows[status] = row
            originals[status] = original
        db.session.commit()
        monkeypatch.setattr(vision_llm, 'describe_image', lambda *a, **k: json.dumps({
            'framing': 'body', 'crop_box': [100, 100, 900, 900], 'crop_confidence': 0.99,
        }))
        monkeypatch.setattr(vision_llm, 'unload_vision_model', lambda: None)
        yield service, datasets[0].id, rows, originals


@pytest.mark.parametrize('statuses,selection,expected', [
    (None, None, {'keep', 'pending'}),
    (['keep'], None, {'keep'}),
    (['pending'], None, {'pending'}),
    (['reject'], None, {'reject'}),
    (['keep', 'pending', 'reject'], None, {'keep', 'pending', 'reject'}),
    (None, ['pending', 'reject', 'foreign'], {'pending'}),
    (['reject'], ['pending', 'reject', 'foreign'], {'reject'}),
    (None, ['foreign'], set()),
])
def test_crop_scope_cannot_widen_to_other_statuses_or_datasets(crop_scope, statuses, selection, expected):
    service, dataset_id, rows, originals = crop_scope
    arguments = {'statuses': statuses}
    if selection is not None:
        arguments['image_ids'] = [rows[key].id for key in selection] + [999999]
    report = {}
    assert service.classify_images('local', dataset_id, auto_crop=True,
                                   report=report, **arguments) == len(expected)
    assert set(report['cropped_ids']) == {rows[key].id for key in expected}
    assert report['attempted'] == len(expected)
    for key, row in rows.items():
        saved = Path(service._dataset_dir(row.dataset_id)) / row.filename
        assert (saved.read_bytes() != originals[key]) is (key in expected)
        assert row.framing == ('body' if key in expected else 'face')


@pytest.mark.parametrize('image_ids', [[], [True], [-1], ['1']])
def test_invalid_selection_never_falls_back_to_the_whole_dataset(crop_scope, image_ids):
    service, dataset_id, _, _ = crop_scope
    with pytest.raises(ValueError):
        service.classify_images('local', dataset_id, auto_crop=True, image_ids=image_ids)


def test_image_rejected_during_inference_is_not_cropped_or_classified(crop_scope, monkeypatch):
    from app.extensions import db
    from app.services import vision_llm

    service, dataset_id, rows, originals = crop_scope
    row = rows['keep']

    def reject_during_inference(*args, **kwargs):
        row.status = 'reject'
        db.session.commit()
        return json.dumps({'framing': 'body', 'crop_box': [100, 100, 900, 900], 'crop_confidence': 0.99})

    monkeypatch.setattr(vision_llm, 'describe_image', reject_during_inference)
    report = {}
    assert service.classify_images('local', dataset_id, auto_crop=True,
                                   image_ids=[row.id], report=report) == 0
    assert report['scope_skipped'] == 1
    assert report['cropped_ids'] == []
    assert row.framing == 'face'
    assert (Path(service._dataset_dir(dataset_id)) / row.filename).read_bytes() == originals['keep']


@pytest.mark.parametrize('scope', [{'image_ids': []}, {'image_ids': None},
                                 {'image_ids': [False]}, {'statuses': ['invalid']}])
def test_route_refuses_invalid_scope_before_reserving_the_gpu(app, monkeypatch, scope):
    from app.routes import datasets

    monkeypatch.setattr(datasets.svc, 'get_dataset', lambda *a: object())

    def unexpected_window(*args, **kwargs):
        raise AssertionError('Invalid scope must not reserve the GPU')

    monkeypatch.setattr(datasets, 'gpu_exclusive_vision_window', unexpected_window)
    response = app.test_client().post('/api/dataset/123/classify', json={'auto_crop': True, **scope})
    assert response.status_code == 400
