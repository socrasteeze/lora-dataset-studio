"""Content-bound, per-pair duplicate approvals for Dataset training readiness."""
import hashlib

from ..extensions import db
from ..models import DatasetDuplicateKeep, FaceDataset, FaceDatasetImage
from . import face_dataset_service as fds


def fingerprint(image):
    try:
        path = fds._img_path(image)
        with open(path, 'rb') as stream:
            digest = hashlib.sha256()
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        return digest.hexdigest()
    except (OSError, TypeError):
        return None


def approved_pairs(dataset):
    return {(row.image_a_id, row.image_b_id): (row.fingerprint_a, row.fingerprint_b)
            for row in DatasetDuplicateKeep.query.filter_by(
                dataset_id=dataset.id, dataset_instance_id=dataset.instance_id).all()}


@fds._serialize_dataset_ingest
def keep_both(user_id, dataset_id, image_ids, fingerprints):
    dataset = db.session.get(FaceDataset, dataset_id)
    if dataset is None or str(dataset.user_id) != str(user_id):
        raise ValueError('Dataset not found.')
    if (not isinstance(image_ids, list) or len(image_ids) != 2
            or any(type(value) is not int for value in image_ids)
            or len(set(image_ids)) != 2):
        raise ValueError('Choose two different images from this dataset.')
    if not isinstance(fingerprints, dict):
        raise ValueError('Reopen the pairs before keeping both copies.')
    ids = sorted(image_ids)
    rows = (FaceDatasetImage.query.filter(
        FaceDatasetImage.dataset_id == dataset_id, FaceDatasetImage.id.in_(ids))
        .order_by(FaceDatasetImage.id).all())
    if len(rows) != 2 or any(row.status != 'keep' for row in rows):
        raise ValueError('The pair changed. Reopen the pairs before reviewing it.')
    hashes = [fingerprint(row) for row in rows]
    if any(not value or fingerprints.get(str(row.id)) != value
           for row, value in zip(rows, hashes)):
        raise ValueError('An image changed or is unavailable. Reopen the pairs before reviewing it.')
    decision = db.session.get(DatasetDuplicateKeep, (dataset_id, *ids))
    if decision is None:
        decision = DatasetDuplicateKeep(dataset_id=dataset_id, image_a_id=ids[0], image_b_id=ids[1])
        db.session.add(decision)
    decision.dataset_instance_id = dataset.instance_id
    decision.fingerprint_a, decision.fingerprint_b = hashes
    db.session.commit()
    return {'ok': True, 'image_ids': ids}
