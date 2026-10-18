"""Cloud-only identity UI fixture with invented images and stub vectors."""
import os
import sys
from pathlib import Path


def main():
    runtime, port = Path(sys.argv[1]).resolve(), int(sys.argv[2])
    runtime.mkdir(parents=True, exist_ok=True)
    for key in ('LDS_PROFILE_ID', 'LDS_PROFILE_NAME', 'LDS_PROFILE_PORT'):
        os.environ.pop(key, None)
    for key, name in (
        ('LDS_DATA_DIR', 'data'), ('LDS_CONFIG', 'config.json'), ('LDS_ENV', '.env'),
        ('LDS_PLUGINS_DIR', 'plugins'), ('LDS_EXTENSIONS_DIR', 'extensions'),
        ('LDS_PROFILES_HOME', 'profiles'),
    ):
        os.environ[key] = str(runtime/name)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import pytest
    from PIL import Image
    from public_plugin_fixture import create_test_app
    from werkzeug.serving import make_server
    patch = pytest.MonkeyPatch()
    app = create_test_app(runtime, patch, config_object={
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{(runtime/"state.db").as_posix()}'})
    from app import setup_state
    from app.config import LOCAL_USER
    from app.extensions import db
    from app.models import BankImage, FaceDataset, FaceDatasetImage, ImageBank
    from app.services import identity_inference
    from app.services.face_dataset_service import _dataset_dir
    from test_identity_learning import vector
    source = runtime/'sources'
    source.mkdir()
    with app.app_context():
        setup_state.complete_core()
        bank = ImageBank(user_id=LOCAL_USER, name='Demo', source_path=str(source))
        dataset = FaceDataset(user_id=LOCAL_USER, name='Demo', trigger_word='subject',
                              subject_type='human')
        db.session.add_all([bank, dataset])
        db.session.flush()
        destination = Path(_dataset_dir(dataset.id))
        destination.mkdir(parents=True, exist_ok=True)
        bank_id, dataset_id = bank.id, dataset.id
        for i in range(4):
            name = f'image-{i+1:02d}.png'
            image = Image.new('RGB', (512, 512), (30+i*20, 80, 110))
            image.save(source/name)
            image.save(destination/name)
            db.session.add(BankImage(bank_id=bank.id, relpath=name, width=512, height=512,
                                     status='pending', caption='An invented subject outdoors.'))
            db.session.add(FaceDatasetImage(dataset_id=dataset.id, filename=name, status='keep',
                                            source='import', caption='An invented subject outdoors.'))
        db.session.commit()

    def extract(items, kind):
        return [{'state': 'measured', 'subjects': [{
            'region': item.get('region') or ([0.1, 0.1, 0.4, 0.4] if kind == 'person' else None),
            'vector': vector(1, 0, dimension=512 if kind == 'person' else 768)}]} for item in items]
    patch.setattr(identity_inference, 'extract', extract)
    patch.setattr(identity_inference, 'character_tags',
                  lambda paths, engine: {path: {'aster_demo': 0.92} for path in paths})

    @app.get('/test/ready')
    def ready():
        return {'bank_id': bank_id, 'dataset_id': dataset_id}

    @app.get('/test/state')
    def state():
        import hashlib
        return {'bank': [(r.id, r.status, r.caption) for r in BankImage.query.order_by(BankImage.id)],
                'dataset': [(r.id, r.status, r.caption) for r in FaceDatasetImage.query.order_by(FaceDatasetImage.id)],
                'hashes': [hashlib.sha256((source/f'image-{i:02d}.png').read_bytes()).hexdigest()
                           for i in range(1, 5)]}

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
        patch.undo()
        with app.app_context():
            db.session.remove()
            db.engine.dispose()


if __name__ == '__main__':
    main()
