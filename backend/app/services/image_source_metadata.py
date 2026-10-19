"""Bounded provenance for operator-started image acquisition."""
import hashlib
import json
import re
import ipaddress
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit


PROVIDERS = {
    'danbooru': ('Danbooru', 'danbooru.donmai.us'),
    'gelbooru': ('Gelbooru', 'gelbooru.com'),
    'e621': ('e621', 'e621.net'),
    'e926': ('e926', 'e926.net'),
    'rule34': ('Rule34', 'rule34.xxx'),
    'paheal': ('Paheal', 'rule34.paheal.net'),
    'pawchive': ('Pawchive', 'pawchive.pw'),
}
IMAGE_EXTENSIONS = frozenset(('jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'))
VIDEO_EXTENSIONS = frozenset(('mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'ts', 'm3u8', 'mpd'))
_PROVIDER_ID = re.compile(r'^[a-z0-9][a-z0-9._-]{0,252}$')
MAX_ITEMS = 1000


def web_url(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 4096:
        raise ValueError('Enter a valid HTTP or HTTPS URL.')
    if any(ord(char) < 33 or ord(char) == 127 for char in value):
        raise ValueError('The URL contains invalid characters.')
    try:
        parts = urlsplit(value)
        if (parts.scheme not in ('http', 'https') or not parts.hostname or parts.username is not None
                or parts.password is not None
                or parts.port not in (None, 80 if parts.scheme == 'http' else 443)):
            raise ValueError()
        host = parts.hostname.lower()
        if (host == 'localhost' or host.endswith(('.localhost', '.local', '.internal', '.home.arpa'))
                or '.' not in host and ':' not in host):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError()
    except ValueError as exc:
        raise ValueError('Enter a public HTTP or HTTPS URL without credentials.') from exc
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path or '/', parts.query, ''))


def source_url(value):
    url = web_url(value.strip() if isinstance(value, str) else value)
    parts = urlsplit(url)
    host = parts.hostname.removeprefix('www.')
    provider = next((key for key, (_, domain) in PROVIDERS.items() if domain == host), None)
    if provider is None:
        provider = {'x.com': 'twitter', 'twitter.com': 'twitter', 'youtu.be': 'youtube',
                    'youtube.com': 'youtube'}.get(host, host)
    if any(key.lower().replace('-', '_') in ('api_key', 'token', 'password', 'access_token')
           for key in parse_qs(parts.query)):
        raise ValueError('Save credentials separately from the source URL.')
    return provider, urlunsplit((parts.scheme, parts.netloc.lower(), parts.path, parts.query, ''))


def provider_id(value):
    return isinstance(value, str) and _PROVIDER_ID.fullmatch(value) is not None


def search_url(provider, tags):
    if provider not in PROVIDERS or provider == 'pawchive':
        raise ValueError('Paste a source URL or choose a booru search preset.')
    if not isinstance(tags, str) or not tags.strip() or len(tags) > 2000:
        raise ValueError('Enter a tag query with at most 2000 characters.')
    host = PROVIDERS[provider][1]
    if provider in ('danbooru', 'e621', 'e926'):
        return f'https://{host}/posts?{urlencode({"tags": tags.strip()})}'
    if provider == 'paheal':
        from urllib.parse import quote
        return f'https://{host}/post/list/{quote(tags.strip(), safe="")}/1'
    return f'https://{host}/index.php?{urlencode({"page": "post", "s": "list", "tags": tags.strip()})}'


def _text(value, maximum=240):
    return str(value or '')[:maximum]


def normalize(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return None
    if (not isinstance(value, dict) or not provider_id(value.get('platform'))
            or (value.get('platform') not in PROVIDERS and value.get('acquisition') is not True)):
        return None
    try:
        provider, page = source_url(value.get('source_url'))
    except ValueError:
        return None
    if value.get('acquisition') is not True and provider != value['platform']:
        return None
    result = {'platform': value['platform'], 'source_url': page,
              'post_id': _text(value.get('post_id'), 100),
              'media_id': _text(value.get('media_id'), 160),
              'rating': _text(value.get('rating'), 30)}
    if value.get('acquisition') is True:
        result.update(acquisition=True, engine=value.get('engine') if value.get('engine') in
                      ('gallery-dl', 'yt-dlp') else 'gallery-dl',
                      extension=_text(value.get('extension'), 12), generic=value.get('generic') is True)
    tags = value.get('tags')
    result['tags'] = {}
    budget = 24000
    if isinstance(tags, dict):
        for key, values in list(tags.items())[:12]:
            if not isinstance(values, list):
                continue
            group = []
            for tag in values[:300]:
                text = _text(tag, 160)
                size = len(json.dumps(text).encode())
                if size <= budget:
                    group.append(text)
                    budget -= size
            result['tags'][str(key)[:40]] = group
    for key in ('width', 'height'):
        v = value.get(key)
        if isinstance(v, int) and not isinstance(v, bool) and 0 < v <= 100000:
            result[key] = v
    origins = []
    origin_values = value.get('origins')
    for raw in (origin_values if isinstance(origin_values, list) else [])[:20]:
        try:
            origin_provider, origin_url = source_url(raw)
            if provider_id(origin_provider) and origin_url not in origins:
                origins.append(origin_url)
        except (ValueError, TypeError):
            continue
    result['origins'] = list(dict.fromkeys([page, *origins]))[:20]
    checksum = value.get('sha256')
    if isinstance(checksum, str) and re.fullmatch('[0-9a-fA-F]{64}', checksum):
        result['sha256'] = checksum.lower()
    if isinstance(value.get('creator'), str):
        result['creator'] = _text(value['creator'], 160)
    return result


def media_item(provider, listing_url, url, meta):
    url = web_url(url.removeprefix('ytdl:'))
    actual = str(meta.get('acquisition_provider') or meta.get('category') or provider).lower()
    if provider_id(actual):
        provider = actual
    ext = str(meta.get('extension') or urlsplit(url).path.rsplit('.', 1)[-1]).lower()
    kind = ('archive' if ext == 'zip' else 'image' if ext in IMAGE_EXTENSIONS
            else 'video' if ext in VIDEO_EXTENSIONS else 'file')
    if meta.get('preview_only'):
        return None
    post_id = _text(meta.get('id') or meta.get('post_id') or meta.get('media_id')
                    or meta.get('tweet_id') or meta.get('gallery_id') or meta.get('gid'), 100)
    host = PROVIDERS.get(provider, ('', urlsplit(listing_url).hostname))[1]
    if provider in ('danbooru', 'e621', 'e926') and post_id:
        page = f'https://{host}/posts/{post_id}'
    elif provider in ('gelbooru', 'rule34') and post_id:
        page = f'https://{host}/index.php?{urlencode({"page": "post", "s": "view", "id": post_id})}'
    elif provider == 'paheal' and post_id:
        page = f'https://{host}/post/view/{post_id}'
    elif provider == 'pawchive' and meta.get('service') and meta.get('user') and post_id:
        from urllib.parse import quote
        page = (f'https://{host}/{quote(str(meta["service"]), safe="")}/user/'
                f'{quote(str(meta["user"]), safe="")}/post/{quote(post_id, safe="")}')
    else:
        page = meta.get('webpage_url') or meta.get('post_url') or listing_url
    try:
        page = source_url(page)[1]
    except ValueError:
        page = listing_url
    tags = meta.get('tags')
    if isinstance(tags, str):
        tags = {'general': tags.split()}
    elif isinstance(tags, list):
        tags = {'general': tags}
    elif not isinstance(tags, dict):
        tags = {}
    tags = dict(tags)
    for name in ('artist', 'character', 'copyright', 'general', 'meta', 'species'):
        raw = meta.get(f'tags_{name}') or meta.get(f'tag_string_{name}')
        if raw:
            tags[name] = raw.split() if isinstance(raw, str) else raw
    metadata = normalize({'platform': provider, 'source_url': page, 'acquisition': True,
                          'engine': meta.get('acquisition_engine', 'gallery-dl'), 'extension': ext,
                          'generic': meta.get('acquisition_generic') is True,
                          'post_id': post_id, 'media_id': meta.get('hash') or meta.get('md5') or post_id,
                          'tags': tags, 'rating': meta.get('rating'),
                          'width': meta.get('width'), 'height': meta.get('height'),
                          'creator': _text(meta.get('artist') or meta.get('photographer')
                                           or meta.get('uploader') or meta.get('username') or meta.get('user'), 160)})
    if metadata is None:
        return None
    # Stable source identity precedes temporary CDN tokens. Attachment identity
    # distinguishes multiple files in one Pawchive post.
    identity = [provider, post_id, meta.get('hash') or meta.get('md5'),
                meta.get('num'), meta.get('filename'), urlsplit(url).path]
    key = hashlib.sha256(json.dumps(identity, sort_keys=True, default=str).encode()).hexdigest()
    metadata['media_id'] = _text(meta.get('hash') or meta.get('md5') or key, 160)
    preview = meta.get('preview')
    thumbnail = (meta.get('preview_url') or meta.get('thumbnail') or meta.get('sample_url')
                 or (preview.get('url') if isinstance(preview, dict) else None))
    if not isinstance(thumbnail, str):
        thumbnail = None
    if thumbnail:
        try:
            thumbnail = web_url(thumbnail)
        except ValueError:
            thumbnail = None
    return {'key': key, 'url': url, 'thumbnail': thumbnail,
            'kind': kind, 'extension': ext, 'metadata': metadata}
