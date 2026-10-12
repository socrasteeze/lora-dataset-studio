"""Hide nested folders inside a bank that is already open.

Unchecking a folder drops its images from the grid, the counts, and the
curation actions. The files and the rows stay, and checking the folder again
brings those images back with the decisions they already had.
"""
import os

from PIL import Image


def _save(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', (8, 8), (20, 40, 60)).save(path, 'JPEG', quality=85)


def _bank(client, tmp_path):
    src = tmp_path / 'src'
    for rel in ('root.jpg', 'alice.jpg', 'alice/a.jpg', 'alice/indoor/b.jpg', 'bob/c.jpg'):
        _save(str(src / rel))
    r = client.post('/api/bank/create', json={'name': 'Nested', 'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id'], src


def _rels(client, bank_id):
    rows = client.get(f'/api/bank/{bank_id}/images?limit=50').get_json()['images']
    return {row['relpath'].replace('\\', '/') for row in rows}


def _id(client, bank_id, rel):
    rows = client.get(f'/api/bank/{bank_id}/images?limit=50').get_json()['images']
    want = rel.replace('\\', '/')
    return next(row['id'] for row in rows
                if row['relpath'].replace('\\', '/') == want)


def test_unchecking_a_nested_folder_hides_only_that_folder(client, tmp_path):
    bank_id, _src = _bank(client, tmp_path)
    listed = client.get(f'/api/bank/{bank_id}/folder-exclusions').get_json()
    assert {f['path']: f['images'] for f in listed['folders']} == {
        'alice': 2, 'alice/indoor': 1, 'bob': 1}
    assert listed['root_images'] == 2
    assert listed['excluded'] == []
    assert all(f['included'] for f in listed['folders'])

    hidden = client.put(f'/api/bank/{bank_id}/folder-exclusions',
                        json={'excluded': ['alice/indoor']})
    assert hidden.status_code == 200, hidden.get_json()
    body = hidden.get_json()
    assert body['excluded'] == ['alice/indoor']
    by_path = {f['path']: f['included'] for f in body['folders']}
    assert by_path == {'alice': True, 'alice/indoor': False, 'bob': True}

    assert _rels(client, bank_id) == {'root.jpg', 'alice.jpg', 'alice/a.jpg', 'bob/c.jpg'}
    payload = client.get(f'/api/bank/{bank_id}').get_json()
    assert payload['counts']['total'] == 4
    assert payload['excluded_folders'] == ['alice/indoor']
    subs = {s['name']: s['count'] for s in
            client.get(f'/api/bank/{bank_id}/subfolders').get_json()['subfolders']}
    assert subs == {'': 2, 'alice': 1, 'bob': 1}


def test_unchecking_a_parent_hides_its_children_and_keeps_the_files(client, tmp_path, app):
    bank_id, src = _bank(client, tmp_path)
    indoor = _id(client, bank_id, 'alice/indoor/b.jpg')
    bob = _id(client, bank_id, 'bob/c.jpg')
    assert client.post(f'/api/bank/{bank_id}/images/status',
                       json={'ids': [indoor, bob], 'status': 'reject'}).status_code == 200

    saved = client.put(f'/api/bank/{bank_id}/folder-exclusions',
                      json={'excluded': ['alice', 'alice/indoor']})
    assert saved.status_code == 200, saved.get_json()
    body = saved.get_json()
    # The parent covers the child, so the stored list keeps only the parent.
    assert body['excluded'] == ['alice']
    assert {f['path']: f['included'] for f in body['folders']}['alice/indoor'] is False
    assert _rels(client, bank_id) == {'root.jpg', 'alice.jpg', 'bob/c.jpg'}
    # alice.jpg is a file in the bank root. It shares a name with the folder
    # and must stay.
    assert 'alice.jpg' in _rels(client, bank_id)

    preview = client.get(f'/api/bank/{bank_id}/delete-rejected/preview').get_json()
    assert preview['rejected'] == 1

    # A decision on a hidden image is refused. The row is still there.
    changed = client.post(f'/api/bank/{bank_id}/images/status',
                          json={'ids': [indoor], 'status': 'keep'})
    assert changed.status_code == 200
    assert changed.get_json()['changed'] == 0

    with app.app_context():
        from app.models import BankImage
        from app.services import image_bank_service as banks
        banks.delete_rejected('local', bank_id)
        still = BankImage.query.filter_by(id=indoor).one()
        assert still.relpath.replace('\\', '/').endswith('alice/indoor/b.jpg')
        assert still.status == 'reject'
        assert BankImage.query.filter_by(id=bob).first() is None
    assert (src / 'alice' / 'indoor' / 'b.jpg').is_file()
    assert not (src / 'bob' / 'c.jpg').is_file()

    restored = client.put(f'/api/bank/{bank_id}/folder-exclusions', json={'excluded': []})
    assert restored.status_code == 200
    assert restored.get_json()['excluded'] == []
    assert 'alice/indoor/b.jpg' in _rels(client, bank_id)
    assert client.get(f'/api/bank/{bank_id}').get_json()['counts']['total'] == 4


def test_a_folder_that_is_not_in_the_bank_is_refused(client, tmp_path):
    bank_id, _src = _bank(client, tmp_path)
    missing = client.put(f'/api/bank/{bank_id}/folder-exclusions',
                         json={'excluded': ['nope']})
    assert missing.status_code == 400
    junk = client.put(f'/api/bank/{bank_id}/folder-exclusions',
                      json={'excluded': '../alice'})
    assert junk.status_code == 400
    not_a_list = client.put(f'/api/bank/{bank_id}/folder-exclusions',
                            json={'excluded': 'alice'})
    assert not_a_list.status_code == 400
    assert client.get(f'/api/bank/{bank_id}').get_json()['counts']['total'] == 5
