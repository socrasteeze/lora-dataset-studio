"""The queue must agree with the rest of the app about what "local" means.

The Launch dialog sends the literal string 'local' (LaunchAllDialog.jsx), and
bank_queue kept it truthy with `device_id or None`. The wait gate reads

    gpu_reason = None if entry.get('device_id') else banks._gpu_busy_reason()

so EVERY dialog-queued bank looked remote and skipped the local-GPU wait — while
the queue-all confirmation told the user each bank "waits for the GPU to be
free". The bank then started on top of a running pass and its GPU steps were
recorded "skipped — GPU busy": a run that reports as finished having done almost
nothing. bank_queue was the only module testing device_id without normalizing.
"""
from __future__ import annotations

import pytest


@pytest.mark.parametrize('sent', ['local', '', '  ', 'auto', None])
def test_every_spelling_of_this_machine_is_stored_as_none(app, sent):
    from app.services import bank_queue
    with app.app_context():
        assert bank_queue._normalized_device(sent) is None, sent


def test_a_real_peer_id_survives_normalisation(app):
    from app.services import bank_queue
    peer = '4fa2b7c1-0000-4000-8000-000000000001'
    with app.app_context():
        assert bank_queue._normalized_device(peer) == peer


def test_a_dialog_queued_local_bank_waits_for_the_gpu(app, tmp_path, monkeypatch):
    """The regression this exists for. 'local' must not buy the peer's exemption
    from the local-GPU wait."""
    import threading
    import time as _time

    from app.services import bank_jobs, bank_queue
    from app.services import image_bank_service as banks
    from test_image_bank import _mkbank, flat

    monkeypatch.setattr(bank_queue, '_POLL_SECONDS', 0.01)
    # The card is held by something else, exactly as during another pass.
    monkeypatch.setattr(banks, '_gpu_busy_reason',
                        lambda: 'a vision/GPU pass is already running')
    started = {'n': 0}
    monkeypatch.setattr(banks, 'start_pipeline',
                        lambda *a, **k: started.update(n=started['n'] + 1))

    with app.app_context():
        client = app.test_client()
        bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='WAIT')
        entry = {'bank_id': bank_id, 'user_id': 'local', 'steps': ['scan'],
                 'reject_flags': [], 'resolve_dups': False,
                 # what the dialog sends, normalized on the way in
                 'device_id': bank_queue._normalized_device('local'),
                 'enqueued_at': 0, 'state': 'pending'}
        with bank_queue._lock:
            bank_queue._queue.append(entry)
        t = threading.Thread(target=bank_queue._process_next, args=(app,),
                             daemon=True)
        t.start()
        for _ in range(200):
            if entry.get('waiting_for'):
                break
            _time.sleep(0.01)
        waiting = entry.get('waiting_for')
        with bank_queue._lock:
            bank_queue._queue.clear()

    assert waiting == 'a vision/GPU pass is already running', (
        'a local bank queued from the dialog did not wait for the local GPU')
    assert started['n'] == 0, 'it started the pipeline on a busy card'


def test_queuing_to_a_comfyui_backend_is_refused_immediately(app, tmp_path):
    """A direct Launch already 400s on a backend id (start_pipeline validates).
    A QUEUE used to return 202 with a position, then _process_next dropped the
    entry with a log line and no toast — the row just disappeared from the
    panel. Same refusal, now at the moment the user can act on it."""
    import pytest

    from app.services import bank_queue
    from test_image_bank import _mkbank, flat

    with app.app_context():
        client = app.test_client()
        bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='BADDEV')
        with pytest.raises(ValueError, match='compute peer'):
            bank_queue.enqueue(app, 'local', bank_id, steps=['scan'],
                               device_id='api:b1156361ded0')
        # …and nothing was left behind in the queue.
        assert bank_queue.snapshot()['items'] == []


def test_the_queue_route_turns_that_into_a_400(app, tmp_path):
    from test_image_bank import _mkbank, flat

    with app.app_context():
        client = app.test_client()
        bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='BADDEV2')
    r = client.post(f'/api/bank/{bank_id}/queue',
                    json={'steps': ['scan'], 'device_id': 'api:b1156361ded0'})
    assert r.status_code == 400, r.get_json()
    assert 'compute peer' in (r.get_json() or {}).get('error', '')


# --- the PASSES are validated against the device, not only its id ------------
#
# `steps` were checked against the chosen machine NOWHERE: _remote_pass_device
# answers one question — is this an 'api:' backend? — and takes no steps at all.
# So a peer reporting bank_scoring=false accepted a Launch-all containing
# ✨ Score, returned 202, staged the bank across the network and died on the
# first image as a mid-pipeline step error.

PEER = '4fa2b7c1-0000-4000-8000-000000000001'


def _peer(caps):
    import json

    from app.extensions import db
    from app.models import ClusterDevice
    db.session.add(ClusterDevice(id=PEER, name='Spare box', auth_token_hash='x',
                                 capabilities=json.dumps(caps)))
    db.session.commit()


def test_queuing_a_pass_the_peer_reported_it_cannot_run_is_refused(app, tmp_path):
    import pytest

    from app.services import bank_queue
    from test_image_bank import _mkbank, flat

    with app.app_context():
        client = app.test_client()
        bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='NOSCORE')
        _peer({'bank_scoring': False, 'face_scoring': True, 'ollama': True})
        with pytest.raises(ValueError, match='bank-scoring'):
            bank_queue.enqueue(app, 'local', bank_id,
                               steps=['scan', 'score'], device_id=PEER)
        assert bank_queue.snapshot()['items'] == []


def test_the_same_peer_still_takes_the_passes_it_can_run(app, tmp_path):
    """The refusal is per-pass. A partial peer is useful, not useless."""
    from app.services import bank_queue
    from test_image_bank import _mkbank, flat

    with app.app_context():
        client = app.test_client()
        bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='PARTIAL')
        _peer({'bank_scoring': False, 'face_scoring': True, 'ollama': True})
        try:
            assert bank_queue.enqueue(app, 'local', bank_id,
                                      steps=['scan', 'faces', 'framing'],
                                      device_id=PEER) == 1
        finally:
            with bank_queue._lock:
                bank_queue._queue.clear()


def test_a_peer_that_has_not_reported_yet_is_not_refused(app, tmp_path):
    """Same polarity as _check_peer_capability, on purpose: only an EXPLICIT
    False blocks. Being unable to describe yourself is not being unable to do
    the work, and the hub would run this job happily."""
    from app.services import bank_queue
    from test_image_bank import _mkbank, flat

    with app.app_context():
        client = app.test_client()
        bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='QUIET')
        _peer({})
        try:
            assert bank_queue.enqueue(app, 'local', bank_id, steps=['score'],
                                      device_id=PEER) == 1
        finally:
            with bank_queue._lock:
                bank_queue._queue.clear()


def test_captions_are_refused_only_when_the_peer_has_neither_engine(app, tmp_path):
    import pytest

    from app.services import bank_queue
    from test_image_bank import _mkbank, flat

    with app.app_context():
        client = app.test_client()
        bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='NOCAP')
        _peer({'joycaption': False, 'ollama': False})
        with pytest.raises(ValueError, match='JoyCaption or Ollama'):
            bank_queue.enqueue(app, 'local', bank_id, steps=['caption'],
                               device_id=PEER)


def test_launching_refuses_it_too_with_the_same_wording(app, tmp_path):
    """Queue and Launch must not disagree about what that machine can do."""
    with app.app_context():
        from test_image_bank import _mkbank, flat
        client = app.test_client()
        bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='LNOSCORE')
        _peer({'bank_scoring': False})
    r = client.post(f'/api/bank/{bank_id}/pipeline',
                    json={'steps': ['score'], 'device_id': PEER})
    assert r.status_code == 400, r.get_json()
    assert 'bank-scoring' in (r.get_json() or {}).get('error', '')
