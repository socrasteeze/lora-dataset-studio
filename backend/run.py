import sys, os


def _reexec_into_venv():
    """Run on the project's pinned interpreter, not whatever Python launched us.

    If a project .venv exists and we are not already its interpreter, re-exec
    into it before anything else imports. This makes every launch method — the
    start.bat/start.sh flow, a bare `python backend/run.py`, a double-click, an
    IDE, a shell with a newer Python first on PATH — converge on the SAME
    interpreter. That is what lets the optional ML extras (insightface / numpy<2
    / onnxruntime, which only publish wheels for CPython 3.10-3.12) install into
    a supported Python: the in-app installer and the capability probes both key
    off sys.executable, so if run.py runs on e.g. the machine's default 3.14 the
    extras can never install. Skipped for the frozen/portable build (it bundles
    its own Python) and once we are already the venv's python. Set
    LDS_NO_REEXEC=1 to opt out."""
    if getattr(sys, 'frozen', False) \
            or os.environ.get('LDS_REEXEC') == '1' \
            or os.environ.get('LDS_NO_REEXEC') == '1':
        return
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for rel in (('.venv', 'Scripts', 'python.exe'), ('.venv', 'bin', 'python')):
        venv_py = os.path.join(repo_root, *rel)
        if os.path.exists(venv_py):
            break
    else:
        return                                   # no venv -> nothing to switch to
    try:
        if os.path.samefile(venv_py, sys.executable):
            return                               # already the venv interpreter
    except OSError:
        if os.path.normcase(os.path.realpath(venv_py)) \
                == os.path.normcase(os.path.realpath(sys.executable)):
            return
    os.environ['LDS_REEXEC'] = '1'               # loop guard for the re-exec'd child
    print(f"[LDS] re-launching under the project venv: {venv_py}", flush=True)
    os.execv(venv_py, [venv_py, os.path.abspath(__file__), *sys.argv[1:]])


_reexec_into_venv()

# Windows consoles (and the portable launcher redirecting stdout to a file)
# often sit on a legacy code page; the app uses emoji heavily. Reconfigure
# early so a bare print/log of those glyphs cannot UnicodeEncodeError-kill a
# worker thread. errors='replace' keeps going even when a glyph is unknown.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from bootstrap_dependencies import ensure_pillow_consistent

# Must run before importing ``app`` (which eventually imports PIL).  This fixes
# Windows installs left half-upgraded by versions of the in-app updater that ran
# pip while Pillow files were still loaded and locked by the Flask process.
ensure_pillow_consistent()

from app import create_app

try:
    from app.config import get as cfg_get
except ImportError:
    cfg_get = lambda k, d=None: {'server.host': '127.0.0.1', 'server.port': 5000}.get(k, d)

app = create_app()


def _local_browse_url(host, port, token=None):
    """The URL to open ON THIS machine for a server bound to ``host:port``.

    A wildcard bind (``0.0.0.0`` / ``::``) is not itself browsable, so fall back
    to loopback. A specific LAN / Tailscale host is reachable from the machine
    itself and is what the user actually uses to reach the app, so open it
    verbatim rather than a 127.0.0.1 that nothing is serving. The access token
    (present only when the LAN token gate is on) rides along so the opened tab
    is not an immediate 403. Returns ``(url, connect_host)`` — the second value
    is the host to probe for readiness."""
    connect_host = host if host not in ('0.0.0.0', '::', '', None) else '127.0.0.1'
    url = f'http://{connect_host}:{port}/'
    if token:
        url += f'?token={token}'
    return url, connect_host


def _open_browser_when_ready(host, port, token=None, attempts=60, delay=0.5):
    """Open the local browser at the real bound address, but only AFTER the
    server accepts a connection. start.bat used to ``start`` a hardcoded
    127.0.0.1 URL BEFORE this process had even bound — so a server.host pointing
    at a LAN / Tailscale address greeted the user with "cannot connect" every
    launch. Opening here means we know the true host/port/token and can wait for
    readiness. Best-effort and daemon-threaded: a browser that never opens must
    never hold up the server. Set LDS_NO_BROWSER=1 to skip entirely."""
    import socket
    import threading
    import time
    import webbrowser
    url, connect_host = _local_browse_url(host, port, token)

    def _wait_and_open():
        for _ in range(attempts):
            try:
                with socket.create_connection((connect_host, port), timeout=delay):
                    break
            except OSError:
                time.sleep(delay)
        else:
            return  # never came up in time — don't pop a failing tab
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=_wait_and_open, name='open-browser', daemon=True).start()


if __name__ == '__main__':
    host = os.environ.get('LDS_HOST') or cfg_get('server.host')
    port = int(os.environ.get('LDS_PORT') or cfg_get('server.port'))
    is_lan = host not in ('127.0.0.1', 'localhost', '::1')
    if is_lan and cfg_get('server.require_token') \
            and not os.environ.get('LDS_ACCESS_TOKEN') \
            and os.environ.get('LDS_ALLOW_UNAUTHENTICATED') != '1':
        # Token gate is ON (opt-in in Settings): make sure netguard has a token to
        # check. Persisted in config.json (not just this process's env) so it
        # survives a restart instead of rotating every boot -- the Settings
        # "Server" card reads it back from there to show/copy it.
        token = cfg_get('server.access_token') or ''
        if not token:
            import secrets
            token = secrets.token_urlsafe(24)
            try:
                from app.config import save_config
                save_config({'server': {'access_token': token}})
            except ImportError:
                pass   # config module unavailable (see cfg_get fallback above) -> ephemeral this run
        os.environ['LDS_ACCESS_TOKEN'] = token
        print(f"\n[LDS] server.host={host} reachable from the network -> access token REQUIRED.")
        print(f"[LDS] Open from another device:  http://<this-machine>:{port}/?token={os.environ['LDS_ACCESS_TOKEN']}")
        print("[LDS] (turn the token off in Settings -> Server to open the LAN without one)\n")
    elif is_lan:
        print(f"\n[LDS] server.host={host} reachable from the network (no token — trusted-LAN mode).")
        print(f"[LDS] Open from another device:  http://<this-machine>:{port}/\n")
    # Snapshot of what's ACTUALLY bound, for the Settings "Server" card: config.json
    # may already hold newer values the user saved but hasn't restarted into yet, so
    # reading cfg_get again there would lie about what's currently serving requests.
    app.config['LDS_BOUND_HOST'] = host
    app.config['LDS_BOUND_PORT'] = port
    # Open the local browser at the ACTUAL bound address (with token) once the
    # server is up — replaces start.bat's hardcoded, fired-too-early 127.0.0.1.
    _browse_url, _ = _local_browse_url(host, port, os.environ.get('LDS_ACCESS_TOKEN'))
    print(f"[LDS] Serving at {_browse_url}")
    # Settings ▸ Server & access owns the persisted on/off switch; LDS_NO_BROWSER=1
    # stays as the env-level override for a one-off or automated launch that
    # never touched Settings.
    if cfg_get('server.auto_open_browser', True) \
            and os.environ.get('LDS_NO_BROWSER') != '1':
        _open_browser_when_ready(host, port, os.environ.get('LDS_ACCESS_TOKEN'))
    app.run(debug=os.environ.get('FLASK_DEBUG', '0') == '1',
            host=host,
            # LDS_PORT wins over config so the launcher can dodge a busy 5000
            # (macOS AirPlay, another Flask app, …) without touching config.json.
            port=port, threaded=True, use_reloader=False)
