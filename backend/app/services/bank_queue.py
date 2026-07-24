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
import threading
import time

_lock = threading.Lock()
_queue: list = []              # ordered list of entries (see enqueue())
_worker_lock = threading.Lock()
_worker: threading.Thread | None = None

# How often the worker re-checks whether the next bank can start (GPU free /
# bank idle). Module-level so tests can drop it to 0 for a synchronous drain.
_POLL_SECONDS = 2.0


class BankAlreadyQueued(Exception):
    """This bank already has a pending/running entry in the queue."""
    def __init__(self, bank_id):
        super().__init__(f'bank {bank_id} is already queued')
        self.bank_id = bank_id


def _find(bank_id):
    """The live entry for a bank (pending or running), or None. Caller holds _lock."""
    for e in _queue:
        if e['bank_id'] == bank_id:
            return e
    return None


def enqueue(app, user_id, bank_id, steps=None, reject_flags=None,
            resolve_dups=False):
    """Add a bank's Launch-all run to the queue. One live entry per bank —
    raises BankAlreadyQueued otherwise, ValueError on an empty step list.
    Returns the queue position (1-based)."""
    from . import image_bank_service as banks
    steps = banks._sanitize_pipeline_steps(steps)
    if not steps:
        raise ValueError('no pipeline steps selected')
    reject_flags = [f for f in (reject_flags or [])
                    if f in banks.PIPELINE_REJECT_FLAGS]
    with _lock:
        if _find(bank_id) is not None:
            raise BankAlreadyQueued(bank_id)
        entry = {'bank_id': bank_id, 'user_id': user_id, 'steps': list(steps),
                 'reject_flags': reject_flags, 'resolve_dups': bool(resolve_dups),
                 'enqueued_at': time.time(), 'state': 'pending'}
        _queue.append(entry)
        position = len(_queue)
    # Under TESTING every bank_jobs job runs INLINE, so drain the whole queue
    # synchronously here (no worker thread) — same inline-vs-thread split as
    # bank_jobs, and it keeps the test suite deterministic.
    if app.config.get('TESTING'):
        _drain(app)
    else:
        _ensure_worker(app)
    return position


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
    while True:
        with _lock:
            if _find(bank_id) is not entry:
                return True                      # cancelled while waiting
        if not bank_jobs.running(bank_id) and banks._gpu_busy_reason() is None:
            break
        time.sleep(_POLL_SECONDS)

    with _lock:
        if _find(bank_id) is not entry:
            return True                          # cancelled at the last moment
        entry['state'] = 'running'

    try:
        banks.start_pipeline(app, entry['user_id'], bank_id, entry['steps'],
                             entry['reject_flags'], entry['resolve_dups'])
    except bank_jobs.BankJobBusy:
        # A manual launch grabbed the slot between our check and here — back to
        # pending and let the next loop wait for it to clear.
        with _lock:
            if _find(bank_id) is entry:
                entry['state'] = 'pending'
        time.sleep(_POLL_SECONDS)
        return True
    except (ValueError, RuntimeError):
        # Bank gone / prerequisite failed at launch: drop it and move on.
        _remove(bank_id)
        return True

    # Wait for the pipeline to finish before starting the next bank.
    while bank_jobs.running(bank_id):
        time.sleep(_POLL_SECONDS)
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
    return n


def snapshot() -> dict:
    """{running_bank_id, items:[{bank_id, state, position, steps, reject_flags,
    resolve_dups, enqueued_at}]} — position is 1-based over the whole queue."""
    with _lock:
        items = [{'bank_id': e['bank_id'], 'state': e['state'], 'position': i + 1,
                  'steps': list(e['steps']), 'reject_flags': list(e['reject_flags']),
                  'resolve_dups': e['resolve_dups'], 'enqueued_at': e['enqueued_at']}
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
