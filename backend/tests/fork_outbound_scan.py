"""Inventory of every place the shipped code can reach another machine.

Fork Divergence 12 (FORK_NOTES.md). Pure text scan: no app import, so it runs
before and without the application. test_fork_outbound_gate.py compares the
result with fork_outbound_inventory.json and fails on ANY difference, so a
merge that adds a call site, a destination host or a launcher download is
reviewed before it lands.

Refresh the inventory after reviewing a change:

    .venv/Scripts/python.exe backend/tests/fork_outbound_scan.py --write
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
INVENTORY = Path(__file__).with_name('fork_outbound_inventory.json')

# What ships and runs: the backend, bundled plugins, the plugin SDK, the
# packaged launcher, the frontend sources and the root launch scripts.
# Tests, fixtures and developer tooling under scripts/ do not ship.
PY_ROOTS = ('backend', 'bundled', 'sdk', 'packaging')
JS_ROOTS = ('frontend/src', 'bundled', 'sdk/frontend')
LAUNCHER_GLOBS = ('*.js', '*.bat', '*.cmd', '*.ps1', '*.sh')
SKIP_PARTS = frozenset({'tests', 'test', '__pycache__', 'node_modules', 'dist',
                        'fixtures', '.venv', 'venv'})

PY_CALL = re.compile(
    r'\brequests\.(?:get|post|put|patch|delete|head|request|Session)\s*\('
    r'|\bhttpx\.(?:get|post|put|patch|delete|head|request|stream|Client|AsyncClient)\s*\('
    r'|\burlopen\s*\(|\burlretrieve\s*\(|\burllib\.request\.Request\s*\('
    r'|\baiohttp\.ClientSession\s*\(|\bHTTPS?Connection\s*\('
    r'|\bsocket\.create_connection\s*\(|\bwebsockets?\.connect\s*\('
    r'|\bsmtplib\.|\bftplib\.|\bboto3\.|\bparamiko\.'
    # Libraries that upload (the user's data leaves) or download by name.
    r'|\bHfApi\s*\(|\.upload_(?:file|folder|large_folder)\s*\(|\bcreate_repo\s*\('
    r'|\bcreate_commit\s*\(|\bhf_hub_download\s*\(|\bsnapshot_download\s*\('
    r"""|['"](?:fetch|pull|push|clone|ls-remote)['"]""")
JS_CALL = re.compile(
    r"""\bfetch\s*\(\s*[`'"]https?://|\bnew\s+WebSocket\s*\(|\bnew\s+EventSource\s*\("""
    r'|\bsendBeacon\s*\(|\bXMLHttpRequest\b|\bhttps?\.(?:get|request)\s*\(')
LAUNCHER_CALL = re.compile(
    r'\bpip\s+install\b|\bgit\s+(?:fetch|pull|clone|push|ls-remote)\b|\bcurl\b|\bwget\b'
    r'|Invoke-WebRequest|Invoke-RestMethod|\bnpm\s+(?:install|ci)\b|\bhttps?\.(?:get|request)\s*\('
    r"""|\bfetch\s*\(\s*[`'"]https?://|['"](?:fetch|pull|clone|push)['"]""", re.I)
HOST = re.compile(r'https?://([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})')
LOCAL_HOSTS = re.compile(r'^(?:localhost|.*\.local|.*\.localhost|.*\.test|host\.docker\.internal'
                         r'|example\.(?:com|org|net)|.*\.example\.(?:com|org|net))$', re.I)


def _files(roots, suffixes):
    for root in roots:
        base = REPO / root
        if not base.is_dir():
            continue
        for path in sorted(base.rglob('*')):
            rel = path.relative_to(REPO)
            if (path.suffix in suffixes and path.is_file()
                    and not SKIP_PARTS.intersection(rel.parts[:-1])
                    and not re.match(r'(?:test_.*\.py|.*\.test\.[cm]?jsx?|conftest\.py)$', path.name)):
                yield rel


def _code_lines(text, comment):
    return [line for line in text.splitlines() if not line.lstrip().startswith(comment)]


def scan():
    python, js, launchers = {}, {}, {}
    for rel in _files(PY_ROOTS, {'.py'}):
        lines = _code_lines((REPO / rel).read_text(encoding='utf-8', errors='replace'), '#')
        calls = sum(len(PY_CALL.findall(line)) for line in lines)
        hosts = sorted({h.lower() for line in lines for h in HOST.findall(line)
                        if not LOCAL_HOSTS.match(h)})
        if calls or hosts:
            python[rel.as_posix()] = {'calls': calls, 'hosts': hosts}
    for rel in _files(JS_ROOTS, {'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'}):
        lines = _code_lines((REPO / rel).read_text(encoding='utf-8', errors='replace'), '//')
        calls = sum(len(JS_CALL.findall(line)) for line in lines)
        if calls:
            js[rel.as_posix()] = {'calls': calls}
    for pattern in LAUNCHER_GLOBS:
        for path in sorted(REPO.glob(pattern)):
            text = path.read_text(encoding='utf-8', errors='replace')
            calls = len(LAUNCHER_CALL.findall(text))
            hosts = sorted({h.lower() for h in HOST.findall(text) if not LOCAL_HOSTS.match(h)})
            if calls or hosts:
                launchers[path.name] = {'calls': calls, 'hosts': hosts}
    return {'python': python, 'javascript': js, 'launchers': launchers}


def differences(expected, actual):
    """Human-readable lines, one per changed file; empty when they match."""
    out = []
    for kind in ('python', 'javascript', 'launchers'):
        old, new = expected.get(kind, {}), actual.get(kind, {})
        for path in sorted(set(old) | set(new)):
            a, b = old.get(path), new.get(path)
            if a == b:
                continue
            if a is None:
                out.append(f'NEW   {path}: {b}')
            elif b is None:
                out.append(f'GONE  {path}: was {a}')
            else:
                added = sorted(set(b.get('hosts', [])) - set(a.get('hosts', [])))
                removed = sorted(set(a.get('hosts', [])) - set(b.get('hosts', [])))
                parts = []
                if a['calls'] != b['calls']:
                    parts.append(f"calls {a['calls']} -> {b['calls']}")
                if added:
                    parts.append(f'new hosts {added}')
                if removed:
                    parts.append(f'hosts gone {removed}')
                out.append(f'CHANGED {path}: ' + '; '.join(parts))
    return out


if __name__ == '__main__':
    result = scan()
    if '--write' in sys.argv:
        INVENTORY.write_text(json.dumps(result, indent=1, sort_keys=True) + '\n', encoding='utf-8')
        print(f'wrote {INVENTORY.name}')
    else:
        print(json.dumps(result, indent=1, sort_keys=True))
