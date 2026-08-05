"""The remote-training lane, driven over REAL HTTP.

Every other test of this lane (``test_peer_training.py``, 23 of them) stubs at
the ``RemoteAiToolkit`` method or at ``_json``/``_request``. That leaves the one
layer that has never run against real hardware entirely unexercised: the URL
shapes, the query parameters, the JSON field names, the percent-encoding of a
whole absolute path into ONE path segment, and the Range-resume loop. A mistake
in any of those passes every mocked test and fails on the first real run.

So this file stands up a **faithful fake ai-toolkit over real HTTP on
localhost** and drives LDS's real client and real orchestration against it. No
GPU is involved: the half of the feature this covers is HTTP plus a filesystem.

FAITHFULNESS IS THE WHOLE POINT. The fake is written from ai-toolkit's own
Next.js route sources, and it is deliberately unfriendly:

* ``GET /api/jobs?id=<id>`` answers the job object at the TOP LEVEL
  (``NextResponse.json(job)``), and JSON ``null`` for a job it does not have.
* ``POST /api/jobs`` branches on the TRUTHINESS of ``id``, and a duplicate
  ``name`` is a 409 — ``Job.name`` carries a unique constraint over there.
* ``/api/img/`` and ``/api/files/`` are PUBLIC (no bearer), and they decode the
  way a Next.js catch-all segment does: the segment list is joined before
  ``decodeURIComponent`` runs, so a raw multi-segment path does NOT resolve.
  LDS sends ``quote(path, safe="")``; anything else must fail here, loudly,
  rather than being quietly accepted.
* Everything else under ``/api/`` is 401 without the right bearer token.

Two fault injections are the fake's own, and are marked as such: it can cut a
download mid-stream once (that is what some rented hosts' proxies do, and it is
what the resume loop exists for), and it can advertise a file outside its
allowed roots (which the real route answers with 403).
"""
from __future__ import annotations

import json
import os
import re
import threading
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import pytest

from app.services import peer_training
from app.services.aitoolkit_remote import RemoteError

#: Obviously fake, and short enough that no secret-shaped pattern matches it.
PEER_TOKEN = 'token-for-tests'

#: Same cap the real log route applies before it starts returning a tail only.
_MAX_TAIL_BYTES = 5 * 1024 * 1024

#: `on_poll` entry meaning "the peer no longer has this job" — the route then
#: answers JSON `null`, exactly as `prisma.job.findUnique` -> NextResponse.json.
DELETED = object()


def _parse_int(value):
    """JS ``parseInt`` semantics: a leading integer, or NaN (``None`` here).

    ``parseInt('12abc')`` is 12 and ``parseInt('abc')`` is NaN; Python's ``int``
    raises for both, and the log route's reset branch turns on exactly that
    distinction.
    """
    if value is None:
        return None
    m = re.match(r'\s*[-+]?\d+', value)
    return int(m.group(0)) if m else None


def _is_sample_file(name: str) -> bool:
    """Copied verbatim from the samples route, missing dots and all."""
    return (name.endswith('.png') or name.endswith('.jpg') or name.endswith('.jpeg')
            or name.endswith('.webp') or name.endswith('.mp4') or name.endswith('mp3')
            or name.endswith('wav') or name.endswith('flac') or name.endswith('ogg'))


# ── the fake ai-toolkit ──────────────────────────────────────────────────────

class _PeerHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):      # keep pytest output readable
        pass

    # -- plumbing ---------------------------------------------------------
    def _send(self, status, body: bytes, headers=None):
        self.send_response(status)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)
        if self._record is not None:
            self._record['status'] = status

    def _json_out(self, status, payload):
        self._send(status, json.dumps(payload).encode('utf-8'),
                   {'Content-Type': 'application/json'})

    def _bearer(self):
        header = self.headers.get('Authorization') or ''
        parts = header.split(' ')
        return parts[1] if len(parts) > 1 else None

    def do_GET(self):
        self._dispatch('GET')

    def do_POST(self):
        self._dispatch('POST')

    # -- routing ----------------------------------------------------------
    def _dispatch(self, method):
        peer = self.server.peer
        parsed = urlparse(self.path)
        path = parsed.path                      # still percent-encoded
        query = parse_qs(parsed.query)

        body = None
        if method == 'POST':
            length = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(length) if length else b''
            if (self.headers.get('Content-Type') or '').startswith('application/json'):
                body = json.loads(raw.decode('utf-8') or 'null')

        self._record = peer.record(method, self.path, dict(self.headers), body)

        # The real middleware lets /api/img/ and /api/files/ through unauthed.
        public = path.startswith('/api/img/') or path.startswith('/api/files/')
        if not public and peer.token and self._bearer() != peer.token:
            return self._json_out(401, {'error': 'Unauthorized'})

        if path == '/api/auth' and method == 'GET':
            return self._json_out(200, {'isAuthenticated': True})
        if path == '/api/settings':
            if method == 'GET':
                return self._json_out(200, peer.settings())
            return self._json_out(200, {'success': True})
        if path == '/api/gpu' and method == 'GET':
            return self._json_out(200, {'gpus': peer.gpus})
        if path == '/api/machines' and method == 'GET':
            return self._json_out(200, {'machines': peer.peer_machines})
        if path == '/api/jobs':
            return (self._jobs_get(query) if method == 'GET'
                    else self._jobs_post(body))
        if path.startswith('/api/jobs/'):
            return self._job_route(path, query)
        if path.startswith('/api/queue/') and path.endswith('/start'):
            gpu_ids = path[len('/api/queue/'):-len('/start')]
            return self._json_out(200, {'id': 1, 'gpu_ids': unquote(gpu_ids),
                                        'is_running': True})
        if public:
            prefix = '/api/img/' if path.startswith('/api/img/') else '/api/files/'
            return self._serve_public(prefix, path)
        return self._json_out(404, {'error': 'Not found'})

    # -- /api/jobs ---------------------------------------------------------
    def _jobs_get(self, query):
        peer = self.server.peer
        job_id = (query.get('id') or [None])[0]
        if job_id:
            scripted = peer.next_poll(job_id)
            if scripted is DELETED:
                return self._json_out(200, None)
            job = peer.jobs.get(job_id)
            if job is not None and isinstance(scripted, dict):
                job.update(scripted)
            # NextResponse.json(job) — TOP LEVEL, and `null` for a missing row.
            return self._json_out(200, job)
        rows = sorted(peer.jobs.values(), key=lambda j: j['created_at'], reverse=True)
        return self._json_out(200, {'jobs': rows})

    def _jobs_post(self, body):
        peer = self.server.peer
        body = body or {}
        job_id = body.get('id')                 # branches on TRUTHINESS
        name = body.get('name')
        clash = any(j['name'] == name and j['id'] != job_id
                    for j in peer.jobs.values())
        if job_id:
            job = peer.jobs.get(job_id)
            if job is None:                     # prisma.update on a missing row
                return self._json_out(500, {'error': 'Failed to save training data'})
            if clash:
                return self._json_out(409, {'error': 'Job name already exists'})
            job.update(name=name, gpu_ids=body.get('gpu_ids'),
                       job_config=json.dumps(body.get('job_config')),
                       updated_at=datetime.utcnow().isoformat())
            return self._json_out(200, job)
        if clash:
            return self._json_out(409, {'error': 'Job name already exists'})
        return self._json_out(200, peer.create_job(name, body.get('gpu_ids'),
                                                   body.get('job_config')))

    # -- /api/jobs/<id>/... -------------------------------------------------
    def _job_route(self, path, query):
        peer = self.server.peer
        rest = path[len('/api/jobs/'):]
        job_id, _, action = rest.partition('/')
        job = peer.jobs.get(job_id)
        if job is None:
            return self._json_out(404, {'error': 'Job not found'})
        folder = peer.job_folder(job_id)

        if action == 'start':
            job.update(status='queued', stop=False, return_to_queue=False,
                       info='Job queued')
            return self._json_out(200, job)
        if action == 'stop':
            job.update(stop=True, info='Stopping job...')
            if job.get('pid') is not None:
                # The real route only reaches this after signalling the pid.
                job.update(status='stopped', info='Job stopped')
            return self._json_out(200, job)
        if action == 'log':
            return self._job_log(folder, query)
        if action == 'samples':
            return self._job_samples(folder)
        if action == 'files':
            return self._job_files(job_id, folder)
        return self._json_out(404, {'error': 'Not found'})

    def _job_log(self, folder, query):
        log_path = os.path.join(folder, 'log.txt')
        if not os.path.exists(log_path):
            return self._json_out(200, {'log': '', 'offset': 0, 'reset': True})
        size = os.path.getsize(log_path)
        offset = _parse_int((query.get('offset') or [None])[0])
        is_reset = offset is None or offset > size
        with open(log_path, 'rb') as fh:
            if is_reset:
                start = max(0, size - _MAX_TAIL_BYTES)
                fh.seek(start)
                text = fh.read(size - start).decode('utf-8')
                if start > 0:
                    idx = text.find('\n')
                    if idx != -1:
                        text = text[idx + 1:]
                return self._json_out(200, {'log': text, 'offset': size, 'reset': True})
            fh.seek(offset)
            text = fh.read(max(0, size - offset)).decode('utf-8')
        return self._json_out(200, {'log': text, 'offset': size, 'reset': False})

    def _job_samples(self, folder):
        samples_dir = os.path.join(folder, 'samples')
        if not os.path.isdir(samples_dir):
            return self._json_out(200, {'samples': []})
        names = [n for n in os.listdir(samples_dir)
                 if os.path.isfile(os.path.join(samples_dir, n)) and _is_sample_file(n)]
        # ABSOLUTE paths on the peer's own filesystem — that is the contract.
        return self._json_out(200, {'samples': sorted(os.path.join(samples_dir, n)
                                                      for n in names)})

    def _job_files(self, job_id, folder):
        peer = self.server.peer
        if not os.path.isdir(folder):
            return self._json_out(200, {'files': []})
        files = [{'path': os.path.join(folder, n),
                  'size': os.path.getsize(os.path.join(folder, n))}
                 for n in sorted(os.listdir(folder)) if n.endswith('.safetensors')]
        optimizer = os.path.join(folder, 'optimizer.pt')
        if os.path.exists(optimizer):
            files.append({'path': optimizer, 'size': os.path.getsize(optimizer)})
        files.extend(peer.extra_files.get(job_id) or [])     # fault injection
        return self._json_out(200, {'files': files})

    # -- /api/img/ and /api/files/ ------------------------------------------
    def _serve_public(self, prefix, path):
        peer = self.server.peer
        rest = path[len(prefix):]
        # A Next.js catch-all hands the route an ARRAY of segments, and
        # `decodeURIComponent(array)` coerces it with a comma join first. So one
        # fully percent-encoded segment (what LDS sends) round-trips, and a raw
        # multi-segment path does not resolve to anything. Modelled exactly:
        # this is the check that would catch a wrong quote() call.
        decoded = unquote(','.join(rest.split('/')))
        resolved = os.path.abspath(decoded)
        roots = peer.allowed_roots(prefix)
        allowed = any(resolved == root or resolved.startswith(root + os.sep)
                      for root in roots)
        if not allowed:
            return self._send(403, b'Access denied', {'Content-Type': 'text/plain'})
        if not os.path.isfile(resolved):
            return self._send(404, b'File not found', {'Content-Type': 'text/plain'})

        with open(resolved, 'rb') as fh:
            data = fh.read()
        size = len(data)
        headers = {'Content-Type': 'application/octet-stream',
                   'Accept-Ranges': 'bytes'}
        status, body = 200, data
        rng = self.headers.get('Range')
        if rng:
            parts = rng.replace('bytes=', '').split('-')
            start = _parse_int(parts[0] or None)
            end = _parse_int(parts[1] or None) if len(parts) > 1 else None
            end = size - 1 if end is None else end
            if start is None or start > end or start >= size:
                return self._send(416, b'Range Not Satisfiable',
                                  {'Content-Range': f'bytes */{size}'})
            status, body = 206, data[start:end + 1]
            headers['Content-Range'] = f'bytes {start}-{end}/{size}'

        short = peer.take_close_framed(resolved)
        if short is not None:
            # FAULT INJECTION: a proxy that re-frames the response with
            # connection-close instead of Content-Length, and truncates it. The
            # ai-toolkit route itself always sends Content-Length; anything
            # between the two machines may not.
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(body[:short])
            self.wfile.flush()
            self.close_connection = True
            self._record['status'] = status
            self._record['close_framed_after'] = short
            return

        cut = peer.take_drop(resolved)
        if cut is not None:
            # FAULT INJECTION: answer with the honest Content-Length, then cut
            # the connection partway through. This is what a sick proxy in front
            # of a rented host does, and it is the only thing that exercises the
            # resume loop for real.
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body[:cut])
            self.wfile.flush()
            self.close_connection = True
            self._record['status'] = status
            self._record['cut_after'] = cut
            return
        return self._send(status, body, headers)


class FakePeer:
    """An ai-toolkit stand-in: real HTTP, real files, in-memory job rows."""

    def __init__(self, root, token=PEER_TOKEN):
        self.root = str(root)
        self.training_folder = os.path.join(self.root, 'training')
        self.datasets_folder = os.path.join(self.root, 'datasets')
        self.data_root = os.path.join(self.root, 'data')
        for path in (self.training_folder, self.datasets_folder, self.data_root):
            os.makedirs(path, exist_ok=True)
        self.token = token
        self.jobs: dict[str, dict] = {}
        self.requests: list[dict] = []
        self.on_poll: dict[str, list] = {}
        self.extra_files: dict[str, list] = {}
        self.drops: dict[str, int] = {}
        self.close_framed: dict[str, int] = {}
        self.gpus = [{'index': 0, 'name': 'Fake GPU'}]
        self.peer_machines = [{'id': 'workshop', 'label': 'Workshop', 'online': True,
                               'gpus': [{'index': 0}]}]
        self._lock = threading.Lock()
        self._server = None
        self._thread = None
        self._queue_position = 0

    # -- lifecycle ---------------------------------------------------------
    def start(self):
        self._server = ThreadingHTTPServer(('127.0.0.1', 0), _PeerHandler)
        self._server.daemon_threads = True
        self._server.peer = self
        self.port = self._server.server_address[1]
        self._thread = threading.Thread(target=self._server.serve_forever,
                                        name='fake-aitoolkit', daemon=True)
        self._thread.start()
        return self

    def stop(self):
        """Idempotent — test 11 kills the peer mid-run and the fixture repeats it."""
        if self._server is None:
            return
        server, thread = self._server, self._thread
        self._server = self._thread = None
        server.shutdown()
        server.server_close()
        thread.join(timeout=10)

    @property
    def url(self):
        return f'http://127.0.0.1:{self.port}'

    # -- state -------------------------------------------------------------
    def settings(self):
        return {'TRAINING_FOLDER': self.training_folder,
                'DATASETS_FOLDER': self.datasets_folder,
                'MODELS_PATH': os.path.join(self.root, 'models')}

    def allowed_roots(self, prefix):
        roots = [self.datasets_folder, self.training_folder]
        if prefix == '/api/img/':
            roots.append(self.data_root)
        return [os.path.abspath(r) for r in roots]

    def create_job(self, name, gpu_ids, job_config):
        with self._lock:
            self._queue_position += 1000
            job = {
                'id': str(uuid.uuid4()), 'name': name, 'gpu_ids': gpu_ids,
                'job_config': json.dumps(job_config),
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat(),
                'status': 'stopped', 'stop': False, 'return_to_queue': False,
                'step': 0, 'total_steps': None, 'info': '', 'speed_string': '',
                'queue_position': self._queue_position, 'pid': None,
                'job_type': 'train', 'job_ref': None,
                'save_now': False, 'sample_now': False,
            }
            self.jobs[job['id']] = job
        return job

    def set_job(self, job_id, **fields):
        self.jobs[job_id].update(fields)

    def next_poll(self, job_id):
        with self._lock:
            script = self.on_poll.get(job_id)
            if not script:
                return None
            return script.pop(0)

    def take_drop(self, resolved_path):
        with self._lock:
            return self.drops.pop(resolved_path, None)

    def take_close_framed(self, resolved_path):
        with self._lock:
            return self.close_framed.pop(resolved_path, None)

    def record(self, method, path, headers, body):
        entry = {'method': method, 'path': path, 'headers': headers, 'body': body,
                 'status': None}
        with self._lock:
            self.requests.append(entry)
        return entry

    def calls(self, prefix=None, method=None):
        with self._lock:
            rows = list(self.requests)
        return [c for c in rows
                if (prefix is None or c['path'].startswith(prefix))
                and (method is None or c['method'] == method)]

    # -- filesystem helpers -------------------------------------------------
    def job_folder(self, job_id):
        return os.path.join(self.training_folder, self.jobs[job_id]['name'])

    def write_log(self, job_id, text, mode='a'):
        folder = self.job_folder(job_id)
        os.makedirs(folder, exist_ok=True)
        # newline='': the peer serves this file's SIZE as the log cursor, so the
        # bytes on disk must be exactly the bytes handed in. Text mode turns
        # every '\n' into os.linesep, which on Windows made the file one byte
        # per line longer than the string the test wrote — and the backend CI
        # runner is windows-latest, so this failed there too, not only locally.
        with open(os.path.join(folder, 'log.txt'), mode, encoding='utf-8',
                  newline='') as fh:
            fh.write(text)

    def add_sample(self, job_id, name, data: bytes):
        folder = os.path.join(self.job_folder(job_id), 'samples')
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, name)
        with open(path, 'wb') as fh:
            fh.write(data)
        return path

    def add_job_file(self, job_id, name, data: bytes):
        folder = self.job_folder(job_id)
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, name)
        with open(path, 'wb') as fh:
            fh.write(data)
        return path


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def peer(tmp_path):
    fake = FakePeer(tmp_path / 'peer').start()
    try:
        yield fake
    finally:
        fake.stop()


@pytest.fixture
def configured(app, peer, tmp_path):
    """The same mechanism the mocked file uses — `aitoolkit.url` / `.token` —
    only pointed at a socket that really answers. `aitoolkit.dir` is what the
    local path helpers (`_run_dir`, `_samples_dir`) resolve against."""
    from app import config as cfg
    with app.app_context():
        cfg.save_config({'aitoolkit': {'url': peer.url, 'token': peer.token,
                                       'dir': str(tmp_path / 'aitoolkit')}})
    return app


def _new_run(peer, *, name, trigger, ds=None, steps=1200):
    """A dataset plus the PeerTrainingRun row `launch()` would have written.

    Must run inside an app context. The three paths are resolved through the
    REAL local helpers, so `save_root` really is one level below the log's
    folder — the distinction test 7 exists to pin.
    """
    from app.extensions import db
    from app.models import FaceDataset, PeerTrainingRun
    from app.services import lora_training as lt

    if ds is None:
        ds = FaceDataset(user_id='local', name=name, trigger_word=trigger)
        db.session.add(ds)
        db.session.commit()
    log_path = lt._run_log_path(ds, base_model=None, family='zimage', variant=None)
    save_root = lt._run_dir('local', ds.id, base_model=None, family='zimage',
                            variant=None)
    samples_dir = lt._samples_dir('local', ds.id, base_model=None, family='zimage',
                                  variant=None)
    job_name = lt._run_name(ds, base_model=None, family='zimage', variant=None)
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    run = PeerTrainingRun(
        dataset_id=ds.id, gpu_ids='workshop:0', machine_label='Workshop GPU 0',
        run_name=job_name, job_name=job_name, status='preparing',
        base_url=peer.url, log_path=log_path, total_steps=steps,
        train_params=json.dumps({'steps': steps, 'save_root': save_root,
                                 'samples_dir': samples_dir}))
    db.session.add(run)
    db.session.commit()
    return ds, run


def _job_config(run):
    """Shaped like the real thing, small enough to compare by equality."""
    return {'job': 'extension', 'config': {'name': run.job_name,
                                           'process': [{'type': 'sd_trainer'}]}}


# ── 1. submit ────────────────────────────────────────────────────────────────

def test_submit_really_creates_the_job_on_the_peer(configured, peer):
    """`_submit` -> POST /api/jobs with NO id -> the create branch.

    Everything below has only ever been asserted against a mock: the route
    path, the three body keys, the fact that `job_config` arrives as an object
    (ai-toolkit stringifies it itself), and that starting a job is TWO GETs —
    the job's and its queue's.
    """
    from app.extensions import db

    with configured.app_context():
        _, run = _new_run(peer, name='submit-one', trigger='subone')
        config = _job_config(run)
        peer_training._submit(run, config)
        db.session.refresh(run)
        job_id, job_name = run.remote_job_id, run.job_name
        assert run.status == 'queued'

    assert job_id and job_id in peer.jobs, 'the run must store the id the peer returned'
    assert len(peer.jobs) == 1
    job = peer.jobs[job_id]
    assert job['name'] == job_name
    assert job['gpu_ids'] == 'workshop:0'
    assert json.loads(job['job_config']) == config, 'the config is stored verbatim'
    assert job['status'] == 'queued', 'the start call really reached the peer'

    posts = peer.calls('/api/jobs', 'POST')
    assert len(posts) == 1
    assert 'id' not in posts[0]['body'], (
        'a first run must OMIT id — the route branches on its truthiness, and '
        'the update branch cannot update a row that does not exist')
    assert set(posts[0]['body']) == {'name', 'gpu_ids', 'job_config'}

    paths = [c['path'] for c in peer.calls()]
    assert f'/api/jobs/{job_id}/start' in paths
    assert '/api/queue/workshop:0/start' in paths, (
        'the queue for the chosen GPU has to be started too, or the job sits '
        'queued for ever')


# ── 2. adopt ─────────────────────────────────────────────────────────────────

def test_a_second_run_adopts_the_job_the_peer_already_has(configured, peer):
    """`Job.name` is UNIQUE over there, and the job name is derived from the run.

    So the second remote run of any dataset submits a name the peer already has.
    This is the test the mocked suite could not write honestly: the 409 is real
    here, and the adopt path has to survive it.
    """
    from app.extensions import db

    with configured.app_context():
        ds, run_one = _new_run(peer, name='adopt', trigger='adopttrig')
        first_config = _job_config(run_one)
        peer_training._submit(run_one, first_config)
        db.session.refresh(run_one)
        first_id = run_one.remote_job_id

        # The constraint is REAL, not assumed: a plain create is refused.
        client = peer_training._client()
        with pytest.raises(RemoteError, match='409'):
            client.create_job(run_one.job_name, first_config, gpu_ids='workshop:0')

        _, run_two = _new_run(peer, name='adopt', trigger='adopttrig', ds=ds)
        second_config = _job_config(run_two)
        second_config['config']['process'][0]['steps'] = 2400
        peer_training._submit(run_two, second_config)
        db.session.refresh(run_two)
        second_id = run_two.remote_job_id

    assert second_id == first_id, 'the second run must adopt the existing job'
    assert len(peer.jobs) == 1, 'and must not have created a second one'
    assert json.loads(peer.jobs[first_id]['job_config']) == second_config, (
        'adopting means UPDATING — the new config has to win')

    posts = peer.calls('/api/jobs', 'POST')
    assert [p['status'] for p in posts] == [200, 409, 200], (
        'create, then the bare-create counter-proof, then the adopting update')
    assert posts[-1]['body']['id'] == first_id, (
        'without a truthy id the route takes the create branch and 409s again')


# ── 3. status polling ────────────────────────────────────────────────────────

def test_status_polling_reads_a_top_level_job_object(configured, peer, monkeypatch):
    """`GET /api/jobs?id=` answers `NextResponse.json(job)` — the row ITSELF.

    Not `{'job': ...}`, not `{'jobs': [...]}`. A nesting mistake here reads as a
    run that never leaves step 0 and never finishes, and no mocked test can
    catch it because the mock returns whatever shape it was written to return.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)

    with configured.app_context():
        _, run = _new_run(peer, name='poll', trigger='polltrig', steps=999)
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id

        raw = peer_training._client().get_job(job_id)
        assert isinstance(raw, dict) and raw.get('id') == job_id, (
            'the job object is the whole response body')
        assert 'job' not in raw and 'jobs' not in raw

        peer.on_poll[job_id] = [
            {'status': 'running', 'step': 40, 'total_steps': 1200, 'info': 'Training'},
            {'status': 'running', 'step': 880, 'total_steps': 1200, 'info': 'Training'},
            {'status': 'completed', 'step': 1200, 'total_steps': 1200,
             'info': 'Job finished'},
        ]
        peer.add_job_file(job_id, 'lora_polltrig_000001200.safetensors', b'weights')

        peer_training._watch(run)
        db.session.refresh(run)
        status, step, total = run.status, run.step, run.total_steps
        finished, detail = run.finished_at, run.phase_detail

    assert status == 'done', 'a clean finish is reported as "completed" over there'
    assert step == 1200, 'the step count has to come off the top-level object'
    assert total == 1200, 'and it must override the estimate the row started with'
    assert finished is not None
    assert detail.startswith('Done.')
    assert len(peer.calls(f'/api/jobs?id={job_id}')) >= 3


# ── 4. incremental log ───────────────────────────────────────────────────────

def test_log_mirroring_is_incremental_and_sends_its_offset(configured, peer):
    """The mirrored log must equal the remote log, byte for byte, once.

    The offset round-trip is the whole mechanism: the route returns the file's
    new SIZE, and the next call has to send it back or every poll re-appends
    the entire log. At a five-second poll over a multi-hour run that is a log
    that repeats itself hundreds of times.
    """
    from app.extensions import db

    first = 'step 1/1200\nstep 2/1200\nstep 3/1200\n'
    second = 'step 4/1200\nstep 5/1200\n'

    with configured.app_context():
        _, run = _new_run(peer, name='logs', trigger='logstrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        client = peer_training._client()

        peer.write_log(job_id, first, mode='w')
        offset_one = peer_training._mirror_log(client, run, 0)
        peer.write_log(job_id, second)
        offset_two = peer_training._mirror_log(client, run, offset_one)
        log_path = run.log_path

    assert offset_one == len(first.encode('utf-8'))
    assert offset_two == len((first + second).encode('utf-8'))

    with open(log_path, encoding='utf-8') as fh:
        mirrored = fh.read()
    assert mirrored == first + second, 'exactly the remote log, no duplicated bytes'
    assert mirrored.count('step 1/1200') == 1

    log_calls = peer.calls(f'/api/jobs/{job_id}/log')
    assert len(log_calls) == 2
    assert log_calls[0]['path'].endswith('offset=0')
    assert log_calls[1]['path'].endswith(f'offset={offset_one}'), (
        'the second poll must ask for the tail, not the whole file')


# ── 5. truncated log ─────────────────────────────────────────────────────────

def test_a_truncated_remote_log_gets_one_restart_marker(configured, peer):
    """`reset: true` means the far log was replaced, not extended.

    Appending it silently reads as one run that repeated itself and whose step
    count walks backwards halfway down. The marker is what tells whoever reads
    the file later why. It has to appear exactly ONCE — the poll after the reset
    is an ordinary incremental one.
    """
    from app.extensions import db

    original = 'first attempt line one\nfirst attempt line two\nfirst attempt line three\n'
    restarted = 'second attempt\n'
    more = 'second attempt, still going\n'

    with configured.app_context():
        _, run = _new_run(peer, name='trunc', trigger='trunctrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        client = peer_training._client()

        peer.write_log(job_id, original, mode='w')
        offset_one = peer_training._mirror_log(client, run, 0)
        # The far side restarted: the log is a SHORTER, different file now.
        peer.write_log(job_id, restarted, mode='w')
        offset_two = peer_training._mirror_log(client, run, offset_one)
        peer.write_log(job_id, more)
        offset_three = peer_training._mirror_log(client, run, offset_two)
        log_path = run.log_path
        label = run.machine_label

    assert offset_two == len(restarted.encode('utf-8'))
    assert offset_three == len((restarted + more).encode('utf-8'))

    with open(log_path, encoding='utf-8') as fh:
        mirrored = fh.read()
    assert mirrored.count('restarted here') == 1, (
        'one marker per reset — the following polls are ordinary increments')
    assert label in mirrored
    assert mirrored.startswith(original)
    assert mirrored.endswith(restarted + more)
    assert original + restarted not in mirrored, (
        'a silent concatenation is exactly the failure the marker exists to '
        'prevent')


# ── 6. samples ───────────────────────────────────────────────────────────────

def test_samples_are_fetched_once_into_the_folder_the_panel_reads(configured, peer):
    """The peer advertises ABSOLUTE paths on its own disk, and LDS turns each
    into ONE fully percent-encoded `/api/img/` segment.

    That encoding is the part nothing else tests. If `quote(..., safe="")` ever
    became a plain `quote`, the slashes would survive as separators and the
    catch-all would hand its route a multi-segment array — which resolves to
    nothing. Pinned here on the wire, not on the call.
    """
    from app.extensions import db

    payloads = {'0000__000000250.jpg': b'\x89PNG-ish sample one',
                '0001__000000500.jpg': b'sample two, different bytes'}

    with configured.app_context():
        _, run = _new_run(peer, name='samp', trigger='samptrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        client = peer_training._client()
        for name, data in payloads.items():
            peer.add_sample(job_id, name, data)

        advertised = client.get_samples(job_id)
        assert all(os.path.isabs(p) for p in advertised)
        assert all(p.startswith(peer.training_folder) for p in advertised)

        seen: set[str] = set()
        peer_training._mirror_samples(client, run, seen)
        after_first = len(peer.calls('/api/img/'))
        peer_training._mirror_samples(client, run, seen)
        after_second = len(peer.calls('/api/img/'))
        samples_dir = json.loads(run.train_params)['samples_dir']

    assert sorted(os.listdir(samples_dir)) == sorted(payloads)
    for name, data in payloads.items():
        with open(os.path.join(samples_dir, name), 'rb') as fh:
            assert fh.read() == data, 'the bytes must survive the hop'

    assert after_first == 2
    assert after_second == 2, 'a second poll re-downloads nothing'

    segment = peer.calls('/api/img/')[0]['path'][len('/api/img/'):]
    assert '/' not in segment, (
        'the whole absolute path is ONE percent-encoded segment; a bare slash '
        'here means the catch-all sees several and resolves none of them')
    # The separator that must be encoded is THIS platform's: '/' -> %2F on
    # POSIX, '\' -> %5C on Windows. Pinning %2F asserted a POSIX path on a
    # windows-latest CI runner, so it failed for the platform rather than for
    # the property — which is that the separator is encoded and none leaks out.
    assert '%2F' in segment or '%5C' in segment, (
        f'the path separator must be percent-encoded, got {segment!r}')
    assert all(c['status'] == 200 for c in peer.calls('/api/img/'))


# ── 7. checkpoints ───────────────────────────────────────────────────────────

def test_checkpoints_land_in_save_root_not_one_level_up(configured, peer):
    """The log's folder and the checkpoints' folder are NOT the same folder.

    `_run_log_path` is the run's top folder; ai-toolkit saves into
    `<top>/lora_<trigger>` below it, and that save_root is what the checkpoint
    browser, Test Studio and the lineage scan. The first version of this lane
    derived the destination from `dirname(log_path)` — one level too high —
    so a finished run read as "done, no checkpoints". Driven over real HTTP
    here, so the destination AND the transfer are both proven.
    """
    from app.extensions import db

    weights_a = bytes(range(256)) * 40
    weights_b = b'a different checkpoint entirely' * 100

    with configured.app_context():
        _, run = _new_run(peer, name='ckpt', trigger='ckpttrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        peer.add_job_file(job_id, 'lora_ckpttrig_000000500.safetensors', weights_a)
        peer.add_job_file(job_id, 'lora_ckpttrig_000001000.safetensors', weights_b)
        peer.add_job_file(job_id, 'optimizer.pt', b'optimizer state, not a checkpoint')
        peer.add_job_file(job_id, 'config.yaml', b'not a checkpoint either')

        client = peer_training._client()
        peer_training._fetch_checkpoints(client, run)
        db.session.refresh(run)
        save_root = json.loads(run.train_params)['save_root']
        log_dir = os.path.dirname(run.log_path)
        detail = run.phase_detail

    assert save_root != log_dir, 'the fixture itself has to exercise the distinction'
    assert os.path.isdir(save_root), (
        f'nothing was written to the save_root the checkpoint browser scans '
        f'({save_root}); the log folder holds {sorted(os.listdir(log_dir))}')
    assert sorted(os.listdir(save_root)) == ['lora_ckpttrig_000000500.safetensors',
                                             'lora_ckpttrig_000001000.safetensors']
    assert not os.path.exists(os.path.join(log_dir, 'lora_ckpttrig_000000500.safetensors'))
    for name, data in (('lora_ckpttrig_000000500.safetensors', weights_a),
                       ('lora_ckpttrig_000001000.safetensors', weights_b)):
        with open(os.path.join(save_root, name), 'rb') as fh:
            assert fh.read() == data, 'byte-identical, or it is not a checkpoint'
    assert not any(f.endswith('.part') for f in os.listdir(save_root))

    downloads = peer.calls('/api/files/')
    assert len(downloads) == 2, 'optimizer.pt is not a checkpoint and is not fetched'
    assert all(c['status'] == 200 for c in downloads)
    assert detail.startswith('Done.')


# ── 8. Range resume ──────────────────────────────────────────────────────────

def test_a_cut_download_resumes_with_a_range_header(configured, peer):
    """The single most valuable check here, because it has never run for real.

    Some rented hosts' proxies cut the stream every megabyte or two; the resume
    loop exists for that and has only ever been exercised against a mock. Here
    the fake really answers with an honest Content-Length and then hangs up
    partway, and the retry has to send `Range: bytes=<n>-`, get a 206, and
    append — not restart, not truncate, not give up.

    The cut is placed past 256 KiB on purpose: that is `_download`'s
    `iter_content` chunk size, and the field report this loop was written for
    ("cut every ~0.5-2 MB") lands well past it. A cut BELOW one chunk behaves
    differently and is recorded separately at the bottom of this file.
    """
    from app.extensions import db

    weights = bytes(range(256)) * 3600          # 921 600 bytes, deterministic

    with configured.app_context():
        _, run = _new_run(peer, name='resume', trigger='resumetrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        remote_path = peer.add_job_file(
            job_id, 'lora_resumetrig_000000500.safetensors', weights)
        peer.drops[os.path.abspath(remote_path)] = 300_000   # cut once, then behave

        peer_training._fetch_checkpoints(peer_training._client(), run)
        db.session.refresh(run)
        save_root = json.loads(run.train_params)['save_root']
        detail = run.phase_detail

    downloads = peer.calls('/api/files/')
    assert len(downloads) == 2, 'one cut attempt, one resumed attempt'
    assert 'Range' not in downloads[0]['headers'], 'the first attempt starts at 0'
    assert downloads[0]['status'] == 200
    assert downloads[0].get('cut_after') == 300_000

    resumed = downloads[1]['headers'].get('Range')
    assert resumed is not None, 'the retry must resume, not start over'
    match = re.fullmatch(r'bytes=(\d+)-', resumed)
    assert match, f'open-ended byte range expected, got {resumed!r}'
    start = int(match.group(1))
    assert 0 < start < len(weights), 'it has to resume from real progress'
    assert downloads[1]['status'] == 206, 'a Range request is answered 206'

    with open(os.path.join(save_root, 'lora_resumetrig_000000500.safetensors'), 'rb') as fh:
        landed = fh.read()
    assert landed == weights, 'the reassembled file must be byte-identical'
    assert not any(f.endswith('.part') for f in os.listdir(save_root))
    assert detail.startswith('Done.')


# ── 9. a path outside the allowed roots ──────────────────────────────────────

def test_a_file_outside_the_allowed_roots_is_reported_not_crashed(configured, peer,
                                                                  tmp_path,
                                                                  monkeypatch):
    """`/api/files/` refuses anything that resolves outside its roots — 403.

    LDS has to surface that as a reported failure. Never a crash (the run really
    did train), and never a silent success (the weights are still over there).
    The checkpoints it COULD fetch must still land. Driven through the whole
    watcher so the run genuinely finishes first — a copy-back problem must not
    turn a successful TRAINING run into a failed one.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)

    outside = tmp_path / 'not-a-training-folder'
    outside.mkdir()
    stolen = outside / 'lora_elsewhere_000000100.safetensors'
    stolen.write_bytes(b'this file is outside every allowed root')

    good = b'a checkpoint that really is in the job folder'

    with configured.app_context():
        _, run = _new_run(peer, name='refused', trigger='refusedtrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        peer.add_job_file(job_id, 'lora_refusedtrig_000000500.safetensors', good)
        # FAULT INJECTION: the listing advertises a path the download route
        # will refuse. A real peer does this the moment TRAINING_FOLDER moves.
        peer.extra_files[job_id] = [{'path': str(stolen),
                                     'size': stolen.stat().st_size}]
        peer.on_poll[job_id] = [{'status': 'completed', 'step': 1200,
                                 'total_steps': 1200, 'info': 'Job finished'}]

        peer_training._watch(run)
        db.session.refresh(run)
        save_root = json.loads(run.train_params)['save_root']
        status, detail = run.status, run.phase_detail

    refusals = [c for c in peer.calls('/api/files/') if c['status'] == 403]
    assert len(refusals) == 1, 'the refusal has to happen on the wire'
    assert os.listdir(save_root) == ['lora_refusedtrig_000000500.safetensors'], (
        'what could be fetched is still fetched, and nothing partial is left')
    assert status == 'done', 'a copy-back problem is not a failed TRAINING run'
    assert 'could not be copied back' in detail
    assert '403' in detail, 'the reason has to reach the user, not just the log'
    assert 'lora_elsewhere_000000100.safetensors' in detail


# ── 10. stop ─────────────────────────────────────────────────────────────────

def test_stop_reaches_the_peer_and_still_brings_the_weights_home(configured, peer,
                                                                 monkeypatch):
    """Stop promises "whatever was saved is kept" — which is only true if the
    checkpoints are fetched afterwards. `should_fetch_weights('stopped')` says
    so; this proves the whole path does it, over HTTP.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)
    saved = b'the checkpoint that existed when Stop was pressed'

    with configured.app_context():
        _, run = _new_run(peer, name='stopme', trigger='stoptrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id, run_id = run.remote_job_id, run.id
        # The worker has picked the job up: running, with a pid.
        peer.set_job(job_id, status='running', step=300, pid=4242)
        peer.add_job_file(job_id, 'lora_stoptrig_000000300.safetensors', saved)

        assert peer_training.request_stop(run_id) is True
        db.session.refresh(run)
        assert run.stop_requested_at is not None, 'the request has to be durable'

        peer.on_poll[job_id] = [{'status': 'stopped', 'step': 300,
                                 'total_steps': 1200, 'info': 'Job stopped'}]
        peer_training._watch(run)
        db.session.refresh(run)
        status, step = run.status, run.step
        save_root = json.loads(run.train_params)['save_root']

    stops = peer.calls(f'/api/jobs/{job_id}/stop')
    assert stops, 'the stop has to reach GET /api/jobs/<id>/stop'
    assert all(c['method'] == 'GET' for c in stops), 'it is a GET over there'
    assert peer.jobs[job_id]['stop'] is True
    assert peer.jobs[job_id]['info'] in ('Job stopped', 'Stopping job...')

    assert status == 'stopped'
    assert step == 300
    assert os.listdir(save_root) == ['lora_stoptrig_000000300.safetensors'], (
        'a stopped run keeps what it had — that is what Stop promises')
    with open(os.path.join(save_root, 'lora_stoptrig_000000300.safetensors'), 'rb') as fh:
        assert fh.read() == saved


# ── 11. the peer dies ────────────────────────────────────────────────────────

def test_a_peer_that_goes_away_never_reports_a_success(configured, peer,
                                                       monkeypatch):
    """Never a fabricated success, and never a claim about weights.

    This test used to require the run be marked FAILED, and that was changed
    deliberately: "failed" is terminal, and a terminal run leaves
    `active_runs()`, which is the only thing `resume_supervisors` re-attaches
    to — so the status meaning "I cannot see this run" also meant "never look
    again", while the job carried on training. See
    `test_losing_contact_leaves_the_run_re_attachable`.

    What must NOT change is the half this test was really written for: silence
    is never success, the machine is always named, and nothing is claimed to
    have been brought home.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)
    monkeypatch.setattr(peer_training, 'MAX_POLL_FAILURES', 3)

    with configured.app_context():
        _, run = _new_run(peer, name='gone', trigger='gonetrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        assert run.remote_job_id, 'the job was really submitted before the peer died'

        peer.stop()                     # the machine goes away mid-run

        peer_training._watch(run)
        db.session.refresh(run)
        status, detail = run.status, run.phase_detail or ''
        save_root = json.loads(run.train_params)['save_root']

    assert status != 'done', 'silence must never be read as a finished run'
    assert 'Lost contact' in detail, f'the user is told what happened: {detail!r}'
    assert 'Workshop GPU 0' in detail, 'the message has to name the machine'
    assert not os.path.isdir(save_root) or os.listdir(save_root) == [], (
        'nothing may be reported as brought home')


# ── defects these tests were written to catch, now fixed ─────────────────────
#
# All three shipped, and all three were found by this file rather than by a
# real run. They are kept as ordinary tests, with the broken behaviour recorded
# in each docstring: the fix is one or two lines in every case, and a later
# refactor could undo any of them without looking wrong.


def test_a_job_the_peer_no_longer_has_ends_the_run(configured, peer, monkeypatch):
    """A job deleted on the far side (ai-toolkit has a delete route) answers
    JSON `null` with HTTP 200. That is a definite answer — "there is no such
    run" — and it should end the run, not read as "still going, step 0".

    WAS BROKEN AS: `remote = client.get_job(...) or {}` in `_watch`. A `null`
    body is HTTP 200, so it counted as a poll that went fine: the failure
    counter reset, every field read back empty, and the empty status matched
    neither the running set nor a terminal one. The supervisor polled a run
    that no longer existed for ever, holding the dataset's single-run lock, so
    that dataset could not be trained again until the app was restarted.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)

    with configured.app_context():
        _, run = _new_run(peer, name='vanish', trigger='vanishtrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id

        # One healthy poll, five polls of `null`, then a terminal one purely so
        # this test cannot hang whatever the production code does.
        peer.on_poll[job_id] = ([{'status': 'running', 'step': 120,
                                  'total_steps': 1200, 'info': 'Training'}]
                                + [DELETED] * 5
                                + [{'status': 'error', 'step': 120,
                                    'total_steps': 1200, 'info': 'gone'}])
        peer_training._watch(run)

    null_polls = sum(1 for c in peer.calls(f'/api/jobs?id={job_id}')
                     if c['status'] == 200) - 1
    assert null_polls <= 1, (
        f'the watcher polled a deleted job {null_polls} times and would have '
        'kept going for ever; a null job is an answer, not a missed poll')


def test_a_cut_inside_the_first_chunk_still_resumes(configured, peer):
    """Same fault as the resume test, one order of magnitude smaller.

    WAS BROKEN AS: `iter_content(chunk_size=1024 * 256)` plus a retry loop that
    broke out the moment an attempt gained nothing. urllib3 2.x raises
    `IncompleteRead` when the stream is cut mid-chunk and DISCARDS the bytes it
    had already buffered (measured here: 40 000 read, 0 delivered), so an
    attempt cut below one chunk wrote zero bytes, `got == before`, and the
    transfer ended after a single try however large the attempts budget was.
    Nothing was corrupted — the run reported the failure — but a host that cut
    more often than 256 KiB could not deliver a checkpoint at all.

    Fixed on both sides: the chunk shrank to 32 KiB so one cut costs less, and
    a stalled attempt is now counted rather than treated as proof of death.
    """
    from app.extensions import db

    weights = bytes(range(256)) * 3600

    with configured.app_context():
        _, run = _new_run(peer, name='smallcut', trigger='smallcuttrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        remote_path = peer.add_job_file(
            job_id, 'lora_smallcuttrig_000000500.safetensors', weights)
        peer.drops[os.path.abspath(remote_path)] = 40_000     # < 256 KiB

        peer_training._fetch_checkpoints(peer_training._client(), run)
        db.session.refresh(run)
        save_root = json.loads(run.train_params)['save_root']

    landed = os.path.join(save_root, 'lora_smallcuttrig_000000500.safetensors')
    assert os.path.exists(landed), 'one cut must not end the transfer'
    with open(landed, 'rb') as fh:
        assert fh.read() == weights


def test_a_cleanly_ended_short_stream_is_not_promoted_as_a_checkpoint(configured, peer):
    """The failure that would have been silent, which is what made it the
    expensive one.

    WAS BROKEN AS: `_fetch_checkpoints` called `download_public_file` without
    `expected_size`, so a checkpoint was treated like a sample — "completion is
    a stream that ends without error". A transport that re-frames the response
    with connection-close (a proxy, a tunnel) ends a TRUNCATED stream cleanly,
    and the partial `.part` was renamed onto the final `.safetensors`. Measured
    here: 921 600 bytes advertised, 500 000 delivered, promoted to the real
    filename with no `.part` left behind — indistinguishable from a good file
    until something tried to load it, while the run said "Done. Weights copied".

    The size was already on the wire (`list_files` returns it), so the fix is
    one keyword argument, and with it a short stream is just another resume
    point instead of a finished download.
    """
    from app.extensions import db

    weights = bytes(range(256)) * 3600

    with configured.app_context():
        _, run = _new_run(peer, name='shortstream', trigger='shorttrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        remote_path = peer.add_job_file(
            job_id, 'lora_shorttrig_000000500.safetensors', weights)
        peer.close_framed[os.path.abspath(remote_path)] = 500_000

        advertised = peer_training._client().list_files(job_id)
        assert advertised[0]['size'] == len(weights), (
            'the true size is already available to the caller')

        peer_training._fetch_checkpoints(peer_training._client(), run)
        db.session.refresh(run)
        save_root = json.loads(run.train_params)['save_root']

    landed = os.path.join(save_root, 'lora_shorttrig_000000500.safetensors')
    if os.path.exists(landed):
        with open(landed, 'rb') as fh:
            assert fh.read() == weights, (
                'a truncated checkpoint must never be promoted to the final name')


# ── 12. the re-attach path ───────────────────────────────────────────────────

def test_a_restart_does_not_mirror_the_whole_log_twice(configured, peer, monkeypatch):
    """The cursor into the remote log has to outlive the supervisor holding it.

    WAS BROKEN AS: `_watch` opened with `log_offset = 0`, which is right for a
    fresh launch and wrong for every re-attach. `resume_supervisors` re-enters
    `_watch` with no memory, so it asked the peer for the log from byte 0; a
    valid offset is not a truncation, so the answer carried `reset: false`, and
    `_mirror_log` appended the run's entire history to the mirror a second time.
    The restart marker could not fire to explain it — that needs `reset` true —
    so the local log simply showed the run happening twice, step counter and
    all, which is exactly what a reader uses the log to rule out.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)
    first = 'step 1/1200\nstep 2/1200\n'
    second = 'step 3/1200\nstep 4/1200\n'

    with configured.app_context():
        _, run = _new_run(peer, name='restartlog', trigger='restartlogtrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id, log_path = run.remote_job_id, run.log_path

        # One supervisor mirrors the first stretch and ends. (`_watch` only
        # returns on a terminal status, so the leg is ended with one; what is
        # under test is where the NEXT one starts reading, not how this one
        # stopped.)
        peer.write_log(job_id, first)
        peer.on_poll[job_id] = [{'status': 'running', 'step': 2, 'total_steps': 1200},
                                {'status': 'completed', 'step': 2, 'total_steps': 1200}]
        peer_training._watch(run)

        db.session.refresh(run)
        assert run.log_offset == len(first), (
            'the cursor must be recorded on the run, not only in the watcher — '
            'a supervisor that dies takes a local variable with it')

        # A second supervisor picks the same run up, which is all
        # `resume_supervisors` does after a restart: `_watch` on an existing row.
        peer_training._set(run, status='running', finished_at=None)
        peer.write_log(job_id, second)
        peer.on_poll[job_id] = [{'status': 'completed', 'step': 4, 'total_steps': 1200}]
        peer_training._watch(run)

    with open(log_path, encoding='utf-8') as fh:
        mirrored = fh.read()
    assert mirrored == first + second, (
        'the re-attached watcher re-mirrored the log it already had; the local '
        f'copy is {len(mirrored)} bytes for a {len(first + second)}-byte run')
    assert mirrored.count('step 1/1200') == 1, 'the first step appears twice'


def test_a_job_that_was_created_but_never_started_is_not_called_finished(
        configured, peer, monkeypatch):
    """`stopped` is ai-toolkit's creation DEFAULT as well as a real end state.

    WAS BROKEN AS: `REMOTE_TERMINAL_STATUS` maps 'stopped' straight to a
    finished run whose weights are worth collecting. But `POST /api/jobs`
    creates the row already 'stopped' — only `GET /api/jobs/<id>/start` moves it
    to 'queued' — and `_submit` deliberately records the job id BEFORE calling
    start, so that a start which times out is not mistaken for a job never sent.
    Crash in that gap and the next boot skips `_submit` (there is a job id now),
    polls, sees the creation default, and quietly marked the run finished, then
    asked for weights nothing had written. The run read as "stopped" for no
    reason a user could see, and the job it left behind never ran at all.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)

    with configured.app_context():
        _, run = _new_run(peer, name='neverstarted', trigger='neverstartedtrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id

        # Exactly the state a crash between create and start leaves behind: the
        # job exists, carries its creation default, and has never stepped —
        # and, decisively, no start was ever confirmed. `_submit` stamps
        # `started_at` only AFTER `start_job` returns, so clearing it here is
        # what reproduces a process that died inside that window.
        peer.jobs[job_id]['status'] = 'stopped'
        peer.jobs[job_id]['step'] = 0
        peer_training._set(run, status='queued', started_at=None)

        peer_training._watch(run)
        db.session.refresh(run)
        status, error, detail = run.status, run.error or '', run.phase_detail or ''

    assert status == 'failed', (
        f'a job that never started was reported as {status!r}; only a run that '
        'really ran may end in a state that claims its weights are home')
    assert 'never started' in error, f'the reason must say what happened: {error!r}'
    assert 'Weights copied' not in detail, (
        'nothing may claim weights came home from a run that never began')


# ── 13. what a re-attach must not get wrong ──────────────────────────────────

def test_losing_contact_leaves_the_run_re_attachable(configured, peer, monkeypatch):
    """Silence is a fact about the CONVERSATION, not about the run.

    WAS BROKEN AS: the lost-contact path set `status='failed'`, which is in
    `PeerTrainingRun.TERMINAL`. `active_runs()` filters those out and
    `resume_supervisors` only ever re-attaches to what `active_runs()` returns —
    so the single status meaning "I can no longer see this run" also guaranteed
    nothing would ever look again, while the job kept training for hours. Boot
    is when it was most likely to fire: a minute of silence is what an
    ai-toolkit that is still starting up looks like.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.001)
    monkeypatch.setattr(peer_training, 'MAX_POLL_FAILURES', 2)

    with configured.app_context():
        _, run = _new_run(peer, name='silence', trigger='silencetrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)

        peer.stop()                      # the machine stops answering entirely
        peer_training._watch(run)

        db.session.refresh(run)
        status, detail = run.status, run.phase_detail or ''
        still_active = [r.id for r in peer_training.active_runs()]
        run_id = run.id

    assert status not in ('done', 'failed', 'stopped'), (
        f'a run we merely cannot see was marked {status!r}, which removes it '
        'from active_runs() and so from every future resume_supervisors')
    assert run_id in still_active, 'the run must stay re-attachable'
    assert 'Lost contact' in detail, f'the panel must say what happened: {detail!r}'


def test_stop_finalises_a_run_no_supervisor_is_watching(configured, peer):
    """The escape hatch has to actually open.

    WAS BROKEN AS: `request_stop` set `stop_requested_at` and nothing else, and
    that flag is only ever acted on by a watcher. For a run left non-terminal
    with no supervisor — exactly what losing contact now produces — Stop set a
    flag nobody would read, so the row stayed non-terminal for ever and went on
    holding the dataset's single-run lock. The one action offered for getting
    out of that state did nothing.
    """
    from app.extensions import db

    with configured.app_context():
        _, run = _new_run(peer, name='orphan', trigger='orphantrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        peer_training._set(run, status='running')
        assert run.id not in peer_training._threads, 'no supervisor, by construction'

        assert peer_training.request_stop(run.id) is True
        db.session.refresh(run)
        status = run.status
        active = [r.id for r in peer_training.active_runs()]
        run_id = run.id

    assert status == 'stopped', (
        f'Stop left an unwatched run at {status!r}; nothing would ever move it')
    assert run_id not in active, 'a stopped run must release the dataset'


def test_a_failed_copy_back_does_not_rewrite_a_finished_run(configured, peer,
                                                            monkeypatch):
    """Training finished; only the copy home did not.

    WAS BROKEN AS: `_watch` sets the terminal status BEFORE fetching weights,
    and `_fetch_checkpoints` created the destination folder outside its own
    try. A save_root that could not be made therefore raised out of `_watch`,
    and `_supervise`'s catch-all rewrote a run that genuinely COMPLETED as
    'failed' — losing the one fact that mattered, that the checkpoints exist and
    are sitting on the other machine.
    """
    from app.extensions import db

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)
    weights = bytes(range(256)) * 8

    with configured.app_context():
        _, run = _new_run(peer, name='copyfail', trigger='copyfailtrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id
        peer.add_job_file(job_id, 'lora_copyfailtrig_000000500.safetensors', weights)
        peer.on_poll[job_id] = [{'status': 'completed', 'step': 500,
                                 'total_steps': 500}]

        def _boom(*a, **k):
            raise OSError('read-only file system')
        monkeypatch.setattr(peer_training.os, 'makedirs', _boom)

        # Through _supervise, because that catch-all is half the defect.
        peer_training._supervise(configured, run.id)
        db.session.refresh(run)
        status, detail = run.status, run.phase_detail or ''

    assert status == 'done', (
        f'a completed run was rewritten as {status!r} because the copy home '
        'failed; the training finished and its weights are on that machine')
    assert 'machine' in detail.lower(), (
        f'the copy-back problem must still be reported: {detail!r}')


def test_a_run_polls_the_machine_it_was_sent_to(configured, peer, monkeypatch):
    """The address recorded at launch is the one that has the job.

    WAS BROKEN AS: `base_url` was written at launch and never read — every poll
    rebuilt the client from live config. Repoint `aitoolkit.url` while a run is
    in flight, or restart after doing so, and the supervisor polled job ids
    against a DIFFERENT machine's database. Ids are per-database, so the answer
    is a 404 that reads as "the job is gone", or a same-id job reporting a
    stranger's progress into this run.
    """
    from app.extensions import db
    from app import config as cfg

    monkeypatch.setattr(peer_training, 'POLL_SECONDS', 0.01)

    with configured.app_context():
        _, run = _new_run(peer, name='moved', trigger='movedtrig')
        peer_training._submit(run, _job_config(run))
        db.session.refresh(run)
        job_id = run.remote_job_id

        # Settings now point somewhere else entirely — a port nothing serves.
        cfg.save_config({'aitoolkit': {'url': 'http://127.0.0.1:9', 'token': peer.token}})

        peer.on_poll[job_id] = [{'status': 'completed', 'step': 9, 'total_steps': 9}]
        peer_training._watch(run)
        db.session.refresh(run)
        status, step = run.status, run.step

    assert status == 'done' and step == 9, (
        f'the run ended as {status!r} at step {step}; it must keep polling the '
        'machine it was actually sent to, not whatever the settings now say')
