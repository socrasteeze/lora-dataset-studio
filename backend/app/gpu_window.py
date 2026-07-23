import logging
import threading
import uuid
from contextlib import contextmanager
from .job_queue import queue_manager

logger = logging.getLogger(__name__)

class GpuBusyError(RuntimeError):
    pass


# Floor for the TTL-re-arm heartbeat interval (module-level so tests can shrink
# it); the effective interval is max(this, flag_ttl / 3) — always well inside
# the TTL, so the flag can only lapse if the whole process dies.
_HEARTBEAT_FLOOR_SECONDS = 10


def recover_stale_vision_window():
    """Clear a persisted vision lock during server startup.

    Vision work runs synchronously inside this Python process. If the process is
    starting, no vision request from the previous process can still be alive, but
    its database-backed TTL flag may be. Keeping that flag is what caused a restart
    after interrupted captioning to report "GPU busy" for up to 30 minutes.
    """
    previous = queue_manager._get_system_state('vision_in_progress')
    if not previous:
        return False
    queue_manager._set_system_state('vision_in_progress', None)
    logger.warning('startup recovery: cleared stale vision/GPU lock from the previous process')
    return True

@contextmanager
def gpu_exclusive_vision_window(flag_ttl=300):
    if queue_manager._get_system_state('vision_in_progress'):
        raise GpuBusyError('a vision task is already running')
    if queue_manager._get_system_state('training_in_progress'):
        raise GpuBusyError('training is running')
    token = uuid.uuid4().hex
    queue_manager._set_system_state('vision_in_progress', token, ttl_seconds=flag_ttl)
    # The TTL exists so a crashed process can't hold the GPU hostage — but a
    # LEGITIMATE batch can outlive it (a big caption run on a slow vision model
    # beats 30 min easily), and once the flag lapses the job queue's GPU gate
    # reopens and image jobs start rendering on top of the vision pass. Re-arm
    # the TTL from a heartbeat for as long as the window is open and we still
    # own the token. A crash kills the heartbeat with the process, so the
    # crash-recovery semantics (TTL lapse + boot-time recover) are unchanged.
    heartbeat_stop = threading.Event()
    try:
        from flask import current_app
        _app = current_app._get_current_object()
    except RuntimeError:
        _app = None   # no app context (bare test harness) -> no heartbeat, old behavior

    def _rearm_until_closed():
        interval = max(_HEARTBEAT_FLOOR_SECONDS, flag_ttl / 3)
        while not heartbeat_stop.wait(interval):
            try:
                with _app.app_context():
                    if queue_manager._get_system_state('vision_in_progress') != token:
                        return   # lapsed AND re-acquired by another caller — never stomp it
                    queue_manager._set_system_state('vision_in_progress', token,
                                                    ttl_seconds=flag_ttl)
            except Exception:
                logger.debug('vision-window TTL heartbeat failed; next beat retries',
                             exc_info=True)

    heartbeat = None
    if _app is not None:
        heartbeat = threading.Thread(target=_rearm_until_closed, daemon=True,
                                     name='vision-window-heartbeat')
        heartbeat.start()
    try:
        try:
            from .utils.comfyui import free_comfyui_vram
            free_comfyui_vram()
        except Exception:
            pass
        yield
    finally:
        heartbeat_stop.set()
        if heartbeat is not None:
            # A beat already past its stop-check could otherwise re-arm the flag
            # AFTER we clear it below, stranding a phantom lock. Beats are two
            # fast local DB ops, so this join is effectively instant.
            heartbeat.join(timeout=5)
        # only clear the flag if we still own it (it may have expired and been re-acquired)
        if queue_manager._get_system_state('vision_in_progress') == token:
            queue_manager._set_system_state('vision_in_progress', None)
