"""Remote GPU workers — Primary hub + compute peers.

Primary owns datasets/SQLite and schedules jobs. Peers pull jobs over HTTP
(Tailscale-friendly outbound), run them on local ComfyUI / Ollama / infer /
ai-toolkit, and upload results. Device ``local`` is always the Primary itself.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import shutil
import threading
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from .. import config as cfg
from ..extensions import db
from ..models import ClusterDevice, ClusterJoinToken, ClusterJob, ImageGenerationQueue

logger = logging.getLogger(__name__)

ONLINE_TTL_SECONDS = 90
JOIN_TOKEN_TTL_HOURS = 48
ARTIFACT_SUBDIR = 'cluster_artifacts'
LOCAL_DEVICE_ID = 'local'

_VALID_ROLES = frozenset({'standalone', 'primary', 'peer'})
_VALID_KINDS = frozenset({'comfy', 'infer', 'vision', 'training'})

# In-memory join-token plaintext cache so Settings can show the token once
# after mint (hash-only in DB). Cleared on redeem / expiry / restart.
_join_token_plaintext: dict[int, str] = {}
_join_token_lock = threading.Lock()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def ensure_node_id() -> str:
    """Stable per-install id; persists into config.json when missing."""
    node_id = (cfg.get('cluster.node_id') or '').strip()
    if node_id:
        return node_id
    node_id = str(uuid.uuid4())
    try:
        cfg.save_config({'cluster': {'node_id': node_id}})
    except Exception:
        logger.exception('cluster: failed to persist node_id')
    return node_id


def role() -> str:
    r = (cfg.get('cluster.role') or 'standalone').strip().lower()
    return r if r in _VALID_ROLES else 'standalone'


def is_primary() -> bool:
    return role() == 'primary'


def is_peer() -> bool:
    return role() == 'peer'


def device_display_name() -> str:
    name = (cfg.get('cluster.device_name') or '').strip()
    if name:
        return name
    try:
        import socket
        return socket.gethostname() or 'This machine'
    except Exception:
        return 'This machine'


def artifacts_root() -> Path:
    root = cfg.data_dir() / ARTIFACT_SUBDIR
    root.mkdir(parents=True, exist_ok=True)
    return root


def job_artifact_dir(job_id: str) -> Path:
    d = artifacts_root() / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def stage_file_artifact(job_id: str, src_path: str | Path, dest_name: str | None = None) -> str:
    """Copy a local file into the job's artifact dir. Returns the basename."""
    src = Path(src_path)
    if not src.is_file():
        raise FileNotFoundError(f'artifact source missing: {src}')
    name = dest_name or src.name
    # Keep basenames path-safe (ComfyUI LoadImage uses basename only).
    name = os.path.basename(name).replace('\\', '_').replace('/', '_')
    dest = job_artifact_dir(job_id) / name
    shutil.copy2(src, dest)
    return name


def artifact_path(job_id: str, name: str) -> Path:
    safe = os.path.basename(name).replace('\\', '_').replace('/', '_')
    path = job_artifact_dir(job_id) / safe
    if not path.is_file():
        raise FileNotFoundError(safe)
    return path


def local_capabilities() -> dict:
    """Capability blob a peer heartbeats (or Primary advertises for itself)."""
    try:
        from .. import capabilities
        caps = capabilities.probe()
    except Exception:
        logger.exception('cluster: capabilities probe failed')
        caps = {}
    # Keep the wire payload small — peers/hub only need routing gates.
    return {
        'comfyui': bool((caps.get('comfyui') or {}).get('reachable')),
        'ollama': bool((caps.get('ollama') or {}).get('reachable')),
        'aitoolkit': bool((caps.get('aitoolkit') or {}).get('valid')),
        'joycaption': bool((caps.get('captioners') or {}).get('joycaption')),
        'face_scoring': bool((caps.get('face_scoring') or {}).get('available')),
        'masks': bool((caps.get('masks') or {}).get('available')),
        'bank_scoring': bool((caps.get('bank_scoring') or {}).get('cuda')
                             or (caps.get('bank_scoring') or {}).get('available')),
        'watermark_inpaint': bool((caps.get('watermark_inpaint') or {}).get('available')),
        'training': bool(caps.get('training_visible')),
        'vram_gb': (caps.get('python') or {}).get('vram_gb')
                   or (caps.get('comfyui') or {}).get('vram_gb'),
        'device_name': device_display_name(),
        'node_id': ensure_node_id(),
        'kinds': sorted(_VALID_KINDS),
    }


def mint_join_token(label: str | None = None) -> dict:
    if not is_primary():
        raise RuntimeError('join tokens are only issued on a Primary')
    raw = secrets.token_urlsafe(32)
    row = ClusterJoinToken(
        token_hash=_hash_token(raw),
        label=(label or '').strip() or None,
        expires_at=datetime.utcnow() + timedelta(hours=JOIN_TOKEN_TTL_HOURS),
    )
    db.session.add(row)
    db.session.commit()
    with _join_token_lock:
        _join_token_plaintext[row.id] = raw
    return {
        'id': row.id,
        'token': raw,
        'label': row.label,
        'expires_at': row.expires_at.isoformat() if row.expires_at else None,
    }


def list_join_tokens() -> list[dict]:
    rows = (ClusterJoinToken.query
            .order_by(ClusterJoinToken.created_at.desc())
            .limit(50)
            .all())
    out = []
    now = datetime.utcnow()
    with _join_token_lock:
        for r in rows:
            d = r.to_dict()
            expired = bool(r.expires_at and r.expires_at < now)
            if r.redeemed_at or expired:
                # A token that can no longer be redeemed must stop being shown:
                # otherwise the panel kept offering the plaintext of every
                # expired token until the process restarted.
                _join_token_plaintext.pop(r.id, None)
            elif r.id in _join_token_plaintext:
                d['token'] = _join_token_plaintext[r.id]   # still in this process
            out.append(d)
    return out


def redeem_join_token(token: str, name: str | None = None,
                      capabilities_blob: dict | None = None) -> dict:
    """Peer calls this on the Primary. Returns device_id + auth_token (once)."""
    if not is_primary():
        raise RuntimeError('this install is not a Primary')
    token = (token or '').strip()
    if not token:
        raise ValueError('join token required')
    th = _hash_token(token)
    row = ClusterJoinToken.query.filter_by(token_hash=th).first()
    if row is None:
        raise ValueError('invalid join token')
    if row.redeemed_at is not None:
        raise ValueError('join token already used')
    if row.expires_at and row.expires_at < datetime.utcnow():
        raise ValueError('join token expired')

    auth_token = secrets.token_urlsafe(32)
    device_id = str(uuid.uuid4())
    display = (name or '').strip() or f'Peer-{device_id[:8]}'
    # Claim the token with a CONDITIONAL update, the same shape pull_next_job
    # uses: the read-then-write above is a race, and losing it would mint two
    # devices from one single-use token.
    claimed = (ClusterJoinToken.query
               .filter_by(id=row.id)
               .filter(ClusterJoinToken.redeemed_at.is_(None))
               .update({'redeemed_at': datetime.utcnow(),
                        'redeemed_device_id': device_id}))
    if not claimed:
        db.session.rollback()
        raise ValueError('join token already used')
    device = ClusterDevice(
        id=device_id,
        name=display,
        auth_token_hash=_hash_token(auth_token),
        capabilities=json.dumps(capabilities_blob or {}),
        last_heartbeat=datetime.utcnow(),
        busy=0,
    )
    db.session.add(device)
    db.session.commit()
    with _join_token_lock:
        _join_token_plaintext.pop(row.id, None)
    return {
        'device_id': device_id,
        'auth_token': auth_token,
        'name': display,
        'primary_node_id': ensure_node_id(),
    }


def authenticate_peer(presented: str | None) -> ClusterDevice | None:
    if not presented or not is_primary():
        return None
    th = _hash_token(presented.strip())
    device = (ClusterDevice.query
              .filter_by(auth_token_hash=th)
              .filter(ClusterDevice.revoked_at.is_(None))
              .first())
    return device


def list_devices(*, include_local: bool = True) -> list[dict]:
    """Devices available for the Run-on picker (Primary or standalone)."""
    devices = []
    if include_local:
        caps = local_capabilities()
        devices.append({
            'id': LOCAL_DEVICE_ID,
            'name': device_display_name() + ' (this machine)',
            'online': True,
            'busy': False,
            'capabilities': caps,
            'local': True,
        })
    if is_primary():
        for row in (ClusterDevice.query
                    .filter(ClusterDevice.revoked_at.is_(None))
                    .order_by(ClusterDevice.name.asc())
                    .all()):
            d = row.to_dict(online_ttl_seconds=ONLINE_TTL_SECONDS)
            d['local'] = False
            devices.append(d)
    return devices


def rename_device(device_id: str, name: str) -> dict:
    name = (name or '').strip()
    if not name:
        raise ValueError('name required')
    if device_id == LOCAL_DEVICE_ID:
        cfg.save_config({'cluster': {'device_name': name}})
        return {'id': LOCAL_DEVICE_ID, 'name': name}
    row = ClusterDevice.query.get(device_id)
    if row is None or row.revoked_at:
        raise ValueError('device not found')
    row.name = name[:120]
    db.session.commit()
    return row.to_dict()


def revoke_device(device_id: str) -> None:
    if device_id == LOCAL_DEVICE_ID:
        raise ValueError('cannot revoke the local device')
    row = ClusterDevice.query.get(device_id)
    if row is None:
        raise ValueError('device not found')
    row.revoked_at = datetime.utcnow()
    # Fail any pending/claimed jobs aimed at this peer.
    for job in (ClusterJob.query
                .filter_by(device_id=device_id)
                .filter(ClusterJob.status.in_(('pending', 'claimed', 'running')))
                .all()):
        _fail_cluster_job(job, 'device revoked')
    db.session.commit()


def heartbeat(device: ClusterDevice, capabilities_blob: dict | None = None,
              busy: bool | None = None) -> dict:
    device.last_heartbeat = datetime.utcnow()
    if capabilities_blob is not None:
        device.capabilities = json.dumps(capabilities_blob)
    if busy is not None:
        device.busy = 1 if busy else 0
    db.session.commit()
    return {'ok': True, 'server_time': datetime.utcnow().isoformat()}


def normalize_device_id(device_id: str | None) -> str:
    d = (device_id or LOCAL_DEVICE_ID).strip() or LOCAL_DEVICE_ID
    if d in ('', 'auto', 'local'):
        return LOCAL_DEVICE_ID
    return d


def require_remote_device(device_id: str) -> ClusterDevice:
    device_id = normalize_device_id(device_id)
    if device_id == LOCAL_DEVICE_ID:
        raise ValueError('local device does not use the cluster job table')
    if not is_primary():
        raise RuntimeError('remote devices require Primary role')
    row = ClusterDevice.query.get(device_id)
    if row is None or row.revoked_at:
        raise ValueError('device not found or revoked')
    return row


def create_cluster_job(*, device_id: str, kind: str, payload: dict,
                       image_job_id: str | None = None,
                       job_id: str | None = None) -> ClusterJob:
    device_id = normalize_device_id(device_id)
    if device_id == LOCAL_DEVICE_ID:
        raise ValueError('create_cluster_job is for remote peers only')
    if kind not in _VALID_KINDS:
        raise ValueError(f'unsupported kind: {kind}')
    require_remote_device(device_id)
    job_id = job_id or str(uuid.uuid4())
    row = ClusterJob(
        job_id=job_id,
        device_id=device_id,
        kind=kind,
        status='pending',
        payload=json.dumps(payload or {}),
        image_job_id=image_job_id,
    )
    db.session.add(row)
    db.session.commit()
    return row


def pull_next_job(device: ClusterDevice) -> dict | None:
    """Atomically claim the oldest pending job for this peer."""
    job = (ClusterJob.query
           .filter_by(device_id=device.id, status='pending')
           .order_by(ClusterJob.created_at.asc())
           .first())
    if job is None:
        return None
    # Claim race: only succeed if still pending.
    updated = (ClusterJob.query
               .filter_by(job_id=job.job_id, status='pending')
               .update({
                   'status': 'claimed',
                   'claimed_at': datetime.utcnow(),
                   'last_heartbeat': datetime.utcnow(),
               }))
    db.session.commit()
    if not updated:
        return None
    db.session.refresh(job)
    device.busy = 1
    device.last_heartbeat = datetime.utcnow()
    db.session.commit()

    payload = job.payload_dict()
    # Attach absolute-ish artifact download names for the peer.
    artifacts = payload.get('artifacts') or []
    return {
        'job_id': job.job_id,
        'kind': job.kind,
        'payload': payload,
        'artifacts': artifacts,
        'image_job_id': job.image_job_id,
    }


def peer_job_heartbeat(device: ClusterDevice, job_id: str,
                       progress: dict | None = None) -> None:
    job = ClusterJob.query.filter_by(job_id=job_id, device_id=device.id).first()
    if job is None:
        raise ValueError('job not found')
    if job.status not in ('claimed', 'running'):
        return
    job.status = 'running'
    job.last_heartbeat = datetime.utcnow()
    if progress is not None:
        job.progress = json.dumps(progress)
    device.last_heartbeat = datetime.utcnow()
    db.session.commit()


def complete_cluster_job(device: ClusterDevice, job_id: str, *,
                         result: dict | None = None,
                         error: str | None = None,
                         output_artifact: str | None = None) -> None:
    job = ClusterJob.query.filter_by(job_id=job_id, device_id=device.id).first()
    if job is None:
        raise ValueError('job not found')
    if job.status in ('completed', 'failed', 'cancelled'):
        return
    failed = bool(error)
    job.status = 'failed' if failed else 'completed'
    job.completed_at = datetime.utcnow()
    job.last_heartbeat = datetime.utcnow()
    job.error_message = error
    result_body = dict(result or {})
    if output_artifact:
        result_body['output_artifact'] = output_artifact
    job.result = json.dumps(result_body)
    device.busy = 0
    device.last_heartbeat = datetime.utcnow()
    db.session.commit()

    if job.kind == 'comfy' and job.image_job_id:
        _finish_comfy_bridge(job, failed=failed, error=error,
                             output_artifact=output_artifact)


def _fail_cluster_job(job: ClusterJob, error: str) -> None:
    job.status = 'failed'
    job.completed_at = datetime.utcnow()
    job.error_message = error
    if job.kind == 'comfy' and job.image_job_id:
        _finish_comfy_bridge(job, failed=True, error=error, output_artifact=None)


def _finish_comfy_bridge(job: ClusterJob, *, failed: bool, error: str | None,
                         output_artifact: str | None) -> None:
    """Map a finished remote Comfy ClusterJob onto ImageGenerationQueue + dispatch."""
    from ..job_queue import _dispatch_completion

    img = ImageGenerationQueue.query.filter_by(job_id=job.image_job_id).first()
    if img is None:
        logger.warning('cluster: image job %s missing for cluster job %s',
                       job.image_job_id, job.job_id)
        return
    if img.status in ('completed', 'failed', 'cancelled'):
        return

    filename = None
    if not failed and output_artifact:
        try:
            src = artifact_path(job.job_id, output_artifact)
            # Place beside Comfy output semantics: completion handlers fetch via
            # comfy view OR local path — dataset linker uses fetch/move helpers.
            # Write into a hub-local holding name under artifacts and pass that
            # basename; linkers that expect Comfy output use fetch_output which
            # we short-circuit by copying into comfy output dir when configured.
            filename = _materialize_comfy_output(job.job_id, src, output_artifact)
        except Exception:
            logger.exception('cluster: failed to materialize output for %s', job.job_id)
            failed = True
            error = error or 'failed to materialize peer output'

    img.update_status(
        'failed' if failed else 'completed',
        error_message=error if failed else None,
        result_filename=filename,
    )
    db.session.commit()
    _dispatch_completion(img, filename, failed)


def _materialize_comfy_output(job_id: str, src: Path, output_name: str) -> str:
    """Copy peer output where local completion code expects to find it."""
    from ..utils import comfy_fs
    out_dir = cfg.comfyui_dir('output')
    if out_dir:
        try:
            out_dir = Path(out_dir)
            out_dir.mkdir(parents=True, exist_ok=True)
            dest_name = f'cluster_{job_id[:8]}_{os.path.basename(output_name)}'
            dest = out_dir / dest_name
            shutil.copy2(src, dest)
            return dest_name
        except Exception:
            logger.exception('cluster: copy into Comfy output failed; using artifact path')
    # Fallback: keep under artifacts; callers that only have basename may fail —
    # also stash absolute path in a sidecar for link helpers if needed.
    return os.path.basename(output_name)


def enqueue_remote_comfy(*, device_id: str, image_job_id: str, workflow: dict,
                         artifact_names: list[str], metadata: dict | None = None) -> ClusterJob:
    """After ImageGenerationQueue row exists with worker_id=device_id."""
    payload = {
        'workflow': workflow,
        'artifacts': list(artifact_names),
        'metadata': metadata or {},
        'client_id': 'lds-peer',
    }
    return create_cluster_job(
        device_id=device_id,
        kind='comfy',
        payload=payload,
        image_job_id=image_job_id,
        job_id=image_job_id,  # align ids so artifact dirs match
    )


def enqueue_generic(*, device_id: str, kind: str, payload: dict,
                    job_id: str | None = None) -> ClusterJob:
    """infer / vision / training jobs aimed at a peer."""
    device_id = normalize_device_id(device_id)
    if device_id == LOCAL_DEVICE_ID:
        raise ValueError('generic remote enqueue requires a peer device_id')
    return create_cluster_job(
        device_id=device_id, kind=kind, payload=payload, job_id=job_id)


def status_summary() -> dict:
    """Settings / overview payload."""
    r = role()
    peers = []
    if is_primary():
        peers = [d.to_dict() for d in
                 ClusterDevice.query.filter(ClusterDevice.revoked_at.is_(None)).all()]
    pending = 0
    if is_primary():
        pending = ClusterJob.query.filter_by(status='pending').count()
    return {
        'role': r,
        'device_name': device_display_name(),
        'node_id': ensure_node_id(),
        'primary_url': (cfg.get('cluster.primary_url') or '').rstrip('/'),
        'peer_configured': bool(cfg.get('cluster.peer_token') and cfg.get('cluster.primary_url')),
        'peers': peers,
        'pending_remote_jobs': pending,
        'local_capabilities': local_capabilities() if r != 'peer' else local_capabilities(),
    }
