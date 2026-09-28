import re

from flask import Flask
from sqlalchemy import text


def test_legacy_recovery_ids_are_distinct_stable_and_additive():
    from app import _apply_additive_migrations
    from app.extensions import db

    application = Flask(__name__)
    application.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', TESTING=True)
    db.init_app(application)
    with application.app_context():
        try:
            for table in ('face_dataset', 'image_bank', 'bank_image'):
                db.session.execute(text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY)'))
                db.session.execute(text(f'INSERT INTO {table} (id) VALUES (1), (2)'))
            db.session.commit()
            _apply_additive_migrations()
            before = []
            for table in ('face_dataset', 'image_bank', 'bank_image'):
                rows = db.session.execute(text(f'SELECT id, instance_id FROM {table} ORDER BY id')).all()
                assert [row[0] for row in rows] == [1, 2]
                before.extend(row[1] for row in rows)
            assert len(set(before)) == 6
            assert all(re.fullmatch('[0-9a-f]{32}', value) for value in before)
            _apply_additive_migrations()
            after = []
            for table in ('face_dataset', 'image_bank', 'bank_image'):
                after.extend(row[0] for row in db.session.execute(text(
                    f'SELECT instance_id FROM {table} ORDER BY id')).all())
            assert after == before
        finally:
            db.session.remove()
            db.engine.dispose()


def test_new_banks_and_images_get_distinct_recovery_ids(app, tmp_path):
    from app.extensions import db
    from app.models import ImageBank, BankImage
    with app.app_context():
        bank = ImageBank(user_id='local', name='Example', source_path=str(tmp_path))
        db.session.add(bank)
        db.session.flush()
        first = BankImage(bank_id=bank.id, relpath='first.png')
        second = BankImage(bank_id=bank.id, relpath='second.png')
        db.session.add_all([first, second])
        db.session.commit()
        assert len({bank.instance_id, first.instance_id, second.instance_id}) == 3
        assert all(re.fullmatch('[0-9a-f]{32}', value)
                   for value in (bank.instance_id, first.instance_id, second.instance_id))
