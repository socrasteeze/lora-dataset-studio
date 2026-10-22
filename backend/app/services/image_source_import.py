"""Import verified local acquisition bytes through the existing ingest gates."""
import hashlib
import json
import os
from pathlib import Path
import tempfile

from ..extensions import db
from ..models import BankImage, DatasetImportReceipt, FaceDatasetImage
from . import bank_jobs, dataset_activity, face_dataset_service as datasets, image_bank_service as banks
from . import image_source_metadata as metadata
from .dataset_storage import dataset_path
from .image_sources import Asset, IMAGE_BYTES, _checksum, _image_bytes, local_path


def merge_metadata(old, new):
    old, new = metadata.normalize(old), metadata.normalize(new)
    if old is None:
        return new
    if new is None:
        return old
    old['origins'] = list(dict.fromkeys([*old.get('origins', []), *new.get('origins', [])]))[:20]
    for key, tags in new.get('tags', {}).items():
        old.setdefault('tags', {})[key] = list(dict.fromkeys([*old['tags'].get(key, []), *tags]))[:300]
    return metadata.normalize(old)


def _read(job, asset):
    path = local_path(job, asset)
    if path is None or not path.is_file():
        raise ValueError('Download the selected originals before import.')
    if path.stat().st_size > IMAGE_BYTES:
        raise ValueError('The cached image exceeds the import limit.')
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != asset.sha256:
        raise ValueError('The cached image changed. Download it again before import.')
    return raw, _image_bytes(raw)


def _bank_hashes(bank, cancel):
    known = {}
    for row in BankImage.query.filter_by(bank_id=bank.id):
        if cancel.is_set():
            raise InterruptedError()
        source = banks.abs_image_path(bank, row)
        if source:
            path = Path(source)
            try:
                if not path.is_symlink() and path.is_file() and path.stat().st_size <= IMAGE_BYTES:
                    known.setdefault(_checksum(path), row)
            except OSError:
                continue  # An unavailable existing source cannot prove a duplicate.
    return known


def _bank_item(job, asset, bank, raw, extension, known):
    name = asset.sha256 + extension
    folder = Path(bank.source_path)
    path = folder / name
    if not folder.is_dir() or folder.is_symlink() or path.is_symlink():
        raise ValueError('The Bank folder is unavailable or contains an unsafe link.')
    existing = known.get(asset.sha256)
    if existing is not None:
        existing.source_metadata = json.dumps(merge_metadata(existing.source_metadata, asset.metadata_json))
        asset.imported, asset.error = True, None
        db.session.commit()
        return
    existing = BankImage.query.filter_by(bank_id=bank.id, relpath=name).first()
    if path.exists():
        if path.stat().st_size > IMAGE_BYTES or hashlib.sha256(path.read_bytes()).hexdigest() != asset.sha256:
            raise ValueError('A destination file conflicts with this import. The existing file remains unchanged.')
    else:
        # Stage in the destination filesystem so the final rename stays atomic.
        with tempfile.NamedTemporaryFile(dir=folder, prefix='import-', suffix='.part', delete=False) as handle:
            staging = Path(handle.name)
            try:
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            except BaseException:
                staging.unlink(missing_ok=True)
                raise
        try:
            os.replace(staging, path)
        finally:
            staging.unlink(missing_ok=True)
    if existing:
        existing.source_metadata = json.dumps(merge_metadata(existing.source_metadata, asset.metadata_json))
    else:
        banks._insert_bank_images(bank.id, str(folder), [name],
                                  source_metadata_by_relpath={name: asset.metadata_json})
    known[asset.sha256] = BankImage.query.filter_by(bank_id=bank.id, relpath=name).one()
    asset.imported, asset.error = True, None
    db.session.commit()


def _dataset_hashes(job):
    result = {}
    base = Path(dataset_path(job.target_id)).resolve()
    for row in FaceDatasetImage.query.filter_by(dataset_id=job.target_id):
        value = metadata.normalize(row.source_metadata)
        if value and value.get('sha256'):
            result[value['sha256']] = row
            continue
        path = base / row.filename
        if (path.parent.resolve() == base and not path.is_symlink() and path.is_file()
                and path.stat().st_size <= IMAGE_BYTES):
            result[hashlib.sha256(path.read_bytes()).hexdigest()] = row
    return result


def _dataset_item(job, asset, raw, known, activity_token):
    key = 'source:' + asset.sha256
    receipt = db.session.get(DatasetImportReceipt, (job.target_id, key))
    row = known.get(asset.sha256)
    if row is not None:
        row.source_metadata = json.dumps(merge_metadata(row.source_metadata, asset.metadata_json))
    elif receipt is None:
        receipt = DatasetImportReceipt(dataset_id=job.target_id, key=key,
                                       fingerprint=asset.sha256, result='{}')
        ids, failed = datasets.import_images(
            job.user_id, job.target_id, [raw], crop=False, dedupe=False,
            preserve_exact_bytes=True, source_metadata=[json.loads(asset.metadata_json)],
            statuses=['pending'], import_receipt=receipt,
            _dataset_activity_token=activity_token)
        if failed or not ids:
            raise ValueError('The Dataset refused this image. Retry after you check its state.')
        known[asset.sha256] = db.session.get(FaceDatasetImage, ids[0])
    asset.imported, asset.error = True, None
    db.session.commit()
    dataset_activity.bump(activity_token)


def import_job(job, cancel):
    assets = Asset.query.filter_by(job_id=job.id, selected=True, kind='image').order_by(Asset.id).all()
    if not assets:
        raise ValueError('Select downloaded images before import. Download ZIPs first to list their images.')
    job.total = len(assets)
    db.session.commit()
    if job.destination == 'bank':
        bank = banks.get_bank(job.user_id, job.target_id) if job.target_id else None
        if job.target_id and bank is None:
            raise ValueError('The destination Bank no longer exists. Create a new source job.')
        if bank is None:
            bank = banks._stage_import_bank(job.user_id, job.name)
            job.target_id = bank.id
            db.session.commit()
        with bank_jobs.mutation_lease(bank.id, 'source_import', total=len(assets)):
            try:
                banks._require_writable_source(bank)
            except banks.BankSourceReadOnly as exc:
                # The job runner reports ValueError text; keep the refusal visible.
                raise ValueError(str(exc)) from None
            known = _bank_hashes(bank, cancel)
            _import_items(job, assets, cancel,
                          lambda asset, raw, ext: _bank_item(job, asset, bank, raw, ext, known))
    else:
        if not datasets.get_dataset(job.user_id, job.target_id):
            raise ValueError('The destination Dataset no longer exists. Create a new source job.')
        token = dataset_activity.begin_exclusive(job.target_id, 'source_import', total=len(assets),
                                                 detail='Import source images')
        if token is None:
            raise ValueError('The Dataset has active work. Retry after it finishes.')
        try:
            with datasets._dataset_ingest_lock(job.user_id, job.target_id):
                known = _dataset_hashes(job)
                _import_items(job, assets, cancel,
                              lambda asset, raw, ext: _dataset_item(job, asset, raw, known, token))
        finally:
            dataset_activity.end(token)


def _import_items(job, assets, cancel, perform):
    failures = 0
    for asset in assets:
        if cancel.is_set():
            raise InterruptedError()
        try:
            raw, extension = _read(job, asset)
            perform(asset, raw, extension)
        except (ValueError, OSError) as exc:
            db.session.rollback()
            asset.error = (str(exc)[:240] + '. Save Original remains available.'
                           if isinstance(exc, ValueError) and str(exc).startswith('source image ')
                           else 'The image import failed. Its downloaded original remains available.')
            failures += 1
        job.done += 1
        db.session.commit()
    if failures:
        raise ValueError(f'{failures} image(s) failed to import. Retry to continue.')
