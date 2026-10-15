"""Manage local profiles without starting a second application instance."""
import os
import json
from pathlib import Path
import secrets
from urllib.parse import urlsplit

from flask import Blueprint, current_app, jsonify, request

from instance_profiles import FileLease, ProfileError, ProfileStore, public_profile
from .. import config as cfg
from ..plugins.restart import RestartBlocked, freeze_profile_work

bp = Blueprint('profiles', __name__, url_prefix='/api/profiles')


def _clear_switch(store):
    try:
        (store.home / 'switch.json').unlink(missing_ok=True)
    except OSError:
        current_app.logger.warning('The pending profile request could not be cleared; use the recovery launcher')


@bp.get('')
def list_profiles():
    try:
        rows = ProfileStore().profiles()
    except (ProfileError, OSError):
        return jsonify(error='Profiles could not be read. Check the local registry.'), 409
    return jsonify(current=public_profile()['id'], can_switch=(
        os.environ.get('LDS_RESTART_MODE') == 'supervisor'
        and os.environ.get('LDS_PROFILE_SWITCH_SUPPORTED') == '1'), profiles=[
        {key: row[key] for key in ('id', 'name', 'port')} for row in rows])


@bp.post('')
def create_profile():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify(error='Send a JSON object.'), 400
    try:
        # Preserve reachability, with an independent credential. No source
        # configuration, tool paths, account keys or data are copied.
        server = {'host': current_app.config.get('LDS_BOUND_HOST') or cfg.get('server.host'),
                  'require_token': bool(cfg.get('server.require_token')),
                  'access_token': secrets.token_urlsafe(24)}
        row = ProfileStore().create(data.get('name'), config={'server': server})
    except (ProfileError, ValueError) as exc:
        return jsonify(error=str(exc)), 409
    except OSError:
        return jsonify(error='The profile could not be saved. Check available space and permissions.'), 409
    return jsonify(ok=True, profile={key: row[key] for key in ('id', 'name', 'port')})


@bp.get('/ready')
def profile_ready():
    response = jsonify(public_profile())
    origin = request.headers.get('Origin', '')
    try:
        parsed = urlsplit(origin)
        current = urlsplit(request.host_url)
        ports = {row['port'] for row in ProfileStore().profiles()}
        if parsed.scheme in ('http', 'https') and parsed.hostname == current.hostname and parsed.port in ports:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Vary'] = 'Origin'
    except (ValueError, ProfileError, OSError):
        pass
    response.headers['Cache-Control'] = 'no-store'
    return response


@bp.post('/switch')
def switch_profile():
    from ..services import updater
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify(error='Send a JSON object.'), 400
    if (os.environ.get('LDS_RESTART_MODE') != 'supervisor'
            or os.environ.get('LDS_PROFILE_SWITCH_SUPPORTED') != '1'):
        return jsonify(error='Start Studio with start.bat to enable controlled profile switching.'), 409
    store = ProfileStore()
    source = public_profile()['id']
    gate = None
    requested = False
    try:
        target = store.get(data.get('profile_id'))
        if target['id'] == source:
            return jsonify(error='This profile is already open.'), 409
        target_settings = json.loads(Path(target['paths']['LDS_CONFIG']).read_text(encoding='utf-8'))
        target_host = os.environ.get('LDS_HOST') or target_settings.get('server', {}).get('host', '127.0.0.1')
        if request.remote_addr not in ('127.0.0.1', '::1') and target_host in ('127.0.0.1', 'localhost', '::1'):
            return jsonify(error='This profile is local only. Enable its LAN access from the host before switching remotely.'), 409
        gate = freeze_profile_work()
        with FileLease(store.home / 'transition.lock'):
            store.check_other_work(target['id'])
            # Existing target access credentials can be passed to the same
            # operator for the first request at the target port.
            destination = store.browser_url(target['id'])
            store.request_switch(source, target['id'])
            requested = True
            if not updater.schedule_restart(block_during_update=True):
                _clear_switch(store)
                response = jsonify(error='A restart is already scheduled. Wait before switching again.')
                response.status_code = 409
                response.call_on_close(gate.finished.wait)
                return response
    except (ProfileError, RestartBlocked, updater.UpdateInProgressError) as exc:
        if gate is not None:
            gate.release()
        if requested:
            _clear_switch(store)
        return jsonify(error=str(exc)), 409
    except Exception:
        if gate is not None:
            gate.release()
        if requested:
            _clear_switch(store)
        current_app.logger.warning('Profile switch could not be scheduled')
        return jsonify(error='The profile switch could not be scheduled. Your current profile stays selected.'), 409
    response = jsonify(ok=True, profile_id=target['id'], port=target['port'], destination=destination)
    response.call_on_close(gate.finished.wait)
    return response


@bp.post('/banks/<int:bank_id>/move')
def move_bank_profile(bank_id):
    from ..config import LOCAL_USER
    from ..services.profile_bank_move import MoveBlocked, move_bank
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify(error='Send a JSON object.'), 400
    gate = None
    try:
        gate = freeze_profile_work()
        result = move_bank(LOCAL_USER, bank_id, data.get('instance_id'),
                           data.get('profile_id'), data.get('operation_id'))
    except (MoveBlocked, ProfileError, RestartBlocked) as exc:
        return jsonify(error=str(exc)), 409
    except Exception:
        current_app.logger.warning('Bank profile move did not complete; recovery data was retained')
        return jsonify(error='The move did not complete. Source images were not changed. Retry to resume the recorded move.'), 409
    finally:
        if gate is not None:
            gate.release()
    return jsonify(ok=True, **result)
