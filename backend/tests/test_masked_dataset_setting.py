"""Person masking (`masked`) is a PERSISTED DATASET SETTING, not a browser preference.

Debt flagged while shipping issue #24. `masked` used to live in localStorage and
reach the server only as a launch query parameter. Three consequences, all real:

  - the readiness badge could never say "this dataset is set to masked and will
    train unmasked because rembg is missing" — the server did not know the value;
  - the preference was per BROWSER, so opening the app from a phone silently
    reverted to the default;
  - it appeared in NO run snapshot, so two runs differing only by masking looked
    identical in a comparison.

Every test below is one of those three, plus the two invariants that make the
migration safe: an untouched dataset keeps the historical default (ON), and an
explicit OFF is a stored VALUE that survives (never a falsy no-op that the next
read re-enables).
"""

from public_dense_test_io import no_dense_provider_io  # noqa: F401
import json
import os

import pytest
from PIL import Image

from app.extensions import db
from app.models import FaceDatasetImage
from app.services import face_dataset_service as svc
from app.config import LOCAL_USER, save_config

pytestmark = pytest.mark.plugins()


def _dataset(tmp_path, kind='character', n=3, trigger='msk_one', desc='balancing a spoon'):
    save_config({'aitoolkit': {'dir': str(tmp_path / 'aitoolkit')}})
    kw = {'kind': kind}
    if kind == 'concept':
        kw['concept_desc'] = desc
    ds = svc.create_dataset(LOCAL_USER, 'MSK', trigger, **kw)
    img_dir = svc._dataset_dir(ds.id)
    for i in range(n):
        fn = f'k{i}.png'
        Image.new('RGB', (64, 64)).save(os.path.join(img_dir, fn))
        db.session.add(FaceDatasetImage(dataset_id=ds.id, status='keep', filename=fn,
                                        caption='a photo of msk person standing outdoors'))
    db.session.commit()
    return ds


# --- 1) it survives a reload and another browser -------------------------------
def test_masked_off_is_read_back_from_the_database_not_the_request(app, tmp_path):
    """THE point of the chantier: a second browser (a request that carries no
    `masked` at all — exactly what a phone with an empty localStorage sends)
    still trains with the value the user stored."""
    from app.services import lora_training as lt
    with app.app_context():
        ds = _dataset(tmp_path, trigger='msk_persist')
        lt.update_train_settings(LOCAL_USER, ds.id, {'masked': False})

        # Re-read the row from scratch — no in-memory state, like a fresh process.
        db.session.expire_all()
        fresh = svc.get_dataset(LOCAL_USER, ds.id)
        assert svc.person_masking_enabled(fresh) is False
        # A request with NO masked key resolves to the stored value, not to True.
        assert lt.resolve_masked(fresh, None) is False
        assert lt.resolve_masked_for(LOCAL_USER, ds.id, None) is False


def test_an_explicit_request_value_still_wins_over_the_stored_one(app, tmp_path):
    """The per-RUN override must keep winning: the canvas ▶ Continue replays the
    SOURCE run's own frozen flag, and a cloud retry replays the stamped params.
    Re-reading today's dataset there would rewrite history."""
    from app.services import lora_training as lt
    with app.app_context():
        ds = _dataset(tmp_path, trigger='msk_override')
        lt.update_train_settings(LOCAL_USER, ds.id, {'masked': False})
        assert lt.resolve_masked(ds, True) is True
        assert lt.resolve_masked(ds, False) is False


# --- 2) the migration arbitration, in BOTH directions --------------------------
def test_an_untouched_dataset_keeps_the_historical_default_on(app, tmp_path):
    """Direction A — nothing may silently DISABLE masking. A dataset that never
    answered resolves ON, exactly as the old hardcoded `d.get('masked', True)`
    did, so no existing dataset changes behaviour by upgrading."""
    from app.services import lora_training as lt
    with app.app_context():
        ds = _dataset(tmp_path, trigger='msk_default')
        assert ds.train_settings in (None, '', '{}')
        assert svc.person_masking_stored(ds) is None      # never answered
        assert svc.person_masking_enabled(ds) is True
        assert lt.resolve_masked(ds, None) is True


def test_an_explicit_off_is_stored_and_is_not_dropped_as_a_falsy_no_op(app, tmp_path):
    """Direction B — nothing may silently ENABLE masking (it costs a rembg pass
    per image and changes the loss). `masked` is TRI-STATE, unlike mask_faces /
    dual_captions whose default is OFF: an explicit False must survive in the
    blob, and only an explicit 'auto' clears it back to the default."""
    from app.services import lora_training as lt
    with app.app_context():
        ds = _dataset(tmp_path, trigger='msk_tristate')
        lt.update_train_settings(LOCAL_USER, ds.id, {'masked': False})
        assert json.loads(ds.train_settings)['masked'] is False
        assert svc.person_masking_stored(ds) is False

        eff = lt.update_train_settings(LOCAL_USER, ds.id, {'masked': True})
        assert json.loads(ds.train_settings)['masked'] is True
        assert eff['masked'] is True and eff['masked_stored'] is True

        lt.update_train_settings(LOCAL_USER, ds.id, {'masked': 'auto'})
        assert 'masked' not in json.loads(ds.train_settings or '{}')
        assert svc.person_masking_stored(ds) is None
        assert svc.person_masking_enabled(ds) is True     # back to the default

        with pytest.raises(ValueError):
            lt.update_train_settings(LOCAL_USER, ds.id, {'masked': 'yes please'})


def test_concept_and_style_stay_forced_off_whatever_is_stored(app, tmp_path):
    """The server guard is unchanged: a person mask erases a concept, and an
    always-on style must learn the whole frame. Storing True there changes
    nothing — the panel says so instead of pretending the toggle works."""
    from app.services import lora_training as lt
    with app.app_context():
        for kind, trigger in (('concept', 'msk_concept'), ('style', 'msk_style')):
            ds = _dataset(tmp_path, kind=kind, trigger=trigger)
            ds.train_settings = json.dumps({'masked': True})
            db.session.commit()
            assert svc.person_masking_enabled(ds) is False
            assert lt.resolve_masked(ds, None) is False
            assert lt.effective_train_settings(ds)['masked_supported'] is False


# --- 3) the run snapshot carries it -------------------------------------------
def test_two_runs_differing_only_by_masking_no_longer_look_identical(app, tmp_path):
    """The provenance snapshot (TrainingRunRecord.settings, what the Runs hub and
    the lineage diff read) must distinguish them. Before this change `masked` was
    absent from the snapshot entirely."""
    from app.services import lora_training as lt
    with app.app_context():
        on = _dataset(tmp_path, trigger='msk_snap_on')
        off = _dataset(tmp_path, trigger='msk_snap_off')
        lt.update_train_settings(LOCAL_USER, off.id, {'masked': False})

        snap_on = lt.launch_settings_snapshot(on)
        snap_off = lt.launch_settings_snapshot(off)
        assert snap_on['masked'] is True
        assert snap_off['masked'] is False
        assert snap_on != snap_off

        # A replay stamping a per-run override stamps THAT, not today's dataset.
        assert lt.launch_settings_snapshot(off, masked=True)['masked'] is True


# --- 4) the readiness badge can finally say it --------------------------------
def test_readiness_badge_warns_set_to_masked_but_rembg_missing(app, tmp_path, monkeypatch):
    """The reason this chantier exists. Before the launch modal is ever opened."""
    from app.services import lora_training as lt
    from app.services import person_mask
    with app.app_context():
        ds = _dataset(tmp_path, n=20, trigger='msk_ready')
        monkeypatch.setattr(person_mask, 'is_available', lambda: False)
        rep = lt.training_preflight(LOCAL_USER, ds.id, train_type='zimage')
        row = next(c for c in rep['checks'] if c['id'] == 'person_mask')
        assert row['status'] == 'warn'
        assert 'rembg' in row['detail']
        assert rep['verdict'] in ('warnings', 'blocked')
        assert any('rembg' in w for w in rep['warnings'])


def test_readiness_badge_stays_silent_when_the_dataset_is_set_to_unmasked(
        app, tmp_path, monkeypatch):
    """No rembg AND masking deliberately off = nothing to warn about. Warning
    there is how users learn to click through warnings without reading them."""
    from app.services import lora_training as lt
    from app.services import person_mask
    with app.app_context():
        ds = _dataset(tmp_path, n=20, trigger='msk_ready_off')
        lt.update_train_settings(LOCAL_USER, ds.id, {'masked': False})
        monkeypatch.setattr(person_mask, 'is_available', lambda: False)
        rep = lt.training_preflight(LOCAL_USER, ds.id, train_type='zimage')
        assert not [c for c in rep['checks'] if c['id'] == 'person_mask']
        assert not [w for w in rep['warnings'] if 'rembg' in w]




# --- 5) the cloud lane reads the stored setting -------------------------------
