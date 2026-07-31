"""⏹ Stop everything — one action, and an honest per-target report.

WHY THIS EXISTS
---------------
`_gpu_busy_reason()` reads two system-state flags, `training_in_progress` and
`vision_in_progress`. Every bank GPU pass, every queued bank and every training
start is gated on them. They are set by processes that are expected to clear
them on the way out — and when one of those processes does not (ComfyUI gone, a
borrowed Python that never returned, a helper wedged on CUDA init), everything
afterwards refuses with a "GPU busy" that is not true.

The TTL does not save you. `gpu_exclusive_vision_window` re-arms its TTL from a
heartbeat for as long as the window is open, so a wedged-but-alive parent holds
the flag until the app is restarted, not for 30 minutes. "Restart the app" was
the only recovery, and it takes every other running thing down with it.

THE RULE THIS MODULE KEEPS
--------------------------
This fork already refuses to let Stop answer "ok" without proof: training's stop
verifies the PID is dead (`_wait_pid_dead`) and a generation cancel reports the
subset it could not confirm. A global stop that printed "done" while ComfyUI was
unreachable would throw that away. So every target reports its own outcome:

    idle          nothing was running
    stopped       confirmed stopped
    unconfirmed   asked to stop, could not be confirmed — say so, do not claim it
    failed        refused or errored; the reason is carried

and `training_in_progress` is NOT cleared when the trainer is verifiably still
alive. Clearing it there would be the exact lie the verification exists to
prevent.

Order matters, and it is the same order the individual stops use: cancel the
work first, ask ComfyUI and the trainer next, and clear the flags LAST — a flag
cleared first would let the job queue start the next thing on top of whatever is
still unwinding.
"""
import logging

logger = logging.getLogger(__name__)

# The two flags `_gpu_busy_reason()` reads. Named here so the recovery and the
# refusal can never drift apart.
GPU_FLAGS = ('training_in_progress', 'vision_in_progress')

# How long a cancelled bank pass is given to unwind before the flags are cleared
# anyway. Cancels are cooperative — the pass notices at its next item boundary —
# so a short settle turns "cancelled, flag still set" into "cancelled and clean"
# in the ordinary case. It is deliberately NOT a condition: a wedged pass is the
# reason this button exists, and refusing to clear because of it would make the
# button a no-op in exactly the situation it was built for.
_SETTLE_SECONDS = 3.0


def _target(name, state, detail=''):
    return {'name': name, 'state': state, 'detail': detail}


def _training_pid_alive() -> bool:
    from ..job_queue import queue_manager
    from . import lora_training
    pid = queue_manager._get_system_state('training_pid', None)
    return bool(pid) and lora_training._pid_alive(pid)


def gpu_flag_state() -> dict:
    """What the GPU gate currently believes, and whether anything backs it up.

    `stale` is the answer to the only question a user actually has when the app
    says "GPU busy" and nothing is running: is this real? It is True when a flag
    is set but no training process is alive and no bank pass is live.
    """
    from ..job_queue import queue_manager
    from . import bank_jobs, dataset_activity
    flags = {k: bool(queue_manager._get_system_state(k)) for k in GPU_FLAGS}
    live_banks = bank_jobs.live_bank_ids()
    live_datasets = dataset_activity.active_dataset_ids()
    training_alive = _training_pid_alive()
    return {
        'flags': flags,
        'any_set': any(flags.values()),
        'live_bank_ids': live_banks,
        'live_dataset_ids': live_datasets,
        'training_alive': training_alive,
        'stale': (any(flags.values()) and not live_banks
                  and not live_datasets and not training_alive),
    }


def clear_gpu_flags(force=False) -> dict:
    """Clear the stuck 'GPU busy' flags. The common case by far is that nothing
    is running and the flag is simply left over, so this is reachable on its own
    — from the refusal itself — and does NOT stop anything.

    Refuses (without `force`) while something real is running: clearing a flag a
    live pass owns would let a training run start on top of it. `force` exists
    for the wedge, and is what ⏹ Stop everything uses after its cancels.
    """
    from ..job_queue import queue_manager
    state = gpu_flag_state()
    if not state['any_set']:
        return {'cleared': [], 'held': [], 'detail': 'nothing was flagged'}
    if not force:
        if state['training_alive']:
            raise RuntimeError(
                'a training process is still alive — the GPU really is busy. '
                'Stop the training run first.')
        if state['live_bank_ids'] or state['live_dataset_ids']:
            raise RuntimeError(
                'a pass is still running — the GPU really is busy. Stop it first, '
                'or use ⏹ Stop everything.')
    cleared, held = [], []
    for key in GPU_FLAGS:
        if not state['flags'][key]:
            continue
        # The one flag never cleared over a live process: an alive trainer means
        # the GPU IS busy, and saying otherwise is how two runs end up on one card.
        if key == 'training_in_progress' and state['training_alive']:
            held.append({'key': key,
                         'reason': 'the training process is still alive'})
            continue
        queue_manager._set_system_state(key, None)
        cleared.append(key)
        logger.warning('global stop: cleared stale GPU flag %s', key)
    return {'cleared': cleared, 'held': held, 'detail': ''}


def stop_everything(app, user_id) -> dict:
    """Cancel every running job, ask ComfyUI and the trainer to stop, then clear
    the GPU flags. Returns {targets, cleared, held} — see the module note: every
    target says what really happened to it, and an unreachable one says so
    instead of being counted as stopped."""
    import time

    from . import bank_jobs, bank_queue, dataset_activity
    targets = []

    # 1. The bank queue, before the running pass — otherwise the worker simply
    #    starts the next bank the moment the current one is cancelled.
    try:
        n = bank_queue.clear()
        targets.append(_target(
            'Bank queue', 'stopped' if n else 'idle',
            f'{n} queued bank(s) dropped' if n else 'nothing queued'))
    except Exception as e:      # noqa: BLE001 — one broken target must not skip the rest
        targets.append(_target('Bank queue', 'failed', str(e)))

    # 2. Live bank passes (scan / score / faces / pipeline).
    try:
        live = bank_jobs.live_bank_ids()
        stopped = [bid for bid in live if bank_jobs.cancel(bid)]
        targets.append(_target(
            'Bank passes', 'stopped' if stopped else 'idle',
            f'{len(stopped)} pass(es) asked to stop' if stopped
            else 'nothing running'))
    except Exception as e:      # noqa: BLE001
        targets.append(_target('Bank passes', 'failed', str(e)))

    # 3. Dataset activities (captioning, improve, watermark…). Cooperative: the
    #    worker stops at its next item boundary, keeping what it wrote.
    try:
        ids = dataset_activity.active_dataset_ids()
        for dsid in ids:
            dataset_activity.request_cancel(dsid, dataset_activity.CANCELLABLE_KINDS)
            dataset_activity.request_cancel(dsid, dataset_activity.IMPROVE_KINDS)
        targets.append(_target(
            'Dataset batches', 'stopped' if ids else 'idle',
            f'{len(ids)} batch(es) asked to stop' if ids else 'nothing running'))
    except Exception as e:      # noqa: BLE001
        targets.append(_target('Dataset batches', 'failed', str(e)))

    # 4. In-flight generations. cancel_pending already reports what it could not
    #    prove — that honesty is carried through here rather than flattened into
    #    a success.
    #
    #    Upstream replaced its (cancelled, unconfirmed) tuple with a named
    #    recovery taxonomy, and this module is fork-only so nothing flagged the
    #    change: it merged with zero conflict markers and the old tuple unpack
    #    would have raised on the first Stop. The wording had to change too — the
    #    old text promised "their rows are gone either way", and the whole point
    #    of upstream's fix is that a card whose ComfyUI state cannot be proven is
    #    now KEPT, because dropping it orphaned the global recovery barrier and
    #    left every GPU action reporting busy with nothing left to recover.
    try:
        from . import face_dataset_service as ds
        cancelled = pending = restart_required = 0
        for dsid in _datasets_with_pending(user_id):
            r = ds.cancel_pending(user_id, dsid)
            cancelled += r.get('cancelled', 0)
            pending += r.get('recovery_pending', 0)
            restart_required += r.get('restart_required', 0)
        if not cancelled and not pending:
            targets.append(_target('Generations', 'idle', 'nothing in flight'))
        elif pending:
            detail = (f'{cancelled} cancelled, {pending} could not be confirmed '
                      'and were KEPT so you can stop them again')
            if restart_required:
                detail += (f' ({restart_required} need ComfyUI restarted and the '
                           'restart confirmed first)')
            targets.append(_target('Generations', 'unconfirmed', detail))
        else:
            targets.append(_target('Generations', 'stopped',
                                   f'{cancelled} cancelled'))
    except Exception as e:      # noqa: BLE001
        targets.append(_target('Generations', 'failed', str(e)))

    # 5. ComfyUI — free its VRAM. Unreachable is reported, never assumed stopped.
    try:
        from ..utils.comfyui import free_comfyui_vram
        ok = free_comfyui_vram()
        targets.append(_target(
            'ComfyUI', 'stopped' if ok else 'unconfirmed',
            'asked to unload its models' if ok
            else 'could not be reached — if it is running, its VRAM was not freed'))
    except Exception as e:      # noqa: BLE001
        targets.append(_target('ComfyUI', 'unconfirmed', str(e)))

    # 6. Training, through the existing VERIFIED path. A kill it cannot confirm
    #    raises, and that must stay a failure — it is also why the flag below is
    #    then held rather than cleared.
    try:
        from . import lora_training
        stopped = lora_training.stop_training()
        targets.append(_target(
            'Training', 'stopped' if stopped else 'idle',
            'training stopped and its queue emptied' if stopped
            else 'no training running'))
    except lora_training.TrainingStopVerificationError as e:
        targets.append(_target('Training', 'failed', str(e)))
    except Exception as e:      # noqa: BLE001
        targets.append(_target('Training', 'failed', str(e)))

    # 7. The flags, LAST. A short settle first, so the ordinary case (a pass that
    #    unwinds in a second) clears its own flag and this only mops up.
    if _SETTLE_SECONDS:
        deadline = time.monotonic() + _SETTLE_SECONDS
        while time.monotonic() < deadline:
            if not bank_jobs.live_bank_ids():
                break
            time.sleep(0.25)
    still_live = bank_jobs.live_bank_ids()
    flags = clear_gpu_flags(force=True)
    if still_live:
        targets.append(_target(
            'GPU flags', 'unconfirmed',
            f'{len(still_live)} pass(es) had not unwound yet — the flag was cleared '
            'anyway so the GPU is usable again'))
    return {'targets': targets, 'cleared': flags['cleared'], 'held': flags['held']}


def _datasets_with_pending(user_id) -> list:
    """Dataset ids with in-flight generation rows. Same shape cancel_pending
    looks for, asked once instead of per dataset."""
    from ..models import FaceDataset, FaceDatasetImage
    rows = (FaceDatasetImage.query
            .join(FaceDataset, FaceDataset.id == FaceDatasetImage.dataset_id)
            .filter(FaceDataset.user_id == str(user_id))
            .filter(FaceDatasetImage.status == 'pending')
            .filter(FaceDatasetImage.filename.is_(None))
            .with_entities(FaceDatasetImage.dataset_id).distinct().all())
    return [r[0] for r in rows]
