"""Hub-side helpers to enqueue vision / infer / training jobs onto a peer."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from pathlib import Path

from ..extensions import db
from ..models import ClusterJob
from . import cluster as cluster_svc

logger = logging.getLogger(__name__)


def enqueue_vision_on_device(device_id, image_paths, *, prompt, prefer_json=False,
                             fmt=None, job_id=None) -> str:
    """Stage images and create a vision ClusterJob. Returns job_id.

    `image_paths` entries may be plain paths or ``(path, dest_name)`` pairs —
    the same contract as enqueue_infer_on_device, and for the same reason. A
    bank spanning several folders routinely holds two `img_001.jpg`; staging by
    bare basename overwrites one with the other, and because the peer returns
    its results keyed by artifact name, the survivor's verdict would then be
    written onto BOTH rows. That is silent corruption, not an error. Measured on
    a real bank: 163 of 23 408 images collide. Callers staging a whole pass pass
    unique dest names (the bank runner prefixes the image id).
    """
    device_id = cluster_svc.normalize_device_id(device_id)
    if device_id == cluster_svc.LOCAL_DEVICE_ID:
        raise ValueError('use local vision path for device=local')
    job_id = job_id or str(uuid.uuid4())
    names = []
    for p in image_paths:
        src, dest = p if isinstance(p, (tuple, list)) else (p, None)
        names.append(cluster_svc.stage_file_artifact(job_id, src, dest_name=dest))
    cluster_svc.enqueue_generic(
        device_id=device_id,
        kind='vision',
        payload={
            'prompt': prompt,
            'prefer_json': prefer_json,
            'fmt': fmt,
            'artifacts': names,
        },
        job_id=job_id,
    )
    return job_id


def enqueue_infer_on_device(device_id, *, script, stdin, image_paths=None,
                            timeout=3600, python=None, job_id=None) -> str:
    """`image_paths` entries may be plain paths or ``(path, dest_name)`` pairs.
    A bank spanning several folders routinely holds two `img_001.jpg` — staging
    by bare basename would silently overwrite one with the other, so callers
    that stage a whole pass pass unique dest names (the bank runner prefixes
    the image id)."""
    device_id = cluster_svc.normalize_device_id(device_id)
    if device_id == cluster_svc.LOCAL_DEVICE_ID:
        raise ValueError('use local infer path for device=local')
    job_id = job_id or str(uuid.uuid4())
    names = []
    for p in image_paths or []:
        src, dest = p if isinstance(p, (tuple, list)) else (p, None)
        names.append(cluster_svc.stage_file_artifact(job_id, src, dest_name=dest))
    cluster_svc.enqueue_generic(
        device_id=device_id,
        kind='infer',
        payload={
            'script': script,
            'stdin': stdin,
            'timeout': timeout,
            'python': python,
            'artifacts': names,
        },
        job_id=job_id,
    )
    return job_id


def enqueue_training_on_device(device_id, *, dataset_archive_path, train_params,
                               job_id=None) -> str:
    device_id = cluster_svc.normalize_device_id(device_id)
    if device_id == cluster_svc.LOCAL_DEVICE_ID:
        raise ValueError('use local training for device=local')
    job_id = job_id or str(uuid.uuid4())
    archive_name = cluster_svc.stage_file_artifact(
        job_id, dataset_archive_path,
        dest_name=os.path.basename(dataset_archive_path) or 'dataset.zip')
    cluster_svc.enqueue_generic(
        device_id=device_id,
        kind='training',
        payload={
            'dataset_archive': archive_name,
            'artifacts': [archive_name],
            'train': train_params or {},
        },
        job_id=job_id,
    )
    return job_id


def wait_cluster_job(job_id, *, timeout=3600, poll=1.0) -> dict:
    """Block until a ClusterJob finishes. Returns to_dict()."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = ClusterJob.query.filter_by(job_id=job_id).first()
        if job is None:
            raise ValueError('job not found')
        if job.status in ('completed', 'failed', 'cancelled'):
            return job.to_dict()
        time.sleep(poll)
        db.session.expire(job)
    raise TimeoutError(f'cluster job {job_id} timed out')


def wait_cluster_job_async(job_id, on_done, *, app=None, timeout=3600):
    """Daemon thread that calls on_done(result_dict) when the job finishes."""
    def _run():
        from flask import current_app
        ctx_app = app or current_app._get_current_object()
        with ctx_app.app_context():
            try:
                result = wait_cluster_job(job_id, timeout=timeout)
                on_done(result, None)
            except Exception as e:
                on_done(None, e)

    threading.Thread(target=_run, daemon=True, name=f'cluster-wait-{job_id[:8]}').start()


def read_job_result_json(job_id, artifact_name='vision_result.json') -> dict:
    try:
        path = cluster_svc.artifact_path(job_id, artifact_name)
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        job = ClusterJob.query.filter_by(job_id=job_id).first()
        return (job.result_dict() if job else {}) or {}
