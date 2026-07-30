"""Run a bank's Score / Face pass on a compute peer.

The peer half already existed (`peer_worker._run_infer` runs the same
`backend/infer` scripts against downloaded artifacts); this is the hub half:
stage the images, wait on the ClusterJob while mirroring its progress into the
bank's own progress bar, then hand back a result dict whose keys are HUB paths
again — so `_score_job`/`_faces_job` consume a remote pass with the exact code
they use for a local one.

Two things only this module worries about:

- **Names.** A bank spanning folders holds duplicate basenames, so every image
  is staged as ``{image_id}__{basename}`` and every peer-side path is mapped
  home through that prefix.
- **The cache.** The scripts write an .npz (paths / states / embs / sigs) that
  powers find-by-text, select-similar and resume — and a remote run writes it
  keyed by PEER temp paths with PEER mtimes. It comes home as an artifact and
  is re-keyed to hub paths with signatures recomputed from the hub's files;
  losing it silently would have broken every embeddings feature the next
  morning with no error anywhere.
"""
from __future__ import annotations

import json
import logging
import os
import time

from . import bank_jobs

logger = logging.getLogger(__name__)

POLL_SECONDS = 2.0
# A whole pass rides ONE ClusterJob (chunking would break the style/person
# clustering the scripts compute over everything they see). The ceiling exists
# so a dead peer cannot pin a bank job forever; scoring ~5k images on a real
# GPU sits far under it.
REMOTE_PASS_TIMEOUT_SECONDS = 6 * 3600


class RemotePassCancelled(Exception):
    """Stop was pressed on the hub; the peer has been told to abort."""


def _artifact_name(image_id, path) -> str:
    return f'{image_id}__{os.path.basename(path)}'


def _map_home(peer_key: str, name_to_hub: dict) -> str | None:
    return name_to_hub.get(os.path.basename(str(peer_key)))


_REQUIRED_CAP_HINT = {
    'bank_scoring': 'bank-scoring',
    'face_scoring': 'face-scoring',
}


def _check_peer_capability(device_id, required_cap) -> None:
    """Refuse up front when the peer's OWN last heartbeat already reported the
    needed stack missing — rather than staging every image in the bank across
    the network only to fail on the first one. An explicit False blocks; an
    absent/empty blob (never heartbeated yet) does not, so a peer that just
    joined is not refused on a technicality it hasn't had the chance to report."""
    if not required_cap:
        return
    from ..models import ClusterDevice
    row = ClusterDevice.query.filter_by(id=device_id).first()
    if row is None:
        return
    try:
        caps = json.loads(row.capabilities or '{}')
    except (TypeError, ValueError):
        caps = {}
    if caps.get(required_cap) is False:
        hint = _REQUIRED_CAP_HINT.get(required_cap, required_cap)
        raise RuntimeError(
            f"the peer's last check-in reported {hint} as not installed — "
            f'run Setup ▸ Quality tools on the peer, or Run on a different '
            f'device')


def run_remote_pass(job, device_id, *, script, by_path, extra_payload,
                    cache_path, progress_re, detail_label,
                    required_cap=None) -> dict | None:
    """Stage → enqueue → poll → remap. Returns the script's result dict with
    hub-keyed ``results``/``clusters``, or None when the pass was stopped.
    Raises RuntimeError with the peer's reason on failure — including, up
    front via ``required_cap`` ('bank_scoring' | 'face_scoring'), when the
    peer's own heartbeat already said it lacks the stack this pass needs."""
    from ..extensions import db
    from ..models import ClusterJob
    from . import cluster as cluster_svc
    from . import cluster_remote

    _check_peer_capability(device_id, required_cap)

    name_to_hub = {}
    staged = []
    for path, image_id in by_path.items():
        name = _artifact_name(image_id, path)
        name_to_hub[name] = path
        staged.append((path, name))

    cache_name = os.path.basename(str(cache_path))
    stdin = {
        # Artifact names, not hub paths: the peer rewrites each entry to its
        # downloaded copy by basename, and these names ARE their basenames.
        'images': [name for _p, name in staged],
        'cache': cache_name,           # peer redirects into its out/ and uploads back
        'cancel_file': cache_name + '.cancel',
        **(extra_payload or {}),
    }
    bank_jobs.progress(job, done=0, total=len(staged),
                       detail=f'{detail_label} — sending {len(staged)} image(s) '
                              f'to the peer')
    job_id = cluster_remote.enqueue_infer_on_device(
        device_id, script=os.path.basename(script), stdin=stdin,
        image_paths=staged, timeout=REMOTE_PASS_TIMEOUT_SECONDS)

    deadline = time.monotonic() + REMOTE_PASS_TIMEOUT_SECONDS
    detail_sent = False
    while True:
        if bank_jobs.cancelled(job):
            cluster_svc.cancel_cluster_job(job_id)
            raise RemotePassCancelled()
        row = ClusterJob.query.filter_by(job_id=job_id).first()
        if row is None:
            raise RuntimeError('remote pass vanished from the cluster queue')
        if row.status == 'completed':
            break
        if row.status in ('failed', 'cancelled'):
            raise RuntimeError(row.error_message
                               or f'remote pass {row.status} on the peer')
        if time.monotonic() > deadline:
            cluster_svc.cancel_cluster_job(job_id)
            raise RuntimeError('remote pass timed out — is the peer still up?')
        # The peer relays the script's stderr lines; the same regex the local
        # driver uses turns them into the bank's own progress bar.
        try:
            prog = json.loads(row.progress or '{}')
        except (TypeError, ValueError):
            prog = {}
        line = str(prog.get('line') or '')
        m = progress_re.search(line)
        if m:
            bank_jobs.progress(job, done=int(m.group(1)), total=int(m.group(2)),
                               detail=f'{detail_label} (on the peer)')
            detail_sent = True
        elif not detail_sent and row.status in ('claimed', 'running'):
            bank_jobs.progress(job, detail=f'{detail_label} — peer is starting up '
                                           f'(downloading images / loading models)')
            detail_sent = True
        db.session.expire(row)
        time.sleep(POLL_SECONDS)

    data = _read_result(job_id)
    _install_cache(job_id, cache_name, cache_path, name_to_hub)
    return _remap_home(data, name_to_hub)


def _read_result(job_id) -> dict:
    from . import cluster as cluster_svc
    try:
        path = cluster_svc.artifact_path(job_id, 'infer_result.json')
        return json.loads(path.read_text(encoding='utf-8')) or {}
    except (OSError, ValueError, FileNotFoundError) as e:
        raise RuntimeError(f'remote pass finished but its result could not be '
                           f'read: {e}') from e


def _remap_home(data: dict, name_to_hub: dict) -> dict:
    """Re-key results/clusters from peer temp paths to hub paths. A key that
    maps nowhere is dropped — consumption treats it as 'not scored', which is
    exactly what it is."""
    out = dict(data)
    for field in ('results', 'clusters'):
        src = data.get(field) or {}
        out[field] = {home: v for k, v in src.items()
                      if (home := _map_home(k, name_to_hub)) is not None}
    return out


def _install_cache(job_id, cache_name, cache_path, name_to_hub) -> None:
    """Bring the .npz home: re-key `paths` to hub paths, recompute `sigs` from
    the hub's files (the peer's mtimes mean nothing here — a sig mismatch would
    silently drop every entry on the next read). Guarded end to end: a cache
    that cannot be installed degrades the embeddings features and says so in
    the log; it must never fail a pass whose scores already landed."""
    import numpy as np

    from . import cluster as cluster_svc
    try:
        src = cluster_svc.artifact_path(job_id, cache_name)
    except FileNotFoundError:
        logger.warning('bank_remote: peer returned no %s — embeddings features '
                       '(find by text, select similar) will need a local pass',
                       cache_name)
        return
    try:
        with np.load(str(src), allow_pickle=False) as z:
            paths = [str(p) for p in z['paths']]
            states = [str(s) for s in z['states']]
            embs = z['embs']
        keep_paths, keep_states, keep_embs, keep_sigs = [], [], [], []
        for i, p in enumerate(paths):
            home = _map_home(p, name_to_hub)
            if home is None:
                continue
            try:
                st = os.stat(home)
                sig = f'{st.st_size}:{st.st_mtime_ns}'
            except OSError:
                sig = ''
            keep_paths.append(home)
            keep_states.append(states[i])
            keep_embs.append(embs[i])
            keep_sigs.append(sig)
        if not keep_paths:
            return
        os.makedirs(os.path.dirname(str(cache_path)), exist_ok=True)
        np.savez(str(cache_path),
                 paths=np.array(keep_paths), states=np.array(keep_states),
                 embs=np.stack(keep_embs), sigs=np.array(keep_sigs))
    except Exception:
        logger.exception('bank_remote: could not install the returned cache — '
                         'scores landed, embeddings features degraded')