"""🗃️ One folder, one bank — adding a folder twice must never make two.

Two banks over the SAME folder are not a cosmetic duplicate. Every score,
decision, cluster and caption lives on the bank row, so the triage done in one is
invisible in the other, and whichever one the user stops opening silently strands
it. Nothing warned about it either: the second add looked exactly like the first.

Measured on a real install before the fix: 187 banks over 178 distinct paths.
Every collision had the same shape — a character folder added on its own, then
the parent split per-subfolder months later, which registered all of them again
as empty twins. That case is the second test here.

The identity is (source_path, root_only), not source_path alone: the split's
loose-files bank shares its folder with the subfolder banks and owns a different
set, so matching them together would make an ordinary add adopt the loose bank.
"""
from PIL import Image


def _tree(tmp_path, spec):
    """spec: {'sub': n} -> n images under each subfolder. '' is the root."""
    root = tmp_path / 'root'
    root.mkdir(parents=True, exist_ok=True)
    for rel, n in spec.items():
        d = root / rel if rel else root
        d.mkdir(parents=True, exist_ok=True)
        for i in range(n):
            Image.new('RGB', (32, 32), (i, 90, 160)).save(str(d / f'{i}.jpg'))
    return root


# --- create_bank --------------------------------------------------------------

def test_adding_the_same_folder_twice_reuses_the_first_bank(app, tmp_path):
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'': 3})
    with app.app_context():
        first, added = banks.create_bank('local', 'Dump', str(root))
        assert added == 3
        second, again = banks.create_bank('local', 'Dump again', str(root))
        assert second.id == first.id, 'the same folder must not make a second bank'
        assert again == 0, 'nothing new on disk, nothing added'
        assert ImageBank.query.count() == 1


def test_the_reused_bank_keeps_its_decisions_and_picks_up_new_files(app, tmp_path):
    """The reuse REFRESHES, and refresh_bank is strictly additive. Re-adding a
    folder is therefore a safe way to pick up new files, never a triage reset."""
    from app.models import BankImage
    from app.extensions import db
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'': 2})
    with app.app_context():
        bank, _added = banks.create_bank('local', 'Dump', str(root))
        row = BankImage.query.filter_by(bank_id=bank.id).first()
        row.status = 'keep'
        db.session.commit()
        kept_relpath = row.relpath

        Image.new('RGB', (32, 32), (7, 7, 7)).save(str(root / 'new.jpg'))
        same, added = banks.create_bank('local', 'Dump', str(root))

        assert same.id == bank.id
        assert added == 1, 'the file that appeared since the first add'
        assert BankImage.query.filter_by(bank_id=bank.id).count() == 3
        still = BankImage.query.filter_by(bank_id=bank.id,
                                          relpath=kept_relpath).first()
        assert still.status == 'keep', 'a decision must survive the re-add'


def test_a_different_folder_still_makes_its_own_bank(app, tmp_path):
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    a = _tree(tmp_path / 'a', {'': 1})
    b = _tree(tmp_path / 'b', {'': 1})
    with app.app_context():
        first, _ = banks.create_bank('local', 'A', str(a))
        second, _ = banks.create_bank('local', 'B', str(b))
        assert first.id != second.id
        assert ImageBank.query.count() == 2


def test_the_match_ignores_a_trailing_separator_and_case(app, tmp_path):
    """A user pastes the folder from the address bar, from a shell, or with
    Windows' «Copy as path» — three spellings of one directory."""
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'': 2})
    with app.app_context():
        first, _ = banks.create_bank('local', 'Dump', str(root))
        again, _ = banks.create_bank('local', 'Dump', str(root) + '/')
        assert again.id == first.id
        assert ImageBank.query.count() == 1


# --- the split, which is how it actually happened ------------------------------

def test_splitting_a_parent_reuses_the_subfolder_banks_already_added(app, tmp_path):
    """The real-world collision, reproduced. Add two character folders on their
    own, split the parent later, and every one used to come back as an empty
    twin holding none of the triage."""
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'alice': 2, 'bob': 3})
    with app.app_context():
        alice, _ = banks.create_bank('local', 'alice', str(root / 'alice'))
        bob, _ = banks.create_bank('local', 'bob', str(root / 'bob'))

        created = banks.split_folder_into_banks('local', str(root))

        assert ImageBank.query.count() == 2, 'the split created nothing new'
        assert {c['id'] for c in created} == {alice.id, bob.id}
        assert all(c['reused'] for c in created)


def test_the_split_still_creates_the_subfolders_that_are_not_banks_yet(app, tmp_path):
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'alice': 2, 'bob': 3})
    with app.app_context():
        alice, _ = banks.create_bank('local', 'alice', str(root / 'alice'))
        created = banks.split_folder_into_banks('local', str(root))

        assert ImageBank.query.count() == 2, 'bob only'
        by_reuse = {c['reused']: c for c in created}
        assert by_reuse[True]['id'] == alice.id
        assert by_reuse[False]['added'] == 3


def test_a_loose_files_bank_is_not_confused_with_a_recursive_one(app, tmp_path):
    """(source_path, root_only) is the identity. The split's loose bank and a
    plain recursive bank can share a folder and own different sets — matching
    them together would make an ordinary add adopt the loose bank."""
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'alice': 2, '': 3})
    with app.app_context():
        created = banks.split_folder_into_banks('local', str(root))
        assert len(created) == 2, 'alice + the loose bank'
        loose = ImageBank.query.filter_by(root_only=True).one()

        plain, added = banks.create_bank('local', 'Everything', str(root))
        assert plain.id != loose.id, 'a recursive add is a different bank'
        assert added == 5, 'it recurses, so it owns alice too'


def test_splitting_the_same_parent_twice_creates_nothing_the_second_time(app, tmp_path):
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    root = _tree(tmp_path, {'alice': 2, 'bob': 3, '': 1})
    with app.app_context():
        first = banks.split_folder_into_banks('local', str(root))
        count = ImageBank.query.count()
        second = banks.split_folder_into_banks('local', str(root))

        assert ImageBank.query.count() == count
        assert {c['id'] for c in first} == {c['id'] for c in second}
        assert all(c['reused'] for c in second)


# --- the video lane carries the same rule -------------------------------------
# Bank and Video bank are two surfaces of one idea, and the rule is stated once
# per lane rather than once overall — so it is pinned here on BOTH, in one file,
# for the reason CLAUDE.md gives: a behaviour duplicated by hand drifts.

def _rushes(tmp_path, names=('a.mp4',)):
    folder = tmp_path / 'rushes'
    folder.mkdir(parents=True, exist_ok=True)
    for n in names:
        (folder / n).write_bytes(b'\x00' * 32)
    return str(folder)


def test_adding_the_same_rushes_folder_twice_reuses_the_video_bank(app, tmp_path):
    from app.models import VideoBank
    from app.services import video_bank_service as vbanks

    folder = _rushes(tmp_path, ('a.mp4', 'b.mov'))
    with app.app_context():
        first, added = vbanks.create_bank('local', 'Rushes', folder)
        assert added == 2
        second, again = vbanks.create_bank('local', 'Rushes again', folder)
        assert second.id == first.id
        assert again == 0
        assert VideoBank.query.count() == 1


def test_the_reused_video_bank_picks_up_new_rushes(app, tmp_path):
    from app.models import VideoSource
    from app.services import video_bank_service as vbanks

    folder = _rushes(tmp_path, ('a.mp4',))
    with app.app_context():
        bank, _added = vbanks.create_bank('local', 'Rushes', folder)
        (tmp_path / 'rushes' / 'later.mp4').write_bytes(b'\x00' * 32)
        same, added = vbanks.create_bank('local', 'Rushes', folder)
        assert same.id == bank.id
        assert added == 1
        assert VideoSource.query.filter_by(bank_id=bank.id).count() == 2


def test_both_lanes_answer_the_same_question_the_same_way(app, tmp_path):
    """One name, one meaning, both lanes — the pair that must not drift."""
    from app.services import image_bank_service as banks
    from app.services import video_bank_service as vbanks

    images = _tree(tmp_path / 'img', {'': 1})
    rushes = _rushes(tmp_path / 'vid')
    with app.app_context():
        assert banks.bank_for_source('local', str(images)) is None
        assert vbanks.bank_for_source('local', rushes) is None

        img_bank, _ = banks.create_bank('local', 'I', str(images))
        vid_bank, _ = vbanks.create_bank('local', 'V', rushes)

        # Found again, through a trailing separator, for both.
        assert banks.bank_for_source('local', str(images) + '/').id == img_bank.id
        assert vbanks.bank_for_source('local', rushes + '/').id == vid_bank.id
        # And neither lane answers for the other's folder.
        assert banks.bank_for_source('local', rushes) is None
        assert vbanks.bank_for_source('local', str(images)) is None


# --- the route tells the two outcomes apart -----------------------------------

def test_the_create_route_reports_whether_it_reused(client, tmp_path):
    """`added: 0` on a reuse is honest but reads as a failed import, so the
    payload says which of the two happened."""
    root = _tree(tmp_path, {'': 2})

    first = client.post('/api/bank/create',
                        json={'name': 'Dump', 'folder': str(root)}).get_json()
    assert first['reused'] is False
    assert first['added'] == 2

    second = client.post('/api/bank/create',
                         json={'name': 'Dump', 'folder': str(root)}).get_json()
    assert second['reused'] is True
    assert second['id'] == first['id']
