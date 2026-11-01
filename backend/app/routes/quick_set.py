"""Quick set routes. One local user, no access token."""
from __future__ import annotations

import os

from flask import Blueprint, jsonify, request, send_file
from werkzeug.utils import secure_filename

from ..config import LOCAL_USER
from ..services import quick_set as qs

bp = Blueprint('quick_set', __name__, url_prefix='/api')

_MAX_BYTES = 30 * 1024 * 1024


def _ids(name):
    if request.is_json:
        raw = (request.get_json(silent=True) or {}).get(name) or []
        if isinstance(raw, (str, int)):
            raw = [raw]
        return [str(item) for item in raw if str(item).strip()]
    return [item for item in request.form.getlist(name) if str(item).strip()]


def _value(name):
    if request.is_json:
        return (request.get_json(silent=True) or {}).get(name)
    return request.form.get(name)


def _bank_path(image_id):
    from ..models import BankImage, ImageBank
    try:
        image_id = int(image_id)
    except (TypeError, ValueError):
        raise qs.QuickSetError('That bank image is not available.') from None
    image = BankImage.query.get(image_id)
    if image is None:
        raise qs.QuickSetError('That bank image is not available.')
    bank = ImageBank.query.get(image.bank_id)
    if bank is None or str(bank.user_id) != str(LOCAL_USER):
        raise qs.QuickSetError('That bank image is not available.')
    if os.path.isabs(image.relpath):
        raise qs.QuickSetError('That bank image is not available.')
    path = os.path.normpath(os.path.join(bank.source_path, image.relpath))
    root = os.path.normpath(bank.source_path)
    folded = os.path.normcase(path)
    root_folded = os.path.normcase(root)
    if folded != root_folded and not folded.startswith(root_folded + os.sep):
        raise qs.QuickSetError('That bank image is not available.')
    if not os.path.isfile(path):
        raise qs.QuickSetError('That bank image is not available.')
    return path


def _dataset_path(image_id):
    from ..models import FaceDatasetImage
    from ..services.dataset_storage import dataset_path
    from ..services.face_dataset_service import get_dataset
    try:
        image_id = int(image_id)
    except (TypeError, ValueError):
        raise qs.QuickSetError('That dataset image is not available.') from None
    image = FaceDatasetImage.query.get(image_id)
    if image is None or not image.filename:
        raise qs.QuickSetError('That dataset image is not available.')
    dataset = get_dataset(LOCAL_USER, image.dataset_id)
    if dataset is None:
        raise qs.QuickSetError('That dataset image is not available.')
    if os.path.isabs(image.filename):
        raise qs.QuickSetError('That dataset image is not available.')
    folder = os.path.normpath(dataset_path(dataset.id))
    path = os.path.normpath(os.path.join(folder, image.filename))
    folded = os.path.normcase(path)
    folder_folded = os.path.normcase(folder)
    if not folded.startswith(folder_folded + os.sep) or not os.path.isfile(path):
        raise qs.QuickSetError('That dataset image is not available.')
    return path


def _uploads():
    paths = []
    for storage in request.files.getlist('images'):
        if not storage or not storage.filename:
            continue
        storage.seek(0, os.SEEK_END)
        size = storage.tell()
        storage.seek(0)
        if size > _MAX_BYTES:
            raise qs.QuickSetError('An image is too large.')
        name = secure_filename(storage.filename) or 'image.png'
        folder = os.path.join(str(qs.cfg.data_dir()), 'quick_set', 'uploads')
        os.makedirs(folder, exist_ok=True)
        dest = os.path.join(folder, f'{os.urandom(4).hex()}-{name}')
        storage.save(dest)
        paths.append(dest)
    return paths


def _source_paths():
    uploads = []
    try:
        if not request.is_json:
            uploads = _uploads()
        paths = list(uploads)
        paths.extend(_bank_path(item) for item in _ids('bank_image_ids'))
        paths.extend(_dataset_path(item) for item in _ids('dataset_image_ids'))
        return paths, uploads
    except Exception:
        for path in uploads:
            try:
                os.remove(path)
            except OSError:
                pass
        raise


@bp.post('/quick-set')
def create_quick_set():
    uploads = []
    try:
        paths, uploads = _source_paths()
        fields = {
            'name': _value('name'),
            'trigger': _value('trigger'),
            'engine': _value('engine'),
            'turbo': _value('turbo'),
            'target_count': _value('target_count'),
        }
        job = qs.start(LOCAL_USER, fields, paths)
    except qs.QuickSetError as exc:
        return jsonify({'error': str(exc)}), exc.status
    finally:
        for path in uploads:
            try:
                os.remove(path)
            except OSError:
                pass
    return jsonify(job), 202


@bp.get('/quick-set/<job_id>')
def read_quick_set(job_id):
    job = qs.get_job(job_id)
    if job is None:
        return jsonify({'error': 'That Quick set job is not running.'}), 404
    return jsonify(job)


@bp.post('/quick-set/<job_id>/cancel')
def cancel_quick_set(job_id):
    job = qs.cancel(job_id, LOCAL_USER)
    if job is None:
        return jsonify({'error': 'That Quick set job is not running.'}), 404
    return jsonify(job)


@bp.get('/quick-set/<job_id>/thumb/<int:index>')
def quick_set_thumb(job_id, index):
    path = qs.thumb_path(job_id, index)
    if path is None:
        return jsonify({'error': 'That thumbnail is not available.'}), 404
    return send_file(path, mimetype='image/jpeg', max_age=0)
