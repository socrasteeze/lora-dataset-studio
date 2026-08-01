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

def _log(message, level='info', detail=None, device=None, bank_id=None):
    """Narrate the remote round trip into the activity log.

    These are the entries that did not exist at all: a remote pass takes no
    local GPU window on purpose, so the panel's "GPU taken exclusively" line
    cannot fire for it, and the log fell silent between 'score started' and
    'score finished' — minutes or hours during which nothing said the work had
    left the machine. Guarded like every other logging path: it must never
    break the pass it describes."""
    try:
        from . import activity_log
        activity_log.record('peer', message, level=level, detail=detail,
                            device=device, bank_id=bank_id)
    except Exception:      # noqa: BLE001
        pass


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
    'joycaption': 'JoyCaption',
    'ollama': 'Ollama with a vision model',
}

# Which capability a PEER must report before a pipeline pass can travel to it.
# This map existed only as five scattered call-site keyword arguments plus
# _peer_caption_kind, so nothing could answer "can that machine run this pass?"
# without starting the pass. A tuple is an ANY-of: captions run on either engine,
# so only a peer reporting both missing is refused.
#
# The three steps NOT listed here never travel — scan, auto_reject and
# semantic_dedup read the hub's database and embeddings cache — so no device can
# block them. Absent from this map means "always allowed", not "unknown".
PASS_PEER_CAPS = {
    'score': ('bank_scoring',),
    'faces': ('face_scoring',),
    'watermark': ('ollama',),
    'framing': ('ollama',),
    'caption': ('joycaption', 'ollama'),
}

PASS_LABELS = {
    'score': '✨ Score',
    'faces': '👥 Group by person',
    'watermark': '🚩 Find watermarks',
    'framing': '📐 Classify framing',
    'caption': '🏷️ Caption',
}


def peer_capabilities(device_id) -> dict | None:
    """The peer's last self-reported capability blob, or None when there is no
    such device. An unparsable/absent blob reads as {} — every gate built on
    this then sees "unknown", never "missing"."""
    from ..models import ClusterDevice
    row = ClusterDevice.query.filter_by(id=device_id).first()
    if row is None:
        return None
    try:
        return json.loads(row.capabilities or '{}')
    except (TypeError, ValueError):
        return {}


def peer_refusal(device_id, step) -> str | None:
    """The missing stack that stops ``step`` running on this peer, or None.

    Same polarity as _check_peer_capability, deliberately: only an EXPLICIT
    False refuses. A peer that has never checked in reports nothing, and being
    unable to describe yourself is not the same as being unable to do the work.
    """
    needed = PASS_PEER_CAPS.get(step)
    if not needed:
        return None
    caps = peer_capabilities(device_id)
    if caps is None:
        return None
    if not all(caps.get(cap) is False for cap in needed):
        return None
    return ' or '.join(_REQUIRED_CAP_HINT.get(cap, cap) for cap in needed)


def _check_peer_capability(device_id, required_cap) -> None:
    """Refuse up front when the peer's OWN last heartbeat already reported the
    needed stack missing — rather than staging every image in the bank across
    the network only to fail on the first one. An explicit False blocks; an
    absent/empty blob (never heartbeated yet) does not, so a peer that just
    joined is not refused on a technicality it hasn't had the chance to report."""
    if not required_cap:
        return
    caps = peer_capabilities(device_id)
    if caps is None:
        return
    if caps.get(required_cap) is False:
        hint = _REQUIRED_CAP_HINT.get(required_cap, required_cap)
        raise RuntimeError(
            f"the peer's last check-in reported {hint} as not installed — "
            f'run Setup ▸ Quality tools on the peer, or Run on a different '
            f'device')


def run_remote_pass(job, device_id, *, script, by_path, extra_payload,
                    cache_path, progress_re, detail_label,
                    required_cap=None, bank_id=None) -> dict | None:
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

    # No cache for every pass: the caption script writes no .npz. Passing None
    # keeps the cancel sentinel (which the scripts poll) without inventing a
    # cache name the peer would then try to upload.
    cache_name = os.path.basename(str(cache_path)) if cache_path else None
    stdin = {
        # Artifact names, not hub paths: the peer rewrites each entry to its
        # downloaded copy by basename, and these names ARE their basenames.
        'images': [name for _p, name in staged],
        'cache': cache_name,           # peer redirects into its out/ and uploads back
        'cancel_file': (cache_name or 'pass') + '.cancel',
        **(extra_payload or {}),
    }
    label = cluster_svc.device_label(device_id)
    bank_jobs.progress(job, done=0, total=len(staged),
                       detail=f'{detail_label} — sending {len(staged)} image(s) '
                              f'to the peer')
    _log(f'sending {len(staged)} image(s) for the {detail_label}', 'info',
         detail=f'to {label}' if label else None, device=label, bank_id=bank_id)
    job_id = cluster_remote.enqueue_infer_on_device(
        device_id, script=os.path.basename(script), stdin=stdin,
        image_paths=staged, timeout=REMOTE_PASS_TIMEOUT_SECONDS)

    # The fetch counter is per job and only feeds a progress bar, so it must not
    # survive the pass on ANY exit — cancel and failure both raise below.
    try:
        _await_remote_job(job, job_id, staged_count=len(staged),
                          detail_label=detail_label, label=label, bank_id=bank_id,
                          progress_from=_stderr_progress(progress_re))
        data = _read_result(job_id)
        if cache_name:
            _install_cache(job_id, cache_name, cache_path, name_to_hub)
        return _remap_home(data, name_to_hub)
    finally:
        cluster_svc.forget_artifact_fetches(job_id)


def run_remote_vision(job, device_id, *, items, prompt, detail_label,
                      prefer_json=True, fmt='json', bank_id=None):
    """Run an Ollama vision pass on a peer. Yields ``(row_id, raw, error)`` in
    the SAME shape ``vision_pool.map_vision`` yields locally, so the three
    callers keep their result-handling loop byte for byte — the parsing, the
    staged ``pending`` writes and the flush cadence are the local ones.

    ``items`` is ``[(row_id, path)]``. Requires the peer's own heartbeat to have
    reported Ollama; a bank of 5 000 images must not cross the network to
    discover the peer cannot answer.

    Ordering note: this yields once the WHOLE batch is home, where the local
    pool yields as each answer lands. The callers do not depend on the
    difference — they flush every _VISION_FLUSH_EVERY results either way — but
    a Stop mid-pass therefore keeps only what the peer had already returned,
    which is what its own between-images cancel check gives us.
    """
    from . import cluster as cluster_svc
    from . import cluster_remote

    _check_peer_capability(device_id, 'ollama')

    # Stage only what is actually on disk. A missing file is not an error here
    # any more than it is locally: `ask` returns None for it and the caller
    # counts it as "file gone" and leaves the row alone. Every input item is
    # still yielded below, so progress and the flush cadence stay whole.
    order = []
    staged = []
    for row_id, path in items:
        name = _artifact_name(row_id, path) if path else None
        if name and os.path.isfile(path):
            staged.append((path, name))
        else:
            name = None
        order.append((row_id, name))
    if not staged:
        for row_id, _name in order:
            yield (row_id, None), None, None
        return

    label = cluster_svc.device_label(device_id)
    bank_jobs.progress(job, done=0, total=len(staged),
                       detail=f'{detail_label} — sending {len(staged)} image(s) '
                              f'to the peer')
    _log(f'sending {len(staged)} image(s) for the {detail_label}', 'info',
         detail=f'to {label}' if label else None, device=label, bank_id=bank_id)

    job_id = cluster_remote.enqueue_vision_on_device(
        device_id, staged, prompt=prompt, prefer_json=prefer_json, fmt=fmt)
    try:
        _await_remote_job(job, job_id, staged_count=len(staged),
                          detail_label=detail_label, label=label, bank_id=bank_id,
                          progress_from=_vision_progress)
        data = cluster_remote.read_job_result_json(job_id) or {}
        by_name = {os.path.basename(str(r.get('artifact') or '')): r
                   for r in (data.get('results') or [])}
    finally:
        cluster_svc.forget_artifact_fetches(job_id)

    for row_id, name in order:
        got = by_name.get(name) if name else None
        if got is None:
            # The peer never answered for this one — Stop between images, or a
            # file it could not read. NOT an error and NOT an empty answer:
            # `None` is the local pool's "the file is gone", which the callers
            # already treat as leave-the-row-alone.
            yield (row_id, None), None, None
            continue
        yield (row_id, None), got.get('text') or '', None


def _stderr_progress(progress_re):
    """infer: the peer relays the script's stderr, and the SAME regex the local
    driver uses turns `N/M` into the bank's bar."""
    def read(prog):
        m = progress_re.search(str(prog.get('line') or ''))
        return (int(m.group(1)), int(m.group(2))) if m else None
    return read


def _vision_progress(prog):
    """vision: peer_worker._run_vision reports structured counts, no regex."""
    if prog.get('phase') != 'vision':
        return None
    try:
        return int(prog.get('index') or 0) + 1, int(prog.get('total') or 0)
    except (TypeError, ValueError):
        return None


def _await_remote_job(job, job_id, *, staged_count, detail_label, label, bank_id,
                      progress_from):
    """Poll one ClusterJob to completion, mirroring it into the bank's own bar.

    Shared by both remote kinds on purpose: cancellation, the timeout, the
    [peer] log entries and — the part that is easy to lose — reporting the
    TRANSFER instead of going silent for it all live here once. A second copy
    would drift, and the transfer half already had to be fixed once after a
    5 372-image pass was reported as "probably stuck" while it was healthy.
    """
    # Lazy, like every other import in this module — bank_remote is reached from
    # image_bank_service, which cluster imports back.
    from ..extensions import db
    from ..models import ClusterJob
    from . import cluster as cluster_svc

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
            _log(f'{label or "the peer"} finished the {detail_label}', 'ok',
                 device=label, bank_id=bank_id)
            return
        if row.status in ('failed', 'cancelled'):
            reason = row.error_message or f'remote pass {row.status} on the peer'
            _log(f'{label or "the peer"} could not finish the {detail_label}',
                 'error', detail=reason, device=label, bank_id=bank_id)
            raise RuntimeError(reason)
        if time.monotonic() > deadline:
            cluster_svc.cancel_cluster_job(job_id)
            _log(f'{label or "the peer"} stopped answering', 'error',
                 detail=f'no result after {REMOTE_PASS_TIMEOUT_SECONDS // 3600}h',
                 device=label, bank_id=bank_id)
            raise RuntimeError('remote pass timed out — is the peer still up?')
        try:
            prog = json.loads(row.progress or '{}')
        except (TypeError, ValueError):
            prog = {}
        done_total = progress_from(prog)
        if done_total:
            bank_jobs.progress(job, done=done_total[0], total=done_total[1],
                               detail=f'{detail_label} (on the peer)')
        elif row.status in ('claimed', 'running'):
            # EVERY tick, not once. bank_jobs.progress is the only thing that
            # refreshes `_touched`, so latching a single "starting up" line made
            # the activity panel report a healthy transfer as "probably stuck"
            # for its whole duration. The peer pulls each image over the artifact
            # route, so the hub counts what it has served and says so.
            fetched = cluster_svc.artifacts_fetched(job_id)
            if fetched < staged_count:
                bank_jobs.progress(
                    job, done=0, total=staged_count,
                    detail=f'{detail_label} — sending images to '
                           f'{label or "the peer"} ({fetched}/{staged_count})')
            else:
                bank_jobs.progress(
                    job, detail=f'{detail_label} — {label or "the peer"} has the '
                                f'images and is loading its model')
            if not detail_sent:
                # The counterpart to the local window's 'GPU taken exclusively':
                # from here the PEER's card is busy, and this machine's is not.
                _log(f'{label or "the peer"} is running the {detail_label}', 'info',
                     detail='its GPU is busy; this machine stays free',
                     device=label, bank_id=bank_id)
                detail_sent = True
        db.session.expire(row)
        time.sleep(POLL_SECONDS)


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
    # `captions` joins the list for the caption pass: joycaption_infer returns
    # {peer_path: caption}, keyed exactly like `results`.
    for field in ('results', 'clusters', 'captions'):
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