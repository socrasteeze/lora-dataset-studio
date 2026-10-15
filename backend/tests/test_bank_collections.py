"""Collections own membership only; existing Bank decisions and promotion stay authoritative."""
import hashlib

import pytest
from PIL import Image


@pytest.fixture
def app(plugin_app_factory, tmp_path):
    return plugin_app_factory(config_object={
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{(tmp_path / "state.db").as_posix()}'})


@pytest.fixture
def bank_rows(app, tmp_path):
    from app.extensions import db
    from app.models import BankImage, ImageBank
    folder = tmp_path / 'sources'
    folder.mkdir()
    with app.app_context():
        bank = ImageBank(user_id='local', name='Demo', source_path=str(folder))
        db.session.add(bank)
        db.session.flush()
        rows = []
        for index, status in enumerate(['keep', 'pending', 'reject', 'keep']):
            name = f'demo-{index}.png'
            Image.new('RGB', (32, 48), (30 + index, 80, 150)).save(folder / name)
            row = BankImage(bank_id=bank.id, relpath=name, status=status, caption=f'caption {index}',
                            width=32, height=48, dup_group=1, style_cluster=1)
            db.session.add(row)
            rows.append(row)
        db.session.commit()
        return bank.id, [row.id for row in rows], folder


def _create(bank_id, ids, name='Demo Collection'):
    from app.services import bank_collections as collections
    return collections.create('local', bank_id, name, ids)['collection']


def _change(bank_id, collection, operation, **args):
    from app.services import bank_collections as collections
    return collections.mutate('local', bank_id, collection['id'], {
        'operation': operation, 'revision': collection['revision'], **args})


def _ids(bank_id, collection):
    from app.services import bank_collections as collections
    return collections.member_ids('local', bank_id, collection['id'])['ids']


def test_membership_survives_reclustering_and_restart(app, bank_rows, plugin_app_factory):
    from app.extensions import db
    from app.models import BankImage
    bank_id, ids, _ = bank_rows
    with app.app_context():
        saved = _create(bank_id, [ids[2], ids[0], ids[2]])
        BankImage.query.filter_by(bank_id=bank_id).update({'dup_group': 99, 'style_cluster': 42})
        db.session.commit()
        db.session.remove()
        assert _ids(bank_id, saved) == [ids[2], ids[0]]
        from sqlalchemy import create_engine, text
        engine = create_engine(db.engine.url)
        try:
            with engine.connect() as connection:
                assert connection.execute(text('SELECT count(*) FROM bank_collection_member')).scalar() == 2
        finally:
            engine.dispose()
        uri = str(db.engine.url)
    restarted = plugin_app_factory(config_object={'SQLALCHEMY_DATABASE_URI': uri})
    with restarted.app_context():
        assert _ids(bank_id, saved) == [ids[2], ids[0]]


def test_membership_and_undo_do_not_change_status_captions_or_source_bytes(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    bank_id, ids, folder = bank_rows
    original = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in folder.iterdir()}
    with app.app_context():
        before = [(row.id, row.status, row.caption) for row in BankImage.query.order_by(BankImage.id)]
        saved = _create(bank_id, ids[:2])
        result = _change(bank_id, saved, 'members', add_ids=[ids[2]], remove_ids=[ids[0]])
        assert _ids(bank_id, saved) == ids[1:3]
        offer = result['undo']
        _change(bank_id, offer, 'undo')
        assert _ids(bank_id, saved) == ids[:2]
        assert [(row.id, row.status, row.caption) for row in BankImage.query.order_by(BankImage.id)] == before
        db.session.remove()
    assert {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in folder.iterdir()} == original


def test_missing_source_and_forgotten_row_keep_exact_membership(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    from app.services import bank_collections as collections
    bank_id, ids, folder = bank_rows
    with app.app_context():
        saved = _create(bank_id, ids)
        (folder / 'demo-0.png').unlink()
        db.session.delete(db.session.get(BankImage, ids[1]))
        db.session.commit()
        detail = collections.detail('local', bank_id, saved['id'])
        assert _ids(bank_id, saved) == ids
        assert [member['id'] for member in detail['members'] if member['missing']] == ids[:2]
        assert detail['members'][1]['image'] is None
        assert collections.promotable_ids('local', bank_id, saved['id']) == [ids[3]]


def test_reused_image_id_cannot_replace_an_unavailable_member(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    from app.services import bank_collections as collections
    bank_id, ids, _ = bank_rows
    with app.app_context():
        saved = _create(bank_id, [ids[0]])
        db.session.delete(db.session.get(BankImage, ids[0]))
        db.session.commit()
        db.session.add(BankImage(id=ids[0], bank_id=bank_id, relpath='demo-1.png', status='keep'))
        db.session.commit()
        assert collections.detail('local', bank_id, saved['id'])['members'][0]['missing']
        assert collections.promotable_ids('local', bank_id, saved['id']) == []
        with pytest.raises(collections.CollectionConflict):
            _change(bank_id, saved, 'members', add_ids=[ids[0]])
        assert _ids(bank_id, saved) == [ids[0]]


def test_delete_and_undo_leave_images_and_other_collections_intact(app, bank_rows):
    from app.models import BankImage
    from app.services import bank_collections as collections
    bank_id, ids, _ = bank_rows
    with app.app_context():
        first = _create(bank_id, ids[:2])
        second = _create(bank_id, ids[1:])
        deleted = _change(bank_id, first, 'delete')
        assert [row['id'] for row in deleted['collections']] == [second['id']]
        assert BankImage.query.filter_by(bank_id=bank_id).count() == 4
        assert _ids(bank_id, second) == ids[1:]
        _change(bank_id, deleted['undo'], 'undo')
        assert _ids(bank_id, first) == ids[:2]
        assert len(collections.list_collections('local', bank_id)['collections']) == 2


def test_merge_is_a_union_and_can_be_undone_exactly(app, bank_rows):
    bank_id, ids, _ = bank_rows
    with app.app_context():
        first = _create(bank_id, ids[:2])
        second = _create(bank_id, ids[1:3])
        result = _change(bank_id, first, 'merge', target_id=second['id'], target_revision=second['revision'])
        assert _ids(bank_id, second) == [ids[1], ids[2], ids[0]]
        _change(bank_id, result['undo'], 'undo')
        assert _ids(bank_id, first) == ids[:2]
        assert _ids(bank_id, second) == ids[1:3]


def test_split_moves_only_selected_members_and_preserves_missing_members(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    from app.services import bank_collections as collections
    bank_id, ids, _ = bank_rows
    with app.app_context():
        saved = _create(bank_id, ids)
        db.session.delete(db.session.get(BankImage, ids[1]))
        db.session.commit()
        result = _change(bank_id, saved, 'split', image_ids=ids[:2], name='Split')
        target = next(row for row in result['collections'] if row['id'] == result['collection_id'])
        assert _ids(bank_id, saved) == ids[2:]
        assert _ids(bank_id, target) == ids[:2]
        assert collections.detail('local', bank_id, target['id'])['members'][1]['missing']
        _change(bank_id, result['undo'], 'undo')
        assert _ids(bank_id, saved) == ids


def test_moved_missing_members_remain_removable_and_splittable(app, bank_rows):
    from app.extensions import db
    from app.models import BankCollectionMember, BankImage
    from app.services import bank_collections as collections
    bank_id, ids, _ = bank_rows
    with app.app_context():
        saved = _create(bank_id, ids[:1])
        for position in (1, 2):
            db.session.add(BankCollectionMember(
                collection_id=saved['id'], image_id=-position,
                image_instance_id=str(position) * 32, label='Unavailable Example', position=position))
        db.session.commit()
        result = _change(bank_id, saved, 'members', remove_ids=[-1])
        saved = next(row for row in result['collections'] if row['id'] == saved['id'])
        assert _ids(bank_id, saved) == [ids[0], -2]
        result = _change(bank_id, saved, 'split', image_ids=[-2], name='Missing Examples')
        target = next(row for row in result['collections'] if row['id'] == result['collection_id'])
        assert _ids(bank_id, target) == [-2]
        assert collections.detail('local', bank_id, target['id'])['members'][0]['missing']
        assert _ids(bank_id, saved) == ids[:1]
        assert db.session.get(BankImage, ids[0]).status == 'keep'
        target = next(row for row in result['collections'] if row['id'] == target['id'])
        with pytest.raises(ValueError):
            _change(bank_id, target, 'members', add_ids=[-3])


def test_stale_revision_and_partial_merge_undo_roll_back_atomically(app, bank_rows):
    from app.services import bank_collections as collections
    bank_id, ids, _ = bank_rows
    with app.app_context():
        first, second = _create(bank_id, ids[:2]), _create(bank_id, ids[1:3])
        merged = _change(bank_id, first, 'merge', target_id=second['id'], target_revision=second['revision'])
        target = merged['undo']
        _change(bank_id, target, 'rename', name='Changed')
        with pytest.raises(collections.CollectionConflict):
            _change(bank_id, target, 'undo')
        assert _ids(bank_id, second) == [ids[1], ids[2], ids[0]]
        with pytest.raises(collections.CollectionConflict):
            _change(bank_id, second, 'rename', name='Stale')


def test_empty_collection_and_bounded_large_pages(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    from app.services import bank_collections as collections
    bank_id, ids, _ = bank_rows
    with app.app_context():
        empty = _create(bank_id, [])
        assert collections.detail('local', bank_id, empty['id'])['members'] == []
        for index in range(1100):
            db.session.add(BankImage(bank_id=bank_id, relpath=f'absent-{index}.png', status='pending'))
        db.session.commit()
        all_ids = [row.id for row in BankImage.query.filter_by(bank_id=bank_id)]
        saved = _create(bank_id, all_ids)
        assert saved['count'] == 1104
        page = collections.detail('local', bank_id, saved['id'], offset=1000, limit=500)
        assert len(page['members']) == 100
        assert page['collection']['count'] == 1104
        assert _ids(bank_id, saved) == all_ids


def test_collection_grid_filters_stable_membership_and_status(app, bank_rows):
    from app.services import image_bank_service as banks
    bank_id, ids, _ = bank_rows
    with app.app_context():
        saved = _create(bank_id, ids[:3])
        result = banks.list_images('local', bank_id, collection_id=saved['id'], status='keep', ids_only=True)
        assert result['ids'] == [ids[0]]
        explicit = banks.list_images('local', bank_id, collection_id=saved['id'], ids=ids, ids_only=True)
        assert explicit['ids'] == ids[:3]
        assert banks.facet_counts('local', bank_id, collection_id=saved['id'])['counts']['keep'] == 1
        assert {row.id for row in banks._pool_query(bank_id, banks.thresholds(), collection_id=saved['id'])} == set(ids[:2])


def test_two_keepers_and_distinct_do_not_reject_unselected_style_candidates(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks
    bank_id, ids, _ = bank_rows
    with app.app_context():
        banks.set_status('local', bank_id, ids[:2], 'keep')
        assert db.session.get(BankImage, ids[3]).status == 'keep'
        assert db.session.get(BankImage, ids[2]).status == 'reject'
        banks.mark_group_distinct('local', bank_id, 1, expected_ids=ids)
        assert [db.session.get(BankImage, image_id).status for image_id in ids] == ['keep', 'keep', 'reject', 'keep']


def test_changed_duplicate_group_is_refused_before_any_decision(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks
    bank_id, ids, _ = bank_rows
    with app.app_context():
        db.session.get(BankImage, ids[3]).dup_group = 2
        db.session.commit()
        before = [db.session.get(BankImage, image_id).status for image_id in ids]
        with pytest.raises(ValueError, match='Group changed'):
            banks.resolve_dups('local', bank_id, group=1, keep_ids=ids[:2], expected_ids=ids, respect_existing_keep=False)
        with pytest.raises(ValueError, match='Group changed'):
            banks.mark_group_distinct('local', bank_id, 1, expected_ids=ids)
        assert [db.session.get(BankImage, image_id).status for image_id in ids] == before


def test_large_explicit_duplicate_keeper_selection_is_not_truncated(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks
    bank_id, _, _ = bank_rows
    with app.app_context():
        for index in range(1100):
            db.session.add(BankImage(bank_id=bank_id, relpath=f'copy-{index}.png', status='pending', dup_group=8))
        db.session.commit()
        ids = [row.id for row in BankImage.query.filter_by(bank_id=bank_id, dup_group=8).order_by(BankImage.id)]
        keepers = ids[:900]
        banks.resolve_dups('local', bank_id, group=8, keep_ids=keepers, expected_ids=ids, respect_existing_keep=False)
        assert BankImage.query.filter(BankImage.id.in_(keepers), BankImage.status == 'keep').count() == len(keepers)
        assert BankImage.query.filter_by(bank_id=bank_id, dup_group=8, status='reject').count() == len(ids) - len(keepers)


def test_collection_writes_respect_the_existing_bank_mutation_lease(app, bank_rows):
    from app.services import bank_collections as collections, bank_jobs
    bank_id, ids, _ = bank_rows
    with app.app_context(), bank_jobs.mutation_lease(bank_id, 'status'):
        with pytest.raises(bank_jobs.BankJobBusy):
            collections.create('local', bank_id, 'Busy', ids)


def test_stale_collection_decision_cannot_touch_a_removed_or_reused_member(app, bank_rows):
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks
    bank_id, ids, _ = bank_rows
    with app.app_context():
        saved = _create(bank_id, ids[:2])
        _change(bank_id, saved, 'members', remove_ids=[ids[0]])
        with pytest.raises(ValueError, match='membership changed'):
            banks.set_status('local', bank_id, ids[:2], 'reject', collection_id=saved['id'])
        assert db.session.get(BankImage, ids[1]).status == 'pending'
        banks.set_status('local', bank_id, [ids[1]], 'keep', collection_id=saved['id'])
        assert db.session.get(BankImage, ids[1]).status == 'keep'


@pytest.mark.parametrize('name,ids', [('', []), ('x' * 129, []), ('a\nb', []), ('Demo', [True]), ('Demo', [0])])
def test_bad_names_and_ids_are_rejected(app, bank_rows, name, ids):
    from app.services import bank_collections as collections
    with app.app_context(), pytest.raises(ValueError):
        collections.create('local', bank_rows[0], name, ids)


def test_routes_validate_owner_and_preserve_failed_change(app, bank_rows):
    from app.services import bank_collections as collections
    bank_id, ids, _ = bank_rows
    client = app.test_client()
    created = client.post(f'/api/bank/{bank_id}/collections', json={'name': 'Demo', 'image_ids': ids[:2]})
    assert created.status_code == 200
    saved = created.json['collection']
    assert client.post(f'/api/bank/{bank_id}/collections/{saved["id"]}', json={
        'operation': 'members', 'revision': saved['revision'], 'add_ids': [999999]}).status_code == 400
    with app.app_context():
        assert _ids(bank_id, saved) == ids[:2]
        with pytest.raises(collections.CollectionNotFound):
            collections.member_ids('another-user', bank_id, saved['id'])
    assert client.get(f'/api/bank/{bank_id + 100}/collections/{saved["id"]}').status_code == 404
    assert client.post(f'/api/bank/{bank_id}/collections', json=[]).status_code == 400


@pytest.mark.parametrize('path', ['promote', 'promote-to-bank', 'promote-to-new-dataset'])
def test_collection_promotion_rechecks_kept_members_and_never_falls_back_to_all(app, bank_rows, monkeypatch, path):
    from app.services import image_bank_service as banks
    bank_id, ids, folder = bank_rows
    captured = []
    def start(_app, _user, _bank, image_ids, *args):
        captured.append(image_ids)
        return 123
    monkeypatch.setattr(banks, 'start_promote', start)
    monkeypatch.setattr(banks, 'start_bank_promote', start)
    monkeypatch.setattr(banks, 'start_new_dataset_promote', start)
    with app.app_context():
        saved = _create(bank_id, ids)
    (folder / 'demo-3.png').unlink()
    client = app.test_client()
    response = client.post(f'/api/bank/{bank_id}/{path}', json={
        'collection_id': saved['id'], 'image_ids': ids[1:3], 'dataset_id': 7,
        'name': 'Destination', 'trigger_word': 'subject'})
    assert response.status_code == 202, response.json
    assert captured == [[ids[0]]]
    (folder / 'demo-0.png').unlink()
    response = client.post(f'/api/bank/{bank_id}/{path}', json={
        'collection_id': saved['id'], 'dataset_id': 7, 'name': 'Destination', 'trigger_word': 'subject'})
    assert response.status_code == 400
    assert len(captured) == 1
