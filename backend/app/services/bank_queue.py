"""Cross-bank pipeline queue — run several banks' "Launch all" back-to-back.

A single bank already serializes its own passes (bank_jobs, one live job per
bank) and the heavy GPU passes are globally exclusive (gpu_window). What was
missing is a way to LINE UP several banks and walk away: today a second bank's
GPU pass launched while another is running is simply rejected (503), not queued.

This module is that queue. A module-level FIFO holds "run this bank's pipeline"
requests; ONE global worker thread drains it, starting each bank's pipeline only
once the bank has no live job AND the GPU is free — so a queued bank WAITS its
turn instead of being turned away. Each run reuses the existing
``image_bank_service.start_pipeline`` verbatim, so per-bank progress, the Stop
button and the pipeline report all behave exactly as a direct launch.

Same contract as ``bank_jobs``:
* **In-memory ONLY** — the queue dies with the process; a restart starts empty
  (raw scores already committed stay, so a re-run only pays for what's missing).
* **Thread-safe** — one module lock guards the FIFO; a second lock guards the
  single-worker invariant.
* Finished entries are dropped from the FIFO (the running bank's live progress
  is shown by its own bank_jobs snapshot); the queue only ever lists what is
  still pending or currently running.
"""
import logging
import threading
import time

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_queue: list = []              # ordered list of entries (see enqueue())
_worker_lock = threading.Lock()
_worker: threading.Thread | None = None

# How often the worker re-checks whether the next bank can start (GPU free /
# bank idle). Module-level so tests can drop it to 0 for a synchronous drain.
_POLL_SECONDS = 2.0


def _log(bank_id, message, level='info', detail=None):
    """Mirror a queue transition into the activity log. Lazy + swallowed."""
    try:
        from . import activity_log
        activity_log.record('queue', message, level=level,
                            bank_id=bank_id, detail=detail)
    except Exception:  # noqa: BLE001
        pass


class BankAlreadyQueued(Exception):
    """This bank already has a pending/running entry in the queue."""
    def __init__(self, bank_id):
        super().__init__(f'bank {bank_id} is already queued')
        self.bank_id = bank_id


def _normalized_device(device_id):
    """Fold every "this machine" spelling to None, ONCE, at the boundary.

    The Launch dialog sends the literal string 'local' (LaunchAllDialog.jsx),
    and `device_id or None` keeps that truthy — so the wait gate below read
    EVERY dialog-queued bank as remote and skipped the local-GPU wait. The bank
    then started while a pass held the card and its GPU steps were recorded
    "skipped — GPU busy", which is precisely the "I queued jobs and nothing ran"
    report. Every other module already normalizes; this one did not.
    """
    try:
        from . import cluster as cluster_svc
        d = cluster_svc.normalize_device_id(device_id)
        return None if d == cluster_svc.LOCAL_DEVICE_ID else d
    except Exception:      # noqa: BLE001 — an unreadable id is this machine
        return None


def _find(bank_id):
    """The live entry for a bank (pending or running), or None. Caller holds _lock."""
    for e in _queue:
        if e['bank_id'] == bank_id:
            return e
    return None


def enqueue(app, user_id, bank_id, steps=None, reject_flags=None,
            resolve_dups=False, device_id=None):
    """Add a bank's Launch-all run to the queue. One live entry per bank —
    raises BankAlreadyQueued otherwise, ValueError on an empty step list.
    Returns the queue position (1-based)."""
    from . import image_bank_service as banks
    steps = banks._sanitize_pipeline_steps(steps)
    if not steps:
        raise ValueError('no pipeline steps selected')
    reject_flags = [f for f in (reject_flags or [])
                    if f in banks.PIPELINE_REJECT_FLAGS]
    # Validate the device HERE, where the caller is still holding a response.
    # start_pipeline does this at launch time, so a direct Launch got an honest
    # 400 — but a QUEUE returned 202 with a position and then _process_next
    # dropped the entry with a log line and no toast. From the user's side the
    # row simply vanished from the panel. Same refusal, same wording, now at the
    # moment they can act on it.
    device_id = _normalized_device(device_id)
    if device_id:
        banks._remote_pass_device(device_id)      # raises ValueError on a backend id
    with _lock:
        if _find(bank_id) is not None:
            raise BankAlreadyQueued(bank_id)
        entry = {'bank_id': bank_id, 'user_id': user_id, 'steps': list(steps),
                 'reject_flags': reject_flags, 'resolve_dups': bool(resolve_dups),
                 'device_id': device_id,
                 'enqueued_at': time.time(), 'state': 'pending'}
        _queue.append(entry)
        position = len(_queue)
    _log(bank_id, 'bank queued', 'info', detail=f'position {position}')
    # Under TESTING every bank_jobs job runs INLINE, so drain the whole queue
    # synchronously here (no worker thread) — same inline-vs-thread split as
    # bank_jobs, and it keeps the test suite deterministic.
    if app.config.get('TESTING'):
        _drain(app)
    else:
        _ensure_worker(app)
    return position


def enqueue_many(app, user_id, bank_ids, steps=None, reject_flags=None,
                 resolve_dups=False, device_id=None) -> dict:
    """Queue several banks in one call — the "queue all" primitive.

    Returns {'queued': [{bank_id, position}], 'skipped': [{bank_id, reason}]}.

    The step list and reject flags are sanitized ONCE up front and raise BEFORE
    anything is enqueued: a half-queued 400 is the worst outcome available here,
    because the user cannot tell which banks made it in. Everything after that
    point is per-bank and never aborts the batch — a bank already in the queue is
    skipped by name, not treated as a failure of the whole request.

    No queue-engine change: this loops the same enqueue(), and _process_next
    still starts one bank at a time once the previous is done and the GPU is
    free. Queueing twelve banks is twelve entries, not twelve concurrent runs.
    """
    from . import image_bank_service as banks
    steps = banks._sanitize_pipeline_steps(steps)
    if not steps:
        raise ValueError('no pipeline steps selected')
    flags = [f for f in (reject_flags or []) if f in banks.PIPELINE_REJECT_FLAGS]

    queued, skipped = [], []
    for bank_id in bank_ids:
        try:
            position = enqueue(app, user_id, bank_id, steps=steps,
                               reject_flags=flags, resolve_dups=resolve_dups,
                               device_id=device_id)
            queued.append({'bank_id': bank_id, 'position': position})
        except BankAlreadyQueued:
            skipped.append({'bank_id': bank_id, 'reason': 'already queued'})
        except ValueError as e:
            # Cannot be the step list (sanitized above), so it is bank-specific.
            skipped.append({'bank_id': bank_id, 'reason': str(e)})
    return {'queued': queued, 'skipped': skipped}


def _ensure_worker(app):
    """Start the single global worker thread if it isn't already running."""
    global _worker
    with _worker_lock:
        if _worker is not None and _worker.is_alive():
            return
        _worker = threading.Thread(target=_worker_loop, args=(app,),
                                   name='bank-queue', daemon=True)
        _worker.start()


def _worker_loop(app):
    with app.app_context():
        _drain(app)


def _drain(app):
    """Process queued banks until none are left. The background worker runs this
    inside its own app context; the TESTING path runs it inline in the request's
    context (bank_jobs jobs run inline under TESTING, so this returns once the
    whole queue has been processed synchronously)."""
    while _process_next(app):
        pass


def _next_pending():
    """The head pending entry, or None. Caller holds _lock."""
    for e in _queue:
        if e['state'] == 'pending':
            return e
    return None


def _process_next(app) -> bool:
    """Process exactly one queued bank end to end. Returns True if it handled an
    entry (so the loop should continue), False when nothing is left to do."""
    from . import bank_jobs
    from . import image_bank_service as banks
    with _lock:
        entry = _next_pending()
        if entry is None:
            return False
        bank_id = entry['bank_id']

    # Wait until this bank has no live job AND the GPU is free. This is what lets
    # a queued bank wait its turn behind a manual launch or a training run,
    # rather than being rejected. Aborts early if the entry is cancelled.
    # This loop is unbounded on purpose — a queued bank waits its turn rather
    # than being rejected — but it used to wait in COMPLETE silence: no logger in
    # this module, no reason in the snapshot. A stuck vision/GPU flag therefore
    # froze the whole queue with nothing anywhere to say why, which reads exactly
    # like "it just doesn't queue". Say it once, and publish it.
    said = None
    while True:
        with _lock:
            if _find(bank_id) is not entry:
                entry['waiting_for'] = None
                return True                      # cancelled while waiting
        # A run aimed at a peer takes none of the LOCAL GPU — making it wait
        # for a local training to finish would forfeit the whole point of
        # renting the other machine. (The Score/Faces steps travel; the steps
        # that stay here are CPU work.)
        gpu_reason = None if entry.get('device_id') else banks._gpu_busy_reason()
        busy_here = bank_jobs.running(bank_id)
        if not busy_here and gpu_reason is None:
            break
        why = ('another pass is running on this bank' if busy_here
               else gpu_reason)
        if why != said:
            # Once per REASON, not once per 2 s tick: a queue waiting an hour
            # must not write 1800 identical lines.
            said = why
            with _lock:
                entry['waiting_for'] = why
            logger.info('bank_queue: bank %s is waiting — %s', bank_id, why)
        time.sleep(_POLL_SECONDS)
    if said is not None:
        logger.info('bank_queue: bank %s stopped waiting, starting now', bank_id)
    with _lock:
        entry['waiting_for'] = None

    with _lock:
        if _find(bank_id) is not entry:
            return True                          # cancelled at the last moment
        entry['state'] = 'running'
    _log(bank_id, 'pipeline starting', 'info',
         detail=', '.join(entry['steps']) if entry.get('steps') else None)

    try:
        banks.start_pipeline(app, entry['user_id'], bank_id, entry['steps'],
                             entry['reject_flags'], entry['resolve_dups'],
                             device_id=entry.get('device_id'))
    except bank_jobs.BankJobBusy:
        # A manual launch grabbed the slot between our check and here — back to
        # pending and let the next loop wait for it to clear.
        with _lock:
            if _find(bank_id) is entry:
                entry['state'] = 'pending'
        time.sleep(_POLL_SECONDS)
        return True
    except (ValueError, RuntimeError) as e:
        # Bank gone / prerequisite failed at launch: drop it and move on.
        _log(bank_id, 'queue entry dropped', 'error', detail=str(e))
        _remove(bank_id)
        return True

    # Wait for the pipeline to finish before starting the next bank.
    while bank_jobs.running(bank_id):
        time.sleep(_POLL_SECONDS)
    _log(bank_id, 'pipeline done, dequeued', 'ok')
    _remove(bank_id)
    return True


def _remove(bank_id) -> bool:
    with _lock:
        for i, e in enumerate(_queue):
            if e['bank_id'] == bank_id:
                _queue.pop(i)
                return True
    return False


def cancel(bank_id) -> bool:
    """Remove a bank from the queue. If it is the one currently running, also
    cancel its live pipeline so the worker advances. False when it wasn't queued."""
    from . import bank_jobs
    with _lock:
        entry = _find(bank_id)
        if entry is None:
            return False
        was_running = entry['state'] == 'running'
        _queue.remove(entry)
    if was_running:
        bank_jobs.cancel(bank_id)
        _log(bank_id, 'removed from queue (was running)', 'warn')
    else:
        _log(bank_id, 'removed from queue', 'warn')
    return True


def clear() -> int:
    """Drop every pending entry and cancel the running one. Returns how many
    entries were removed."""
    from . import bank_jobs
    with _lock:
        running_ids = [e['bank_id'] for e in _queue if e['state'] == 'running']
        n = len(_queue)
        _queue.clear()
    for bid in running_ids:
        bank_jobs.cancel(bid)
    if n:
        _log(None, 'queue cleared', 'warn', detail=f'{n} entr{"y" if n == 1 else "ies"}')
    return n


def snapshot() -> dict:
    """{running_bank_id, items:[{bank_id, state, position, steps, reject_flags,
    resolve_dups, enqueued_at, device_id, waiting_for}]} — position is 1-based
    over the whole queue."""
    with _lock:
        items = [{'bank_id': e['bank_id'], 'state': e['state'], 'position': i + 1,
                  'steps': list(e['steps']), 'reject_flags': list(e['reject_flags']),
                  'resolve_dups': e['resolve_dups'], 'enqueued_at': e['enqueued_at'],
                  'device_id': e.get('device_id'),
                  # Why this entry has not started yet, or None. The panel shows
                  # it so a stalled queue explains itself instead of looking dead.
                  'waiting_for': e.get('waiting_for')}
                 for i, e in enumerate(_queue)]
        running = next((e['bank_id'] for e in _queue if e['state'] == 'running'), None)
    return {'running_bank_id': running, 'items': items}


def state_for(bank_id):
    """{state, position} for one bank, or None when it isn't queued — used to
    badge the bank cards on the list page."""
    with _lock:
        for i, e in enumerate(_queue):
            if e['bank_id'] == bank_id:
                return {'state': e['state'], 'position': i + 1}
    return None


def reset():
    """Test helper: forget the whole queue (does not touch running threads)."""
    with _lock:
        _queue.clear()
