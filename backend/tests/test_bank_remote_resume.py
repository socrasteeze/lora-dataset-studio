"""A pass done once must not be paid for twice — on either machine.

Four things this pins, all of which were broken or missing:

* the cache a peer returns must be READABLE by the script that wrote it. The
  installer used to write a fixed paths/states/embs/sigs schema, which is not
  the faces cache's shape: `face_embed_infer._load_cache` also reads `dets` and
  `bfracs`, so an installed faces cache raised, logged "cache unreadable,
  recomputing", and returned {} — after overwriting the good local cache;
* Stop must keep what the peer finished;
* the hub must send its cache so the peer skips what is already done;
* and it must then stop uploading those images at all.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

PEER = '4fa2b7c1-0000-4000-8000-000000000001'
INFER_DIR = Path(__file__).resolve().parents[1] / 'infer'


def _script(name):
    """Drive the REAL script's cache reader, not a reimplementation of it —
    the whole bug was a second copy of the schema drifting from the first."""
    spec = importlib.util.spec_from_file_location(f'lds_{name}',
                                                  INFER_DIR / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _faces_npz(path, peer_paths):
    """Exactly what face_embed_infer._save_cache writes: no sigs, but dets and
    bfracs, which the old installer dropped on the floor."""
    n = len(peer_paths)
    np.savez(str(path), paths=np.array(peer_paths),
             states=np.array(['scorable'] * n),
             dets=np.array([0.9] * n, dtype='float32'),
             bfracs=np.array([0.3] * n, dtype='float32'),
             embs=np.ones((n, 4), dtype='float32'))


def _score_npz(path, peer_paths, sigs=None):
    n = len(peer_paths)
    np.savez(str(path), paths=np.array(peer_paths),
             states=np.array(['ok'] * n),
             aes=np.array([7.0] * n, dtype='float32'),
             nsfw=np.array([0.1] * n, dtype='float32'),
             embs=np.ones((n, 4), dtype='float32'),
             sigs=np.array(sigs if sigs is not None else [''] * n))


@pytest.fixture
def hub_images(tmp_path):
    paths = []
    for i in range(3):
        p = tmp_path / 'imgs' / f'img{i}.jpg'
        p.parent.mkdir(parents=True, exist_ok=True)
        Image.new('RGB', (16, 16)).save(str(p))
        paths.append(str(p))
    return paths


# --- the installed cache must be readable by its own script -----------------

def test_an_installed_faces_cache_is_readable_by_the_faces_script(
        app, tmp_path, hub_images, monkeypatch):
    from app.services import bank_remote
    from app.services import cluster as cluster_svc

    name_to_hub = {f'{i}__img{i}.jpg': p for i, p in enumerate(hub_images)}
    peer_paths = [f'C:/peer/tmp/{n}' for n in name_to_hub]
    with app.app_context():
        art = cluster_svc.job_artifact_dir('resume-1')
        _faces_npz(art / 'face_cache.npz', peer_paths)
        dest = tmp_path / 'bank' / 'face_cache.npz'
        bank_remote._install_cache('resume-1', 'face_cache.npz', dest,
                                   name_to_hub)

    got = _script('face_embed_infer')._load_cache(str(dest))

    assert set(got) == set(hub_images), \
        'the faces script could not read the cache the peer just sent'
    state, det, bfrac, emb, sig = got[hub_images[0]]
    assert str(state) == 'scorable'
    assert (det, bfrac) == (pytest.approx(0.9), pytest.approx(0.3))
    assert sig == '', 'a legacy entry carries no signature and is never stale'
    with np.load(str(dest), allow_pickle=False) as z:
        assert 'sigs' not in z.files, \
            'a cache that arrived without sigs must not have one invented for it'


def test_an_installed_score_cache_keeps_its_scores_and_gains_hub_sigs(
        app, tmp_path, hub_images):
    from app.services import bank_remote
    from app.services import cluster as cluster_svc

    name_to_hub = {f'{i}__img{i}.jpg': p for i, p in enumerate(hub_images)}
    peer_paths = [f'C:/peer/tmp/{n}' for n in name_to_hub]
    with app.app_context():
        art = cluster_svc.job_artifact_dir('resume-2')
        _score_npz(art / 'score_cache.npz', peer_paths,
                   sigs=['999:999'] * 3)          # peer mtimes: meaningless here
        dest = tmp_path / 'bank' / 'score_cache.npz'
        bank_remote._install_cache('resume-2', 'score_cache.npz', dest,
                                   name_to_hub)

    got = _script('bank_score_infer')._load_cache(str(dest))

    assert set(got) == set(hub_images)
    assert got[hub_images[0]][1] == 7.0, 'the aesthetic score was dropped'
    st = os.stat(hub_images[0])
    assert got[hub_images[0]][4] == f'{st.st_size}:{st.st_mtime_ns}', \
        'sigs must be recomputed from the HUB files, not kept from the peer'


# --- the hub must send what it already has ----------------------------------

def test_the_cache_is_shipped_and_covered_images_are_not_uploaded(
        tmp_path, hub_images):
    from app.services import bank_remote

    name_to_hub = {f'{i}__img{i}.jpg': p for i, p in enumerate(hub_images)}
    hub_cache = tmp_path / 'bank' / 'face_cache.npz'
    hub_cache.parent.mkdir(parents=True)
    # The hub has the first two already.
    _faces_npz(hub_cache, hub_images[:2])

    (tmp_path / 'ship').mkdir()
    shipped, covered = bank_remote._ship_cache(
        hub_cache, 'face_cache.npz', name_to_hub, tmp_path / 'ship')

    assert covered == {'0__img0.jpg', '1__img1.jpg'}
    # Re-keyed to the names the peer will see, or its own `p not in cache`
    # check compares hub paths against downloaded ones and matches nothing.
    with np.load(shipped, allow_pickle=False) as z:
        assert set(str(p) for p in z['paths']) == covered
        assert 'dets' in z.files and 'bfracs' in z.files


def test_an_edited_image_is_not_claimed_as_already_done(tmp_path, hub_images):
    """Score keys staleness on the signature. An entry whose hub file changed
    since it was scored must be sent again, not skipped."""
    from app.services import bank_remote

    name_to_hub = {f'{i}__img{i}.jpg': p for i, p in enumerate(hub_images)}
    hub_cache = tmp_path / 'bank' / 'score_cache.npz'
    hub_cache.parent.mkdir(parents=True)
    fresh = os.stat(hub_images[0])
    _score_npz(hub_cache, hub_images[:2],
               sigs=[f'{fresh.st_size}:{fresh.st_mtime_ns}', '1:1'])
    (tmp_path / 'ship').mkdir()

    shipped, covered = bank_remote._ship_cache(
        hub_cache, 'score_cache.npz', name_to_hub, tmp_path / 'ship')

    assert covered == {'0__img0.jpg'}, 'a stale entry was claimed as done'
    with np.load(shipped, allow_pickle=False) as z:
        assert [str(s) for s in z['sigs']] == [''], \
            "the peer's mtimes differ; a hub sig there would refuse every entry"


def test_no_cache_means_everything_is_sent(tmp_path, hub_images):
    from app.services import bank_remote

    name_to_hub = {f'{i}__img{i}.jpg': p for i, p in enumerate(hub_images)}
    shipped, covered = bank_remote._ship_cache(
        tmp_path / 'absent.npz', 'face_cache.npz', name_to_hub, tmp_path)

    assert (shipped, covered) == (None, set())


def test_a_pass_stages_only_the_uncached_images_but_names_them_all(
        app, tmp_path, hub_images, monkeypatch):
    """The saving, end to end — and the safety rule with it: every name still
    reaches the script (it clusters over all of them), only the FILES shrink."""
    from app.services import bank_jobs, bank_remote

    hub_cache = tmp_path / 'bank' / 'face_cache.npz'
    hub_cache.parent.mkdir(parents=True)
    _faces_npz(hub_cache, hub_images[:2])
    by_path = {p: i for i, p in enumerate(hub_images)}
    seen = {}

    def fake_enqueue(device_id, *, script, stdin, image_paths, timeout):
        seen['stdin'] = stdin
        seen['files'] = [os.path.basename(str(d)) for _s, d in image_paths]
        raise _Stop()

    class _Stop(Exception):
        pass

    monkeypatch.setattr('app.services.cluster_remote.enqueue_infer_on_device',
                        fake_enqueue)
    monkeypatch.setattr(bank_jobs, 'progress', lambda job, **kw: None)
    import re
    with app.app_context():
        with pytest.raises(_Stop):
            bank_remote.run_remote_pass(
                object(), PEER, script='face_embed_infer.py', by_path=by_path,
                extra_payload={}, cache_path=hub_cache,
                progress_re=re.compile(r'x(\d)/(\d)'), detail_label='face pass')

    assert len(seen['stdin']['images']) == 3, \
        'clustering needs every name, uploaded or not'
    assert 'face_cache.npz' in seen['files'], 'the cache was not sent'
    assert [f for f in seen['files'] if f.endswith('.jpg')] == ['2__img2.jpg'], \
        'an image the shipped cache already covers was uploaded again'


# --- Stop must keep what the peer finished ----------------------------------

def _cancelling_job(app, monkeypatch, *, peer_answers):
    """A pass the user Stops immediately. `peer_answers` decides whether the
    peer winds down and uploads before the grace expires."""
    from app.services import bank_jobs, bank_remote
    from app.services import cluster as cluster_svc

    job_id = 'stop-1'

    def fake_enqueue(device_id, *, script, stdin, image_paths, timeout):
        art = cluster_svc.job_artifact_dir(job_id)
        if peer_answers:
            # Exactly what the script prints when it sees the sentinel, and
            # what peer_worker uploads LAST once out/ is already home.
            _faces_npz(art / 'face_cache.npz', ['0__img0.jpg'])
            (art / 'infer_result.json').write_text(json.dumps(
                {'ok': True, 'cancelled': True, 'cached': 1, 'remaining': 2}),
                encoding='utf-8')
        return job_id

    class _Row:
        status = 'running'
        progress = None
        error_message = None

    class _FakeClusterJob:
        query = type('Q', (), {'filter_by': staticmethod(
            lambda **kw: type('F', (), {'first': staticmethod(lambda: _Row())})())})()

    monkeypatch.setattr('app.services.cluster_remote.enqueue_infer_on_device',
                        fake_enqueue)
    monkeypatch.setattr('app.models.ClusterJob', _FakeClusterJob)
    monkeypatch.setattr(bank_jobs, 'cancelled', lambda job: True)
    monkeypatch.setattr(bank_jobs, 'progress', lambda job, **kw: None)
    monkeypatch.setattr(cluster_svc, 'cancel_cluster_job', lambda jid: True)
    monkeypatch.setattr(bank_remote, 'REMOTE_CANCEL_GRACE_SECONDS', 0.5)
    monkeypatch.setattr(bank_remote, 'POLL_SECONDS', 0.01)
    return bank_remote


def test_a_stop_the_peer_answers_keeps_the_work(app, tmp_path, hub_images,
                                                monkeypatch):
    """The 73 orphaned .npz files: the peer handed its cache back and the hub
    raised before installing it. Now it waits, installs, and says what it kept."""
    import re

    bank_remote = _cancelling_job(app, monkeypatch, peer_answers=True)
    dest = tmp_path / 'bank' / 'face_cache.npz'
    with app.app_context():
        with pytest.raises(bank_remote.RemotePassCancelled) as e:
            bank_remote.run_remote_pass(
                object(), PEER, script='face_embed_infer.py',
                by_path={hub_images[0]: 0}, extra_payload={}, cache_path=dest,
                progress_re=re.compile(r'x(\d)/(\d)'), detail_label='face pass')

    assert e.value.kept == {'ok': True, 'cancelled': True,
                            'cached': 1, 'remaining': 2}
    assert dest.is_file(), 'the cache the peer handed back was thrown away'


def test_a_stop_the_peer_never_answers_still_stops(app, tmp_path, hub_images,
                                                   monkeypatch):
    """The grace is bounded. A peer that has already died must not hold the
    bank job open, and nothing is claimed to have been kept."""
    import re

    bank_remote = _cancelling_job(app, monkeypatch, peer_answers=False)
    dest = tmp_path / 'bank' / 'face_cache.npz'
    with app.app_context():
        with pytest.raises(bank_remote.RemotePassCancelled) as e:
            bank_remote.run_remote_pass(
                object(), PEER, script='face_embed_infer.py',
                by_path={hub_images[0]: 0}, extra_payload={}, cache_path=dest,
                progress_re=re.compile(r'x(\d)/(\d)'), detail_label='face pass')

    assert e.value.kept is None
    assert not dest.exists()


def test_the_stopped_line_says_what_was_kept(app):
    """A Stop that saved 1 of 3 must not read the same as one that saved
    nothing — that wording was the visible half of the bug."""
    from app.services import bank_remote, image_bank_service as banks

    kept = banks._remote_stopped_detail(
        'face embeddings cached',
        bank_remote.RemotePassCancelled(kept={'cached': 1, 'remaining': 2}),
        None, 3)
    lost = banks._remote_stopped_detail(
        'face embeddings cached', bank_remote.RemotePassCancelled(), None, 3)

    assert '1 face embeddings cached (2 remaining)' in kept
    assert 'relaunch to finish' in kept
    assert 'did not hand anything back' in lost


# --- an edited image must not answer with a stale face ----------------------

def test_the_face_cache_re_embeds_an_image_replaced_at_the_same_path(tmp_path):
    """The faces cache keyed on path alone and ignored signatures, so replacing
    an image in place kept its OLD embedding forever — the person grouping,
    "find by text" and "select similar" all went on describing a picture that
    was no longer there. Score has always had this check; faces did not."""
    embed = _script('face_embed_infer')
    img = tmp_path / 'face.jpg'
    Image.new('RGB', (16, 16)).save(str(img))
    cache_file = tmp_path / 'face_cache.npz'

    cache = {str(img): ('scorable', 0.9, 0.3,
                        np.ones(4, dtype='float32'), embed._file_sig(str(img)))}
    embed._save_cache(str(cache_file), cache)
    loaded = embed._load_cache(str(cache_file))
    assert not embed._is_stale(str(img), loaded[str(img)]), \
        'an untouched image must stay cached'

    # Replace the file at the same path — a different image, same name.
    Image.new('RGB', (32, 32), color=(255, 0, 0)).save(str(img))
    os.utime(str(img), (0, 0))          # force a different mtime deterministically

    assert embed._is_stale(str(img), loaded[str(img)]), \
        'the replaced image kept its old embedding'


def test_a_cache_written_before_signatures_is_not_thrown_away(tmp_path):
    """Additive, like the score cache: entries with no sig are never stale, so
    an existing cache keeps working instead of forcing a full re-embed."""
    embed = _script('face_embed_infer')
    img = tmp_path / 'legacy.jpg'
    Image.new('RGB', (16, 16)).save(str(img))
    legacy = tmp_path / 'legacy.npz'
    np.savez(str(legacy), paths=np.array([str(img)]),
             states=np.array(['scorable']),
             dets=np.array([0.9], dtype='float32'),
             bfracs=np.array([0.3], dtype='float32'),
             embs=np.ones((1, 4), dtype='float32'))      # no sigs array at all

    loaded = embed._load_cache(str(legacy))

    assert set(loaded) == {str(img)}
    assert not embed._is_stale(str(img), loaded[str(img)])


# --- the vision passes: framing, watermark scan, Ollama captions ------------

def _vision_job(app, monkeypatch, *, payload, cancelled=False, upload=True):
    from app.services import bank_jobs, bank_remote
    from app.services import cluster as cluster_svc

    job_id = 'vision-1'

    def fake_enqueue(device_id, staged, *, prompt, prefer_json, fmt):
        if upload:
            art = cluster_svc.job_artifact_dir(job_id)
            (art / 'vision_result.json').write_text(json.dumps(payload),
                                                    encoding='utf-8')
        return job_id

    class _Row:
        status = 'running' if cancelled else 'completed'
        progress = None
        error_message = None

    class _FakeClusterJob:
        query = type('Q', (), {'filter_by': staticmethod(
            lambda **kw: type('F', (), {'first': staticmethod(lambda: _Row())})())})()

    monkeypatch.setattr('app.services.cluster_remote.enqueue_vision_on_device',
                        fake_enqueue)
    monkeypatch.setattr('app.models.ClusterJob', _FakeClusterJob)
    monkeypatch.setattr(bank_jobs, 'cancelled', lambda job: cancelled)
    monkeypatch.setattr(bank_jobs, 'progress', lambda job, **kw: None)
    monkeypatch.setattr(cluster_svc, 'cancel_cluster_job', lambda jid: True)
    monkeypatch.setattr(bank_remote, 'REMOTE_CANCEL_GRACE_SECONDS', 0.5)
    monkeypatch.setattr(bank_remote, 'POLL_SECONDS', 0.01)
    return bank_remote


def test_a_remote_vision_pass_actually_returns_its_answers(app, hub_images,
                                                           monkeypatch):
    """The peer writes {'items': [...]}; the hub read data['results'] and found
    nothing, so every row came back as "never answered" and every caller left it
    alone. Framing, watermark scan and Ollama captions on a peer therefore
    completed having changed NOTHING. No test caught it because every existing
    test of this function stubs the function itself."""
    bank_remote = _vision_job(app, monkeypatch, payload={'items': [
        {'artifact': f'{i}__img{i}.jpg', 'text': f'answer {i}'}
        for i in range(3)]})

    with app.app_context():
        got = list(bank_remote.run_remote_vision(
            object(), PEER, items=[(i, p) for i, p in enumerate(hub_images)],
            prompt='x', detail_label='framing'))

    assert [raw for _rid, raw, _err in got] == ['answer 0', 'answer 1', 'answer 2']


def test_a_peer_answering_the_older_shape_still_works(app, hub_images,
                                                      monkeypatch):
    """'results' is kept as a fallback so a peer on older code is not broken by
    the fix — the same mixed-version case the infer path has to survive."""
    bank_remote = _vision_job(app, monkeypatch, payload={'results': [
        {'artifact': '0__img0.jpg', 'text': 'from an older peer'}]})

    with app.app_context():
        got = list(bank_remote.run_remote_vision(
            object(), PEER, items=[(0, hub_images[0])], prompt='x',
            detail_label='framing'))

    assert [raw for _rid, raw, _err in got] == ['from an older peer']


def test_a_stopped_vision_pass_keeps_what_the_peer_answered(app, hub_images,
                                                            monkeypatch):
    """Stop used to keep nothing here, while the docstring claimed otherwise.
    The peer breaks between images and uploads what it has; rows it never
    reached stay None, which the callers already treat as leave-alone."""
    bank_remote = _vision_job(app, monkeypatch, cancelled=True, payload={
        'items': [{'artifact': '0__img0.jpg', 'text': 'done before the stop'}]})

    with app.app_context():
        got = list(bank_remote.run_remote_vision(
            object(), PEER, items=[(i, p) for i, p in enumerate(hub_images)],
            prompt='x', detail_label='framing'))

    assert [raw for _rid, raw, _err in got] == ['done before the stop', None, None]


def test_a_stop_the_peer_never_answers_yields_nothing_and_does_not_hang(
        app, hub_images, monkeypatch):
    bank_remote = _vision_job(app, monkeypatch, cancelled=True, upload=False,
                              payload={})

    with app.app_context():
        with pytest.raises(bank_remote.RemotePassCancelled):
            list(bank_remote.run_remote_vision(
                object(), PEER, items=[(0, hub_images[0])], prompt='x',
                detail_label='framing'))
