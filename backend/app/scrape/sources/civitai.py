"""Local read of a stored Civitai credential. This install does not call Civitai."""
import os


def civitai_api_key():
    """CIVITAI_API_KEY from the environment, then a local cookies file."""
    env = (os.environ.get('CIVITAI_API_KEY') or '').strip()
    if env:
        return env
    base = os.environ.get('SCRAPE_COOKIES_DIR')
    if not base:
        return None
    path = os.path.join(base, 'civitai_api_key.txt')
    try:
        if os.path.isfile(path):
            value = open(path, encoding='utf-8').read().strip()
            if value:
                return value
    except OSError:
        return None
    return None
