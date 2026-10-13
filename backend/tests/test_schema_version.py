"""A database from before bank collections keeps its rows across boot."""


def test_pre_collections_file_keeps_its_rows(tmp_path, monkeypatch):
    from sqlalchemy import text
    from app import SCHEMA_VERSION, _apply_additive_migrations
    from app.extensions import db
    from app.models import BankImage, ImageBank
    from public_plugin_fixture import create_test_app, dispose_test_app

    db_path = tmp_path / 'pre.db'
    uri = 'sqlite:///' + db_path.resolve().as_posix()
    app = create_test_app(tmp_path / 'boot1', monkeypatch, config_object={
        'SQLALCHEMY_DATABASE_URI': uri})
    try:
        with app.app_context():
            folder = tmp_path / 'photos'
            folder.mkdir()
            bank = ImageBank(user_id='local', name='Kept', source_path=str(folder))
            db.session.add(bank)
            db.session.flush()
            db.session.add(BankImage(bank_id=bank.id, relpath='a.png'))
            db.session.add(BankImage(bank_id=bank.id, relpath='b.png'))
            db.session.commit()
            before = db.session.execute(text('SELECT COUNT(*) FROM bank_image')).scalar()
            db.session.execute(text('PRAGMA foreign_keys=OFF'))
            db.session.execute(text('DROP TABLE IF EXISTS bank_collection_member'))
            db.session.execute(text('DROP TABLE IF EXISTS bank_collection'))
            db.session.execute(text('DROP TABLE IF EXISTS schema_meta'))
            db.session.commit()
    finally:
        dispose_test_app(app)

    app = create_test_app(tmp_path / 'boot2', monkeypatch, config_object={
        'SQLALCHEMY_DATABASE_URI': uri})
    try:
        with app.app_context():
            assert before == 2
            assert db.session.execute(text('SELECT COUNT(*) FROM bank_image')).scalar() == 2
            assert db.session.execute(text(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='bank_collection'"
            )).first() is not None
            assert db.session.execute(text('SELECT COUNT(*) FROM bank_collection')).scalar() == 0
            assert db.session.execute(text(
                'SELECT schema_version FROM schema_meta WHERE id = 1')).scalar() == SCHEMA_VERSION
            _apply_additive_migrations()
            assert db.session.execute(text('SELECT COUNT(*) FROM bank_image')).scalar() == 2
            assert db.session.execute(text('SELECT COUNT(*) FROM schema_meta')).scalar() == 1
            assert db.session.execute(text(
                'SELECT schema_version FROM schema_meta WHERE id = 1')).scalar() == SCHEMA_VERSION
    finally:
        dispose_test_app(app)
