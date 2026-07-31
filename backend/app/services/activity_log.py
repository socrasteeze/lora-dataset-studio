"""One place that answers "what is this app doing right now, and is it stuck?"

WHY
---
Every long-running thing in LDS already has a progress bar, and every bar lives
on the page that owns it: a bank pass on that bank, a caption batch on that
dataset, training on the Runs page, the GPU flags nowhere at all. So the only
way to find out whether anything is moving is to go and look, page by page — and
the question people actually have ("is it stuck?") is exactly the one a
percentage cannot answer, because a bar frozen at 34% and a bar that will move
again in two seconds are drawn identically.

Owner request, after a cancelled pass left the GPU flag set: *"a verbose log
similar to how ComfyUI handles queued jobs, so I can actually see a full log of
what's going on… I'd like to see verbose logging so I can see if it's stuck or
not having to switch between pages."*

WHAT IT IS
----------
A bounded in-memory ring of timestamped events, appended by the code that
already knows (bank_jobs, dataset_activity, bank_queue, the GPU window), plus a
LIVE snapshot of everything currently running with the age of its last update.

That last part is the answer to "is it stuck". A pass that reported 12 minutes
ago is stuck whatever its bar says; a pass that reported two seconds ago is
fine at 3%.

WHAT IT IS NOT
--------------
* **Not the server log.** Settings ▸ Maintenance already tails that, and it is a
  developer artefact — Flask lines, tracebacks, request noise. This is the
  app's own account of its work, in the vocabulary of the UI.
* **Not persisted.** It dies with the process, like bank_jobs and bank_queue,
  because it describes work that also dies with the process. A restart with a
  full log of jobs that are no longer running would be a lie.
* **Never load-bearing.** Nothing reads this to make a decision. Recording is
  wrapped so a logging bug can never take down the pass it is describing —
  the one thing worse than no visibility is visibility that breaks the work.
"""
import threading
import time
from collections import deque

# ~1000 events is minutes of a chatty pipeline and costs a few hundred KB. The
# ring is bounded rather than trimmed on read: an unbounded log on a machine
# left running overnight is a memory leak with a progress bar.
_MAX_EVENTS = 1000

_lock = threading.Lock()
_events: deque = deque(maxlen=_MAX_EVENTS)
_seq = [0]

# Levels are the UI's, not logging's: they decide colour and filtering, and they
# have to distinguish "this pass declined for a stated reason" from "this pass
# failed", because that is the distinction the pipeline verdict rests on too.
LEVELS = ('info', 'ok', 'warn', 'error')


def record(source, message, level='info', bank_id=None, dataset_id=None,
           detail=None, device=None):
    """Append one event. Never raises — see the module note.

    ``device``: the human NAME of the machine that did the work when it was not
    this one ("Laptop 4090"), else None. A pass that ran on a compute peer read
    identically to a local one before this — same 'score started', same
    'finished' — which made a remote run indistinguishable from a local one in
    the only place the app narrates itself. Deliberately the name and never the
    device uuid: this log is what a user pastes into a bug report.
    """
    event = None
    try:
        if level not in LEVELS:
            level = 'info'
        with _lock:
            _seq[0] += 1
            event = {
                'id': _seq[0],
                'at': time.time(),
                'source': str(source),
                'message': str(message),
                'level': level,
                'bank_id': bank_id,
                'dataset_id': dataset_id,
                'detail': str(detail) if detail is not None else None,
                'device': str(device) if device else None,
            }
            _events.append(event)
    except Exception:      # noqa: BLE001 — logging must never break the work
        return
    # Console is a second consumer of the same event — never load-bearing.
    if event is not None:
        try:
            from . import activity_console
            activity_console.on_record(event)
        except Exception:  # noqa: BLE001
            pass


def events(since=None, limit=200) -> list:
    """Events newer than ``since`` (an event id), oldest first.

    Cursor-based on purpose: the panel polls, and a client that asked "give me
    the last 200" every two seconds would redraw the whole list every time and
    lose the user's scroll position mid-read."""
    try:
        limit = max(1, min(int(limit), _MAX_EVENTS))
    except (TypeError, ValueError):
        limit = 200
    with _lock:
        rows = list(_events)
    if since is not None:
        try:
            since = int(since)
            rows = [e for e in rows if e['id'] > since]
        except (TypeError, ValueError):
            pass
    return rows[-limit:]


def reset():
    """Test helper: forget everything."""
    with _lock:
        _events.clear()
        _seq[0] = 0


def snapshot(user_id) -> dict:
    """Everything running right now, with the age of each one's last update.

    ``stale_seconds`` is the whole point: a bar frozen at 34% and a bar that
    will move again in two seconds look identical, and only the age tells them
    apart. The UI decides what counts as worrying; this reports the number.
    """
    from ..job_queue import queue_manager
    from . import bank_jobs, bank_queue, dataset_activity
    now = time.time()
    running = []

    # --- bank passes ---------------------------------------------------------
    try:
        from ..models import ImageBank
        names = {}
        try:
            names = {b.id: b.name for b in
                     ImageBank.query.filter_by(user_id=user_id)
                     .with_entities(ImageBank.id, ImageBank.name).all()}
        except Exception:      # noqa: BLE001 — a DB hiccup must not empty the panel
            pass
        for bank_id in bank_jobs.live_bank_ids():
            snap = bank_jobs.get(bank_id)
            if not snap:
                continue
            running.append({
                'kind': 'bank',
                'label': names.get(bank_id, f'Bank #{bank_id}'),
                'what': snap.get('kind'),
                'done': snap.get('done'), 'total': snap.get('total'),
                'detail': snap.get('detail'),
                'started_at': snap.get('started_at'),
                'stale_seconds': _age(bank_jobs, bank_id, now),
                'bank_id': bank_id,
                # None for a local pass; the peer's name when the work is
                # happening on another machine (which is also why a stale age
                # here is not the same worry — nothing local is hung).
                'device': snap.get('device'),
            })
    except Exception:      # noqa: BLE001
        pass

    # --- work this machine is doing FOR a Primary ----------------------------
    # A peer's panel used to say "nothing is running" while its own header chip
    # said "Working for Primary" and its log carried "claimed a infer" — because
    # `running[]` was assembled purely from bank_jobs/dataset_activity, and a
    # peer's work lives in peer_worker, which owns neither. The two halves of
    # the same UI contradicted each other, and the one that said idle was wrong.
    try:
        from .peer_worker import peer_worker      # the singleton, not the module
        peer = peer_worker.status()
        if peer.get('busy'):
            running.append({
                'kind': 'peer',
                'label': 'Working for the Primary',
                'what': peer.get('current_kind') or 'job',
                'done': None, 'total': None,
                # The phase is all a peer can honestly say: the counts belong to
                # the hub, which owns the pass. Naming the phase still separates
                # "downloading" from "running the model" from a real hang.
                'detail': peer.get('phase') or 'running',
                # peer_worker tracks no start time, and inventing one would make
                # the panel's age column lie.
                'started_at': None,
                'stale_seconds': None,
                'job_id': peer.get('current_job_id'),
            })
    except Exception:      # noqa: BLE001 — never empty the panel over this
        pass

    # --- dataset batches -----------------------------------------------------
    try:
        from ..models import FaceDataset
        for dsid in dataset_activity.active_dataset_ids():
            act = dataset_activity.get(dsid)
            if not act:
                continue
            name = None
            try:
                row = FaceDataset.query.filter_by(id=dsid, user_id=user_id).first()
                name = row.name if row else None
            except Exception:      # noqa: BLE001
                pass
            running.append({
                'kind': 'dataset',
                'label': name or f'Dataset #{dsid}',
                'what': act.get('kind'),
                'done': act.get('done'), 'total': act.get('total'),
                'detail': act.get('detail'),
                'started_at': act.get('started_at'),
                'stale_seconds': None,   # dataset_activity has no public touch time
                'dataset_id': dsid,
            })
    except Exception:      # noqa: BLE001
        pass

    # --- the GPU gate, named ------------------------------------------------
    # In the panel this is the line that explains a refusal, so it is reported
    # whether or not anything is running — a flag with nothing behind it is the
    # single most confusing state this app produces.
    gpu = {}
    try:
        for key in ('training_in_progress', 'vision_in_progress'):
            gpu[key] = bool(queue_manager._get_system_state(key))
    except Exception:      # noqa: BLE001
        gpu = {}

    try:
        queue = bank_queue.snapshot()
    except Exception:      # noqa: BLE001
        queue = {'running_bank_id': None, 'items': []}

    return {'running': running, 'gpu_flags': gpu, 'bank_queue': queue,
            'now': now}


def _age(bank_jobs, bank_id, now):
    """Seconds since this bank's job last reported anything, or None."""
    try:
        with bank_jobs._lock:
            job = bank_jobs._jobs.get(bank_id)
            touched = job['_touched'] if job else None
        return round(now - touched, 1) if touched else None
    except Exception:      # noqa: BLE001
        return None
