"""Validate local-tool API targets without exposing host implementation modules."""


def local_api_url(value):
    """Accept HTTP(S) targets on loopback, private LAN or the operator's tailnet.

    Raise ValueError for invalid, unresolved or public API targets.
    """
    from app.utils.local_api import local_api_url as validate
    return validate(value)


__all__ = ['local_api_url']
