"""Models a resident worker keeps loaded between requests.

A one-shot infer process runs ``main()`` once, so ``memo`` is a plain call
there. Under ``resident.py`` the same process serves bank after bank while the
queue drains, and the second request finds its model here instead of paying
the load again (WD14, CLIP + heads, InsightFace, SigLIP2 and watermark models).

Off unless resident.py turns it on. The test suite imports these scripts into
one process and stubs a different fake model per test; a memo that outlived a
test would hand the next one a stale stub.

Only successful loads are kept. A head that failed to download must be retried
by the next request, not remembered as missing for the life of the worker.
"""
ENABLED = False
_MODELS: dict = {}


def memo(key, load, keep=lambda value: True):
    """``load()`` once per ``key``; later calls with the same key reuse it.
    The key must name everything that changes the object (path, device,
    providers). ``keep(value)`` false means "do not remember this one"."""
    if not ENABLED:
        return load()
    if key in _MODELS:
        return _MODELS[key]
    value = load()
    if keep(value):
        _MODELS[key] = value
    return value
