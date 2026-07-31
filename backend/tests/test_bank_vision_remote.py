"""📐 Framing and 🚩 Watermark detection run on a compute peer.

Both halves of this already existed and were never connected: the peer's
`_run_vision` handler and the hub's `enqueue_vision_on_device`. The spec even
said so — "vision — Open, no in-app caller". So "run this bank on the peer"
shipped 2 passes out of 8 and left the rest on the hub, three of them holding
the hub's GPU.
"""
from __future__ import annotations

import json
import os

import pytest
from PIL import Image

PEER = '4fa2b7c1-0000-4000-8000-000000000001'


def _two_same_named(tmp_path):
    """Two DIFFERENT images with the SAME basename, in different subfolders —
    the shape that made artifact staging collide (163 of 23 408 on a real bank).
    """
    src = tmp_path / 'src'
    (src / 'a').mkdir(parents=True, exist_ok=True)
    (src / 'b').mkdir(parents=True, exist_ok=True)
    Image.new('RGB', (32, 32), (200, 10, 10)).save(str(src / 'a' / 'same.jpg'))
    Image.new('RGB', (32, 32), (10, 10, 200)).save(str(src / 'b' / 'same.jpg'))
    return src


@pytest.fixture()
def peer(monkeypatch):
    """A peer that answers every staged image, recording what it was sent.

    Replaces only the WIRE — the hub-side driver under test is the real one.
    """
    from app.extensions import db
    from app.models import ClusterJob
    from app.services import bank_remote
    from app.services import cluster as cluster_svc
    from app.services import cluster_remote

    state = {'names': [], 'answer': '{}', 'status': 'completed', 'jobs': 0}
    monkeypatch.setattr(bank_remote, 'POLL_SECONDS', 0.001)
    monkeypatch.setattr(bank_remote, '_check_peer_capability', lambda *a, **k: None)
    monkeypatch.setattr(cluster_svc, 'device_label', lambda d: 'Laptop')
    monkeypatch.setattr(cluster_svc, 'forget_artifact_fetches', lambda j: None)
    monkeypatch.setattr(cluster_svc, 'artifacts_fetched', lambda j: 999)

    def fake_enqueue(device_id, image_paths, *, prompt, prefer_json=False,
                     fmt=None, job_id=None):
        state['jobs'] += 1
        state['prompt'] = prompt
        state['names'] = [n for _p, n in image_paths]
        jid = 'vis-%d' % state['jobs']
        db.session.add(ClusterJob(job_id=jid, device_id=device_id, kind='vision',
                                  status=state['status'], payload=json.dumps({})))
        db.session.commit()
        return jid

    monkeypatch.setattr(cluster_remote, 'enqueue_vision_on_device', fake_enqueue)
    monkeypatch.setattr(
        cluster_remote, 'read_job_result_json',
        lambda jid, *a, **k: {'results': [{'artifact': n, 'text': state['answer']}
                                          for n in state['names']]})
    return state


# --- the two passes that now travel ------------------------------------------

def test_a_remote_framing_pass_writes_the_rows_and_takes_no_local_window(
        app, tmp_path, peer, monkeypatch):
    from app.models import BankImage
    from app.services import image_bank_service as banks

    peer['answer'] = '{"framing": "face"}'
    took = {'n': 0}
    monkeypatch.setattr('app.gpu_window.gpu_exclusive_vision_window',
                        lambda **kw: took.update(n=took['n'] + 1))

    with app.app_context():
        bank, _ = banks.create_bank('local', 'Fram', str(_two_same_named(tmp_path)))
        job = banks.start_framing(app, 'local', bank.id, rescan=True, device_id=PEER)
        assert job['error'] is None, job['error']
        rows = BankImage.query.filter_by(bank_id=bank.id).all()
        got = sorted((r.relpath, r.framing) for r in rows)

    assert len(got) == 2 and all(f == 'face' for _p, f in got), got
    assert took['n'] == 0, 'a remote pass must not take THIS machine GPU window'
    # The two same-named files were staged under DIFFERENT names, or one row
    # would have been given the other's verdict — silently.
    assert len(set(peer['names'])) == 2, peer['names']


def test_a_remote_watermark_pass_still_discards_the_clean_blob_on_the_hub(
        app, tmp_path, peer):
    """The discard is destructive and LOCAL: the peer must judge the SOURCE
    pixels, so a stale cleaned blob is unlinked here before the image is staged.
    Analysis travelling must not move that."""
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks

    peer['answer'] = '{"watermark": false}'
    with app.app_context():
        bank, _ = banks.create_bank('local', 'WM', str(_two_same_named(tmp_path)))
        row = BankImage.query.filter_by(bank_id=bank.id).first()
        row.watermark_clean_method = 'crop'
        db.session.commit()
        row_id = row.id
        blob = banks.clean_image_path(bank.id, row_id)
        blob.parent.mkdir(parents=True, exist_ok=True)
        blob.write_bytes(b'stale')

        job = banks.start_watermark(app, 'local', bank.id, rescan=True,
                                    device_id=PEER)
        assert job['error'] is None, job['error']

        assert not blob.exists(), 'the stale cleaned blob survived a remote scan'
        # The pass writes via a bulk UPDATE with synchronize_session=False (see
        # _flush_row_updates), so an object already in this session's identity
        # map still holds the pre-pass values. Re-read from the database.
        db.session.expire_all()
        refreshed = db.session.get(BankImage, row_id)
        assert refreshed.watermark_clean_method is None
        assert refreshed.watermark_state == 'none'


def test_a_missing_file_is_not_an_error_and_still_advances_the_pass(
        app, tmp_path, peer):
    """A file gone from disk reads as "leave the row alone", exactly as it does
    locally — not as an error, and not as an empty answer."""
    from app.models import BankImage
    from app.services import image_bank_service as banks

    peer['answer'] = '{"framing": "body"}'
    src = _two_same_named(tmp_path)
    with app.app_context():
        bank, _ = banks.create_bank('local', 'Gone', str(src))
        os.remove(str(src / 'a' / 'same.jpg'))
        job = banks.start_framing(app, 'local', bank.id, rescan=True, device_id=PEER)
        assert job['error'] is None, job['error']
        framings = sorted((r.framing or '-')
                          for r in BankImage.query.filter_by(bank_id=bank.id))

    assert framings == ['-', 'body'], framings
    assert len(peer['names']) == 1, 'the missing file must not be staged'


def test_a_peer_that_cancels_is_reported_not_swallowed(app, tmp_path, peer):
    from app.services import image_bank_service as banks

    peer['status'] = 'cancelled'
    with app.app_context():
        bank, _ = banks.create_bank('local', 'Stop', str(_two_same_named(tmp_path)))
        job = banks.start_framing(app, 'local', bank.id, rescan=True, device_id=PEER)

    assert job['error'], 'a cancelled remote pass reported success'


# --- the deliberate limit ----------------------------------------------------

def test_a_peer_without_ollama_is_refused_before_anything_is_staged(app):
    """A bank of 5 000 images must not cross the network to discover the peer
    cannot answer. Reuses the same up-front check score/faces use."""
    from app.extensions import db
    from app.models import ClusterDevice
    from app.services import bank_remote

    with app.app_context():
        db.session.add(ClusterDevice(id=PEER, name='Laptop', auth_token_hash='x',
                                     capabilities=json.dumps({'ollama': False})))
        db.session.commit()
        with pytest.raises(RuntimeError, match='Ollama'):
            bank_remote._check_peer_capability(PEER, 'ollama')


# --- captions, routed by what the peer reports -------------------------------

def _peer_row(caps):
    from app.extensions import db
    from app.models import ClusterDevice
    db.session.add(ClusterDevice(id=PEER, name='Laptop', auth_token_hash='x',
                                 capabilities=json.dumps(caps)))
    db.session.commit()


def test_a_peer_with_joycaption_gets_an_infer_job_not_a_vision_one(
        app, tmp_path, monkeypatch):
    """The hub routes by what the peer HAS, never by re-deciding the engine.

    JoyCaption is a local subprocess, so it rides the infer kind: the peer runs
    its OWN backend/infer/joycaption_infer.py, in its OWN ai-toolkit venv, with
    its OWN HF_HOME. Nothing about "which captioner" is decided here.
    """
    from app.models import BankImage
    from app.services import bank_remote, image_bank_service as banks

    sent = {}

    def fake_pass(job, device_id, *, script, by_path, extra_payload, cache_path,
                  progress_re, detail_label, required_cap=None, bank_id=None):
        sent.update(script=script, cache_path=cache_path,
                    n=len(by_path), prompt=extra_payload.get('prompt'))
        return {'captions': {p: 'a red dress' for p in by_path}}

    monkeypatch.setattr(bank_remote, 'run_remote_pass', fake_pass)
    monkeypatch.setattr(bank_remote, 'run_remote_vision',
                        lambda *a, **k: pytest.fail('used the vision kind'))

    with app.app_context():
        _peer_row({'joycaption': True, 'ollama': True})
        bank, _ = banks.create_bank('local', 'Cap', str(_two_same_named(tmp_path)))
        job = banks.start_caption(app, 'local', bank.id, device_id=PEER)
        assert job['error'] is None, job['error']
        caps = [r.caption for r in BankImage.query.filter_by(bank_id=bank.id)]

    assert sent['script'] == 'joycaption_infer.py'
    assert sent['cache_path'] is None, 'the caption script writes no .npz'
    assert sent['n'] == 2
    assert caps == ['a red dress', 'a red dress'], caps


def test_a_peer_with_only_ollama_gets_a_vision_job(app, tmp_path, monkeypatch):
    from app.models import BankImage
    from app.services import bank_remote, image_bank_service as banks

    def fake_vision(job, device_id, *, items, prompt, detail_label, **kw):
        for row_id, _p in items:
            yield (row_id, None), 'a blue coat', None

    monkeypatch.setattr(bank_remote, 'run_remote_vision', fake_vision)
    monkeypatch.setattr(bank_remote, 'run_remote_pass',
                        lambda *a, **k: pytest.fail('used the infer kind'))

    with app.app_context():
        _peer_row({'joycaption': False, 'ollama': True})
        bank, _ = banks.create_bank('local', 'Cap2', str(_two_same_named(tmp_path)))
        job = banks.start_caption(app, 'local', bank.id, device_id=PEER)
        assert job['error'] is None, job['error']
        caps = [r.caption for r in BankImage.query.filter_by(bank_id=bank.id)]

    assert caps == ['a blue coat', 'a blue coat'], caps


def test_a_peer_that_cannot_caption_falls_back_here_and_says_so(
        app, tmp_path, monkeypatch):
    """Not a failure AFTER staging thousands of images, and not a silently
    ignored device pick."""
    from app.services import bank_remote, image_bank_service as banks

    monkeypatch.setattr(bank_remote, 'run_remote_pass',
                        lambda *a, **k: pytest.fail('staged to a peer that cannot caption'))
    monkeypatch.setattr(bank_remote, 'run_remote_vision',
                        lambda *a, **k: pytest.fail('staged to a peer that cannot caption'))
    ran_locally = {'n': 0}
    monkeypatch.setattr(
        'app.services.face_dataset_service.caption_paths',
        lambda paths, **kw: (ran_locally.update(n=len(paths)),
                             [kw['on_caption'](p, 'local caption') for p in paths],
                             {})[-1])
    monkeypatch.setattr('app.gpu_window.gpu_exclusive_vision_window',
                        lambda **kw: __import__('contextlib').nullcontext())

    with app.app_context():
        _peer_row({'joycaption': False, 'ollama': False})
        bank, _ = banks.create_bank('local', 'Cap3', str(_two_same_named(tmp_path)))
        job = banks.start_caption(app, 'local', bank.id, device_id=PEER)

    assert job['error'] is None, job['error']
    assert ran_locally['n'] == 2, 'it did not fall back to the local captioner'
