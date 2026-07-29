"""Cluster / remote GPU worker foundation tests."""
from __future__ import annotations

import json
import os


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


# ── The peer bearer is a COMPUTE credential, not a cluster-admin one ──────
#
# The token gate (`server.require_token`) is the only thing standing between a
# LAN/Tailscale client and every route in this app. The first cut of the peer
# exemption matched on the `/api/cluster/` path prefix, which also covers the
# hub's own admin routes — so one peer's bearer could mint further join tokens,
# revoke its siblings, and post an infer job the peers then execute. These tests
# pin the exemption to the six machine-to-machine endpoints.

LAN = {'REMOTE_ADDR': '192.168.1.50'}


def _primary_with_peer(app, *, require_token=True):
    """Primary + one joined peer, token gate on. Returns the peer's bearer."""
    from app import config as cfg
    from app.services import cluster as cluster_svc
    with app.app_context():
        cfg.save_config({
            'cluster': {'role': 'primary'},
            'server': {'require_token': require_token,
                       'access_token': 'browser-token-for-tests'},
        })
        minted = cluster_svc.mint_join_token()
        redeemed = cluster_svc.redeem_join_token(minted['token'], name='peer')
    return redeemed['auth_token']


def test_peer_bearer_opens_the_peer_endpoints_from_the_lan(app, client):
    bearer = _primary_with_peer(app)
    r = client.post('/api/cluster/peer/pull', json={},
                    headers={'Authorization': f'Bearer {bearer}'},
                    environ_overrides=LAN)
    assert r.status_code == 200, 'a peer must still reach its own pull endpoint'


def test_peer_bearer_cannot_mint_join_tokens(app, client):
    """Otherwise one rented GPU can enroll machines of its own choosing."""
    bearer = _primary_with_peer(app)
    r = client.post('/api/cluster/join-tokens', json={'label': 'mine'},
                    headers={'Authorization': f'Bearer {bearer}'},
                    environ_overrides=LAN)
    assert r.status_code == 403


def test_peer_bearer_cannot_revoke_another_peer(app, client):
    bearer = _primary_with_peer(app)
    r = client.post('/api/cluster/devices/some-other-id/revoke', json={},
                    headers={'Authorization': f'Bearer {bearer}'},
                    environ_overrides=LAN)
    assert r.status_code == 403


def test_peer_bearer_cannot_enqueue_an_infer_job(app, client):
    """The infer payload names a script the peers RUN — hub-side route only."""
    bearer = _primary_with_peer(app)
    r = client.post('/api/cluster/jobs/infer',
                    json={'device_id': 'whatever', 'script': 'anything.py'},
                    headers={'Authorization': f'Bearer {bearer}'},
                    environ_overrides=LAN)
    assert r.status_code == 403


def test_peer_connect_is_a_browser_route_not_a_peer_one(app, client):
    """It lives under /peer/ but a peer bearer must not open it — which is why
    the guard matches endpoint names, not any path prefix."""
    bearer = _primary_with_peer(app)
    r = client.post('/api/cluster/peer/connect',
                    json={'primary_url': 'http://example.invalid', 'token': 'x'},
                    headers={'Authorization': f'Bearer {bearer}'},
                    environ_overrides=LAN)
    assert r.status_code == 403


def test_join_stays_open_without_any_token(app, client):
    """First contact has no bearer yet; the one-time token is checked in-handler."""
    _primary_with_peer(app)
    r = client.post('/api/cluster/join', json={'token': 'not-a-real-token'},
                    environ_overrides=LAN)
    assert r.status_code == 400            # reached the handler, rejected there
    assert 'invalid join token' in (r.get_json() or {}).get('error', '')


# ── A Primary may not name arbitrary files for a peer to execute ──────────

def _infer_job(script):
    return {'job_id': 'job-1', 'kind': 'infer', 'payload': {'script': script}}


def test_peer_refuses_an_infer_script_outside_its_own_infer_folder(app, tmp_path,
                                                                   monkeypatch):
    """Joining a Primary rents it a GPU — not a shell on this machine."""
    from app.services import infer_stream
    from app.services.peer_worker import peer_worker

    outsider = tmp_path / 'payload.py'
    outsider.write_text('print("owned")', encoding='utf-8')

    def _boom(*a, **k):
        raise AssertionError('the peer executed a script the Primary chose')
    monkeypatch.setattr(infer_stream, 'run_infer_script', _boom)

    done = {}
    monkeypatch.setattr(peer_worker, '_complete',
                        lambda job_id, **kw: done.update(kw))
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job(str(outsider)))

    assert 'not available on this peer' in (done.get('error') or '')
    # And the refusal must not echo the path the Primary sent.
    assert str(tmp_path) not in (done.get('error') or '')


def test_peer_artifact_upload_streams_past_the_browser_size_cap(app, client):
    """A LoRA checkpoint is bigger than MAX_CONTENT_LENGTH, which exists for
    browser uploads. The peer route must stream, not 413 and not buffer."""
    from app import config as cfg
    from app.services import cluster as cluster_svc

    app.config['MAX_CONTENT_LENGTH'] = 1024        # tiny, to make the point
    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        redeemed = cluster_svc.redeem_join_token(minted['token'], name='peer')
        cluster_svc.create_cluster_job(
            device_id=redeemed['device_id'], kind='training',
            payload={}, job_id='train-1')

    blob = b'x' * (64 * 1024)
    r = client.put('/api/cluster/peer/artifacts/train-1/model.safetensors',
                   data=blob, content_type='application/octet-stream',
                   headers={'Authorization': f"Bearer {redeemed['auth_token']}"})
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()['bytes'] == len(blob)

    with app.app_context():
        assert cluster_svc.artifact_path('train-1', 'model.safetensors').stat().st_size == len(blob)


def test_peer_artifact_upload_refuses_a_directory_name(app, client):
    from app import config as cfg
    from app.services import cluster as cluster_svc
    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        redeemed = cluster_svc.redeem_join_token(minted['token'], name='peer')
        cluster_svc.create_cluster_job(
            device_id=redeemed['device_id'], kind='comfy',
            payload={}, job_id='job-2')
    r = client.put('/api/cluster/peer/artifacts/job-2/..', data=b'x',
                   headers={'Authorization': f"Bearer {redeemed['auth_token']}"})
    assert r.status_code == 400


def test_a_remote_job_cannot_ride_a_commit_false_fanout(app):
    """commit=False means the CALLER owns the transaction; committing for it
    would flush whatever else it had pending, not just this row."""
    import json as _json
    import pytest
    from app import config as cfg
    from app.job_queue import queue_manager
    from app.services import cluster as cluster_svc

    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        redeemed = cluster_svc.redeem_join_token(minted['token'], name='peer')
        with pytest.raises(ValueError, match='commit=False'):
            queue_manager.add_job(workflow_data={'1': {}}, commit=False,
                                  worker_id=redeemed['device_id'])
        # The local contract is untouched.
        jid = queue_manager.add_job(workflow_data={'1': {}}, commit=False)
        assert _json.loads('{}') == {} and jid


# ── Renting a GPU must not cost a permanent second copy of every image ────

def test_stale_artifact_folders_are_swept_but_live_and_fresh_ones_are_not(app,
                                                                         monkeypatch):
    """Nothing deleted cluster artifacts, so every remote job left the source
    image AND the returned output on disk forever — full size, on top of the copy
    already in the dataset."""
    import time
    from app import config as cfg
    from app.services import cluster as cluster_svc

    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        peer = cluster_svc.redeem_join_token(minted['token'], name='peer')

        # One finished job (sweepable), one still running (must be spared).
        for jid, status in (('old-done', 'completed'), ('old-running', 'running')):
            job = cluster_svc.create_cluster_job(
                device_id=peer['device_id'], kind='comfy', payload={}, job_id=jid)
            job.status = status
        from app.extensions import db
        db.session.commit()

        old_done = cluster_svc.job_artifact_dir('old-done')
        old_running = cluster_svc.job_artifact_dir('old-running')
        fresh = cluster_svc.job_artifact_dir('fresh-orphan')
        for d in (old_done, old_running, fresh):
            (d / 'source.png').write_bytes(b'PNG')

        # Age the two "old" folders past the fence.
        stale = time.time() - (cluster_svc.ARTIFACT_MAX_AGE_SECONDS + 3600)
        for d in (old_done, old_running):
            os.utime(d, (stale, stale))

        assert cluster_svc.prune_job_artifacts() == 1
        assert not old_done.exists(), 'a finished, aged job keeps nothing'
        assert old_running.exists(), 'a running job is spared whatever its age'
        assert fresh.exists(), 'the age fence protects anything recent'


def test_the_primary_does_not_put_its_own_paths_on_the_wire(app):
    """The peer routes by basename; absolute hub paths would only leak layout."""
    from app import config as cfg
    from app.services import cluster as cluster_svc

    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        peer = cluster_svc.redeem_join_token(minted['token'], name='peer')
        cluster_svc.create_cluster_job(
            device_id=peer['device_id'], kind='comfy', job_id='wire-1',
            payload={'artifacts': ['a.png'],
                     'metadata': {'staged_inputs': ['a.png'],
                                  'staged_input_paths': {'a.png': '/somewhere/a.png'}}})
        device = cluster_svc.authenticate_peer(peer['auth_token'])
        job = cluster_svc.pull_next_job(device)

    md = job['payload']['metadata']
    assert 'staged_input_paths' not in md
    assert md['staged_inputs'] == ['a.png'], 'the basenames the peer needs stay'
