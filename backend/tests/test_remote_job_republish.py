"""A pending peer job with no ClusterJob is published once on recovery."""
import json

import pytest


def _pending(app, job_id, worker_id):
    from app.extensions import db
    from app.models import ImageGenerationQueue
    row = ImageGenerationQueue(
        job_id=job_id, user_id='local', status='pending',
        workflow_data=json.dumps({'1': {}}), prompt='',
        worker_id=worker_id, job_metadata='{}')
    db.session.add(row)
    db.session.commit()


def test_orphaned_peer_job_is_published_once(app, monkeypatch):
    from app.extensions import db
    from app.job_queue import queue_manager
    from app.models import ClusterJob

    published = []

    def publish(job_id, workflow, metadata, device_id):
        published.append(job_id)
        db.session.add(ClusterJob(
            job_id=job_id, device_id=device_id, kind='comfy',
            status='pending', image_job_id=job_id))
        db.session.commit()

    monkeypatch.setattr(queue_manager, '_publish_remote_comfy_job', publish)
    with app.app_context():
        _pending(app, 'peer-job', 'peer-device-1')
        queue_manager._recover_stuck_jobs()
        queue_manager._recover_stuck_jobs()
        row = db.session.get(ClusterJob, db.session.query(ClusterJob).filter_by(
            image_job_id='peer-job').one().id)
        assert published == ['peer-job']
        assert row.image_job_id == 'peer-job'


def test_orphaned_peer_job_is_failed_when_publish_raises(app, monkeypatch):
    from app.job_queue import queue_manager
    from app.models import ImageGenerationQueue

    def publish(*args, **kwargs):
        raise RuntimeError('peer store unavailable')

    monkeypatch.setattr(queue_manager, '_publish_remote_comfy_job', publish)
    with app.app_context():
        _pending(app, 'peer-fail', 'peer-device-1')
        queue_manager._recover_stuck_jobs()
        row = ImageGenerationQueue.query.filter_by(job_id='peer-fail').one()
        assert row.status == 'failed'
        assert 'publish' in (row.error_message or '')


def test_backend_queue_row_is_not_republished(app, monkeypatch):
    from app.job_queue import queue_manager

    def publish(*args, **kwargs):
        pytest.fail('an API backend row was published as a peer job')

    monkeypatch.setattr(queue_manager, '_publish_remote_comfy_job', publish)
    with app.app_context():
        _pending(app, 'api-job', 'api:laptop')
        queue_manager._recover_stuck_jobs()
