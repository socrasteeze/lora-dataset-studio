"""🗃️ Image bank — the cross-bank "Launch all" queue.

Line up several banks and let them run back-to-back, one at a time, instead of a
second bank's GPU pass being rejected (503) while another runs. Under TESTING
every bank_jobs job runs INLINE, so an enqueue drains the whole queue
synchronously (see bank_queue.enqueue) — which lets us assert ordering and the
persisted per-bank pipeline reports directly. The FIFO/dedupe/cancel bookkeeping
is exercised separately with the worker stubbed out so entries stay put.
"""
import os

from PIL import Image

from app.services import bank_queue


def _save(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', (32, 32), (128, 128, 128)).save(path, 'JPEG', quality=90)


def _mkbank(client, tmp_path, name):
    src = tmp_path / name
    _save(str(src / 'a.jpg'))
    _save(str(src / 'b.jpg'))
    r = client.post('/api/bank/create', json={'name': name, 'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id']


def _mock_heavy(monkeypatch, svc, order=None):
    """Neutralize the GPU/ML passes so the pipeline runs as pure bookkeeping."""
    for name in ('_score_prereq', '_watermark_prereq', '_faces_prereq',
                 '_framing_prereq', '_caption_prereq'):
        monkeypatch.setattr(svc, name, lambda: None)
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: None)

    def _fake(step):
        def factory(*_a, **_k):
            def run(job):
                if order is not None:
                    order.append(step)
            return run
        return factory
    for name, step in (('_score_job', 'score'), ('_watermark_job', 'watermark'),
                       ('_faces_job', 'faces'), ('_framing_job', 'framing'),
                       ('_caption_job', 'caption')):
        monkeypatch.setattr(svc, name, _fake(step))
    monkeypatch.setattr(svc, 'rebuild_semantic_dup_groups', lambda *_a, **_k: 0)


def _report(client, bank_id):
    return client.get(f'/api/bank/{bank_id}').get_json().get('pipeline_report')


# --- end-to-end (real synchronous drain under TESTING) -----------------------
def test_queue_runs_a_banks_pipeline(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as svc
    bank_queue.reset()
    _mock_heavy(monkeypatch, svc)
    bank_id = _mkbank(client, tmp_path, 'B1')
    r = client.post(f'/api/bank/{bank_id}/queue',
                    json={'steps': ['scan', 'score'], 'resolve_dups': False})
    assert r.status_code == 202, r.get_json()
    report = _report(client, bank_id)
    assert report is not None
    assert [s['step'] for s in report['steps']] == ['scan', 'score']
    # Drained synchronously, so the queue is empty again.
    assert bank_queue.snapshot()['items'] == []


def test_queue_runs_multiple_banks_in_fifo_order(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as svc
    bank_queue.reset()
    _mock_heavy(monkeypatch, svc)
    a = _mkbank(client, tmp_path, 'A')
    b = _mkbank(client, tmp_path, 'B')
    client.post(f'/api/bank/{a}/queue', json={'steps': ['scan']})
    # First enqueue drained fully under TESTING → bank A already has its report
    # before B is ever queued: proof the runs are serialized, not interleaved.
    assert _report(client, a) is not None
    client.post(f'/api/bank/{b}/queue', json={'steps': ['scan']})
    assert _report(client, b) is not None


def test_queue_add_unknown_bank_is_404(client):
    bank_queue.reset()
    r = client.post('/api/bank/999999/queue', json={'steps': ['scan']})
    assert r.status_code == 404


def test_queue_empty_steps_is_400(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as svc
    bank_queue.reset()
    _mock_heavy(monkeypatch, svc)
    bank_id = _mkbank(client, tmp_path, 'B')
    r = client.post(f'/api/bank/{bank_id}/queue', json={'steps': []})
    assert r.status_code == 400


def test_queue_skips_a_launch_that_raises(client, tmp_path, monkeypatch):
    """A bank whose pipeline can't launch (e.g. deleted mid-queue) is dropped, not
    crashed on — the worker keeps going."""
    from app.services import image_bank_service as svc
    bank_queue.reset()
    _mock_heavy(monkeypatch, svc)
    bank_id = _mkbank(client, tmp_path, 'B')
    monkeypatch.setattr(svc, 'start_pipeline',
                        lambda *_a, **_k: (_ for _ in ()).throw(ValueError('gone')))
    r = client.post(f'/api/bank/{bank_id}/queue', json={'steps': ['scan']})
    assert r.status_code == 202
    assert bank_queue.snapshot()['items'] == []    # dropped cleanly


# --- FIFO / dedupe / cancel bookkeeping (worker stubbed so entries persist) --
def _freeze_worker(monkeypatch):
    """Stop the drain from consuming entries, so enqueue just records them."""
    monkeypatch.setattr(bank_queue, '_process_next', lambda _app: False)


def test_dedupe_rejects_a_second_entry_for_the_same_bank(app, monkeypatch):
    bank_queue.reset()
    _freeze_worker(monkeypatch)
    bank_queue.enqueue(app, 'local', 1, steps=['scan'])
    try:
        bank_queue.enqueue(app, 'local', 1, steps=['scan'])
        assert False, 'expected BankAlreadyQueued'
    except bank_queue.BankAlreadyQueued as e:
        assert e.bank_id == 1


def test_snapshot_reports_positions(app, monkeypatch):
    bank_queue.reset()
    _freeze_worker(monkeypatch)
    bank_queue.enqueue(app, 'local', 1, steps=['scan'])
    bank_queue.enqueue(app, 'local', 2, steps=['scan'])
    snap = bank_queue.snapshot()
    assert [(i['bank_id'], i['position']) for i in snap['items']] == [(1, 1), (2, 2)]
    assert bank_queue.state_for(2) == {'state': 'pending', 'position': 2}
    assert bank_queue.state_for(99) is None


def test_cancel_pending_and_clear(app, monkeypatch):
    bank_queue.reset()
    _freeze_worker(monkeypatch)
    bank_queue.enqueue(app, 'local', 1, steps=['scan'])
    bank_queue.enqueue(app, 'local', 2, steps=['scan'])
    assert bank_queue.cancel(1) is True
    assert [i['bank_id'] for i in bank_queue.snapshot()['items']] == [2]
    assert bank_queue.cancel(99) is False          # not queued
    assert bank_queue.clear() == 1                 # the remaining entry
    assert bank_queue.snapshot()['items'] == []
