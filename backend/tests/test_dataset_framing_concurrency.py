"""Dataset Framing overlaps requests without sharing its ORM session."""
import json
from pathlib import Path
import threading

from flask import has_app_context
from PIL import Image
import pytest


@pytest.fixture
def framing_rows(app, monkeypatch):
    from app import config
    from app.extensions import db
    from app.models import FaceDataset, FaceDatasetImage
    from app.services import face_dataset_service as service, vision_llm

    with app.app_context():
        config.save_config({'local_llm': {'provider': 'ollama'},
                            'ollama': {'vision_concurrency': 3}})
        dataset = FaceDataset(user_id='local', name='Example', trigger_word='example')
        db.session.add(dataset)
        db.session.commit()
        root = Path(service._dataset_dir(dataset.id))
        root.mkdir(parents=True, exist_ok=True)
        rows = []
        for index in range(4):
            filename = f'example-{index}.png'
            Image.new('RGB', (32, 32), (index * 40, 40, 80)).save(root / filename)
            row = FaceDatasetImage(dataset_id=dataset.id, filename=filename,
                                   source='import', status='keep')
            db.session.add(row)
            rows.append(row)
        db.session.commit()
        monkeypatch.setattr(vision_llm, 'unload_vision_model', lambda: None)
        yield service, dataset.id, rows, root


def test_framing_warms_once_then_overlaps_with_no_worker_app_context(framing_rows, monkeypatch):
    from app.services import vision_llm
    service, dataset_id, rows, _ = framing_rows
    owner = threading.get_ident()
    barrier = threading.Barrier(3)
    calls = []
    running = 0
    maximum = 0
    lock = threading.Lock()

    def describe(_payload, _prompt, **options):
        nonlocal running, maximum
        on_owner = threading.get_ident() == owner
        assert options['auto_start_local'] is on_owner
        assert has_app_context() is on_owner
        calls.append(on_owner)
        if not on_owner:
            with lock:
                running += 1
                maximum = max(maximum, running)
            barrier.wait(timeout=10)
            with lock:
                running -= 1
        return json.dumps({'framing': 'body', 'angle': 'front', 'expression': 'neutral'})

    unloaded = []
    monkeypatch.setattr(vision_llm, 'describe_image', describe)
    monkeypatch.setattr(vision_llm, 'unload_vision_model', lambda: unloaded.append(running))
    assert service.classify_images('local', dataset_id) == 4
    assert calls == [True, False, False, False]
    assert maximum == 3 and unloaded == [0]
    assert all(row.framing == 'body' for row in rows)


def test_framing_stop_joins_requests_and_does_not_save_after_stop(framing_rows, monkeypatch):
    from app import config
    from app.services import dataset_activity, vision_llm
    service, dataset_id, rows, _ = framing_rows
    config.save_config({'ollama': {'vision_concurrency': 2}})
    owner = threading.get_ident()
    barrier = threading.Barrier(2)
    calls = []

    def describe(_payload, _prompt, **_options):
        calls.append(threading.get_ident())
        if threading.get_ident() != owner:
            barrier.wait(timeout=10)
            dataset_activity.request_cancel(dataset_id, dataset_activity.FRAMING_KINDS)
        return '{"framing":"body"}'

    monkeypatch.setattr(vision_llm, 'describe_image', describe)
    report = {}
    assert service.classify_images('local', dataset_id, report=report) == 1
    assert len(calls) == 3
    assert report['stopped'] is True
    assert [row.framing for row in rows] == ['body', None, None, None]
    assert not dataset_activity.cancel_requested(dataset_id, dataset_activity.FRAMING_KINDS)


def test_framing_rejects_pixels_replaced_during_a_queued_request(framing_rows, monkeypatch):
    from app.services import vision_llm
    service, dataset_id, rows, root = framing_rows
    replaced = root / rows[1].filename
    owner = threading.get_ident()
    changed = threading.Event()

    def describe(payload, _prompt, **_options):
        if threading.get_ident() != owner and payload == original:
            replaced.write_bytes(b'replaced pixels')
            changed.set()
        return '{"framing":"body"}'

    original = replaced.read_bytes()
    monkeypatch.setattr(vision_llm, 'describe_image', describe)
    report = {}
    assert service.classify_images('local', dataset_id, report=report) == 3
    assert changed.is_set() and report['stale'] == 1
    assert rows[1].framing is None
    assert all(row.framing == 'body' for index, row in enumerate(rows) if index != 1)
