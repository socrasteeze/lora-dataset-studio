"""One image, one analysis, shared by every Bank that contains it.

Banks over nested folders (a character folder and each of its outfit folders)
inventory the same files. Every pass used to compute its result once per bank,
so an image in two banks was scanned, scored, face-checked and tagged twice.

The banks stay as they are: each keeps its own rows, decisions, duplicate
groups, person clusters and style clusters, because those are bank-local by
design. What is shared is the per-image result of a pass, keyed by the
image's absolute path:

* PULL, when a pass starts on a bank: rows that lack the pass's result take it
  from a row of an overlapping bank that has it, and the bank's embedding
  caches (Score, Faces) are seeded with the sibling's entries. The pass then
  computes only what no bank has yet. A forced re-run skips the pull.
* PUSH, when a pass finishes: pure per-image results (tags, framing, medium,
  captions, watermark detection) are filled into idle overlapping banks, so
  every bank shows them at once. Scan, Score and Faces are pull-only: the
  receiving bank's own pass must rebuild its duplicate groups and clusters,
  and it does so from the shared data without recomputing anything.

A result is shared only between rows that analyse the same bytes: the same
absolute file, the same recorded size, no bank-side edit, rotation or cleaned
derivative on either row, and no conflicting content fingerprint. Only empty
fields are filled; nothing already stored is overwritten.
"""
from __future__ import annotations

import functools
import inspect
import logging
import os

from sqlalchemy import and_, or_, update

from ..extensions import db
from ..models import BankImage, ImageBank

logger = logging.getLogger(__name__)

_CHUNK = 500


def _lane(todo, ready, columns):
    return {'todo': todo, 'ready': ready, 'columns': columns}


# lane -> which target rows need it, which source rows hold it, what to copy.
LANES = {
    'scan': _lane(lambda: BankImage.quality_state.is_(None),
                  lambda: and_(BankImage.quality_state == 'ok',
                               BankImage.origin.isnot(None)),
                  ('width', 'height', 'quality_state', 'blur_score', 'noise_score',
                   'uniformity_score', 'dhash', 'detail_ratio', 'bars_ratio',
                   'jpeg_quality', 'origin', 'origin_evidence')),
    'tags': _lane(lambda: BankImage.tags_state.is_(None),
                  lambda: BankImage.tags_state == 'ok',
                  ('tags', 'tags_text', 'tags_state')),
    'framing': _lane(lambda: BankImage.framing.is_(None),
                     lambda: BankImage.framing.isnot(None),
                     ('framing',)),
    'medium': _lane(lambda: BankImage.medium.is_(None),
                    lambda: BankImage.medium.isnot(None),
                    ('medium', 'medium_margin')),
    'caption': _lane(lambda: BankImage.caption.is_(None),
                     lambda: BankImage.caption.isnot(None),
                     ('caption', 'caption_origin')),
    'watermark': _lane(lambda: BankImage.watermark_state.is_(None),
                       lambda: BankImage.watermark_state.in_(('none', 'detected')),
                       ('watermark_state', 'watermark_bbox', 'watermark_source',
                        'watermark_score')),
}
# Embedding caches: lane -> image_bank_service helper that names the file.
CACHE_LANES = {'score': '_score_cache_path', 'faces': '_face_cache_path'}
# Lanes whose result carries no bank-level derived state.
PUSH_LANES = ('tags', 'framing', 'medium', 'caption', 'watermark')


def _key(base, relpath) -> str:
    return os.path.normcase(os.path.normpath(os.path.join(base, relpath or '')))


def _base(bank) -> str | None:
    try:
        return os.path.realpath(bank.source_path) if bank and bank.source_path else None
    except (OSError, ValueError):
        return None


def _unedited():
    return and_(BankImage.edit_method.is_(None),
                BankImage.watermark_clean_method.is_(None),
                or_(BankImage.rotation.is_(None), BankImage.rotation == 0))


def _siblings(bank, only=None) -> list:
    from . import image_bank_service as svc
    ids = [o['id'] for o in svc.overlapping_banks(bank.user_id, bank.id)]
    if only is not None:
        ids = [i for i in ids if i in only]
    return [b for b in (db.session.get(ImageBank, i) for i in ids) if b is not None]


def _fill(bank, lane, sources=None) -> int:
    """Copy ``lane`` results into ``bank``'s rows that lack them. Returns rows
    filled."""
    spec = LANES[lane]
    base = _base(bank)
    sibs = _siblings(bank, sources)
    if not base or not sibs:
        return 0
    targets = {}
    for row_id, relpath, size, fingerprint in (
            db.session.query(BankImage.id, BankImage.relpath, BankImage.file_size,
                             BankImage.analysis_fingerprint)
            .filter(BankImage.bank_id == bank.id, spec['todo'](), _unedited())):
        targets[_key(base, relpath)] = (row_id, size, fingerprint)
    if not targets:
        return 0
    columns = spec['columns']
    cols = [getattr(BankImage, c) for c in columns]
    updates = {}
    for sib in sibs:
        sib_base = _base(sib)
        if not sib_base:
            continue
        q = (db.session.query(BankImage.relpath, BankImage.file_size,
                              BankImage.analysis_fingerprint, *cols)
             .filter(BankImage.bank_id == sib.id, spec['ready'](), _unedited()))
        for relpath, size, fingerprint, *values in q:
            hit = targets.get(_key(sib_base, relpath))
            if hit is None:
                continue
            row_id, t_size, t_fingerprint = hit
            if size is not None and t_size is not None and size != t_size:
                continue
            if t_fingerprint and fingerprint and t_fingerprint != fingerprint:
                continue
            values = dict(zip(columns, values))
            if fingerprint and not t_fingerprint:
                values['analysis_fingerprint'] = fingerprint
            updates[row_id] = values
            del targets[_key(sib_base, relpath)]
        if not targets:
            break
    if not updates:
        return 0
    items = list(updates.items())
    for i in range(0, len(items), _CHUNK):
        for row_id, values in items[i:i + _CHUNK]:
            # The todo clause again: a row filled since the read is left alone.
            db.session.execute(update(BankImage)
                               .where(BankImage.id == row_id, spec['todo']())
                               .values(**values))
        db.session.commit()
        if lane == 'caption':
            from .caption_sidecar import sync_bank_caption_sidecar
            for row_id, values in items[i:i + _CHUNK]:
                row = db.session.get(BankImage, row_id)
                if row is not None:
                    sync_bank_caption_sidecar(bank, row)
    return len(updates)


# --- embedding caches -------------------------------------------------------------

def _load_npz(path):
    import numpy as np
    if not path or not os.path.isfile(path):
        return None
    try:
        with np.load(str(path), allow_pickle=False) as z:
            arrays = {k: z[k] for k in z.files}
    except Exception:  # noqa: BLE001 — an unreadable cache is "nothing to share"
        return None
    return arrays if 'paths' in arrays else None


def _per_entry(arrays) -> set:
    n = len(arrays['paths'])
    return {k for k, v in arrays.items() if getattr(v, 'shape', ())[:1] == (n,)}


def _save_npz(path, arrays) -> bool:
    import numpy as np
    tmp = f'{path}.share.tmp'
    try:
        os.makedirs(os.path.dirname(str(path)), exist_ok=True)
        with open(tmp, 'wb') as fh:
            np.savez(fh, **arrays)
        os.replace(tmp, str(path))
        return True
    except OSError:
        logger.warning('shared results: could not write %s', path, exc_info=True)
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False


def _seed_cache(bank, lane) -> int:
    """Add sibling cache entries this bank's cache lacks. Returns entries added.
    Only 'ok' entries are copied: an errored one is the child's to retry."""
    import numpy as np
    from . import image_bank_service as svc
    path_of = getattr(svc, CACHE_LANES[lane])
    base = _base(bank)
    sibs = _siblings(bank)
    if not base or not sibs:
        return 0
    wanted = {}
    for relpath, in (db.session.query(BankImage.relpath)
                     .filter(BankImage.bank_id == bank.id, _unedited())):
        path = svc._abs_under(base, relpath)
        if path:
            wanted[os.path.normcase(os.path.normpath(path))] = path
    if not wanted:
        return 0
    dest_path = path_of(bank.id)
    dest = _load_npz(dest_path)
    have = (set(os.path.normcase(os.path.normpath(str(p))) for p in dest['paths'])
            if dest else set())
    need = {k: p for k, p in wanted.items() if k not in have}
    added = 0
    for sib in sibs:
        if not need:
            break
        src = _load_npz(path_of(sib.id))
        if not src:
            continue
        keys = _per_entry(src)
        if dest is not None and _per_entry(dest) != keys:
            continue                    # a different cache layout: never mix them
        states = src.get('states')
        idx, new_paths = [], []
        for i, p in enumerate(src['paths']):
            k = os.path.normcase(os.path.normpath(str(p)))
            if k in need and (states is None or str(states[i]) == 'ok'):
                idx.append(i)
                new_paths.append(need.pop(k))
        if not idx:
            continue
        piece = {k: src[k][idx] for k in keys}
        piece['paths'] = np.array(new_paths)
        if dest is None:
            dest = {**{k: v for k, v in src.items() if k not in keys}, **piece}
        else:
            for k in keys:
                dest[k] = np.concatenate([dest[k], piece[k]])
        added += len(idx)
    if added and not _save_npz(dest_path, dest):
        return 0
    return added


# --- the public entry points ------------------------------------------------------

def pull(bank_id, lane) -> int:
    """Fill ``bank_id`` from overlapping banks before ``lane`` runs."""
    bank = db.session.get(ImageBank, bank_id)
    if bank is None:
        return 0
    try:
        if lane in CACHE_LANES:
            return _seed_cache(bank, lane)
        if lane in LANES:
            return _fill(bank, lane)
    except Exception:  # noqa: BLE001 — sharing is a saving, never a reason to fail a pass
        db.session.rollback()
        logger.warning('shared results: pull %s for bank %s failed', lane, bank_id,
                       exc_info=True)
    return 0


def push(bank_id, lane) -> int:
    """Fill idle overlapping banks from ``bank_id`` after ``lane`` finished."""
    from . import bank_jobs
    if lane not in PUSH_LANES:
        return 0
    bank = db.session.get(ImageBank, bank_id)
    if bank is None:
        return 0
    filled = 0
    try:
        for sib in _siblings(bank):
            if bank_jobs.running(sib.id):
                continue                # its own pass owns its rows right now
            filled += _fill(sib, lane, sources={bank_id})
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.warning('shared results: push %s from bank %s failed', lane, bank_id,
                       exc_info=True)
    return filled


def share_all(user_id=None) -> dict:
    """Fill every bank's empty results from its overlapping banks, all column
    lanes. The one-time merge for banks that were processed before sharing
    existed. Returns {lane: rows filled}."""
    q = ImageBank.query
    if user_id is not None:
        q = q.filter_by(user_id=user_id)
    out = {lane: 0 for lane in LANES}
    for bank in q.order_by(ImageBank.id).all():
        for lane in LANES:
            out[lane] += _fill(bank, lane)
    return out


_FORCE_ARGS = ('rescan', 'rescore', 'force')


def shared_pass(lane):
    """Decorate a ``_<pass>_job(bank_id, ...)`` factory so its run pulls before
    and pushes after. The factory itself is called after the pull, so a scan
    whose rows were filled from a sibling can ask for the duplicate regroup its
    filled hashes need."""
    def deco(factory):
        sig = inspect.signature(factory)

        @functools.wraps(factory)
        def make(*args, **kwargs):
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            bank_id = bound.arguments['bank_id']
            forced = any(bound.arguments.get(name) for name in _FORCE_ARGS)

            def run(job):
                from . import bank_jobs
                filled = 0 if forced else pull(bank_id, lane)
                if filled and lane == 'scan' and 'regroup' in bound.arguments:
                    bound.arguments['regroup'] = True
                if filled:
                    logger.info('shared results: bank %s %s: %d from overlapping banks',
                                bank_id, lane, filled)
                factory(*bound.args, **bound.kwargs)(job)
                if lane in PUSH_LANES and isinstance(job, dict) \
                        and not bank_jobs.cancelled(job) and not job.get('error'):
                    push(bank_id, lane)
            return run
        return make
    return deco
