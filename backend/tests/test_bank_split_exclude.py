"""🗃️ One bank per subfolder — leaving folders out of the import.

The exclusion itself is easy. The trap is the FALLBACK: when no image-bearing
subfolder survives, split_folder_into_banks falls back to create_bank on the
PARENT — which recurses the whole tree and would re-import exactly what was just
excluded, under one bank, with no error and no visible sign. That case is written
first here on purpose.

Exclusions apply to ONE import and are not persisted: each bank created is rooted
at its own subfolder, so its live re-walk never sees the excluded ones anyway.
"""
import pytest
from PIL import Image


def _tree(tmp_path, spec):
    """spec: {'sub/or/loose.jpg': n} -> writes n images under each folder."""
    root = tmp_path / 'root'
    for rel, n in spec.items():
        d = root / rel if rel else root
        d.mkdir(parents=True, exist_ok=True)
        for i in range(n):
            Image.new('RGB', (32, 32), (i, 90, 160)).save(str(d / f'{i}.jpg'))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _loose(root, n):
    for i in range(n):
        Image.new('RGB', (32, 32), (200, i, 60)).save(str(root / f'loose{i}.jpg'))


# --- the fallback, first ------------------------------------------------------

def test_excluding_every_subfolder_never_re_imports_them_through_the_fallback(
        app, tmp_path):
    """The whole point of this file. Without the guard, create_bank(parent)
    recurses and imports every excluded image under one bank."""
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'a': 3, 'b': 2})
    with app.app_context():
        with pytest.raises(ValueError, match='every subfolder was excluded'):
            banks.split_folder_into_banks('local', str(root), exclude=['a', 'b'])
        from app.models import ImageBank
        assert ImageBank.query.count() == 0, 'nothing may be created'


def test_excluding_every_subfolder_still_makes_the_loose_bank(app, tmp_path):
    """…but loose root images were not excluded, so they are still imported —
    rooted at the parent with root_only, which is what stops the re-walk from
    descending into the excluded folders."""
    from app.extensions import db
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'a': 3})
    _loose(root, 2)
    with app.app_context():
        created = banks.split_folder_into_banks('local', str(root), exclude=['a'])
        assert len(created) == 1 and created[0]['added'] == 2
        bank = db.session.get(ImageBank, created[0]['id'])
        assert bank.root_only is True, \
            'without root_only the re-walk descends into the excluded folder'


def test_excluding_everything_with_no_loose_images_refuses_rather_than_guessing(
        app, tmp_path):
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'a': 2})
    with app.app_context():
        with pytest.raises(ValueError, match='nothing left to create'):
            banks.split_folder_into_banks('local', str(root), exclude=['a'],
                                          include_loose=True)


# --- the ordinary path --------------------------------------------------------

def test_an_excluded_subfolder_gets_no_bank(app, tmp_path):
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'keep': 2, 'skipme': 5})
    with app.app_context():
        created = banks.split_folder_into_banks('local', str(root),
                                                exclude=['skipme'])
        names = [c['name'] for c in created]
        assert len(created) == 1
        assert 'keep' in names[0] and 'skipme' not in names[0]
        assert created[0]['added'] == 2


def test_the_excluded_folder_is_never_walked_at_all(app, tmp_path):
    """Pruned at depth 0 inside the walk, not filtered afterwards — that is the
    difference between skipping a 40 000-file folder and reading it first."""
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'keep': 1, 'huge': 3, 'huge/deep': 4})
    with app.app_context():
        _folder, buckets, _loose_rels = banks._split_walk(str(root),
                                                          exclude=['huge'])
        assert set(buckets) == {'keep'}
        assert not any('deep' in r for rels in buckets.values() for r in rels)


def test_exclusion_matching_follows_the_filesystem_on_case(app, tmp_path):
    """normcase, so the rule matches what the OS itself considers one folder:
    "photos" excludes "Photos" on Windows, and does NOT on Linux — where they are
    genuinely two different folders and skipping both would drop images the user
    never excluded. The exact name always works, and it is what the UI sends
    (the checkbox is ticked off a listing we produced)."""
    import os

    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'Photos': 2, 'keep': 1})
    with app.app_context():
        assert set(banks._split_walk(str(root), exclude=['Photos'])[1]) == {'keep'}
        folded = os.path.normcase('Photos') == os.path.normcase('photos')
        _f, buckets, _l = banks._split_walk(str(root), exclude=['photos'])
        assert set(buckets) == ({'keep'} if folded else {'Photos', 'keep'})


def test_nested_folders_below_an_included_one_are_untouched(app, tmp_path):
    """Exclusion is TOP-LEVEL only. A nested folder inside an included subfolder
    stays part of that bank — it is the bank's own subfolder facet."""
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'keep': 1, 'keep/inner': 2, 'skipme': 1})
    with app.app_context():
        _f, buckets, _l = banks._split_walk(str(root), exclude=['skipme'])
        assert set(buckets) == {'keep'}
        assert len(buckets['keep']) == 3


def test_no_exclusions_behaves_exactly_as_before(app, tmp_path):
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'a': 2, 'b': 1})
    _loose(root, 1)
    with app.app_context():
        for exclude in (None, [], ['   ']):
            _f, buckets, loose = banks._split_walk(str(root), exclude=exclude)
            assert set(buckets) == {'a', 'b'} and len(loose) == 1


def test_the_preview_is_deliberately_unchanged(app, tmp_path):
    """Exclusions are CLIENT state, sent only on create. The preview effect is
    debounced on the folder, so making the preview exclusion-aware would mean a
    re-POST per checkbox and a race between what is ticked and what is drawn."""
    from app.services import image_bank_service as banks
    import inspect

    root = _tree(tmp_path, {'a': 1, 'b': 1})
    with app.app_context():
        preview = banks.split_folder_preview(str(root))
        assert {s['name'] for s in preview['subfolders']} == {'a', 'b'}
    assert 'exclude' not in inspect.signature(banks.split_folder_preview).parameters


# --- the route ----------------------------------------------------------------

def test_the_route_passes_exclusions_through(app, client, tmp_path):
    root = _tree(tmp_path, {'keep': 2, 'skipme': 3})
    r = client.post('/api/bank/split',
                    json={'folder': str(root), 'exclude': ['skipme']})
    assert r.status_code == 200
    created = r.get_json()['banks']
    assert len(created) == 1 and created[0]['added'] == 2


def test_the_route_coerces_a_junk_exclude_rather_than_silently_ignoring_it(
        app, client, tmp_path):
    """A non-list `exclude` must not reach the walk as something that matches
    nothing — an exclusion that quietly does not apply is the worst outcome."""
    root = _tree(tmp_path, {'a': 1, 'b': 1})
    r = client.post('/api/bank/split',
                    json={'folder': str(root), 'exclude': 'a'})
    assert r.status_code == 200
    assert len(r.get_json()['banks']) == 2, 'a string is not a list of names'


def test_the_route_400s_when_everything_was_excluded(app, client, tmp_path):
    root = _tree(tmp_path, {'a': 1})
    r = client.post('/api/bank/split',
                    json={'folder': str(root), 'exclude': ['a']})
    assert r.status_code == 400
    assert 'nothing left to create' in r.get_json()['error']
