"""Dataset storage names, legacy compatibility and configured destinations."""
from pathlib import Path

import pytest


@pytest.mark.parametrize('dataset_id, name', [
    (1, '00001'), (42, '00042'), (99999, '99999'), (100000, '100000'),
])
def test_new_storage_is_padded_without_creating_a_folder(
        app, tmp_path, monkeypatch, dataset_id, name):
    from app import config as cfg
    from app.services.dataset_storage import dataset_path, ensure_dataset_dir

    root = tmp_path / 'datasets'
    monkeypatch.setattr(cfg, 'dataset_images_root', lambda: root)
    assert dataset_path(dataset_id) == str(root / name)
    assert not root.exists()
    assert ensure_dataset_dir(dataset_id) == str(root / name)
    assert (root / name).is_dir()


def test_legacy_storage_is_used_for_reads_and_writes(app, tmp_path, monkeypatch):
    from app import config as cfg
    from app.services.dataset_storage import dataset_path, ensure_dataset_dir

    root = tmp_path / 'datasets'
    legacy = root / '7'
    legacy.mkdir(parents=True)
    original = legacy / 'image.png'
    original.write_bytes(b'original')
    monkeypatch.setattr(cfg, 'dataset_images_root', lambda: root)
    assert dataset_path(7) == ensure_dataset_dir(7) == str(legacy)
    assert original.read_bytes() == b'original'
    assert not (root / '00007').exists()


def test_legacy_folder_is_not_shadowed_by_a_padded_folder(app, tmp_path, monkeypatch):
    from app import config as cfg
    from app.services.dataset_storage import dataset_path, ensure_dataset_dir

    root = tmp_path / 'datasets'
    for name in ('7', '00007'):
        (root / name).mkdir(parents=True)
    monkeypatch.setattr(cfg, 'dataset_images_root', lambda: root)
    assert dataset_path(7) == ensure_dataset_dir(7) == str(root / '7')


@pytest.mark.parametrize('name', ['00007', '7'])
def test_checkpoint_hash_reads_the_resolved_storage(app, tmp_path, monkeypatch, name):
    from app import config as cfg
    from app.services import checkpoint_registry as registry

    root = tmp_path / 'datasets'
    folder = root / name
    folder.mkdir(parents=True)
    image = folder / 'image.png'
    image.write_bytes(b'original')
    monkeypatch.setattr(cfg, 'dataset_images_root', lambda: root)
    before = registry._file_hash(7, 'image.png')
    assert before != '-'
    image.write_bytes(b'changed image bytes')
    assert registry._file_hash(7, 'image.png') != before


def test_manual_dataset_uses_configured_root_and_serves_its_images(app, client, tmp_path):
    import io
    from PIL import Image
    from app import config as cfg

    root = tmp_path / 'chosen-datasets'
    with app.app_context():
        cfg.save_config({'paths': {'dataset_images_root': str(root)}})
    created = client.post('/api/dataset/create', json={
        'name': 'Example', 'trigger_word': 'example',
    })
    assert created.status_code == 200
    dataset_id = created.get_json()['id']
    image = io.BytesIO()
    Image.new('RGB', (64, 64), 'blue').save(image, 'PNG')
    image.seek(0)
    uploaded = client.post(f'/api/dataset/{dataset_id}/ref', data={
        'file': (image, 'reference.png'),
    }, content_type='multipart/form-data')
    assert uploaded.status_code == 200
    filename = uploaded.get_json()['ref_filename']
    expected = root / f'{dataset_id:05d}'
    assert (expected / filename).is_file()
    workspace = client.get(f'/api/dataset/{dataset_id}').get_json()
    assert Path(workspace['storage_path']) == expected
    assert client.get(f'/api/dataset/{dataset_id}/img/{filename}').status_code == 200
