"""Per-backend worker threads for remote ComfyUI API backends.

The SwarmUI shape: the far machine runs ONLY ComfyUI (`--listen`), and this
process drives it over the API — upload inputs, queue the prompt, poll history,
download the output into the LOCAL ComfyUI output folder so every existing
completion handler (dataset linker, Studio grid, watermark…) finds the file
exactly where it always has.

One daemon thread per configured backend, so two backends render two jobs at
once and neither blocks the local queue. Deliberately NOT gated on
`training_in_progress` the way the local worker is: that gate exists because
local ComfyUI shares one GPU with training, and a remote backend does not —
the laptop can keep rendering while the desktop trains.

Rows are ordinary ImageGenerationQueue entries tagged with the backend's
`worker_id` — no ClusterJob, no artifact copies, nothing to sweep.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid

logger = logging.getLogger(__name__)

POLL_IDLE_SECONDS = 2
POLL_INTERVAL_SECONDS = 2
POLL_TIMEOUT_SECONDS = 15 * 60


class BackendWorkerManager:
    """Owns one worker thread per configured backend; reconciled on config change."""

    def __init__(self):
        self._app = None
        self._threads: dict[str, threading.Thread] = {}
        self._lock = threading.Lock()

    def init_app(self, app):
        self._app = app

    def sync(self):
        """Start a thread per configured backend; missing threads only.

        A thread whose backend was REMOVED exits on its own (each loop tick
        re-reads the config), so reconciliation here is start-only.
        """
        if self._app is None:
            return
        from . import cluster as cluster_svc
        with self._app.app_context():
            backends = cluster_svc.list_backends()
        with self._lock:
            for b in backends:
                t = self._threads.get(b['id'])
                if t is not None and t.is_alive():
                    continue
                t = threading.Thread(target=self._run_loop, args=(b['id'],),
                                     name=f'comfy-backend-{b["id"][-6:]}',
                                     daemon=True)
                self._threads[b['id']] = t
                t.start()

    # ── the per-backend loop ──────────────────────────────────────────────

    def _run_loop(self, backend_id: str):
        while True:
            try:
                with self._app.app_context():
                    from . import cluster as cluster_svc
                    backend = cluster_svc.backend_by_id(backend_id)
                    if backend is None:
                        # Removed in Settings — this thread's reason to exist
                        # is gone. sync() will start a fresh one if it returns.
                        with self._lock:
                            self._threads.pop(backend_id, None)
                        return
                    if not self._tick(backend):
                        time.sleep(POLL_IDLE_SECONDS)
            except Exception:
                logger.exception('backend_worker[%s]: loop error', backend_id)
                time.sleep(POLL_IDLE_SECONDS * 2)

    def _tick(self, backend: dict) -> bool:
        """Claim and run one job for this backend. True if one was processed."""
        from datetime import datetime

        from ..extensions import db
        from ..models import ImageGenerationQueue

        job = (ImageGenerationQueue.query
               .filter_by(status='pending', worker_id=backend['id'])
               .order_by(ImageGenerationQueue.priority.desc(),
                         ImageGenerationQueue.created_at.asc())
               .first())
        if job is None:
            return False
        # Same conditional-UPDATE claim as the local worker: a cancel that
        # landed between the SELECT and here must win.
        claimed = (ImageGenerationQueue.query
                   .filter_by(job_id=job.job_id, status='pending')
                   .update({'status': 'processing',
                            'started_at': datetime.utcnow(),
                            'last_heartbeat': datetime.utcnow()}))
        db.session.commit()
        if not claimed:
            return True
        db.session.refresh(job)
        self._execute(job, backend)
        return True

    def _execute(self, job, backend: dict):
        from ..extensions import db
        from ..job_queue import _dispatch_completion

        filename, failed, error_detail = None, True, None
        try:
            filename, failed, error_detail = self._run_remote(job, backend)
        except Exception as exc:
            logger.exception('backend_worker: job %s failed on %s',
                             job.job_id, backend['name'])
            error_detail = str(exc)[:400]

        db.session.refresh(job)
        if job.status == 'cancelled':
            _dispatch_completion(job, filename, True)
            return
        job.update_status(
            'failed' if failed else 'completed',
            result_filename=filename,
            error_message=None if not failed else
            (error_detail or job.error_message
             or f'generation failed on backend {backend["name"]}'))
        db.session.commit()
        _dispatch_completion(job, filename, failed)

    def _run_remote(self, job, backend: dict):
        """Upload → queue → poll → download. Returns (filename, failed, detail)."""
        from datetime import datetime

        from ..extensions import db
        from ..models import ImageGenerationQueue
        from ..utils.comfyui import (cancel_comfyui_prompt, get_comfyui_history,
                                     queue_prompt_to_comfyui,
                                     upload_input_image_to_worker)

        url = backend['url']
        try:
            md = json.loads(job.job_metadata or '{}')
        except (TypeError, ValueError):
            md = {}

        # Inputs go over the API — the one leg filesystem staging cannot make.
        staged_paths = md.get('staged_input_paths') or {}
        for name in (md.get('staged_inputs') or ()):
            src = staged_paths.get(name)
            if not src or not os.path.isfile(src):
                return None, True, (f'input {os.path.basename(str(name))} is no '
                                    f'longer on the hub — regenerate the job')
            upload_input_image_to_worker(name, src, url)

        workflow = json.loads(job.workflow_data or '{}')
        result, error = queue_prompt_to_comfyui(
            workflow, f'lds-backend-{uuid.uuid4().hex[:8]}', worker_url=url)
        if error:
            return None, True, f'backend {backend["name"]}: {error}'[:400]
        prompt_id = (result or {}).get('prompt_id')
        if not prompt_id:
            return None, True, f'backend returned no prompt_id: {result}'

        # Mirror the local worker's cancel-race guard on the status advance.
        advanced = (ImageGenerationQueue.query
                    .filter_by(job_id=job.job_id, status='processing')
                    .update({'status': 'sent_to_comfy',
                             'comfyui_prompt_id': prompt_id}))
        db.session.commit()
        if not advanced:
            cancel_comfyui_prompt(prompt_id, worker_url=url)
            return None, True, None

        # Poll — heartbeat the row (is_stuck watches it), honor cancels by
        # interrupting the REMOTE ComfyUI, which the generic cancel path cannot
        # reach (it only knows the local one).
        deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            status_now = (ImageGenerationQueue.query
                          .with_entities(ImageGenerationQueue.status)
                          .filter_by(job_id=job.job_id).scalar())
            if status_now == 'cancelled':
                cancel_comfyui_prompt(prompt_id, worker_url=url)
                return None, True, None
            (ImageGenerationQueue.query
             .filter_by(job_id=job.job_id)
             .update({'last_heartbeat': datetime.utcnow()}))
            db.session.commit()

            history = get_comfyui_history(prompt_id, worker_url=url) or {}
            entry = (history.get(prompt_id, history)
                     if isinstance(history, dict) else {})
            outputs = (entry or {}).get('outputs') or {}
            for node_output in outputs.values():
                for img in (node_output or {}).get('images') or []:
                    if (isinstance(img, dict) and img.get('filename')
                            and img.get('type', 'output') != 'temp'):
                        return self._materialize(job, backend,
                                                 img['filename'])
            status = (entry or {}).get('status') or {}
            if (status.get('status_str') == 'error'
                    or (status.get('completed') and not outputs)):
                return None, True, (f'backend {backend["name"]}: ComfyUI '
                                    f'reported an execution error')
            time.sleep(POLL_INTERVAL_SECONDS)
        return None, True, (f'backend {backend["name"]}: no output after '
                            f'{POLL_TIMEOUT_SECONDS // 60} min')

    def _materialize(self, job, backend: dict, remote_filename: str):
        """Download the remote output into the LOCAL ComfyUI output folder.

        Under a fresh name: the remote box's SaveImage counter and the local
        one both mint `ComfyUI_00001_.png`, so keeping the remote name would
        eventually OVERWRITE a genuinely local render. Every completion
        handler downstream fetches by this returned name (local /view or
        disk), so once the file is here the rest of the pipeline cannot tell
        the render was remote.
        """
        import requests
        from urllib.parse import urlencode, urljoin

        from .. import config as cfg

        out_dir = cfg.comfyui_dir('output')
        if not out_dir:
            return None, True, ('the hub has no local ComfyUI output folder '
                                'configured — Settings → Local tools — so a '
                                'backend render has nowhere to land')
        local_name = f'backend_{job.job_id[:8]}_{os.path.basename(remote_filename)}'
        try:
            qs = urlencode({'filename': remote_filename, 'type': 'output'})
            r = requests.get(urljoin(backend['url'] + '/', f'view?{qs}'),
                             timeout=120, stream=True)
            r.raise_for_status()
            os.makedirs(out_dir, exist_ok=True)
            dest = os.path.join(out_dir, local_name)
            with open(dest, 'wb') as fh:
                for chunk in r.iter_content(chunk_size=256 * 1024):
                    if chunk:
                        fh.write(chunk)
        except (OSError, requests.RequestException) as e:
            return None, True, (f'could not download {remote_filename} from '
                                f'backend {backend["name"]}: {e}')[:400]
        return local_name, False, None


backend_workers = BackendWorkerManager()
