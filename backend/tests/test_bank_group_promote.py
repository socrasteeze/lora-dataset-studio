"""🗃️ Promoting a NAME GROUP into one dataset.

The group card is a display device — every image still belongs to exactly one
bank. Promoting the card walks its members sequentially into one dataset through
the SAME code a single-bank promotion uses (_promote_rows), so the fiddly parts
cannot drift: the resolved (watermark-cleaned) path, the caption and framing
carried with the blob, and the promoted_dataset_id bookkeeping.

Two rules are pinned hardest:
* every member is checked for a live job UP FRONT — a half-done group promotion
  is not something the user can reason about, and there is no "resume the rest";
* cross-bank duplicates cost ONE dataset image, because import_images already
  dedupes. Two banks over the same photo is the normal case for a group.
"""
import random

import pytest
from PIL import Image


def _noisy(seed, size=256):
    """Visually DISTINCT images. Flat colour fills are perceptual duplicates of
    each other, so a bank built from them promotes exactly one image and every
    count in this file would be wrong for a reason that has nothing to do with
    groups."""
    rng = random.Random(seed)
    im = Image.new('L', (size, size))
    im.putdata([rng.randrange(256) for _ in range(size * size)])
    return im.convert('RGB')


def _bank(tmp_path, name, folder, images):
    """`images` is a list of (filename, seed); two banks given the same seed hold
    the SAME photo — the cross-bank duplicate case."""
    from app.extensions import db
    from app.services import image_bank_service as banks
    src = tmp_path / folder
    src.mkdir(parents=True, exist_ok=True)
    for fname, seed in images:
        _noisy(seed).save(str(src / fname))
    bank, _added = banks.create_bank('local', name, str(src))
    db.session.commit()
    # The ID, not the instance: a later commit expires the object and reading
    # `.id` off it then needs a session it no longer has.
    return bank.id


def _keep_all(bank_id):
    from app.extensions import db
    from app.models import BankImage
    for row in BankImage.query.filter_by(bank_id=bank_id).all():
        row.status = 'keep'
    db.session.commit()


def _dataset():
    from app.services import face_dataset_service as ds
    return ds.create_dataset('local', 'Target', 'tgt')


def test_a_group_promotes_every_members_kept_images(app, tmp_path):
    from app.models import FaceDatasetImage
    from app.services import image_bank_service as banks

    with app.app_context():
        a = _bank(tmp_path, 'T', 'a', [('1.jpg', 1), ('2.jpg', 2)])
        b = _bank(tmp_path, 'T', 'b', [('3.jpg', 3)])
        _keep_all(a)
        _keep_all(b)
        dataset_id = _dataset().id
        banks.start_group_promote(app, 'local', a, dataset_id)
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 3


def test_the_same_photo_in_two_members_costs_one_dataset_image(app, tmp_path):
    """The normal case for a group: two folders holding overlapping shots."""
    from app.models import FaceDatasetImage
    from app.services import image_bank_service as banks

    with app.app_context():
        shared = ('same.jpg', 42)
        a = _bank(tmp_path, 'T', 'a', [shared, ('only-a.jpg', 1)])
        b = _bank(tmp_path, 'T', 'b', [shared])
        _keep_all(a)
        _keep_all(b)
        dataset_id = _dataset().id
        banks.start_group_promote(app, 'local', a, dataset_id)
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 2


def test_a_live_job_on_ANY_member_refuses_before_anything_is_created(app, tmp_path):
    from unittest.mock import patch

    from app.models import FaceDatasetImage
    from app.services import bank_jobs, image_bank_service as banks

    with app.app_context():
        a = _bank(tmp_path, 'T', 'a', [('1.jpg', 1)])
        b = _bank(tmp_path, 'T', 'b', [('2.jpg', 2)])
        _keep_all(a)
        _keep_all(b)
        dataset_id = _dataset().id
        busy = {'kind': 'score', 'finished': False}
        with patch.object(bank_jobs, 'get',
                          lambda bid: busy if bid == b else None):
            with pytest.raises(bank_jobs.BankJobBusy):
                banks.start_group_promote(app, 'local', a, dataset_id)
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 0, \
            'nothing may be promoted when one member is busy'


def test_a_group_with_nothing_kept_refuses_rather_than_running_empty(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        a = _bank(tmp_path, 'T', 'a', [('1.jpg', 1)])
        _bank(tmp_path, 'T', 'b', [('2.jpg', 2)])
        dataset_id = _dataset().id
        with pytest.raises(ValueError, match='nothing to promote'):
            banks.start_group_promote(app, 'local', a, dataset_id)


def test_a_keep_separate_member_is_left_out(app, tmp_path):
    from app.models import FaceDatasetImage
    from app.services import bank_groups, image_bank_service as banks

    with app.app_context():
        a = _bank(tmp_path, 'T', 'a', [('1.jpg', 1)])
        b = _bank(tmp_path, 'T', 'b', [('2.jpg', 2)])
        c = _bank(tmp_path, 'T', 'c', [('3.jpg', 3)])
        for bank in (a, b, c):
            _keep_all(bank)
        bank_groups.set_keep_separate('local', c, True)
        dataset_id = _dataset().id
        banks.start_group_promote(app, 'local', a, dataset_id)
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 2


def test_promoting_an_UNGROUPED_bank_through_this_path_is_just_that_bank(app, tmp_path):
    from app.models import FaceDatasetImage
    from app.services import image_bank_service as banks

    with app.app_context():
        a = _bank(tmp_path, 'Solo', 'a', [('1.jpg', 1)])
        _bank(tmp_path, 'Other', 'b', [('2.jpg', 2)])
        _keep_all(a)
        dataset_id = _dataset().id
        banks.start_group_promote(app, 'local', a, dataset_id)
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 1


def test_the_single_bank_promotion_still_behaves_exactly_as_before(app, tmp_path):
    """_promote_rows was extracted FROM it; the extraction must be invisible."""
    from app.models import FaceDatasetImage
    from app.services import image_bank_service as banks

    with app.app_context():
        a = _bank(tmp_path, 'Solo', 'a', [('1.jpg', 1), ('2.jpg', 2)])
        _keep_all(a)
        dataset_id = _dataset().id
        banks.start_promote(app, 'local', a, [], dataset_id)
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 2


# --- the route ----------------------------------------------------------------

def test_the_route_promotes_the_group(app, client, tmp_path):
    from app.models import FaceDatasetImage

    with app.app_context():
        a = _bank(tmp_path, 'T', 'a', [('1.jpg', 1)])
        b = _bank(tmp_path, 'T', 'b', [('2.jpg', 2)])
        _keep_all(a)
        _keep_all(b)
        dataset_id = _dataset().id
        lead = min(a, b)
    r = client.post(f'/api/bank-group/{lead}/promote', json={'dataset_id': dataset_id})
    assert r.status_code == 202
    with app.app_context():
        assert FaceDatasetImage.query.filter_by(dataset_id=dataset_id).count() == 2


def test_the_route_requires_a_dataset(app, client, tmp_path):
    with app.app_context():
        a = _bank(tmp_path, 'T', 'a', [('1.jpg', 1)])
    r = client.post(f'/api/bank-group/{a}/promote', json={})
    assert r.status_code == 400
    assert 'dataset_id' in r.get_json()['error']
