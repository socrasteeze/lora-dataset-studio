"""Cluster / remote GPU worker APIs.

Hub (Primary) routes for Settings + device picker, and peer-authenticated
pull/artifact/complete endpoints. Peer routes are CSRF-exempt (machine-to-
machine bearer auth) and accepted by netguard when a ClusterDevice token
matches.
"""
from __future__ import annotations

import logging

from flask import Blueprint, Response, jsonify, request

from .. import config as cfg
from ..extensions import csrf
from ..services import cluster as cluster_svc
from ..services.peer_worker import peer_worker

logger = logging.getLogger(__name__)

bp = Blueprint('cluster', __name__, url_prefix='/api/cluster')


def _peer_device():
    """Resolve the calling peer from Authorization / X-LDS-Token."""
    from ..netguard import _presented_token
    device = cluster_svc.authenticate_peer(_presented_token())
    if device is None:
        return None
    return device


def _require_peer():
    device = _peer_device()
    if device is None:
        return None, (jsonify({'error': 'invalid or missing peer token'}), 401)
    return device, None


# ── Hub / Settings (browser session) ─────────────────────────────────────

@bp.get('/status')
def cluster_status():
    data = cluster_svc.status_summary()
    if cluster_svc.is_peer():
        data['peer_worker'] = peer_worker.status()
    return jsonify(data)


@bp.get('/devices')
def list_devices():
    """Run-on picker list (local + online peers when Primary)."""
    kind = (request.args.get('kind') or '').strip() or None
    devices = cluster_svc.list_devices(include_local=True)
    if kind:
        filtered = []
        for d in devices:
            caps = d.get('capabilities') or {}
            if kind == 'comfy' and not caps.get('comfyui') and not d.get('local'):
                # Still list offline peers but mark capability gap client-side;
                # local always included.
                pass
            filtered.append(d)
        devices = filtered
    return jsonify({'devices': devices, 'role': cluster_svc.role()})


@bp.post('/join-tokens')
def create_join_token():
    if not cluster_svc.is_primary():
        return jsonify({'error': 'switch role to Primary to issue join tokens'}), 400
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(cluster_svc.mint_join_token(data.get('label')))
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 400


@bp.get('/join-tokens')
def get_join_tokens():
    if not cluster_svc.is_primary():
        return jsonify({'tokens': []})
    return jsonify({'tokens': cluster_svc.list_join_tokens()})


@bp.post('/join')
@csrf.exempt
def join():
    """Peer redeems a join token. CSRF-exempt — first contact, no session yet."""
    data = request.get_json(silent=True) or {}
    try:
        result = cluster_svc.redeem_join_token(
            data.get('token'),
            name=data.get('name'),
            capabilities_blob=data.get('capabilities'),
        )
        return jsonify(result)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 400


@bp.post('/devices/<device_id>/rename')
def rename_device(device_id):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(cluster_svc.rename_device(device_id, data.get('name') or ''))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@bp.post('/devices/<device_id>/revoke')
def revoke_device(device_id):
    try:
        cluster_svc.revoke_device(device_id)
        return jsonify({'ok': True})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@bp.post('/peer/connect')
def peer_connect_local():
    """On a peer install: redeem join token against Primary and save config."""
    if cluster_svc.role() not in ('peer', 'standalone'):
        return jsonify({'error': 'switch this install to Peer role first'}), 400
    data = request.get_json(silent=True) or {}
    primary_url = (data.get('primary_url') or cfg.get('cluster.primary_url') or '').rstrip('/')
    token = (data.get('token') or '').strip()
    if not primary_url or not token:
        return jsonify({'error': 'primary_url and token required'}), 400
    import requests
    try:
        caps = cluster_svc.local_capabilities()
        r = requests.post(
            f'{primary_url}/api/cluster/join',
            json={
                'token': token,
                'name': data.get('name') or cluster_svc.device_display_name(),
                'capabilities': caps,
            },
            timeout=30,
        )
        body = r.json() if r.content else {}
        if r.status_code >= 400:
            return jsonify({'error': body.get('error') or f'Primary returned {r.status_code}'}), 400
    except requests.RequestException as e:
        return jsonify({'error': f'could not reach Primary: {e}'}), 400

    cfg.save_config({
        'cluster': {
            'role': 'peer',
            'primary_url': primary_url,
            'peer_token': body.get('auth_token') or '',
            'device_name': data.get('name') or cluster_svc.device_display_name(),
            'node_id': body.get('device_id') or cluster_svc.ensure_node_id(),
        }
    })
    # Kick the peer loop if it was waiting on missing config.
    try:
        peer_worker.start()
    except Exception:
        logger.exception('cluster: failed to start peer worker after connect')
    return jsonify({
        'ok': True,
        'device_id': body.get('device_id'),
        'primary_url': primary_url,
    })


# ── Peer machine endpoints (bearer = device auth_token) ──────────────────

@bp.post('/peer/heartbeat')
@csrf.exempt
def peer_heartbeat():
    device, err = _require_peer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    return jsonify(cluster_svc.heartbeat(
        device,
        capabilities_blob=data.get('capabilities'),
        busy=data.get('busy'),
    ))


@bp.post('/peer/pull')
@csrf.exempt
def peer_pull():
    device, err = _require_peer()
    if err:
        return err
    job = cluster_svc.pull_next_job(device)
    return jsonify({'job': job})


@bp.post('/peer/jobs/<job_id>/heartbeat')
@csrf.exempt
def peer_job_heartbeat(job_id):
    device, err = _require_peer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    try:
        cluster_svc.peer_job_heartbeat(device, job_id, progress=data.get('progress'))
        return jsonify({'ok': True})
    except ValueError as e:
        return jsonify({'error': str(e)}), 404


@bp.post('/peer/jobs/<job_id>/complete')
@csrf.exempt
def peer_job_complete(job_id):
    device, err = _require_peer()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    try:
        cluster_svc.complete_cluster_job(
            device, job_id,
            result=data.get('result'),
            error=data.get('error'),
            output_artifact=data.get('output_artifact'),
        )
        return jsonify({'ok': True})
    except ValueError as e:
        return jsonify({'error': str(e)}), 404


@bp.get('/peer/artifacts/<job_id>/<path:name>')
@csrf.exempt
def peer_download_artifact(job_id, name):
    device, err = _require_peer()
    if err:
        return err
    from ..models import ClusterJob
    job = ClusterJob.query.filter_by(job_id=job_id, device_id=device.id).first()
    if job is None:
        # Also allow download while pending claim just completed — device match
        # on any non-revoked ownership of the job folder is enough if the job
        # exists for this device in any active state.
        job = ClusterJob.query.filter_by(job_id=job_id).first()
        if job is None or job.device_id != device.id:
            return jsonify({'error': 'job not found'}), 404
    try:
        path = cluster_svc.artifact_path(job_id, name)
    except FileNotFoundError:
        return jsonify({'error': 'artifact not found'}), 404
    return Response(
        path.read_bytes(),
        mimetype='application/octet-stream',
        headers={'Content-Disposition': f'attachment; filename="{path.name}"'},
    )


@bp.put('/peer/artifacts/<job_id>/<path:name>')
@csrf.exempt
def peer_upload_artifact(job_id, name):
    device, err = _require_peer()
    if err:
        return err
    from ..models import ClusterJob
    job = ClusterJob.query.filter_by(job_id=job_id, device_id=device.id).first()
    if job is None:
        return jsonify({'error': 'job not found'}), 404
    safe = name.replace('\\', '/').split('/')[-1]
    dest = cluster_svc.job_artifact_dir(job_id) / safe
    dest.write_bytes(request.get_data() or b'')
    return jsonify({'ok': True, 'name': safe})


@bp.get('/jobs/<job_id>')
def get_cluster_job(job_id):
    from ..models import ClusterJob
    job = ClusterJob.query.filter_by(job_id=job_id).first()
    if job is None:
        return jsonify({'error': 'job not found'}), 404
    return jsonify(job.to_dict())


@bp.post('/jobs/vision')
def enqueue_vision_job():
    """Hub: run a vision batch on a peer (Ollama)."""
    from ..services import cluster_remote
    data = request.get_json(silent=True) or {}
    device_id = data.get('device_id')
    paths = data.get('paths') or []
    if not paths:
        return jsonify({'error': 'paths required'}), 400
    try:
        job_id = cluster_remote.enqueue_vision_on_device(
            device_id, paths,
            prompt=data.get('prompt') or 'Describe this image.',
            prefer_json=bool(data.get('prefer_json')),
            fmt=data.get('fmt'),
        )
        return jsonify({'ok': True, 'job_id': job_id})
    except (ValueError, RuntimeError) as e:
        return jsonify({'error': str(e)}), 400


@bp.post('/jobs/infer')
def enqueue_infer_job():
    from ..services import cluster_remote
    data = request.get_json(silent=True) or {}
    try:
        job_id = cluster_remote.enqueue_infer_on_device(
            data.get('device_id'),
            script=data.get('script'),
            stdin=data.get('stdin') or {},
            image_paths=data.get('paths') or [],
            timeout=int(data.get('timeout') or 3600),
            python=data.get('python'),
        )
        return jsonify({'ok': True, 'job_id': job_id})
    except (ValueError, RuntimeError, TypeError) as e:
        return jsonify({'error': str(e)}), 400


@bp.post('/jobs/training')
def enqueue_training_job():
    """Hub: send a dataset zip + ai-toolkit config to a peer."""
    from ..services import cluster_remote
    data = request.get_json(silent=True) or {}
    archive = data.get('archive_path')
    if not archive:
        return jsonify({'error': 'archive_path required'}), 400
    try:
        job_id = cluster_remote.enqueue_training_on_device(
            data.get('device_id'),
            dataset_archive_path=archive,
            train_params={
                'config_text': data.get('config_text') or data.get('config'),
                'config_name': data.get('config_name'),
                'extra_args': data.get('extra_args'),
                'timeout': data.get('timeout'),
            },
        )
        return jsonify({'ok': True, 'job_id': job_id})
    except (ValueError, RuntimeError) as e:
        return jsonify({'error': str(e)}), 400
