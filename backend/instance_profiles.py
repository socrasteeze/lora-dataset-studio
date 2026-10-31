"""Named instance paths and process leases. This module never imports the app."""
from __future__ import annotations

import json
from contextlib import closing, contextmanager
import os
from pathlib import Path
import re
import secrets
import sqlite3
import sys
import uuid
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
SECRET_KEYS = ('HF_TOKEN', 'VAST_API_KEY', 'REDDIT_CLIENT_ID', 'CIVITAI_API_KEY',
               'PEXELS_API_KEY', 'LMSTUDIO_API_KEY', 'IMAGE_SOURCE_CREDENTIALS', 'LDS_ACCESS_TOKEN')
PATH_KEYS = ('LDS_DATA_DIR', 'LDS_CONFIG', 'LDS_ENV', 'LDS_PLUGINS_DIR', 'LDS_EXTENSIONS_DIR')


class ProfileError(RuntimeError):
    pass


class FileLease:
    """An OS-held lock. Process exit releases it, including a native crash."""
    def __init__(self, path):
        self.path = Path(path)
        self.handle = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open('a+b')
        try:
            if self.path.stat().st_size == 0:
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            if sys.platform == 'win32':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            handle.close()
            raise ProfileError('Studio or another profile operation is already active. Close it before retrying.') from exc
        self.handle = handle
        return self

    def __exit__(self, *_args):
        if self.handle is not None:
            self.handle.close()
            self.handle = None


def _write_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=True, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


class ProfileStore:
    def __init__(self, home=None, *, root=ROOT, environ=None):
        self.root = Path(root).resolve()
        self.environ = dict(os.environ if environ is None else environ)
        self.home = Path(home or self.environ.get('LDS_PROFILES_HOME')
                         or self.root / '.lds-profiles').resolve()
        self.registry = self.home / 'profiles.json'

    def shared_port(self):
        """One listen port for every profile.

        LDS_PORT is the address the running app is already bound to. Otherwise
        the Default profile's server.port, otherwise 5050. A port stored on a
        named profile is never used.
        """
        raw = self.environ.get('LDS_PORT')
        if raw in (None, ''):
            raw = self._default_server_port()
        if raw in (None, ''):
            raw = 5050
        try:
            port = int(raw)
            if not 1 <= port <= 65535:
                raise ValueError('invalid port')
        except (ValueError, TypeError) as exc:
            raise ProfileError('The current server port is invalid. Repair it before creating profiles.') from exc
        return port

    def _default_config_path(self):
        if self.registry.exists():
            try:
                document = json.loads(self.registry.read_text(encoding='utf-8'))
                for row in document.get('profiles') or []:
                    if isinstance(row, dict) and row.get('id') == 'default':
                        config = Path(row['paths']['LDS_CONFIG'])
                        if config.is_absolute():
                            return config
            except (OSError, ValueError, KeyError, TypeError):
                pass
        return Path(self.environ.get('LDS_CONFIG') or self.root / 'config.json')

    def _default_server_port(self):
        try:
            server = json.loads(self._default_config_path().read_text(encoding='utf-8')).get('server') or {}
        except FileNotFoundError:
            return None
        except (OSError, ValueError, AttributeError) as exc:
            raise ProfileError('The current settings could not be read. Repair them before creating profiles.') from exc
        return server.get('port')

    @contextmanager
    def _registry_lease(self):
        # FileLease is not reentrant. profiles() rewrites a legacy port while
        # create() and select() already hold this lock.
        if getattr(self, '_registry_locked', False):
            yield
            return
        with FileLease(self.home / 'registry.lock'):
            self._registry_locked = True
            try:
                yield
            finally:
                self._registry_locked = False

    def _default(self):
        data = Path(self.environ.get('LDS_DATA_DIR') or self.root / 'data').resolve()
        paths = dict(zip(PATH_KEYS, (
            data, Path(self.environ.get('LDS_CONFIG') or self.root / 'config.json').resolve(),
            Path(self.environ.get('LDS_ENV') or self.root / '.env').resolve(),
            Path(self.environ.get('LDS_PLUGINS_DIR') or data / 'plugins').resolve(),
            Path(self.environ.get('LDS_EXTENSIONS_DIR') or self.root / 'backend' / 'extensions').resolve(),
        )))
        return {'id': 'default', 'name': 'Default', 'port': self.shared_port(),
                'paths': {key: str(value) for key, value in paths.items()}}

    def profiles(self):
        rows = self._read_rows()
        port = self.shared_port()
        if (self.registry.exists() and any(row['port'] != port for row in rows)
                and not getattr(self, '_registry_locked', False)):
            self._persist_shared_port(port)
        return [dict(row, port=port) for row in rows]

    def _persist_shared_port(self, port):
        """Rewrite recorded ports in place. Profile directories stay untouched."""
        try:
            with self._registry_lease():
                rows = self._read_rows()
                if not self.registry.exists() or all(row['port'] == port for row in rows):
                    return
                _write_json(self.registry, {
                    'version': 1, 'profiles': [dict(row, port=port) for row in rows]})
        except ProfileError:
            return

    def _read_rows(self):
        if not self.registry.exists():
            return [self._default()]
        try:
            document = json.loads(self.registry.read_text(encoding='utf-8'))
            rows = document['profiles']
            if document['version'] != 1 or not isinstance(rows, list) or not rows:
                raise ValueError('invalid registry')
            ids = set()
            for row in rows:
                ident = row['id']
                if ident != 'default' and not re.fullmatch(r'[0-9a-f]{32}', ident):
                    raise ValueError('invalid identity')
                if ident in ids:
                    raise ValueError('duplicate identity')
                if (isinstance(row.get('port'), bool) or not isinstance(row.get('port'), int)
                        or not 1 <= row['port'] <= 65535):
                    raise ValueError('invalid port')
                if not isinstance(row['name'], str) or not row['name'].strip():
                    raise ValueError('invalid name')
                for key in PATH_KEYS:
                    if not Path(row['paths'][key]).is_absolute():
                        raise ValueError('relative profile path')
                if ident != 'default' and row['paths'] != self._named_paths(ident):
                    raise ValueError('changed profile paths')
                ids.add(ident)
            if 'default' not in ids:
                raise ValueError('missing default')
            return rows
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ProfileError('The profile registry is invalid. Restore its backup before launching Studio.') from exc

    def _named_paths(self, ident):
        base = self.home / 'instances' / ident
        if base.is_symlink() or not base.resolve().is_relative_to(self.home / 'instances'):
            raise ProfileError('A profile directory has moved outside its managed storage.')
        return {key: str(base / leaf) for key, leaf in zip(
            PATH_KEYS, ('data', 'config.json', '.env', 'plugins', 'extensions'))}

    def get(self, ident):
        for row in self.profiles():
            if row['id'] == ident:
                return row
        raise ProfileError('That profile is unavailable. Choose an existing profile.')

    def selected(self):
        path = self.home / 'selected.json'
        if not path.exists():
            return 'default'
        try:
            ident = json.loads(path.read_text(encoding='utf-8'))['id']
            self.get(ident)
            return ident
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ProfileError('The selected profile is unavailable. Choose a profile with the recovery launcher.') from exc

    def select(self, ident):
        self.get(ident)
        with self._registry_lease():
            if not self.registry.exists():
                _write_json(self.registry, {'version': 1, 'profiles': self.profiles()})
            _write_json(self.home / 'selected.json', {'id': ident})

    def request_switch(self, source, target):
        self.get(source)
        self.get(target)
        _write_json(self.home / 'switch.json', {'source': source, 'target': target})

    def consume_switch(self, source):
        path = self.home / 'switch.json'
        if not path.exists():
            return None
        try:
            value = json.loads(path.read_text(encoding='utf-8'))
            if value['source'] != source:
                raise ValueError('stale switch request')
            target = self.get(value['target'])['id']
            self.select(target)
            path.unlink()
            return target
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ProfileError('The profile switch could not be completed. Use the recovery launcher.') from exc

    def create(self, name, *, config=None):
        name = str(name or '').strip()
        if not name or len(name) > 60 or any(ord(char) < 32 for char in name):
            raise ProfileError('Enter a profile name of 1 to 60 characters.')
        with self._registry_lease():
            rows = self.profiles()
            if any(row['name'].casefold() == name.casefold() for row in rows):
                raise ProfileError('That profile name is already in use.')
            port = self.shared_port()
            ident = uuid.uuid4().hex
            paths = self._named_paths(ident)
            base = Path(paths['LDS_DATA_DIR']).parent
            base.mkdir(parents=True)
            for key in ('LDS_DATA_DIR', 'LDS_PLUGINS_DIR', 'LDS_EXTENSIONS_DIR'):
                Path(paths[key]).mkdir()
            server = {'host': '0.0.0.0', 'require_token': False,
                      **(config or {}).get('server', {})}
            if server.get('require_token') and not server.get('access_token'):
                server['access_token'] = secrets.token_urlsafe(24)
            settings = {**(config or {}), 'server': server}
            Path(paths['LDS_CONFIG']).write_text(json.dumps(settings) + '\n', encoding='utf-8')
            Path(paths['LDS_ENV']).write_text('', encoding='utf-8')
            row = {'id': ident, 'name': name, 'port': port, 'paths': paths}
            _write_json(self.registry, {'version': 1, 'profiles': [*rows, row]})
            return row

    def child_environment(self, ident):
        profile = self.get(ident)
        environment = dict(self.environ)
        # An inherited key must not override another profile's explicit env file.
        if ident != 'default':
            for key in SECRET_KEYS:
                environment.pop(key, None)
        environment.update(profile['paths'])
        # Downloaded model weights and the managed tool environments live in
        # the Default profile's data dir and are shared by every profile.
        environment['LDS_SHARED_DATA_DIR'] = self._default()['paths']['LDS_DATA_DIR']
        port = str(self.shared_port())
        environment.update(LDS_PROFILES_HOME=str(self.home), LDS_PROFILE_ID=ident,
                           LDS_PROFILE_NAME=profile['name'], LDS_PORT=port,
                           LDS_AUTO_PORT='0', LDS_PROFILE_PORT=port)
        environment.pop('LDS_ALLOW_SECOND_INSTANCE', None)
        environment.pop('LDS_SUPERVISOR', None)
        environment.pop('LDS_RESTART_MODE', None)
        return environment

    @contextmanager
    def enable_lan(self, ident, host):
        """Point a loopback profile at ``host`` for this switch.

        The token gate stays off unless that profile already opted in.
        """
        path = Path(self.get(ident)['paths']['LDS_CONFIG'])
        original = json.loads(path.read_text(encoding='utf-8'))
        server = dict(original.get('server', {}))
        server['host'] = host
        if server.get('require_token'):
            if not server.get('access_token'):
                server['access_token'] = secrets.token_urlsafe(24)
        else:
            server['require_token'] = False
        _write_json(path, {**original, 'server': server})
        try:
            yield
        except BaseException:
            _write_json(path, original)
            raise

    def browser_url(self, ident):
        from single_instance import _probe_host, read_lock
        row = self.get(ident)
        recorded = read_lock(row['paths']['LDS_DATA_DIR'])
        host = _probe_host(recorded['host']) if recorded else '127.0.0.1'
        host = f'[{host}]' if ':' in host and not host.startswith('[') else host
        port = self.shared_port()
        try:
            settings = json.loads(Path(row['paths']['LDS_CONFIG']).read_text(encoding='utf-8'))
            token = settings.get('server', {}).get('access_token')
        except FileNotFoundError:
            token = None
        except (OSError, ValueError, AttributeError) as exc:
            raise ProfileError('The profile address could not be read. Check its settings before reopening.') from exc
        if ident == 'default':
            token = self.environ.get('LDS_ACCESS_TOKEN') or token
        suffix = '?' + urlencode({'token': token}) if token else ''
        return f'http://{host}:{port}/{suffix}'

    def check_other_work(self, ident):
        from single_instance import pid_alive, read_lock
        for row in self.profiles():
            data = Path(row['paths']['LDS_DATA_DIR'])
            recorded = read_lock(data)
            if recorded and recorded['pid'] != os.getpid() and pid_alive(recorded['pid']):
                raise ProfileError('Studio is already running. Finish its work and close its server before opening a profile.')
            if row['id'] != ident:
                _check_unfinished_work(data / 'studio.db')


def _check_unfinished_work(database):
    """Inspect durable fences without importing, migrating or writing the app."""
    if not database.exists():
        return
    try:
        with closing(sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True, timeout=1)) as connection:
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if 'system_state' in tables:
                for (raw,) in connection.execute(
                        "SELECT value FROM system_state WHERE key IN "
                        "('training_in_progress', 'training_pid', 'lora_train_queue', "
                        "'comfyui_stalled_barrier', 'vision_in_progress')"):
                    value = json.loads(raw)
                    if not isinstance(value, dict) or value.get('v'):
                        raise ProfileError('Another profile has unfinished work. Reopen it and finish or clear its queue before switching.')
            if 'image_generation_queue' in tables and connection.execute(
                    "SELECT 1 FROM image_generation_queue WHERE status IN "
                    "('pending', 'processing', 'sent_to_comfy', 'cancel_requested', 'stalled') LIMIT 1").fetchone():
                raise ProfileError('Another profile has an unresolved generation queue. Reopen it before switching.')
            if 'bank_queue_entry' in tables and connection.execute('SELECT 1 FROM bank_queue_entry LIMIT 1').fetchone():
                raise ProfileError('Another profile has queued Bank work. Reopen it and finish or clear its queue before switching.')
    except (sqlite3.Error, OSError, ValueError, TypeError) as exc:
        raise ProfileError('Another profile could not be checked safely. Reopen it before switching.') from exc


def prepare_runtime():
    """Acquire before app imports. Keep the returned lease for the process life."""
    store = ProfileStore()
    ident = os.environ.get('LDS_PROFILE_ID') or store.selected()
    environment = store.child_environment(ident)
    # These belong to the current launcher, including supervised restart exit 75.
    for key in ('LDS_RESTART_MODE', 'LDS_SUPERVISOR'):
        if key in os.environ:
            environment[key] = os.environ[key]
    lease = FileLease(store.home / 'active.lock')
    transition = FileLease(store.home / 'transition.lock')
    transition.__enter__()
    try:
        lease.__enter__()
        store.check_other_work(ident)
        store.select(ident)
        os.environ.update(environment)
        os.environ.pop('LDS_ALLOW_SECOND_INSTANCE', None)
        if ident != 'default':
            for key in SECRET_KEYS:
                os.environ.pop(key, None)
        return lease
    except Exception:
        lease.__exit__()
        raise
    finally:
        transition.__exit__()


def public_profile():
    return {'id': os.environ.get('LDS_PROFILE_ID', 'default'),
            'name': os.environ.get('LDS_PROFILE_NAME', 'Default')}


def training_path(kind):
    """Named profiles cannot redirect mutable training files to a shared root."""
    ident = os.environ.get('LDS_PROFILE_ID', 'default')
    if ident == 'default':
        return None
    if not re.fullmatch(r'[0-9a-f]{32}', ident):
        raise ProfileError('The active profile identity is invalid.')
    if kind not in ('datasets', 'output', 'jobs'):
        raise KeyError(kind)
    return Path(os.environ['LDS_DATA_DIR']) / 'training' / kind


def lora_subfolder(family_folder):
    ident = os.environ.get('LDS_PROFILE_ID', 'default')
    if ident == 'default':
        return family_folder
    if not re.fullmatch(r'[0-9a-f]{32}', ident):
        raise ProfileError('The active profile identity is invalid.')
    return os.path.join(family_folder, 'profiles', ident)


def lora_belongs_to_profile(filename):
    """Limit automatic trained-checkpoint discovery to the current instance."""
    ident = os.environ.get('LDS_PROFILE_ID', 'default')
    parts = str(filename or '').replace('\\', '/').lower().split('/')
    owners = [parts[index + 1] for index, part in enumerate(parts[:-1])
              if part == 'profiles' and re.fullmatch(r'[0-9a-f]{32}', parts[index + 1])]
    return not owners if ident == 'default' else owners == [ident]
