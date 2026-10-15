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
    root = cfg.dataset_images_root()
    legacy = root / str(dataset_id)
    if legacy.exists():
        return str(legacy)
    return str(root / f'{int(dataset_id):05d}')


def ensure_dataset_dir(dataset_id: int) -> str:
    """Create the dataset directory if needed and return its path."""
    path = Path(dataset_path(dataset_id))
    path.mkdir(parents=True, exist_ok=True)
    return str(path)
