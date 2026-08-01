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
