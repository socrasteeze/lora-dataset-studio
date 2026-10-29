"""Same-stem ``.txt`` sidecars for Bank captions.

Bank captions live in ``BankImage.caption``. This module mirrors a non-empty
caption into ``<image stem>.txt`` next to the source file (``source_path``
joined with ``relpath``). It is a different contract from
``face_dataset_service.write_caption_files``: no trigger word, no WD14 tags,
no delete on a cleared caption, and the write is atomic.

A sidecar failure must never raise into a caption job or roll back the DB
write. Skip and log when the image is missing, the folder refuses the write,
two images share a stem, or overlapping bank rows disagree on the text.
"""
from __future__ import annotations

import logging
import os
import tempfile

from .. import config as cfg
from ..extensions import db
from ..models import BankImage, ImageBank

logger = logging.getLogger(__name__)

_TMP_PREFIX = '.lds-cap-'
_TMP_SUFFIX = '.tmp'
_CONFIG_KEY = 'captioning.bank_sidecar_sync'


def sidecar_sync_enabled() -> bool:
    """True unless the operator turned the toggle off.

    Missing or unknown values stay on, matching the shipped default. Only an
    explicit ``False`` disables writes.
    """
    return cfg.get(_CONFIG_KEY, True) is not False


def sidecar_text(caption) -> str:
    """Caption text for a sidecar: stripped, one line, no added tags."""
    if not isinstance(caption, str):
        return ''
    text = caption.replace('\r\n', '\n').replace('\r', '\n')
    return ' '.join(part.strip() for part in text.split('\n') if part.strip())


def sidecar_path_for(image_path: str) -> str:
    stem, _ext = os.path.splitext(os.path.basename(image_path))
    return os.path.join(os.path.dirname(image_path), f'{stem}.txt')


def write_text_atomic(path: str, text: str) -> None:
    """Publish UTF-8 text (no BOM) via a sibling temp file and ``os.replace``.

    The destination is the old bytes or the new bytes, never a half-written
    file. A failure deletes the temp and never writes a ``.bak``.
    """
    directory = os.path.dirname(path) or os.curdir
    fd, tmp = tempfile.mkstemp(prefix=_TMP_PREFIX, suffix=_TMP_SUFFIX,
                               dir=directory)
    try:
        with os.fdopen(fd, 'wb') as fh:
            fh.write(text.encode('utf-8'))
            fd = None
        os.replace(tmp, path)
        tmp = None
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass
        if tmp is not None:
            try:
                os.unlink(tmp)
            except OSError:
                pass


def sync_bank_caption_sidecar(bank, row=None, *, relpath=None, caption=None,
                              image_id=None) -> bool:
    """Best-effort write of the sidecar for one bank caption.

    Returns True only when a sidecar was replaced. Never raises. Never deletes
    an existing sidecar. Never reads or writes ``tags`` / ``tags_text``.
    """
    try:
        return _sync_bank_caption_sidecar(
            bank, row, relpath=relpath, caption=caption, image_id=image_id)
    except Exception:
        logger.warning('bank caption sidecar: write failed bank=%s image=%s',
                       getattr(bank, 'id', None),
                       image_id if image_id is not None
                       else getattr(row, 'id', None),
                       exc_info=True)
        return False


def _sync_bank_caption_sidecar(bank, row, *, relpath, caption, image_id) -> bool:
    if not sidecar_sync_enabled():
        return False
    if row is not None:
        if relpath is None:
            relpath = row.relpath
        if caption is None:
            caption = row.caption
        if image_id is None:
            image_id = getattr(row, 'id', None)
    text = sidecar_text(caption)
    if not text:
        return False
    if bank is None or not relpath:
        logger.warning('bank caption sidecar: skipped bank=%s image=%s (no path)',
                       getattr(bank, 'id', None), image_id)
        return False
    from types import SimpleNamespace

    from .image_bank_service import IMG_EXTS, abs_image_path
    if row is None:
        row = SimpleNamespace(relpath=relpath)
    image_path = abs_image_path(bank, row)
    if not image_path:
        logger.warning('bank caption sidecar: skipped bank=%s image=%s (unresolved)',
                       getattr(bank, 'id', None), image_id)
        return False
    if not os.path.isfile(image_path):
        logger.warning('bank caption sidecar: skipped bank=%s image=%s (missing-image)',
                       getattr(bank, 'id', None), image_id)
        return False
    if _stem_collision(image_path, IMG_EXTS):
        logger.warning('bank caption sidecar: skipped bank=%s image=%s (stem-collision)',
                       getattr(bank, 'id', None), image_id)
        return False
    if _conflicting_captions(bank, image_path, text, image_id):
        logger.warning('bank caption sidecar: skipped bank=%s image=%s (caption-conflict)',
                       getattr(bank, 'id', None), image_id)
        return False
    write_text_atomic(sidecar_path_for(image_path), text)
    return True


def _stem_collision(image_path: str, image_exts) -> bool:
    folder, name = os.path.split(image_path)
    stem = os.path.splitext(name)[0]
    try:
        names = os.listdir(folder)
    except OSError:
        return False
    self_name = os.path.normcase(name)
    self_stem = os.path.normcase(stem)
    for other in names:
        if os.path.normcase(other) == self_name:
            continue
        other_stem, other_ext = os.path.splitext(other)
        if os.path.normcase(other_stem) != self_stem:
            continue
        if other_ext.lower() in image_exts:
            return True
    return False


def _conflicting_captions(bank, image_path, text, image_id) -> bool:
    from .image_bank_service import abs_image_path, overlapping_banks
    target = os.path.normcase(os.path.realpath(image_path))
    seen = {getattr(bank, 'id', None)}
    others = [bank]
    user_id = getattr(bank, 'user_id', None)
    bank_id = getattr(bank, 'id', None)
    if user_id is not None and bank_id is not None:
        for info in overlapping_banks(user_id, bank_id):
            other = db.session.get(ImageBank, info['id'])
            if other is not None and other.id not in seen:
                seen.add(other.id)
                others.append(other)
    for other in others:
        q = (BankImage.query.filter_by(bank_id=other.id)
             .filter(BankImage.caption.isnot(None), BankImage.caption != ''))
        if image_id is not None and other.id == bank_id:
            q = q.filter(BankImage.id != image_id)
        for peer in q:
            peer_path = abs_image_path(other, peer)
            if not peer_path:
                continue
            if os.path.normcase(os.path.realpath(peer_path)) != target:
                continue
            peer_text = sidecar_text(peer.caption)
            if peer_text and peer_text != text:
                return True
    return False
