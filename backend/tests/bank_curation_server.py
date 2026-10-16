"""Cloud-only synthetic Bank fixture for curation controls. No production state."""
import os
import sys
from pathlib import Path


def main():
    runtime = Path(sys.argv[1]).resolve()
    port = int(sys.argv[2])
    runtime.mkdir(parents=True, exist_ok=True)
    for key in ('LDS_PROFILE_ID', 'LDS_PROFILE_NAME', 'LDS_PROFILE_PORT', 'LDS_PROFILES_HOME'):
        os.environ.pop(key, None)
    for key, name in (
        ('LDS_DATA_DIR', 'data'), ('LDS_CONFIG', 'config.json'), ('LDS_ENV', '.env'),
        ('LDS_PLUGINS_DIR', 'plugins'), ('LDS_EXTENSIONS_DIR', 'extensions'),
        ('LDS_PROFILES_HOME', 'profiles'),
    ):
        os.environ[key] = str(runtime / name)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import pytest
    from public_plugin_fixture import create_test_app
    from test_image_bank_curation import _emb, _write_score_cache
    from PIL import Image
    from werkzeug.serving import make_server

    patch = pytest.MonkeyPatch()
    app = create_test_app(runtime, patch, config_object={
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{(runtime / "state.db").as_posix()}',
    })
    from app import setup_state
    from app.config import LOCAL_USER
    from app.extensions import db
    from app.models import BankImage, ImageBank

    names = [f'image-{i:02d}.png' for i in range(1, 49)]
    source = runtime / 'sources'
    source.mkdir(exist_ok=True)
    with app.app_context():
        setup_state.complete_core()
        bank = ImageBank(user_id=LOCAL_USER, name='Demo', source_path=str(source))
        db.session.add(bank)
        db.session.flush()
        bank_id = bank.id
        for index, name in enumerate(names):
            Image.new('RGB', (512, 512), (40 + index, 60, 80)).save(source / name)
            db.session.add(BankImage(bank_id=bank_id, relpath=name, width=512, height=512,
                                    status='pending'))
        db.session.commit()
    embeddings = {name: _emb(1, (i % 8) / 10, (i // 8) / 10) for i, name in enumerate(names)}
    _write_score_cache(app, bank_id, embeddings)
    with app.app_context():
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.id).all()
        for index, row in enumerate(rows):
            row.quality_state = 'ok'
            row.blur_score = 800 if index else 0
            row.width = row.height = 512
            row.framing = ('face', 'bust', 'body', 'back')[index % 4]
            row.caption = ('a woman in profile outdoors in daylight',
                           'a dog seen from behind indoors',
                           'a car in front view under studio lighting',
                           'a landscape from above at sunset')[index % 4]
            if index < 2:
                row.dup_group = 1
        db.session.commit()

    @app.get('/test/ready')
    def ready():
        return {'bank_id': bank_id}

    @app.get('/test/state')
    def state():
        import hashlib
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.id).all()
        return {'statuses': [row.status for row in rows],
                'hashes': [hashlib.sha256((source / name).read_bytes()).hexdigest() for name in names]}

    @app.post('/test/unreadable')
    def unreadable():
        BankImage.query.filter_by(bank_id=bank_id).update({'quality_state': 'unreadable'})
        db.session.commit()
        return {'ok': True}

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
