"""🗃️ Image bank — renaming a bank.

A bank is named ONCE, at creation: usually before its content is known, and the
per-subfolder split names them automatically after the folders. A library of
twenty banks called "New folder (3)" is unusable, and the label was the only
thing that couldn't be changed. Renaming touches the label and nothing else —
the source folder, the images and every ✓/✕ stay exactly where they were.
"""
import os

from PIL import Image

from app.services import image_bank_service as banks


def _save(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', (32, 32), (200, 120, 60)).save(path, 'JPEG', quality=90)


def _mkbank(client, tmp_path, name):
    src = tmp_path / name
    _save(str(src / 'a.jpg'))
    _save(str(src / 'b.jpg'))
    r = client.post('/api/bank/create', json={'name': name, 'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id']


def test_rename_changes_the_label_and_nothing_else(client, app, tmp_path):
    bank_id = _mkbank(client, tmp_path, 'export')
    with app.app_context():
        before = banks.bank_payload('local', bank_id)
        source_before = before['source_path']
        total_before = before['counts']['total']

    # Reject one image first: a rename must never disturb the triage.
    r = client.get(f'/api/bank/{bank_id}/images')
    image_id = r.get_json()['images'][0]['id']
    assert client.post(f'/api/bank/{bank_id}/images/status',
                       json={'ids': [image_id], 'status': 'reject'}).status_code == 200

    r = client.post(f'/api/bank/{bank_id}/rename', json={'name': '  Telegram 07/2026  '})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['name'] == 'Telegram 07/2026'      # trimmed

    with app.app_context():
        after = banks.bank_payload('local', bank_id)
    assert after['name'] == 'Telegram 07/2026'
    assert after['source_path'] == source_before
    assert after['counts']['total'] == total_before
    assert after['counts']['reject'] == 1

    listed = client.get('/api/banks').get_json()['banks']
    assert [b['name'] for b in listed] == ['Telegram 07/2026']


def test_rename_rejects_an_empty_or_oversized_name(client, tmp_path):
    bank_id = _mkbank(client, tmp_path, 'export')
    for bad in (None, '', '   '):
        r = client.post(f'/api/bank/{bank_id}/rename', json={'name': bad})
        assert r.status_code == 400, (bad, r.get_json())
    # A name past the column width would be TRUNCATED by SQLite and the UI would
    # then show something the database doesn't hold — refuse it out loud instead.
    r = client.post(f'/api/bank/{bank_id}/rename',
                    json={'name': 'x' * (banks.BANK_NAME_MAX + 1)})
    assert r.status_code == 400
    assert 'too long' in r.get_json()['error']
    # ...and the boundary itself is still accepted.
    r = client.post(f'/api/bank/{bank_id}/rename',
                    json={'name': 'x' * banks.BANK_NAME_MAX})
    assert r.status_code == 200


def test_rename_unknown_bank_is_404(client):
    r = client.post('/api/bank/4242/rename', json={'name': 'nope'})
    assert r.status_code == 404
