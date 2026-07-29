"""🖥️ System — server-side folder pickers, and the global stop.

The folders the app works on live on the machine RUNNING the server (not the
browser's), so these two endpoints do the selecting there:

  POST /api/system/pick-folder   pops the OS-native dialog on the server desktop.
  GET  /api/system/list-folders  read-only in-app browser (drives + subfolders).

And the way out of a wedged GPU:

  GET  /api/system/gpu-flags        what the "GPU busy" gate believes, and whether
                                    anything actually backs it up.
  POST /api/system/gpu-flags/clear  clear a STALE flag, refusing while something
                                    real is running.
  POST /api/system/stop-everything  cancel every running job, ask ComfyUI and the
                                    trainer to stop, then clear the flags — with a
                                    per-target report, never a blanket "ok".

pick-folder never 500s on the expected "no desktop here" case — it answers 200
with {available:false} so the UI silently falls back to the in-app browser
(LAN/tablet/Linux) instead of flashing a scary error toast.
"""
import logging

from flask import Blueprint, current_app, jsonify, request

from ..config import LOCAL_USER
from ..services import activity_log, folder_picker, global_stop

logger = logging.getLogger(__name__)

bp = Blueprint('system', __name__, url_prefix='/api/system')


@bp.post('/pick-folder')
def pick_folder():
    data = request.get_json(silent=True) or {}
    initial = (data.get('initial') or '').strip() or None
    try:
        path = folder_picker.open_native_folder_dialog(initial)
    except folder_picker.NativePickerUnavailable as e:
        # Expected on a headless / Linux / service-session server: 200 so the
        # front falls back to the in-app browser without an error toast.
        return jsonify({'available': False, 'reason': str(e)})
    if path is None:
        return jsonify({'available': True, 'cancelled': True})
    return jsonify({'available': True, 'path': path})


@bp.get('/list-folders')
def list_folders():
    path = request.args.get('path') or None
    try:
        return jsonify(folder_picker.list_subfolders(path))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except PermissionError:
        return jsonify({'error': 'Permission denied for this folder.'}), 403


@bp.get('/gpu-flags')
def gpu_flags():
    """What the GPU gate believes right now. `stale` answers the only question a
    user has when the app says "GPU busy" and nothing is running: is this real?"""
    return jsonify(global_stop.gpu_flag_state())


@bp.post('/gpu-flags/clear')
def gpu_flags_clear():
    """Clear a leftover "GPU busy" flag WITHOUT stopping anything — the common
    case by far. Refuses (409) while a training process or a pass is really
    live: clearing a flag a live pass owns is how two runs end up on one card."""
    try:
        return jsonify({'ok': True, **global_stop.clear_gpu_flags()})
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 409


@bp.post('/stop-everything')
def stop_everything():
    """Stop every running job, everywhere, and unstick the GPU.

    Destructive to in-flight work by design — the UI confirms first. Always 200:
    the report is per target, and a target that could not be confirmed says so
    rather than being folded into a failure that hides the ones that worked."""
    return jsonify({'ok': True, **global_stop.stop_everything(
        current_app._get_current_object(), LOCAL_USER)})


@bp.get('/activity')
def activity():
    """What the app is doing, everywhere, in one poll.

    `?since=<event id>` returns only newer events, so the panel can append
    instead of redrawing — a full redraw every two seconds loses the user's
    scroll position mid-read, which is the one thing a log must not do.

    `running[].stale_seconds` is the answer to "is it stuck": a bar frozen at
    34% and a bar that will move again in two seconds are drawn identically, and
    only the age of the last update tells them apart."""
    since = request.args.get('since')
    limit = request.args.get('limit', 200)
    return jsonify({
        **activity_log.snapshot(LOCAL_USER),
        'events': activity_log.events(since=since, limit=limit),
    })
