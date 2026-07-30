"""⬆ Promote's THIRD destination: a dataset that does not exist yet.

The bank could only ever promote into a dataset someone had already created on the
Datasets page, so the last step of the funnel sent the user to another page and
back. That was not an oversight — a bank needs one thing to exist (a name), a
dataset needs two, and the second (the trigger word) is expensive to change
later. But asking for a second field is not the same as having no door.

The rule this file exists to prove is the DISCARD. If the source bank turns out to
be busy between the pre-check and the launch, the dataset that was just created
must vanish — and it must vanish by a bare row delete, NOT by delete_dataset,
which purges training artefacts keyed on (user, TRIGGER) rather than on dataset
id. Since two datasets are deliberately allowed to share a trigger, reusing
delete_dataset here would destroy a real dataset's deployed LoRA on a path the
user never sees. That is `test_discarding_a_phantom_never_touches_another_dataset`.
"""
import os
import random

import pytest
from PIL import Image


def _img(path, seed=0, size=256):
    """Visually DISTINCT images. Flat colour fills are perceptual duplicates of
    each other, and this door promotes through import_images(dedupe=True) — so a
    bank built from flat fills lands exactly ONE image and every count here would
    be wrong for a reason that has nothing to do with the feature. (The
    promote-to-BANK tests get away with flat fills: that path is a byte copy and
    never dedupes.)"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rng = random.Random(seed)
    im = Image.new('L', (size, size))
    im.putdata([rng.randrange(256) for _ in range(size * size)])
    im.convert('RGB').save(path)


@pytest.fixture()
def source(app, tmp_path):
    """A bank over the user's own folder: three images, two kept.

    Returns (bank_id, folder, kept_ids) and LEAVES the app context — Flask reuses
    an already-pushed context for a test-client request, so a fixture holding one
    open would hand the route its own pre-promotion identity map."""
    with app.app_context():
        from app.extensions import db
        from app.models import BankImage
        from app.services import image_bank_service as banks
        folder = tmp_path / 'dump'
        for i, n in enumerate(('a.png', 'b.png', 'c.png')):
            _img(str(folder / n), seed=i + 1)
        bank, _added = banks.create_bank('local', 'Big dump', str(folder))
        rows = (BankImage.query.filter_by(bank_id=bank.id)
                .order_by(BankImage.relpath).all())
        rows[0].status = 'keep'
        rows[1].status = 'keep'
        rows[2].status = 'reject'
        db.session.commit()
        out = bank.id, str(folder), [rows[0].id, rows[1].id]
    return out


def _dataset_count():
    from app.models import FaceDataset
    return FaceDataset.query.count()


# --- the happy path -----------------------------------------------------------

def test_it_creates_the_dataset_with_the_app_defaults_and_imports_into_it(app, source):
    """Name + trigger is not a REDUCED dataset — it is the same one the Datasets
    page produces when you leave its pickers alone."""
    bank_id, _folder, ids = source
    with app.app_context():
        from app.extensions import db
        from app.models import FaceDataset, FaceDatasetImage
        from app.services import image_bank_service as banks

        new_id = banks.start_new_dataset_promote(app, 'local', bank_id, ids,
                                                 'Emma', 'zchar_emma')
        ds = db.session.get(FaceDataset, new_id)
        assert ds.name == 'Emma' and ds.trigger_word == 'zchar_emma'
        # kind NULL is how a character is stored (normalize_kind), and the other
        # two are exactly the form's defaults.
        assert ds.kind is None
        assert ds.train_type == 'zimage'
        assert ds.fidelity == 'face'

        # The images really landed. Asserted on the BACK-LINK, not on
        # BankImage.promoted_dataset_id: _promote_rows deliberately CLEARS that
        # legacy flag for linked rows.
        landed = FaceDatasetImage.query.filter_by(dataset_id=new_id).all()
        assert len(landed) == 2
        assert all(r.bank_image_id in ids for r in landed)


def test_an_empty_selection_means_every_kept_image(app, source):
    bank_id, _folder, ids = source
    with app.app_context():
        from app.models import FaceDatasetImage
        from app.services import image_bank_service as banks

        new_id = banks.start_new_dataset_promote(app, 'local', bank_id, [],
                                                 'Everything', 'zchar_all')
        landed = FaceDatasetImage.query.filter_by(dataset_id=new_id).all()
        # The two KEPT ones — the rejected image is not promotable.
        assert len(landed) == 2
        assert {r.bank_image_id for r in landed} == set(ids)


# --- validation happens BEFORE anything is created ----------------------------

@pytest.mark.parametrize('name,trigger', [
    ('', 'zchar_emma'),
    ('   ', 'zchar_emma'),
    ('Emma', ''),
    ('Emma', '   '),
])
def test_a_blank_name_or_trigger_is_refused_and_creates_nothing(app, source,
                                                                name, trigger):
    """create_dataset does NOT check the name and silently turns a blank trigger
    into 'zchar' — so the caller has to, or this door would answer 202 and hand
    back a nameless dataset."""
    bank_id, _folder, ids = source
    with app.app_context():
        from app.services import image_bank_service as banks
        before = _dataset_count()
        with pytest.raises(ValueError, match='name and trigger_word are required'):
            banks.start_new_dataset_promote(app, 'local', bank_id, ids, name, trigger)
        assert _dataset_count() == before


def test_nothing_to_promote_is_refused_and_creates_nothing(app, tmp_path):
    with app.app_context():
        from app.services import image_bank_service as banks
        folder = tmp_path / 'empty-ish'
        _img(str(folder / 'only.png'), seed=9)
        bank, _added = banks.create_bank('local', 'Untriaged', str(folder))
        before = _dataset_count()
        with pytest.raises(ValueError, match='nothing to promote'):
            banks.start_new_dataset_promote(app, 'local', bank.id, [],
                                            'Nope', 'zchar_nope')
        assert _dataset_count() == before


def test_an_unknown_bank_is_refused(app):
    with app.app_context():
        from app.services import image_bank_service as banks
        with pytest.raises(ValueError, match='bank not found'):
            banks.start_new_dataset_promote(app, 'local', 999999, [], 'X', 'zx')


# --- the busy bank, and the race ----------------------------------------------

def test_a_busy_source_bank_is_refused_before_the_dataset_exists(app, source):
    from unittest.mock import patch

    bank_id, _folder, ids = source
    with app.app_context():
        from app.services import bank_jobs, image_bank_service as banks
        before = _dataset_count()
        with patch.object(bank_jobs, 'running', lambda bid: True), \
             patch.object(bank_jobs, 'get', lambda bid: {'kind': 'scan'}):
            with pytest.raises(bank_jobs.BankJobBusy):
                banks.start_new_dataset_promote(app, 'local', bank_id, ids,
                                                'Emma', 'zchar_emma')
        assert _dataset_count() == before, 'the busy check must precede creation'


def test_losing_the_race_leaves_no_phantom_dataset(app, source):
    """The pre-check passed and a pass slipped in before the launch. The dataset
    was already committed by then, so it has to be taken back."""
    from unittest.mock import patch

    bank_id, _folder, ids = source
    with app.app_context():
        from app.services import bank_jobs, image_bank_service as banks
        before = _dataset_count()
        with patch.object(banks, 'start_promote',
                          side_effect=bank_jobs.BankJobBusy('scan')):
            with pytest.raises(bank_jobs.BankJobBusy):
                banks.start_new_dataset_promote(app, 'local', bank_id, ids,
                                                'Emma', 'zchar_emma')
        assert _dataset_count() == before


def test_a_non_busy_failure_also_discards(app, source):
    """Broader than the bank door's `except BankJobBusy`: a thread that cannot be
    started must not strand a dataset either."""
    from unittest.mock import patch

    bank_id, _folder, ids = source
    with app.app_context():
        from app.services import image_bank_service as banks
        before = _dataset_count()
        with patch.object(banks, 'start_promote',
                          side_effect=RuntimeError("can't start new thread")):
            with pytest.raises(RuntimeError):
                banks.start_new_dataset_promote(app, 'local', bank_id, ids,
                                                'Emma', 'zchar_emma')
        assert _dataset_count() == before


def test_discarding_a_phantom_never_touches_another_dataset(app, source):
    """THE trap test. delete_dataset purges training artefacts keyed on
    (user, TRIGGER), not on dataset id — and two datasets may legally share a
    trigger. Using it as the discard would destroy the REAL dataset's deployed
    LoRA. This test is what stops anyone "simplifying" _discard_new_dataset."""
    from unittest.mock import patch

    bank_id, _folder, ids = source
    with app.app_context():
        from app.extensions import db
        from app.models import FaceDataset
        from app.services import bank_jobs, face_dataset_service as fds
        from app.services import image_bank_service as banks

        real = fds.create_dataset('local', 'Emma', 'zchar_emma')
        real_id = real.id
        purged = []
        with patch('app.services.lora_training.purge_training_artifacts',
                   side_effect=lambda u, t: purged.append(t) or []):
            with patch.object(banks, 'start_promote',
                              side_effect=bank_jobs.BankJobBusy('scan')):
                with pytest.raises(bank_jobs.BankJobBusy):
                    # SAME trigger as the real dataset — deliberately allowed.
                    banks.start_new_dataset_promote(app, 'local', bank_id, ids,
                                                    'Emma copy', 'zchar_emma')
        assert purged == [], 'the discard must never reach the trigger-keyed purge'
        assert db.session.get(FaceDataset, real_id) is not None
        assert FaceDataset.query.filter_by(name='Emma copy').first() is None


def test_a_colliding_trigger_is_stored_verbatim(app, source):
    """No salting, no refusal. Two datasets sharing a trigger is legal — the
    collision the app really refuses is trigger + base + recipe, caught at
    training-queue time. Silently storing something other than what the user
    typed would make every prompt they write wrong."""
    bank_id, _folder, ids = source
    with app.app_context():
        from app.extensions import db
        from app.models import FaceDataset
        from app.services import face_dataset_service as fds
        from app.services import image_bank_service as banks

        fds.create_dataset('local', 'Emma', 'zchar_emma')
        new_id = banks.start_new_dataset_promote(app, 'local', bank_id, ids,
                                                 'Emma from the bank', 'zchar_emma')
        assert db.session.get(FaceDataset, new_id).trigger_word == 'zchar_emma'
        assert FaceDataset.query.filter_by(trigger_word='zchar_emma').count() == 2


# --- the route ----------------------------------------------------------------

def test_the_route_answers_202_with_the_new_id(app, client, source):
    bank_id, _folder, ids = source
    r = client.post(f'/api/bank/{bank_id}/promote-to-new-dataset',
                    json={'name': 'Emma', 'trigger_word': 'zchar_emma',
                          'image_ids': ids})
    assert r.status_code == 202
    body = r.get_json()
    assert body['ok'] is True and isinstance(body['id'], int)
    with app.app_context():
        from app.models import FaceDatasetImage
        assert FaceDatasetImage.query.filter_by(dataset_id=body['id']).count() == 2


@pytest.mark.parametrize('payload', [
    {'trigger_word': 'zchar_emma'},
    {'name': 'Emma'},
    {'name': '  ', 'trigger_word': 'zchar_emma'},
])
def test_the_route_400s_a_missing_field_and_creates_nothing(app, client, source,
                                                            payload):
    bank_id, _folder, _ids = source
    with app.app_context():
        before = _dataset_count()
    r = client.post(f'/api/bank/{bank_id}/promote-to-new-dataset', json=payload)
    assert r.status_code == 400
    assert 'required' in r.get_json()['error']
    with app.app_context():
        assert _dataset_count() == before


def test_the_route_409s_a_busy_bank(app, client, source):
    from unittest.mock import patch

    bank_id, _folder, ids = source
    from app.services import bank_jobs
    with app.app_context():
        before = _dataset_count()
    with patch.object(bank_jobs, 'running', lambda bid: True), \
         patch.object(bank_jobs, 'get', lambda bid: {'kind': 'scan'}):
        r = client.post(f'/api/bank/{bank_id}/promote-to-new-dataset',
                        json={'name': 'Emma', 'trigger_word': 'zchar_emma'})
    assert r.status_code == 409
    assert r.get_json()['busy_kind'] == 'scan'
    with app.app_context():
        assert _dataset_count() == before
