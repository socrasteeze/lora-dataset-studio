"""Training on another machine runs in its OWN lane.

The load-bearing fact, and the reason this lane exists at all: local training is
single-flight through the machine-wide ``training_in_progress`` flag, and that
flag means "this machine's GPU is busy". ``gpu_window``, the bank's GPU passes
and image generation all gate on it. A run happening on ANOTHER box must not set
it — doing so would idle this machine for hours over work it is not doing, which
is exactly the failure the bank queue's per-machine lanes were introduced to fix.

That is why a peer run cannot live in ``lora_training.training_status()``: that
function reports only the single run the flag describes. It gets a
``PeerTrainingRun`` row and its own status instead, the same shape the retired
cloud lane used.

The other thing pinned here is that a stop is DURABLE. An in-memory event is
only enforceable by the supervisor thread, and a restart is precisely what
destroys that thread.
"""
import json
from datetime import datetime

import pytest

from app.services import peer_training


@pytest.fixture
def configured(app, monkeypatch):
    """An ai-toolkit web address, with the network stubbed out."""
    from app import config as cfg
    with app.app_context():
        cfg.save_config({'aitoolkit': {'url': 'http://localhost:8675', 'token': ''}})
    return app


def test_no_address_means_no_picker_and_no_launch(app):
    """The feature is invisible until an address is set, and a launch says why
    rather than failing somewhere deeper."""
    from app import config as cfg
    with app.app_context():
        cfg.save_config({'aitoolkit': {'url': '', 'token': ''}})
        assert peer_training.is_configured() is False
        assert peer_training.machines() == []
        with pytest.raises(ValueError, match='ai-toolkit web address'):
            peer_training.launch(1, 1, gpu_ids='peer:0')


def test_machines_merges_local_gpus_and_peer_machines(configured, monkeypatch):
    """Both halves come from the configured ai-toolkit: its own cards from
    /api/gpu, its peers from /api/machines."""
    def _json(self, method, path, **kw):
        if path == '/api/gpu':
            return {'gpus': [{'index': 0, 'name': 'RTX 5090'}]}
        return {'machines': [{'id': 'workshop', 'label': 'Workshop',
                              'online': True, 'gpus': [{'index': 0}, {'index': 1}]}]}
    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit._json', _json)

    with configured.app_context():
        out = peer_training.machines()

    ids = [m['id'] for m in out]
    assert ids == ['0', 'workshop:0', 'workshop:1']
    assert out[0]['remote'] is False and out[1]['remote'] is True
    assert all(m['available'] for m in out)


def test_an_offline_machine_is_listed_with_its_reason(configured, monkeypatch):
    """Hiding it reads exactly like never having configured it — the rule the
    Run-on picker already follows, and the sibling project's."""
    def _json(self, method, path, **kw):
        if path == '/api/gpu':
            return {'gpus': [{'index': 0, 'name': 'RTX 5090'}]}
        return {'machines': [{'id': 'workshop', 'label': 'Workshop',
                              'online': False, 'error': 'No answer', 'gpus': []}]}
    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit._json', _json)

    with configured.app_context():
        out = peer_training.machines()

    offline = [m for m in out if m['id'].startswith('workshop')]
    assert len(offline) == 1
    assert offline[0]['available'] is False
    assert 'No answer' in offline[0]['label']


def test_an_unreachable_aitoolkit_yields_no_machines_rather_than_raising(configured, monkeypatch):
    """A picker must degrade. A 500 here would take out the Training panel."""
    def _boom(self, method, path, **kw):
        raise RuntimeError('connection refused')
    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit._json', _boom)

    with configured.app_context():
        assert peer_training.machines() == []


def test_this_lane_never_writes_the_local_single_flight_flag(app):
    """The whole reason this lane exists, asserted where it cannot pass by luck.

    `training_in_progress` means "this machine's GPU is busy" and gates
    generation and the bank's GPU passes. If a peer run set it, renting the
    second machine would idle the first one for the length of the run.

    Asserted against the MODULE rather than by driving a launch, deliberately.
    A launch test would need most of a configured ai-toolkit checkout stubbed
    out, and the first attempt at one failed identically before AND after the
    flag was wrongly set -- it never reached the assertion, so it proved
    nothing. This cannot fail for the wrong reason: the flag is either written
    in this file or it is not.

    Asserted on the WRITE API rather than on the flag name, because the first
    version of this test failed on the module's own docstring -- which explains
    `training_in_progress` at length. `_set_system_state` appears in code or not
    at all.
    """
    import inspect

    source = inspect.getsource(peer_training)
    assert '_set_system_state' not in source, (
        'this lane must not write machine-wide training state; '
        'that flag means "this machine\'s GPU is busy" and gates generation '
        'and the bank\'s GPU passes')


def test_an_active_peer_run_leaves_the_local_flag_alone(app):
    from app.extensions import db
    from app.job_queue import queue_manager
    from app.models import PeerTrainingRun

    with app.app_context():
        db.session.add(PeerTrainingRun(dataset_id=1, gpu_ids='workshop:0',
                                       status='running'))
        db.session.commit()

        assert bool(queue_manager._get_system_state('training_in_progress', False)) is False
        summary = peer_training.status_summary()
        assert summary['any_active'] is True
        assert summary['runs'][0]['gpu_ids'] == 'workshop:0'


def test_status_is_reported_outside_training_status(app):
    """A peer run must not appear in `training_status()`, which describes only
    the local single-flight run — otherwise the Training page would show a run
    this machine is not doing."""
    from app.extensions import db
    from app.models import PeerTrainingRun
    from app.services import lora_training as lt

    with app.app_context():
        db.session.add(PeerTrainingRun(dataset_id=7, gpu_ids='workshop:0', status='running'))
        db.session.commit()

        assert lt.training_status()['in_progress'] is False
        assert lt.training_status()['current'] is None
        assert peer_training.status_summary(7)['runs'][0]['dataset_id'] == 7


def test_stop_is_durable_so_a_restart_can_still_honour_it(app, monkeypatch):
    """An in-memory event is only enforceable by the supervisor thread, and a
    restart is exactly what destroys that thread. Same lesson the cloud lane's
    stop_requested_at carries, and the sibling project's cancel_requested."""
    from app import config as cfg
    from app.extensions import db
    from app.models import PeerTrainingRun

    sent = []
    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit.stop_job',
                        lambda self, job_id: sent.append(job_id))

    with app.app_context():
        cfg.save_config({'aitoolkit': {'url': 'http://localhost:8675', 'token': ''}})
        run = PeerTrainingRun(dataset_id=1, gpu_ids='workshop:0', status='running',
                              remote_job_id='job-1')
        db.session.add(run)
        db.session.commit()

        assert peer_training.request_stop(run.id) is True
        db.session.refresh(run)
        assert run.stop_requested_at is not None, 'the request must survive this process'
        assert sent == ['job-1']


def test_stopping_a_finished_run_reports_that_rather_than_pretending(app):
    from app.extensions import db
    from app.models import PeerTrainingRun

    with app.app_context():
        run = PeerTrainingRun(dataset_id=1, gpu_ids='workshop:0', status='done')
        db.session.add(run)
        db.session.commit()
        assert peer_training.request_stop(run.id) is False
        assert peer_training.request_stop(999999) is False


def test_a_second_run_for_the_same_dataset_is_refused(app, monkeypatch):
    """Two runs writing the same run folder and the same log would corrupt
    both. The local path is single-flight for the same reason."""
    from app import config as cfg
    from app.extensions import db
    from app.models import FaceDataset, PeerTrainingRun

    with app.app_context():
        cfg.save_config({'aitoolkit': {'url': 'http://localhost:8675', 'token': ''}})
        ds = FaceDataset(user_id='local', name='peer-lane', trigger_word='peerlane1')
        db.session.add(ds)
        db.session.commit()
        db.session.add(PeerTrainingRun(dataset_id=ds.id, gpu_ids='workshop:0',
                                       status='running'))
        db.session.commit()
        with pytest.raises(ValueError, match='already training'):
            peer_training.launch('local', ds.id, gpu_ids='workshop:1')


def test_a_successful_run_is_recognised_as_finished(app):
    """ai-toolkit writes `completed`, not `stopped`, when a run ends cleanly.

    Found while wiring the picker, by reading the trainer rather than the type:
    `UITrainer.py` does `update_status("completed", ...)` on a clean finish, and
    `stopped`/`error` are the other two ends. The watcher's terminal set held
    only the latter two — so the SUCCESS case, the only one that matters, was
    the one it did not recognise: it would have polled that job forever, never
    fetched the weights home and never left "running".

    Pinned against the real status strings rather than the watcher's internals,
    because the bug was a missing member of that set and a test written from the
    same list would have inherited the same hole.
    """
    from app.models import PeerTrainingRun

    assert 'completed' in peer_training.REMOTE_TERMINAL_STATUS, (
        'a clean finish is what ai-toolkit reports as "completed"')
    outcome = peer_training.REMOTE_TERMINAL_STATUS
    assert outcome['completed'] == 'done'
    assert outcome['error'] == 'failed'
    assert outcome['stopped'] == 'stopped'
    for value in outcome.values():
        assert value in PeerTrainingRun.TERMINAL


def test_a_stopped_run_still_brings_its_checkpoints_home(app):
    """Stop promises "checkpoints already saved are kept" — which is only true
    if they are fetched. Only a crash skips the fetch."""
    assert peer_training.should_fetch_weights('completed') is True
    assert peer_training.should_fetch_weights('stopped') is True
    assert peer_training.should_fetch_weights('error') is False


def test_the_same_launch_guards_run_whichever_machine_trains(configured, monkeypatch):
    """A dataset does not become well-formed by being trained somewhere else.

    The first version of this lane called neither `assert_trainable` nor
    anything like it, so "Train on another machine" was a way to bypass every
    caption and readiness guard the local path enforces — the client's
    pre-flight is advisory, and this is where the enforcement lives. The force
    flags come through for the same reason they do locally: each refusal is a
    marker the panel turns into a "train anyway" confirm.
    """
    seen = {}

    def _spy(dataset_id, **kw):
        seen.update(kw)
        raise ValueError('MISMATCH_CAPTION: booru captions on a prose family')

    monkeypatch.setattr('app.services.lora_training.assert_trainable', _spy)

    from app.extensions import db
    from app.models import FaceDataset

    with configured.app_context():
        ds = FaceDataset(user_id='local', name='guarded', trigger_word='guarded1')
        db.session.add(ds)
        db.session.commit()
        with pytest.raises(ValueError, match='MISMATCH_CAPTION'):
            peer_training.launch('local', ds.id, gpu_ids='workshop:0')
        assert seen['allow_caption_mismatch'] is False
        # …and the override reaches it, so the panel's retry works remotely too.
        seen.clear()
        with pytest.raises(ValueError):
            peer_training.launch('local', ds.id, gpu_ids='workshop:0',
                                 allow_caption_mismatch=True, allow_uncaptioned=True,
                                 allow_caption_quality=True, allow_not_ready=True)
        assert all(seen[k] is True for k in
                   ('allow_caption_mismatch', 'allow_uncaptioned',
                    'allow_caption_quality', 'allow_not_ready'))


def test_an_aitoolkit_that_cannot_see_the_export_is_refused_up_front(configured, monkeypatch):
    """The address must be THIS machine's ai-toolkit.

    Nothing else in the flow says so: this app exports the dataset to a folder
    on this disk and hands over that path, so an ai-toolkit elsewhere would
    accept the job and fail in its staging step with a bare ENOENT, from another
    process, minutes later. Checked against the folder ai-toolkit itself
    reports, so the refusal names both sides.
    """
    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit.get_settings',
                        lambda self: {'DATASETS_FOLDER': '/srv/aitk/datasets'})
    with configured.app_context():
        with pytest.raises(ValueError, match='same machine and the same folder'):
            peer_training._assert_reachable_dataset('/home/other/exports/run-1')
        # Inside its folder: fine, and a subfolder counts.
        peer_training._assert_reachable_dataset('/srv/aitk/datasets/run-1')


def test_an_unreadable_aitoolkit_does_not_become_a_folder_complaint(configured, monkeypatch):
    """It is about to fail loudly for its own reasons; blaming the datasets
    folder would send the user to fix the wrong setting."""
    def _boom(self):
        raise RuntimeError('connection refused')
    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit.get_settings', _boom)
    with configured.app_context():
        peer_training._assert_reachable_dataset('/anywhere/at/all')


def test_nothing_is_uploaded_to_a_machine_that_already_has_the_files(app):
    """The export lands in ai-toolkit's own datasets folder, on this machine.

    The first version uploaded it to `/api/datasets/upload` anyway — copying a
    folder to the machine it was already on, file by file over HTTP — and then
    sent a config naming the dataset by its bare job name. A bare name is not a
    path, and the staging step resolves `folder_path` on disk, so it would have
    looked relative to the ai-toolkit process's working directory and found
    nothing. Pinned on the module rather than by driving a launch: the call is
    either in this file or it is not.
    """
    import inspect

    source = inspect.getsource(peer_training)
    assert 'upload_dataset' not in source, (
        'the ai-toolkit submitted to is on this machine and already has the '
        'export — it stages the folder onward itself')


def test_this_machines_own_gpu_is_refused_by_this_lane(app):
    """A bare GPU index is the ai-toolkit HOST's own card — this machine.

    This lane never sets `training_in_progress`, on purpose. Sending a run to
    this machine through it would therefore train on the local GPU while
    generation and the bank's GPU passes still believed it was free, and both
    would start on top of it. The local path exists for this machine and is the
    only thing allowed to take that flag.

    Fail-first check: without the guard this dies deeper, in `_datasets_dir()`,
    with a RuntimeError — which is not a ValueError, so the raises block fails
    either way. It can only PASS once the guard refuses by name.
    """
    from app import config as cfg
    from app.extensions import db
    from app.models import FaceDataset

    with app.app_context():
        cfg.save_config({'aitoolkit': {'url': 'http://localhost:8675', 'token': ''}})
        ds = FaceDataset(user_id='local', name='own-gpu', trigger_word='owngpu1')
        db.session.add(ds)
        db.session.commit()
        with pytest.raises(ValueError, match='this machine'):
            peer_training.launch('local', ds.id, gpu_ids='0')


def test_a_second_run_of_the_same_dataset_adopts_the_existing_remote_job(app, monkeypatch):
    """The job name is derived from the run, so re-running a dataset reuses it.

    ai-toolkit's `Job.name` carries a UNIQUE constraint — `POST /api/jobs`
    answers `409 {"error":"Job name already exists"}` — and its own remote
    watcher upserts by looking the name up first and sending the `id` back. This
    lane called plain `create_job`, so the SECOND remote run of any dataset
    would have died on that 409, inside the supervisor thread, with the raw
    error. The first run of every dataset worked, which is why it read as fine.
    """
    calls = []

    def _find(self, name):
        calls.append(('find', name))
        return {'id': 'job-existing', 'name': name}

    def _request(self, method, path, **kw):
        calls.append((method, path, kw.get('json')))

        class R:
            status_code = 200

            @staticmethod
            def json():
                return {'id': 'job-existing'}
        return R()

    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit.find_job_by_name', _find)
    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit._request', _request)

    from app import config as cfg
    from app.services.aitoolkit_remote import RemoteAiToolkit

    with app.app_context():
        cfg.save_config({'aitoolkit': {'url': 'http://localhost:8675', 'token': ''}})
        job_id = RemoteAiToolkit('http://localhost:8675', '').upsert_job(
            'lora_thing', {'config': {}}, gpu_ids='workshop:0')

    assert job_id == 'job-existing'
    posted = [c for c in calls if c[0] == 'POST'][0][2]
    assert posted['id'] == 'job-existing', (
        'without the id, the POST creates — and the unique name makes that a 409')
    assert posted['name'] == 'lora_thing'
    assert posted['gpu_ids'] == 'workshop:0'


def test_a_first_run_creates_rather_than_sending_an_empty_id(app, monkeypatch):
    """`id: None` is not the same as no id — send it and the update branch runs
    against a row that does not exist."""
    posted = {}

    def _find(self, name):
        return None

    def _request(self, method, path, **kw):
        posted.update(kw.get('json') or {})

        class R:
            status_code = 200

            @staticmethod
            def json():
                return {'id': 'job-new'}
        return R()

    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit.find_job_by_name', _find)
    monkeypatch.setattr('app.services.aitoolkit_remote.RemoteAiToolkit._request', _request)

    from app.services.aitoolkit_remote import RemoteAiToolkit

    with app.app_context():
        job_id = RemoteAiToolkit('http://localhost:8675', '').upsert_job(
            'lora_new', {'config': {}}, gpu_ids='workshop:0')

    assert job_id == 'job-new'
    assert 'id' not in posted


def test_weights_land_where_the_checkpoint_browser_looks(app, tmp_path):
    """`training.log` and the checkpoints do NOT share a folder.

    `_run_log_path` is the run's TOP folder; ai-toolkit saves into
    `<top>/lora_<trigger>`, and that save_root is what the checkpoint browser,
    Test Studio and the lineage all scan. The first version derived the download
    destination from `os.path.dirname(run.log_path)` — one level too high — so
    every mirrored checkpoint would have landed somewhere nothing looks, and the
    run would have read as "finished, no checkpoints".

    `lora_training` has a comment about exactly this: two different folders were
    both being called "the run folder" at nine call sites.
    """
    import os

    from app import config as cfg
    from app.extensions import db
    from app.models import FaceDataset, PeerTrainingRun
    from app.services import lora_training as lt

    with app.app_context():
        # Both helpers resolve under ai-toolkit's output folder, so it has to be
        # configured for this test to reach its assertion at all.
        cfg.save_config({'aitoolkit': {'dir': str(tmp_path / 'aitoolkit')}})
        ds = FaceDataset(user_id='local', name='where', trigger_word='wheretrig')
        db.session.add(ds)
        db.session.commit()
        log_path = lt._run_log_path(ds, base_model=None, family='zimage', variant=None)
        save_root = lt._run_dir('local', ds.id, base_model=None, family='zimage',
                                variant=None)
        run = PeerTrainingRun(dataset_id=ds.id, gpu_ids='workshop:0', status='done',
                              log_path=log_path,
                              train_params=json.dumps({'save_root': save_root}))
        db.session.add(run)
        db.session.commit()

        target = peer_training._weights_dir(run)

    assert target == save_root
    assert target != os.path.dirname(log_path), (
        'the log lives in the run root; the weights live in its lora_<trigger> '
        'save_root, which is the folder the checkpoint browser scans')


def test_samples_land_where_the_panel_shows_them(app, tmp_path):
    """Samples arrive one folder above where this app looks, so they need a hop.

    ai-toolkit mirrors a remote run's samples into `<TRAINING_FOLDER>/<job>/
    samples`, which is this run's TOP folder. The panel reads
    `_samples_dir` — `<top>/lora_<trigger>/samples`. Same one-level confusion as
    the checkpoints, on the other side of the boundary this time, and the reason
    the picker's tooltip could not honestly claim samples come back until this
    existed. Live samples are how a run that is going wrong shows it early.
    """
    import os

    from app import config as cfg
    from app.extensions import db
    from app.models import FaceDataset, PeerTrainingRun
    from app.services import lora_training as lt

    fetched = []

    with app.app_context():
        cfg.save_config({'aitoolkit': {'dir': str(tmp_path / 'aitoolkit')}})
        ds = FaceDataset(user_id='local', name='samp', trigger_word='samptrig')
        db.session.add(ds)
        db.session.commit()
        want = lt._samples_dir('local', ds.id, base_model=None, family='zimage',
                               variant=None)
        run = PeerTrainingRun(dataset_id=ds.id, gpu_ids='workshop:0', status='running',
                              remote_job_id='job-1',
                              train_params=json.dumps({'samples_dir': want}))
        db.session.add(run)
        db.session.commit()

        class FakeClient:
            @staticmethod
            def get_samples(job_id):
                return ['/srv/aitk/output/run/samples/0000.png',
                        '/srv/aitk/output/run/samples/0001.png']

            @staticmethod
            def download_sample(remote, dest):
                fetched.append(dest)
                open(dest, 'w').close()

        seen = set()
        peer_training._mirror_samples(FakeClient, run, seen)
        # Second pass: already-fetched samples are not downloaded again. A run
        # samples every few hundred steps and the watcher polls every 5s.
        peer_training._mirror_samples(FakeClient, run, seen)

    assert [os.path.dirname(p) for p in fetched] == [want, want]
    assert [os.path.basename(p) for p in fetched] == ['0000.png', '0001.png']


def test_a_recent_failure_is_still_reported_after_the_run_ends(app):
    """A failed run must not vanish with its reason unread.

    The card renders whatever `status_summary` returns, and the first version
    returned ACTIVE runs only — so a run that died on the other machine
    disappeared from the panel the moment it failed, taking its error with it.
    Nothing else covers this lane: `training_status()` describes the local run,
    and the crash reader reads the local process.

    A SUCCESS is not reported the same way on purpose — its checkpoints are the
    notice — and a failure stops being news after an hour.
    """
    from datetime import timedelta

    from app.extensions import db
    from app.models import PeerTrainingRun

    now = datetime.utcnow()
    with app.app_context():
        db.session.add_all([
            PeerTrainingRun(dataset_id=5, gpu_ids='workshop:0', status='failed',
                            error='CUDA out of memory', finished_at=now),
            PeerTrainingRun(dataset_id=5, gpu_ids='workshop:0', status='failed',
                            error='ancient history',
                            finished_at=now - timedelta(hours=6)),
            PeerTrainingRun(dataset_id=5, gpu_ids='workshop:0', status='done',
                            finished_at=now),
        ])
        db.session.commit()

        summary = peer_training.status_summary(5)

    assert summary['any_active'] is False, 'a finished run must not block a relaunch'
    errors = [r.get('error') for r in summary['runs']]
    assert 'CUDA out of memory' in errors
    assert 'ancient history' not in errors, 'an hour-old failure is not news'
    assert all(r['status'] != 'done' for r in summary['runs']), \
        'a success is announced by its checkpoints, not by a card'


def test_a_run_interrupted_before_submission_is_failed_not_left_hanging(app):
    """Resume can only re-attach to a job that exists over there. A row with no
    remote job id never got that far, so nothing is running and the row must not
    sit 'running' forever."""
    from app.extensions import db
    from app.models import PeerTrainingRun

    with app.app_context():
        run = PeerTrainingRun(dataset_id=1, gpu_ids='workshop:0', status='preparing')
        db.session.add(run)
        db.session.commit()
        run_id = run.id

    peer_training.resume_supervisors(app)

    with app.app_context():
        row = db.session.get(PeerTrainingRun, run_id)
        assert row.status == 'failed'
        assert 'before the job was sent' in (row.error or '')
