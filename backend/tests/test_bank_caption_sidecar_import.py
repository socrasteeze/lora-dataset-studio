"""Copy same-stem .txt captions into empty bank rows. Disk stays read-only."""
import os

from PIL import Image

from app.services.caption_sidecar import sidecar_text


KEPT = 'a blue bowl on a shelf'
SECRET = b'do not import this line\n'


def _png(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', (32, 32), (80, 40, 20)).save(path)


def _bank(client, folder, names, bank_name='Placeholder bank'):
    folder.mkdir(parents=True, exist_ok=True)
    for name in names:
        _png(str(folder / name))
    response = client.post('/api/bank/create',
                           json={'name': bank_name, 'folder': str(folder)})
    assert response.status_code == 200, response.get_json()
    return response.get_json()['id']


def _row(bank_id, name):
    from app.models import BankImage
    return next(row for row in BankImage.query.filter_by(bank_id=bank_id)
                if os.path.basename(row.relpath) == name)


def _stored(app, image_id):
    from app.extensions import db
    from app.models import BankImage
    with app.app_context():
        row = db.session.get(BankImage, image_id)
        return row.caption, row.caption_origin


def _import_one(client, bank_id):
    response = client.post(f'/api/bank/{bank_id}/caption-sidecars', json={})
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def test_import_fills_only_empty_captions_and_does_not_touch_txt_files(
        client, app, tmp_path, monkeypatch):
    from app.services import caption_sidecar as sidecars

    def refuse(*_args, **_kwargs):
        raise AssertionError('sidecar import must not write a txt file')

    monkeypatch.setattr(sidecars, 'sync_bank_caption_sidecar', refuse)
    monkeypatch.setattr(sidecars, 'write_text_atomic', refuse)

    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, ['shot.png', 'kept.png', 'bare.png', 'blank.png'])
    shot_raw = b'  a red mug  \r\n  on a wooden table \r\n'
    kept_raw = b'a green lamp on the floor\n'
    blank_raw = b'   \r\n'
    (folder / 'shot.txt').write_bytes(shot_raw)
    (folder / 'kept.txt').write_bytes(kept_raw)
    (folder / 'blank.txt').write_bytes(blank_raw)
    with app.app_context():
        from app.extensions import db
        kept = _row(bank_id, 'kept.png')
        kept.caption = KEPT
        kept.caption_origin = 'ollama'
        shot_id = _row(bank_id, 'shot.png').id
        kept_id = kept.id
        bare_id = _row(bank_id, 'bare.png').id
        blank_id = _row(bank_id, 'blank.png').id
        db.session.commit()

    body = _import_one(client, bank_id)
    assert body['ok'] is True
    assert body['filled'] == 1
    assert body['skipped'] == 1
    assert body['missing'] == 1
    assert body['blank'] == 1
    assert body['errors'] == 0
    assert body['banks'] == 1

    with app.app_context():
        from app.extensions import db
        from app.models import BankImage
        from app.services.caption_origin import is_protected
        row = db.session.get(BankImage, shot_id)
        assert row.caption == sidecar_text(shot_raw.decode('utf-8'))
        assert row.caption_origin == 'asserted'
        assert is_protected(row) is True

    assert _stored(app, kept_id) == (KEPT, 'ollama')
    assert _stored(app, bare_id) == (None, None)
    assert _stored(app, blank_id) == (None, None)
    assert (folder / 'shot.txt').read_bytes() == shot_raw
    assert (folder / 'kept.txt').read_bytes() == kept_raw
    assert (folder / 'blank.txt').read_bytes() == blank_raw
    assert not (folder / 'bare.txt').exists()


def test_one_bank_leaves_the_other_and_all_banks_fills_it(client, app, tmp_path):
    north = tmp_path / 'north'
    south = tmp_path / 'south'
    north_id = _bank(client, north, ['mug.png'], 'North bank')
    south_id = _bank(client, south, ['lamp.png'], 'South bank')
    (north / 'mug.txt').write_text('a red mug on a wooden table', encoding='utf-8')
    (south / 'lamp.txt').write_text('a green lamp on the floor', encoding='utf-8')
    with app.app_context():
        north_image = _row(north_id, 'mug.png').id
        south_image = _row(south_id, 'lamp.png').id

    one = _import_one(client, north_id)
    assert one['filled'] == 1 and one['banks'] == 1
    assert _stored(app, north_image)[0] == 'a red mug on a wooden table'
    assert _stored(app, south_image)[0] is None

    response = client.post('/api/banks/caption-sidecars', json={})
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body['filled'] == 1
    assert body['skipped'] >= 1
    assert body['banks'] == 2
    assert _stored(app, north_image) == ('a red mug on a wooden table', 'asserted')
    assert _stored(app, south_image) == ('a green lamp on the floor', 'asserted')
    assert (north / 'mug.txt').read_text(encoding='utf-8') == 'a red mug on a wooden table'
    assert (south / 'lamp.txt').read_text(encoding='utf-8') == 'a green lamp on the floor'


def test_an_escaping_relpath_is_not_read(client, app, tmp_path):
    folder = tmp_path / 'src'
    bank_id = _bank(client, folder, ['shot.png', 'decoy.png'])
    shot_raw = b'a red mug on a wooden table\n'
    (folder / 'shot.txt').write_bytes(shot_raw)
    outside = tmp_path / 'outside.txt'
    outside.write_bytes(SECRET)
    stamp = outside.stat().st_mtime_ns
    with app.app_context():
        from app.extensions import db
        decoy = _row(bank_id, 'decoy.png')
        decoy.relpath = os.path.join('..', 'outside.png')
        decoy_id = decoy.id
        shot_id = _row(bank_id, 'shot.png').id
        db.session.commit()

    body = _import_one(client, bank_id)
    assert body['filled'] == 1
    assert body['errors'] == 1
    assert _stored(app, shot_id)[0] == 'a red mug on a wooden table'
    assert _stored(app, decoy_id)[0] in (None, '')
    assert outside.read_bytes() == SECRET
    assert outside.stat().st_mtime_ns == stamp
    assert (folder / 'shot.txt').read_bytes() == shot_raw


def test_unknown_bank_is_not_found(client):
    response = client.post('/api/bank/999999/caption-sidecars', json={})
    assert response.status_code == 404
