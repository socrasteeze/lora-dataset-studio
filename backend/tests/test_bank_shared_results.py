"""Nested banks share one analysis per image.

A character folder and its outfit folders are separate banks over the same
files. Every pass used to compute its result once per bank. Now a pass takes
what an overlapping bank already computed for the same file, computes only
the rest, and fills the result into the other banks. Rows, decisions and the
bank-local groups stay per bank, and no bank over the same folder is added
twice.
"""
import os

import numpy as np
from PIL import Image

from app.config import LOCAL_USER


def _tree(root):
    for rel, colour in (('a.png', 10), ('outfit/b.png', 90), ('outfit/c.png', 170)):
        path = root / rel
        os.makedirs(path.parent, exist_ok=True)
        Image.new('RGB', (64, 64), (colour, 40, 200 - colour)).save(str(path))


def _create(client, name, folder):
    r = client.post('/api/bank/create', json={'name': name, 'folder': str(folder)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id']


def _nested(client, tmp_path):
    hero = tmp_path / 'hero'
    _tree(hero)
    return _create(client, 'Hero', hero), _create(client, 'Outfit', hero / 'outfit'), hero


def _rows(bank_id):
    from app.models import BankImage
    return {os.path.basename(r.relpath): r
            for r in BankImage.query.filter_by(bank_id=bank_id)}


def _stub_tagger(monkeypatch):
    from app.services import wd14_tagger as w
    import app.capabilities as caps
    sent = []

    def fake_tag_images(paths, threshold_value=None, on_progress=None, **kw):
        sent.append(sorted(os.path.basename(p) for p in paths))
        return {'ok': True, 'model': 't',
                'results': {p: {os.path.basename(p)[0] + '_tag': 0.9} for p in paths}}

    monkeypatch.setattr(w, 'tag_images', fake_tag_images)
    monkeypatch.setattr(caps, 'probe_wd14', lambda: {'ok': True, 'detail': 'stub'})
    monkeypatch.setattr(w, 'uses_gpu', lambda: False)
    monkeypatch.setattr(w, 'gpu_refusal', lambda: None)
    return sent


def _set(bank_id, name, **values):
    from app.extensions import db
    row = _rows(bank_id)[name]
    for k, v in values.items():
        setattr(row, k, v)
    db.session.commit()


def test_a_pass_skips_images_an_overlapping_bank_already_has(
        app, client, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks
    parent, child, _hero = _nested(client, tmp_path)
    sent = _stub_tagger(monkeypatch)
    with app.app_context():
        _set(parent, 'b.png', tags='{"tags":{"x":0.9}}', tags_text=',x,', tags_state='ok')
        banks.start_tags(app, LOCAL_USER, child)
        assert sent == [['c.png']], 'only the image no bank has tagged is computed'
        rows = _rows(child)
        assert rows['b.png'].tags_text == ',x,' and rows['b.png'].tags_state == 'ok'
        assert rows['c.png'].tags_state == 'ok'


def test_a_finished_pass_fills_the_other_banks_at_once(app, client, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks
    parent, child, _hero = _nested(client, tmp_path)
    sent = _stub_tagger(monkeypatch)
    with app.app_context():
        banks.start_tags(app, LOCAL_USER, parent)
        assert sent == [['a.png', 'b.png', 'c.png']]
        child_rows = _rows(child)
        assert {r.tags_state for r in child_rows.values()} == {'ok'}
        assert child_rows['b.png'].tags_text == _rows(parent)['b.png'].tags_text
        banks.start_tags(app, LOCAL_USER, child)
        assert len(sent) == 1, 'the outfit bank had nothing left to compute'


def test_a_forced_rerun_recomputes_every_image(app, client, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks
    parent, child, _hero = _nested(client, tmp_path)
    sent = _stub_tagger(monkeypatch)
    with app.app_context():
        banks.start_tags(app, LOCAL_USER, parent)
        banks.start_tags(app, LOCAL_USER, child, rescan=True)
        assert sent[-1] == ['b.png', 'c.png']


def test_an_edited_or_resized_copy_is_not_shared(app, client, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks
    parent, child, _hero = _nested(client, tmp_path)
    sent = _stub_tagger(monkeypatch)
    with app.app_context():
        for name in ('b.png', 'c.png'):
            _set(parent, name, tags='{}', tags_text=',x,', tags_state='ok')
        _set(child, 'b.png', rotation=90)          # the child shows a rotated b
        _set(parent, 'c.png', file_size=1)         # recorded for different bytes
        banks.start_tags(app, LOCAL_USER, child)
        assert sent == [['b.png', 'c.png']]


def test_decisions_and_bank_local_groups_stay_per_bank(app, client, tmp_path):
    from app.services import bank_shared_results as shared
    parent, child, _hero = _nested(client, tmp_path)
    with app.app_context():
        _set(parent, 'b.png', status='keep', face_cluster=3, dup_group=7,
             framing='body', caption='a person', caption_origin='joycaption')
        shared.share_all()
        b = _rows(child)['b.png']
        assert (b.framing, b.caption, b.caption_origin) == ('body', 'a person', 'joycaption')
        assert b.status == 'pending'
        assert b.face_cluster is None and b.dup_group is None


def test_the_merge_fills_both_directions_and_never_overwrites(app, client, tmp_path):
    from app.services import bank_shared_results as shared
    parent, child, _hero = _nested(client, tmp_path)
    with app.app_context():
        _set(parent, 'b.png', framing='body', caption='parent words')
        _set(child, 'b.png', medium='photo', medium_margin=0.4, caption='child words')
        before = (len(_rows(parent)), len(_rows(child)))
        counts = shared.share_all()
        p, c = _rows(parent)['b.png'], _rows(child)['b.png']
        assert c.framing == 'body' and p.medium == 'photo' and p.medium_margin == 0.4
        assert (p.caption, c.caption) == ('parent words', 'child words')
        assert counts['framing'] == 1 and counts['medium'] == 1 and counts['caption'] == 0
        assert (len(_rows(parent)), len(_rows(child))) == before, 'no row is removed'
        assert shared.share_all() == {lane: 0 for lane in shared.LANES}


def test_a_filled_scan_still_builds_the_banks_own_duplicate_groups(
        app, client, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks
    parent, child, _hero = _nested(client, tmp_path)
    with app.app_context():
        banks.start_scan(app, LOCAL_USER, parent)
        assert all(r.quality_state == 'ok' for r in _rows(parent).values())
        regrouped = []
        real = banks.rebuild_dup_groups
        monkeypatch.setattr(banks, 'rebuild_dup_groups',
                            lambda bank_id, **kw: regrouped.append(bank_id) or real(bank_id, **kw))
        banks.start_scan(app, LOCAL_USER, child)
        rows = _rows(child)
        assert all(r.quality_state == 'ok' and r.dhash for r in rows.values())
        assert rows['b.png'].dhash == _rows(parent)['b.png'].dhash
        assert regrouped == [child]


def _fake_score_cache(path, image_paths):
    n = len(image_paths)
    np.savez(str(path), paths=np.array(image_paths), states=np.array(['ok'] * n),
             aes=np.full(n, 5.5, 'float32'), nsfw=np.zeros(n, 'float32'),
             embs=np.ones((n, 768), 'float32'), sigs=np.array(['1:1'] * n),
             hashes=np.zeros((n, 32), 'uint8'))


def test_the_score_cache_is_seeded_from_the_overlapping_bank(app, client, tmp_path):
    from app.services import bank_shared_results as shared
    from app.services import image_bank_service as banks
    parent, child, hero = _nested(client, tmp_path)
    with app.app_context():
        parent_cache = banks._score_cache_path(parent)
        parent_cache.parent.mkdir(parents=True, exist_ok=True)
        real = os.path.realpath(str(hero))
        _fake_score_cache(parent_cache, [os.path.join(real, 'outfit', 'b.png'),
                                         os.path.join(real, 'a.png')])
        assert shared.pull(child, 'score') == 1
        with np.load(str(banks._score_cache_path(child))) as z:
            assert [os.path.basename(str(p)) for p in z['paths']] == ['b.png']
            assert z['embs'].shape == (1, 768) and z['hashes'].shape == (1, 32)
        assert shared.pull(child, 'score') == 0, 'an entry is seeded once'


def test_adding_the_same_folder_again_resolves_to_the_existing_bank(app, client, tmp_path):
    hero = tmp_path / 'hero'
    _tree(hero)
    first = _create(client, 'Hero', hero)
    again = _create(client, 'Hero again', str(hero) + os.sep)
    upper = _create(client, 'Hero upper', str(hero).upper()) if os.name == 'nt' else first
    assert first == again == upper
    with app.app_context():
        from app.models import ImageBank
        assert ImageBank.query.count() == 1


def test_moving_a_bank_onto_another_banks_folder_is_refused(app, client, tmp_path):
    parent, child, hero = _nested(client, tmp_path)
    other = tmp_path / 'elsewhere'
    _tree(other)
    third = _create(client, 'Elsewhere', other)
    r = client.post(f'/api/bank/{third}/relocate', json={'folder': str(hero)})
    assert r.status_code == 400
    assert 'already the bank' in r.get_json()['error']
