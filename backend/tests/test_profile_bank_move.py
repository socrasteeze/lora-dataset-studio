"""Synthetic regression coverage for verified metadata-only cross-profile moves.

These tests use only isolated SQLite files and invented media. They do not run
generation, read a real Bank or touch the operator's profile registry.
"""
import json
from pathlib import Path

import pytest


@pytest.fixture()
def transfer(monkeypatch, tmp_path):
    from public_plugin_fixture import create_test_app, dispose_test_app
    from instance_profiles import ProfileStore
    app = create_test_app(tmp_path / 'source', monkeypatch, config_object={
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///' + str(tmp_path / 'source.db')})
    with app.app_context():
        from app import config as cfg
        from app.extensions import db
        from app.models import (BankCollection, BankCollectionMember, BankDupDistinct,
                                BankFolderPerson, BankFolderProbe, BankImage,
                                FaceDataset, FaceDatasetImage, ImageBank)
        from app.services import profile_bank_move as moves
        from app.services import bank_undo, folder_person, npz_transport
        from sqlalchemy import create_engine
        store = ProfileStore(root=tmp_path, environ={
            'LDS_DATA_DIR': str(cfg._data_dir()), 'LDS_CONFIG': str(cfg._config_path()),
            'LDS_ENV': str(cfg.ENV_PATH)})
        destination = store.create('Example Destination')
        monkeypatch.setattr(moves, 'ProfileStore', lambda: store)
        folder = cfg._data_dir() / 'bank_sources' / 'example'
        folder.mkdir(parents=True)
        (folder / 'image-01.png').write_bytes(b'synthetic original one')
        (folder / 'image-02.png').write_bytes(b'synthetic original two')
        bank = ImageBank(user_id='local', name='Example Bank', source_path=str(folder))
        db.session.add(bank); db.session.flush()
        images = [BankImage(bank_id=bank.id, relpath=f'image-{index:02d}.png',
                            caption='invented caption', caption_origin='user',
                            status='keep', aesthetic_score=7.5, face_cluster=3,
                            tags_text=',synthetic,', edit_method='crop', edit_generation=2,
                            edit_history='[]', promoted_dataset_id=1)
                  for index in (1, 2)]
        db.session.add_all(images); db.session.flush()
        collection = BankCollection(bank_id=bank.id, name='Example Collection')
        db.session.add(collection); db.session.flush()
        db.session.add(BankCollectionMember(collection_id=collection.id, image_id=images[0].id,
                                             image_instance_id=images[0].instance_id, label='Example', position=0))
        db.session.add(BankDupDistinct(bank_id=bank.id, image_a=images[0].id, image_b=images[1].id))
        db.session.add(BankFolderPerson(bank_id=bank.id, subfolder='', cluster_id=3, sample_report='{"sample": 2}'))
        db.session.add(BankFolderProbe(bank_id=bank.id, subfolder='', verdict='one', sample=2))
        dataset = FaceDataset(user_id='local', name='Example Dataset', trigger_word='example')
        db.session.add(dataset); db.session.flush()
        linked = FaceDatasetImage(dataset_id=dataset.id, filename='example.webp',
                                  bank_image_id=images[0].id, caption='preserved dataset caption')
        db.session.add(linked); db.session.commit()
        signature = folder_person._folder_signature(bank.id, '')
        person = BankFolderPerson.query.filter_by(bank_id=bank.id).one()
        person.sample_report = json.dumps({'sample': 2, 'content_sig': signature})
        BankFolderProbe.query.filter_by(bank_id=bank.id).one().content_sig = signature
        collection.undo_state = json.dumps({'before': [{
            'id': collection.id, 'name': collection.name, 'deleted': False, 'members': [
                {'image_id': images[0].id, 'image_instance_id': images[0].instance_id,
                 'label': 'Example', 'position': 0},
                {'image_id': 777, 'image_instance_id': 'c' * 32,
                 'label': 'Missing Example', 'position': 1}]}],
            'after': [{'id': collection.id, 'revision': collection.revision}]})
        db.session.commit()
        bank_undo.record(bank.id, 'Example Decision', {
            images[0].id: {'before': ('pending', None), 'after': ('keep', None)}})
        cache = cfg._data_dir() / 'banks' / str(bank.id) / 'edited'
        cache.mkdir(parents=True)
        for image in images:
            (cache / f'{image.id}.e2.webp').write_bytes(b'synthetic crop')
        derived = cache / f'{images[0].id}.e2.webp'
        arrays = {'paths': npz_transport.unicode([str(derived), str(folder / 'image-02.png')]),
                  'sigs': npz_transport.unicode(['old-signature', 'raw-signature']),
                  'embs': npz_transport.floats([0.25, 0.5, 0.75, 1.0], (2, 2)),
                  'hashes': npz_transport.unicode(['d' * 64, 'e' * 64])}
        assert npz_transport.write_atomic(cache.parent / 'example.npz', arrays, max_file_bytes=1024 * 1024)
        engine = create_engine('sqlite:///' + str(Path(destination['paths']['LDS_DATA_DIR']) / 'studio.db'))
        db.metadata.create_all(engine)
        # A populated destination forces every global image/Bank ID to change.
        with engine.begin() as connection:
            connection.execute(ImageBank.__table__.insert(), {'id': 10, 'instance_id': 'a' * 32,
                'user_id': 'local', 'name': 'Existing', 'source_path': str(tmp_path / 'unrelated')})
            connection.execute(BankImage.__table__.insert(), {'id': 10, 'instance_id': 'b' * 32,
                'bank_id': 10, 'relpath': 'unrelated.png', 'status': 'reject'})
        engine.dispose()
        data = (app, bank.id, bank.instance_id, destination, folder, linked.id,
                {image.instance_id: image.id for image in images})
    try:
        yield data
    finally:
        from app.services import bank_undo
        bank_undo.reset()
        dispose_test_app(app)


def test_move_preserves_metadata_and_source_bytes_with_id_collisions(transfer):
    import sqlite3
    from app.extensions import db
    from app.models import BankFolderProbe, FaceDatasetImage, ImageBank
    from app.services.profile_bank_move import move_bank
    from app.services import npz_transport
    app, bank_id, instance, destination, folder, linked_id, old_ids = transfer
    with app.app_context():
        old_signature = BankFolderProbe.query.filter_by(bank_id=bank_id).one().content_sig
        db.session.rollback()
        result = move_bank('local', bank_id, instance, destination['id'], '1' * 32)
        assert db.session.get(ImageBank, bank_id) is None
        linked = db.session.get(FaceDatasetImage, linked_id)
        assert linked.caption == 'preserved dataset caption'
        assert linked.bank_image_id is None
        assert json.loads(linked.bank_profile_history)[-1]['bank_instance_id'] == instance
    assert (folder / 'image-01.png').read_bytes() == b'synthetic original one'
    assert (folder / 'image-02.png').read_bytes() == b'synthetic original two'
    database = Path(destination['paths']['LDS_DATA_DIR']) / 'studio.db'
    with sqlite3.connect(database) as target:
        target.row_factory = sqlite3.Row
        moved = target.execute('SELECT * FROM image_bank WHERE instance_id=?', (instance,)).fetchone()
        assert moved['id'] == result['bank_id'] and moved['source_path'] == str(folder)
        rows = target.execute('SELECT * FROM bank_image WHERE bank_id=?', (moved['id'],)).fetchall()
        assert len(rows) == 2
        for row in rows:
            assert row['id'] != old_ids[row['instance_id']]
            assert row['caption'] == 'invented caption' and row['status'] == 'keep'
            assert row['aesthetic_score'] == 7.5 and row['face_cluster'] == 3
            assert row['promoted_dataset_id'] is None
            assert json.loads(row['profile_history'])[-1]['promoted_dataset_id'] == 1
            cache = Path(destination['paths']['LDS_DATA_DIR']) / 'banks' / str(moved['id']) / 'edited'
            assert (cache / f"{row['id']}.e2.webp").read_bytes() == b'synthetic crop'
        assert target.execute('SELECT count(*) FROM bank_collection_member').fetchone()[0] == 1
        assert target.execute('SELECT count(*) FROM bank_dup_distinct').fetchone()[0] == 1
        assert target.execute('SELECT count(*) FROM bank_folder_person').fetchone()[0] == 1
        assert target.execute('SELECT count(*) FROM bank_folder_probe').fetchone()[0] == 1
        assert target.execute('SELECT status FROM bank_image WHERE id=10').fetchone()[0] == 'reject'
        collection = target.execute('SELECT * FROM bank_collection').fetchone()
        undo = json.loads(collection['undo_state'])
        assert undo['before'][0]['id'] == collection['id']
        assert undo['before'][0]['members'][0]['image_id'] == rows[0]['id']
        assert undo['before'][0]['members'][1]['image_id'] < 0
        person = target.execute('SELECT sample_report FROM bank_folder_person').fetchone()[0]
        probe = target.execute('SELECT content_sig FROM bank_folder_probe').fetchone()[0]
        assert json.loads(person)['content_sig'] == probe and probe != old_signature
    root = Path(destination['paths']['LDS_DATA_DIR']) / 'banks' / str(result['bank_id'])
    arrays = npz_transport.read(root / 'example.npz', max_file_bytes=1024 * 1024,
                               max_uncompressed_bytes=1024 * 1024, max_elements=1000)
    assert arrays['paths'].string(0) == str(root / 'edited' / f"{rows[0]['id']}.e2.webp")
    assert arrays['paths'].string(1) == str(folder / 'image-02.png')
    assert arrays['embs'].float_row(0) == (0.25, 0.5)
    assert arrays['hashes'].string(1) == 'e' * 64
    assert arrays['sigs'].string(1) == 'raw-signature'
    assert str(rows[0]['id']) in json.loads((root / 'profile_undo.json').read_text())['rows']


def test_verification_failure_keeps_the_original_bank_and_allows_retry(transfer, monkeypatch):
    from app.extensions import db
    from app.models import ImageBank
    from app.services import profile_bank_move as moves
    app, bank_id, instance, destination, folder, _linked, _ids = transfer
    with app.app_context():
        original = moves._verify
        monkeypatch.setattr(moves, '_verify', lambda *_args: (_ for _ in ()).throw(moves.MoveBlocked('synthetic verification failure')))
        with pytest.raises(moves.MoveBlocked):
            moves.move_bank('local', bank_id, instance, destination['id'], '2' * 32)
        assert db.session.get(ImageBank, bank_id) is not None
        assert (folder / 'image-01.png').read_bytes() == b'synthetic original one'
        monkeypatch.setattr(moves, '_verify', original)
        assert moves.move_bank('local', bank_id, instance, destination['id'], '2' * 32)['moved'] is True


def test_a_copied_move_resumes_without_creating_a_second_bank(transfer, monkeypatch):
    import sqlite3
    from app.extensions import db
    from app.models import ImageBank
    from app.services import profile_bank_move as moves
    app, bank_id, instance, destination, _folder, _linked, _ids = transfer
    with app.app_context():
        original = moves._detach_history
        monkeypatch.setattr(moves, '_detach_history', lambda *_args: (_ for _ in ()).throw(OSError('synthetic interruption')))
        with pytest.raises(OSError):
            moves.move_bank('local', bank_id, instance, destination['id'], '3' * 32)
        assert db.session.get(ImageBank, bank_id) is not None
        monkeypatch.setattr(moves, '_detach_history', original)
        assert moves.move_bank('local', bank_id, instance, destination['id'], '3' * 32)['moved'] is True
    with sqlite3.connect(Path(destination['paths']['LDS_DATA_DIR']) / 'studio.db') as target:
        assert target.execute('SELECT count(*) FROM image_bank WHERE instance_id=?', (instance,)).fetchone()[0] == 1


def test_prepared_cache_without_a_committed_target_is_retried_safely(transfer, monkeypatch):
    import sqlite3
    from app import config as cfg
    from app.services import profile_bank_move as moves
    app, bank_id, instance, destination, folder, _linked, _ids = transfer
    with app.app_context():
        original = moves._detach_history
        monkeypatch.setattr(moves, '_detach_history', lambda *_args: (_ for _ in ()).throw(OSError('synthetic interruption')))
        with pytest.raises(OSError):
            moves.move_bank('local', bank_id, instance, destination['id'], '4' * 32)
        receipt = cfg._data_dir() / 'banks' / '.profile-moves' / ('4' * 32 + '.json')
        journal = json.loads(receipt.read_text())
        journal['state'] = 'prepared'
        receipt.write_text(json.dumps(journal))
        database = Path(destination['paths']['LDS_DATA_DIR']) / 'studio.db'
        with sqlite3.connect(database) as target:
            target.execute('PRAGMA foreign_keys=ON')
            target.execute('DELETE FROM image_bank WHERE instance_id=?', (instance,))
        monkeypatch.setattr(moves, '_detach_history', original)
        assert moves.move_bank('local', bank_id, instance, destination['id'], '4' * 32)['moved'] is True
    assert (folder / 'image-01.png').read_bytes() == b'synthetic original one'


def test_an_existing_destination_folder_is_not_merged_or_overwritten(transfer):
    import sqlite3
    from app.extensions import db
    from app.models import ImageBank
    from app.services.profile_bank_move import MoveBlocked, move_bank
    app, bank_id, instance, destination, folder, _linked, _ids = transfer
    database = Path(destination['paths']['LDS_DATA_DIR']) / 'studio.db'
    with sqlite3.connect(database) as target:
        target.execute('UPDATE image_bank SET source_path=? WHERE id=10', (str(folder),))
    with app.app_context():
        with pytest.raises(MoveBlocked, match='already has a Bank'):
            move_bank('local', bank_id, instance, destination['id'], '5' * 32)
        assert db.session.get(ImageBank, bank_id) is not None
