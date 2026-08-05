"""Train on another machine's GPU, through its ai-toolkit.

A LANE OF ITS OWN. Local training is single-flight through the machine-wide
``training_in_progress`` flag, and that flag means "this machine's GPU is busy"
— ``gpu_window``, the bank's GPU passes and generation all gate on it. A run
happening on another box must not set it, or renting the second machine would
idle the first one, which is exactly the failure the bank queue's lanes were
introduced to fix. So this lane never touches that flag, and its runs live in
``PeerTrainingRun`` rather than in ``lora_training.training_status()`` (which
reports only that flag's single run). The retired cloud lane had the same shape
for the same reason.

**LDS does not talk to the far machine.** It submits to the ai-toolkit instance
configured in ``aitoolkit.url``, and ai-toolkit decides where the job runs from
the ``gpu_ids`` it is given — a bare index for its own GPU, ``<peer>:<index>``
for one of its peers. That machine stages the dataset onward and mirrors the
results home itself. One implementation of the remote hop, not two: this app
used to carry its own, and it was deleted on 2026-08-04 because nothing could
reach it and a Stop could not stop it.

**The log is mirrored to the path a local run would have used.** The Training
page, the crash reader and the Runs page all read a run's log off disk, so
mirroring it there means each of them works against a peer run without knowing
it is one — the same trick that let ai-toolkit's own remote runs reuse its whole
UI unchanged.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime

from .. import config as cfg
from ..extensions import db
from ..models import FaceDataset, PeerTrainingRun
from ..utils.dbbusy import write_with_retry

logger = logging.getLogger(__name__)

#: How often the supervisor asks the far side how the run is going.
POLL_SECONDS = 5.0

#: Consecutive failed polls before a run is called lost. At POLL_SECONDS this is
#: a minute of silence, which a restarting ai-toolkit comfortably survives.
MAX_POLL_FAILURES = 12

#: How a finished remote job maps onto this lane's own status. Read off
#: ai-toolkit's trainer, not its type union: `UITrainer.update_status` writes
#: exactly these three at the end of a run, and a CLEAN finish is `completed` —
#: the one a `('stopped', 'error')` terminal set silently misses, leaving a
#: successful run polling forever with its weights still on the other machine.
#: Every other status it reports (`queued`, `running`, `stopping`) is transient.
REMOTE_TERMINAL_STATUS = {
    'completed': 'done',
    'stopped': 'stopped',
    'error': 'failed',
}


def should_fetch_weights(remote_status: str) -> bool:
    """Whether to bring checkpoints home for a run that ended this way.

    A stopped run keeps whatever it had saved — that is what Stop promises here
    and on the local path. Only a crash is skipped, and even then the weights
    stay on the machine that made them.
    """
    return remote_status in ('completed', 'stopped')

_threads: dict[int, threading.Thread] = {}
_threads_lock = threading.Lock()


class PeerTrainingError(RuntimeError):
    pass


# ── the ai-toolkit this app submits to ───────────────────────────────────────

def _endpoint() -> tuple[str, str]:
    url = (cfg.get('aitoolkit.url') or '').strip().rstrip('/')
    token = (cfg.get('aitoolkit.token') or '').strip()
    return url, token


def is_configured() -> bool:
    return bool(_endpoint()[0])


#: How ai-toolkit encodes "a GPU on one of MY peers" in its `gpu_ids` column:
#: ``<peerId>:<localIndex>``. A bare index is its own card. Kept in step with
#: ai-toolkit's `ui/cron/gpuIds.ts` — one character, in one place, on each side.
PEER_GPU_SEPARATOR = ':'


def is_remote_gpu(gpu_ids: str) -> bool:
    """True for a GPU on a machine other than the ai-toolkit host."""
    return PEER_GPU_SEPARATOR in (gpu_ids or '')


def _client():
    from .aitoolkit_remote import RemoteAiToolkit
    url, token = _endpoint()
    if not url:
        raise PeerTrainingError(
            'No ai-toolkit web address is set — add it in Settings ▸ Training '
            'to train on another machine.')
    return RemoteAiToolkit(url, token)


def _client_for(run: PeerTrainingRun):
    """The client for a run ALREADY under way, addressed at the machine it was
    sent to rather than at whatever the settings say now.

    `base_url` was recorded at launch and then never read: every poll rebuilt
    the client from live config. Change the ai-toolkit address while a run is in
    flight — or re-attach after a restart that followed such a change — and the
    supervisor would go on polling job ids against a DIFFERENT machine. Ids are
    per-database, so the likely answers are a 404 that reads as "the job is
    gone" or, worse, a job that happens to share the id and reports someone
    else's progress into this run.

    The token still comes from config: it is not stored per run, and a machine
    that has been repointed usually needs the new one anyway. If the recorded
    address is dead this now fails honestly as lost contact, which is the right
    answer — it is a truthful "I cannot reach the machine that has your run"
    rather than a confident report about the wrong one.
    """
    url = (run.base_url or '').strip().rstrip('/')
    if not url:
        return _client()
    from .aitoolkit_remote import RemoteAiToolkit
    return RemoteAiToolkit(url, _endpoint()[1])


def machines() -> list[dict]:
    """Every GPU this app can send a training run to.

    Merged from the configured ai-toolkit's own ``/api/gpu`` (its local cards)
    and its ``/api/machines`` (its peers). The merge happens here rather than
    there for the same reason ai-toolkit merges it in the browser: a peer that
    is switched off must not be able to delay or break the local half of the
    list.
    """
    if not is_configured():
        return []
    client = _client()
    out: list[dict] = []
    try:
        local = client._json('GET', '/api/gpu') or {}
        for gpu in (local.get('gpus') or []):
            idx = gpu.get('index')
            out.append({
                'id': f'{idx}',
                'label': f'GPU #{idx}' + (f' · {gpu.get("name")}' if gpu.get('name') else ''),
                'available': True,
                'remote': False,
            })
    except Exception as e:      # noqa: BLE001 — an unreachable ai-toolkit is a state, not a crash
        logger.warning('peer_training: could not list local GPUs: %s', e)
        return []
    try:
        peers = client._json('GET', '/api/machines') or {}
    except Exception as e:      # noqa: BLE001
        logger.warning('peer_training: could not list peer machines: %s', e)
        peers = {}
    for machine in (peers.get('machines') or []):
        label = machine.get('label') or machine.get('id')
        if not machine.get('online') or not machine.get('gpus'):
            # Listed, disabled, with the reason. Hiding it reads exactly like
            # never having configured it — the sibling project's rule, and the
            # one this app's own Run-on picker follows.
            out.append({
                'id': f'{machine.get("id")}:0',
                'label': f'{label} — {machine.get("error") or "offline"}',
                'available': False,
                'reason': machine.get('error') or 'offline',
                'remote': True,
            })
            continue
        for gpu in machine['gpus']:
            out.append({
                'id': f'{machine.get("id")}:{gpu.get("index")}',
                'label': f'{label} · GPU #{gpu.get("index")}',
                'available': True,
                'remote': True,
            })
    return out


def _machine_label(gpu_ids: str) -> str:
    for m in machines():
        if m['id'] == gpu_ids:
            return m['label']
    return gpu_ids


# ── run state ────────────────────────────────────────────────────────────────

def active_runs() -> list[PeerTrainingRun]:
    return (PeerTrainingRun.query
            .filter(~PeerTrainingRun.status.in_(PeerTrainingRun.TERMINAL))
            .order_by(PeerTrainingRun.created_at.asc())
            .all())


#: How long a failed run keeps being reported after it ended. A failure that
#: scrolled past unseen is the one worth showing; an hour-old one has been read.
FAILED_NOTICE_SECONDS = 3600


def recent_failures(dataset_id=None, now=None) -> list[PeerTrainingRun]:
    """Runs that died recently, so the panel can say so.

    Without this a failed run disappeared from the panel the instant it failed,
    taking its reason with it — and nothing else covers this lane:
    `training_status()` describes the LOCAL run, and the crash reader reads the
    local process. A SUCCESS is deliberately not reported here; its checkpoints
    are the notice.
    """
    now = now or datetime.utcnow()
    cutoff = now.timestamp() - FAILED_NOTICE_SECONDS
    q = PeerTrainingRun.query.filter(PeerTrainingRun.status == 'failed')
    if dataset_id is not None:
        q = q.filter(PeerTrainingRun.dataset_id == int(dataset_id))
    return [r for r in q.order_by(PeerTrainingRun.id.desc()).limit(20).all()
            if r.finished_at is not None and r.finished_at.timestamp() >= cutoff]


def status_summary(dataset_id=None) -> dict:
    """What the Training panel renders for this lane."""
    runs = active_runs()
    if dataset_id is not None:
        here = [r for r in runs if r.dataset_id == int(dataset_id)]
    else:
        here = runs
    return {
        'configured': is_configured(),
        'runs': [r.to_dict() for r in here + recent_failures(dataset_id)],
        # ACTIVE runs only. A failure being shown must not keep the Train button
        # disabled — the whole point of showing it is that the user relaunches.
        'any_active': bool(runs),
    }


def _set(run: PeerTrainingRun, **fields) -> None:
    def _apply():
        for key, value in fields.items():
            setattr(run, key, value)
        run.updated_at = datetime.utcnow()
    try:
        write_with_retry(_apply)
    except Exception:
        logger.exception('peer_training: could not update run %s', getattr(run, 'id', '?'))


def request_stop(run_id: int) -> bool:
    """Ask a run to stop. Durable, so a restart can still honour it.

    An in-memory event would only be enforceable by the supervisor thread, and
    that thread is exactly what a restart destroys — the same reasoning the
    cloud lane's `stop_requested_at` carries, and the sibling project's
    `cancel_requested` column.
    """
    run = db.session.get(PeerTrainingRun, int(run_id))
    if run is None or run.status in PeerTrainingRun.TERMINAL:
        return False
    _set(run, stop_requested_at=datetime.utcnow(), phase_detail='Stopping…')
    reached = True
    try:
        if run.remote_job_id:
            _client_for(run).stop_job(run.remote_job_id)
    except Exception as e:      # noqa: BLE001 — the flag is the durable part
        reached = False
        logger.warning('peer_training: stop request did not reach the job: %s', e)

    # A run with no supervisor has to be finalised HERE, because the flag above
    # is only ever acted on by a watcher, and this lane deliberately leaves a
    # run non-terminal when contact is lost. Without this, Stop on such a run
    # set a flag nobody would ever read: the row stayed non-terminal for ever
    # and went on holding the dataset's single-run lock, so the one action
    # offered for getting out of that state did nothing at all.
    with _threads_lock:
        watched = run.id in _threads
    if not watched:
        _set(run, status='stopped', finished_at=datetime.utcnow(),
             phase_detail=('Stopped.' if reached else
                           f'Stopped here. {run.machine_label} could not be '
                           'reached, so the job may still be running there.'))
    return True


# ── launch ───────────────────────────────────────────────────────────────────

def _assert_reachable_dataset(dataset_folder: str) -> None:
    """Refuse up front if the configured ai-toolkit cannot read the export.

    `aitoolkit.url` must name **this machine's** ai-toolkit: this app exports the
    dataset to a folder on this disk and hands over that path, so an address on
    another box would name a folder it cannot see. Nothing in the flow states
    that on its own — the job would be accepted, and the staging step would fail
    with a bare ENOENT from a different process, minutes later.

    So it is checked here, against the folder that ai-toolkit itself reports.
    A mismatch names both sides, because the fix is always to change one of
    them. An ai-toolkit that will not answer is NOT treated as a mismatch: it is
    about to fail loudly for its own reasons, and refusing here would blame the
    wrong setting.
    """
    try:
        settings = _client().get_settings() or {}
    except Exception as e:      # noqa: BLE001
        logger.warning('peer_training: could not read ai-toolkit settings: %s', e)
        return
    remote_root = str(settings.get('DATASETS_FOLDER') or '').strip()
    if not remote_root:
        return
    here = os.path.normcase(os.path.abspath(dataset_folder))
    there = os.path.normcase(os.path.abspath(remote_root))
    try:
        if os.path.commonpath([here, there]) == there:
            return
    except ValueError:
        # Different Windows drives. `commonpath` raises rather than answering,
        # and the answer it would have given is "no" — which is what the
        # refusal below says, with both paths in it.
        pass
    raise ValueError(
        f'The ai-toolkit at {_endpoint()[0]} keeps its datasets in '
        f'“{remote_root}”, but this app exported to “{dataset_folder}”. They '
        'have to be the same machine and the same folder — point the web '
        'address at this machine\'s own ai-toolkit, or line up the datasets '
        'folder in Settings ▸ Local tools.')


def launch(user_id, dataset_id, *, gpu_ids: str, steps=None, base_model=None,
           variant=None, train_type=None, masked=None,
           allow_caption_mismatch=False, allow_uncaptioned=False,
           allow_caption_quality=False, allow_not_ready=False) -> dict:
    """Export, submit to ai-toolkit with the chosen GPU, and start watching.

    Returns the new run's dict. Raises ValueError for anything the caller can
    fix (no address configured, a dataset already training there) so the routes
    turn it into a 400 rather than a 500.
    """
    from . import checkpoint_registry
    from . import lora_training as lt

    if not is_configured():
        raise ValueError(
            'No ai-toolkit web address is set — add it in Settings ▸ Training.')

    if not is_remote_gpu(gpu_ids):
        # A bare index is the ai-toolkit HOST's own card, which is this machine.
        # This lane never sets `training_in_progress` — that is the whole point
        # of it — so a run sent here would train on the local GPU while
        # generation and the bank's GPU passes still believed it was free, and
        # both would start on top of it. The local path owns this machine.
        raise ValueError(
            'That GPU is on this machine — use “Train the LoRA” for a local '
            'run, so the rest of the app knows the GPU is busy.')

    ds = db.session.get(FaceDataset, int(dataset_id))
    if ds is None:
        raise ValueError('dataset not found')

    existing = [r for r in active_runs() if r.dataset_id == int(dataset_id)]
    if existing:
        raise ValueError(
            'This dataset is already training on another machine — stop that '
            'run first.')

    fam = lt._train_type(ds) if train_type is None else train_type

    # The SAME launch guards the local path runs — captions that do not match
    # the family, uncaptioned images, trigger-only captions, the image floor.
    # Not optional and not a duplicate: they are dataset guards, and a dataset
    # does not become well-formed by being trained somewhere else. The client's
    # pre-flight is advisory; this is the enforcement, and skipping it here
    # would have made "train on another machine" the way to bypass every one of
    # them. Each raises a marker error the panel already knows how to turn into
    # a "train anyway" confirm, which is why the force flags come through.
    lt.assert_trainable(int(dataset_id), train_type=fam,
                        allow_caption_mismatch=bool(allow_caption_mismatch),
                        allow_uncaptioned=bool(allow_uncaptioned),
                        allow_caption_quality=bool(allow_caption_quality),
                        allow_not_ready=bool(allow_not_ready),
                        variant=variant)

    if steps is None:
        steps = lt.recommended_steps(int(dataset_id), train_type=fam, variant=variant)
    masked = True if masked is None else bool(masked)

    # Same export the local path uses, so what trains remotely is what would
    # have trained here. It lands in ai-toolkit's OWN datasets folder, which is
    # why nothing is uploaded below: the instance being submitted to is on this
    # machine and can already read it. IT then stages the folder onward to the
    # machine that trains.
    dataset_folder = lt.export_dataset_to_aitoolkit(
        user_id, int(dataset_id), masked=masked)
    _assert_reachable_dataset(dataset_folder)
    # Built here, not in the supervisor thread, so an unbuildable config is a
    # 400 on the click rather than a failed row appearing seconds later.
    job_config = lt.build_job_config(ds, dataset_folder, steps=int(steps))
    run_name = lt._run_name(ds, base_model=base_model, family=fam, variant=variant)
    log_path = lt._run_log_path(ds, base_model=base_model, family=fam, variant=variant)
    # The run's TOP folder holds the log; ai-toolkit's checkpoints go in the
    # `lora_<trigger>` save_root BELOW it, which is the folder the checkpoint
    # browser scans. Two different folders — see `_weights_dir`.
    save_root = lt._run_dir(user_id, int(dataset_id), base_model=base_model,
                            family=fam, variant=variant)
    samples_dir = lt._samples_dir(user_id, int(dataset_id), base_model=base_model,
                                  family=fam, variant=variant)
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    label = _machine_label(gpu_ids)
    run = PeerTrainingRun(
        dataset_id=int(dataset_id), gpu_ids=gpu_ids, machine_label=label,
        run_name=run_name, job_name=run_name, status='preparing',
        # Not "sending" — this app hands the run to its own ai-toolkit, and
        # THAT stages the dataset over. Saying otherwise would point a stalled
        # transfer at the wrong machine.
        phase_detail=f'Handing the run to {label}…',
        base_url=_endpoint()[0], log_path=log_path,
        total_steps=int(steps),
        train_params=json.dumps({'steps': int(steps), 'variant': variant,
                                 'train_type': fam, 'masked': masked,
                                 'base_model': base_model or '',
                                 # Where a LOCAL run of these exact parameters
                                 # would save. Resolved now, not at fetch time:
                                 # it depends on the base/family/variant THIS
                                 # run started with, and a later dataset edit
                                 # would resolve to a different folder.
                                 'save_root': save_root,
                                 'samples_dir': samples_dir}))
    write_with_retry(lambda: db.session.add(run))

    # Provenance, through the SAME registry the local path uses, so a peer run
    # appears in the Runs page and its lineage with everything else. `source`
    # is what tells them apart.
    try:
        prepared = checkpoint_registry.prepare_launch(
            user_id, int(dataset_id), base_model=base_model or '')
        rec = checkpoint_registry.register_launch(
            user_id, int(dataset_id), family=fam, source='peer',
            base_model=base_model or '', variant=variant, masked=masked,
            steps=int(steps), settings=lt.launch_settings_snapshot(ds, masked=masked),
            prepared=prepared)
        if rec is not None:
            _set(run, record_id=rec.id)
    except Exception:
        # Provenance must never block a launch — the local path says the same.
        logger.exception('peer_training: could not register the launch')

    from flask import current_app
    app = current_app._get_current_object()
    _start_supervisor(app, run.id, job_config)
    return run.to_dict()


# ── supervisor ───────────────────────────────────────────────────────────────

def _start_supervisor(app, run_id: int, job_config: dict | None = None) -> None:
    with _threads_lock:
        live = _threads.get(run_id)
        if live is not None and live.is_alive():
            return
        thread = threading.Thread(
            target=_supervise, args=(app, run_id, job_config),
            daemon=True, name=f'peer-train-{run_id}')
        _threads[run_id] = thread
        thread.start()


def resume_supervisors(app) -> int:
    """Re-attach to runs left mid-flight by a restart. Returns how many.

    The run row is durable precisely so this is possible; without it a restart
    would leave a job running on another machine with nothing watching it, and
    a stop nobody could honour.
    """
    resumed = 0
    with app.app_context():
        for run in active_runs():
            if run.remote_job_id:
                _start_supervisor(app, run.id)
                resumed += 1
            else:
                # It never got as far as creating the remote job, so there is
                # nothing to re-attach to and nothing was started over there.
                _set(run, status='failed', finished_at=datetime.utcnow(),
                     error='interrupted before the job was sent')
    return resumed


def _supervise(app, run_id: int, job_config: dict | None = None) -> None:
    with app.app_context():
        run = db.session.get(PeerTrainingRun, run_id)
        if run is None:
            return
        try:
            if not run.remote_job_id:
                _submit(run, job_config)
            _watch(run)
        except Exception as e:      # noqa: BLE001 — a supervisor must not die silently
            logger.exception('peer_training: run %s failed', run_id)
            # Only if `_watch` had not already reached a verdict. It sets the
            # terminal status BEFORE fetching the weights, so anything that
            # raises during the fetch — a save_root that cannot be created, a
            # disk that filled — used to come through here and rewrite a run
            # that genuinely COMPLETED as 'failed'. The training really did
            # finish and its checkpoints really are on the other machine; a
            # copy-back problem is a phase_detail, not a different outcome.
            try:
                db.session.refresh(run)
            except Exception:      # noqa: BLE001 — a detached row keeps its value
                pass
            if run.status in PeerTrainingRun.TERMINAL:
                _set(run, phase_detail=f'Finished, but: {str(e)[:500]}')
            else:
                _set(run, status='failed', error=str(e)[:2000],
                     phase_detail='', finished_at=datetime.utcnow())
        finally:
            with _threads_lock:
                _threads.pop(run_id, None)


def _submit(run: PeerTrainingRun, job_config: dict | None) -> None:
    """Create the job on the ai-toolkit and start it on the chosen GPU.

    **Nothing is uploaded here.** The config carries the export folder's real
    path, and the ai-toolkit being submitted to is on this machine, so it can
    read that folder directly — `_assert_reachable_dataset` refuses the launch
    up front if it could not. Staging to the machine that actually trains is
    that instance's job, and it does it from this same path.

    The first version DID upload, to `/api/datasets/upload` under the job name,
    and then sent a config naming the dataset by that bare name. Both halves
    were wrong: the upload copied a folder to the machine it was already on,
    file by file over HTTP, and a bare name is not a path — the staging step
    resolves `folder_path` on disk, so it would have looked for the dataset
    relative to the ai-toolkit process's working directory and found nothing.
    """
    if not job_config:
        # Only reachable if a caller starts a supervisor for an unsubmitted run
        # without one; `resume_supervisors` fails those rows instead.
        raise PeerTrainingError('the job config was lost before submission')
    client = _client()
    _set(run, status='queued', phase_detail=f'Queued on {run.machine_label}')
    # Upsert, not create: the job name is derived from the run, so re-running a
    # dataset submits a name ai-toolkit already has — and `Job.name` is unique
    # there. A plain create worked once per dataset and 409'd for ever after.
    job_id = client.upsert_job(run.job_name, job_config, gpu_ids=run.gpu_ids)
    # Recorded BEFORE the start call: a start that times out may still have
    # begun the run, and a row with no job id is failed on the next boot as
    # "never sent" — which would abandon a job actually training over there.
    _set(run, remote_job_id=job_id)
    client.start_job(job_id, gpu_ids=run.gpu_ids)
    # Only once the start has RETURNED. Everything between the line above and
    # this one is the window where the job exists and has never run, and this
    # stamp is what lets the next boot tell that state apart from a job that
    # ran and stopped — both of which read as 'stopped' on the far side.
    _set(run, started_at=datetime.utcnow())


def _watch(run: PeerTrainingRun) -> None:
    client = _client_for(run)
    failures = 0
    # Resume the mirror where the last supervisor left it. A fresh launch has 0
    # here; a re-attach after a restart has the real cursor, which is the whole
    # point — starting from 0 asks the peer for the entire log again, and since
    # a valid offset is not a truncation the answer carries `reset: false`, so
    # `_mirror_log` appends the run's whole history to the mirror a second time
    # and the restart marker cannot fire to explain it.
    log_offset = run.log_offset or 0
    have_samples: set[str] = set()

    while True:
        time.sleep(POLL_SECONDS)
        db.session.refresh(run)

        if run.stop_requested_at is not None and run.status not in PeerTrainingRun.TERMINAL:
            try:
                client.stop_job(run.remote_job_id)
            except Exception:      # noqa: BLE001
                logger.warning('peer_training: could not forward the stop')

        try:
            remote = client.get_job(run.remote_job_id)
            failures = 0
        except Exception as e:      # noqa: BLE001
            failures += 1
            if failures >= MAX_POLL_FAILURES:
                # NOT terminal. Losing contact says nothing about the RUN — the
                # job is very likely still training over there; what died is the
                # conversation. Marking it 'failed' put it in TERMINAL, which
                # drops it out of `active_runs()`, and `resume_supervisors` only
                # ever re-attaches to those — so the one status that meant "we
                # cannot see it any more" also guaranteed we would never look
                # again, while the GPU carried on for hours. Boot is when this
                # is most likely to fire, too: a minute of silence is exactly
                # what an ai-toolkit still starting up looks like.
                #
                # Left non-terminal, the next boot re-attaches and picks the run
                # back up. If the machine is really gone, Stop ends it — and
                # `request_stop` finalises a run nothing is watching rather than
                # waiting for a supervisor that will never answer.
                _set(run, phase_detail=(
                    f'Lost contact with {run.machine_label} ({e}). The run may '
                    'still be going there — this will re-attach when the app '
                    'restarts. Press ⏹ Stop to give up on it.'))
                logger.warning('peer_training: lost contact with run %s; left '
                               'non-terminal for a later re-attach', run.id)
                return
            _set(run, phase_detail=f'{run.machine_label} is not answering…')
            continue

        # `null`, not a missing key: ai-toolkit's job route answers HTTP 200
        # with a bare `null` when the row is gone (it has a delete route, and a
        # reset database does it too). That is a definite ANSWER — "there is no
        # such run" — and the one shape that must not be read as a poll that
        # went fine. `... or {}` did exactly that: the failure counter reset,
        # every field came back empty, `status` matched neither the running set
        # nor a terminal one, and the supervisor polled a run that no longer
        # existed for ever — holding the dataset's single-run lock with it, so
        # it could never be trained again without a restart. ai-toolkit's own
        # remote driver ends the run here for the same reason.
        if remote is None:
            _set(run, status='failed', finished_at=datetime.utcnow(),
                 phase_detail='',
                 error=f'{run.machine_label} no longer has this job — it was '
                       'deleted there, or that machine lost its job database.')
            return

        log_offset = _mirror_log(client, run, log_offset)
        _mirror_samples(client, run, have_samples)

        remote_status = str(remote.get('status') or '')

        # 'stopped' is ai-toolkit's Prisma DEFAULT, so it is also what a job
        # that has NEVER RUN reads as — `POST /api/jobs` creates the row in that
        # state and only `GET /api/jobs/<id>/start` moves it to 'queued'. The
        # gap between those two calls is not theoretical: `_submit` records the
        # job id BEFORE starting it, deliberately, so that a start which times
        # out is not mistaken for a job that was never sent. Crash in that gap
        # and the re-attach path skips `_submit` entirely (`_supervise` only
        # submits when there is no job id yet), so the first poll of the next
        # boot sees a job sitting at its creation default — and read as a
        # terminal 'stopped' that meant the run was quietly marked finished and
        # asked to hand over weights that were never written.
        #
        # `run.status` is what separates the two, and it survives the restart
        # that causes this: `_submit` sets 'queued' and only a poll that has
        # actually seen the job live moves it on. So 'queued' here means no poll
        # has ever succeeded, which a genuinely finished run cannot be.
        # `started_at is None` is the precise half of this test and the reason
        # the column exists; the other two conditions keep a row that PREDATES
        # the column (NULL because it was never written, not because no start
        # happened) from being misread — such a run has been seen live, so its
        # status has moved past 'queued'.
        if (remote_status == 'stopped' and run.started_at is None
                and run.status == 'queued'
                and not int(remote.get('step') or 0)):
            _set(run, status='failed', finished_at=datetime.utcnow(),
                 phase_detail='',
                 error=f'the job reached {run.machine_label} but was never '
                       'started — this app stopped between creating it and '
                       'launching it. Train again to pick it back up.')
            return

        _set(run,
             step=int(remote.get('step') or 0),
             total_steps=remote.get('total_steps') or run.total_steps,
             status='running' if remote_status in ('running', 'queued') else run.status,
             log_offset=log_offset,
             phase_detail=(remote.get('info') or '')[:2000])

        if remote_status in REMOTE_TERMINAL_STATUS:
            # One last pass at both: the final log lines and the last sample are
            # written after the poll that saw the run still running.
            log_offset = _mirror_log(client, run, log_offset)
            _mirror_samples(client, run, have_samples)
            failed = remote_status == 'error'
            _set(run,
                 status=REMOTE_TERMINAL_STATUS[remote_status],
                 log_offset=log_offset,
                 finished_at=datetime.utcnow(),
                 phase_detail='' if failed else 'Finished',
                 error=(remote.get('info') or 'the run failed on that machine') if failed else None)
            if should_fetch_weights(remote_status):
                _fetch_checkpoints(client, run)
            return


def _mirror_log(client, run: PeerTrainingRun, offset: int) -> int:
    """Append whatever the remote log gained, into the path a local run uses.

    This is what makes the rest of the app work unchanged: the crash reader, the
    Runs page and the training log view all read this file off disk.
    """
    if not run.log_path:
        return offset
    try:
        res = client._json('GET', f'/api/jobs/{run.remote_job_id}/log?offset={offset}')
    except Exception:      # noqa: BLE001 — a missed log chunk is never fatal
        return offset
    chunk = (res or {}).get('log') or ''
    # `reset` means the far log was truncated or restarted, so what came back is
    # a fresh tail rather than a continuation of what we already have. Appending
    # it silently would read as one run that repeated itself. Say so instead —
    # the marker is what tells whoever reads the log later why the step count
    # goes backwards in the middle of it.
    if chunk and (res or {}).get('reset') and offset > 0:
        chunk = (f'\n--- the log on {run.machine_label} restarted here '
                 f'(what follows is a fresh tail, not a continuation) ---\n') + chunk
    if chunk:
        try:
            # The re-attach path does not create this folder — only `launch`
            # does — so a supervisor that comes back after the run folder was
            # moved or cleaned would otherwise fail every append.
            os.makedirs(os.path.dirname(run.log_path), exist_ok=True)
            # newline='' — this is a byte-faithful MIRROR of the peer's log, and
            # the offset arithmetic below only holds if it stays one. Python's
            # text mode translates '\n' to os.linesep on write, so on Windows
            # every mirrored line grew by one byte: the local copy drifted from
            # the remote it is supposed to reproduce, and the cursor this
            # function returns stopped agreeing with the file it wrote.
            with open(run.log_path, 'a', encoding='utf-8', newline='') as fh:
                fh.write(chunk)
        except OSError:
            # Do NOT advance the cursor past bytes that were never written.
            # While it lived in a local variable this only lost the chunk until
            # the next restart; persisted, it would skip that stretch of the log
            # for good. Returning the old offset re-requests the same bytes on
            # the next poll, which costs one repeated read and self-heals the
            # moment the path is writable again.
            logger.warning('peer_training: could not append to %s', run.log_path)
            return offset
    nxt = (res or {}).get('offset')
    return int(nxt) if isinstance(nxt, int) else offset


def _mirror_samples(client, run: PeerTrainingRun, seen: set) -> None:
    """Copy new preview samples into the folder the Training panel reads.

    One more hop than it looks like it needs. ai-toolkit mirrors a remote run's
    samples into `<TRAINING_FOLDER>/<job>/samples`, which is this run's TOP
    folder; the panel reads `<top>/lora_<trigger>/samples`. Same one-level
    confusion as the checkpoints, on the other side of the boundary.

    Worth the hop rather than dropped: live samples are how a run that is going
    wrong shows it early, and without them a remote run is a step counter.
    `seen` is the watcher's own set — a sample is fetched once, not on every
    five-second poll.
    """
    dest_dir = json.loads(run.train_params or '{}').get('samples_dir') or ''
    if not dest_dir:
        return
    try:
        remote_paths = client.get_samples(run.remote_job_id) or []
    except Exception:      # noqa: BLE001 — a missed sample is never fatal
        return
    for remote_path in remote_paths:
        name = os.path.basename(str(remote_path))
        if not name or name in seen:
            continue
        dest = os.path.join(dest_dir, name)
        seen.add(name)
        if os.path.exists(dest):
            continue
        try:
            os.makedirs(dest_dir, exist_ok=True)
            client.download_sample(str(remote_path), dest)
        except Exception:      # noqa: BLE001
            seen.discard(name)          # retry it on the next poll
            logger.debug('peer_training: sample %s not copied yet', name, exc_info=True)
            return


def _weights_dir(run: PeerTrainingRun) -> str:
    """The folder a LOCAL run's checkpoints land in, for this run.

    **Not the log's folder.** `_run_log_path` is the run's TOP folder;
    ai-toolkit saves into `<top>/lora_<trigger>` beneath it, and that save_root
    is what the checkpoint browser, Test Studio and the lineage scan. Deriving
    this from `os.path.dirname(run.log_path)` — the first version — put every
    mirrored checkpoint one level too high, where nothing looks, so a finished
    run would have read as "done, no checkpoints". `lora_training` carries a
    comment about this exact confusion: two different folders were both being
    called "the run folder" at nine call sites.

    Resolved at launch and stored, rather than recomputed here, because it
    depends on the base/family/variant THAT run was started with — values a
    later dataset edit can change.
    """
    return str(json.loads(run.train_params or '{}').get('save_root') or '')


def _fetch_checkpoints(client, run: PeerTrainingRun) -> None:
    """Bring the weights home, into the run folder the local path would use."""
    dest_dir = _weights_dir(run)
    if not dest_dir:
        _set(run, phase_detail=f'Trained on {run.machine_label}, but this run '
                               'has no local folder recorded — the weights are '
                               'still on that machine.')
        return
    try:
        files = client.list_files(run.remote_job_id) or []
    except Exception as e:      # noqa: BLE001
        _set(run, phase_detail=f'Trained on {run.machine_label}, but the file '
                               f'list could not be read: {e}')
        return
    # Guarded: this is the one statement in the whole terminal path that could
    # raise AFTER the run has been declared finished, and `_supervise`'s
    # catch-all would then have rewritten a completed run as a failed one.
    # A destination that cannot be made is a copy-back problem — reported, with
    # the weights still safe on the machine that trained them.
    try:
        os.makedirs(dest_dir, exist_ok=True)
    except OSError as e:
        _set(run, phase_detail=f'Trained on {run.machine_label}, but the local '
                               f'folder could not be created ({e}) — the '
                               'weights are still on that machine.')
        return
    weights = [f for f in files
               if isinstance(f, dict) and str(f.get('path', '')).endswith('.safetensors')]
    for i, entry in enumerate(weights, 1):
        name = os.path.basename(str(entry['path']))
        dest = os.path.join(dest_dir, name)
        if os.path.exists(dest):
            continue
        _set(run, phase_detail=f'Fetching {name} ({i}/{len(weights)})…')
        try:
            # `expected_size` is what makes a SHORT download a failure instead
            # of a finished one. Without it `_download` treats "the stream
            # ended without raising" as completion — right for a sample, wrong
            # for a checkpoint: a transport that re-frames the response with
            # connection-close (a proxy, a tunnel) ends a truncated stream
            # cleanly, and the partial `.part` was then renamed onto the final
            # `.safetensors`. Nothing distinguished it from a good file until
            # something tried to load it, and the run still said "Done. Weights
            # copied". The true size is already on the wire — `/api/jobs/<id>/
            # files` returns it for every entry — so this costs one argument
            # and turns a short read into just another resume point.
            client.download_public_file(str(entry['path']), dest,
                                        expected_size=entry.get('size'))
        except Exception as e:      # noqa: BLE001
            # Reported, but never turned into a failed run: the training itself
            # succeeded and the weights are still on that machine.
            _set(run, phase_detail=f'Trained on {run.machine_label}, but {name} '
                                   f'could not be copied back: {e}')
            return
    _set(run, phase_detail=f'Done. Weights copied from {run.machine_label}.')
