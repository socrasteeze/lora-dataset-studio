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
import tempfile
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

# After Stop, how long the hub waits for the peer to wind down and hand back
# what it finished. The peer learns of the cancel on its next heartbeat, the
# script checks the sentinel between images, and flushing a cache is quick — so
# this is generous for a clean stop and short enough that a peer which has
# already died does not hold the bank job open.
REMOTE_CANCEL_GRACE_SECONDS = 120

# peer_worker uploads this LAST, after everything in out/. Its presence is
# therefore the "all of it is home" marker, which is what makes it the right
# thing to wait for after a Stop.
RESULT_ARTIFACT = 'infer_result.json'
# The vision worker's equivalent: written and uploaded after the loop breaks on
# a cancel, so it carries every answer the peer had already produced.
VISION_RESULT_ARTIFACT = 'vision_result.json'


class RemotePassCancelled(Exception):
    """Stop was pressed on the hub; the peer has been told to abort.

    ``kept`` is the peer's own cancel payload when it wound down in time and
    handed its work back ({'cancelled': True, 'cached': N, 'remaining': M}), or
    None when nothing came home. The callers report those two cases
    differently, because they are different: one keeps the embeddings."""

    def __init__(self, kept=None):
        super().__init__('remote pass stopped')
        self.kept = kept


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
    'tags': '🔖 Tags',
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


# Passes that cannot travel, whatever a peer reports. Mirrors
# image_bank_service.LOCAL_ONLY_STEPS; imported lazily below to avoid a cycle.
#
# The polarity is the OPPOSITE of PASS_PEER_CAPS on purpose. There, silence
# from a peer means "probably fine" — being unable to describe yourself is not
# being unable to work. Here there is nothing to be silent about: no peer
# advertises the tagger at all, so a permissive rule would wave every one of
# them through and the pass would die on the other side.


def device_pass_gate(device_id, step) -> dict:
    """Can ``device_id`` run ``step``? The ONE answer, for every caller.

    This is the DM-shaped port of a rule that lived in three places at once: a
    hardcoded copy in `passDeviceGate.js`, `refuse_steps_for_device` at enqueue,
    and `_check_peer_capability` at run time. The sibling project states the
    reason for having one function better than a comment here can:

        "a picker that offers a machine the submit route would refuse is worse
        than no picker, because it turns a clear 'you cannot' into a job that
        fails a minute later on someone else's screen."

    LDS has shipped that bug in BOTH directions — a peer reporting no scoring
    stack got ✨ Score ticked for the user, and hours earlier the vision passes
    were gated on the HUB's Ollama long after they learned to travel. Two
    opposite bugs in one day is what a rule with three homes buys you.

    Returns ``{'ok', 'blocked', 'reason', 'warn'}`` with a fixed precedence, so
    the same machine never reports two different reasons on two screens:

      1. cannot travel  -- the step never leaves this machine
      2. explicit false -- the peer says it lacks the stack
      3. never reported -- a warning, never a wall
      4. otherwise      -- allowed

    ``device_id`` of None/'local' is always allowed: this function answers the
    REMOTE question only. What is installed on this machine is a different
    question, and the dialog still answers it locally.
    """
    from . import cluster as cluster_svc
    from .image_bank_service import LOCAL_ONLY_STEPS

    label_for = PASS_LABELS.get(step, step)
    ok = {'ok': True, 'blocked': False, 'reason': None, 'warn': None,
          'label': label_for}
    if not device_id or device_id == cluster_svc.LOCAL_DEVICE_ID:
        return ok

    label = cluster_svc.device_label(device_id) or 'that machine'

    if step in LOCAL_ONLY_STEPS:
        return {'ok': False, 'blocked': True, 'warn': None, 'label': label_for,
                'reason': f'{label} can\u2019t run this \u2014 it only runs on this machine'}

    needed = PASS_PEER_CAPS.get(step)
    if not needed:
        return ok

    caps = peer_capabilities(device_id)
    if caps is None:                      # no such device; the id check owns that
        return ok

    hint = ' or '.join(_REQUIRED_CAP_HINT.get(cap, cap) for cap in needed)
    if all(caps.get(cap) is False for cap in needed):
        return {'ok': False, 'blocked': True, 'warn': None, 'label': label_for,
                'reason': f'{label} reports no {hint}'}
    if all(not isinstance(caps.get(cap), bool) for cap in needed):
        return {'ok': True, 'blocked': False, 'reason': None, 'label': label_for,
                'warn': f'{label} hasn\u2019t reported what it can run yet'}
    return ok


def device_pass_verdicts(device_id) -> dict:
    """Every gated step's verdict for one device, for the Run-on picker.

    Served on /api/cluster/devices so the browser reads the verdict instead of
    recomputing it from a second copy of the capability map.
    """
    from .image_bank_service import LOCAL_ONLY_STEPS

    steps = set(PASS_PEER_CAPS) | set(LOCAL_ONLY_STEPS)
    return {step: device_pass_gate(device_id, step) for step in sorted(steps)}


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
        # EVERY name, including the ones whose file we do not upload below:
        # the scripts open only what is in `todo`, but cluster over all of it.
        'images': [name for _p, name in staged],
        'cache': cache_name,           # peer redirects into its out/ and uploads back
        'cancel_file': (cache_name or 'pass') + '.cancel',
        **(extra_payload or {}),
    }
    label = cluster_svc.device_label(device_id)

    with tempfile.TemporaryDirectory(prefix='lds-ship-cache-') as tmp_dir:
        shipped, covered = _ship_cache(cache_path, cache_name, name_to_hub,
                                       tmp_dir)
        # The whole point: an image the shipped cache already covers is not
        # uploaded and not recomputed. Derived from `covered` and nowhere else,
        # so the file and the skip list cannot drift apart.
        to_send = [(p, n) for p, n in staged if n not in covered]
        files = list(to_send)
        if shipped:
            files.append((shipped, cache_name))
            _log(f'{len(covered)} image(s) already done — sending the cache '
                 f'and the remaining {len(to_send)}', 'info',
                 detail=f'to {label}' if label else None, device=label,
                 bank_id=bank_id)
        else:
            _log(f'sending {len(to_send)} image(s) for the {detail_label}',
                 'info', detail=f'to {label}' if label else None, device=label,
                 bank_id=bank_id)
        bank_jobs.progress(job, done=0, total=len(to_send),
                           detail=f'{detail_label} — sending {len(to_send)} '
                                  f'image(s) to the peer')
        job_id = cluster_remote.enqueue_infer_on_device(
            device_id, script=os.path.basename(script), stdin=stdin,
            image_paths=files, timeout=REMOTE_PASS_TIMEOUT_SECONDS)
    staged = to_send

    # The fetch counter is per job and only feeds a progress bar, so it must not
    # survive the pass on ANY exit — cancel and failure both raise below.
    try:
        stopped = _await_remote_job(
            job, job_id, staged_count=len(staged),
            detail_label=detail_label, label=label, bank_id=bank_id,
            progress_from=_stderr_progress(progress_re),
            stop_waits_for=RESULT_ARTIFACT) == 'stopped'
        data = _read_result(job_id)
        # Install BEFORE judging the result. The embeddings are a separate
        # artifact and are expensive; a result LDS cannot read is no reason to
        # throw away a cache that arrived intact — same rule _install_cache
        # already states for a pass whose scores landed. It is also what makes
        # a Stop worth waiting for: this is the line that keeps the work.
        if cache_name:
            _install_cache(job_id, cache_name, cache_path, name_to_hub)
        if stopped:
            # The pass did not finish, so the caller must not apply these as a
            # complete result — but the embeddings are now home, and the peer's
            # own counts say how much. Relaunching resumes from here.
            raise RemotePassCancelled(kept=data if isinstance(data, dict) else None)
        _require_consumable(data, label)
        return _remap_home(data, name_to_hub)
    finally:
        cluster_svc.forget_artifact_fetches(job_id)


def run_remote_vision(job, device_id, *, items, prompt, detail_label,
                      prefer_json=True, fmt='json', bank_id=None):
    """Run an Ollama vision pass on a peer. Yields ``(row_id, answer, error)``
    in the SAME shape ``vision_pool.map_vision`` yields locally — ``answer`` a
    dict of ``{raw, fingerprint, error}`` (``ask()``'s own return shape, not a
    bare string) — so the three callers keep their result-handling loop byte
    for byte, INCLUDING the fingerprint-guarded write it now performs before
    staging a verdict.

    ``items`` is ``[(row_id, path)]``. Requires the peer's own heartbeat to have
    reported Ollama; a bank of 5 000 images must not cross the network to
    discover the peer cannot answer.

    Ordering note: this yields once the WHOLE batch is home, where the local
    pool yields as each answer lands. The callers do not depend on the
    difference — they flush every _VISION_FLUSH_EVERY results either way.

    Stop keeps what the peer had already answered. That is not free: the peer
    breaks out of its loop between images, writes vision_result.json with the
    results so far and uploads it, so the hub waits a bounded moment for that
    file rather than raising the instant Stop is pressed. Rows the peer never
    reached are yielded as None, which every caller already treats as "leave
    this row alone", and each caller's own post-loop `bank_jobs.cancelled`
    check is what reports the stop.
    """
    from . import bank_transfer_metadata
    from . import cluster as cluster_svc
    from . import cluster_remote

    _check_peer_capability(device_id, 'ollama')

    # Stage only what is actually on disk. A missing file is not an error here
    # any more than it is locally: `ask` returns None for it and the caller
    # counts it as "file gone" and leaves the row alone. Every input item is
    # still yielded below, so progress and the flush cadence stay whole.
    #
    # Fingerprinted HERE, at staging — the closest remote equivalent of the
    # local worker fingerprinting the bytes it just read — so the caller's
    # guard (_prepare_analysis_write / _prepare_watermark_write) can still
    # refuse a write against a source that changed while the peer had it.
    order = []
    staged = []
    fingerprint_by_row = {}
    path_by_row = {}
    for row_id, path in items:
        name = _artifact_name(row_id, path) if path else None
        if name and os.path.isfile(path):
            staged.append((path, name))
            fingerprint_by_row[row_id] = (
                bank_transfer_metadata.content_fingerprint_path(path))
            path_by_row[row_id] = path
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
                          progress_from=_vision_progress,
                          stop_waits_for=VISION_RESULT_ARTIFACT)
        data = cluster_remote.read_job_result_json(job_id) or {}
        # 'items' is what the peer actually writes; 'results' is read as a
        # fallback only. Looking for 'results' alone found nothing in the file
        # the peer sends, so EVERY row came back as "the peer never answered"
        # and each caller left it alone — a framing, watermark or caption pass
        # on a peer completed having changed nothing at all. Nothing caught it
        # because every test of this function stubs the function itself.
        answers = data.get('items')
        if answers is None:
            answers = data.get('results') or []
        by_name = {os.path.basename(str(r.get('artifact') or '')): r
                   for r in answers}
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
        # The HUB's own path for this row, not the peer's — the guard
        # re-resolves the row against ITS filesystem, and a None here would
        # always fail that comparison and silently drop every remote verdict
        # (found via a full round trip test, not a conflict marker: nothing
        # here disagreed on merge, the two halves of this feature were simply
        # never introduced to each other).
        yield (row_id, path_by_row.get(row_id)), {
            'raw': got.get('text') or '',
            'fingerprint': fingerprint_by_row.get(row_id),
            'error': None}, None


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
                      progress_from, stop_waits_for=None):
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
    # Set once the user has pressed Stop: from then on we are no longer waiting
    # for the pass, we are waiting for the peer to WIND DOWN — which it does
    # cleanly and quickly, flushing its cache on the way. See the grace below.
    give_up_at = None
    while True:
        if bank_jobs.cancelled(job) and give_up_at is None:
            cluster_svc.cancel_cluster_job(job_id)
            # Do NOT raise here. The peer polls its heartbeat, drops the cancel
            # sentinel the script watches, and the script exits 0 having flushed
            # its cache — which peer_worker uploads. Raising the instant Stop
            # was pressed abandoned that upload every time: 73 orphaned .npz
            # files under data/cluster_artifacts prove the work arrived and
            # nobody installed it.
            give_up_at = time.monotonic() + REMOTE_CANCEL_GRACE_SECONDS
            bank_jobs.progress(
                job, detail=f'stopping — waiting for {label or "the peer"} to '
                            f'hand back what it finished')
        if give_up_at is not None:
            # Wait on the ARTIFACT, never the row: cancel_cluster_job already
            # set this row to 'cancelled', and complete_cluster_job returns
            # early on a terminal row — so the status can never reach
            # 'completed' here and polling it would burn the whole grace every
            # single time. peer_worker uploads stop_waits_for LAST, after out/,
            # so its arrival means the cache is home too.
            if stop_waits_for and _artifact_exists(job_id, stop_waits_for):
                _log(f'{label or "the peer"} handed back what it finished',
                     'ok', device=label, bank_id=bank_id)
                return 'stopped'
            if not stop_waits_for or time.monotonic() > give_up_at:
                # Nothing to wait for, or it never came. Exactly the behaviour
                # from before the grace existed: stopped, nothing kept.
                raise RemotePassCancelled()
            time.sleep(POLL_SECONDS)
            continue
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


def _ship_cache(cache_path, cache_name, name_to_hub, tmp_dir):
    """Re-key the hub's existing cache for the peer, and say which artifact
    names it already covers.

    Returns ``(shipped_path_or_None, covered_names)``. The two are returned
    TOGETHER on purpose and must stay that way: `covered_names` is what lets the
    caller skip uploading an image, and skipping an upload is only correct
    because the embedding for it is in the file being shipped. Faces clustering
    runs over every embedding the script can see — a peer sent the new images
    and no cache would return different person groups, silently.

    `sigs` are blanked. The peer's copies are the same bytes with different
    mtimes, so a hub-computed signature would mismatch there and the script
    would recompute everything; an EMPTY sig is the case its own `_is_stale`
    already documents as "never called stale". Freshness is still enforced —
    here, by the hub, against its own files, before an entry is shipped at all.
    """
    if not cache_path or not cache_name or not os.path.isfile(str(cache_path)):
        return None, set()
    try:
        import numpy as np

        hub_to_name = {hub: name for name, hub in name_to_hub.items()}
        with np.load(str(cache_path), allow_pickle=False) as z:
            arrays = {name: z[name] for name in z.files}
        paths = [str(p) for p in arrays['paths']]
        sigs = [str(s) for s in arrays['sigs']] if 'sigs' in arrays else None

        keep_idx, keep_names = [], []
        for i, hub in enumerate(paths):
            name = hub_to_name.get(hub)
            if name is None:
                continue            # not in this pass; nothing to send it for
            if sigs is not None and sigs[i] and not _sig_matches(hub, sigs[i]):
                continue            # edited since it was scored — let it redo
            keep_idx.append(i)
            keep_names.append(name)
        if not keep_idx:
            return None, set()

        out = {n: arr[keep_idx] for n, arr in arrays.items() if n != 'paths'}
        out['paths'] = np.array(keep_names)
        if sigs is not None:
            out['sigs'] = np.array([''] * len(keep_idx))
        shipped = os.path.join(str(tmp_dir), cache_name)
        np.savez(shipped, **out)
        return shipped, set(keep_names)
    except Exception:
        # Never fail a pass over an optimisation. Without a shipped cache the
        # caller stages everything, which is exactly the old behaviour.
        logger.exception('bank_remote: could not prepare the cache for the peer '
                         '— sending the whole pass instead')
        return None, set()


def _sig_matches(path, sig) -> bool:
    try:
        st = os.stat(path)
    except OSError:
        return False            # cannot check -> do not claim it is fresh
    return sig == f'{st.st_size}:{st.st_mtime_ns}'


def _artifact_exists(job_id, name) -> bool:
    from . import cluster as cluster_svc
    try:
        return cluster_svc.artifact_path(job_id, name).is_file()
    except (FileNotFoundError, OSError):
        return False


def _read_result(job_id) -> dict:
    from . import cluster as cluster_svc
    try:
        path = cluster_svc.artifact_path(job_id, 'infer_result.json')
        return json.loads(path.read_text(encoding='utf-8')) or {}
    except (OSError, ValueError, FileNotFoundError) as e:
        raise RuntimeError(f'remote pass finished but its result could not be '
                           f'read: {e}') from e


# Every infer script answers with at least one of these. `ok` is not enough on
# its own: joycaption_infer returns {'captions': …, 'errors': …} and never sets
# it, so an ok-only check would refuse a healthy caption pass.
_RESULT_FIELDS = ('ok', 'error', 'results', 'captions')


def _require_consumable(data: dict, label) -> None:
    """Fail on a result the callers cannot read, BEFORE `_remap_home` — which
    injects empty results/clusters/captions keys and would hide the difference.

    A peer on older code answers an unparseable stdout with `{'stdout': …}`,
    which used to reach `_faces_job` and surface as "face pass produced no
    output (rc=0)" — an exit code the hub never observed, over a pass that had
    actually run. Name the machine and quote what it sent instead."""
    if isinstance(data, dict) and any(k in data for k in _RESULT_FIELDS):
        return
    raw = str((data or {}).get('stdout') or '').strip()
    extra = f' — it sent: {raw[-200:]}' if raw else ''
    raise RuntimeError(f'the pass finished on {label or "the peer"} but it '
                       f'returned no result LDS could read{extra}')


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
    """Bring the .npz home: re-key `paths` to hub paths, keep EVERY other array
    the script wrote, and recompute `sigs` from the hub's files (the peer's
    mtimes mean nothing here — a sig mismatch would silently drop every entry on
    the next read).

    "Every other array" is the load-bearing word. This used to write a fixed
    paths/states/embs/sigs schema, which is the Score cache's shape minus its
    scores and NOT the Faces cache's shape at all: `face_embed_infer._load_cache`
    reads `dets` and `bfracs` too, so an installed faces cache raised KeyError,
    logged "cache unreadable, recomputing" and returned {} — after OVERWRITING
    the good local cache with the lossy one. Every faces pass on such a bank
    then recomputed from zero, local or remote. Copy what arrived; only `paths`
    is ours to rewrite.

    `sigs` is written only when the source had it. Score keys staleness on it;
    Faces has no such array and must not gain one, or the file stops matching
    what its own script writes.

    Guarded end to end: a cache that cannot be installed degrades the embeddings
    features and says so in the log; it must never fail a pass whose scores
    already landed."""
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
            arrays = {name: z[name] for name in z.files}
        paths = [str(p) for p in arrays['paths']]
        keep_idx, keep_paths, keep_sigs = [], [], []
        for i, p in enumerate(paths):
            home = _map_home(p, name_to_hub)
            if home is None:
                continue
            try:
                st = os.stat(home)
                sig = f'{st.st_size}:{st.st_mtime_ns}'
            except OSError:
                sig = ''
            keep_idx.append(i)
            keep_paths.append(home)
            keep_sigs.append(sig)
        if not keep_paths:
            return
        out = {name: arr[keep_idx] for name, arr in arrays.items()
               if name != 'paths'}
        out['paths'] = np.array(keep_paths)
        if 'sigs' in arrays:
            out['sigs'] = np.array(keep_sigs)
        os.makedirs(os.path.dirname(str(cache_path)), exist_ok=True)
        np.savez(str(cache_path), **out)
    except Exception:
        logger.exception('bank_remote: could not install the returned cache — '
                         'scores landed, embeddings features degraded')