"""Isolated, synthetic acquisition server for the cloud browser probe."""
import io
import os
from pathlib import Path
import sys
import zipfile


def main():
    runtime = Path(sys.argv[1]).resolve()
    runtime.mkdir(parents=True, exist_ok=True)
    for key, name in (('LDS_DATA_DIR', 'data'), ('LDS_CONFIG', 'config.json'),
                      ('LDS_ENV', '.env'), ('LDS_PLUGINS_DIR', 'plugins'),
                      ('LDS_EXTENSIONS_DIR', 'extensions')):
        os.environ[key] = str(runtime / name)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import pytest
    from PIL import Image
    from public_plugin_fixture import create_test_app
    from werkzeug.serving import make_server
    from flask import jsonify
    patch = pytest.MonkeyPatch()
    app = create_test_app(runtime, patch, config_object={
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{(runtime / "state.db").as_posix()}',
    })
    from app import capabilities, setup_state
    from app.config import LOCAL_USER
    from app.extensions import db
    from app.models import FaceDataset
    from app.services import image_sources as sources
    calls = {'scans': 0, 'downloads': 0}
    images = []
    for index in range(28):
        output = io.BytesIO()
        Image.new('RGB', (320, 384), (20 + index * 4, 50, 90)).save(output, 'PNG')
        images.append(output.getvalue())
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w') as handle:
        handle.writestr('image-01.png', images[27])

    def scan(job, cancel, control):
        calls['scans'] += 1
        for index in range(job.position, min(26, job.position + job.limit)):
            if cancel.is_set():
                raise InterruptedError()
            extension = 'zip' if index == 25 else 'png'
            yield [3, f'https://cdn.example.test/{index}.{extension}',
                   {'id': index + 1, 'extension': extension,
                    'tags': f'synthetic_{index} blue', 'tags_artist': ['demo_artist'],
                    'width': 320, 'height': 384,
                    'preview_url': f'https://cdn.example.test/{index}.png'}]

    def fetch(url, **kwargs):
        calls['downloads'] += 1
        if url.endswith('.zip'):
            return archive.getvalue()
        return images[int(url.rsplit('/', 1)[-1].split('.')[0])]

    def download(job, cancel, control, extra=None):
        if not extra or extra.get('action') != 'download':
            raise AssertionError('Only synthetic downloads use this adapter.')
        from app.models import ImageSourceAsset
        for asset in ImageSourceAsset.query.filter_by(job_id=job.id, selected=True).order_by(ImageSourceAsset.id):
            if asset.source_key not in extra['keys']:
                continue
            if cancel.is_set():
                raise InterruptedError()
            extension = 'zip' if asset.kind == 'archive' else 'png'
            name = asset.source_key + '.' + extension
            (Path(extra['directory']) / name).write_bytes(fetch(asset.url))
            yield [4, asset.source_key, {'file': name}]

    patch.setattr(sources, 'scan_events', scan)
    patch.setattr(sources, 'worker_events', download)
    patch.setattr(sources, 'fetch', fetch)
    patch.setattr(capabilities, 'probe_image_source_deps', lambda: {'ok': True})
    with app.app_context():
        setup_state.complete_core()
        dataset = FaceDataset(user_id=LOCAL_USER, name='Demo', trigger_word='demo', kind='concept')
        db.session.add(dataset)
        db.session.commit()
        dataset_id = dataset.id

    @app.get('/test/ready')
    def ready():
        return jsonify({'dataset_id': dataset_id, **calls})

    make_server('127.0.0.1', int(sys.argv[2]), app, threaded=True).serve_forever()


if __name__ == '__main__':
    main()
