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

    patch = pytest.MonkeyPatch()
    app = create_test_app(runtime, patch, config_object={
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{(runtime / "state.db").as_posix()}',
    })
    from app.config import LOCAL_USER
    from app.extensions import db
    from app.models import BankImage, ImageBank

    with app.app_context():
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

    @app.get('/test/ready')
    def ready():
        return {'bank_id': bank_id}

    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False, threaded=True)


if __name__ == '__main__':
    main()
