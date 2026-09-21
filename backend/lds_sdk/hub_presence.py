"""Named shared operations for hub_presence."""

# Keep the compatibility constant importable after the rejected cloud product's
# implementation leaves core. Calls remain lazy for installations that provide
# the historical service.
GONE = 'gone'

__all__ = ['check', 'GONE']



def check(repo_id, *, force=False):
    from app.services.hub_presence import check as operation
    return operation(repo_id, force=force)
