"""Synthetic Bank server for the cloud Other Tags browser check."""
import os
import sys
from pathlib import Path


def main():
    runtime = Path(sys.argv[1]).resolve()
    port = int(sys.argv[2])
    runtime.mkdir(parents=True, exist_ok=True)
    for key, name in (
        ('LDS_DATA_DIR', 'data'), ('LDS_CONFIG', 'config.json'), ('LDS_ENV', '.env'),
        ('LDS_PLUGINS_DIR', 'plugins'), ('LDS_EXTENSIONS_DIR', 'extensions'),
    ):
        os.environ[key] = str(runtime / name)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    import pytest
    from PIL import Image
    from public_plugin_fixture import create_test_app
    from werkzeug.serving import make_server

    patch = pytest.MonkeyPatch()
    app = create_test_app(runtime, patch, enabled=('video',), config_object={
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{(runtime / "state.db").as_posix()}',
    })
    from app.config import LOCAL_USER
    from app.extensions import db
    from app.models import BankImage, ImageBank
    from app import setup_state

    with app.app_context():
        setup_state.complete_core()
        source = runtime / 'sources'
        source.mkdir(exist_ok=True)
        bank = ImageBank(user_id=LOCAL_USER, name='Demo', source_path=str(source))
        db.session.add(bank)
        db.session.flush()
        blue = [f'synthetic_blue_{index:04d}' for index in range(150)]
        rows = [blue + ['synthetic_long_' + 'segment_' * 20],
                ['synthetic_red'], [blue[-1]], ['shirt', blue[-1]]]
        for index, tags in enumerate(rows):
            name = f'image-{index + 1:02d}.png'
            Image.new('RGB', (256, 256), (40, 60, 80)).save(source / name)
            db.session.add(BankImage(
                bank_id=bank.id, relpath=name, width=256, height=256,
                status='pending', tags_state='ok', tags_text=',' + ','.join(tags) + ',',
            ))
        db.session.commit()
        bank_id = bank.id
        import_folders = []
        for index in range(5):
            folder = runtime / f'import-{index + 1:02d}'
            for child, count in (('alpha', 2), ('beta', 3), ('', 1)):
                target = folder / child
                target.mkdir(parents=True, exist_ok=True)
                for image_index in range(count):
                    Image.new('RGB', (64, 64), (40, 60, 80)).save(
                        target / f'image-{image_index + 1:02d}.png')
            import_folders.append(str(folder))

    @app.get('/test/ready')
    def ready():
        return {'bank_id': bank_id, 'import_folders': import_folders}

    @app.post('/test/shutdown')
    def shutdown():
        import threading
        threading.Thread(target=server.shutdown, daemon=True).start()
        return {'stopping': True}

    server = make_server('127.0.0.1', port, app, threaded=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        with app.app_context():
            db.session.remove()
            db.engine.dispose()


if __name__ == '__main__':
    main()
