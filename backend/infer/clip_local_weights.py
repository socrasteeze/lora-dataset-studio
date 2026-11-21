"""Resolve the OpenAI ViT-L-14 checkpoint without importing ML libraries."""
from __future__ import annotations

from pathlib import Path

if __package__:
    from .local_hub_cache import cached_snapshots, hub_repo_dirs, main_snapshot
else:
    from local_hub_cache import cached_snapshots, hub_repo_dirs, main_snapshot

MODEL_NAME = 'ViT-L-14'
PRETRAINED = 'openai'
_HUB_REPO = f'models--timm--vit_large_patch14_clip_224.{PRETRAINED}'
_FILENAMES = (
    'open_clip_model.safetensors',
    'open_clip_pytorch_model.safetensors',
    'open_clip_pytorch_model.bin',
)


def _find_checkpoint(*directories):
    for filename in _FILENAMES:
        for directory in directories:
            checkpoint = directory / filename
            if checkpoint.is_file():
                # Hub symlinks point to blobs without the format suffix.
                return str(checkpoint.absolute())
    return None


def _find_snapshot_checkpoint(repo):
    preferred = main_snapshot(repo)
    try:
        if preferred is not None:
            checkpoint = _find_checkpoint(preferred)
            if checkpoint is not None:
                return checkpoint
        return _find_checkpoint(*cached_snapshots(repo))
    except OSError:
        return None


def resolve_clip_checkpoint(models_root=None, *, env=None) -> str:
    """Find the local checkpoint for all three CLIP towers."""
    searched = hub_repo_dirs(_HUB_REPO, env=env)
    for repo in searched:
        checkpoint = _find_snapshot_checkpoint(repo)
        if checkpoint is not None:
            return checkpoint

    if models_root:
        cache = Path(models_root).expanduser().absolute() / 'open_clip'
        searched.append(cache)
        checkpoint = _find_snapshot_checkpoint(cache / _HUB_REPO) or _find_checkpoint(cache)
        if checkpoint is not None:
            return checkpoint

    locations = ', '.join(map(str, searched))
    filenames = ', '.join(_FILENAMES)
    raise FileNotFoundError(
        f'OpenAI {MODEL_NAME} weights are missing. Searched {locations} for {filenames}. '
        'Inference is offline and will not download weights.')
