"""Checkpoints & LoRAs of a VIDEO dataset — the workspace section's routes.

Every verb the image workspace's Checkpoints section has, for a video set, at
the unit of the STEP: list both lanes with the deployed state, 📦 deploy a step
(every file of a Wan pair), ⏏ undeploy the app's own copy, 🗑 trash a step,
download a LOCAL save (the cloud twin already existed), ⓘ details of a run.

The refusals ARE the contract here — a hand-placed LoRA never trashed, a step
never deleted from under a running lane, a face run of the same id never
served — so most tests below are about what a route refuses, not what it does.
"""
import json
import os

from app.services import cloud_run_dataset as crd
from app.services import cloud_training as ct
# DIVERGENCE 4 — upstream imports these four fixtures from
# `test_cloud_video_launch.py` and `test_cloud_video_lifecycle.py`, the two
# rented-pod suites this fork does not carry. They are ordinary row/folder
# builders with nothing cloud about them but their file of origin, so they are
# inlined here (copied verbatim) rather than dragging the two suites back in.
# `test_test_imports_are_declared.py` is what catches the import if it returns.
def _face_dataset(name='a face set'):
    from app.models import FaceDataset
    from app.extensions import db
    ds = FaceDataset(user_id='local', name=name, trigger_word='trg')
    db.session.add(ds)
    db.session.commit()
    return ds


def _video_dataset(tmp_path=None, name='a video set', out_dir=None, frames=81,
                   profile='wan22_14b', width=384, height=384, clips=1):
    """A built video dataset: the row PLUS the flat mp4 + .txt folder on disk.

    The folder is not optional garnish — the launcher counts clips before it
    reserves anything, because a folder with none uploads captions alone and
    trains on nothing. A fixture that skipped it would only ever exercise that
    refusal."""
    from app.models import VideoDataset
    from app.extensions import db
    if out_dir is None:
        out_dir = str(tmp_path / 'vds')
    os.makedirs(out_dir, exist_ok=True)
    for i in range(1, clips + 1):
        with open(os.path.join(out_dir, f'clip_{i:04d}.mp4'), 'wb') as fh:
            fh.write(b'\x00')
        with open(os.path.join(out_dir, f'clip_{i:04d}.txt'), 'w') as fh:
            fh.write('a person walking')
    vd = VideoDataset(user_id='local', name=name, target_profile=profile,
                      fps=16, frames=frames, width=width, height=height,
                      output_dir=out_dir)
    db.session.add(vd)
    db.session.commit()
    return vd


def _run(dataset_id, dataset_table=None, status='done', steps=100, **kw):
    from app.models import CloudTrainingRun
    from app.extensions import db
    run = CloudTrainingRun(dataset_id=dataset_id, status=status, job_name='j',
                           vast_label='lds-x',
                           train_params=json.dumps({'steps': steps}), **kw)
    if dataset_table is not None:
        run.dataset_table = dataset_table
    db.session.add(run)
    db.session.commit()
    return run


def _saves(run, tmp_path, names):
    """Give a run harvested checkpoints on disk, through its staging dir.

    The store would do as well (`run_checkpoint_files` reads both); staging is
    the one a test can point anywhere without touching global config."""
    from app.extensions import db
    d = tmp_path / f'run_{run.id}_saves'
    d.mkdir(exist_ok=True)
    for n in names:
        (d / n).write_bytes(b'W' * 16)
    run.staging_dir = str(d)
    db.session.commit()
    return d

PAIR_100 = ['video_surf_000000100_high_noise.safetensors',
            'video_surf_000000100_low_noise.safetensors']
PAIR_50 = ['video_surf_000000050_high_noise.safetensors',
           'video_surf_000000050_low_noise.safetensors']
FINAL = ['video_surf.safetensors']


def _loras_root(tmp_path, monkeypatch):
    """ComfyUI's loras root, faked the way the Studio's own tests fake it."""
    root = tmp_path / 'loras'
    root.mkdir(exist_ok=True)
    monkeypatch.setattr('app.services.comfy_model_paths.search_roots',
                        lambda folder_type: [str(root)])
    return root


def _local_saves(tmp_path, monkeypatch, names):
    """Give the dataset's LOCAL run saves on disk, by pointing the lane's
    save root at a folder the test owns (the real one is ai-toolkit's output
    dir, resolved from config)."""
    from app.services import video_training_local as vtl
    d = tmp_path / 'local_saves'
    d.mkdir(exist_ok=True)
    for n in names:
        (d / n).write_bytes(b'L' * 16)
    monkeypatch.setattr(vtl, 'save_root', lambda ds: d)
    monkeypatch.setattr(vtl, 'video_training_progress',
                        lambda dataset_id, user_id=None: {'active': False})
    return d


def _deployed(root, *names, sub=None):
    folder = root / (sub or os.path.join('h3', 'lds'))
    folder.mkdir(parents=True, exist_ok=True)
    for n in names:
        (folder / n).write_bytes(b'W' * 16)


def _trash_names(app):
    from app.services import trash
    out = []
    for dirpath, _dirs, files in os.walk(trash.trash_root()):
        out.extend(files)
    return out


def _post(client, url, body):
    return client.post(url, data=json.dumps(body), content_type='application/json')


# ── 1. The listing ──────────────────────────────────────────────────────


def test_the_listing_groups_both_lanes_by_step_with_the_deployed_state(
        app, client, tmp_path, monkeypatch):
    # DIVERGENCE 4 — upstream's version lists BOTH lanes and asserts a cloud
    # run's harvested step beside the local one. There is one lane here, so the
    # local half is the whole assertion and `cloud` is asserted EMPTY — which is
    # the claim that matters on this fork.
    root = _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        _local_saves(tmp_path, monkeypatch, PAIR_50 + FINAL)
        # A LOCAL half was dropped by hand under h3/ (listed as deployed, never
        # ours to undeploy).
        _deployed(root, PAIR_50[1], sub='h3')
        ds_id = ds.id
    r = client.get(f'/api/video-dataset/{ds_id}/train/checkpoints')
    assert r.status_code == 200
    d = r.get_json()
    assert d['can_deploy'] is True
    assert d['delete_mode'] == 'app_trash'
    assert d['deploy_folder'] == 'h3/lds'

    local = d['local']
    assert local['run_name'].endswith(f'_ds{ds_id}')
    assert [(s['step'], s['final']) for s in local['steps']] == [(50, False), (None, True)]
    by_name = {f['filename']: f for s in local['steps'] for f in s['files']}
    assert by_name[PAIR_50[1]]['deployed_as'].replace('\\', '/') == 'h3/' + PAIR_50[1]
    assert by_name[PAIR_50[1]]['undeployable'] is False
    assert by_name[PAIR_50[0]]['deployed_as'] is None
    assert local['steps'][0]['deployed'] is False    # half a pair is not deployed

    assert all(f['size'] == 16 for s in local['steps'] for f in s['files'])
    # The key stays in the payload, empty: the section renders both lanes from
    # one shape, and this fork never fills the second.
    assert d['cloud'] == []


def test_the_listing_shows_nothing_of_the_face_run_of_the_same_id(
        app, client, tmp_path, monkeypatch):
    _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        face = _face_dataset()
        vds = _video_dataset(tmp_path)
        assert face.id == vds.id
        face_run = _run(face.id, steps=100)      # NULL table = face
        _saves(face_run, tmp_path, ['lora_trg_000000100.safetensors'])
        ds_id = vds.id
    d = client.get(f'/api/video-dataset/{ds_id}/train/checkpoints').get_json()
    assert d['cloud'] == [] and d['local'] is None


def test_an_unknown_dataset_is_a_404(client):
    assert client.get('/api/video-dataset/999/train/checkpoints').status_code == 404


# ── 2. 📦 Deploy ────────────────────────────────────────────────────────


# DIVERGENCE 4 — upstream's copy of this suite tests the rented-pod lane here
# (📦 deploy of a harvested cloud step). This fork routes no pod lane, so the
# behaviour has no surface to assert; the LOCAL half of each verb is covered
# by the tests around this note.


def test_deploying_a_local_step_lands_in_the_same_folder(
        app, client, tmp_path, monkeypatch):
    """The Studio only ever deployed CLOUD runs (a CloudTrainingRun resolves
    the file). A local run's save has no row — it goes through the same copy,
    into the same folder, so the Studio's picker lists it as deployed too."""
    root = _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        _local_saves(tmp_path, monkeypatch, PAIR_50 + FINAL)
        ds_id = ds.id
    r = _post(client, f'/api/video-dataset/{ds_id}/train/checkpoint/deploy',
              {'run_id': None, 'step': None, 'final': True})
    assert r.status_code == 200, r.get_json()
    assert (root / 'h3' / 'lds' / FINAL[0]).is_file()
    assert not (root / 'h3' / 'lds' / PAIR_50[0]).exists()   # only the step asked


def test_deploy_refuses_a_step_the_run_never_saved(app, client, tmp_path, monkeypatch):
    root = _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        run = _run(ds.id, crd.VIDEO, steps=100)
        _saves(run, tmp_path, PAIR_100)
        ds_id, run_id = ds.id, run.id
    r = _post(client, f'/api/video-dataset/{ds_id}/train/checkpoint/deploy',
              {'run_id': run_id, 'step': 999})
    assert r.status_code == 404
    assert not (root / 'h3').exists()


def test_deploy_without_a_loras_root_is_a_stated_refusal(
        app, client, tmp_path, monkeypatch):
    # DIVERGENCE 4 — upstream asserts this on a harvested cloud step; the
    # refusal is about ComfyUI having no loras root at all, so the local step
    # states it identically.
    monkeypatch.setattr('app.services.comfy_model_paths.search_roots',
                        lambda folder_type: [])
    _local_saves(tmp_path, monkeypatch, PAIR_50)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        ds_id = ds.id
    lst = client.get(f'/api/video-dataset/{ds_id}/train/checkpoints').get_json()
    assert lst['can_deploy'] is False
    r = _post(client, f'/api/video-dataset/{ds_id}/train/checkpoint/deploy',
              {'run_id': None, 'step': 50})
    assert r.status_code == 400
    assert 'loras folder' in r.get_json()['error']


# DIVERGENCE 4 — upstream's copy of this suite tests the rented-pod lane here
# (cross-dataset cloud run ownership). This fork routes no pod lane, so the
# behaviour has no surface to assert; the LOCAL half of each verb is covered
# by the tests around this note.


def test_undeploy_moves_only_the_apps_own_copy_to_the_trash(
        app, client, tmp_path, monkeypatch):
    root = _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        ds_id = ds.id
        _deployed(root, PAIR_100[0])                    # ours: h3/lds/
        _deployed(root, 'by_hand.safetensors', sub='h3')  # the user's: h3/
    url = f'/api/video-dataset/{ds_id}/train/checkpoint/undeploy'
    r = _post(client, url, {'deployed_as': 'h3/lds/' + PAIR_100[0]})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['delete_mode'] == 'app_trash'
    assert not (root / 'h3' / 'lds' / PAIR_100[0]).exists()
    with app.app_context():
        assert PAIR_100[0] in _trash_names(app)
    # The hand-placed one is refused, and stays — and a name given as h3/<x>
    # moves NOTHING even when the app's own folder holds a homonym: the refusal
    # is on the name's folder, not on whether something resolves.
    _deployed(root, 'by_hand.safetensors')             # ours too: h3/lds/by_hand…
    r = _post(client, url, {'deployed_as': 'h3/by_hand.safetensors'})
    assert r.status_code == 400
    assert (root / 'h3' / 'by_hand.safetensors').is_file()
    assert (root / 'h3' / 'lds' / 'by_hand.safetensors').is_file()
    # So is anything that is not a name inside the app's folder.
    for bad in ('h3/lds/../by_hand.safetensors', '../../x.safetensors',
                'h3/lds/notes.txt', ''):
        assert _post(client, url, {'deployed_as': bad}).status_code == 400, bad
    assert (root / 'h3' / 'by_hand.safetensors').is_file()


# ── 4. 🗑 Delete a step ─────────────────────────────────────────────────


# DIVERGENCE 4 — upstream's copy of this suite tests the rented-pod lane here
# (🗑 delete of a harvested cloud step). This fork routes no pod lane, so the
# behaviour has no surface to assert; the LOCAL half of each verb is covered
# by the tests around this note.


# DIVERGENCE 4 — upstream's copy of this suite tests the rented-pod lane here
# (the refusal while a pod is still writing). This fork routes no pod lane, so the
# behaviour has no surface to assert; the LOCAL half of each verb is covered
# by the tests around this note.


def test_deleting_a_local_step_trashes_its_files(app, client, tmp_path, monkeypatch):
    _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        d = _local_saves(tmp_path, monkeypatch, PAIR_50 + FINAL)
        ds_id = ds.id
    r = _post(client, f'/api/video-dataset/{ds_id}/train/checkpoint/delete',
              {'run_id': None, 'step': 50})
    assert r.status_code == 200, r.get_json()
    assert sorted(r.get_json()['removed']) == sorted(PAIR_50)
    assert not any((d / n).exists() for n in PAIR_50)
    assert (d / FINAL[0]).is_file()
    with app.app_context():
        assert all(n in _trash_names(app) for n in PAIR_50)


def test_deleting_a_local_step_is_refused_while_training_writes_it(
        app, client, tmp_path, monkeypatch):
    _loras_root(tmp_path, monkeypatch)
    from app.services import video_training_local as vtl
    with app.app_context():
        ds = _video_dataset(tmp_path)
        d = _local_saves(tmp_path, monkeypatch, PAIR_50)
        monkeypatch.setattr(vtl, 'video_training_progress',
                            lambda dataset_id, user_id=None: {'active': True})
        ds_id = ds.id
    r = _post(client, f'/api/video-dataset/{ds_id}/train/checkpoint/delete',
              {'run_id': None, 'step': 50})
    assert r.status_code == 409
    assert all((d / n).is_file() for n in PAIR_50)


def test_a_held_file_is_kept_and_named_rather_than_reported_gone(
        app, client, tmp_path, monkeypatch):
    """The clips' rule (`remove_dataset_clips`): a file the OS holds open stays,
    and the answer says which — never "removed" for a file still on disk."""
    _loras_root(tmp_path, monkeypatch)
    from app.services import trash
    real = trash.send_to_trash

    def holding(path, context=''):
        if os.path.basename(path) == PAIR_100[1]:
            raise trash.TrashLockError('held open')
        return real(path, context=context)
    monkeypatch.setattr(trash, 'send_to_trash', holding)
    # DIVERGENCE 4 — upstream holds a file of a harvested cloud step; the rule
    # is the clips' rule and knows nothing of lanes, so it is asserted on the
    # local run's own saves here.
    d = _local_saves(tmp_path, monkeypatch, PAIR_100)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        ds_id = ds.id
    r = _post(client, f'/api/video-dataset/{ds_id}/train/checkpoint/delete',
              {'run_id': None, 'step': 100})
    assert r.status_code == 200
    body = r.get_json()
    assert body['removed'] == [PAIR_100[0]] and body['files_kept'] == [PAIR_100[1]]
    assert (d / PAIR_100[1]).is_file() and not (d / PAIR_100[0]).exists()


def test_a_step_delete_and_a_clip_removal_share_the_trash_destination():
    """Two verbs of one workspace name ONE destination — the wording on screen
    comes from `delete_mode`, and it must be the same word for both."""
    from app.services import video_bank_service, video_checkpoints
    assert video_checkpoints.DELETE_MODE == video_bank_service.DATASET_CLIP_DELETE_MODE


# ── 5. Download a LOCAL save ────────────────────────────────────────────


def test_the_local_download_serves_a_basename_and_nothing_else(
        app, client, tmp_path, monkeypatch):
    with app.app_context():
        ds = _video_dataset(tmp_path)
        _local_saves(tmp_path, monkeypatch, PAIR_50)
        ds_id = ds.id
    url = f'/api/video-dataset/{ds_id}/train/checkpoint'
    r = client.get(url + '?filename=' + PAIR_50[0])
    assert r.status_code == 200 and r.data == b'L' * 16
    assert client.get(url + '?filename=../' + PAIR_50[0]).status_code == 404
    assert client.get(url + '?filename=nope.safetensors').status_code == 404
    assert client.get(url).status_code == 404
    assert client.get('/api/video-dataset/999/train/checkpoint?filename=x').status_code == 404


# ── 6. ⓘ Details ────────────────────────────────────────────────────────


# DIVERGENCE 4 — upstream's copy of this suite tests the rented-pod lane here
# (ⓘ details of a cloud run). This fork routes no pod lane, so the
# behaviour has no surface to assert; the LOCAL half of each verb is covered
# by the tests around this note.


def _guardrails_spy(monkeypatch):
    """The launch relay test's idiom (test_video_training_preflight): stop at
    the guardrails and record the answer they were handed."""
    from app.services import cloud_video_training as cvt
    seen = {}

    def spy(dataset_id, fam, dataset_table=None, allow_parallel_run=False):
        seen['allow_parallel_run'] = allow_parallel_run
        raise RuntimeError('stop here — the guardrails were consulted')
    monkeypatch.setattr(ct, '_assert_launch_guardrails', spy)
    monkeypatch.setattr(ct.cfg, 'secret', lambda key, *a, **k: 'k' if key == 'VAST_API_KEY' else None)
    monkeypatch.setattr(cvt, '_count_clips', lambda folder: 2)
    monkeypatch.setattr(cvt.video_training, 'build_job_config', lambda *a, **k: {})
    return seen


# DIVERGENCE 4 — upstream's copy of this suite tests the rented-pod lane here
# (▶ Continue on a fresh pod). This fork routes no pod lane, so the
# behaviour has no surface to assert; the LOCAL half of each verb is covered
# by the tests around this note.


# DIVERGENCE 4 — upstream's copy of this suite tests the rented-pod lane here
# (↻ retry on a fresh pod). This fork routes no pod lane, so the
# behaviour has no surface to assert; the LOCAL half of each verb is covered
# by the tests around this note.


