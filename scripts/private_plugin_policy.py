"""Paths reserved for private product development and Store distribution.

This guards known publishing paths, not arbitrary renamed or transformed code.
Product metadata and the public SDK remain part of the core application.
"""

from __future__ import annotations

import json
import os
from pathlib import Path


_HERE = Path(__file__).resolve()
_POLICY_PATH = next((candidate for candidate in (
    _HERE.parent / 'fork-plugins.json',
    _HERE.parents[1] / 'fork-plugins.json',
) if candidate.is_file()), None)
if _POLICY_PATH is None:
    raise RuntimeError('fork-plugins.json is required beside the policy or at the repository root')
_POLICY = json.loads(_POLICY_PATH.read_text(encoding='utf-8'))
_CURATED = frozenset(_POLICY['enabled'])


def _fork_distribution() -> bool:
    value = os.environ.get('LDS_PLUGIN_DISTRIBUTION',
                           os.environ.get('LDS_PLUGIN_BUILD_MODE', 'fork'))
    return value == 'fork'


def private_plugin_path_reason(path: str) -> str | None:
    """Return a refusal reason for a Git, ZIP or staged-directory member."""
    raw_parts = [part for part in path.replace('\\', '/').split('/') if part]
    parts = [part.casefold() for part in raw_parts]
    if parts and parts[-1].endswith('.ldsplugin'):
        return 'Plugin archives belong in the separately controlled Store distribution'
    if parts and parts[-1] == 'transition-pack.zip':
        return 'The product transition pack is private distribution material'
    if 'bundled' in parts:
        canonical_root = (len(raw_parts) > 1 and raw_parts[0] == 'bundled'
                          and raw_parts[1] == raw_parts[1].casefold()
                          and parts.count('bundled') == 1)
        plugin_id = raw_parts[1] if canonical_root else ''
        if _fork_distribution() and plugin_id in _CURATED:
            return None
        return 'Only curated fork plugin source may be published with the core'
    return None
