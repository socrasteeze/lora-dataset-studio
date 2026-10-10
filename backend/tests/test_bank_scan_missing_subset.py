"""🗃️ Image bank — files deleted from the folder are not a moved folder.

The scan only walks UNSCANNED rows. On a real 50 000-image bank, about 1 000
rows pointed at files deleted from a folder that never moved; they were most
of the unscanned pool, so the missing-file guard fired and the scan said "this
folder no longer holds the bank's images". Inside Launch all the step was then
shown as done, and its error stayed on the job for every later step.
"""
from unittest.mock import patch

from PIL import Image


def _bank(tmp_path, n):
    from app.services import image_bank_service as banks
    src = tmp_path / 'src'
    src.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        Image.new('RGB', (96, 96), (i * 7 % 255, 90, 160)).save(str(src / f'{i:03d}.jpg'))
    bank, _added = banks.create_bank('local', 'Dump', str(src))
    return bank.id, src


def _run_scan(app, bank_id):
    """Run the scan body inline; returns the message it failed with, or None."""
    from app.services import image_bank_service as banks
    failed = {}

    def fake_start(_app, _bid, kind, fn, total=0):
        fn(object())

    with patch.object(banks.bank_jobs, 'start', fake_start), \
         patch.object(banks.bank_jobs, 'cancelled', lambda job: False), \
         patch.object(banks.bank_jobs, 'bump', lambda job, n=1: None), \
         patch.object(banks.bank_jobs, 'progress', lambda job, **kw: None), \
         patch.object(banks.bank_jobs, 'fail',
                      lambda job, msg: failed.setdefault('msg', msg)):
        banks.start_scan(app, 'local', bank_id)
    return failed.get('msg')


def _forget_and_delete(bank_id, src, relpaths, *, delete=True):
    """Mark rows unscanned (so the scan pool holds them) and remove their files."""
    from app.extensions import db
    from app.models import BankImage
    rows = BankImage.query.filter(BankImage.bank_id == bank_id,
                                  BankImage.relpath.in_(relpaths)).all()
    for row in rows:
        row.quality_state = None
    db.session.commit()
    if delete:
        for rel in relpaths:
            (src / rel).unlink()


def test_deleted_files_in_a_folder_that_did_not_move_do_not_abort_the_scan(
        app, tmp_path):
    from app.models import BankImage
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id, src = _bank(tmp_path, 30)
        assert _run_scan(app, bank_id) is None

        gone = [f'{i:03d}.jpg' for i in range(25)]
        _forget_and_delete(bank_id, src, gone)
        # One present unscanned file AFTER the missing run proves the scan
        # kept walking instead of stopping at the guard.
        _forget_and_delete(bank_id, src, ['029.jpg'], delete=False)

        assert _run_scan(app, bank_id) is None
        rows = {r.relpath: r for r in BankImage.query.filter_by(bank_id=bank_id)}
        assert rows['029.jpg'].quality_state is not None
        assert all(rows[rel].quality_state is None for rel in gone)
        assert all(rows[rel].status == 'pending' for rel in gone), \
            'a missing file must never be auto-rejected'
        assert banks.MOVED_FOLDER_MSG  # the guard still exists for a real move


def test_a_folder_that_lost_every_scanned_image_still_aborts(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id, src = _bank(tmp_path, 30)
        assert _run_scan(app, bank_id) is None

        # The folder is still there, but none of the bank's files are.
        for path in src.iterdir():
            path.unlink()
        _forget_and_delete(bank_id, src, [f'{i:03d}.jpg' for i in range(25)],
                           delete=False)

        assert _run_scan(app, bank_id) == banks.MOVED_FOLDER_MSG
