"""🗃️ Image bank — "one bank per subfolder" importer.

Point at a parent folder whose top-level subfolders each become their OWN bank
(rooted at the subfolder, files referenced in place). Loose images sitting
directly in the parent get their own parent-named bank by default, so nothing is
silently dropped. Deeper nesting stays a child bank's own subfolder facet.
"""
import os

from PIL import Image


def _save(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', (32, 32), (128, 128, 128)).save(path, 'JPEG', quality=90)


def _tree(src, layout):
    """layout: {relpath: True} — create a small image at each relpath under src."""
    for rel in layout:
        _save(str(src / rel))


def _banks(client):
    return {b['name']: b for b in client.get('/api/banks').get_json()['banks']}


def test_split_preview_counts_subfolders_and_loose(client, tmp_path):
    src = tmp_path / 'export'
    _tree(src, ['chatA/1.jpg', 'chatA/2.jpg', 'chatB/1.jpg',
                'loose1.jpg', 'loose2.jpg', 'loose3.jpg'])
    r = client.post('/api/bank/split/preview', json={'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    assert d['loose_root_count'] == 3
    assert {(s['name'], s['image_count']) for s in d['subfolders']} == {
        ('chatA', 2), ('chatB', 1)}


def test_split_creates_one_bank_per_subfolder_plus_loose(client, tmp_path):
    src = tmp_path / 'export'
    _tree(src, ['chatA/1.jpg', 'chatA/2.jpg', 'chatB/1.jpg', 'loose1.jpg'])
    r = client.post('/api/bank/split', json={'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    created = r.get_json()['banks']
    # 2 subfolders + 1 loose bank = 3 banks, nothing dropped.
    assert len(created) == 3
    banks = _banks(client)
    prefix = f'{os.path.basename(str(src))} / '
    assert banks[f'{prefix}chatA']['total'] == 2
    assert banks[f'{prefix}chatB']['total'] == 1
    assert banks[f'{prefix}(loose files)']['total'] == 1
    # Each subfolder bank is rooted at its own subfolder (files referenced in place).
    assert banks[f'{prefix}chatA']['source_path'] == os.path.join(
        os.path.realpath(str(src)), 'chatA')


def test_split_can_skip_loose(client, tmp_path):
    src = tmp_path / 'export'
    _tree(src, ['chatA/1.jpg', 'loose1.jpg', 'loose2.jpg'])
    r = client.post('/api/bank/split',
                    json={'folder': str(src), 'include_loose': False})
    assert r.status_code == 200, r.get_json()
    created = r.get_json()['banks']
    assert len(created) == 1                       # only chatA; loose skipped
    assert all('loose' not in b['name'] for b in created)


def test_split_no_subfolders_falls_back_to_single_bank(client, tmp_path):
    src = tmp_path / 'flat'
    _tree(src, ['a.jpg', 'b.jpg'])
    r = client.post('/api/bank/split', json={'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    created = r.get_json()['banks']
    assert len(created) == 1
    assert created[0]['added'] == 2


def test_split_preserves_nested_dirs_as_child_subfolder(client, tmp_path):
    src = tmp_path / 'export'
    _tree(src, ['chatA/2024/deep.jpg'])
    r = client.post('/api/bank/split', json={'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    bank_id = r.get_json()['banks'][0]['id']
    # The nested "2024" dir becomes the child bank's own subfolder facet.
    subs = client.get(f'/api/bank/{bank_id}/subfolders').get_json()
    names = {s['name'] for s in subs.get('subfolders', [])}
    assert '2024' in names


def test_loose_bank_never_absorbs_the_subfolder_banks_images(client, tmp_path):
    """The loose-files bank is rooted at the PARENT it shares with the subfolder
    banks. The live folder re-walk (refresh_bank, run on every /api/banks) must
    NOT recurse for it, or every subfolder image would be re-imported into it —
    the bank would grow to the whole export and duplicate its siblings."""
    src = tmp_path / 'export'
    _tree(src, ['chatA/1.jpg', 'chatA/2.jpg', 'chatB/1.jpg', 'loose1.jpg'])
    assert client.post('/api/bank/split', json={'folder': str(src)}).status_code == 200
    prefix = f'{os.path.basename(str(src))} / '
    # Several list loads = several forced re-walks; the counts must not drift.
    for _ in range(3):
        banks = _banks(client)
    assert banks[f'{prefix}(loose files)']['total'] == 1
    assert banks[f'{prefix}chatA']['total'] == 2
    # A NEW loose file is still picked up (the sync stays live, just top-level).
    _save(str(src / 'loose2.jpg'))
    from app.services import image_bank_service as svc
    svc.reset_folder_sync()
    assert _banks(client)[f'{prefix}(loose files)']['total'] == 2


def test_subfolder_bank_still_picks_up_new_files(client, tmp_path):
    """A normal (non-loose) split bank keeps upstream's live-folder behaviour."""
    src = tmp_path / 'export'
    _tree(src, ['chatA/1.jpg', 'loose1.jpg'])
    assert client.post('/api/bank/split', json={'folder': str(src)}).status_code == 200
    prefix = f'{os.path.basename(str(src))} / '
    _save(str(src / 'chatA' / '2.jpg'))
    from app.services import image_bank_service as svc
    svc.reset_folder_sync()
    assert _banks(client)[f'{prefix}chatA']['total'] == 2


def test_split_bad_folder_is_400(client, tmp_path):
    r = client.post('/api/bank/split', json={'folder': str(tmp_path / 'nope')})
    assert r.status_code == 400
    assert 'not found' in r.get_json()['error']


def test_the_bank_list_does_not_re_walk_on_every_retry(client, tmp_path, monkeypatch):
    """A `db_busy` 503 is replayed by the SPA, and the list used to answer every
    replay with another forced walk of every bank folder.

    So a request that failed BECAUSE SQLite's single writer was contended
    responded by generating more write load, and the retries sustained the
    contention that caused them. Seen in the wild as repeated
    `sqlite write lock unavailable on GET /api/banks` alongside a starved
    vision-GPU heartbeat.
    """
    from app.services import image_bank_service as svc

    src = tmp_path / 'export'
    _tree(src, ['chatA/1.jpg', 'loose1.jpg'])
    assert client.post('/api/bank/split', json={'folder': str(src)}).status_code == 200

    walks = {'n': 0}
    real_refresh = svc.refresh_bank

    def counting_refresh(user_id, bank_id, force=False):
        if force:
            walks['n'] += 1
        return real_refresh(user_id, bank_id, force=force)
    monkeypatch.setattr(svc, 'refresh_bank', counting_refresh)

    svc.reset_folder_sync()
    _banks(client)                      # a genuine navigation: walks
    first = walks['n']
    assert first > 0, 'the list must still walk when the user opens the tab'

    for _ in range(5):                  # the replay storm
        _banks(client)
    assert walks['n'] == first, 'each retry re-walked every bank folder'


def test_a_genuine_navigation_still_walks_after_the_floor(client, tmp_path, monkeypatch):
    """The floor must not become a cooldown: past it, opening the tab picks up
    files dropped in the folder, which is why the list forces at all."""
    from app.services import image_bank_service as svc

    src = tmp_path / 'export'
    _tree(src, ['chatA/1.jpg', 'loose1.jpg'])
    assert client.post('/api/bank/split', json={'folder': str(src)}).status_code == 200
    prefix = f'{os.path.basename(str(src))} / '

    svc.reset_folder_sync()
    _banks(client)
    _save(str(src / 'chatA' / '2.jpg'))
    # Inside the floor the new file is not visible yet…
    assert _banks(client)[f'{prefix}chatA']['total'] == 1
    # …and past it, it is — without touching the 60 s per-bank cooldown.
    monkeypatch.setattr(svc, 'FOLDER_SYNC_FORCE_FLOOR', 0.0)
    assert _banks(client)[f'{prefix}chatA']['total'] == 2
