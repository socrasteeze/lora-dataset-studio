"""Peer pull-loop: when role=peer, dial Primary and run claimed jobs locally."""
from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urljoin

import requests

from .. import config as cfg

logger = logging.getLogger(__name__)

POLL_IDLE_SECONDS = 2
POLL_ERROR_SECONDS = 5
HEARTBEAT_SECONDS = 30

# Which of THIS machine's python envs runs each known infer script — mirrors
# the interpreter each pass picks when it runs locally (image_bank_service).
# The human-readable name feeds the error when that env is missing its deps.
_SCRIPT_ENV_KEYS = {
    'bank_score_infer.py': 'bank_scoring.python',
    'face_embed_infer.py': 'face_scoring.python',
}
_SCRIPT_ENV_NAMES = {
    'bank_score_infer.py': 'bank-scoring',
    'face_embed_infer.py': 'face-scoring',
    'joycaption_infer.py': 'ai-toolkit',
}
# Scripts whose interpreter is NOT a plain config key. JoyCaption runs in the
# ai-toolkit venv, and `aitoolkit.python` is only ONE way that is configured —
# installs without a venv folder (conda, uv, system python) set it, installs
# with one do not, and cfg.aitoolkit_path('venv_python') is the helper that
# knows both. Reading the bare key would send a perfectly good peer to
# sys.executable, which is the shape of the wrong-venv bug that produced a
# ModuleNotFoundError on a fully configured faces pass.
_SCRIPT_ENV_RESOLVERS = {
    'joycaption_infer.py': lambda: cfg.aitoolkit_path('venv_python'),
}
# …and the environment those scripts need. HF_HOME is not optional for
# JoyCaption: without it the 8B model resolves to the default HF cache and is
# DOWNLOADED AGAIN on a machine that already has it (see infer_stream's note).
_SCRIPT_ENV_VARS = {
    'joycaption_infer.py': lambda: {'HF_HOME': str(cfg.aitoolkit_path('hf_home')),
                                    'PYTHONIOENCODING': 'utf-8'},
}
# Where THIS machine keeps the weights for each script. The hub cannot send this
# — its path describes its own disk — but omitting it entirely is worse than
# wrong: the scripts fall back to the insightface/HF default cache and DOWNLOAD
# the model again (~344 MB for antelopev2) even on a peer that already has it
# configured and on disk.
_SCRIPT_MODELS_ROOT_KEYS = {
    'bank_score_infer.py': 'bank_scoring.models_root',
    'face_embed_infer.py': 'face_scoring.models_root',
}


# A tqdm/pip progress line is the WORST last-line candidate for an error
# message: it is the most likely thing a downloading script prints last, and it
# says nothing about the failure. Recognised so the real line can be found.
_NOISE_MARKERS = ('%|', 'it/s]', 'KB/s]', 'MB/s]', 'B/s]')


def _script_error(stdout) -> str | None:
    """The error the infer script itself reported, if it exited as clean JSON."""
    from ..services import infer_stream
    obj = infer_stream.parse_result_json(stdout)
    if isinstance(obj, dict) and obj.get('error'):
        return str(obj['error'])[:400]
    return None


def _useful_stderr(lines) -> str | None:
    """The last stderr line that is not a progress bar."""
    for ln in reversed(list(lines or ())):
        ln = (ln or '').strip()
        if ln and not any(m in ln for m in _NOISE_MARKERS):
            return ln[:400]
    return None


class PeerWorker:
    def __init__(self):
        self._app = None
        self._thread = None
        self._running = False
        self._busy = False
        self._current_job_id = None
        # WHAT it is doing, not just that it is busy. 'a job is running' is not
        # an answer on a machine whose whole purpose is running other people's
        # work — the kind and the phase are what make the peer explain itself.
        self._current_kind = None
        self._phase = None
        self._last_error = None
        self._connected = False

    def init_app(self, app):
        self._app = app

    def start(self):
        if self._thread is not None and self._thread.is_alive():
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, name='cluster-peer',
                                        daemon=True)
        self._thread.start()

    def stop(self, timeout=5):
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=timeout)
            self._thread = None

    def status(self) -> dict:
        return {
            'running': self._running and self._thread is not None and self._thread.is_alive(),
            'connected': self._connected,
            'busy': self._busy,
            'current_job_id': self._current_job_id,
            'current_kind': self._current_kind,
            'phase': self._phase,
            'last_error': self._last_error,
            'primary_url': (cfg.get('cluster.primary_url') or '').rstrip('/'),
        }

    def _log(self, message, level='info', detail=None):
        """Record into THIS machine's activity log. A peer used to run an hour
        of someone else's work with its own 📋 panel completely empty, so from
        the peer there was no way to tell the app was doing anything at all.
        Guarded: the log never breaks the job."""
        try:
            from . import activity_log
            activity_log.record('peer', message, level=level, detail=detail)
        except Exception:      # noqa: BLE001
            pass

    def _headers(self) -> dict:
        token = (cfg.get('cluster.peer_token') or '').strip()
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'X-LDS-Peer': '1',
        }

    def _base(self) -> str:
        return (cfg.get('cluster.primary_url') or '').rstrip('/')

    def _url(self, path: str) -> str:
        return urljoin(self._base() + '/', path.lstrip('/'))

    def _run_loop(self):
        while self._running:
            try:
                with self._app.app_context():
                    from . import cluster as cluster_svc
                    if cluster_svc.role() != 'peer':
                        self._connected = False
                        time.sleep(POLL_IDLE_SECONDS)
                        continue
                    if not self._base() or not (cfg.get('cluster.peer_token') or '').strip():
                        self._last_error = 'peer role set but primary_url / peer_token missing'
                        self._connected = False
                        time.sleep(POLL_ERROR_SECONDS)
                        continue
                    self._tick()
            except Exception as e:
                self._connected = False
                self._last_error = str(e)
                logger.exception('peer_worker: loop error')
                time.sleep(POLL_ERROR_SECONDS)

    def _tick(self):
        from . import cluster as cluster_svc
        caps = cluster_svc.local_capabilities()
        try:
            r = requests.post(
                self._url('/api/cluster/peer/heartbeat'),
                headers=self._headers(),
                json={'capabilities': caps, 'busy': self._busy},
                timeout=15,
            )
            if r.status_code == 401:
                self._connected = False
                self._last_error = 'rejected by Primary (check peer token)'
                time.sleep(POLL_ERROR_SECONDS)
                return
            r.raise_for_status()
            self._connected = True
            self._last_error = None
        except requests.RequestException as e:
            self._connected = False
            self._last_error = f'heartbeat failed: {e}'
            time.sleep(POLL_ERROR_SECONDS)
            return

        if self._busy:
            time.sleep(HEARTBEAT_SECONDS)
            return

        try:
            r = requests.post(
                self._url('/api/cluster/peer/pull'),
                headers=self._headers(),
                json={},
                timeout=30,
            )
            r.raise_for_status()
            data = r.json() or {}
        except requests.RequestException as e:
            self._last_error = f'pull failed: {e}'
            time.sleep(POLL_ERROR_SECONDS)
            return

        job = data.get('job')
        if not job:
            time.sleep(POLL_IDLE_SECONDS)
            return

        self._busy = True
        self._current_job_id = job.get('job_id')
        self._current_kind = job.get('kind')
        self._phase = None
        self._log(f'claimed a {job.get("kind") or "job"} from the Primary',
                  detail=f'job {str(job.get("job_id") or "")[:8]}')
        try:
            self._execute(job)
        finally:
            self._busy = False
            self._current_job_id = None
            self._current_kind = None
            self._phase = None

    def _download_artifacts(self, job_id: str, names: list[str], dest_dir: Path) -> dict[str, Path]:
        dest_dir.mkdir(parents=True, exist_ok=True)
        out = {}
        for name in names:
            safe = os.path.basename(name)
            url = self._url(f'/api/cluster/peer/artifacts/{job_id}/{safe}')
            r = requests.get(url, headers=self._headers(), timeout=120, stream=True)
            r.raise_for_status()
            path = dest_dir / safe
            with open(path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=1024 * 256):
                    if chunk:
                        f.write(chunk)
            out[safe] = path
        return out

    def _upload_artifact(self, job_id: str, path: Path, name: str | None = None) -> str:
        name = name or path.name
        url = self._url(f'/api/cluster/peer/artifacts/{job_id}/{os.path.basename(name)}')
        with open(path, 'rb') as f:
            r = requests.put(
                url,
                headers={
                    'Authorization': self._headers()['Authorization'],
                    'X-LDS-Peer': '1',
                    'Content-Type': 'application/octet-stream',
                },
                data=f,
                timeout=300,
            )
        r.raise_for_status()
        return os.path.basename(name)

    def _complete(self, job_id: str, *, result=None, error=None, output_artifact=None):
        body = {
            'result': result or {},
            'error': error,
            'output_artifact': output_artifact,
        }
        r = requests.post(
            self._url(f'/api/cluster/peer/jobs/{job_id}/complete'),
            headers=self._headers(),
            json=body,
            timeout=60,
        )
        r.raise_for_status()

    def _progress(self, job_id: str, progress: dict) -> dict:
        """Report progress; the RESPONSE is the hub's one channel back to a
        running job — {'cancelled': True} means Stop was pressed there.

        Every kind already funnels its phases through here, so this is also the
        one place that can keep the LOCAL phase fresh for status()/the header
        chip without a second bookkeeping path to forget to update."""
        phase = (progress or {}).get('phase')
        if phase:
            self._phase = str(phase)
        try:
            r = requests.post(
                self._url(f'/api/cluster/peer/jobs/{job_id}/heartbeat'),
                headers=self._headers(),
                json={'progress': progress},
                timeout=15,
            )
            return r.json() if r.content else {}
        except (requests.RequestException, ValueError):
            return {}

    def _execute(self, job: dict):
        kind = job.get('kind')
        job_id = job['job_id']
        try:
            if kind == 'comfy':
                self._run_comfy(job)
            elif kind == 'vision':
                self._run_vision(job)
            elif kind == 'infer':
                self._run_infer(job)
            elif kind == 'training':
                self._run_training(job)
            else:
                self._complete(job_id, error=f'unsupported kind: {kind}')
            self._log(f'finished the {kind or "job"} for the Primary', 'ok')
        except Exception as e:
            logger.exception('peer_worker: job %s failed', job_id)
            self._log(f'the {kind or "job"} failed', 'error',
                      detail=str(e)[:200])
            try:
                self._complete(job_id, error=str(e)[:500])
            except Exception:
                logger.exception('peer_worker: could not report failure for %s', job_id)

    def _run_comfy(self, job: dict):
        from ..utils import comfy_fs
        from ..utils.comfyui import (queue_prompt_to_comfyui, get_comfyui_history,
                                     fetch_output_image_bytes)

        job_id = job['job_id']
        payload = job.get('payload') or {}
        workflow = payload.get('workflow')
        if not workflow:
            self._complete(job_id, error='missing workflow')
            return

        artifact_names = list(job.get('artifacts') or payload.get('artifacts') or [])
        work = Path(tempfile.mkdtemp(prefix='lds-peer-comfy-'))
        try:
            downloaded = self._download_artifacts(job_id, artifact_names, work)
            comfy_input_dir = comfy_fs.ensure_input_usable(cfg.comfyui_dir('input'))
            for name, path in downloaded.items():
                comfy_fs.stage_input_copy(str(path), name, comfy_input_dir)

            self._progress(job_id, {'phase': 'queued'})
            client_id = payload.get('client_id') or f'peer-{uuid.uuid4().hex[:8]}'
            result, error = queue_prompt_to_comfyui(workflow, client_id)
            if error:
                self._complete(job_id, error=error)
                return
            prompt_id = (result or {}).get('prompt_id')
            if not prompt_id:
                self._complete(job_id, error=f'ComfyUI returned no prompt_id: {result}')
                return

            filename = self._poll_comfy(prompt_id, job_id)
            if not filename:
                self._complete(job_id, error='ComfyUI produced no output image')
                return

            raw = fetch_output_image_bytes(filename)
            if not raw:
                # Fall back to filesystem
                out_dir = cfg.comfyui_dir('output')
                fspath = Path(out_dir) / filename if out_dir else None
                if fspath and fspath.is_file():
                    out_path = work / os.path.basename(filename)
                    shutil.copy2(fspath, out_path)
                else:
                    self._complete(job_id, error=f'could not fetch output {filename}')
                    return
            else:
                out_path = work / os.path.basename(filename)
                out_path.write_bytes(raw)

            uploaded = self._upload_artifact(job_id, out_path)
            self._complete(job_id, result={'comfy_filename': filename},
                           output_artifact=uploaded)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _poll_comfy(self, prompt_id: str, job_id: str, timeout=15 * 60) -> str | None:
        from ..utils.comfyui import get_comfyui_history
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            self._progress(job_id, {'phase': 'rendering', 'prompt_id': prompt_id})
            history = get_comfyui_history(prompt_id) or {}
            entry = history.get(prompt_id, history) if isinstance(history, dict) else {}
            outputs = (entry or {}).get('outputs') or {}
            for node_output in outputs.values():
                for img in (node_output or {}).get('images') or []:
                    if isinstance(img, dict) and img.get('filename') and img.get('type', 'output') != 'temp':
                        return img['filename']
            status = (entry or {}).get('status') or {}
            if status.get('status_str') == 'error' or (status.get('completed') and not outputs):
                return None
            time.sleep(2)
        return None

    def _run_vision(self, job: dict):
        """Run an Ollama vision batch: payload images → text/JSON results."""
        from ..services import vision_ollama

        job_id = job['job_id']
        payload = job.get('payload') or {}
        prompt = payload.get('prompt') or 'Describe this image.'
        artifact_names = list(job.get('artifacts') or payload.get('artifacts') or [])
        work = Path(tempfile.mkdtemp(prefix='lds-peer-vision-'))
        try:
            downloaded = self._download_artifacts(job_id, artifact_names, work)
            results = []
            for i, name in enumerate(artifact_names):
                path = downloaded.get(os.path.basename(name))
                if path is None:
                    continue
                resp = self._progress(job_id, {
                    'phase': 'vision', 'index': i, 'total': len(artifact_names)})
                if resp.get('cancelled'):
                    break               # Stop on the hub — abort between images
                text = vision_ollama.describe_image_ollama(
                    path.read_bytes(),
                    prompt,
                    keep_alive='5m',
                    prefer_json=bool(payload.get('prefer_json')),
                    fmt=payload.get('fmt'),
                )
                results.append({'artifact': os.path.basename(name), 'text': text})
            try:
                vision_ollama.unload_vision_model()
            except Exception:
                pass
            result_path = work / 'vision_result.json'
            result_path.write_text(json.dumps({'items': results}), encoding='utf-8')
            uploaded = self._upload_artifact(job_id, result_path, 'vision_result.json')
            self._complete(job_id, result={'items': results}, output_artifact=uploaded)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _run_infer(self, job: dict):
        """Run a backend/infer/*.py script — stdin JSON payload, stdout JSON."""
        import sys
        from ..services import infer_stream

        job_id = job['job_id']
        payload = job.get('payload') or {}
        script_name = payload.get('script')
        if not script_name:
            self._complete(job_id, error='missing infer script')
            return
        # ALWAYS resolve inside this install's backend/infer/ — the basename and
        # nothing else. The Primary is a remote machine; honouring an absolute
        # path (or a bare `python` to run it with) would have let whoever holds
        # the Primary run any file on this box as the user who started the app.
        # That is a bigger grant than "rent my GPU", and it is not what the
        # Devices card asks the user to agree to.
        from ..config import REPO_ROOT
        script_path = REPO_ROOT / 'backend' / 'infer' / os.path.basename(str(script_name))
        if not script_path.is_file():
            self._complete(job_id,
                           error=f'infer script not available on this peer: '
                                 f'{os.path.basename(str(script_name))}')
            return

        artifact_names = list(job.get('artifacts') or payload.get('artifacts') or [])
        work = Path(tempfile.mkdtemp(prefix='lds-peer-infer-'))
        try:
            downloaded = self._download_artifacts(job_id, artifact_names, work)
            stdin_payload = dict(payload.get('stdin') or {})
            # Where the weights live, from the PEER's config — same principle as
            # the interpreter above, and the same bug when it is missing: with no
            # models_root the scripts silently fall back to the insightface/HF
            # default cache and re-download the model on a machine that already
            # had it configured.
            mr_key = _SCRIPT_MODELS_ROOT_KEYS.get(script_path.name)
            if mr_key:
                local_root = (cfg.get(mr_key) or '').strip()
                if local_root:
                    stdin_payload['models_root'] = local_root
                else:
                    # Not configured here: let the script use its OWN default
                    # cache rather than inherit a hub path that does not exist
                    # on this disk.
                    stdin_payload.pop('models_root', None)

            # The bank scoring/face scripts write their .npz CACHE at the path
            # named in the payload, and honour a cancel-file sentinel next to
            # it. Both are hub paths that mean nothing here: point them into
            # work/out — everything in out/ is uploaded back when the job
            # completes, which is exactly how the embeddings cache gets home.
            out_dir = work / 'out'
            cancel_sentinel = None
            for key in ('cache', 'cancel_file'):
                if isinstance(stdin_payload.get(key), str) and stdin_payload[key]:
                    out_dir.mkdir(exist_ok=True)
                    local = out_dir / os.path.basename(stdin_payload[key])
                    stdin_payload[key] = str(local)
                    if key == 'cancel_file':
                        cancel_sentinel = local
            # Rewrite any hub-side paths the Primary embedded to local downloads.
            path_map = {os.path.basename(n): str(p) for n, p in downloaded.items()}
            if 'images' in stdin_payload and isinstance(stdin_payload['images'], list):
                rewritten = []
                for item in stdin_payload['images']:
                    if isinstance(item, str):
                        rewritten.append(path_map.get(os.path.basename(item), item))
                    elif isinstance(item, dict):
                        name = os.path.basename(item.get('name') or item.get('path') or '')
                        entry = dict(item)
                        if name in path_map:
                            entry['path'] = path_map[name]
                        rewritten.append(entry)
                    else:
                        rewritten.append(item)
                stdin_payload['images'] = rewritten
            for key in ('image', 'ref', 'path'):
                if key in stdin_payload and isinstance(stdin_payload[key], str):
                    base = os.path.basename(stdin_payload[key])
                    if base in path_map:
                        stdin_payload[key] = path_map[base]

            # Interpreter comes from THIS machine's config only — a peer-supplied
            # `python` would reintroduce the arbitrary-execution grant the script
            # confinement above just closed. And it is chosen PER SCRIPT: the
            # faces script needs the face-scoring env (cv2/onnx/insightface),
            # the score script the bank-scoring one — a single chain ran a fully
            # configured faces pass in the wrong venv and died on cv2.
            env_key = _SCRIPT_ENV_KEYS.get(script_path.name)
            resolver = _SCRIPT_ENV_RESOLVERS.get(script_path.name)
            if resolver is not None:
                try:
                    python = str(resolver() or '').strip() or sys.executable
                except Exception:      # noqa: BLE001 — an unconfigured extra
                    python = sys.executable
            elif env_key:
                python = ((cfg.get(env_key) or '').strip() or sys.executable)
            else:
                python = ((cfg.get('bank_scoring.python') or '').strip()
                          or (cfg.get('aitoolkit.python') or '').strip()
                          or sys.executable)
            # Extra environment for scripts whose weights live outside the
            # default cache. Inherit, never replace: dropping the parent env
            # would take PATH and the CUDA variables with it.
            script_env = None
            make_env = _SCRIPT_ENV_VARS.get(script_path.name)
            if make_env is not None:
                try:
                    script_env = dict(os.environ, **make_env())
                except Exception:      # noqa: BLE001
                    script_env = None
            timeout = int(payload.get('timeout') or 3600)
            self._progress(job_id, {'phase': 'infer', 'script': script_path.name})

            def _on_line(line):
                resp = self._progress(job_id, {'phase': 'infer', 'line': line[-200:]})
                # Stop pressed on the hub: the script's OWN cancel mechanism —
                # the sentinel file it polls — turns the abort into the clean
                # `cancelled: true` exit these scripts already know how to make.
                if resp.get('cancelled') and cancel_sentinel is not None:
                    try:
                        cancel_sentinel.write_text('1', encoding='utf-8')
                    except OSError:
                        pass

            stdout, stderr_lines, rc, timed_out = infer_stream.run_infer_script(
                python, str(script_path), json.dumps(stdin_payload),
                timeout, on_line=_on_line, env=script_env)
            if timed_out:
                self._complete(job_id, error='infer script timed out')
                return
            if rc != 0:
                # These scripts fail as CLEAN JSON on stdout by design
                # ({'ok': False, 'error': 'model load failed: …'}), so that is
                # the authoritative message — and it must be preferred over the
                # stderr tail. Reported: a peer run died with
                # "infer exit 1: 100%|██████| 352210/352210 [00:02, …KB/s]" —
                # the tail was a tqdm DOWNLOAD BAR while the real reason sat in
                # stdout, unread.
                detail = _script_error(stdout) or ''
                tail = infer_stream.stderr_tail(stderr_lines)
                if not detail:
                    detail = _useful_stderr(stderr_lines) or tail or stdout[:300]
                env_name = _SCRIPT_ENV_NAMES.get(script_path.name)
                if env_name and 'ModuleNotFoundError' in ' '.join(
                        list(stderr_lines or ())[-12:]):
                    # A missing package reads as a bare traceback otherwise —
                    # this is the one failure mode with an obvious fix (install
                    # the extra on THIS machine), so name it instead of leaving
                    # the user to grep a stack trace for the answer.
                    detail = (f"this peer's {env_name} python is missing its "
                             f'dependencies — run Setup ▸ Quality tools on the '
                             f'peer ({detail})')
                self._complete(job_id, error=f'infer exit {rc}: {detail}')
                return
            # Tolerant on purpose: a script's dependencies print to stdout too
            # (InsightFace names every model it resolves), so the result is the
            # last JSON line, not the whole buffer. Parsing the buffer meant a
            # perfectly good faces pass came home as {'stdout': '…'} — no `ok`,
            # no `error` — and the hub reported "produced no output" over a
            # result that was sitting right there.
            result_obj = infer_stream.parse_result_json(stdout)
            if result_obj is None:
                # rc says success but nothing here is readable: that is a FAILED
                # job, not a completed one. Saying so with the peer's own output
                # beats shipping a placeholder the hub can only guess at.
                detail = (_useful_stderr(stderr_lines)
                          or (stdout or '').strip()[-300:]
                          or 'no output at all')
                self._complete(job_id, error=f'infer exited 0 but printed no '
                                            f'readable result: {detail}')
                return

            result_path = work / 'infer_result.json'
            result_path.write_text(json.dumps(result_obj), encoding='utf-8')
            out_dir = work / 'out'
            uploaded_extras = []
            if out_dir.is_dir():
                for p in out_dir.iterdir():
                    if p.is_file():
                        uploaded_extras.append(self._upload_artifact(job_id, p))
            uploaded = self._upload_artifact(job_id, result_path, 'infer_result.json')
            self._complete(job_id,
                           result={'result': result_obj, 'extra_artifacts': uploaded_extras},
                           output_artifact=uploaded)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _run_training(self, job: dict):
        """Download dataset archive, launch local ai-toolkit, upload checkpoints."""
        from ..services import lora_training

        job_id = job['job_id']
        payload = job.get('payload') or {}
        artifact_names = list(job.get('artifacts') or payload.get('artifacts') or [])
        work = Path(tempfile.mkdtemp(prefix='lds-peer-train-'))
        try:
            downloaded = self._download_artifacts(job_id, artifact_names, work)
            archive_name = payload.get('dataset_archive') or (
                artifact_names[0] if artifact_names else None)
            if not archive_name:
                self._complete(job_id, error='missing dataset archive')
                return
            archive = downloaded.get(os.path.basename(archive_name))
            if archive is None:
                self._complete(job_id, error='dataset archive not downloaded')
                return

            self._progress(job_id, {'phase': 'extract'})
            dataset_dir = work / 'dataset'
            dataset_dir.mkdir()
            if str(archive).endswith('.zip'):
                import zipfile
                with zipfile.ZipFile(archive, 'r') as zf:
                    zf.extractall(dataset_dir)
            else:
                shutil.copy2(archive, dataset_dir / archive.name)

            train_kwargs = dict(payload.get('train') or {})
            self._progress(job_id, {'phase': 'training'})

            # Peer-local training entry: services expose a helper that runs
            # ai-toolkit against an arbitrary folder and returns checkpoint paths.
            run_fn = getattr(lora_training, 'run_peer_training', None)
            if run_fn is None:
                self._complete(
                    job_id,
                    error='peer training helper not available on this build — '
                          'update both installs')
                return

            def _on_progress(info):
                self._progress(job_id, {'phase': 'training', **(info or {})})

            result = run_fn(dataset_dir=str(dataset_dir),
                            work_dir=str(work / 'run'),
                            progress_cb=_on_progress,
                            **train_kwargs)
            ckpts = list((result or {}).get('checkpoints') or [])
            uploaded = []
            for ckpt in ckpts:
                p = Path(ckpt)
                if p.is_file():
                    uploaded.append(self._upload_artifact(job_id, p))
            meta_path = work / 'training_result.json'
            meta_path.write_text(json.dumps({
                'checkpoints': uploaded,
                'detail': (result or {}).get('detail'),
            }), encoding='utf-8')
            meta_name = self._upload_artifact(job_id, meta_path, 'training_result.json')
            self._complete(job_id,
                           result={'checkpoints': uploaded, 'raw': result},
                           output_artifact=meta_name)
        finally:
            shutil.rmtree(work, ignore_errors=True)


peer_worker = PeerWorker()
