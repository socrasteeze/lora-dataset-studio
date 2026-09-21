"""Select plugin source discovery without importing migration or installer code."""
import os

from .fork_profile import distribution


def development_bundles():
    return (distribution() in ('development', 'fork')
            or bool(os.environ.get('LDS_BUNDLED_DIR')))
