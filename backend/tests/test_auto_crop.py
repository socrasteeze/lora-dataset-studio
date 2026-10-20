"""Confidence gates and crop-save boundaries with synthetic input only."""
import io
import json

from PIL import Image
import pytest

from app.services import auto_crop


def image_bytes():
    output = io.BytesIO()
    Image.new('RGB', (1000, 800), 'white').save(output, 'PNG')
    return output.getvalue()


@pytest.mark.parametrize('minimum', [0, -1, 1.01, True, '0.9', float('nan'), float('inf')])
def test_invalid_minimum_is_refused(minimum):
    with pytest.raises(ValueError):
        auto_crop.options(True, minimum)


@pytest.mark.parametrize('score', [None, False, '0.99', -1, 1.01, float('nan'), float('inf'), 0.89999])
def test_missing_invalid_or_low_confidence_cannot_crop(score):
    raw = json.dumps({'crop_box': [100, 100, 900, 900], 'crop_confidence': score})
    with pytest.raises(auto_crop.CropSkipped):
        auto_crop.plan(raw, image_bytes(), 0.9)


def test_threshold_equality_keeps_the_entire_subject_and_margin():
    raw = json.dumps({'crop_box': [100, 100, 900, 900], 'crop_confidence': 0.9})
    box = auto_crop.plan(raw, image_bytes(), 0.9)
    assert box['confidence'] == 0.9
    assert 0 <= box['x'] < 100 and 0 <= box['y'] < 80
    assert 900 < box['x'] + box['w'] <= 1000
    assert 720 < box['y'] + box['h'] <= 800


@pytest.mark.parametrize('bounds', [None, [0, 0, 0, 1000], [False, 0, 1000, 1000], [0, 0, 1001, 1000]])
def test_high_confidence_never_bypasses_invalid_bounds(bounds):
    raw = json.dumps({'crop_box': bounds, 'crop_confidence': 1})
    with pytest.raises(auto_crop.CropSkipped):
        auto_crop.plan(raw, image_bytes(), 0.9)


def test_an_already_framed_image_does_not_get_reencoded():
    raw = json.dumps({'crop_box': [0, 0, 1000, 1000], 'crop_confidence': 1})
    with pytest.raises(auto_crop.CropSkipped, match='already fills'):
        auto_crop.plan(raw, image_bytes(), 0.9)


def test_legacy_requests_keep_the_original_classification_arguments():
    assert auto_crop.request_options({}) == {}
    assert auto_crop.request_options({'auto_crop': True}) == {
        'auto_crop': True, 'min_crop_confidence': 0.9,
    }
    with pytest.raises(ValueError):
        auto_crop.request_options({'auto_crop': 'true'})


def test_replaced_source_bytes_cannot_receive_the_old_crop(tmp_path):
    source = tmp_path / 'example.png'
    payload = image_bytes()
    source.write_bytes(payload)
    fingerprint = auto_crop.bank_transfer_metadata.content_fingerprint_bytes(payload)
    auto_crop.require_unchanged(source, fingerprint)
    source.write_bytes(b'changed image bytes')
    with pytest.raises(auto_crop.SourceChanged):
        auto_crop.require_unchanged(source, fingerprint)


def test_framing_stop_does_not_leak_into_the_next_exclusive_pass():
    from app.services import dataset_activity as activity

    token = activity.begin_exclusive(31, 'classify', total=2)
    assert token is not None
    assert activity.request_cancel(31, activity.FRAMING_KINDS)
    assert activity.cancel_requested(31, activity.FRAMING_KINDS)
    activity.end(token)
    assert not activity.cancel_requested(31, activity.FRAMING_KINDS)
    token = activity.begin_exclusive(31, 'classify', total=2)
    assert token is not None
    assert not activity.cancel_requested(31, activity.FRAMING_KINDS)
    activity.end(token)


@pytest.mark.parametrize('score,expected', [(0.95, 1), (0.89, 0), (None, 0)])
def test_dataset_framing_crops_only_eligible_evidence(app, monkeypatch, score, expected):
    from pathlib import Path
    from app.extensions import db
    from app.models import FaceDataset, FaceDatasetImage
    from app.services import face_dataset_service as service, vision_llm

    with app.app_context():
        dataset = FaceDataset(user_id='local', name='Example', trigger_word='example')
        db.session.add(dataset)
        db.session.commit()
        directory = Path(service._dataset_dir(dataset.id))
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / 'example.png'
        original = image_bytes()
        path.write_bytes(original)
        image = FaceDatasetImage(dataset_id=dataset.id, filename='example.png', framing='face')
        db.session.add(image)
        db.session.commit()
        raw = json.dumps({'framing': 'body', 'crop_box': [100, 100, 900, 900], 'crop_confidence': score})
        monkeypatch.setattr(vision_llm, 'describe_image', lambda *a, **k: raw)
        monkeypatch.setattr(vision_llm, 'unload_vision_model', lambda: None)
        report = {}
        assert service.classify_images('local', dataset.id, auto_crop=True, report=report) == 1
        assert report['cropped'] == expected
        assert report['crop_skipped'] == 1 - expected
        assert report['crop_failed'] == 0
        assert report['cropped_ids'] == ([image.id] if expected else [])
        assert (path.read_bytes() != original) is bool(expected)
        assert db.session.get(FaceDatasetImage, image.id).framing == 'body'


@pytest.mark.parametrize('score,expected', [(0.95, True), (0.89, False)])
def test_bank_framing_keeps_the_result_bound_to_the_saved_pixels(app, tmp_path, monkeypatch, score, expected):
    from contextlib import nullcontext
    from app.extensions import db
    from app.models import BankImage, ImageBank
    from app.services import image_bank_service as service, bank_jobs, vision_llm

    directory = tmp_path / 'example-source'
    directory.mkdir()
    source = directory / 'example.png'
    original = image_bytes()
    source.write_bytes(original)
    raw = json.dumps({'framing': 'body', 'crop_box': [100, 100, 900, 900], 'crop_confidence': score})
    monkeypatch.setattr(vision_llm, 'describe_image', lambda *a, **k: raw)
    monkeypatch.setattr(vision_llm, 'unload_vision_model', lambda: None)
    monkeypatch.setattr('app.gpu_window.gpu_exclusive_vision_window', lambda **k: nullcontext())
    monkeypatch.setattr(bank_jobs, 'progress', lambda *a, **k: None)
    monkeypatch.setattr(bank_jobs, 'bump', lambda *a, **k: None)
    monkeypatch.setattr(bank_jobs, 'cancelled', lambda *a, **k: False)
    with app.app_context():
        bank = ImageBank(user_id='local', name='Example', source_path=str(directory))
        db.session.add(bank)
        db.session.commit()
        row = BankImage(bank_id=bank.id, relpath='example.png')
        db.session.add(row)
        db.session.commit()
        service._framing_job(bank.id, True, auto_crop=True)({})
        row = db.session.get(BankImage, row.id)
        path = service.analysis_image_path(bank, row)
        fingerprint = auto_crop.bank_transfer_metadata.content_fingerprint_path(path)
        assert row.framing == 'body'
        assert (row.edit_method == 'crop') is expected
        assert row.analysis_fingerprint == fingerprint
        assert service._prepare_analysis_write(row, path, fingerprint)
        assert row.framing == 'body'
        assert source.read_bytes() == original
