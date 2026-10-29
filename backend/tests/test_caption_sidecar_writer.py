"""Atomic Bank caption sidecars, and the hook that keeps them in sync.

Captions stay in ``BankImage.caption``. A non-empty write also publishes
``<stem>.txt`` next to the source image. These tests pin the writer and every
production hook: hand edit, the caption pass, and a shared-result fill.
"""
import os

import pytest
from PIL import Image

from app.services.caption_sidecar import (
    sidecar_path_for, sidecar_sync_enabled, sidecar_text, write_text_atomic,
)


CAPTION = 'a person standing outdoors in daylight'


def _png(path, value=80):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', (64, 64), (value, 40, 90)).save(path)


def _bank(client, folder, files, name='Sidecar bank'):
    folder.mkdir(parents=True, exist_ok=True)
    for rel, value in files.items():
        _png(str(folder / rel), value)
    response = client.post('/api/bank/create', json={'name': name, 'folder': str(folder)})
    assert response.status_code == 200, response.get_json()
    return response.get_json()['id']


def _row(app, bank_id, name):
    from app.models import BankImage
    return next(r for r in BankImage.query.filter_by(bank_id=bank_id)
                if os.path.basename(r.relpath) == name)


# --- writer -----------------------------------------------------------------

def test_sidecar_text_is_one_stripped_line():
    assert sidecar_text('  a person  \n  outdoors \r\n') == 'a person outdoors'
    assert sidecar_text('   ') == ''
    assert sidecar_text(None) == ''
    assert sidecar_text(12) == ''


def test_write_text_atomic_is_utf8_without_bom(tmp_path):
    target = tmp_path / 'shot.txt'
    write_text_atomic(str(target), CAPTION)
    raw = target.read_bytes()
    assert not raw.startswith(b'\xef\xbb\xbf')
    assert raw == CAPTION.encode('utf-8')
    assert list(tmp_path.iterdir()) == [target]


def test_write_text_atomic_replaces_through_os_replace(tmp_path):
    target = tmp_path / 'shot.txt'
    target.write_text('old caption', encoding='utf-8')
    seen = {}
    original = os.replace

    def spy(src, dst):
        seen['before'] = open(dst, encoding='utf-8').read()
        seen['tmp_dir'] = os.path.dirname(src)
        return original(src, dst)

    os.replace = spy
    try:
        write_text_atomic(str(target), CAPTION)
    finally:
        os.replace = original

    assert seen['before'] == 'old caption'
    assert seen['tmp_dir'] == str(tmp_path)
    assert target.read_text(encoding='utf-8') == CAPTION
    assert list(tmp_path.iterdir()) == [target]


def test_a_failed_atomic_write_leaves_no_temp_and_no_bak(tmp_path):
    target = tmp_path / 'shot.txt'
    target.write_text('keep me', encoding='utf-8')
    original = os.replace

    def fail(src, dst):
        raise OSError('read-only file system')

    os.replace = fail
    try:
        with pytest.raises(OSError):
            write_text_atomic(str(target), CAPTION)
    finally:
        os.replace = original

    assert target.read_text(encoding='utf-8') == 'keep me'
    leftover = [p.name for p in tmp_path.iterdir()]
    assert leftover == ['shot.txt']
    assert not any(name.endswith('.bak') for name in leftover)


def test_sidecar_sync_defaults_to_on(app):
    assert sidecar_sync_enabled() is True


# --- hook: hand edit --------------------------------------------------------

def test_a_hand_written_bank_caption_writes_the_sidecar(client, app, tmp_path):
    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80})
    with app.app_context():
        image_id = _row(app, bank_id, 'shot.png').id
    response = client.put(f'/api/bank/{bank_id}/image/{image_id}/caption',
                          json={'caption': f'  {CAPTION}  '})
    assert response.status_code == 200, response.get_json()
    sidecar = folder / 'shot.txt'
    assert sidecar.read_bytes() == CAPTION.encode('utf-8')
    with app.app_context():
        from app.models import BankImage
        from app.extensions import db
        row = db.session.get(BankImage, image_id)
        assert row.caption == CAPTION
        assert row.tags is None and row.tags_text is None


def test_clearing_a_caption_leaves_the_sidecar(client, app, tmp_path):
    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80})
    with app.app_context():
        image_id = _row(app, bank_id, 'shot.png').id
    client.put(f'/api/bank/{bank_id}/image/{image_id}/caption',
               json={'caption': CAPTION})
    sidecar = folder / 'shot.txt'
    assert sidecar.is_file()
    response = client.put(f'/api/bank/{bank_id}/image/{image_id}/caption',
                          json={'caption': ''})
    assert response.status_code == 200, response.get_json()
    assert sidecar.read_text(encoding='utf-8') == CAPTION
    with app.app_context():
        from app.extensions import db
        from app.models import BankImage
        row = db.session.get(BankImage, image_id)
        assert not (row.caption or '')


def test_the_toggle_off_skips_the_sidecar(client, app, tmp_path):
    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80})
    with app.app_context():
        import app.config as cfg
        cfg.save_config({'captioning': {'bank_sidecar_sync': False}})
        image_id = _row(app, bank_id, 'shot.png').id
    response = client.put(f'/api/bank/{bank_id}/image/{image_id}/caption',
                          json={'caption': CAPTION})
    assert response.status_code == 200, response.get_json()
    assert not (folder / 'shot.txt').exists()
    with app.app_context():
        from app.extensions import db
        from app.models import BankImage
        assert db.session.get(BankImage, image_id).caption == CAPTION


def test_a_missing_image_skips_the_sidecar_and_keeps_the_db_write(
        client, app, tmp_path):
    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80})
    with app.app_context():
        image_id = _row(app, bank_id, 'shot.png').id
    os.remove(folder / 'shot.png')
    response = client.put(f'/api/bank/{bank_id}/image/{image_id}/caption',
                          json={'caption': CAPTION})
    assert response.status_code == 200, response.get_json()
    assert not (folder / 'shot.txt').exists()
    with app.app_context():
        from app.extensions import db
        from app.models import BankImage
        assert db.session.get(BankImage, image_id).caption == CAPTION


def test_a_read_only_folder_skips_the_sidecar_and_keeps_the_db_write(
        client, app, tmp_path, monkeypatch):
    from app.services import caption_sidecar as sidecars

    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80})
    with app.app_context():
        image_id = _row(app, bank_id, 'shot.png').id

    def refuse(path, text):
        raise OSError('read-only file system')

    monkeypatch.setattr(sidecars, 'write_text_atomic', refuse)
    response = client.put(f'/api/bank/{bank_id}/image/{image_id}/caption',
                          json={'caption': CAPTION})
    assert response.status_code == 200, response.get_json()
    assert not (folder / 'shot.txt').exists()
    with app.app_context():
        from app.extensions import db
        from app.models import BankImage
        assert db.session.get(BankImage, image_id).caption == CAPTION


def test_a_stem_collision_skips_the_sidecar(client, app, tmp_path):
    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80, 'shot.jpg': 40})
    with app.app_context():
        image_id = _row(app, bank_id, 'shot.png').id
    response = client.put(f'/api/bank/{bank_id}/image/{image_id}/caption',
                          json={'caption': CAPTION})
    assert response.status_code == 200, response.get_json()
    assert not (folder / 'shot.txt').exists()
    with app.app_context():
        from app.extensions import db
        from app.models import BankImage
        assert db.session.get(BankImage, image_id).caption == CAPTION


def test_overlapping_rows_with_different_captions_skip_the_sidecar(
        client, app, tmp_path):
    from app.extensions import db
    from app.services import image_bank_service as banks

    root = tmp_path / 'hero'
    parent_id = _bank(client, root, {'outfit/shot.png': 80}, name='Hero')
    child_id = _bank(client, root / 'outfit', {'shot.png': 80}, name='Outfit')
    with app.app_context():
        parent_row = _row(app, parent_id, 'shot.png')
        child_row = _row(app, child_id, 'shot.png')
        parent_row.caption = 'parent words'
        db.session.commit()
        result = banks.set_image_caption(
            'local', child_id, child_row.id, 'child words')
        assert result['caption'] == 'child words'
        assert not (root / 'outfit' / 'shot.txt').exists()
        db.session.refresh(parent_row)
        assert parent_row.caption == 'parent words'


def test_a_sidecar_failure_does_not_roll_back_the_db_write(
        client, app, tmp_path, monkeypatch):
    from app.services import caption_sidecar as sidecars

    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80})
    with app.app_context():
        image_id = _row(app, bank_id, 'shot.png').id

    monkeypatch.setattr(sidecars, 'write_text_atomic',
                        lambda *a, **k: (_ for _ in ()).throw(OSError('disk full')))
    response = client.put(f'/api/bank/{bank_id}/image/{image_id}/caption',
                          json={'caption': CAPTION})
    assert response.status_code == 200, response.get_json()
    with app.app_context():
        from app.extensions import db
        from app.models import BankImage
        assert db.session.get(BankImage, image_id).caption == CAPTION


# --- hook: caption pass -----------------------------------------------------

def test_the_caption_pass_writes_the_sidecar(client, app, tmp_path, monkeypatch):
    from app.services import vision_ollama

    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80})
    with app.app_context():
        import app.config as cfg
        cfg.save_config({'captioning': {'backend': 'ollama'}})

    monkeypatch.setattr(vision_ollama, 'describe_image_ollama',
                        lambda *a, **k: CAPTION)
    monkeypatch.setattr(vision_ollama, 'unload_vision_model',
                        lambda *a, **k: True)
    response = client.post(f'/api/bank/{bank_id}/caption', json={})
    assert response.status_code == 202, response.get_json()
    payload = client.get(f'/api/bank/{bank_id}').get_json()
    assert payload['activity']['finished'] is True
    assert payload['activity']['error'] is None
    assert (folder / 'shot.txt').read_text(encoding='utf-8') == CAPTION


def test_a_sidecar_failure_does_not_fail_the_caption_job(
        client, app, tmp_path, monkeypatch):
    from app.services import caption_sidecar as sidecars
    from app.services import vision_ollama

    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, {'shot.png': 80})
    with app.app_context():
        import app.config as cfg
        cfg.save_config({'captioning': {'backend': 'ollama'}})

    monkeypatch.setattr(vision_ollama, 'describe_image_ollama',
                        lambda *a, **k: CAPTION)
    monkeypatch.setattr(vision_ollama, 'unload_vision_model',
                        lambda *a, **k: True)
    monkeypatch.setattr(sidecars, 'write_text_atomic',
                        lambda *a, **k: (_ for _ in ()).throw(OSError('disk full')))
    response = client.post(f'/api/bank/{bank_id}/caption', json={})
    assert response.status_code == 202, response.get_json()
    payload = client.get(f'/api/bank/{bank_id}').get_json()
    assert payload['activity']['finished'] is True
    assert payload['activity']['error'] is None
    with app.app_context():
        assert _row(app, bank_id, 'shot.png').caption == CAPTION
    assert not (folder / 'shot.txt').exists()


# --- hook: shared results ---------------------------------------------------

def test_a_shared_caption_fill_writes_the_sidecar(client, app, tmp_path):
    from app.extensions import db
    from app.services import bank_shared_results as shared

    root = tmp_path / 'hero'
    parent_id = _bank(client, root, {'outfit/shot.png': 80}, name='Hero')
    child_id = _bank(client, root / 'outfit', {'shot.png': 80}, name='Outfit')
    with app.app_context():
        parent = _row(app, parent_id, 'shot.png')
        parent.caption = CAPTION
        parent.caption_origin = 'joycaption'
        db.session.commit()
        counts = shared.share_all()
        assert counts['caption'] == 1
        child = _row(app, child_id, 'shot.png')
        assert child.caption == CAPTION
        assert (root / 'outfit' / 'shot.txt').read_text(encoding='utf-8') == CAPTION


def test_sidecar_path_sits_next_to_the_image():
    path = os.path.join('album', 'shot.png')
    assert sidecar_path_for(path) == os.path.join('album', 'shot.txt')
