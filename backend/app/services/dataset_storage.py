"""Filesystem paths for dataset-owned images.

Callers must choose explicitly between resolving a path and creating its
directory.  Read-only routes should never mutate the filesystem as a side
effect of looking up a missing file.
"""
from __future__ import annotations

from pathlib import Path

from .. import config as cfg


def dataset_path(dataset_id: int) -> str:
    """Resolve storage without creating it; retain existing unpadded folders."""
    from ..models import FaceDataset
    from ..extensions import db
    from flask import has_app_context

    dataset = db.session.get(FaceDataset, int(dataset_id)) if has_app_context() else None
    root = Path(dataset.storage_root) if dataset and dataset.storage_root else cfg.dataset_images_root()
    if dataset and dataset.storage_root:
        if dataset.storage_basename:
            from ..creation_destinations import folder_number
            if folder_number(dataset.storage_basename, 'LDS') != dataset.id:
                raise ValueError('Invalid stored Dataset folder identity.')
            target = root / dataset.storage_basename
            if target.resolve().parent != root.resolve():
                raise ValueError('The Dataset folder leaves its storage root.')
            return str(target)
        flat = root / f'LDS{int(dataset_id):04d}'
        if flat.exists() or not ((root / str(dataset_id)).exists() or (root / f'{int(dataset_id):05d}').exists()):
            return str(flat)
    legacy = root / str(dataset_id)
    if legacy.exists():
        return str(legacy)
    return str(root / f'{int(dataset_id):05d}')


def ensure_dataset_dir(dataset_id: int) -> str:
    """Create the dataset directory if needed and return its path."""
    path = Path(dataset_path(dataset_id))
    path.mkdir(parents=True, exist_ok=True)
    return str(path)
