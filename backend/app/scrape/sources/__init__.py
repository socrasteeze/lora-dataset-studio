# app/scrape/sources/__init__.py
"""Offline source registry. No remote source is registered."""
from . import registry   # noqa: F401  (exposes and initializes the registry first)
from .base import Capabilities, Source

# The other source modules stay on disk as disabled stubs. This install
# registers one fallback that matches nothing and does not fetch.


class OfflineSource(Source):
    name = 'offline'
    priority = 0
    capabilities = Capabilities(is_universal_fallback=True)

    def match(self, url):
        return None

    def scan(self, match):
        return [], 'Online media imports are disabled in this offline fork.'


registry.register(OfflineSource())

# Require exactly one universal source and unique names. Fail at startup
# rather than silently dispatching to the wrong source.
registry.assert_one_universal()
