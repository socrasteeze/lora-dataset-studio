"""Stage only the curated fork plugins for container and portable builds."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil

LOCAL_NAMES = {'__pycache__', 'node_modules', 'tests', 'data', '.pytest_cache'}
PRIVATE_SUFFIXES = ('.pyc', '.pyo', '.db', '.sqlite', '.sqlite3', '.key', '.pem',
                    '.p12', '.pfx', '.ldsplugin', '.env', '.exe', '.zip', '.tar',
                    '.gz', '.bz2', '.xz', '.7z', '.rar', '.pyz')


def _ignore(_directory, names):
    return [name for name in names
            if name in LOCAL_NAMES or name.startswith('.')
            or name.casefold().endswith(PRIVATE_SUFFIXES)
            or (name.casefold().endswith('.whl')
                and Path(_directory).parts[-2:] != ('resources', 'wheels'))]


def stage(repo: Path, destination: Path) -> list[str]:
    repo = repo.resolve(strict=True)
    policy = json.loads((repo / 'fork-plugins.json').read_text(encoding='utf-8'))
    enabled = policy.get('enabled')
    if (not isinstance(enabled, list) or not enabled
            or len(enabled) != len(set(enabled))
            or any(not isinstance(value, str)
                   or not re.fullmatch(r'[a-z][a-z0-9_]{1,31}', value)
                   for value in enabled)):
        raise ValueError('fork-plugins.json has no valid curated plugin list')
    if destination.exists():
        raise ValueError('staging destination already exists')
    destination.mkdir(parents=True)
    for plugin_id in enabled:
        source = repo / 'bundled' / plugin_id
        if source.resolve(strict=True).parent != (repo / 'bundled').resolve(strict=True):
            raise ValueError(f'curated plugin {plugin_id!r} escapes the bundled root')
        manifest = json.loads((source / 'plugin.json').read_text(encoding='utf-8'))
        if manifest.get('id') != plugin_id or manifest.get('bundled') is not True:
            raise ValueError(f'curated plugin {plugin_id!r} has an invalid manifest')
        for path in source.rglob('*'):
            if path.is_symlink() or getattr(path, 'is_junction', lambda: False)():
                raise ValueError(f'curated plugin {plugin_id!r} contains a symlink')
        shutil.copytree(source, destination / plugin_id,
                        ignore=_ignore)
    return enabled


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps({'plugins': stage(args.repo, args.destination)}))


if __name__ == '__main__':
    main()
