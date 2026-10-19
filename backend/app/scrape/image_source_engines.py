"""Scan/download engine adapter. Runs only inside an explicit source child.

Standard gallery-dl, operator-owned local extractors, and yt-dlp share one
bounded media window. An authentication or network failure never changes tools.
"""
import importlib.util
import itertools
import json
import logging
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit


_spec = importlib.util.spec_from_file_location(
    '_lds_source_metadata', Path(__file__).resolve().parents[1] / 'services' / 'image_source_metadata.py')
protocol = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(protocol)


def emit(value):
    print(json.dumps(value, default=str), flush=True)


def _kind(code):
    return 'unsupported' if code & 64 else 'auth' if code & 16 else 'network'


def _item(request, engine, url, raw, origin=None, category=None):
    raw = dict(raw)
    raw['acquisition_engine'] = engine
    raw['acquisition_provider'] = category or raw.get('category') or request['provider']
    raw['acquisition_generic'] = request.get('generic', False)
    raw['webpage_url'] = raw.get('webpage_url') or origin or request['url']
    try:
        return protocol.media_item(request['provider'], request['url'], url, raw)
    except ValueError:
        return None


def _configure(request):
    import imageio_ffmpeg
    from gallery_dl import config, extractor
    config.clear()
    for key, value in request['config'].items():
        config.set((), key, value)
    # Libraries and local extractors may use delegated yt-dlp. Keep that path
    # on the same public-only proxy, with native HTTP/HLS downloaders.
    config.set(('downloader', 'ytdl'), 'raw-options', {
        'proxy': request['proxy'], 'hls_prefer_native': True,
        'external_downloader': {'default': 'native'},
        'max_filesize': request.get('max_bytes', 256 * 1024 * 1024),
        'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(),
        'cachedir': False,
        'retries': 0, 'fragment_retries': 0, 'noprogress': True,
    })
    config.set(('output',), 'mode', 'null')
    # module-sources is initialized by gallery-dl's CLI, not its Job API.
    # Reproduce that initialization for the explicitly chosen host folder.
    modules = []
    for source in request['config'].get('extractor', {}).get('module-sources', [None]):
        if source is None:
            modules.append(extractor._modules_internal())
        else:
            folder = Path(source)
            files = sorted(path.stem for path in folder.glob('*.py'))
            if not folder.is_dir() or not 1 <= len(files) <= 200:
                raise ValueError('The configured extractor directory is unavailable.')
            modules.append(extractor._modules_path(str(folder), files))
    extractor._module_iter = itertools.chain.from_iterable(modules)


def _credentials(request, extr):
    from gallery_dl import config
    values = request.get('credentials') or {}
    options = {}
    for source, target in (('username', 'username'), ('password', 'password'),
                           ('api_key', 'api-key'), ('user_id', 'user-id'),
                           ('access_token', 'access-token'), ('access_token_secret', 'access-token-secret'),
                           ('client_id', 'client-id'), ('client_secret', 'client-secret'),
                           ('refresh_token', 'refresh-token')):
        if values.get(source):
            options[target] = values[source]
    if values.get('api_key') and not values.get('password'):
        options['password'] = values['api_key']
    if values.get('cookies'):
        from http.cookies import SimpleCookie
        cookies = SimpleCookie()
        cookies.load(values['cookies'])
        options['cookies'] = {key: value.value for key, value in cookies.items()}
    for key, value in options.items():
        config.set(('extractor', extr.category), key, value)
    floors = {'instagram': (30, 60), 'twitter': (5, 12), 'pawchive': (3, 6)}
    floor = floors.get(extr.category)
    if floor:
        config.set(('extractor', extr.category), 'sleep-request', f'{floor[0]}-{floor[1]}')


def _gdl(request, generic=False):
    from gallery_dl import exception, extractor, job, config
    target = ('generic:' if generic else request.get('force_extractor', '') + ':'
              if request.get('force_extractor') else '') + request['url']
    first = extractor.find(target)
    if first is None:
        return 64
    _credentials(request, first)
    shared = {'seen': 0, 'errors': 0}
    visited = set()
    start, end = request.get('start', 0), request.get('start', 0) + request.get('limit', 200)

    def scope_cookies(extr):
        if (request.get('credentials', {}).get('cookies') and extr.category == first.category
                and extr.cookies_domain == ''):
            # Generic extractors have an empty cookie domain by default.
            # Typed source cookies must never become domain-free cookies.
            extr.cookies_domain = urlsplit(request['url']).hostname.removeprefix('www.')

    class Scan(job.Job):
        def __init__(self, extr, parent=None):
            super().__init__(extr, parent)
            self.depth = parent.depth + 1 if parent else 0
            scope_cookies(self.extractor)

        def handle_directory(self, kwdict):
            pass

        def handle_url(self, url, kwdict):
            shared['seen'] += 1
            if shared['seen'] <= start:
                return
            if shared['seen'] > end:
                raise exception.StopExtraction()
            item = _item(request, 'gallery-dl', url, kwdict,
                         self.extractor.url, self.extractor.category)
            emit([3, url, {'acquisition_item': item}])

        def handle_queue(self, url, kwdict):
            if shared['seen'] >= end:
                raise exception.StopExtraction()
            if self.depth >= 8:
                shared['errors'] |= 1
                raise exception.StopExtraction()
            if url in visited:
                return
            visited.add(url)
            cls = kwdict.get('_extractor')
            child = Scan(cls.from_url(url) if cls else url, self)
            shared['errors'] |= child.run()
            if shared['errors']:
                raise exception.StopExtraction()

    if request.get('action') != 'download':
        return Scan(first).run() | shared['errors']

    destination = Path(request['directory']).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    wanted = set(request['keys'])
    config.set(('extractor',), 'base-directory', str(destination))
    config.set(('extractor',), 'directory', [])
    config.set(('extractor',), 'filename', '{_lds_key}.{extension}')
    config.set(('extractor',), 'postprocessors', [])
    config.set(('downloader', 'http'), 'filesize-max', request['max_bytes'])

    class Download(job.DownloadJob):
        def __init__(self, url, parent=None):
            super().__init__(url, parent)
            self.depth = parent.depth + 1 if parent else 0
            scope_cookies(self.extractor)

        def handle_queue(self, url, kwdict):
            if not wanted:
                raise exception.StopExtraction()
            if self.depth >= 8:
                shared['errors'] |= 1
                raise exception.StopExtraction()
            super().handle_queue(url, kwdict)

        def handle_url(self, url, kwdict):
            if not wanted:
                raise exception.StopExtraction()
            shared['seen'] += 1
            if shared['seen'] > 5000:
                raise exception.StopExtraction()
            item = _item(request, 'gallery-dl', url, kwdict,
                         self.extractor.url, self.extractor.category)
            if item is None or item['key'] not in wanted:
                return
            values = dict(kwdict)
            extension = str(values.get('extension') or item['extension'])
            values['extension'] = extension if re.fullmatch('[a-zA-Z0-9]{1,10}', extension) else 'bin'
            values['_lds_key'] = item['key']
            if self.pathfmt is None:
                self.initialize(values)
            super().handle_url(url, values)
            path = Path(self.pathfmt.realpath)
            if (path.is_file() and not path.is_symlink() and path.parent.resolve() == destination
                    and 0 < path.stat().st_size <= request['max_bytes']):
                emit([4, item['key'], {'file': path.name}])
                wanted.discard(item['key'])

    status = Download(first).run() | shared['errors']
    return status or (4 if wanted else 0)


def _yt(request, generic=False):
    import imageio_ffmpeg
    import yt_dlp
    from yt_dlp.extractor import gen_extractor_classes
    if not generic and not any(cls.IE_NAME != 'generic' and cls.suitable(request['url'])
                               for cls in gen_extractor_classes()):
        return 64
    failures = []

    class Quiet:
        def debug(self, value):
            pass
        def warning(self, value):
            pass
        def error(self, value):
            failures.append(str(value))

    secret = request.get('credentials') or {}
    options = {'quiet': True, 'no_warnings': True, 'logger': Quiet(),
               'cachedir': False,
               'proxy': request['proxy'], 'socket_timeout': 20, 'retries': 0,
               'fragment_retries': 0, 'hls_prefer_native': True,
               'external_downloader': {'default': 'native'},
               'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(),
               'skip_download': True, 'extract_flat': False, 'lazy_playlist': True,
               'playlist_items': f'1:{request.get("start", 0) + request.get("limit", 200)}',
               'allowed_extractors': ['generic'] if generic else ['default', '-generic'],
               'username': secret.get('username'), 'password': secret.get('password') or secret.get('api_key')}
    def cookies_for(ydl):
        if secret.get('cookies'):
            from http.cookies import SimpleCookie
            from http.cookiejar import Cookie
            cookies = SimpleCookie()
            cookies.load(secret['cookies'])
            domain = urlsplit(request['url']).hostname.removeprefix('www.')
            domains = (['twitter.com', 'x.com'] if domain in ('twitter.com', 'x.com') else
                       ['youtube.com'] if domain in ('youtu.be', 'm.youtube.com', 'music.youtube.com', 'youtube.com')
                       else [domain])
            for scope in domains:
                for key, value in cookies.items():
                    ydl.cookiejar.set_cookie(Cookie(0, key, value.value, None, False,
                                                   scope, True, False, '/', True,
                                                   False, None, True, None, None, {}))
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            cookies_for(ydl)
            if request.get('action') == 'download':
                destination = Path(request['directory']).resolve()
                for entry in request['targets']:
                    key, url = entry['key'], protocol.web_url(entry['page'])
                    ydl.params.update(skip_download=False, noplaylist=True,
                                      outtmpl={'default': str(destination / (key + '.%(ext)s'))},
                                      max_filesize=request['max_bytes'], playlist_items='1')
                    info = ydl.extract_info(url, download=True)
                    paths = [Path(item['filepath']) for item in (info or {}).get('requested_downloads', [])
                             if item.get('filepath')]
                    if info:
                        if info.get('filepath'):
                            paths.insert(0, Path(info['filepath']))
                        paths.append(Path(ydl.prepare_filename(info)))
                    paths += sorted(destination.glob(key + '.*'))
                    path = next((value for value in paths if value.is_file() and not value.is_symlink()
                                 and value.suffix not in ('.part', '.ytdl', '.temp')
                                 and value.parent.resolve() == destination
                                 and 0 < value.stat().st_size <= request['max_bytes']), None)
                    if path is None:
                        return 4
                    if failures:
                        return 4
                    emit([4, key, {'file': path.name}])
                return 0
            info = ydl.extract_info(request['url'], download=False)

            def entries(value, depth=0):
                if not isinstance(value, dict) or depth > 8:
                    return
                if value.get('entries') is not None:
                    for child in value['entries']:
                        yield from entries(child, depth + 1)
                else:
                    yield value

            for index, value in enumerate(entries(info)):
                if index < request.get('start', 0):
                    continue
                if index >= request.get('start', 0) + request.get('limit', 200):
                    break
                page = value.get('webpage_url') or value.get('original_url') or request['url']
                category = str(value.get('extractor_key') or value.get('extractor') or request['provider']).lower().replace(':', '-')
                raw = {**value, 'extension': value.get('ext') or 'mp4', 'webpage_url': page}
                item = _item(request, 'yt-dlp', value.get('url') or page, raw, page, category)
                emit([3, value.get('url') or page, {'acquisition_item': item}])
            return 0
    except yt_dlp.utils.DownloadError as exc:
        text = str(exc).lower()
        return 64 if 'unsupported url' in text or 'no suitable extractor' in text else 16 if (
            'sign in' in text or 'login' in text or 'authentication' in text) else 4


def run(request):
    try:
        _configure(request)
    except Exception:
        emit([-1, {'kind': 'configuration'}])
        return 1
    engine = request.get('engine', 'auto')
    steps = [('gallery-dl', False), ('yt-dlp', False), ('gallery-dl', True), ('yt-dlp', True)]
    if request.get('action') == 'download':
        steps = [(engine, request.get('generic', False))]
    elif request.get('force_extractor'):
        steps = [('gallery-dl', False)]
    elif engine != 'auto':
        steps = [step for step in steps if step[0] == engine]
    for tool, generic in steps:
        try:
            attempt = {**request, 'generic': generic}
            code = _gdl(attempt, generic) if tool == 'gallery-dl' else _yt(attempt, generic)
        except Exception:
            code = 1
        if code != 64:
            if code:
                emit([-1, {'kind': _kind(code)}])
            return code
    emit([-1, {'kind': 'unsupported'}])
    return 64


def main():
    logging.disable(logging.CRITICAL)
    return run(json.load(sys.stdin))
