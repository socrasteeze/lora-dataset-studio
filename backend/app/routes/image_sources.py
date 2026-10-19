"""Explicit, authenticated image-source actions and local-only status reads."""
import re
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, send_file

from .. import config as cfg
from ..extensions import db
from ..models import ImageSourceAsset as Asset, ImageSourceJob as Job
from ..services import image_sources as service, image_source_metadata as metadata

bp = Blueprint('image_sources', __name__, url_prefix='/api/image-sources')


def _locked(fn):
    @wraps(fn)
    def invoke(*args, **kwargs):
        with service.runtime(current_app._get_current_object())['lock']:
            return fn(*args, **kwargs)
    return invoke


def _job(job_id):
    return Job.query.filter_by(id=job_id, user_id=cfg.LOCAL_USER).first_or_404()


def _body():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError('Send a JSON object.')
    return value


def _integer(value, minimum, maximum):
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        raise ValueError(f'Enter a whole number from {minimum} to {maximum}.')
    return value


@bp.errorhandler(ValueError)
def invalid(error):
    return jsonify({'error': str(error)}), 400


@bp.get('')
def sources():
    from ..capabilities import probe_image_source_deps
    saved = service._credentials()
    jobs = Job.query.filter_by(user_id=cfg.LOCAL_USER).order_by(Job.created_at.desc()).limit(30)
    return jsonify({'providers': [{'id': key, 'name': name, 'credentials_saved': bool(saved.get(key))}
                                  for key, (name, _) in metadata.PROVIDERS.items()],
                    'capability': probe_image_source_deps(),
                    'settings': service.settings(),
                    'jobs': [service.payload(job) for job in jobs]})


@bp.post('/settings')
@_locked
def settings():
    if Job.query.filter(Job.state.in_(('queued', 'running'))).first():
        raise ValueError('Stop queued and running source jobs before changing extractors.')
    return jsonify({'ok': True, **service.save_settings(_body())})


@bp.post('/credentials/<provider>')
def credentials(provider):
    service.save_credentials(provider, _body())
    return jsonify({'ok': True})


@bp.post('/jobs')
def create():
    from ..capabilities import probe_image_source_deps
    data = _body()
    url = data.get('url') or metadata.search_url(data.get('provider'), data.get('tags'))
    provider, url = metadata.source_url(url)
    limit = _integer(data.get('limit', 200), 1, metadata.MAX_ITEMS)
    destination = data.get('destination')
    if destination not in ('bank', 'dataset'):
        raise ValueError('Choose Bank or Dataset as the destination.')
    target_id = data.get('target_id')
    if target_id is not None:
        _integer(target_id, 1, 2 ** 31 - 1)
    if destination == 'dataset':
        from ..services.face_dataset_service import get_dataset
        if not target_id or not get_dataset(cfg.LOCAL_USER, target_id):
            raise ValueError('Choose an existing Dataset.')
    elif target_id:
        from ..services.image_bank_service import get_bank
        if not get_bank(cfg.LOCAL_USER, target_id):
            raise ValueError('Choose an existing Bank.')
    name = data.get('name') or 'Source Import'
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
        raise ValueError('Enter a Bank name with at most 100 characters.')
    if not probe_image_source_deps()['ok']:
        return jsonify({'error': 'Install image sources before scanning.', 'action': 'image_source_extras'}), 409
    engine, media, forced = data.get('engine', 'auto'), data.get('media', 'images'), data.get('extractor', '')
    if engine not in ('auto', 'gallery-dl', 'yt-dlp') or media not in ('images', 'videos', 'all'):
        raise ValueError('Choose a valid downloader and media filter.')
    if (not isinstance(forced, str) or len(forced) > 80
            or forced and not re.fullmatch('[a-z0-9][a-z0-9_-]*', forced)
            or forced in ('directlink', 'g', 'generic', 'noop', 'oauth', 'r', 'recursive', 'ytdl')):
        raise ValueError('Enter an extractor name without arguments.')
    if forced and engine == 'yt-dlp':
        raise ValueError('Use Auto or gallery-dl with a named gallery-dl extractor.')
    import json
    job = Job(user_id=cfg.LOCAL_USER, provider=provider, url=url, limit=limit,
              options_json=json.dumps({'engine': engine, 'media': media, 'extractor': forced}),
              destination=destination, target_id=target_id, name=name.strip())
    db.session.add(job)
    db.session.commit()
    service.launch(current_app._get_current_object(), job, 'scan')
    return jsonify({'ok': True, 'id': job.id}), 202


@bp.get('/jobs/<job_id>')
def detail(job_id):
    offset = request.args.get('offset', 0, type=int)
    query = request.args.get('q', '')
    if offset is None or not 0 <= offset <= 5000 or len(query) > 200:
        raise ValueError('Choose a valid results page or filter.')
    return jsonify(service.payload(_job(job_id), include_assets=True, offset=offset, query=query))


@bp.post('/jobs/<job_id>/<action>')
def action(job_id, action):
    job = _job(job_id)
    app = current_app._get_current_object()
    if action == 'stop':
        service.stop(app, job)
    else:
        service.launch(app, job, job.phase if action == 'resume' else action)
    return jsonify({'ok': True}), 202


@bp.post('/jobs/<job_id>/selection')
@_locked
def selection(job_id):
    job = _job(job_id)
    if job.state in ('queued', 'running'):
        return jsonify({'error': 'Stop this job before changing its selection.'}), 409
    data = _body()
    ids = data.get('ids', [])
    if not isinstance(ids, list) or len(ids) > 5000 or not isinstance(data.get('selected'), bool):
        raise ValueError('Choose a valid image selection.')
    for value in ids:
        _integer(value, 1, 2 ** 31 - 1)
    if data.get('all') is True:
        Asset.query.filter_by(job_id=job.id).update({'selected': data['selected']})
        db.session.commit()
        return jsonify({'ok': True})
    assets = Asset.query.filter(Asset.job_id == job.id, Asset.id.in_(ids)).all()
    if len(assets) != len(set(ids)):
        raise ValueError('The selection contains an item outside this job.')
    for asset in assets:
        asset.selected = data['selected']
    db.session.commit()
    return jsonify({'ok': True})


@bp.get('/jobs/<job_id>/preview/<int:asset_id>')
def preview(job_id, asset_id):
    job = _job(job_id)
    Asset.query.filter_by(job_id=job.id, id=asset_id).first_or_404()
    if not re.fullmatch('[0-9a-f]{32}', job.id):
        return jsonify({'error': 'Invalid cache identifier.'}), 400
    path = service.root(job) / f'preview-{asset_id}.jpg'
    if not path.is_file() or path.is_symlink():
        return jsonify({'error': 'Load previews or download this image first.'}), 404
    return send_file(path, mimetype='image/jpeg', conditional=True, max_age=0)


@bp.get('/jobs/<job_id>/file/<int:asset_id>')
def file(job_id, asset_id):
    job = _job(job_id)
    asset = Asset.query.filter_by(job_id=job.id, id=asset_id).first_or_404()
    path = service.local_path(job, asset)
    if path is None or not path.is_file():
        return jsonify({'error': 'Download this original first.'}), 404
    return send_file(path, as_attachment=True, download_name=f'original-{asset.id}{path.suffix}')
