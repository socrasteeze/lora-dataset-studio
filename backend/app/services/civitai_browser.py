"""Online prompt browsing was removed from this install."""


class CivitaiError(RuntimeError):
    pass


def _http_get_json(*_args, **_kwargs):
    raise RuntimeError('Civitai browsing is disabled in this offline fork.')


def browse(**_kwargs):
    raise CivitaiError('Civitai browsing is disabled in this offline fork.')
