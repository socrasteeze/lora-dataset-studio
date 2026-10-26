"""Bank passes skip folders named reference, scratch or review.

Reference sheets, scratch work and review piles sit inside character folders
but are not training material. Every pass used to score, tag and caption them
anyway. By default the passes now skip folders with those names (configurable
in Settings), at any depth below the bank root. The grid still shows them.
"""
import os

from PIL import Image

from app.config import LOCAL_USER, save_config

TREE = ('root.jpg', 'reference/a.jpg', 'Look/Scratch/b.jpg', 'outfit/c.jpg',
        'notreference/d.jpg', 'outfit/_review/e.jpg', 'outfit/scratchpad/f.jpg')
SKIPPED = {'reference/a.jpg', 'Look/Scratch/b.jpg', 'outfit/_review/e.jpg'}


def _bank(client, root):
    for rel in TREE:
        path = root / rel
        os.makedirs(path.parent, exist_ok=True)
        Image.new('RGB', (16, 16), (len(rel), 60, 90)).save(str(path))
    r = client.post('/api/bank/create', json={'name': 'Names', 'folder': str(root)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id']


def _processable_rels(bank_id):
    from app.models import BankImage
    from app.services import image_bank_service as banks
    return {r.relpath.replace('\\', '/')
            for r in BankImage.query.filter(banks._processable(bank_id))}


def test_default_names_are_skipped_at_any_depth_and_any_case(app, client, tmp_path):
    bank_id = _bank(client, tmp_path / 'src')
    with app.app_context():
        assert _processable_rels(bank_id) == set(TREE) - SKIPPED


def test_skipped_images_stay_visible_in_the_grid(app, client, tmp_path):
    bank_id = _bank(client, tmp_path / 'src')
    rows = client.get(f'/api/bank/{bank_id}/images?limit=50').get_json()['images']
    assert {r['relpath'].replace('\\', '/') for r in rows} == set(TREE)


def test_an_empty_list_processes_every_folder(app, client, tmp_path):
    bank_id = _bank(client, tmp_path / 'src')
    save_config({'bank_processing': {'excluded_folder_names': []}})
    with app.app_context():
        assert _processable_rels(bank_id) == set(TREE)


def test_the_list_is_configurable_and_cleaned(app, client, tmp_path):
    from app.services import image_bank_service as banks
    bank_id = _bank(client, tmp_path / 'src')
    save_config({'bank_processing': {'excluded_folder_names': [' NotReference ', '', 'a/b']}})
    with app.app_context():
        assert banks.excluded_folder_names() == ['notreference']
        assert _processable_rels(bank_id) == set(TREE) - {'notreference/d.jpg'}
    save_config({'bank_processing': {'excluded_folder_names': 'scratch, review'}})
    with app.app_context():
        assert banks.excluded_folder_names() == ['scratch', 'review']


def test_a_bank_opened_on_a_reference_folder_still_processes(app, client, tmp_path):
    """Only folders BELOW the bank root count; the root's own name never does."""
    root = tmp_path / 'reference'
    for rel in ('a.jpg', 'b.jpg'):
        os.makedirs(root, exist_ok=True)
        Image.new('RGB', (16, 16), (1, 2, 3)).save(str(root / rel))
    r = client.post('/api/bank/create', json={'name': 'Refs', 'folder': str(root)})
    bank_id = r.get_json()['id']
    with app.app_context():
        assert _processable_rels(bank_id) == {'a.jpg', 'b.jpg'}


def test_the_tag_pass_never_sends_a_skipped_image(app, client, tmp_path, monkeypatch):
    from app.models import BankImage
    from app.services import image_bank_service as banks
    from app.services import wd14_tagger as w
    import app.capabilities as caps
    bank_id = _bank(client, tmp_path / 'src')
    sent = []

    def fake_tag_images(paths, threshold_value=None, on_progress=None, **kw):
        sent.extend(paths)
        return {'ok': True, 'results': {p: {'solo': 0.9} for p in paths}, 'model': 't'}

    monkeypatch.setattr(w, 'tag_images', fake_tag_images)
    monkeypatch.setattr(caps, 'probe_wd14', lambda: {'ok': True, 'detail': 'stub'})
    monkeypatch.setattr(w, 'uses_gpu', lambda: False)
    monkeypatch.setattr(w, 'gpu_refusal', lambda: None)
    with app.app_context():
        banks.start_tags(app, LOCAL_USER, bank_id)
        rels = {os.path.relpath(p, tmp_path / 'src').replace('\\', '/') for p in sent}
        assert rels == set(TREE) - SKIPPED
        untagged = {r.relpath.replace('\\', '/') for r in
                    BankImage.query.filter_by(bank_id=bank_id, tags_state=None)}
        assert untagged == SKIPPED


def test_skipped_images_never_count_as_work_left(app, client, tmp_path):
    """The queue-all rule reads coverage: counting skipped images as pending
    would re-queue a finished bank forever."""
    from app.services import image_bank_service as banks
    bank_id = _bank(client, tmp_path / 'src')
    with app.app_context():
        cov = banks.bank_pass_coverage(LOCAL_USER, [bank_id])[bank_id]
        assert cov['tags']['pending'] == len(TREE) - len(SKIPPED)


def test_settings_round_trip_the_list(app, client):
    from app.services import image_bank_service as banks
    got = client.get('/api/settings').get_json()
    assert got['config_defaults']['bank_processing']['excluded_folder_names'] == [
        'reference', 'references', 'scratch', 'review', '_review']
    r = client.put('/api/settings', json={'config': {
        'bank_processing': {'excluded_folder_names': ['scratch']}}})
    assert r.status_code == 200, r.get_json()
    with app.app_context():
        assert banks.excluded_folder_names() == ['scratch']
