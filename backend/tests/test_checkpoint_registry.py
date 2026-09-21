"""Provenance registry: dataset fingerprint -> human version (v1/v2/...),
manifest diffs, and the version suffix on deployed checkpoint names."""

from public_dense_test_io import no_dense_provider_io  # noqa: F401
import json
from app.extensions import db
import os

import pytest

from app.config import LOCAL_USER

pytestmark = pytest.mark.plugins()


@pytest.fixture()
def ds_with_images(app, client):
    """A dataset with 2 kept images (files on disk so the content proxy works)."""
    from app import config as cfg
    from app.extensions import db
    from app.models import FaceDatasetImage
    ds_id = client.post('/api/dataset/create',
                        json={'name': 'Prov', 'trigger_word': 'prov'}).get_json()['id']
    with app.app_context():
        img_dir = cfg.dataset_images_root() / str(ds_id)
        img_dir.mkdir(parents=True, exist_ok=True)
        ids = []
        for i in range(2):
            (img_dir / f'im{i}.png').write_bytes(b'PNG' + bytes([i]))
            row = FaceDatasetImage(dataset_id=ds_id, filename=f'im{i}.png',
                                   status='keep', caption=f'a photo {i}')
            db.session.add(row)
            db.session.commit()
            ids.append(row.id)
    return ds_id, ids


def test_register_allocates_versions_by_fingerprint(app, ds_with_images):
    from app.services import checkpoint_registry as reg
    ds_id, ids = ds_with_images
    with app.app_context():
        r1 = reg.register_launch(LOCAL_USER, ds_id, 'zimage', 'local', steps=1000)
        assert r1.version == 1
        # unchanged dataset -> same version on a re-launch
        r2 = reg.register_launch(LOCAL_USER, ds_id, 'zimage', 'local', steps=1200)
        assert r2.version == 1
        # edit a caption -> new fingerprint -> v2
        from app.models import FaceDatasetImage
        img = db.session.get(FaceDatasetImage, ids[0])
        img.caption = 'edited caption'
        db.session.commit()
        r3 = reg.register_launch(LOCAL_USER, ds_id, 'zimage', 'local', steps=1000)
        assert r3.version == 2
        # families version independently
        rk = reg.register_launch(LOCAL_USER, ds_id, 'krea', 'cloud', cloud_run_id=7)
        assert rk.version == 1 and rk.source == 'cloud' and rk.cloud_run_id == 7


def test_short_caption_only_edit_allocates_a_new_dataset_version(
        app, ds_with_images):
    """The caption variant exported to ai-toolkit is provenance, not decoration."""
    from app.extensions import db
    from app.models import FaceDatasetImage
    from app.services import checkpoint_registry as reg

    ds_id, ids = ds_with_images
    with app.app_context():
        image = db.session.get(FaceDatasetImage, ids[0])
        image.caption_short = 'short version one'
        db.session.commit()
        first = reg.register_launch(
            LOCAL_USER, ds_id, 'zimage', 'local', steps=1000)

        image.caption_short = 'short version two'
        db.session.commit()
        second = reg.register_launch(
            LOCAL_USER, ds_id, 'zimage', 'local', steps=1000)

        assert first.version == 1
        assert second.version == 2
        assert reg.manifest_diff(
            json.loads(first.manifest), json.loads(second.manifest)
        )['captions_changed'] == 1


def test_manifest_diff_counts_changes():
    from app.services import checkpoint_registry as reg
    old = [[1, 'aaaa', 'f1'], [2, 'bbbb', 'f2'], [3, 'cccc', 'f3']]
    new = [[2, 'bbbb', 'f2X'], [3, 'CHANGED', 'f3'], [4, 'dddd', 'f4']]
    d = reg.manifest_diff(old, new)
    assert d == {'images_added': 1, 'images_removed': 1,
                 'captions_changed': 1, 'images_edited': 1}


def test_dataset_state_flags_drift(app, ds_with_images):
    from app.services import checkpoint_registry as reg
    from app.extensions import db
    from app.models import FaceDatasetImage
    ds_id, ids = ds_with_images
    with app.app_context():
        assert reg.dataset_state(LOCAL_USER, ds_id, 'zimage')['registered'] is False
        reg.register_launch(LOCAL_USER, ds_id, 'zimage', 'local')
        st = reg.dataset_state(LOCAL_USER, ds_id, 'zimage')
        assert st['registered'] is True and st['version'] == 1
        assert st['changed'] is False and st['diff'] is None
        # remove an image -> drift with a readable diff
        db.session.get(FaceDatasetImage, ids[1]).status = 'reject'
        db.session.commit()
        st = reg.dataset_state(LOCAL_USER, ds_id, 'zimage')
        assert st['changed'] is True
        assert st['diff']['images_removed'] == 1


def test_import_suffixes_deployed_name_with_version(app, ds_with_images, tmp_path, monkeypatch):
    """A local import resolves the file's run via the registry and suffixes the
    run id (_rl<N>) + dataset version (_v<N>); without any registry row the name
    stays EXACTLY as before (no run tag either — the legacy-compatible path)."""
    from app import config as cfg
    from app.services import lora_training as lt
    from app.services import checkpoint_registry as reg
    ds_id, _ = ds_with_images
    with app.app_context():
        cfg.save_config({'comfyui': {'base_dir': str(tmp_path / 'comfy')},
                         'aitoolkit': {'dir': str(tmp_path / 'aitk')}})
        run_dir = tmp_path / 'run'
        run_dir.mkdir()
        ck = run_dir / 'lora_prov_000001000.safetensors'
        ck.write_bytes(b'W')
        monkeypatch.setattr(lt, '_run_dir', lambda *a, **k: str(run_dir))
        # No registry row yet -> recipe suffix only, NO run tag (Turbo is
        # intentionally isolated from the old suffix-less Z-Image folder/name).
        dest = lt.import_checkpoint(LOCAL_USER, ds_id, ck.name)
        assert os.path.basename(dest) == (
            'lora_prov_000001000_Z-Image-Turbo.safetensors')
        # registered BEFORE the file was written -> _rl<record id> + _v1 suffix
        rec = reg.register_launch(
            LOCAL_USER, ds_id, 'zimage', 'local',
            base_model='', variant='turbo')
        os.utime(ck)                        # file newer than the record
        dest = lt.import_checkpoint(LOCAL_USER, ds_id, ck.name)
        assert os.path.basename(dest) == (
            f'lora_prov_000001000_Z-Image-Turbo_rl{rec.id}_v1.safetensors')
        # the run tag is recovered as (source, id) and stripped from the label
        assert lt.parse_deployed_run(os.path.basename(dest)) == ('local', rec.id)
        # both deployed files are listed (the _v suffix passes the boundary)
        names = [c['filename'] for c in lt.list_imported_checkpoints(LOCAL_USER, ds_id)]
        assert any(n.endswith('_v1.safetensors') for n in names)
        # the deployed file carries its source-run identity for the 💻 #N chip
        imported = lt.list_imported_checkpoints(LOCAL_USER, ds_id)
        tagged = [e for e in imported if e['filename'].endswith('_v1.safetensors')]
        assert tagged and tagged[0]['run_id'] == rec.id
        assert tagged[0]['run_source'] == 'local'


def test_record_for_mtime_prefers_oldest_for_preregistry_files(app, ds_with_images):
    """A checkpoint file OLDER than every record predates the registry: its
    owner is the oldest record (legacy baseline), never the newest (live
    sighting: local checkpoints wore a ☁ chip because a cloud launch was the
    latest record)."""
    import time
    from app.services import checkpoint_registry as reg
    ds_id, _ = ds_with_images
    with app.app_context():
        legacy = reg.register_launch(LOCAL_USER, ds_id, 'krea', 'legacy')
        cloud = reg.register_launch(LOCAL_USER, ds_id, 'krea', 'cloud', cloud_run_id=10)
        assert legacy.id != cloud.id
        # file mtime far in the past -> oldest record wins
        rec = reg.record_for_mtime(ds_id, 'krea', time.time() - 86400)
        assert rec.id == legacy.id and rec.source == 'legacy'
        # file newer than everything -> newest record wins (loop path)
        rec = reg.record_for_mtime(ds_id, 'krea', time.time() + 60)
        assert rec.id == cloud.id


def test_record_for_mtime_scopes_local_producer_by_base_variant_and_source(
        app, ds_with_images):
    """A later unrelated launch must not steal a local checkpoint by mtime."""
    import time
    from app.services import checkpoint_registry as reg
    ds_id, _ = ds_with_images
    with app.app_context():
        producer = reg.register_launch(
            LOCAL_USER, ds_id, 'krea', 'local',
            base_model='', variant='raw')
        reg.register_launch(
            LOCAL_USER, ds_id, 'krea', 'cloud',
            base_model='', variant='raw', cloud_run_id=77)
        reg.register_launch(
            LOCAL_USER, ds_id, 'krea', 'local',
            base_model='C:/models/other.safetensors', variant='turbo')

        rec = reg.record_for_mtime(
            ds_id, 'krea', time.time() + 60,
            base_model='', variant='raw', source=('local', 'legacy'))

        assert rec.id == producer.id


def test_ensure_baseline_retrofits_pretrained_datasets(app, ds_with_images):
    """Deployed-project rule: a dataset trained BEFORE the registry existed
    (evidence: checkpoints/cloud runs, zero records) gets a retroactive v1
    baseline — versioning must cover the past, not only future runs."""
    from app.services import checkpoint_registry as reg
    ds_id, _ = ds_with_images
    with app.app_context():
        # no training evidence -> nothing registered
        reg.ensure_baseline(LOCAL_USER, ds_id, 'zimage', had_training=False)
        assert reg.latest_record(ds_id, 'zimage') is None
        # evidence -> v1 baseline, source 'legacy'; idempotent
        reg.ensure_baseline(LOCAL_USER, ds_id, 'zimage', had_training=True)
        rec = reg.latest_record(ds_id, 'zimage')
        assert rec.version == 1 and rec.source == 'legacy'
        reg.ensure_baseline(LOCAL_USER, ds_id, 'zimage', had_training=True)
        assert reg.latest_record(ds_id, 'zimage').id == rec.id   # no duplicate


def test_new_legacy_baseline_annotates_the_local_lane(
        app, ds_with_images, tmp_path):
    """Baseline rows lack historical base/variant facts but still annotate v1."""
    from app import config as cfg
    from app.services import checkpoint_registry as reg
    from app.services import face_dataset_service as svc
    from app.services import lora_training as lt
    ds_id, _ = ds_with_images
    with app.app_context():
        aitk = tmp_path / 'aitk'
        aitk.mkdir()
        cfg.save_config({'aitoolkit': {'dir': str(aitk)}})
        ds = svc.get_dataset(LOCAL_USER, ds_id)
        ds.train_type = 'zimage'
        ds.train_variant = 'turbo'
        svc.db.session.commit()
        run = lt._run_dir(
            LOCAL_USER, ds_id, base_model=None,
            family='zimage', variant='turbo')
        os.makedirs(run, exist_ok=True)
        checkpoint = os.path.join(
            run, 'lora_prov_000001000.safetensors')
        with open(checkpoint, 'wb') as stream:
            stream.write(b'WEIGHTS')

        reg.ensure_baseline(
            LOCAL_USER, ds_id, 'zimage', had_training=True)
        listed = lt.list_checkpoints(
            LOCAL_USER, ds_id, base_model=None,
            family='zimage', variant='turbo')

        assert listed[0]['version'] == 1
        assert listed[0]['source'] == 'legacy'














def test_register_launch_stores_settings_snapshot(app, ds_with_images):
    """The launch stamps the EFFECTIVE ai-toolkit settings on the record — the
    unified Runs page shows them per run. NULL-safe on pre-feature rows."""
    import json
    from app.services import checkpoint_registry as reg
    from app.config import LOCAL_USER
    ds_id, _imgs = ds_with_images
    with app.app_context():
        rec = reg.register_launch(LOCAL_USER, ds_id, 'krea', 'local',
                                  settings={'rank': 32, 'resolution': [768, 1024]})
        assert json.loads(rec.settings) == {'rank': 32, 'resolution': [768, 1024]}
        rec2 = reg.register_launch(LOCAL_USER, ds_id, 'krea', 'local')
        assert rec2.settings is None


def test_launch_settings_snapshot_reflects_effective_values(app, ds_with_images):
    """Effective values (defaults resolved), expert levers only when set."""
    from app.services import lora_training as lt
    from app.services import face_dataset_service as fds
    from app.config import LOCAL_USER
    ds_id, _imgs = ds_with_images
    with app.app_context():
        ds = fds.get_dataset(LOCAL_USER, ds_id)
        snap = lt.launch_settings_snapshot(ds, 'krea')
        assert snap['rank'] == 32 and snap['alpha'] == 32   # Krea researched defaults
        assert snap['trigger'] == 'prov'                    # recipe: trigger word
        assert snap['resolution'] == [768, 1024]
        assert snap['save_every'] == 250
        assert snap['timestep_type'] == 'linear'            # Krea family default
        assert 'dropout' not in snap                        # lever untouched -> absent
        lt.update_train_settings(LOCAL_USER, ds_id, {'rank': 64, 'dropout': 0.1})
        ds = fds.get_dataset(LOCAL_USER, ds_id)
        snap2 = lt.launch_settings_snapshot(ds, 'krea')
        assert snap2['rank'] == 64
        assert snap2['dropout'] == 0.1






def test_import_never_overwrites_a_different_lora_silently(app, ds_with_images, tmp_path, monkeypatch):
    """Last-resort anti-clobber: when the deterministic deployed name already
    holds a DIFFERENT LoRA (e.g. a legacy untagged import), the new file is saved
    under an incremental suffix and the caller is told — never a silent replace.
    An IDENTICAL re-import overwrites in place (idempotent, no `_2` copies)."""
    from app.services import lora_training as lt
    with app.app_context():
        ds_id, _ = ds_with_images
        loras = tmp_path / 'loras'
        loras.mkdir()
        monkeypatch.setattr(lt, '_lora_dest_dir', lambda ds, family=None: str(loras))
        src = tmp_path / 'staging'
        src.mkdir()
        # pre-existing deployed file at the deterministic name, DIFFERENT content
        ck = src / 'lora_prov_000001000.safetensors'
        ck.write_bytes(b'NEW-CONTENT')
        # what the deterministic name would be (no version/run tag here)
        det = lt.import_checkpoint(LOCAL_USER, ds_id, ck.name, src_dir=str(src),
                                   return_meta=True)
        first_name = det['name']
        assert det['collision'] is False
        # a genuinely different file that resolves to the SAME name -> suffixed
        (loras / first_name).write_bytes(b'OLD-DIFFERENT')     # squat the name
        clash = lt.import_checkpoint(LOCAL_USER, ds_id, ck.name, src_dir=str(src),
                                     return_meta=True)
        assert clash['collision'] is True
        assert clash['name'] != first_name
        assert os.path.isfile(loras / clash['name'])
        assert (loras / first_name).read_bytes() == b'OLD-DIFFERENT'   # untouched
        # idempotent: re-importing the SAME bytes to a matching name does not add copies
        again = lt.import_checkpoint(LOCAL_USER, ds_id, ck.name, src_dir=str(src),
                                     return_meta=True)
        assert again['collision'] is True   # first_name still squatted by OLD-DIFFERENT
        # but importing onto the file we just wrote (same content) is a no-op rename
        os.remove(loras / first_name)
        lt.import_checkpoint(LOCAL_USER, ds_id, ck.name, src_dir=str(src))
        dup = lt.import_checkpoint(LOCAL_USER, ds_id, ck.name, src_dir=str(src))
        assert os.path.basename(dup) == first_name   # same name, overwritten in place
