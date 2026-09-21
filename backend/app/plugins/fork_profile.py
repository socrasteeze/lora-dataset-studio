"""Curated source distribution; fork-owned plugins update with the repository."""
import json
import os
from pathlib import Path


_POLICY = json.loads((Path(__file__).resolve().parents[3] / 'fork-plugins.json').read_text())
ENABLED = frozenset(_POLICY['enabled'])
RESERVED = ENABLED | frozenset(_POLICY['held']) | frozenset(_POLICY['excluded'])
BUILD_MARKER = Path(__file__).resolve().parents[3] / 'frontend' / 'dist' / 'plugin-build.json'


def _marker_distribution(path=None):
    marker_path = Path(path or BUILD_MARKER)
    if not marker_path.is_file():
        return 'store'
    try:
        marker = json.loads(marker_path.read_text(encoding='utf-8'))
    except (OSError, UnicodeError, ValueError) as exc:
        raise ValueError(f'Plugin build marker is unreadable: {exc}') from exc
    if not isinstance(marker, dict) or marker.get('schema_version') != 1:
        raise ValueError('Plugin build marker has an unsupported schema.')
    built = marker.get('distribution')
    if built not in ('store', 'bundled', 'fork'):
        raise ValueError(f'Plugin build marker has unknown distribution {built!r}.')
    plugins = marker.get('plugins')
    if built == 'fork':
        expected = list(_POLICY['enabled'])
        if plugins != expected:
            raise ValueError('Fork plugin build marker does not match the curated fork policy.')
        return 'fork'
    if plugins is not None:
        raise ValueError('Only a fork plugin build marker may declare curated plugins.')
    return 'development' if built == 'bundled' else 'store'


def distribution(marker_path=None):
    """Runtime plugin profile, with an explicit operator override for tests/dev."""
    explicit = os.environ.get('LDS_PLUGIN_DISTRIBUTION')
    if explicit is not None:
        if explicit not in ('store', 'development', 'fork'):
            raise ValueError(f'Unknown LDS_PLUGIN_DISTRIBUTION {explicit!r}.')
        return explicit
    return _marker_distribution(marker_path)


def active():
    return distribution() == 'fork'


def refuses_archive(plugin_id):
    return active() and plugin_id in RESERVED
