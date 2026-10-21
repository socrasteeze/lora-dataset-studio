"""Creation destinations do not inherit stale storage settings.

Cloud validation must demonstrate failure against the original source too.
These cases have not been executed locally.
"""
import json

import pytest

from app import creation_destinations as destinations
from pathlib import Path


@pytest.fixture
def policy(tmp_path, monkeypatch):
    path = tmp_path / 'destination-policy.json'
    monkeypatch.setattr(destinations, 'POLICY_PATH', path)
    monkeypatch.delenv('LDS_PROFILE_ID', raising=False)
    return path


def test_missing_policy_keeps_portable_resolution(policy):
    assert destinations.destination('datasets') is None


@pytest.mark.parametrize('kind', ('datasets', 'video_datasets'))
def test_policy_preserves_categories_and_is_read_only(policy, tmp_path, kind):
    root = tmp_path / 'media'
    policy.write_text(json.dumps({'root': str(root)}), encoding='utf-8')
    expected = root / 'LDS'
    assert destinations.destination(kind) == expected
    assert not root.exists()


@pytest.mark.parametrize('value', ['{', '{}', '[]', '{"root": ""}', '{"root": "relative/path"}', '{"root": 3}'])
def test_invalid_policy_refuses_instead_of_using_a_stale_default(policy, value):
    policy.write_text(value, encoding='utf-8')
    with pytest.raises(ValueError, match='dataset-destinations.json'):
        destinations.destination('datasets')


def test_unreadable_policy_refuses(policy):
    policy.mkdir()
    with pytest.raises(ValueError, match='Cannot read'):
        destinations.destination('datasets')


def test_new_dataset_pins_policy_while_legacy_dataset_keeps_its_folder(app, policy, tmp_path):
    from app import config as cfg
    from app.extensions import db
    from app.models import FaceDataset
    from app.services import face_dataset_service as datasets
    from app.services.dataset_storage import dataset_path, ensure_dataset_dir

    with app.app_context():
        legacy_root = tmp_path / 'legacy-images'
        cfg.save_config({'paths': {'dataset_images_root': str(legacy_root)}})
        legacy = datasets.create_dataset('local', 'Legacy', 'legacy')
        legacy_dir = legacy_root / str(legacy.id)
        legacy_dir.mkdir(parents=True)
        (legacy_dir / 'source.bin').write_bytes(b'unchanged')
        root = tmp_path / 'media'
        policy.write_text(json.dumps({'root': str(root)}), encoding='utf-8')
        created = datasets.create_dataset('local', 'Example', 'example')
        expected = root / 'LDS' / f'CHAR-EXAM_LDS{created.id:04d}'
        assert Path(dataset_path(created.id)) == expected
        assert expected.is_dir()
        assert Path(ensure_dataset_dir(created.id)) == expected
        assert Path(dataset_path(legacy.id)) == legacy_dir
        assert (legacy_dir / 'source.bin').read_bytes() == b'unchanged'
        policy.write_text(json.dumps({'root': str(tmp_path / 'later')}), encoding='utf-8')
        cfg.save_config({'paths': {'dataset_images_root': str(tmp_path / 'stale')}})
        db.session.expire_all()
        assert Path(dataset_path(created.id)) == expected
        assert db.session.get(FaceDataset, created.id).storage_root == str(expected.parent)


def test_new_bank_allocation_preserves_names_suffixes_and_existing_bank(app, policy, tmp_path):
    from app.services import image_bank_service as banks
    from app.services import path_guard

    with app.app_context():
        root = tmp_path / 'media'
        policy.write_text(json.dumps({'root': str(root)}), encoding='utf-8')
        existing = tmp_path / 'existing-archive'
        existing.mkdir()
        bank, _ = banks.create_bank('local', 'Existing', str(existing))
        assert Path(bank.source_path) == existing
        from app import config as cfg
        assert Path(banks._import_folder_for('Example')) == cfg.bank_sources_root() / 'Example'
        second = Path(banks._import_folder_for('Example'))
        assert second.name == 'Example-2'
        assert banks._is_imported_source(str(second))
        assert not banks._is_imported_source(str(existing))
        assert path_guard.dataset_folder_conflict(root / 'LDS' / 'CHAR-EXAM_LDS0001')
        assert path_guard.dataset_folder_conflict(existing) is None


def test_video_creation_uses_policy_but_existing_output_stays_pinned(app, policy, tmp_path):
    from app.extensions import db
    from app.models import VideoDataset
    from app.services import video_bank_service as video

    with app.app_context():
        root = tmp_path / 'media'
        policy.write_text(json.dumps({'root': str(root)}), encoding='utf-8')
        old_folder = tmp_path / 'legacy-video'
        old = VideoDataset(user_id='local', name='Legacy', target_profile='minimax_h3', output_dir=str(old_folder))
        new = VideoDataset(user_id='local', name='Example', target_profile='minimax_h3', output_dir='')
        db.session.add(old)
        db.session.flush()
        new.folder_category = 'style'
        video._reserve_dataset_folder(new)
        db.session.add_all([old, new])
        db.session.flush()
        assert video.dataset_dir(old.id) == old_folder
        assert video.dataset_dir(new.id) == root / 'LDS' / f'STYL-EXAM_LDS{new.id:04d}'
        new_bank = Path(video._scrape_folder_for('Example'))
        from app import config as cfg
        assert new_bank == cfg.video_bank_sources_root() / 'Example'
        assert video.is_app_owned_scrape_folder(new_bank)


def test_profiles_share_a_flat_namespace_without_reusing_numbers(policy, tmp_path, monkeypatch):
    root = tmp_path / 'media'
    policy.write_text(json.dumps({'root': str(root), 'directories': {'default/datasets': 'stale/nested'}}), encoding='utf-8')
    monkeypatch.setenv('LDS_PROFILE_ID', 'profile-one')
    assert destinations.destination('datasets') == root / 'LDS'
    root = root / 'LDS'
    first_id, first = destinations.reserve_folder(root, 'LDS')
    assert first.name == 'MISC-DATA_LDS' + '0001'
    first.rmdir()
    monkeypatch.setenv('LDS_PROFILE_ID', 'profile-two')
    second_id, second = destinations.reserve_folder(root, 'LDS')
    assert (first_id, second_id) == (1, 2)
    assert second.parent == root and second.name == 'MISC-DATA_LDS' + '0002'


def test_reservation_skips_existing_names_and_does_not_overwrite_files(policy, tmp_path):
    root = tmp_path / 'media'
    root.mkdir()
    occupied = root / ('LDS' + '0007')
    occupied.write_bytes(b'existing')
    number, folder = destinations.reserve_folder(root, 'LDS', minimum=3)
    assert number == 8 and folder.name == 'MISC-DATA_LDS' + '0008'
    assert occupied.read_bytes() == b'existing'
    assert not (root / destinations.ALLOCATION_LOCK).exists()


def test_pending_or_corrupt_allocation_refuses_instead_of_reusing_a_name(policy, tmp_path):
    root = tmp_path / 'media'
    root.mkdir()
    lock = root / destinations.ALLOCATION_LOCK
    lock.write_text('pending', encoding='utf-8')
    with pytest.raises(ValueError, match='allocation is pending'):
        destinations.reserve_folder(root, 'LDS')
    assert lock.read_text(encoding='utf-8') == 'pending'
    lock.unlink()
    (root / destinations.ALLOCATION_STATE).write_text('{', encoding='utf-8')
    with pytest.raises(ValueError, match='allocation record'):
        destinations.reserve_folder(root, 'LDS')
    assert not (root / ('MISC-DATA_LDS' + '0001')).exists()


def test_atomic_mkdir_handles_an_external_collision(policy, tmp_path, monkeypatch):
    from pathlib import Path
    root = tmp_path / 'media'
    original = Path.mkdir
    collided = False

    def mkdir(path, *args, **kwargs):
        nonlocal collided
        if path.name == 'MISC-DATA_LDS' + '0001' and not collided:
            collided = True
            original(path, *args, **kwargs)
            (path / 'foreign.bin').write_bytes(b'untouched')
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, 'mkdir', mkdir)
    number, folder = destinations.reserve_folder(root, 'LDS')
    assert number == 2 and folder.name == 'MISC-DATA_LDS' + '0002'
    assert (root / ('MISC-DATA_LDS' + '0001') / 'foreign.bin').read_bytes() == b'untouched'


def test_shared_root_guard_distinguishes_datasets_from_banks(policy, tmp_path):
    root = tmp_path / 'media'
    assert destinations.dataset_namespace_conflict(root / 'LDS0001', root)
    assert destinations.dataset_namespace_conflict(root / 'DSM0001' / 'nested', root)
    assert destinations.dataset_namespace_conflict(root, root)
    assert not destinations.dataset_namespace_conflict(root / 'LDSB0001', root)



def test_backup_restore_allocates_a_new_flat_folder_without_moving_the_source(app, policy, tmp_path):
    from PIL import Image
    from app.extensions import db
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as datasets
    from app.services.dataset_storage import dataset_path, ensure_dataset_dir
    with app.app_context():
        original = datasets.create_dataset('local', 'Source', 'source')
        original_path = Path(ensure_dataset_dir(original.id)) / 'example.png'
        Image.new('RGB', (64, 64), 'blue').save(original_path)
        db.session.add(FaceDatasetImage(dataset_id=original.id, filename='example.png',
                                       status='keep', framing='face', caption='a portrait'))
        db.session.commit()
        original_bytes = original_path.read_bytes()
        archive = datasets.build_backup_zip('local', original.id)
        root = tmp_path / 'media'
        policy.write_text(json.dumps({'root': str(root)}), encoding='utf-8')
        restored = datasets.import_backup_zip('local', archive)
        expected = root / 'LDS' / f'CHAR-SOUR_LDS{restored.id:04d}'
        assert Path(dataset_path(restored.id)) == expected
        assert (expected / 'example.png').read_bytes() == original_bytes
        assert original_path.read_bytes() == original_bytes


@pytest.mark.parametrize('name, expected', [
    ('Amber', 'AMBE'), ('Amber-art', 'AMBE-ART'), ('Amber_art', 'AMBE-ART'),
    ('Amber art', 'AMBE-ART'), ('Caf\u00e9_\u00c9tude', 'CAFE-ETUD'),
    ('\u753b\u50cf', 'DATA'), ('../___!!!', 'DATA'),
])
def test_category_names_are_portable_and_keep_the_identity_suffix(name, expected):
    """The earlier allocator emitted only the app and number; cloud red proof is pending."""
    assert destinations.folder_name(name, 'style', 'LDS', 12) == f'STYL-{expected}_LDS0012'
    long = destinations.folder_name('example ' * 100, 'character', 'LDS', 12345)
    assert len(long) <= 64 and long.startswith('CHAR-') and long.endswith('_LDS12345')


@pytest.mark.parametrize('category', ['', 'concept', 4, {}])
def test_invalid_category_does_not_allocate_a_directory(tmp_path, category):
    root = tmp_path / 'uncreated'
    with pytest.raises(ValueError, match='category'):
        destinations.reserve_folder(root, 'LDS', category=category)
    assert not root.exists()


def test_categories_share_numbers_and_existing_descriptive_names_are_reserved(tmp_path):
    root = tmp_path / 'sets'
    root.mkdir()
    (root / 'STYL-EXIS_LDS0020').mkdir()
    first, path = destinations.reserve_folder(root, 'LDS', name='Amber art', category='character')
    second, other = destinations.reserve_folder(root, 'LDS', name='Amber art', category='style')
    assert (first, second) == (21, 22)
    assert path.name == 'CHAR-AMBE-ART_LDS0021'
    assert other.name == 'STYL-AMBE-ART_LDS0022'


def test_category_and_name_edits_cannot_retarget_an_existing_dataset(app, policy, tmp_path):
    from app.extensions import db
    from app.services import face_dataset_service as datasets
    from app.services.dataset_storage import dataset_path
    with app.app_context():
        root = tmp_path / 'media'
        policy.write_text(json.dumps({'root': str(root)}), encoding='utf-8')
        created = datasets.create_dataset('local', 'Amber art', 'sample', folder_category='style')
        original = Path(dataset_path(created.id))
        assert original.name == f'STYL-AMBE-ART_LDS{created.id:04d}'
        assert created.kind is None  # Folder category cannot change Character training semantics.
        created.name = 'Different name'
        created.folder_category = 'miscellaneous'
        db.session.commit()
        assert Path(dataset_path(created.id)) == original


def test_exhausted_number_space_refuses_without_replacing_ledger(tmp_path):
    root = tmp_path / 'sets'
    root.mkdir()
    ledger = root / destinations.ALLOCATION_STATE
    original = json.dumps({'version': 1, 'last': {'LDS': destinations.MAX_DATASET_ID}})
    ledger.write_text(original, encoding='utf-8')
    with pytest.raises(ValueError, match='No Dataset folder numbers'):
        destinations.reserve_folder(root, 'LDS')
    assert ledger.read_text(encoding='utf-8') == original
    assert not (root / destinations.ALLOCATION_LOCK).exists()


def test_creation_options_are_read_only_and_invalid_policy_is_reported(client, policy, tmp_path):
    root = tmp_path / 'media'
    policy.write_text(json.dumps({'root': str(root)}), encoding='utf-8')
    result = client.get('/api/dataset/creation-options')
    assert result.status_code == 200
    assert result.get_json()['root'] == str(root / 'LDS')
    assert not root.exists()
    policy.write_text('{', encoding='utf-8')
    assert client.get('/api/dataset/creation-options').status_code == 400


def test_legacy_video_without_output_path_does_not_follow_creation_policy(app, policy, tmp_path):
    from app import config as cfg
    from app.extensions import db
    from app.models import VideoDataset
    from app.services import video_bank_service as video
    with app.app_context():
        policy.write_text(json.dumps({'root': str(tmp_path / 'new')}), encoding='utf-8')
        legacy = VideoDataset(user_id='local', name='Legacy', target_profile='minimax_h3', output_dir='')
        db.session.add(legacy)
        db.session.flush()
        assert video.dataset_dir(legacy.id) == cfg.video_datasets_root() / str(legacy.id)
