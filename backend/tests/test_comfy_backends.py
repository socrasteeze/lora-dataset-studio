"""Remote ComfyUI API backends — the SwarmUI shape, next to the peer model.

The far box runs ONLY ComfyUI; this machine uploads inputs over /upload/image,
queues, polls, and downloads the output into the local output folder. These
tests pin the registry, the queue routing, and the worker's remote round-trip —
all with the network mocked (the suite stays offline).
"""
from __future__ import annotations

import json
from unittest.mock import patch


def _add_backend(app, name='Laptop', url='http://laptop:8188'):
    from app.services import cluster as cluster_svc
    with app.app_context():
        return cluster_svc.add_backend(name, url)


def test_backends_list_add_remove_roundtrip(app, client):
    with patch('app.services.cluster.probe_backend', lambda *a, **k: True):
        r = client.post('/api/cluster/backends',
                        json={'name': 'Laptop 4090', 'url': 'http://laptop:8188/'})
        assert r.status_code == 200, r.get_data(as_text=True)
        entry = r.get_json()
        assert entry['id'].startswith('api:')
        assert entry['url'] == 'http://laptop:8188', 'trailing slash normalized'

        listed = client.get('/api/cluster/backends').get_json()['backends']
        assert [b['id'] for b in listed] == [entry['id']]

        assert client.post(f"/api/cluster/backends/{entry['id']}/remove",
                           json={}).status_code == 200
        assert client.get('/api/cluster/backends').get_json()['backends'] == []


def test_a_backend_url_is_refused_twice(app, client):
    _add_backend(app)
    r = client.post('/api/cluster/backends',
                    json={'name': 'Same box', 'url': 'http://laptop:8188'})
    assert r.status_code == 400
    assert 'already exists' in r.get_json()['error']


def test_backends_appear_in_the_device_picker_even_standalone(app, client):
    """No Primary role required — a standalone with a backend IS the use case."""
    from app import config as cfg
    entry = _add_backend(app)
    with app.app_context():
        cfg.save_config({'cluster': {'role': 'standalone'}})
    with patch('app.services.cluster.probe_backend', lambda *a, **k: True):
        devices = client.get('/api/cluster/devices').get_json()['devices']
    mine = [d for d in devices if d['id'] == entry['id']]
    assert mine and mine[0]['capabilities']['comfyui'] is True
    assert mine[0]['online'] is True and not mine[0]['local']


def test_a_backend_job_is_a_plain_queue_row_no_clusterjob(app):
    from app.job_queue import queue_manager
    from app.models import ClusterJob, ImageGenerationQueue
    entry = _add_backend(app)
    with app.app_context():
        jid = queue_manager.add_job(workflow_data={'1': {}},
                                    worker_id=entry['id'])
        row = ImageGenerationQueue.query.filter_by(job_id=jid).first()
        assert row.worker_id == entry['id'] and row.status == 'pending'
        assert ClusterJob.query.count() == 0, \
            'no artifact machinery for an API backend'
        # …and the LOCAL worker must not claim it.
        assert queue_manager.process_one() is False
        assert row.status == 'pending'


def test_enqueue_to_a_removed_backend_fails_loudly(app):
    import pytest
    from app.job_queue import queue_manager
    with app.app_context():
        with pytest.raises(ValueError, match='unknown backend'):
            queue_manager.add_job(workflow_data={'1': {}},
                                  worker_id='api:deadbeef0000')


def test_removing_a_backend_fails_its_pending_jobs(app):
    from app.job_queue import queue_manager
    from app.models import ImageGenerationQueue
    from app.services import cluster as cluster_svc
    entry = _add_backend(app)
    with app.app_context():
        jid = queue_manager.add_job(workflow_data={'1': {}},
                                    worker_id=entry['id'])
        cluster_svc.remove_backend(entry['id'])
        row = ImageGenerationQueue.query.filter_by(job_id=jid).first()
        assert row.status == 'failed'
        assert 'backend removed' in (row.error_message or '')


def test_the_backend_worker_runs_a_job_end_to_end(app, tmp_path, monkeypatch):
    """Upload → queue → poll → download, all mocked at the HTTP seam."""
    from app import config as cfg
    from app.job_queue import queue_manager
    from app.models import ImageGenerationQueue
    from app.services import backend_worker as bw

    entry = _add_backend(app)
    src = tmp_path / 'ref.png'
    src.write_bytes(b'PNG')
    out_dir = tmp_path / 'comfy-out'

    uploads = []
    monkeypatch.setattr(
        'app.utils.comfyui.upload_input_image_to_worker',
        lambda name, path, url, **k: uploads.append((name, str(path), url)) or name)
    monkeypatch.setattr(
        'app.utils.comfyui.queue_prompt_to_comfyui',
        lambda wf, cid, worker_url=None: ({'prompt_id': 'p-1'}, None))
    monkeypatch.setattr(
        'app.utils.comfyui.get_comfyui_history',
        lambda pid, worker_url=None: {'p-1': {'outputs': {'9': {'images': [
            {'filename': 'ComfyUI_00001_.png', 'type': 'output'}]}}}})

    class _Resp:
        status_code = 200
        def raise_for_status(self): pass
        def iter_content(self, chunk_size): yield b'RENDERED'
    monkeypatch.setattr(bw, 'POLL_INTERVAL_SECONDS', 0)
    monkeypatch.setattr('requests.get', lambda *a, **k: _Resp())

    with app.app_context():
        cfg.save_config({'comfyui': {'output_dir': str(out_dir)}})
        jid = queue_manager.add_job(
            workflow_data={'1': {}}, worker_id=entry['id'],
            metadata={'staged_inputs': ['edit_source_ab_ref.png'],
                      'staged_input_paths': {'edit_source_ab_ref.png': str(src)}})
        # Training holding the LOCAL GPU must not stall a REMOTE render.
        queue_manager._set_system_state('training_in_progress', True)
        try:
            mgr = bw.BackendWorkerManager()
            mgr.init_app(app)
            backend = {'id': entry['id'], 'name': entry['name'],
                       'url': entry['url']}
            assert mgr._tick(backend) is True
        finally:
            queue_manager._set_system_state('training_in_progress', False)

        row = ImageGenerationQueue.query.filter_by(job_id=jid).first()
        assert row.status == 'completed', row.error_message
        assert row.result_filename.startswith('backend_')
        assert (out_dir / row.result_filename).read_bytes() == b'RENDERED'
    assert uploads and uploads[0][0] == 'edit_source_ab_ref.png'


def test_a_backend_render_with_no_local_output_folder_says_so(app, tmp_path,
                                                              monkeypatch):
    """The output has to land SOMEWHERE the completion handlers can find it."""
    from app import config as cfg
    from app.job_queue import queue_manager
    from app.models import ImageGenerationQueue
    from app.services import backend_worker as bw

    entry = _add_backend(app)
    monkeypatch.setattr(
        'app.utils.comfyui.queue_prompt_to_comfyui',
        lambda wf, cid, worker_url=None: ({'prompt_id': 'p-2'}, None))
    monkeypatch.setattr(
        'app.utils.comfyui.get_comfyui_history',
        lambda pid, worker_url=None: {'p-2': {'outputs': {'9': {'images': [
            {'filename': 'x.png', 'type': 'output'}]}}}})
    monkeypatch.setattr(bw, 'POLL_INTERVAL_SECONDS', 0)

    with app.app_context():
        cfg.save_config({'comfyui': {'output_dir': '', 'base_dir': ''}})
        jid = queue_manager.add_job(workflow_data={'1': {}},
                                    worker_id=entry['id'])
        mgr = bw.BackendWorkerManager()
        mgr.init_app(app)
        assert mgr._tick({'id': entry['id'], 'name': entry['name'],
                          'url': entry['url']}) is True
        row = ImageGenerationQueue.query.filter_by(job_id=jid).first()
        assert row.status == 'failed'
        assert 'output folder' in (row.error_message or '')
