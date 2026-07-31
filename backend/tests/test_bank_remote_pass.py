"""Bank Score/Faces on a compute peer — the hub half of the remote pipeline.

The peer executes the same backend/infer scripts against downloaded artifacts;
these tests pin the hub's side: device routing (peers only), the queue entry
carrying the pick, the launch skipping the LOCAL gates that describe the wrong
machine, and — the load-bearing part — the results and the embeddings cache
coming home keyed by HUB paths with signatures recomputed from the hub's files.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pytest
from PIL import Image

PEER = '4fa2b7c1-0000-4000-8000-000000000001'   # any non-'api:' uuid = a peer


def _bank(tmp_path, n=2):
    from app.services import image_bank_service as banks
    src = tmp_path / 'src'
    src.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        Image.new('RGB', (64, 64), (10 * i, 90, 160)).save(str(src / f'a{i}.jpg'))
    bank, _added = banks.create_bank('local', 'Dump', str(src))
    return bank.id


def test_a_backend_is_refused_for_a_bank_pass_with_a_reason(app):
    from app.services import image_bank_service as banks
    with app.app_context():
        assert banks._remote_pass_device(None) is False
        assert banks._remote_pass_device('local') is False
        assert banks._remote_pass_device(PEER) is True
        with pytest.raises(ValueError, match='compute peer'):
            banks._remote_pass_device('api:abc123def456')


def test_remote_start_score_skips_every_local_gate(app, tmp_path, monkeypatch):
    """No scoring extra installed here, GPU marked busy — a PEER run starts
    anyway: both gates describe a machine that will not do the work."""
    from app.services import image_bank_service as banks
    monkeypatch.setattr('app.capabilities.probe_bank_scoring',
                        lambda: {'ok': False})
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: 'training holds the GPU')
    ran = {}
    monkeypatch.setattr(banks, '_score_job',
                        lambda bank_id, device_id=None:
                        (lambda job: ran.update(device_id=device_id)))
    with app.app_context():
        bank_id = _bank(tmp_path)
        banks.start_score(app, 'local', bank_id, device_id=PEER)
    assert ran['device_id'] == PEER
    # …and the local lane still refuses without the extra.
    with app.app_context():
        with pytest.raises(RuntimeError, match='not installed'):
            banks.start_score(app, 'local', bank_id)


def test_the_queue_entry_carries_the_device_and_skips_the_local_gpu_wait(
        app, tmp_path, monkeypatch):
    from app.services import bank_queue, image_bank_service as banks
    seen = {}
    monkeypatch.setattr(banks, 'start_pipeline',
                        lambda app_, uid, bid, steps, flags, dups, device_id=None:
                        seen.update(device_id=device_id))
    with app.app_context():
        bank_id = _bank(tmp_path)
        bank_queue.enqueue(app, 'local', bank_id, steps=['scan', 'score'],
                           device_id=PEER)
    assert seen['device_id'] == PEER


def test_the_remote_pass_comes_home_keyed_by_hub_paths(app, tmp_path,
                                                       monkeypatch):
    """End-to-end through run_remote_pass with the cluster mocked at the row:
    results re-keyed, the npz cache installed with hub paths + fresh sigs."""
    from app.services import bank_jobs, bank_remote
    from app.services import cluster as cluster_svc

    hub_a = tmp_path / 'x' / 'img.jpg'
    hub_b = tmp_path / 'y' / 'img.jpg'          # same BASENAME, different folder
    for f in (hub_a, hub_b):
        f.parent.mkdir(parents=True, exist_ok=True)
        Image.new('RGB', (32, 32)).save(str(f))
    by_path = {str(hub_a): 11, str(hub_b): 22}
    cache_path = tmp_path / 'cache' / 'score_cache.npz'

    def fake_enqueue(device_id, *, script, stdin, image_paths, timeout):
        # Distinct artifact names even for identical basenames — the collision
        # this asserts is exactly why staging takes (path, dest_name) pairs.
        names = [dest for _p, dest in image_paths]
        assert len(set(names)) == 2 and all('__' in n for n in names)
        assert stdin['images'] == names
        job_id = 'remote-1'
        art = cluster_svc.job_artifact_dir(job_id)
        peer_paths = [f'C:/peer/tmp/{n}' for n in names]
        (art / 'infer_result.json').write_text(json.dumps({
            'ok': True,
            'results': {peer_paths[0]: {'aesthetic': 7.5, 'state': 'ok'},
                        peer_paths[1]: {'aesthetic': 3.0, 'state': 'ok'}},
            'clusters': {peer_paths[0]: 1, peer_paths[1]: 1},
        }), encoding='utf-8')
        np.savez(str(art / 'score_cache.npz'),
                 paths=np.array(peer_paths), states=np.array(['ok', 'ok']),
                 embs=np.ones((2, 4), dtype='float32'),
                 sigs=np.array(['999:999', '999:999']))   # peer mtimes: garbage here
        return job_id

    monkeypatch.setattr('app.services.cluster_remote.enqueue_infer_on_device',
                        fake_enqueue)
    monkeypatch.setattr(bank_jobs, 'cancelled', lambda job: False)
    monkeypatch.setattr(bank_jobs, 'progress', lambda job, **kw: None)

    class _Row:
        status = 'completed'
        progress = None
        error_message = None

    class _FakeClusterJob:
        query = type('Q', (), {'filter_by': staticmethod(
            lambda **kw: type('F', (), {'first': staticmethod(lambda: _Row())})())})()
    monkeypatch.setattr('app.models.ClusterJob', _FakeClusterJob)

    import re
    with app.app_context():
        data = bank_remote.run_remote_pass(
            object(), PEER, script='bank_score_infer.py', by_path=by_path,
            extra_payload={}, cache_path=cache_path,
            progress_re=re.compile(r'x(\d)/(\d)'), detail_label='scoring pass')

    assert data['results'][str(hub_a)]['aesthetic'] == 7.5
    assert data['results'][str(hub_b)]['aesthetic'] == 3.0
    with np.load(str(cache_path), allow_pickle=False) as z:
        got = {str(p) for p in z['paths']}
        assert got == {str(hub_a), str(hub_b)}, 'cache re-keyed to hub paths'
        st = os.stat(str(hub_a))
        assert f'{st.st_size}:{st.st_mtime_ns}' in [str(s) for s in z['sigs']], \
            'sigs recomputed from the HUB files, not the peer copies'


def test_the_heartbeat_tells_a_cancelled_job_to_stop(app, client):
    from app import config as cfg
    from app.services import cluster as cluster_svc
    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        peer = cluster_svc.redeem_join_token(minted['token'], name='peer')
        job = cluster_svc.create_cluster_job(
            device_id=peer['device_id'], kind='infer', payload={}, job_id='j1')
        job.status = 'running'
        from app.extensions import db
        db.session.commit()
        assert cluster_svc.cancel_cluster_job('j1') is True
    r = client.post('/api/cluster/peer/jobs/j1/heartbeat', json={},
                    headers={'Authorization': f"Bearer {peer['auth_token']}"})
    assert r.status_code == 200
    assert r.get_json()['cancelled'] is True


def test_the_peer_redirects_the_cache_into_its_out_folder(app, monkeypatch,
                                                          tmp_path):
    """The script writes its npz at the payload's `cache` path — a HUB path the
    peer must rewrite into work/out, whose contents ride home as artifacts."""
    from app.services.peer_worker import peer_worker

    captured = {}

    def fake_run(python, script, stdin_json, timeout, on_line=None):
        captured.update(json.loads(stdin_json))
        return json.dumps({'ok': True, 'results': {}}), [], 0, False

    monkeypatch.setattr('app.services.infer_stream.run_infer_script', fake_run)
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_upload_artifact',
                        lambda job_id, path, name=None: os.path.basename(str(name or path)))
    done = {}
    monkeypatch.setattr(peer_worker, '_complete',
                        lambda job_id, **kw: done.update(kw))
    peer_worker.init_app(app)
    peer_worker._run_infer({
        'job_id': 'j2', 'kind': 'infer',
        'payload': {'script': 'bank_score_infer.py',
                    'stdin': {'images': [],
                              'cache': r'D:\hub\data\banks\7\score_cache.npz',
                              'cancel_file': r'D:\hub\data\banks\7\score_cache.npz.cancel'}},
    })
    assert done.get('error') is None, done
    assert 'score_cache.npz' in captured['cache']
    assert r'D:\hub' not in captured['cache'], 'hub path rewritten to peer-local'
    assert os.path.dirname(captured['cache']).endswith('out')


# ── Bug fix: each script needs the interpreter its LOCAL run uses ─────────
# A single "bank_scoring.python for everything" chain ran a fully-configured
# 👥 Faces pass in the wrong venv on the peer (missing cv2/onnx/insightface),
# because face_embed_infer.py locally runs under face_scoring.python, not
# bank_scoring.python — see image_bank_service.py:3450.

def _infer_job(script, **payload):
    return {'job_id': 'j-env', 'kind': 'infer',
            'payload': {'script': script, 'stdin': payload}}


def test_the_peer_picks_face_scoring_python_for_the_faces_script(app, monkeypatch):
    from app import config as cfg
    from app.services.peer_worker import peer_worker
    with app.app_context():
        cfg.save_config({'face_scoring': {'python': 'C:/envs/face/python.exe'},
                         'bank_scoring': {'python': 'C:/envs/score/python.exe'}})
    used = {}
    monkeypatch.setattr('app.services.infer_stream.run_infer_script',
                        lambda python, *a, **k: used.update(python=python)
                        or ('{}', [], 0, False))
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_upload_artifact',
                        lambda job_id, path, name=None: 'x')
    monkeypatch.setattr(peer_worker, '_complete', lambda job_id, **kw: None)
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job('face_embed_infer.py', images=[]))
    assert used['python'] == 'C:/envs/face/python.exe'


def test_the_peer_picks_bank_scoring_python_for_the_score_script(app, monkeypatch):
    from app import config as cfg
    from app.services.peer_worker import peer_worker
    with app.app_context():
        cfg.save_config({'face_scoring': {'python': 'C:/envs/face/python.exe'},
                         'bank_scoring': {'python': 'C:/envs/score/python.exe'}})
    used = {}
    monkeypatch.setattr('app.services.infer_stream.run_infer_script',
                        lambda python, *a, **k: used.update(python=python)
                        or ('{}', [], 0, False))
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_upload_artifact',
                        lambda job_id, path, name=None: 'x')
    monkeypatch.setattr(peer_worker, '_complete', lambda job_id, **kw: None)
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job('bank_score_infer.py', images=[]))
    assert used['python'] == 'C:/envs/score/python.exe'


def test_a_mapped_but_unconfigured_env_falls_back_to_this_interpreter(app,
                                                                      monkeypatch):
    import sys
    from app import config as cfg
    from app.services.peer_worker import peer_worker
    with app.app_context():
        cfg.save_config({'face_scoring': {'python': ''}})
    used = {}
    monkeypatch.setattr('app.services.infer_stream.run_infer_script',
                        lambda python, *a, **k: used.update(python=python)
                        or ('{}', [], 0, False))
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_upload_artifact',
                        lambda job_id, path, name=None: 'x')
    monkeypatch.setattr(peer_worker, '_complete', lambda job_id, **kw: None)
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job('face_embed_infer.py', images=[]))
    assert used['python'] == sys.executable


def test_a_missing_module_names_the_env_and_the_fix(app, monkeypatch):
    from app.services import infer_stream
    from app.services.peer_worker import peer_worker
    monkeypatch.setattr(
        infer_stream, 'run_infer_script',
        lambda *a, **k: ('', ["ModuleNotFoundError: No module named 'cv2'"], 1, False))
    done = {}
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_complete',
                        lambda job_id, **kw: done.update(kw))
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job('face_embed_infer.py', images=[]))
    assert 'face-scoring' in done['error']
    assert 'Setup' in done['error'] and 'Quality tools' in done['error']
    assert "cv2" in done['error']                 # the real error stays, for diagnosis


def test_an_unmapped_script_keeps_the_old_chain_untouched(app, monkeypatch):
    import sys
    from app import config as cfg
    from app.services.peer_worker import peer_worker
    with app.app_context():
        cfg.save_config({'bank_scoring': {'python': ''}, 'aitoolkit': {'python': ''}})
    used = {}
    monkeypatch.setattr('app.services.infer_stream.run_infer_script',
                        lambda python, *a, **k: used.update(python=python)
                        or ('{}', [], 0, False))
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_upload_artifact',
                        lambda job_id, path, name=None: 'x')
    monkeypatch.setattr(peer_worker, '_complete', lambda job_id, **kw: None)
    peer_worker.init_app(app)
    # A REAL infer script (the confinement fixed earlier today refuses anything
    # that isn't one) that just happens not to be in the per-script env map.
    peer_worker._run_infer(_infer_job('clip_text_infer.py', images=[]))
    assert used['python'] == sys.executable


# ── Hub pre-flight: refuse before staging a single image ──────────────────

def test_hub_refuses_up_front_when_the_peer_already_reported_the_stack_missing(
        app, tmp_path, monkeypatch):
    import re
    from app import config as cfg
    from app.services import bank_remote, cluster as cluster_svc

    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        redeemed = cluster_svc.redeem_join_token(
            minted['token'], name='peer',
            capabilities_blob={'face_scoring': False, 'bank_scoring': True})
        staged = {'called': False}
        monkeypatch.setattr(
            'app.services.cluster_remote.enqueue_infer_on_device',
            lambda *a, **k: staged.update(called=True) or 'never')
        with pytest.raises(RuntimeError, match='face-scoring'):
            bank_remote.run_remote_pass(
                object(), redeemed['device_id'], script='face_embed_infer.py',
                by_path={str(tmp_path / 'a.jpg'): 1}, extra_payload={},
                cache_path=tmp_path / 'c.npz', progress_re=re.compile(r'(\d)'),
                detail_label='face pass', required_cap='face_scoring')
        assert staged['called'] is False, 'nothing staged before the refusal'


def test_hub_proceeds_when_the_peer_has_not_reported_yet(app, tmp_path,
                                                         monkeypatch):
    """An absent/empty capability blob (a peer that just joined) must not be
    treated as 'missing' — only an EXPLICIT False blocks."""
    import re
    from app import config as cfg
    from app.services import bank_remote, cluster as cluster_svc, bank_jobs

    with app.app_context():
        cfg.save_config({'cluster': {'role': 'primary'}})
        minted = cluster_svc.mint_join_token()
        redeemed = cluster_svc.redeem_join_token(minted['token'], name='peer')
        monkeypatch.setattr(bank_jobs, 'cancelled', lambda job: False)
        monkeypatch.setattr(bank_jobs, 'progress', lambda job, **kw: None)
        monkeypatch.setattr(
            'app.services.cluster_remote.enqueue_infer_on_device',
            lambda *a, **k: 'job-x')

        class _Row:
            status = 'failed'
            progress = None
            error_message = 'stub — reached the poll, which is the point'

        class _FakeClusterJob:
            query = type('Q', (), {'filter_by': staticmethod(
                lambda **kw: type('F', (), {'first': staticmethod(lambda: _Row())})())})()
        monkeypatch.setattr('app.models.ClusterJob', _FakeClusterJob)

        with pytest.raises(RuntimeError, match='stub'):
            bank_remote.run_remote_pass(
                object(), redeemed['device_id'], script='face_embed_infer.py',
                by_path={str(tmp_path / 'a.jpg'): 1}, extra_payload={},
                cache_path=tmp_path / 'c.npz', progress_re=re.compile(r'(\d)'),
                detail_label='face pass', required_cap='face_scoring')


# ── Reported: "infer exit 1: 100%|████| 352210/352210 [00:02<00:00, KB/s]" ──
# Two bugs in one line. The peer was never told its OWN models_root, so
# insightface ignored the models already on that machine and re-downloaded
# antelopev2 (~344 MB); and when the load then failed, the error the script
# printed as clean JSON on stdout was discarded in favour of the download bar
# that happened to be the last stderr line.

def test_the_peer_supplies_its_own_models_root(app, monkeypatch):
    from app import config as cfg
    from app.services.peer_worker import peer_worker
    with app.app_context():
        cfg.save_config({'face_scoring': {'models_root': 'D:/peer/models/face'},
                         'bank_scoring': {'models_root': 'D:/peer/models/score'}})
    seen = {}
    monkeypatch.setattr(
        'app.services.infer_stream.run_infer_script',
        lambda py, sc, payload, t, on_line=None:
        seen.update(json.loads(payload)) or ('{"ok": true}', [], 0, False))
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_upload_artifact',
                        lambda job_id, path, name=None: 'x')
    monkeypatch.setattr(peer_worker, '_complete', lambda job_id, **kw: None)
    peer_worker.init_app(app)

    peer_worker._run_infer(_infer_job('face_embed_infer.py', images=[]))
    assert seen['models_root'] == 'D:/peer/models/face'
    peer_worker._run_infer(_infer_job('bank_score_infer.py', images=[]))
    assert seen['models_root'] == 'D:/peer/models/score'


def test_a_hub_models_root_is_never_inherited(app, monkeypatch):
    """Unconfigured here → the script uses its OWN default cache. A hub path
    would point at a disk this machine does not have."""
    from app import config as cfg
    from app.services.peer_worker import peer_worker
    with app.app_context():
        cfg.save_config({'face_scoring': {'models_root': ''}})
    seen = {}
    monkeypatch.setattr(
        'app.services.infer_stream.run_infer_script',
        lambda py, sc, payload, t, on_line=None:
        seen.update(json.loads(payload)) or ('{"ok": true}', [], 0, False))
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_upload_artifact',
                        lambda job_id, path, name=None: 'x')
    monkeypatch.setattr(peer_worker, '_complete', lambda job_id, **kw: None)
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job(
        'face_embed_infer.py', images=[], models_root='C:/hub/only/here'))
    assert 'models_root' not in seen


def test_the_scripts_own_json_error_beats_a_download_bar(app, monkeypatch):
    from app.services import infer_stream
    from app.services.peer_worker import peer_worker
    monkeypatch.setattr(
        infer_stream, 'run_infer_script',
        lambda *a, **k: (
            json.dumps({'ok': False, 'results': {}, 'clusters': {},
                        'error': 'model load failed: OSError: antelopev2 missing'}),
            ['Downloading...',
             '100%|██████████| 352210/352210 [00:02<00:00, 170897.35KB/s]'],
            1, False))
    done = {}
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_complete',
                        lambda job_id, **kw: done.update(kw))
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job('face_embed_infer.py', images=[]))
    assert 'model load failed' in done['error']
    assert 'antelopev2 missing' in done['error']
    assert 'KB/s' not in done['error'], 'the progress bar must not be the message'


def test_without_a_json_error_a_progress_bar_is_still_skipped(app, monkeypatch):
    from app.services import infer_stream
    from app.services.peer_worker import peer_worker
    monkeypatch.setattr(
        infer_stream, 'run_infer_script',
        lambda *a, **k: ('', ['Traceback (most recent call last):',
                              'ValueError: bad threshold',
                              '100%|██████| 10/10 [00:01<00:00, 9.9it/s]'],
                         1, False))
    done = {}
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_complete',
                        lambda job_id, **kw: done.update(kw))
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job('face_embed_infer.py', images=[]))
    assert 'ValueError: bad threshold' in done['error']


def test_a_missing_module_is_still_named_behind_a_progress_bar(app, monkeypatch):
    """The ModuleNotFoundError hint must survive noise after it — the earlier
    version only looked at the LAST line and so missed it."""
    from app.services import infer_stream
    from app.services.peer_worker import peer_worker
    monkeypatch.setattr(
        infer_stream, 'run_infer_script',
        lambda *a, **k: ('', ["ModuleNotFoundError: No module named 'cv2'",
                              '100%|██████| 5/5 [00:00<00:00, 50it/s]'],
                         1, False))
    done = {}
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, dest: {})
    monkeypatch.setattr(peer_worker, '_complete',
                        lambda job_id, **kw: done.update(kw))
    peer_worker.init_app(app)
    peer_worker._run_infer(_infer_job('face_embed_infer.py', images=[]))
    assert 'face-scoring' in done['error']
    assert 'Quality tools' in done['error']


# --- artifact names must survive a bank that spans folders -------------------

def test_vision_staging_never_collides_on_duplicate_basenames(app, tmp_path,
                                                              monkeypatch):
    """Silent corruption guard, not a crash guard.

    A bank spanning folders routinely holds two `img_001.jpg` — measured on a
    real bank, 163 of 23 408. The peer returns its results keyed by ARTIFACT
    NAME, so staging by bare basename does not merely lose one file: the
    survivor's verdict is then written onto BOTH rows. Nothing raises; the wrong
    answer is simply saved.

    enqueue_vision_on_device therefore takes (path, dest_name) pairs, exactly
    like enqueue_infer_on_device, and the bank runner prefixes the image id.
    """
    from app.services import cluster as cluster_svc
    from app.services import cluster_remote

    a = tmp_path / 'sub1'
    b = tmp_path / 'sub2'
    for d in (a, b):
        d.mkdir(parents=True, exist_ok=True)
    same = 'img_001.jpg'
    Image.new('RGB', (16, 16), (200, 10, 10)).save(str(a / same))
    Image.new('RGB', (16, 16), (10, 10, 200)).save(str(b / same))

    made = {}
    monkeypatch.setattr(cluster_svc, 'enqueue_generic',
                        lambda **kw: made.update(kw))
    monkeypatch.setattr(cluster_svc, 'normalize_device_id', lambda d: d)

    with app.app_context():
        job_id = cluster_remote.enqueue_vision_on_device(
            PEER,
            [(str(a / same), f'11__{same}'), (str(b / same), f'22__{same}')],
            prompt='describe')

    names = made['payload']['artifacts']
    assert len(set(names)) == 2, f'the two images collapsed into one: {names}'
    assert names == [f'11__{same}', f'22__{same}']
    # Both really landed on disk under their own name.
    for n in names:
        assert cluster_svc.artifact_path(job_id, n).is_file()
    # …and they are still the DIFFERENT images, not one written twice.
    blobs = {cluster_svc.artifact_path(job_id, n).read_bytes() for n in names}
    assert len(blobs) == 2, 'one image overwrote the other'


def test_vision_staging_still_accepts_plain_paths(app, tmp_path, monkeypatch):
    """The raw /jobs/vision route passes bare paths and must keep working."""
    from app.services import cluster as cluster_svc
    from app.services import cluster_remote

    p = tmp_path / 'only.jpg'
    Image.new('RGB', (16, 16)).save(str(p))
    made = {}
    monkeypatch.setattr(cluster_svc, 'enqueue_generic', lambda **kw: made.update(kw))
    monkeypatch.setattr(cluster_svc, 'normalize_device_id', lambda d: d)
    with app.app_context():
        cluster_remote.enqueue_vision_on_device(PEER, [str(p)], prompt='x')
    assert made['payload']['artifacts'] == ['only.jpg']
