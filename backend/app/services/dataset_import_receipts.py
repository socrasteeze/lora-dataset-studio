"""Idempotent per-file imports for browser upload recovery.

An imported image and its receipt commit together. A lost HTTP answer or
process exit after commit can therefore be retried without another crop or row.
The caller must hold the dataset ingest lock for lookup through final commit.
"""
import hashlib
import json
import re

from ..extensions import db
from ..models import DatasetImportReceipt


def import_once(dataset_id, key, raw, crop, perform):
    if not isinstance(key, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', key):
        raise ValueError('Invalid upload key. Start a new import.')
    fingerprint = hashlib.sha256(bytes([bool(crop)]) + raw).hexdigest()
    receipt = db.session.get(DatasetImportReceipt, (dataset_id, key))
    if receipt is not None:
        if receipt.fingerprint != fingerprint:
            raise ValueError('This upload key belongs to different image data or crop settings.')
        return {**json.loads(receipt.result), 'replayed': True}
    receipt = DatasetImportReceipt(dataset_id=dataset_id, key=key,
                                   fingerprint=fingerprint, result='{}')
    result = perform(receipt)
    # A duplicate or invalid file creates no image row. Persist its answer here.
    # Successful image insertion already committed the same receipt atomically.
    receipt.result = json.dumps(result)
    db.session.add(receipt)
    db.session.commit()
    return result
