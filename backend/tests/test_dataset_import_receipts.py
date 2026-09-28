import io

from PIL import Image


def photo(color='red'):
    output = io.BytesIO()
    Image.new('RGB', (800, 800), color).save(output, 'PNG')
    return output.getvalue()


def create_dataset(client):
    response = client.post('/api/dataset/create', json={'name': 'Example', 'trigger_word': 'example_subject'})
    assert response.status_code == 200
    return response.json['id']


def dataset_identity(client, dataset_id):
    return client.get(f'/api/dataset/{dataset_id}').json['instance_id']


def upload(client, dataset_id, key='upload_1', raw=None, crop='0', instance_id=None):
    return client.post(f'/api/dataset/{dataset_id}/import', data={
        'files': (io.BytesIO(raw or photo()), 'example.png'),
        'crop': crop, 'import_key': key,
        'dataset_instance_id': instance_id or dataset_identity(client, dataset_id),
    })


def test_dataset_instance_identity_is_stable_across_api_payloads(client):
    created = client.post('/api/dataset/create', json={
        'name': 'Identity Example', 'trigger_word': 'identity_subject',
    })
    assert created.status_code == 200
    identity = created.json['instance_id']
    assert len(identity) == 32
    assert client.get(f"/api/dataset/{created.json['id']}").json['instance_id'] == identity
    listed = client.get('/api/dataset/list').json['datasets']
    assert next(row for row in listed if row['id'] == created.json['id'])['instance_id'] == identity


def test_retry_returns_original_answer_without_new_image(client, app):
    from app.models import DatasetImportReceipt, FaceDatasetImage
    dataset_id = create_dataset(client)
    first = upload(client, dataset_id)
    assert first.status_code == 200
    assert first.json['imported'] == 1
    retry = upload(client, dataset_id)
    assert retry.json == {**first.json, 'replayed': True}
    with app.app_context():
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 1
        assert DatasetImportReceipt.query.filter_by(dataset_id=dataset_id).count() == 1


def test_receipt_survives_loss_of_response_after_image_commit(client, monkeypatch):
    from app.services import face_dataset_service as svc
    dataset_id = create_dataset(client)
    real = svc._imp_commit_row

    def lost_answer(*args, **kwargs):
        real(*args, **kwargs)
        raise RuntimeError('simulated connection loss after commit')

    monkeypatch.setattr(svc, '_imp_commit_row', lost_answer)
    first = upload(client, dataset_id)
    assert first.status_code >= 400
    retry = upload(client, dataset_id)
    assert retry.status_code == 200
    assert retry.json['replayed'] is True
    assert retry.json['imported'] == 1


def test_changed_file_or_crop_cannot_reuse_upload_identity(client):
    dataset_id = create_dataset(client)
    assert upload(client, dataset_id).status_code == 200
    assert upload(client, dataset_id, raw=photo('blue')).status_code == 400
    assert upload(client, dataset_id, crop='1').status_code == 400


def test_receipts_are_scoped_to_dataset_and_validate_keys(client):
    first = create_dataset(client)
    second = create_dataset(client)
    assert upload(client, first).json['imported'] == 1
    assert upload(client, second).json['imported'] == 1
    assert upload(client, first, key='../bad').status_code == 400


def test_invalid_file_has_a_repeatable_refusal(client):
    dataset_id = create_dataset(client)
    first = upload(client, dataset_id, raw=b'invalid image')
    assert first.json['failed'] == 1
    assert upload(client, dataset_id, raw=b'invalid image').json == {**first.json, 'replayed': True}


def test_duplicate_answer_is_cached_without_an_image_row(client, app):
    from app.models import DatasetImportReceipt, FaceDatasetImage
    dataset_id = create_dataset(client)
    raw = photo()
    assert upload(client, dataset_id, key='first', raw=raw).json['imported'] == 1

    duplicate = upload(client, dataset_id, key='duplicate', raw=raw)
    assert duplicate.status_code == 200
    assert duplicate.json['imported'] == 0
    assert duplicate.json['duplicates'] == 1
    assert upload(client, dataset_id, key='duplicate', raw=raw).json == {
        **duplicate.json, 'replayed': True,
    }
    with app.app_context():
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 1
        assert DatasetImportReceipt.query.filter_by(dataset_id=dataset_id).count() == 2


def test_receipted_request_rejects_multiple_files(client):
    dataset_id = create_dataset(client)
    response = client.post(f'/api/dataset/{dataset_id}/import', data={
        'files': [(io.BytesIO(photo()), 'one.png'), (io.BytesIO(photo()), 'two.png')],
        'crop': '0', 'import_key': 'upload_1',
        'dataset_instance_id': dataset_identity(client, dataset_id),
    })
    assert response.status_code == 400


def test_missing_or_stale_dataset_identity_is_refused_before_import(client, app):
    from app.models import DatasetImportReceipt, FaceDatasetImage
    dataset_id = create_dataset(client)
    current = dataset_identity(client, dataset_id)
    assert len(current) == 32

    for identity in (None, '0' * 32):
        data = {
            'files': (io.BytesIO(photo()), 'example.png'),
            'crop': '0', 'import_key': 'upload_1',
        }
        if identity is not None:
            data['dataset_instance_id'] = identity
        response = client.post(f'/api/dataset/{dataset_id}/import', data=data)
        assert response.status_code == 409
        assert response.json['stale_import'] is True

    with app.app_context():
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 0
        assert DatasetImportReceipt.query.filter_by(dataset_id=dataset_id).count() == 0


def test_legacy_import_without_receipt_does_not_require_dataset_identity(client):
    dataset_id = create_dataset(client)
    response = client.post(f'/api/dataset/{dataset_id}/import', data={
        'files': (io.BytesIO(photo()), 'example.png'), 'crop': '0',
    })
    assert response.status_code == 200
    assert response.json['imported'] == 1
