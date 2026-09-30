"""Fork Divergence 12: nothing reaches another machine unless the operator asks.

Four locks, each for a different way an upstream merge could switch traffic on:

1. The inventory (fork_outbound_scan.py) - every call site and destination host
   in shipped code, compared EXACTLY with fork_outbound_inventory.json. A new
   one, even behind a button, fails here until someone reads it and refreshes
   the inventory on purpose.
2. The page-load routes - booting the app and answering what the UI asks on
   open resolves no outside hostname and opens no outside connection.
3. The hard switches - the update check, the upstream comparison and the plugin
   store stay off whatever config, files or environment say.
4. The page itself - index.html and the served bundle load nothing from a CDN.
"""
import inspect
import json
import re
import socket
from pathlib import Path

import pytest

import fork_outbound_scan as scan

REPO = Path(__file__).resolve().parents[2]


def test_outbound_inventory_is_the_reviewed_one():
    expected = json.loads(scan.INVENTORY.read_text(encoding='utf-8'))
    diff = scan.differences(expected, scan.scan())
    assert not diff, (
        'The places this app can reach another machine changed:\n  '
        + '\n  '.join(diff)
        + '\n\nRead each one. If it runs without an explicit click, or sends the '
        "operator's data or config anywhere new, remove it (FORK_NOTES.md, "
        'Divergence 12). Only then refresh the inventory:\n'
        '  .venv/Scripts/python.exe backend/tests/fork_outbound_scan.py --write')


def test_nothing_shipped_can_git_push():
    push = re.compile(r"""_git\([^\n]*['"]push['"]|['"]git['"],\s*['"]push['"]|\bgit\s+push\b""")
    hits = []
    for rel in list(scan._files(scan.PY_ROOTS, {'.py'})):
        for line in scan._code_lines((REPO / rel).read_text(encoding='utf-8', errors='replace'), '#'):
            if push.search(line):
                hits.append(f'{rel}: {line.strip()}')
    for pattern in scan.LAUNCHER_GLOBS:
        for path in REPO.glob(pattern):
            if push.search(path.read_text(encoding='utf-8', errors='replace')):
                hits.append(path.name)
    assert not hits, hits


_LOCAL = {'localhost', '127.0.0.1', '::1', '0.0.0.0', ''}


def _outside(address):
    host = str(address[0]) if isinstance(address, tuple) and address else ''
    return host.lower() not in _LOCAL and not host.startswith('127.')


@pytest.fixture()
def outside_attempts(monkeypatch):
    """Record every outside DNS lookup, TCP connection or UDP datagram.

    A UDP connect() alone is allowed: the LAN and Tailscale address probes in
    routes/settings.py use it to ask the OS which interface routes where, and
    no packet leaves the machine until something is sent."""
    seen = []
    real_getaddrinfo = socket.getaddrinfo
    real_connect = socket.socket.connect
    real_send, real_sendto = socket.socket.send, socket.socket.sendto

    def getaddrinfo(host, *args, **kwargs):
        name = host.decode() if isinstance(host, bytes) else str(host or '')
        if _outside((name,)):
            seen.append(f'dns {name}')
            raise socket.gaierror('outbound lookup blocked by test_fork_outbound_gate')
        return real_getaddrinfo(host, *args, **kwargs)

    def connect(self, address):
        if self.type == socket.SOCK_STREAM and _outside(address):
            seen.append(f'connect {address}')
            raise OSError('outbound connection blocked by test_fork_outbound_gate')
        return real_connect(self, address)

    def send(self, data, *args):
        if self.type == socket.SOCK_DGRAM:
            try:
                peer = self.getpeername()
            except OSError:
                peer = ()
            if _outside(peer):
                seen.append(f'udp {peer}')
                raise OSError('outbound datagram blocked by test_fork_outbound_gate')
        return real_send(self, data, *args)

    def sendto(self, data, *args):
        if _outside(args[-1]):
            seen.append(f'udp {args[-1]}')
            raise OSError('outbound datagram blocked by test_fork_outbound_gate')
        return real_sendto(self, data, *args)

    monkeypatch.setattr(socket, 'getaddrinfo', getaddrinfo)
    monkeypatch.setattr(socket.socket, 'connect', connect)
    monkeypatch.setattr(socket.socket, 'send', send)
    monkeypatch.setattr(socket.socket, 'sendto', sendto)
    return seen


# What the UI asks for on its own when a page opens (read from the browser's
# network log on the Bank, Settings and Plugins pages), plus the update and
# store routes whose automatic use Divergence 12 removed.
PAGE_LOAD_ROUTES = (
    '/api/system/gpu-flags', '/api/banks', '/api/bank-queue', '/api/dataset/list',
    '/api/local-llm/models', '/api/system/queue', '/api/system/comfyui-recovery',
    '/api/cluster/activity', '/api/train/activity', '/api/settings',
    '/api/update/check', '/api/update/check?auto=1', '/api/plugins/store/catalog',
    '/api/plugins/store/commerce/library',
)


def test_page_load_routes_reach_no_other_machine(client, outside_attempts):
    for url in PAGE_LOAD_ROUTES:
        response = client.get(url)
        assert response.status_code != 404, f'{url} no longer exists; update PAGE_LOAD_ROUTES'
    assert not outside_attempts, outside_attempts


def test_the_upstream_comparison_is_gone(client, outside_attempts):
    assert client.get('/api/update/upstream-check').status_code == 404
    assert not outside_attempts


def test_the_plugin_store_switch_is_hardwired_off(tmp_path, monkeypatch):
    from app.plugins.store import client as store_client
    from app.plugins.store import commerce
    source = inspect.getsource(store_client.store_switched_off)
    assert re.fullmatch(r'def store_switched_off\(\):\s*return True\s*', source), source
    # A config file, a commerce file or an environment variable pointing at a
    # store changes nothing.
    fake = tmp_path / 'bootstrap.json'
    fake.write_text('{"metadata_url": "https://store.invalid/", "target_url": "https://store.invalid/"}')
    monkeypatch.setenv('LDS_STORE_CONFIG', str(fake))
    monkeypatch.setenv('LDS_STORE_COMMERCE_CONFIG', str(fake))
    for attempt in (store_client.load_config, store_client.StoreSession,
                    commerce.load_commerce_config, commerce.CommerceClient):
        with pytest.raises(store_client.StoreNotConfigured, match='switched off'):
            attempt()
    assert store_client.load_private_configs() == []


def test_the_frontend_never_checks_on_its_own():
    src = REPO / 'frontend' / 'src'
    for path in list(src.rglob('*.js')) + list(src.rglob('*.jsx')):
        if '.test.' in path.name:
            continue
        text = path.read_text(encoding='utf-8')
        assert 'update/check?auto' not in text, path
        assert 'upstream-check' not in text, path


_EXTERNAL_RESOURCE = re.compile(r"""(?:src|href)\s*=\s*["']?(?:https?:)?//""", re.I)
_EXTERNAL_CSS = re.compile(r"""@import\s+(?:url\()?\s*["']?(?:https?:)?//|url\(\s*["']?(?:https?:)?//""", re.I)


@pytest.mark.parametrize('page', ['frontend/index.html', 'frontend/dist/index.html'])
def test_the_page_loads_nothing_from_a_cdn(page):
    text = (REPO / page).read_text(encoding='utf-8')
    assert not _EXTERNAL_RESOURCE.search(text), _EXTERNAL_RESOURCE.search(text).group(0)


def test_the_served_styles_load_nothing_from_a_cdn():
    sheets = list((REPO / 'frontend' / 'dist').rglob('*.css'))
    assert sheets
    for sheet in sheets:
        found = _EXTERNAL_CSS.search(sheet.read_text(encoding='utf-8'))
        assert not found, (sheet.name, found.group(0))
