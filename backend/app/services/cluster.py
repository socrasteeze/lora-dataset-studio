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
# Same fence as comfy_fs.STAGED_INPUT_MAX_AGE_SECONDS, for the same reason: long
# enough that a queue running longer than anyone planned cannot lose its inputs.
ARTIFACT_MAX_AGE_SECONDS = 48 * 3600
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


def prune_job_artifacts(max_age_seconds: int = ARTIFACT_MAX_AGE_SECONDS,
                        now: float | None = None) -> int:
    """Boot sweep for artifact folders no live job can still need.

    Every remote job leaves full-size files here: the Primary copies the source
    image (and each extra reference) in on the way out, and the peer uploads its
    output — a rendered image, a vision result, a LoRA checkpoint — back into the
    same folder. Nothing deleted any of it, so the cost of renting a GPU was a
    permanent second copy of every image involved, forever. That is the same leak
    already measured at 0.67 GB over three months for staged ComfyUI inputs (see
    job_queue._prune_staged_inputs), and this folder is worse: the files are
    bigger and it holds both ends of the trip.

    Deliberately a BOOT sweep and not an inline delete on completion. For a
    `comfy` job the output artifact is briefly the only copy that exists — if
    `_materialize_comfy_output` could not reach ComfyUI's output dir it falls back
    to the artifact — and for `vision`/`infer` the result JSON is read back out of
    here by `cluster_remote.read_job_result_json` at a moment nothing controls.
    An age fence costs a bounded amount of disk and cannot destroy the only copy
    of a user's image; deleting on completion could.

    Fenced three ways: this folder belongs to the app (not to ComfyUI), only
    whole per-job directories are considered, nothing younger than
    `max_age_seconds` is touched, and any job still pending/claimed/running is
    spared outright. Returns the number of folders removed.
    """
    import time
    now = time.time() if now is None else now
    cutoff = now - max_age_seconds
    live = set()
    try:
        live = {j.job_id for j in (ClusterJob.query
                                   .filter(ClusterJob.status.in_(
                                       ('pending', 'claimed', 'running')))
                                   .all())}
    except Exception:
        # No table yet (first boot) — the sweep is still safe, just unfenced by
        # liveness, and the age fence alone already covers anything in flight.
        logger.debug('cluster: could not read live jobs for the artifact sweep')
    removed = 0
    root = cfg.data_dir() / ARTIFACT_SUBDIR
    if not root.is_dir():
        return 0
    for entry in root.iterdir():
        if not entry.is_dir() or entry.name in live:
            continue
        try:
            if entry.stat().st_mtime >= cutoff:
                continue
            shutil.rmtree(entry, ignore_errors=True)
            removed += 1
        except OSError as exc:
            logger.warning('cluster: could not prune artifacts for %s (%s)',
                           entry.name, exc)
    if removed:
        logger.info('cluster: pruned %d stale artifact folder(s)', removed)
    return removed


def local_capabilities() -> dict:
    """Capability blob a peer heartbeats (or Primary advertises for itself).

    Mind the two SHAPES probe() publishes. `comfyui`/`ollama`/`aitoolkit`/
    `captioners` are nested dicts; `face_scoring`/`masks`/`bank_scoring`/
    `watermark_inpaint`/`training_visible` are FLAT BOOLS. Reading a flat one as
    a mapping — `(caps.get('face_scoring') or {}).get('available')` — looks
    correct on any machine WITHOUT the extra (`False or {}` is a dict) and
    raises `AttributeError: 'bool' object has no attribute 'get'` on one with
    it. That shipped: it took out the Devices tab, the Run-on picker, the join
    and the peer heartbeat loop, on exactly the machines worth renting, while
    every test stayed green. routes/settings.py reads these same keys flat.
    """
    from .. import capabilities
    try:
        caps = capabilities.probe()
    except Exception:
        logger.exception('cluster: capabilities probe failed')
        caps = {}
    # Identity first, so the degraded return below cannot re-run whatever just
    # failed. A device that answers with no gates is still addressable; one that
    # answers with nothing is a 500.
    base = {
        'device_name': device_display_name(),
        'node_id': ensure_node_id(),
        'kinds': sorted(_VALID_KINDS),
    }
    # Keep the wire payload small — peers/hub only need routing gates.
    try:
        return {
            **base,
            'comfyui': bool((caps.get('comfyui') or {}).get('reachable')),
            'ollama': bool((caps.get('ollama') or {}).get('reachable')),
            'aitoolkit': bool((caps.get('aitoolkit') or {}).get('valid')),
            'joycaption': bool((caps.get('captioners') or {}).get('joycaption')),
            'face_scoring': bool(caps.get('face_scoring')),
            'masks': bool(caps.get('masks')),
            'bank_scoring': bool(caps.get('bank_scoring')),
            'watermark_inpaint': bool(caps.get('watermark_inpaint')),
            'training': bool(caps.get('training_visible')),
            # probe() carries no VRAM figure at all (it must stay network-free,
            # and the ComfyUI numbers live in comfyui_runtime_info). Reading a
            # `vram_gb` key off it therefore always yielded None and the picker
            # never showed a card. nvidia-smi, cached 10 min, None = unknown.
            'vram_gb': capabilities.gpu_vram_gb(),
        }
    except Exception:
        # A probe-shape drift must cost a routing gate, not the Devices tab,
        # the picker and the peer's whole pull loop.
        logger.exception('cluster: could not build the capability blob')
        return base


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


# ── Remote ComfyUI backends (the SwarmUI shape) ───────────────────────────
#
# The second way to rent a GPU, next to the peer model above. A backend is a
# BARE ComfyUI on another box (`--listen`), no second app install: this machine
# uploads inputs over `/upload/image`, queues over `/prompt`, polls `/history`,
# downloads over `/view`. Orthogonal to role — a standalone can have backends.
# The trade against a peer stays visible where users choose: a peer is
# authenticated and revocable and can someday run vision/training; a backend is
# zero-setup but raw ComfyUI has NO auth, so it is trusted-network-only.

BACKEND_ID_PREFIX = 'api:'

# probe cache: url -> (expires_monotonic, online: bool). ComfyUI's /system_stats
# answers in milliseconds when up; an unreachable laptop costs the full timeout,
# and the picker must not pay that on every mount.
_backend_probe_cache: dict[str, tuple[float, bool]] = {}
_BACKEND_PROBE_TTL_SECONDS = 30
_BACKEND_PROBE_TIMEOUT_SECONDS = 2


def is_backend_id(device_id: str | None) -> bool:
    return bool(device_id) and str(device_id).startswith(BACKEND_ID_PREFIX)


def list_backends() -> list[dict]:
    """Configured backends, shape-validated — config.json is user-editable."""
    raw = cfg.get('cluster.backends') or []
    out = []
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict):
            continue
        url = str(entry.get('url') or '').strip().rstrip('/')
        bid = str(entry.get('id') or '').strip()
        if not url or not is_backend_id(bid):
            continue
        out.append({'id': bid,
                    'name': str(entry.get('name') or '').strip() or url,
                    'url': url})
    return out


def backend_by_id(device_id: str | None) -> dict | None:
    for b in list_backends():
        if b['id'] == device_id:
            return b
    return None


def add_backend(name: str, url: str) -> dict:
    url = (url or '').strip().rstrip('/')
    if not url.lower().startswith(('http://', 'https://')):
        raise ValueError('backend url must start with http:// or https://')
    if any(b['url'] == url for b in list_backends()):
        raise ValueError('a backend with this URL already exists')
    entry = {'id': f'{BACKEND_ID_PREFIX}{uuid.uuid4().hex[:12]}',
             'name': (name or '').strip()[:120] or url,
             'url': url}
    cfg.save_config({'cluster': {'backends': list_backends() + [entry]}})
    return entry


def remove_backend(device_id: str) -> None:
    kept = [b for b in list_backends() if b['id'] != device_id]
    if len(kept) == len(list_backends()):
        raise ValueError('backend not found')
    cfg.save_config({'cluster': {'backends': kept}})
    # Same courtesy revoke_device extends to peers: rows aimed at a device that
    # no longer exists would sit pending forever, invisible except as a stuck
    # counter. Fail them now with a reason the tile can show.
    from ..job_queue import _dispatch_completion
    from ..models import ImageGenerationQueue
    for job in (ImageGenerationQueue.query
                .filter_by(worker_id=device_id)
                .filter(ImageGenerationQueue.status.in_(
                    ('pending', 'processing', 'sent_to_comfy')))
                .all()):
        job.update_status('failed', error_message='backend removed in Settings')
        db.session.commit()
        _dispatch_completion(job, None, True)


def rename_backend(device_id: str, name: str) -> dict:
    name = (name or '').strip()
    if not name:
        raise ValueError('name required')
    backends = list_backends()
    for b in backends:
        if b['id'] == device_id:
            b['name'] = name[:120]
            cfg.save_config({'cluster': {'backends': backends}})
            return b
    raise ValueError('backend not found')


def probe_backend(url: str, *, fresh: bool = False) -> bool:
    """True when the backend's ComfyUI answers /system_stats. TTL-cached."""
    import time
    import requests
    now = time.monotonic()
    if not fresh:
        hit = _backend_probe_cache.get(url)
        if hit and hit[0] > now:
            return hit[1]
    try:
        r = requests.get(f'{url}/system_stats',
                         timeout=_BACKEND_PROBE_TIMEOUT_SECONDS)
        online = r.status_code == 200
    except requests.RequestException:
        online = False
    _backend_probe_cache[url] = (now + _BACKEND_PROBE_TTL_SECONDS, online)
    return online


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
    # API backends list in EVERY role — that is the standalone/SwarmUI case.
    # 'comfyui': True is definitional (a backend IS a ComfyUI), and busy is
    # unknowable over the bare API, so it is never claimed.
    for b in list_backends():
        devices.append({
            'id': b['id'],
            'name': b['name'],
            'url': b['url'],
            'online': probe_backend(b['url']),
            'busy': False,
            'capabilities': {'comfyui': True, 'kind': 'api_backend'},
            'local': False,
            'backend': True,
        })
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


def device_label(device_id: str | None) -> str | None:
    """The human NAME of a device for logs and progress lines, or None for local.

    Never the uuid. The activity log is the surface users read and paste into
    bug reports, and 'a3f9c1e2-…' answers nothing there while also being an
    identifier we have no reason to publish. A device whose row is gone (revoked
    mid-pass, config hand-edited) degrades to a short generic rather than
    leaking the id anyway — the pass itself already reports that failure."""
    d = normalize_device_id(device_id)
    if d == LOCAL_DEVICE_ID:
        return None
    if is_backend_id(d):
        entry = backend_by_id(d)
        return (entry or {}).get('name') or 'a remote ComfyUI backend'
    try:
        row = ClusterDevice.query.filter_by(id=d).first()
    except Exception:      # noqa: BLE001 — a log label must never raise
        row = None
    return (row.name if row is not None and row.name else 'a compute peer')


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
    # The peer routes everything by artifact BASENAME (see peer_worker), so the
    # Primary's absolute paths are of no use to it — and sending them would put
    # this machine's filesystem layout on the wire and into the peer's own logs.
    md = payload.get('metadata')
    if isinstance(md, dict) and 'staged_input_paths' in md:
        md = dict(md)
        md.pop('staged_input_paths', None)
        payload = {**payload, 'metadata': md}
    artifacts = payload.get('artifacts') or []
    return {
        'job_id': job.job_id,
        'kind': job.kind,
        'payload': payload,
        'artifacts': artifacts,
        'image_job_id': job.image_job_id,
    }


def peer_job_heartbeat(device: ClusterDevice, job_id: str,
                       progress: dict | None = None) -> dict:
    """Returns {'ok': True, 'cancelled': bool} — the heartbeat is the one
    channel the hub has to tell a peer mid-job that Stop was pressed. The peer
    checks the flag and aborts (the infer scripts via their own cancel-file
    sentinel, the vision loop between images)."""
    job = ClusterJob.query.filter_by(job_id=job_id, device_id=device.id).first()
    if job is None:
        raise ValueError('job not found')
    if job.status == 'cancelled':
        return {'ok': True, 'cancelled': True}
    if job.status not in ('claimed', 'running'):
        return {'ok': True, 'cancelled': False}
    job.status = 'running'
    job.last_heartbeat = datetime.utcnow()
    if progress is not None:
        job.progress = json.dumps(progress)
    device.last_heartbeat = datetime.utcnow()
    db.session.commit()
    return {'ok': True, 'cancelled': False}


def cancel_cluster_job(job_id: str) -> bool:
    """Hub-side Stop for a remote job. Pending jobs simply never get pulled
    (the claim filters on 'pending'); a claimed/running one is flagged so the
    NEXT heartbeat tells the peer to abort. True when a live row was flagged."""
    updated = (ClusterJob.query
               .filter_by(job_id=job_id)
               .filter(ClusterJob.status.in_(('pending', 'claimed', 'running')))
               .update({'status': 'cancelled',
                        'completed_at': datetime.utcnow()}))
    db.session.commit()
    return bool(updated)


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
        'local_capabilities': local_capabilities(),
    }
