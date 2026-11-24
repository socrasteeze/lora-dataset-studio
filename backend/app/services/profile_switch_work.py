"""Ask the current profile's workers to stop before the supervisor relaunches."""
from threading import Thread
import time

from sqlalchemy import select

from ..extensions import db
from ..job_queue import _dispatch_auto_resolved_cancellation, queue_manager
from ..models import FaceDatasetImage, ImageGenerationQueue, ImageSourceJob
from . import global_stop, image_sources, queue_view

_SETTLE_SECONDS = 3.0


def _stop_image_sources(app, user_id):
    control = app.extensions.get('image_sources')
    if control is None:
        return None
    with control['lock']:
        jobs = ImageSourceJob.query.filter_by(user_id=user_id).filter(
            (ImageSourceJob.state == 'queued') | (ImageSourceJob.id == control['active']),
        ).order_by(ImageSourceJob.state != 'queued').all()
        for job in jobs:
            image_sources.stop(app, job)
        return control['worker']


def _stop_auto_continuation(app, _user_id):
    runner = app.extensions.get('video_auto_continue')
    if runner is None:
        return None
    with runner.lock:
        state = (runner.record or {}).get('state', {})
        if state.get('enabled'):
            runner.stop(state['id'])
        return runner.thread


def _stop_other_generations(app, user_id):
    # The shared stop owns jobs linked to unfinished Dataset images.
    dataset_jobs = select(FaceDatasetImage.job_id).where(
        FaceDatasetImage.job_id.is_not(None), FaceDatasetImage.status == 'pending',
        FaceDatasetImage.filename.is_(None),
    )
    rows = ImageGenerationQueue.query.filter_by(user_id=user_id).filter(
        ImageGenerationQueue.status.in_(queue_view.LIVE_STATUSES),
        ImageGenerationQueue.job_id.not_in(dataset_jobs),
    ).all()
    jobs = [row.job_id for row in sorted(rows, key=lambda row: row.status != 'pending')
            if queue_view.describe(row)['cancellable']]
    for job_id in jobs:
        try:
            if queue_manager.cancel_job_outcome(job_id, user_id) != 'cancelled':
                continue
            row = ImageGenerationQueue.query.filter_by(job_id=job_id).one()
            row.error_message = 'Cancelled during a profile switch.'
            db.session.commit()
            _dispatch_auto_resolved_cancellation(job_id)
        except Exception:
            db.session.rollback()
            app.logger.warning('A generation could not be stopped before the profile switch')


def stop_for_switch(app, user_id):
    deadline = time.monotonic() + _SETTLE_SECONDS
    workers = []
    for stop in (_stop_auto_continuation, _stop_image_sources, _stop_other_generations,
                 global_stop.stop_everything):
        try:
            # Give each stop an independent database session.
            with app.app_context():
                result = stop(app, user_id)
            if isinstance(result, Thread):
                workers.append(result)
        except Exception:
            app.logger.warning('A stop operation failed before the profile switch')

    for worker in workers:
        if worker.is_alive():
            worker.join(timeout=max(0, deadline - time.monotonic()))
