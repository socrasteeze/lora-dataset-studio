"""🗃️ Image bank — accepting that hand-deleted images are gone.

`refresh_bank` is strictly ADDITIVE on purpose: an unplugged drive or a renamed
folder must never wipe a triage built over hours. The cost is that a file deleted
from the folder by hand is counted as "missing" forever and the count never comes
down — there was no way to accept the loss.

`forget_missing` is that accept. The two things it must never do, both pinned
here: touch a file on disk, and run when the folder is unreachable (where EVERY
row looks missing and removing them all is exactly the disaster the additive rule
exists to prevent).
"""
import os

import pytest
from PIL import Image


def _bank(tmp_path, n=3, name='Dump'):
    from app.services import image_bank_service as banks
    src = tmp_path / 'src'
    src.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        Image.new('RGB', (64, 64), (10 * i, 90, 160)).save(str(src / f'a{i}.jpg'))
    bank, _added = banks.create_bank('local', name, str(src))
    return bank.id, src


def test_a_file_deleted_by_hand_is_counted_and_then_accepted(app, tmp_path):
    from app.models import BankImage
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id, src = _bank(tmp_path)
        assert BankImage.query.filter_by(bank_id=bank_id).count() == 3
        os.remove(str(src / 'a1.jpg'))

        # The walk sees it gone and SAYS so — but keeps the row, as designed.
        sync = banks.refresh_bank('local', bank_id, force=True)
        assert sync['missing'] == 1
        assert BankImage.query.filter_by(bank_id=bank_id).count() == 3

        out = banks.forget_missing('local', bank_id)
        assert out == {'removed': 1, 'checked': 3}
        assert BankImage.query.filter_by(bank_id=bank_id).count() == 2
        # …and the flag actually clears, which is the whole point.
        assert banks.refresh_bank('local', bank_id, force=True)['missing'] == 0


def test_nothing_on_disk_is_touched(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id, src = _bank(tmp_path)
        os.remove(str(src / 'a0.jpg'))
        before = sorted(p.name for p in src.iterdir())
        banks.forget_missing('local', bank_id)
        assert sorted(p.name for p in src.iterdir()) == before, \
            'this removes ROWS; the files were already gone'


def test_present_images_keep_their_rows_and_their_decisions(app, tmp_path):
    from app.models import BankImage
    from app.services import image_bank_service as banks
    from app.extensions import db

    with app.app_context():
        bank_id, src = _bank(tmp_path)
        keeper = BankImage.query.filter_by(bank_id=bank_id, relpath='a2.jpg').one()
        keeper.status = 'keep'
        keeper.aesthetic_score = 6.5
        db.session.commit()
        os.remove(str(src / 'a0.jpg'))

        banks.forget_missing('local', bank_id)
        again = BankImage.query.filter_by(bank_id=bank_id, relpath='a2.jpg').one()
        assert again.status == 'keep' and again.aesthetic_score == 6.5


def test_nothing_missing_removes_nothing(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id, _src = _bank(tmp_path)
        assert banks.forget_missing('local', bank_id) == {'removed': 0, 'checked': 3}


def test_an_unreachable_folder_is_refused_rather_than_emptying_the_bank(app, tmp_path):
    """The sharpest edge. With the drive unplugged every row looks missing, and
    an eager forget would delete the entire triage — the exact failure the
    additive walk was written to prevent."""
    from app.models import BankImage
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id, src = _bank(tmp_path)
        for p in src.iterdir():
            p.unlink()
        src.rmdir()
        with pytest.raises(RuntimeError, match='not reachable'):
            banks.forget_missing('local', bank_id)
        assert BankImage.query.filter_by(bank_id=bank_id).count() == 3, \
            'an unplugged drive must never be read as "these files are gone"'


def test_a_running_pass_refuses_it(app, tmp_path):
    from unittest.mock import patch

    from app.services import bank_jobs, image_bank_service as banks

    with app.app_context():
        bank_id, _src = _bank(tmp_path)
        with patch.object(bank_jobs, 'running', lambda bid: True):
            with pytest.raises(RuntimeError, match='stop it first'):
                banks.forget_missing('local', bank_id)


def test_another_bank_over_the_same_tree_is_unaffected(app, tmp_path):
    """A bank does not own its folder. Forgetting rows is local to ONE bank — it
    must not reach into the neighbour that still lists the same files."""
    from app.models import BankImage
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id, src = _bank(tmp_path)
        other, _added = banks.create_bank('local', 'Second', str(src))
        os.remove(str(src / 'a0.jpg'))
        banks.forget_missing('local', bank_id)
        assert BankImage.query.filter_by(bank_id=bank_id).count() == 2
        assert BankImage.query.filter_by(bank_id=other.id).count() == 3


# --- the route ---------------------------------------------------------------

def test_the_route_reports_what_it_removed(app, client, tmp_path):

    with app.app_context():
        bank_id, src = _bank(tmp_path)
        os.remove(str(src / 'a1.jpg'))
    r = client.post(f'/api/bank/{bank_id}/forget-missing')
    assert r.status_code == 200
    assert r.get_json() == {'ok': True, 'removed': 1, 'checked': 3}


def test_the_route_refuses_an_unreachable_folder_with_409(app, client, tmp_path):
    with app.app_context():
        bank_id, src = _bank(tmp_path)
        for p in src.iterdir():
            p.unlink()
        src.rmdir()
    r = client.post(f'/api/bank/{bank_id}/forget-missing')
    assert r.status_code == 409
    assert 'not reachable' in r.get_json()['error']


def test_the_route_404s_an_unknown_bank(app, client):
    assert client.post('/api/bank/999999/forget-missing').status_code == 404
