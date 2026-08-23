"""Cross-bank pipeline queue — run several banks' "Launch all" back-to-back.

A single bank already serializes its own passes (bank_jobs, one live job per
bank) and the heavy GPU passes are globally exclusive (gpu_window). What was
missing is a way to LINE UP several banks and walk away: today a second bank's
GPU pass launched while another is running is simply rejected (503), not queued.

This module is that queue. A module-level FIFO holds "run this bank's pipeline"
requests; ONE WORKER PER MACHINE drains it, starting each bank's pipeline only
once the bank has no live job AND (locally) the GPU is free — so a queued bank
WAITS its turn instead of being turned away. Each run reuses the existing
``image_bank_service.start_pipeline`` verbatim, so per-bank progress, the Stop
button and the pipeline report all behave exactly as a direct launch.

**One lane per device.** This machine is one lane and stays strictly serial:
two local banks never overlap, exactly as before. Each distinct compute peer
gets its own lane, so a bank sent there runs ALONGSIDE local work rather than
behind it — which is the entire point of having a second machine, and was not
true while a single thread drained everything. One lane per peer and no more,
because a peer pulls one job at a time (peer_worker): two lanes aimed at one
peer would not run in parallel, they would queue over there, out of sight of
this queue's own reporting.

**A merged group is one unit.** Its members are queued as N independent entries
(the routes expand it with bank_groups.member_ids), but the user sees ONE card —
so the lanes must never work two of them at once, or that card would show two
conflicting states. See _unit_of.

**The queue SURVIVES a restart.** It used to be in-memory only, and this
docstring used to defend that: committed scores stay, so a re-run only pays for
what is missing. That describes the cost of a re-run somebody knows to start. It
does not cover the actual failure, which was silence — eleven banks queued
overnight, a reboot for an update, and by morning an empty panel with no row, no
log line and no report saying anything had been dropped.

So every mutation is now mirrored into ``BankQueueEntry`` and the FIFO is
rebuilt from it at boot (see ``restore``). The list stays the working copy and
the table is the record: the lane, unit and atomic-claim logic below is
intricate and well covered, and moving the queue itself into SQL would have
rewritten all of it to fix a durability bug. Same shape the sibling
dataset-manager project uses for its own cancel flag, for the same reason —
state that must outlive the process cannot live in the process.

Same contract as ``bank_jobs``:
* **Thread-safe** — one module lock guards the FIFO; a second lock guards the
  single-worker invariant.
* Finished entries are dropped from the FIFO (the running bank's live progress
  is shown by its own bank_jobs snapshot); the queue only ever lists what is
  still pending or currently running.
* A durable write that fails is logged and swallowed — the record is worth
  having, it is not worth failing a launch for. Same call this module already
  makes for its activity-log mirror.
"""
import json
import logging
import threading
import time

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_queue: list = []              # ordered list of entries (see enqueue())
_worker_lock = threading.Lock()
# One worker per LANE, keyed by lane id — see _lane_of. There used to be exactly
# one, which is why a bank sent to a peer sat behind local work: the remote entry
# already skipped the local-GPU gate, but it still had to wait for the single
# thread, so renting the second machine bought nothing in wall-clock.
_workers: dict = {}

# The lane the current worker serves. A thread-local rather than an argument so
# _process_next(app) stays a one-arg module-level callable — four test files stub
# it and two call it directly on a bare thread. Unset (the TESTING inline drain,
# which has no worker thread) means "any lane".
_current = threading.local()

_LOCAL_LANE = 'local'

# How often the worker re-checks whether the next bank can start (GPU free /
# bank idle). Module-level so tests can drop it to 0 for a synchronous drain.
_POLL_SECONDS = 2.0


# ── the durable half ─────────────────────────────────────────────────────────
#
# Three calls, all best-effort. A failure here loses the restart-resume for one
# entry; it must never lose the entry itself, which is why each one swallows and
# logs rather than raising into a launch the user is waiting on.

#: The app to write with. `cancel`, `clear` and `_remove` take no `app` argument
#: — they are called from routes, from the worker thread and from tests — so the
#: reference is kept from whoever last enqueued or restored. A module global
#: rather than a parameter because adding one to those three would change three
#: public signatures to fix a bookkeeping detail.
_app_ref = None


def _app_context():
    """An app context to write in, reusing the caller's when there is one."""
    import contextlib

    from flask import has_app_context
    if has_app_context():
        return contextlib.nullcontext()
    if _app_ref is None:
        raise RuntimeError('bank_queue has no app to write with')
    return _app_ref.app_context()


def _persist_add(entry) -> None:
    """Write a new entry's row and stash its id on the in-memory entry."""
    from ..extensions import db
    from ..models import BankQueueEntry
    from ..utils.dbbusy import write_with_retry
    row = BankQueueEntry(
        bank_id=entry['bank_id'], user_id=str(entry['user_id']),
        steps=json.dumps(list(entry['steps'])),
        reject_flags=json.dumps(list(entry['reject_flags'])),
        resolve_dups=bool(entry['resolve_dups']),
        device_id=entry.get('device_id'), group_key=entry.get('group_key'),
        enqueued_at=float(entry['enqueued_at']))
    write_with_retry(lambda: db.session.add(row))
    entry['row_id'] = row.id


def _persist_remove(bank_ids) -> None:
    """Drop the rows for these banks. Keyed on bank_id rather than on the
    stashed row id, so an entry whose insert failed still cleans up, and so a
    row left by a crash mid-`_remove` cannot resurrect the bank at the next
    boot."""
    if not bank_ids:
        return
    from ..models import BankQueueEntry
    from ..utils.dbbusy import write_with_retry
    write_with_retry(lambda: BankQueueEntry.query
                     .filter(BankQueueEntry.bank_id.in_(list(bank_ids)))
                     .delete(synchronize_session=False))


def _safely(what, fn, *args) -> None:
    try:
        with _app_context():
            fn(*args)
    except Exception:      # noqa: BLE001
        logger.warning('bank_queue: could not %s durably — the queue still '
                       'works, but it will not survive a restart', what,
                       exc_info=True)


def restore(app) -> int:
    """Rebuild the FIFO from the table at boot. Returns how many came back.

    An entry that was RUNNING comes back pending: the pipeline running it died
    with the process, so nothing is running any more. Leaving it 'running' would
    park its lane behind a job that can never finish — the same shape as a peer
    job a dead peer left claimed forever, which this project has already paid
    for once. Re-running a partly-done bank is cheap by design: committed scores
    stay, so it only pays for what is missing.
    """
    from ..models import BankQueueEntry
    global _app_ref
    _app_ref = app
    with app.app_context():
        try:
            rows = BankQueueEntry.query.order_by(BankQueueEntry.id.asc()).all()
        except Exception:      # noqa: BLE001 — a missing table must not stop boot
            logger.warning('bank_queue: could not read the stored queue', exc_info=True)
            return 0
        restored, seen = [], set()
        for row in rows:
            if row.bank_id in seen:
                # Only reachable if a delete failed. Two entries for one bank
                # would run it twice; keep the earliest and drop the rest.
                continue
            seen.add(row.bank_id)
            restored.append({
                'bank_id': row.bank_id, 'user_id': row.user_id,
                'steps': json.loads(row.steps or '[]'),
                'reject_flags': json.loads(row.reject_flags or '[]'),
                'resolve_dups': bool(row.resolve_dups),
                'device_id': row.device_id, 'group_key': row.group_key,
                'enqueued_at': row.enqueued_at or time.time(),
                'state': 'pending', 'row_id': row.id})
    if not restored:
        return 0
    with _lock:
        # `restore` is idempotent: a second call must not double the queue, or
        # every bank in it would run twice.
        here = {e['bank_id'] for e in _queue}
        added = [e for e in restored if e['bank_id'] not in here]
        _queue.extend(added)
    if added:
        logger.info('bank_queue: restored %s queued bank(s) after a restart',
                    len(added))
        _log(None, 'queue restored after a restart', 'info',
             detail=f'{len(added)} bank(s)')
        if not app.config.get('TESTING'):
            _ensure_worker(app)
    return len(added)


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


def _device_label(device_id):
    """A peer's display name, or None for this machine. Never fatal — a queue
    that cannot name a device must still list it."""
    if not device_id:
        return None
    try:
        from . import cluster as cluster_svc
        return cluster_svc.device_label(device_id)
    except Exception:      # noqa: BLE001
        return None


def _group_key_of(user_id, bank_id):
    """The merged-group key for a bank, or None. Never fatal: a queue that
    cannot read the group must still queue the bank — it just loses the
    group-level exclusion for it, and a bank is always its own unit."""
    try:
        from ..models import ImageBank
        from . import bank_groups
        bank = ImageBank.query.filter_by(id=bank_id, user_id=user_id).first()
        return bank_groups.group_key(bank)
    except Exception:      # noqa: BLE001
        logger.debug('bank_queue: could not read the group key', exc_info=True)
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
    # Read the group BEFORE _lock: _claim_next runs under that lock and must
    # never issue a query there. The cost is that a rename between enqueueing
    # and running is not seen — the group rule then treats the bank as its own
    # unit, which is the safe direction (it can only ever run alone).
    group_key = _group_key_of(user_id, bank_id)
    device_id = _normalized_device(device_id)
    global _app_ref
    _app_ref = app
    if device_id:
        banks._remote_pass_device(device_id)      # raises ValueError on a backend id
        # …and the picked PASSES against that machine, not just the id. A peer
        # that reported no scoring stack used to accept a run with ✨ Score in
        # it and fail an hour later, mid-pipeline.
        banks.refuse_steps_for_device(device_id, steps)
    with _lock:
        if _find(bank_id) is not None:
            raise BankAlreadyQueued(bank_id)
        entry = {'bank_id': bank_id, 'user_id': user_id, 'steps': list(steps),
                 'reject_flags': reject_flags, 'resolve_dups': bool(resolve_dups),
                 'device_id': device_id,
                 # Which merged group this bank belongs to, so the lanes cannot
                 # split one card across two machines. Server-derived, never
                 # client-supplied — the same rule bank_groups.member_ids
                 # documents for the queue and promote routes.
                 'group_key': group_key,
                 'enqueued_at': time.time(), 'state': 'pending'}
        _queue.append(entry)
        position = len(_queue)
    # Outside _lock: this touches the database, and _claim_next runs under that
    # same lock — a query there is what the group-key comment above already
    # warns about.
    _safely('record the queued bank', _persist_add, entry)
    # …which opens a window. A worker left alive by an EARLIER enqueue can claim,
    # run and remove this entry while the row is being written: `_remove`'s
    # delete then finds no row yet, the insert lands after it, and the next boot
    # re-runs a bank that already finished. Microseconds wide and never
    # observed — closed rather than documented because the failure is invisible,
    # the bank simply runs again one morning.
    with _lock:
        still_queued = _find(bank_id) is entry
    if not still_queued:
        _safely('forget the already-finished bank', _persist_remove, [bank_id])
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
                 resolve_dups=False, device_id=None, skip_completed=True) -> dict:
    """Queue several banks in one call — the "queue all" primitive.

    Returns {'queued': [{bank_id, position}], 'skipped': [{bank_id, reason}]}.

    The step list and reject flags are sanitized ONCE up front and raise BEFORE
    anything is enqueued: a half-queued 400 is the worst outcome available here,
    because the user cannot tell which banks made it in. Everything after that
    point is per-bank and never aborts the batch — a bank already in the queue is
    skipped by name, not treated as a failure of the whole request.

    No queue-engine change: this loops the same enqueue(). Queueing twelve
    banks is twelve entries, not twelve concurrent runs — they still drain one
    at a time per machine, and everything aimed at this machine is one lane.
    """
    from . import image_bank_service as banks
    steps = banks._sanitize_pipeline_steps(steps)
    if not steps:
        raise ValueError('no pipeline steps selected')
    flags = [f for f in (reject_flags or []) if f in banks.PIPELINE_REJECT_FLAGS]

    # Per bank, narrow to the passes that still have something to do. Queueing
    # twelve banks to re-run a caption pass that finished last night is the
    # expensive kind of no-op: it looks like progress for hours.
    coverage = banks.bank_pass_coverage(user_id, bank_ids) if skip_completed else {}

    queued, skipped = [], []
    for bank_id in bank_ids:
        bank_steps = (banks.steps_with_pending_work(coverage.get(bank_id), steps)
                      if skip_completed else steps)
        if not bank_steps:
            skipped.append({'bank_id': bank_id,
                            'reason': 'all selected passes already done'})
            continue
        try:
            position = enqueue(app, user_id, bank_id, steps=bank_steps,
                               reject_flags=flags, resolve_dups=resolve_dups,
                               device_id=device_id)
            queued.append({'bank_id': bank_id, 'position': position})
        except BankAlreadyQueued:
            skipped.append({'bank_id': bank_id, 'reason': 'already queued'})
        except ValueError as e:
            # Cannot be the step list (sanitized above), so it is bank-specific.
            skipped.append({'bank_id': bank_id, 'reason': str(e)})
    return {'queued': queued, 'skipped': skipped}


def _lane_of(entry) -> str:
    """Which machine's lane this entry belongs to.

    Derived, never stored: ``device_id`` is already folded to None for every
    spelling of "this machine" by _normalized_device, so there is no new entry
    key and the hand-built entry dicts in the tests keep working untouched.
    """
    return entry.get('device_id') or _LOCAL_LANE


def _unit_of(entry) -> str:
    """The thing that may only be worked by one machine at a time.

    A merged group is presented to the user as ONE card, so its members must
    never run on two machines at once — the card would show two conflicting
    states. Members are queued as N independent entries (routes/bank.py expands
    the group with bank_groups.member_ids), so without this the lanes would
    happily split them. An ungrouped bank is a group of one, which is why this
    is a key and not a special case.
    """
    key = entry.get('group_key')
    return f'group:{key}' if key else f'bank:{entry["bank_id"]}'


def _ensure_worker(app):
    """Start a worker for every lane that has work and no live thread."""
    with _worker_lock:
        for lane in {_lane_of(e) for e in list(_queue)}:
            live = _workers.get(lane)
            if live is not None and live.is_alive():
                continue
            t = threading.Thread(target=_worker_loop, args=(app, lane),
                                 name=f'bank-queue:{lane}', daemon=True)
            _workers[lane] = t
            t.start()


def _worker_loop(app, lane):
    _current.lane = lane
    with app.app_context():
        _drain(app)


def _drain(app):
    """Process queued banks until none are left. The background worker runs this
    inside its own app context; the TESTING path runs it inline in the request's
    context (bank_jobs jobs run inline under TESTING, so this returns once the
    whole queue has been processed synchronously)."""
    while _process_next(app):
        pass


def _claim_next(lane=None):
    """Select AND claim the head runnable entry of ``lane``, or None.

    Selecting without claiming is what made the old single worker unsafe to
    duplicate: _next_pending returned an entry that stayed 'pending' for the
    whole wait loop, so two workers would get the SAME object, both pass the
    identity check, both set state='running', and the loser's BankJobBusy
    handler would reset it to 'pending' while the winner was running it.

    ``lane=None`` considers every lane — that is the TESTING inline drain, which
    has no worker thread and therefore no thread-local.

    Pure enough to test without threads: two calls in a row must never return
    the same entry.
    """
    with _lock:
        busy_lanes = {_lane_of(e) for e in _queue
                      if e['state'] == 'running' or e.get('claimed')}
        busy_units = {_unit_of(e) for e in _queue
                      if e['state'] == 'running' or e.get('claimed')}
        for e in _queue:
            if e['state'] != 'pending' or e.get('claimed'):
                continue
            if lane is not None and _lane_of(e) != lane:
                continue
            if _lane_of(e) in busy_lanes or _unit_of(e) in busy_units:
                continue
            e['claimed'] = True
            return e
    return None


def _lane_has_pending(lane) -> bool:
    """Does this lane have work it just cannot claim right now?"""
    with _lock:
        return any(e['state'] == 'pending' and not e.get('claimed')
                   and _lane_of(e) == lane for e in _queue)


def _process_next(app) -> bool:
    """Process exactly one queued bank end to end. Returns True if it handled an
    entry (so the loop should continue), False when nothing is left to do."""
    from . import bank_jobs
    from . import image_bank_service as banks
    lane = getattr(_current, 'lane', None)
    entry = _claim_next(lane)
    if entry is None:
        # A lane can have work it cannot start YET — another lane is holding
        # this merged group. Returning False here would end _drain and kill the
        # worker, and nothing would restart it when the group frees up. Only a
        # lane with nothing pending at all is actually done.
        if lane is not None and _lane_has_pending(lane):
            time.sleep(_POLL_SECONDS)
            return True
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
        # pending, claim RELEASED so the lane can pick it up again, and let the
        # next loop wait for it to clear.
        with _lock:
            if _find(bank_id) is entry:
                entry['state'] = 'pending'
                entry['claimed'] = False
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
        found = False
        for i, e in enumerate(_queue):
            if e['bank_id'] == bank_id:
                _queue.pop(i)
                found = True
                break
    if found:
        _safely('forget the finished bank', _persist_remove, [bank_id])
    return found


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
    _safely('forget the cancelled bank', _persist_remove, [bank_id])
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
        all_ids = [e['bank_id'] for e in _queue]
        n = len(_queue)
        _queue.clear()
    _safely('forget the cleared queue', _persist_remove, all_ids)
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
                  # The peer's NAME, so the panel can say where each bank runs
                  # without a second fetch — now that two lanes can be running
                  # at once, two identical "running" rows tell you nothing.
                  'device_label': _device_label(e.get('device_id')),
                  # Why this entry has not started yet, or None. The panel shows
                  # it so a stalled queue explains itself instead of looking dead.
                  'waiting_for': e.get('waiting_for')}
                 for i, e in enumerate(_queue)]
        running = [e['bank_id'] for e in _queue if e['state'] == 'running']
    # running_bank_id stays for every existing reader, but it can only name one
    # bank and there are now as many as there are machines — so publish the list
    # too, and let new readers use it.
    return {'running_bank_id': running[0] if running else None,
            'running_bank_ids': running, 'items': items}


def state_for(bank_id):
    """{state, position} for one bank, or None when it isn't queued — used to
    badge the bank cards on the list page."""
    with _lock:
        for i, e in enumerate(_queue):
            if e['bank_id'] == bank_id:
                return {'state': e['state'], 'position': i + 1}
    return None


def reset(durable=True):
    """Test helper: forget the whole queue (does not touch running threads).

    ``durable=False`` forgets only the in-memory half, which is exactly what a
    process restart does — the table is what a restart leaves behind. That is
    the seam `restore` is tested through.
    """
    with _lock:
        ids = [e['bank_id'] for e in _queue]
        _queue.clear()
    with _worker_lock:
        _workers.clear()
    if durable and ids:
        _safely('forget the reset queue', _persist_remove, ids)
