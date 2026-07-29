"""Cluster / remote GPU worker foundation tests."""
from __future__ import annotations

import json


def test_cluster_status_standalone(client):
    r = client.get('/api/cluster/status')
    assert r.status_code == 200
    body = r.get_json()
    assert body['role'] in ('standalone', 'primary', 'peer')
    assert 'node_id' in body
    assert 'local_capabilities' in body


def test_devices_list_includes_local(client):
    r = client.get('/api/cluster/devices')
    assert r.status_code == 200
    devices = r.get_json()['devices']
    assert any(d['id'] == 'local' and d.get('local') for d in devices)


def test_join_token_requires_primary(client, app):
    from app import config as cfg
    with app.app_context():
        cfg.save_config({'cluster': {'role': 'standalone'}})
    r = client.post('/api/cluster/join-tokens', json={'label': 'x'})
    assert r.status_code == 400


def test_mint_and_redeem_join_token(client, app):
    from app import config as cfg
    from app.services import cluster as cluster_svc

    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary', 'device_name': 'Test Primary'}})
        minted = cluster_svc.mint_join_token('laptop')
        assert minted['token']
        redeemed = cluster_svc.redeem_join_token(
            minted['token'], name='G18',
            capabilities_blob={'comfyui': True})
        assert redeemed['device_id']
        assert redeemed['auth_token']
        devices = cluster_svc.list_devices()
        assert any(d['id'] == redeemed['device_id'] for d in devices)


def test_peer_pull_empty(client, app):
    from app import config as cfg
    from app.services import cluster as cluster_svc

    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        redeemed = cluster_svc.redeem_join_token(minted['token'], name='peer')

    r = client.post(
        '/api/cluster/peer/pull',
        json={},
        headers={'Authorization': f"Bearer {redeemed['auth_token']}"},
    )
    assert r.status_code == 200
    assert r.get_json()['job'] is None


def test_normalize_device_id():
    from app.services import cluster as cluster_svc
    assert cluster_svc.normalize_device_id(None) == 'local'
    assert cluster_svc.normalize_device_id('auto') == 'local'
    assert cluster_svc.normalize_device_id('local') == 'local'
    assert cluster_svc.normalize_device_id('abc-123') == 'abc-123'


def test_job_queue_skips_remote_worker(app):
    """Local queue worker must not claim jobs aimed at a peer."""
    from app import config as cfg
    from app.extensions import db
    from app.job_queue import queue_manager
    from app.models import ImageGenerationQueue
    from app.services import cluster as cluster_svc

    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        redeemed = cluster_svc.redeem_join_token(minted['token'], name='peer')
        peer_id = redeemed['device_id']
        job = ImageGenerationQueue(
            job_id='remote-job-1',
            user_id='local',
            status='pending',
            workflow_data=json.dumps({'1': {}}),
            worker_id=peer_id,
        )
        db.session.add(job)
        db.session.commit()
        assert queue_manager.process_one() is False
        row = ImageGenerationQueue.query.filter_by(job_id='remote-job-1').first()
        assert row.status == 'pending'
