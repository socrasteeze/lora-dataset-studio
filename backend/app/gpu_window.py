from __future__ import annotations

import logging
import threading
import uuid
from contextlib import contextmanager
from contextvars import ContextVar

from flask import has_app_context

from .job_queue import GPU_ARBITER_LOCK, queue_manager

logger = logging.getLogger(__name__)


class GpuBusyError(RuntimeError):
    pass


# Floor for the TTL-re-arm heartbeat interval (module-level so tests can shrink
# it); the effective interval is max(this, ttl / 3) — always well inside
# the TTL, so the flag can only lapse if the whole process dies.
_HEARTBEAT_FLOOR_SECONDS = 10
# Consecutive FAILED renewals tolerated before the heartbeat gives up. Each
# renewal already retries the write 3x with backoff (write_with_retry), so this
# is the second layer: it covers a writer that stays contended for longer than
# one beat. 2 is deliberate -- the interval is ttl/3, so two misses still leave
# a full beat of TTL headroom before the flag could lapse. Losing OWNERSHIP is
# never tolerated, whatever this is set to; it stops on the first occurrence.
_HEARTBEAT_MAX_MISSES = 2


def _log(message, level='info', detail=None):
    """Mirror GPU-window transitions into the activity log. The window is the
    single most confusing thing this app does — it unloads ComfyUI, blocks
    training and makes everything else answer "GPU busy" — and until now it did
    all of that with no visible trace anywhere."""
    try:
        from .services import activity_log
        activity_log.record('gpu', message, level=level, detail=detail)
    except Exception:      # noqa: BLE001 — never break the pass being described
        pass


# The token is intentionally context-local. A Vision batch can propagate it to
# its worker threads to renew the same persisted ownership record, but an
# unrelated request never inherits permission simply because a DB flag exists.
_vision_window_context: ContextVar[tuple[str, int] | None] = ContextVar(
    'vision_window_context', default=None)
# Process-local complement to the persisted TTL. It remains true for a long
# Vision/CUDA operation even if a background renewal fails, and is cleared only
# after its heartbeat has stopped and the outer window has exited.
_active_vision_window_tokens: set[str] = set()
# Sane production bounds on a caller-supplied flag_ttl. Module-level (like
# _HEARTBEAT_FLOOR_SECONDS above) so the fork's own race tests can shrink
# _MIN_FLAG_TTL_SECONDS to drive a window with a tiny, fast, deterministic TTL
# instead of waiting out a real one — upstream's own test suite never needed
# this override because it has no equivalent fast/deterministic race tests.
_MIN_FLAG_TTL_SECONDS = 30
_MAX_FLAG_TTL_SECONDS = 3600


def _normalise_flag_ttl(value) -> float:
    # float, not int: truncating a fractional flag_ttl to 0 defeats the fork's
    # own race tests, which deliberately drive this with a sub-second TTL
    # (alongside a correspondingly-lowered _MIN_FLAG_TTL_SECONDS) to exercise
    # the heartbeat deterministically and fast.
    try:
        ttl = float(value)
    except (TypeError, ValueError):
        ttl = 300.0
    return max(_MIN_FLAG_TTL_SECONDS, min(_MAX_FLAG_TTL_SECONDS, ttl))


def _in_app_context(callback):
    """Run a tiny state update from a propagated worker context when needed."""
    if has_app_context():
        return callback()
    app = queue_manager._app
    if app is None:
        return False
    with app.app_context():
        return callback()


def vision_window_is_owned() -> bool:
    """Whether this execution context belongs to an active Vision GPU window."""
    return _vision_window_context.get() is not None


def vision_gpu_window_blocks_gpu() -> bool:
    """Whether an in-process Vision/CUDA window still owns the local GPU.

    This does not consult the TTL-backed database flag: it is the fail-closed
    fallback for a long operation whose renewal temporarily fails.
    """
    with GPU_ARBITER_LOCK:
        return bool(_active_vision_window_tokens)


def bind_vision_window_context(callback):
    """Bind only the Vision token to a worker; never copy Flask contextvars."""
    owned = _vision_window_context.get()
    if owned is None:
        return callback

    def _bound(*args, **kwargs):
        context_token = _vision_window_context.set(owned)
        try:
            return callback(*args, **kwargs)
        finally:
            _vision_window_context.reset(context_token)

    return _bound


def _renew_owned_vision_token(token: str, ttl: int) -> bool:
    """Refresh exactly one claimed token, including from a heartbeat thread.

    The write goes through `write_with_retry`: SQLite has ONE writer, and a busy
    bank pass or a bank-list folder walk can hold it past the 15 s busy_timeout.
    Without the retry a single lost race killed the heartbeat outright (measured
    in the wild: `sqlite3.OperationalError: database is locked` out of
    `_set_system_state`), which stranded the in-process GPU fence and left the
    generation queue refusing every job until the pass finally unwound.
    """
    from .utils.dbbusy import write_with_retry

    def _renew():
        try:
            with GPU_ARBITER_LOCK:
                if queue_manager._get_system_state('vision_in_progress') != token:
                    # A real ownership loss: our flag lapsed and someone else
                    # claimed it. Distinct from the failure below, and the ONLY
                    # one the heartbeat should stop for.
                    logger.warning(
                        'vision GPU window: the flag is no longer ours (token lapsed '
                        'or re-acquired); stopping this heartbeat')
                    return False
                write_with_retry(lambda: queue_manager._set_system_state(
                    'vision_in_progress', token, ttl_seconds=ttl))
                return True
        except Exception:
            # Could not REACH the database (writer contention that outlasted the
            # retries, a teardown mid-flight). Says nothing about ownership, so
            # it is logged apart from the case above — the previous single
            # message could not tell a stolen window from a busy disk.
            logger.exception('vision GPU window renewal could not reach the database')
            return False

    return bool(_in_app_context(_renew))


def _heartbeat_interval_seconds(ttl: int) -> float:
    """Refresh well before expiry without creating a busy polling loop.
    Floored by _HEARTBEAT_FLOOR_SECONDS (module-level so tests can shrink it
    to drive the heartbeat fast, rather than waiting out a real TTL/3)."""
    return max(_HEARTBEAT_FLOOR_SECONDS, min(60.0, float(ttl) / 3.0))


def renew_gpu_exclusive_vision_window(flag_ttl=None) -> bool:
    """Refresh this context's persisted Vision ownership before an Ollama call.

    A worker that outlives the outer Vision window cannot revive it: it must
    still own the exact token in ``SystemState``. ``False`` is fail-closed and
    callers must not start another local inference after it.
    """
    owned = _vision_window_context.get()
    if owned is None:
        return False
    token, previous_ttl = owned
    ttl = _normalise_flag_ttl(previous_ttl if flag_ttl is None else flag_ttl)
    return _renew_owned_vision_token(token, ttl)


def recover_stale_vision_window():
    """Clear only a persisted Vision lock during server startup.

    A stalled ComfyUI barrier is a different ownership record and must remain
    intact across startup. Vision work itself cannot survive this Python process,
    so its token is safe to clear.
    """
    def _recover():
        with GPU_ARBITER_LOCK:
            previous = queue_manager._get_system_state('vision_in_progress')
            if not previous:
                return False
            queue_manager._set_system_state('vision_in_progress', None)
            logger.warning('startup recovery: cleared stale vision/GPU lock from the previous process')
            return True

    return bool(_in_app_context(_recover))


@contextmanager
def gpu_exclusive_vision_window(flag_ttl=300):
    """Give one Vision operation exclusive ownership of the local GPU.

    This is a handoff, not a per-image cleanup: a batch enters once, asks
    ComfyUI to release its models once, then keeps Ollama hot for all of its
    calls. A ComfyUI batch does the inverse at its first prompt, never between
    its cells.
    """
    if _vision_window_context.get() is not None:
        # Re-entering from the same request would obscure ownership and can make
        # a stale worker look valid. Batches propagate the token only to renew.
        raise GpuBusyError('a vision task is already running')

    ttl = _normalise_flag_ttl(flag_ttl)
    token = uuid.uuid4().hex
    context_token = _vision_window_context.set((token, ttl))
    claimed = False
    active_registered = False
    heartbeat_stop = threading.Event()
    heartbeat = None
    try:
        with GPU_ARBITER_LOCK:
            try:
                if vision_gpu_window_blocks_gpu():
                    raise GpuBusyError('a vision task is already running')
                if queue_manager._get_system_state('vision_in_progress'):
                    raise GpuBusyError('a vision task is already running')
                if queue_manager._get_system_state('training_in_progress'):
                    raise GpuBusyError('training is running')
                if queue_manager.has_comfyui_stalled_barrier():
                    raise GpuBusyError(
                        'ComfyUI recovery is required before a vision task can use the GPU.')
                if queue_manager.has_comfyui_work():
                    raise GpuBusyError(
                        'ComfyUI has queued or active work; wait for it or cancel it before running vision.')
            except GpuBusyError:
                raise
            except Exception as exc:
                raise GpuBusyError(
                    'Could not confirm GPU ownership safely; try again after checking ComfyUI.') from exc

            queue_manager._set_system_state('vision_in_progress', token, ttl_seconds=ttl)
            claimed = True
            _active_vision_window_tokens.add(token)
            active_registered = True
            try:
                from .utils.comfyui import free_comfyui_vram
                verdict = free_comfyui_vram()
            except Exception:
                logger.exception('vision GPU window: ComfyUI /free raised unexpectedly')
                verdict = None

            # Asked of the member, not compared to a class imported here: the
            # enum's own property answers for whichever incarnation of the
            # class the member belongs to. The suite once reloaded
            # utils.comfyui, and a member of the old class was never `in` a
            # tuple of the new one. `is not True` keeps the gate fail-closed:
            # a stand-in whose attribute is merely truthy does not open it.
            if getattr(verdict, 'permits_ollama', False) is not True:
                if queue_manager._get_system_state('vision_in_progress') == token:
                    queue_manager._set_system_state('vision_in_progress', None)
                _active_vision_window_tokens.discard(token)
                active_registered = False
                claimed = False
                raise GpuBusyError(
                    'ComfyUI did not confirm that its GPU models were released. '
                    'Wait for it to recover, then try the vision task again.')

        _log('GPU taken exclusively', 'warn',
             detail='ComfyUI unloaded; training cannot start until this releases')

        # Some CUDA subprocesses and local image passes legitimately run for
        # longer than their initial TTL. The heartbeat owns only this exact token;
        # cleanup stops and joins it before clearing, so a stale thread cannot
        # revive a released or replacement window.
        #
        # The beat's check-and-rearm (_renew_owned_vision_token) and the close's
        # check-and-clear (_clear_owned, below) are the SAME critical section
        # under GPU_ARBITER_LOCK, which is what makes them mutually exclusive —
        # not the `heartbeat.join(timeout=2)` below, which is a tidy-up only.
        # A join alone used to be the whole story, with a comment saying beats
        # are two fast local DB ops so the join is effectively instant. That
        # held until SQLite's single write lock is contended (this app hits
        # that often enough to carry write_with_retry and a `db_busy` error
        # shape): when the join timed out, a beat mid-write would land its
        # re-arm AFTER the close's clear, leaving a flag nothing was holding
        # and nothing would refresh — everything then refused "GPU busy" for
        # the full TTL. Owner-reported after cancelling a pass: "I had even
        # canceled it and now it's showing this." Sharing GPU_ARBITER_LOCK
        # between the two closes it: whichever runs second under the lock sees
        # the other's already-committed state, so the clear can never be
        # overwritten by a beat that was merely slow to acquire it.
        def _heartbeat():
            # A renewal can fail for two unrelated reasons and only one of them
            # is terminal. Losing the flag to another pass is: nothing this beat
            # writes afterwards is legitimate. A busy SQLite writer is NOT --
            # the window is still ours, the disk is merely contended, and giving
            # up on the first collision is what stranded the fence in the wild.
            # Keep beating through transient failures; the TTL is 3x the
            # interval, so there is room for several before the flag can lapse.
            misses = 0
            while not heartbeat_stop.wait(_heartbeat_interval_seconds(ttl)):
                if _renew_owned_vision_token(token, ttl):
                    misses = 0
                    continue
                misses += 1
                if misses < _HEARTBEAT_MAX_MISSES:
                    logger.warning(
                        'vision GPU window: renewal %d/%d failed; retrying on the next beat',
                        misses, _HEARTBEAT_MAX_MISSES)
                    continue
                # The process-local active-token fence remains set until the
                # outer window exits, so Queue/Training stay blocked even if
                # this persisted TTL has expired.
                logger.error(
                    'vision GPU window heartbeat gave up after %d failed renewals; '
                    'in-process GPU fence retained', misses)
                return

        heartbeat = threading.Thread(
            target=_heartbeat, name='vision-window-heartbeat', daemon=True)
        try:
            heartbeat.start()
        except Exception as exc:
            with GPU_ARBITER_LOCK:
                if queue_manager._get_system_state('vision_in_progress') == token:
                    queue_manager._set_system_state('vision_in_progress', None)
                _active_vision_window_tokens.discard(token)
            active_registered = False
            claimed = False
            raise GpuBusyError('Could not keep the Vision GPU reservation alive safely.') from exc

        yield
    finally:
        heartbeat_stop.set()
        # `join` here is a tidy-up, not the mutual exclusion — see the long
        # comment above the heartbeat's definition. `_clear_owned` below shares
        # GPU_ARBITER_LOCK with the beat's own re-arm, so even if the beat is
        # still mid-write when this join times out, the clear simply waits its
        # turn for the lock and then correctly overwrites whatever the beat
        # just wrote.
        if heartbeat is not None and heartbeat is not threading.current_thread():
            heartbeat.join(timeout=2)
        try:
            if claimed:
                def _clear_owned():
                    with GPU_ARBITER_LOCK:
                        # only clear the flag if we still own it (it may have
                        # expired and been re-acquired by another caller)
                        if queue_manager._get_system_state('vision_in_progress') == token:
                            queue_manager._set_system_state('vision_in_progress', None)
                            _log('GPU released', 'ok')
                        else:
                            # Someone else owns the flag now — ours lapsed and
                            # was re-acquired. Worth a line: it is the shape a
                            # "GPU busy" that outlives its owner takes.
                            _log('GPU window closed, but the flag belongs to '
                                 'another pass', 'warn')
                _in_app_context(_clear_owned)
        finally:
            # Keep this after stop/join and database cleanup. Even if the app
            # context is unavailable during teardown, the in-process fence must
            # not outlive the actual Vision work.
            if active_registered:
                with GPU_ARBITER_LOCK:
                    _active_vision_window_tokens.discard(token)
            _vision_window_context.reset(context_token)
