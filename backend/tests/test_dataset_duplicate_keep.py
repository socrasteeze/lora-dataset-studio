"""Keep Both resolves only the approved, unchanged Dataset image pair."""
from pathlib import Path

import pytest
from PIL import Image

from app.config import LOCAL_USER


def _dataset(count=2):
    from app.extensions import db
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as fds

    dataset = fds.create_dataset(LOCAL_USER, 'Example', 'example')
    rows = []
    for index in range(count):
        row = FaceDatasetImage(dataset_id=dataset.id, filename=f'sample{index}.png',
                               status='keep', caption='Example caption', framing='body')
        db.session.add(row)
        rows.append(row)
    db.session.commit()
    for row in rows:
        path = Path(fds._img_path(row))
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new('RGB', (64, 64), (100, 110, 120)).save(path)
    return dataset, rows


def _report(dataset):
    from app.models import FaceDatasetImage
    from app.services import lora_training

    rows = FaceDatasetImage.query.filter_by(dataset_id=dataset.id, status='keep').all()
    warnings, checks = [], []
    pairs = lora_training._pf_duplicates(rows, len(rows), False, warnings,
        lambda *args: checks.append(args), dataset=dataset)
    return pairs, warnings, checks


def _body(pair):
    return {'image_ids': [pair['b']['id'], pair['a']['id']],
            'fingerprints': {str(pair[key]['id']): pair[key]['fingerprint'] for key in ('a', 'b')}}


def test_keep_both_persists_and_preserves_images_and_metadata(app, client):
    from app.extensions import db
    from app.models import DatasetDuplicateKeep
    from app.services import face_dataset_service as fds

    with app.app_context():
        dataset, rows = _dataset()
        pairs, warnings, checks = _report(dataset)
        assert len(pairs) == 1 and warnings and checks[0][2] == 'warn'
        files = {row.id: Path(fds._img_path(row)).read_bytes() for row in rows}
        dataset_id = dataset.id
        body = _body(pairs[0])
        for _ in range(2):
            response = client.post(f'/api/dataset/{dataset_id}/duplicates/keep-both', json=body)
            assert response.status_code == 200, response.get_json()
        db.session.expire_all()
        assert DatasetDuplicateKeep.query.filter_by(dataset_id=dataset_id).count() == 1
        pairs, warnings, checks = _report(dataset)
        assert pairs == [] and warnings == [] and checks[0][2] == 'ok'
        assert all(row.status == 'keep' and row.caption == 'Example caption' and row.framing == 'body' for row in rows)
        assert {row.id: Path(fds._img_path(row)).read_bytes() for row in rows} == files


def test_approval_does_not_hide_other_pairs(app, client):
    with app.app_context():
        dataset, _ = _dataset(3)
        pairs, _, _ = _report(dataset)
        assert len(pairs) == 3
        response = client.post(f'/api/dataset/{dataset.id}/duplicates/keep-both', json=_body(pairs[0]))
        assert response.status_code == 200
        remaining, warnings, checks = _report(dataset)
        assert len(remaining) == 2 and warnings and checks[0][2] == 'warn'


def test_changed_image_reappears_and_stale_review_cannot_approve_it(app, client):
    from app.services import face_dataset_service as fds

    with app.app_context():
        dataset, rows = _dataset()
        pairs, _, _ = _report(dataset)
        body = _body(pairs[0])
        url = f'/api/dataset/{dataset.id}/duplicates/keep-both'
        assert client.post(url, json=body).status_code == 200
        Image.new('RGB', (64, 64), (120, 110, 100)).save(fds._img_path(rows[0]))
        assert client.post(url, json=body).status_code == 400
        pairs, warnings, _ = _report(dataset)
        assert len(pairs) == 1 and warnings
        assert client.post(url, json=_body(pairs[0])).status_code == 200
        assert _report(dataset)[0] == []


def test_manual_reject_and_foreign_dataset_are_not_overridden(app, client):
    from app.extensions import db
    from app.models import DatasetDuplicateKeep

    with app.app_context():
        dataset, rows = _dataset()
        other, other_rows = _dataset()
        pairs, _, _ = _report(dataset)
        body = _body(pairs[0])
        url = f'/api/dataset/{dataset.id}/duplicates/keep-both'
        foreign_body = {**body, 'image_ids': [rows[0].id, other_rows[0].id]}
        assert client.post(url, json=foreign_body).status_code == 400
        rows[0].status = 'reject'
        db.session.commit()
        assert client.post(url, json=body).status_code == 400
        assert rows[0].status == 'reject'
        assert DatasetDuplicateKeep.query.count() == 0
        assert other.id != dataset.id


@pytest.mark.parametrize('ids', [[], [1], [1, 1], [True, 2], ['1', 2]])
def test_invalid_pair_requests_do_not_create_decisions(app, client, ids):
    from app.models import DatasetDuplicateKeep

    with app.app_context():
        dataset, _ = _dataset()
        response = client.post(f'/api/dataset/{dataset.id}/duplicates/keep-both',
                               json={'image_ids': ids, 'fingerprints': {}})
        assert response.status_code == 400
        assert DatasetDuplicateKeep.query.count() == 0


def test_replaced_dataset_identity_does_not_inherit_approvals(app, client):
    from app.extensions import db

    with app.app_context():
        dataset, _ = _dataset()
        pairs, _, _ = _report(dataset)
        url = f'/api/dataset/{dataset.id}/duplicates/keep-both'
        assert client.post(url, json=_body(pairs[0])).status_code == 200
        dataset.instance_id = 'd' * 32
        db.session.commit()
        assert len(_report(dataset)[0]) == 1


def test_another_owner_cannot_approve_the_pair(app, client):
    from app.extensions import db
    from app.models import DatasetDuplicateKeep

    with app.app_context():
        dataset, rows = _dataset()
        pairs, _, _ = _report(dataset)
        dataset.user_id = 'another-user'
        db.session.commit()
        response = client.post(f'/api/dataset/{dataset.id}/duplicates/keep-both', json=_body(pairs[0]))
        assert response.status_code == 400
        assert DatasetDuplicateKeep.query.count() == 0
        assert all(row.status == 'keep' for row in rows)
