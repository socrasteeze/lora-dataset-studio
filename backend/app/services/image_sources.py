"""Manual image acquisition: durable intent, bounded workers, separate intake.

Only launch() starts work. Startup recovery and all list/read routes remain
local. A restart requires Resume; it never silently restarts an online job.
"""
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import queue
import shutil
import stat
import subprocess
import sys
import threading
import time
import warnings
import zipfile

from PIL import Image
import psutil

from .. import config as cfg
from ..extensions import db
from ..models import ImageSourceAsset as Asset, ImageSourceJob as Job
from . import image_source_metadata as metadata
from .image_source_network import SourceNetworkError, extractor_proxy, fetch

IMAGE_BYTES = 64 * 1024 * 1024
ARCHIVE_BYTES = 256 * 1024 * 1024
JOB_BYTES = 2 * 1024 * 1024 * 1024
_SECRET = 'IMAGE_SOURCE_CREDENTIALS'
_credentials_lock = threading.Lock()


def _kill_process(process):
    """Stop this job's native downloader and any local media merge children."""
    if process.poll() is not None:
        return
    try:
        parent = psutil.Process(process.pid)
        for child in parent.children(recursive=True):
            try:
                child.kill()
            except psutil.Error:
                pass
        parent.kill()
    except psutil.NoSuchProcess:
        pass


def runtime(app):
    return app.extensions.setdefault('image_sources', {
        'lock': threading.RLock(), 'worker': None, 'cancel': threading.Event(),
        'process': None, 'active': None,
    })


def recover():
    Job.query.filter(Job.state.in_(('queued', 'running'))).update(
        {'state': 'interrupted', 'error': 'The app stopped. Select Resume to continue.'},
        synchronize_session=False)
    db.session.commit()


def root(job):
    return Path(os.environ.get('LDS_DATA_DIR', str(cfg.REPO_ROOT / 'data'))) / 'image_sources' / job.id


def local_path(job, asset):
    if not asset.local_name:
        return None
    path = root(job) / asset.local_name
    if path.parent.resolve() != root(job).resolve() or path.is_symlink():
        raise ValueError('The cached file path is invalid.')
    return path


def _credentials():
    try:
        value = json.loads(cfg.secret(_SECRET) or '{}')
        return value if isinstance(value, dict) else {}
    except ValueError:
        return {}


def save_credentials(provider, values):
    if not metadata.provider_id(provider) or not isinstance(values, dict):
        raise ValueError('Choose a source before saving credentials.')
    clean = {}
    for key in ('username', 'password', 'api_key', 'user_id', 'cookies', 'access_token',
                'access_token_secret', 'client_id', 'client_secret', 'refresh_token'):
        value = values.get(key, '')
        if (not isinstance(value, str) or len(value) > 8192
                or any(ord(char) < 32 for char in value)):
            raise ValueError('Credentials must contain one line of text.')
        if value:
            clean[key] = value
    with _credentials_lock:
        saved = _credentials()
        saved[provider] = clean
        cfg.set_secrets({_SECRET: json.dumps(saved)})


def settings():
    return {'extractors_dir': cfg.get('image_sources.extractors_dir') or ''}


def _extractor_directory(value):
    if not value:
        return ''
    try:
        folder = Path(value).expanduser().resolve(strict=True)
        files = list(folder.glob('*.py'))
        if not folder.is_dir() or not 1 <= len(files) <= 200:
            raise ValueError('Choose a directory with 1-200 local extractor modules.')
        if any(path.is_symlink() for path in files):
            raise ValueError('Extractor module links are not supported.')
    except OSError as exc:
        raise ValueError('The host cannot read the extractor directory. Check its permissions or drive connection.') from exc
    return str(folder)


def save_settings(values):
    value = values.get('extractors_dir', '')
    if not isinstance(value, str) or len(value) > 4096:
        raise ValueError('Enter a valid host extractor directory.')
    value = _extractor_directory(value)
    cfg.save_config({'image_sources': {'extractors_dir': value}})
    return settings()


def extractor_config(job, proxy):
    from http.cookies import SimpleCookie
    secret = _credentials().get(job.provider, {})
    options = {'proxy': proxy, 'proxy-env': False, 'netrc': False,
               'timeout': 20, 'retries': 0,
               'sleep-429': 0,
               'external': False, 'parent': False, 'metadata': True,
               'tags': True}
    site = {}
    for source, target in (('username', 'username'), ('api_key', 'api-key'), ('user_id', 'user-id')):
        if secret.get(source):
            site[target] = secret[source]
    if job.provider in ('danbooru', 'e621', 'e926') and secret.get('api_key'):
        site['password'] = secret['api_key']
    if secret.get('cookies'):
        cookies = SimpleCookie()
        cookies.load(secret['cookies'])
        site['cookies'] = {key: value.value for key, value in cookies.items()}
    options[job.provider] = site
    # Apply by extractor category, including alternate public source domains.
    options.setdefault('pawchive', {}).update(
        {'expand': True, 'original': True, 'previews': False, 'sleep-request': '3-6'})
    directory = _extractor_directory(settings()['extractors_dir'])
    options['module-sources'] = [directory, None] if directory else [None]
    return {'extractor': options, 'output': {'jsonl': True, 'private': False},
            'cache': {'file': str(root(job) / 'extractor-cache.sqlite3')}}


def worker_events(job, cancel, control, extra=None):
    """Stream capped JSONL. The child sees only its explicit configuration."""
    if cancel.is_set():
        raise InterruptedError()
    # Validate configured modules before starting the child. The mounted host
    # directory can become unavailable between Save and an explicit job action.
    _extractor_directory(settings()['extractors_dir'])
    with extractor_proxy() as proxy:
        environment = {key: value for key, value in os.environ.items()
                       if key.upper() in {'SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP',
                                          'LANG', 'LC_ALL'}}
        environment.update(PYTHONUTF8='1', PYTHONIOENCODING='utf-8', PYTHONNOUSERSITE='1',
                           PYTHONDONTWRITEBYTECODE='1')
        worker = Path(__file__).resolve().parents[1] / 'scrape' / 'image_source_worker.py'
        with control['lock']:
            if cancel.is_set():
                raise InterruptedError()
            process = subprocess.Popen([sys.executable, str(worker)], stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                       env=environment, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            control['process'] = process
        messages = queue.Queue(maxsize=16)
        stop_reader = threading.Event()

        def publish(value):
            while not stop_reader.is_set():
                try:
                    messages.put(value, timeout=0.2)
                    return
                except queue.Full:
                    continue

        def read():
            try:
                while not stop_reader.is_set():
                    line = process.stdout.readline(131073)
                    if not line:
                        break
                    if len(line) > 131072:
                        publish(ValueError('The extractor response exceeds the metadata limit.'))
                        return
                    publish(line)
            finally:
                publish(None)

        reader = threading.Thread(target=read, daemon=True)
        reader.start()
        try:
            root(job).mkdir(parents=True, exist_ok=True)
            options = json.loads(job.options_json or '{}')
            request = {'action': 'scan', 'url': job.url, 'provider': job.provider,
                       'config': extractor_config(job, proxy), 'proxy': proxy,
                       'credentials': _credentials().get(job.provider, {}),
                       'engine': options.get('engine', 'auto'), 'start': job.position,
                       'limit': job.limit, 'force_extractor': options.get('extractor', '')}
            request.update(extra or {})
            process.stdin.write(json.dumps(request).encode())
            process.stdin.close()
            deadline, used = time.monotonic() + 900, 0
            while True:
                if cancel.is_set():
                    raise InterruptedError()
                if extra and extra.get('action') == 'download':
                    used_disk = sum(path.stat().st_size for path in root(job).rglob('*')
                                    if path.is_file() and not path.is_symlink())
                    if used_disk > JOB_BYTES or shutil.disk_usage(root(job)).free < 256 * 1024 * 1024:
                        raise SourceNetworkError('The source job reached its storage limit.', 'storage')
                if time.monotonic() > deadline:
                    raise ValueError('The scan reached its time limit. Resume to continue.')
                try:
                    line = messages.get(timeout=0.2)
                except queue.Empty:
                    continue
                if line is None:
                    break
                if isinstance(line, Exception):
                    raise line
                used += len(line)
                if used > 32 * 1024 * 1024:
                    raise ValueError('The scan reached its metadata limit. Resume to continue.')
                try:
                    event = json.loads(line)
                except ValueError as exc:
                    raise ValueError('The extractor returned invalid metadata.') from exc
                if isinstance(event, list) and event:
                    yield event
            if process.wait(timeout=5) != 0:
                raise SourceNetworkError('The source scan failed. Check credentials or retry later.')
        finally:
            stop_reader.set()
            if process.poll() is None:
                _kill_process(process)
            process.wait(timeout=10)
            process.stdout.close()
            if process.stdin and not process.stdin.closed:
                process.stdin.close()
            reader.join(timeout=2)
            control['process'] = None


def scan_events(job, cancel, control):
    yield from worker_events(job, cancel, control)


def _source_failure(kind):
    message = {
        'unsupported': 'No extractor accepts this URL. Check the URL, downloader or local extractor folder.',
        'auth': 'The source requires access. Save its credentials, then select Resume.',
        'configuration': 'The source modules could not load. Check Extractor Folder and install source packages.',
    }.get(kind, 'The source action failed. Check source access or retry later.')
    return SourceNetworkError(message, kind or 'network')


def _scan(job, cancel, control):
    start = job.position
    known = {asset.source_key for asset in Asset.query.filter_by(job_id=job.id)}
    for event in scan_events(job, cancel, control):
        if cancel.is_set():
            raise InterruptedError()
        if event[0] == -1:
            kind = event[1].get('kind') if len(event) > 1 and isinstance(event[1], dict) else None
            raise _source_failure(kind)
        if event[0] != 3 or len(event) < 3 or not isinstance(event[2], dict):
            continue
        if job.position - start >= job.limit:
            break
        item = (event[2]['acquisition_item'] if 'acquisition_item' in event[2]
                else metadata.media_item(job.provider, job.url, event[1], event[2]))
        if item and item['key'] not in known:
            if len(known) >= 5000:
                raise ValueError('This job reached 5000 items. Create a narrower source query.')
            selected = json.loads(job.options_json or '{}').get('media', 'images')
            db.session.add(Asset(job_id=job.id, source_key=item['key'], url=item['url'],
                                 thumbnail=item['thumbnail'], kind=item['kind'],
                                 selected=(selected == 'all' or item['kind'] in ('image', 'archive')
                                           if selected != 'videos' else item['kind'] == 'video'),
                                 metadata_json=json.dumps(item['metadata'])))
            known.add(item['key'])
        elif item:
            existing = Asset.query.filter_by(job_id=job.id, source_key=item['key']).one()
            existing.url, existing.thumbnail = item['url'], item['thumbnail']
            if existing.sha256:
                item['metadata']['sha256'] = existing.sha256
            existing.metadata_json = json.dumps(item['metadata'])
        job.position += 1
        job.done += 1
        db.session.commit()
    if job.position == start:
        job.error = 'The scan returned no more supported originals.'


def _space(job, amount):
    root(job).mkdir(parents=True, exist_ok=True)
    used = sum(path.stat().st_size for path in root(job).rglob('*')
               if path.is_file() and not path.is_symlink())
    if used + amount > JOB_BYTES:
        raise SourceNetworkError('The job reached its 2 GiB storage limit.', 'storage')
    if shutil.disk_usage(root(job)).free < amount + 256 * 1024 * 1024:
        raise SourceNetworkError('The destination has insufficient free space.', 'storage')


def _write(job, name, data):
    _space(job, len(data))
    path = root(job) / name
    temporary = root(job) / 'download.part'
    if path.is_symlink() or temporary.is_symlink():
        raise ValueError('The destination contains an unsafe link.')
    with temporary.open('wb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    return path


def _image_bytes(raw):
    from .face_dataset_service import _preserved_import_extension
    if len(raw) > IMAGE_BYTES:
        raise ValueError('The image exceeds the 64 MiB import limit.')
    return _preserved_import_extension(raw, label='source image')


def _original_extension(raw):
    from .face_dataset_service import _validate_import_header_dimensions
    if len(raw) > IMAGE_BYTES:
        raise ValueError('The image exceeds the 64 MiB download limit.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(raw)) as image:
            _validate_import_header_dimensions(image, label='source image')
            extension = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp',
                         'AVIF': '.avif', 'GIF': '.gif'}.get(image.format)
            if extension is None:
                raise ValueError('The original image format is unsupported.')
            image.verify()
    return extension


def _preview(job, asset, raw):
    _original_extension(raw)
    with Image.open(io.BytesIO(raw)) as image:
        image.thumbnail((320, 320))
        out = io.BytesIO()
        image.convert('RGB').save(out, 'JPEG', quality=80)
    _write(job, f'preview-{asset.id}.jpg', out.getvalue())


def _archive(job, asset, raw, cancel):
    """Validate the complete ZIP directory before any member reaches intake."""
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if len(entries) > 1000 or sum(entry.file_size for entry in entries) > 512 * 1024 * 1024:
            raise ValueError('The archive exceeds the entry or expanded-size limit.')
        for entry in entries:
            parts = entry.filename.replace('\\', '/').split('/')
            if (entry.filename.startswith(('/', '\\')) or '..' in parts or ':' in entry.filename
                    or stat.S_ISLNK(entry.external_attr >> 16) or entry.flag_bits & 1
                    or entry.file_size > IMAGE_BYTES
                    or entry.file_size > max(1, entry.compress_size) * 200):
                raise ValueError('The archive contains an unsafe or unsupported entry.')
        # Retain the validated ZIP before extraction so interruption does not
        # require another original download.
        if not asset.local_name:
            checksum = hashlib.sha256(raw).hexdigest()
            _write(job, checksum + '.zip', raw)
            asset.local_name, asset.sha256 = checksum + '.zip', checksum
            db.session.commit()
        for index, entry in enumerate(entries):
            if cancel.is_set():
                raise InterruptedError()
            if entry.is_dir() or entry.filename.rsplit('.', 1)[-1].lower() not in metadata.IMAGE_EXTENSIONS:
                continue
            data = archive.read(entry)
            extension = _original_extension(data)
            checksum = hashlib.sha256(data).hexdigest()
            key = hashlib.sha256(f'{asset.source_key}:{index}:{checksum}'.encode()).hexdigest()
            child = Asset.query.filter_by(job_id=job.id, source_key=key).first()
            if child is None:
                if Asset.query.filter_by(job_id=job.id).count() >= 5000:
                    raise ValueError('This job reached its 5000-item limit. Use a smaller source selection.')
                meta = json.loads(asset.metadata_json)
                meta['sha256'] = checksum
                meta['extension'] = extension.removeprefix('.')
                child = Asset(job_id=job.id, source_key=key, url=asset.url,
                              kind='image', selected=True, sha256=checksum,
                              metadata_json=json.dumps(meta), local_name=checksum + extension)
                _write(job, child.local_name, data)
                db.session.add(child)
                db.session.flush()
                _preview(job, child, data)
                db.session.commit()


def _download(job, cancel, control=None):
    """Use source-native authentication, streams and custom extractor behavior."""
    if control is None:
        from flask import current_app
        control = runtime(current_app._get_current_object())
    assets = Asset.query.filter_by(job_id=job.id, selected=True).order_by(Asset.id).all()
    job.total = len(assets)
    pending = {}
    for asset in assets:
        if cancel.is_set():
            raise InterruptedError()
        path = local_path(job, asset)
        if path and path.is_file() and not path.is_symlink():
            valid = _checksum(path) == asset.sha256
            if valid:
                if asset.kind == 'archive':
                    _extract_cached_archive(job, asset, path, cancel)
                elif asset.kind == 'image':
                    _preview(job, asset, path.read_bytes())
                    asset.error = None
                job.done += 1
                continue
        pending[asset.source_key] = asset
    db.session.commit()
    if not pending:
        return
    native = root(job) / 'native'
    if native.is_symlink():
        raise ValueError('The download directory contains an unsafe link.')
    native.mkdir(parents=True, exist_ok=True)
    groups = {}
    for key, asset in pending.items():
        meta = json.loads(asset.metadata_json)
        groups.setdefault((meta.get('engine', 'gallery-dl'), meta.get('generic', False)), []).append(key)
    for (engine, generic), keys in groups.items():
        extra = {'action': 'download', 'engine': engine, 'generic': generic, 'directory': str(native),
                 'keys': keys, 'max_bytes': JOB_BYTES - 256 * 1024 * 1024,
                 'targets': [{'key': key, 'page': json.loads(pending[key].metadata_json)['source_url']}
                             for key in keys]}
        _receive_downloads(job, pending, native, cancel, control, extra)
    if pending:
        raise ValueError('The source did not return every selected item. Rescan to refresh its media URLs.')


def _checksum(path):
    checksum = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


def _extract_cached_archive(job, asset, path, cancel):
    try:
        if path.stat().st_size > ARCHIVE_BYTES:
            raise ValueError('The ZIP exceeds the 256 MiB extraction limit. Save Original remains available.')
        _archive(job, asset, path.read_bytes(), cancel)
        asset.error = None
    except (ValueError, OSError, zipfile.BadZipFile):
        asset.error = 'The ZIP cannot be extracted safely. Save Original remains available.'
    db.session.commit()


def _receive_downloads(job, pending, native, cancel, control, extra):
    for event in worker_events(job, cancel, control, extra):
        if cancel.is_set():
            raise InterruptedError()
        if event[0] == -1:
            kind = event[1].get('kind') if len(event) > 1 and isinstance(event[1], dict) else None
            raise _source_failure(kind)
        if len(event) < 3 or event[0] != 4 or event[1] not in pending or not isinstance(event[2], dict):
            continue
        asset = pending[event[1]]
        path = native / str(event[2].get('file', ''))
        if path.parent.resolve() != native.resolve() or not path.is_file() or path.is_symlink():
            raise ValueError('The downloader returned an invalid file path.')
        if not 0 < path.stat().st_size <= extra['max_bytes']:
            raise ValueError('The downloaded file exceeds the job limit.')
        checksum = _checksum(path)
        extension = path.suffix.lower()
        if asset.kind == 'image':
            if path.stat().st_size > IMAGE_BYTES:
                raise ValueError('The image exceeds the 64 MiB import limit.')
            raw = path.read_bytes()
            extension = _original_extension(raw)
        if not extension or len(extension) > 12 or not extension[1:].isalnum():
            extension = '.bin'
        target = root(job) / (checksum + extension)
        if target.is_symlink():
            raise ValueError('The destination contains an unsafe link.')
        os.replace(path, target)
        asset.sha256, asset.local_name, asset.error = checksum, target.name, None
        value = json.loads(asset.metadata_json)
        value['sha256'] = checksum
        asset.metadata_json = json.dumps(value)
        db.session.commit()
        if asset.kind == 'archive':
            _extract_cached_archive(job, asset, target, cancel)
        elif asset.kind == 'image':
            _preview(job, asset, raw)
        job.done += 1
        pending.pop(event[1])
        db.session.commit()


def _previews(job, cancel):
    assets = Asset.query.filter_by(job_id=job.id, selected=True).order_by(Asset.id).limit(24).all()
    job.total = len(assets)
    for asset in assets:
        if cancel.is_set():
            raise InterruptedError()
        path = local_path(job, asset)
        if asset.kind == 'image' and (asset.thumbnail or path):
            try:
                raw = path.read_bytes() if path and path.is_file() else fetch(
                    asset.thumbnail, max_bytes=8 * 1024 * 1024,
                    referer=json.loads(asset.metadata_json)['source_url'], cancel=cancel)
                _preview(job, asset, raw)
            except SourceNetworkError as exc:
                asset.error = 'The preview is unavailable. Download the original to inspect it.'
                db.session.commit()
                if exc.kind in ('rate_limit', 'auth', 'storage'):
                    raise
            except (ValueError, OSError):
                asset.error = 'The preview is unavailable. Download the original to inspect it.'
        job.done += 1
        db.session.commit()


def _worker(app):
    control = runtime(app)
    try:
        _drain(app)
    except Exception:
        # A failed state write must not strand the in-process worker slot or
        # print database parameters containing private source metadata.
        logging.getLogger(__name__).error('The image-source queue stopped. Resume interrupted jobs.')
        with control['lock'], app.app_context():
            db.session.rollback()
            try:
                recover()
            except Exception:
                db.session.rollback()
            finally:
                if control['worker'] is threading.current_thread():
                    control['worker'], control['active'] = None, None


def _drain(app):
    control = runtime(app)
    with app.app_context():
        while True:
            with control['lock']:
                db.session.expire_all()
                job = Job.query.filter_by(state='queued').order_by(Job.created_at, Job.id).first()
                if job is None:
                    control['worker'], control['active'] = None, None
                    return
                job.state, job.done, job.error = 'running', 0, None
                job_id = job.id
                control['active'], control['cancel'] = job.id, threading.Event()
                cancel = control['cancel']
                db.session.commit()
            try:
                if job.phase == 'scan':
                    _scan(job, cancel, control)
                elif job.phase == 'download':
                    _download(job, cancel, control)
                elif job.phase == 'previews':
                    _previews(job, cancel)
                else:
                    from .image_source_import import import_job
                    import_job(job, cancel)
                job.state = 'ready'
            except InterruptedError:
                db.session.rollback()
                job = db.session.get(Job, job_id)
                job.state, job.error = 'cancelled', 'The job stopped. Completed files remain available.'
            except Exception as exc:
                db.session.rollback()
                job = db.session.get(Job, job_id)
                job.state = 'failed'
                job.error = str(exc) if isinstance(exc, (ValueError, SourceNetworkError)) else 'The job failed. Retry to continue.'
            finally:
                if cancel.is_set():
                    job.state = 'cancelled'
                db.session.commit()
                db.session.remove()


def launch(app, job, phase):
    if phase not in ('scan', 'rescan', 'download', 'import', 'previews'):
        raise ValueError('Choose a valid job action.')
    control = runtime(app)
    with control['lock']:
        db.session.refresh(job)
        if job.state in ('queued', 'running'):
            raise ValueError('This job already has queued or running work.')
        if phase == 'rescan':
            job.position, phase = 0, 'scan'
        if phase == 'scan' and job.position >= 5000:
            raise ValueError('This job reached its scan limit. Create a narrower query.')
        job.phase, job.state, job.error = phase, 'queued', None
        job.total = job.limit if phase == 'scan' else 0
        db.session.commit()
        if control['worker'] is None:
            thread = threading.Thread(target=_worker, args=(app,), daemon=True)
            control['worker'] = thread
            try:
                thread.start()
            except Exception:
                control['worker'] = None
                job.state = 'interrupted'
                db.session.commit()
                raise


def stop(app, job):
    control = runtime(app)
    with control['lock']:
        if control['active'] == job.id:
            control['cancel'].set()
            process = control['process']
            if process and process.poll() is None:
                _kill_process(process)
        elif job.state == 'queued':
            job.state = 'cancelled'
            db.session.commit()


def payload(job, *, include_assets=False, offset=0, query=''):
    result = {key: getattr(job, key) for key in (
        'id', 'provider', 'url', 'state', 'phase', 'position', 'limit',
        'done', 'total', 'destination', 'target_id', 'name', 'error')}
    result['options'] = json.loads(job.options_json or '{}')
    from sqlalchemy import case, func
    counts = db.session.query(func.count(Asset.id),
                              func.sum(case((Asset.selected.is_(True), 1), else_=0)),
                              func.sum(case((Asset.local_name.isnot(None), 1), else_=0)),
                              func.sum(case((Asset.imported.is_(True), 1), else_=0))).filter(Asset.job_id == job.id).one()
    for key, value in zip(('count', 'selected_count', 'downloaded_count', 'imported_count'), counts):
        result[key] = value or 0
    if include_assets:
        items = Asset.query.filter_by(job_id=job.id)
        if query:
            items = items.filter(Asset.metadata_json.contains(query, autoescape=True))
        result['filtered_count'] = items.count()
        result['offset'] = offset
        result['items'] = [{
            'id': asset.id, 'kind': asset.kind, 'selected': asset.selected,
            'metadata': json.loads(asset.metadata_json), 'downloaded': bool(asset.local_name),
            'imported': asset.imported, 'error': asset.error,
            'preview': (root(job) / f'preview-{asset.id}.jpg').is_file(),
        } for asset in items.order_by(Asset.id).offset(offset).limit(24)]
    return result
