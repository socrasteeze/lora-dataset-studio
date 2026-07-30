"""In-memory background-job runner for the 🗃️ image bank.

Unlike dataset batches (dataset_activity), a bank pass runs over THOUSANDS of
files — holding the HTTP request open for its whole duration is not an option.
Each bank therefore gets at most ONE live background thread (scan / faces /
promote); the POST that starts it returns immediately and the UI polls the
bank payload, which embeds the job snapshot from here.

Same design contract as dataset_activity:
* **In-memory ONLY** — a job dies with the process; on restart the registry is
  empty and nothing phantom survives (raw scores already committed stay, so a
  re-run only pays for what's missing).
* **Thread-safe** — one module lock guards the store.
* **TTL-purged** — a finished snapshot is kept ~5 min so the UI can show the
  outcome, then purged on read; a running entry not touched for an hour is
  presumed dead and purged too (its thread would have to be truly stuck).
"""
import threading
import time

_lock = threading.Lock()
_jobs: dict = {}          # bank_id -> job dict (see start())
_FINISHED_TTL = 5 * 60    # finished snapshot lifetime
_STALE_TTL = 60 * 60      # running job with no progress for this long = dead


def _log(bank_id, message, level='info', detail=None, device=None):
    """Mirror a job transition into the activity log. Imported lazily and
    swallowed whole: the log is never allowed to break the work it describes.

    ``device`` = the peer's NAME when this pass ran there, so the panel can say
    WHERE the work happened instead of narrating a remote run in words
    indistinguishable from a local one."""
    try:
        from . import activity_log
        activity_log.record('bank', message, level=level, bank_id=bank_id,
                            detail=detail, device=device)
    except Exception:      # noqa: BLE001
        pass


class BankJobBusy(Exception):
    """Another job is already running on this bank."""
    def __init__(self, kind):
        super().__init__(f'a {kind} job is already running on this bank')
        self.kind = kind


def start(app, bank_id, kind, fn, total=0, device_label=None):
    """Run ``fn(job)`` in a daemon thread under an app context. One live job
    per bank — raises BankJobBusy otherwise. ``fn`` reports through
    ``progress``/``bump`` and should poll ``cancelled(job)`` between items.

    ``device_label``: the NAME of the compute peer running this pass, or None
    for this machine. It rides every transition into the activity log and out
    through ``get()``, because "which machine is doing this" is invisible
    otherwise — a remote pass and a local one produced identical events."""
    now = time.time()
    with _lock:
        cur = _jobs.get(bank_id)
        if cur and not cur['finished'] and now - cur['_touched'] < _STALE_TTL:
            raise BankJobBusy(cur['kind'])
        job = {'kind': kind, 'done': 0, 'total': int(total or 0), 'error': None,
               'cancelled': False, 'finished': False, 'detail': None,
               'started_at': now, '_touched': now, '_cancel_hook': None,
               'pipeline': None, 'device': device_label or None}
        _jobs[bank_id] = job
    _log(bank_id, f'{kind} started', 'info',
         detail=f'{total} image(s)' if total else None, device=device_label)

    def _run():
        try:
            with app.app_context():
                fn(job)
        except Exception as e:  # noqa: BLE001 — a background crash must surface in the UI
            with _lock:
                job['error'] = f'{type(e).__name__}: {e}'
            _log(bank_id, f'{kind} failed', 'error', detail=job['error'],
                 device=device_label)
        finally:
            with _lock:
                job['finished'] = True
                job['_touched'] = time.time()
                cancelled_, detail_, done_ = (job['cancelled'], job['detail'],
                                              job['done'])
            if cancelled_:
                _log(bank_id, f'{kind} stopped', 'warn', detail=detail_,
                     device=device_label)
            elif not job['error']:
                _log(bank_id, f'{kind} finished', 'ok',
                     detail=detail_ or (f'{done_} done' if done_ else None),
                     device=device_label)

    # Under TESTING the job runs INLINE: the test suite uses a per-connection
    # sqlite:///:memory: DB, so a real worker thread would open a fresh, EMPTY
    # database — and assertions would race the thread anyway.
    if app.config.get('TESTING'):
        _run()
    else:
        threading.Thread(target=_run, daemon=True,
                         name=f'bank-{bank_id}-{kind}').start()
    return job


def progress(job, done=None, total=None, detail=None):
    with _lock:
        if done is not None:
            job['done'] = int(done)
        if total is not None:
            job['total'] = int(total)
        if detail is not None:
            job['detail'] = str(detail)
        job['_touched'] = time.time()


def fail(job, message):
    """Stop a pass on a condition that is NOT an image problem — the source
    folder went away, a drive is unplugged. The runner's generic handler prefixes
    the exception type (`RuntimeError: ...`), which is noise in a toast, so a job
    that wants to explain itself in plain words sets the error here and returns."""
    with _lock:
        job['error'] = str(message)
        job['detail'] = str(message)
        job['_touched'] = time.time()


def bump(job, n=1):
    with _lock:
        job['done'] += n
        job['_touched'] = time.time()


def set_pipeline(job, snapshot):
    """Attach/replace the multi-step pipeline snapshot (step index/label and the
    per-step outcomes) carried alongside the plain done/total bar. Only the
    'pipeline' kind uses this; a copy is stored so later mutation is deliberate."""
    with _lock:
        job['pipeline'] = dict(snapshot) if snapshot is not None else None
        job['_touched'] = time.time()


def cancelled(job) -> bool:
    with _lock:
        return job['cancelled']


def set_cancel_hook(job, hook):
    """Register a callable invoked by cancel() — e.g. kill a subprocess so a
    cancel interrupts the current item, not just the loop between items."""
    with _lock:
        job['_cancel_hook'] = hook


def cancel(bank_id) -> bool:
    """Flag the bank's live job as cancelled (and fire its hook). False when
    there is nothing to cancel."""
    with _lock:
        job = _jobs.get(bank_id)
        if not job or job['finished']:
            return False
        _log(bank_id, f"stop requested for {job['kind']}", 'warn',
             device=job.get('device'))
        job['cancelled'] = True
        job['_touched'] = time.time()
        hook = job['_cancel_hook']
    if hook:
        try:
            hook()
        except Exception:  # noqa: BLE001 — best effort; the loop flag still stands
            pass
    return True


def get(bank_id):
    """Snapshot for the payload: {kind, done, total, error, cancelled,
    finished, detail, started_at, device, pipeline} or None. Purges expired
    entries."""
    now = time.time()
    with _lock:
        job = _jobs.get(bank_id)
        if not job:
            return None
        ttl = _FINISHED_TTL if job['finished'] else _STALE_TTL
        if now - job['_touched'] > ttl:
            _jobs.pop(bank_id, None)
            return None
        snap = {k: job[k] for k in ('kind', 'done', 'total', 'error',
                                    'cancelled', 'finished', 'detail',
                                    'started_at')}
        # Which machine is doing it — the running row's counterpart to the
        # device on each logged transition. .get() so a job dict built by an
        # older path (or a test) is not a KeyError.
        snap['device'] = job.get('device')
        snap['pipeline'] = dict(job['pipeline']) if job['pipeline'] else None
        return snap


def running(bank_id) -> bool:
    snap = get(bank_id)
    return bool(snap and not snap['finished'])


def live_bank_ids() -> list:
    """Every bank with an unfinished job right now. Used by the global stop,
    which must cancel what is actually running rather than what a client thinks
    is running — and by the stuck-flag recovery, which must REFUSE to clear a
    'GPU busy' flag that a live pass legitimately owns."""
    with _lock:
        return [bank_id for bank_id, job in list(_jobs.items())
                if not job['finished']]


def reset():
    """Test helper: forget every job."""
    with _lock:
        _jobs.clear()
