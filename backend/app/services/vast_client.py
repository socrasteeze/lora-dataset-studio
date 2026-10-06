"""Rented GPU hosting was removed from this install."""


class VastError(RuntimeError):
    pass


def _removed(*_args, **_kwargs):
    raise VastError('Rented GPU hosting was removed from this install.')


search_offers = create_instance = destroy_instance = list_instances = get_instance = derive_base_url = _removed
