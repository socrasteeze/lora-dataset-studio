"""Find local Hugging Face Hub cache paths without importing the Hub client."""
from __future__ import annotations

import os
from pathlib import Path


def hub_repo_dirs(repo_name: str, *, env=None) -> list[Path]:
    env = os.environ if env is None else env
    hf_home = env.get('HF_HOME')
    hub_override = env.get('HF_HUB_CACHE') or env.get('HUGGINGFACE_HUB_CACHE')
    hub_roots = []
    if hub_override:
        hub_roots.append(Path(hub_override).expanduser())
    if hf_home:
        hub_roots.append(Path(hf_home).expanduser() / 'hub')
    xdg_cache = env.get('XDG_CACHE_HOME')
    cache_home = Path(xdg_cache).expanduser() if xdg_cache else Path.home() / '.cache'
    hub_roots.append(cache_home / 'huggingface' / 'hub')
    return list(dict.fromkeys(root.absolute() / repo_name for root in hub_roots))


def main_snapshot(repo: Path) -> Path | None:
    try:
        revision = (repo / 'refs' / 'main').read_text(encoding='utf-8').strip()
    except (OSError, UnicodeError):
        return None
    if revision and Path(revision).name == revision and revision not in ('.', '..'):
        return repo / 'snapshots' / revision
    return None


def cached_snapshots(repo: Path) -> list[Path]:
    try:
        return sorted((repo / 'snapshots').iterdir())
    except OSError:
        return []
