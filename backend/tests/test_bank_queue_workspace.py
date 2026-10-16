"""Workspace jobs share the durable Bank queue. All work uses synthetic rows."""
import json

import pytest

from app.config import LOCAL_USER
from app.extensions import db
from app.models import BankImage, BankQueueEntry, ImageBank
from app.services import bank_jobs, bank_queue
from app.services import image_bank_service as banks


@pytest.fixture(autouse=True)
def queued_only(app, monkeypatch):
    bank_queue.reset(durable=False)
    bank_jobs.reset()
    monkeypatch.setattr(bank_queue, '_drain', lambda _app: None)
    monkeypatch.setattr(bank_queue, '_ensure_worker', lambda _app: None)
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: None)
    with app.app_context():
        yield
        bank_queue.reset()
        bank_jobs.reset()


@pytest.fixture
def rows(tmp_path):
    first = ImageBank(user_id=LOCAL_USER, name='Alpha', source_path=str(tmp_path / 'source-01'))
    second = ImageBank(user_id=LOCAL_USER, name='Bravo', source_path=str(tmp_path / 'source-02'))
    db.session.add_all([first, second])
    db.session.flush()
    image = BankImage(bank_id=second.id, relpath='image-01.jpg', status='keep')
    db.session.add(image)
    db.session.commit()
    return first, second, image


def test_workspace_launch_waits_behind_another_bank_and_is_visible(client, app, rows, monkeypatch):
    first, second, _image = rows
    launched = []
    monkeypatch.setattr(banks, 'start_score', lambda *args, **kw: launched.append((args[2], kw)))
    blocker = bank_jobs.reserve(first.id, 'scan')
    blocker['_launched'] = True
    response = client.post(f'/api/bank/{second.id}/score', json={'rescore': True})
    assert response.status_code == 202
    assert response.json['queued'] is True
    assert launched == []
    snapshot = client.get('/api/bank-queue').json
    assert snapshot['items'][0]['operation'] == 'score'
    assert snapshot['items'][0]['state'] == 'pending'
    assert snapshot['active_jobs'][0]['bank_id'] == first.id
    assert client.get(f'/api/bank/{second.id}/activity').json['queue_state']['state'] == 'pending'
    bank_jobs.abort(blocker)
    assert bank_queue._process_next(app)
    assert launched == [(second.id, {'rescore': True, 'device_id': None})]
    assert bank_queue.snapshot()['items'] == []


def test_workspace_and_list_pipeline_use_one_fifo(app, rows, monkeypatch):
    first, second, _image = rows
    launched = []
    monkeypatch.setattr(banks, 'start_score', lambda *a, **k: launched.append(('score', a[2])))
    monkeypatch.setattr(banks, 'start_pipeline', lambda *a, **k: launched.append(('pipeline', a[2])))
    bank_queue.enqueue_operation(app, LOCAL_USER, first.id, 'score', {'rescore': True})
    bank_queue.enqueue(app, LOCAL_USER, second.id, steps=['scan'])
    assert bank_queue._process_next(app)
    assert bank_queue._process_next(app)
    assert launched == [('score', first.id), ('pipeline', second.id)]


def test_saved_selection_and_caption_options_survive_restart(app, rows, monkeypatch):
    _first, bank, image = rows
    received = []
    monkeypatch.setattr(banks, 'start_caption', lambda *a, **k: received.append(k))
    options = {'ids': [image.id], 'statuses': ['keep'], 'force': True,
               'include_asserted': True, 'vocabulary': 'clinical', 'length': 'detailed',
               'backend': 'ollama', 'ollama_model': 'example-vision:latest'}
    bank_queue.enqueue_operation(app, LOCAL_USER, bank.id, 'caption', options)
    stored = BankQueueEntry.query.one()
    assert stored.operation == 'caption'
    assert json.loads(stored.steps) == []  # An old binary must not replay this as a full pipeline.
    assert json.loads(stored.operation_payload)['options'] == options
    options['ids'].clear()  # Caller-owned lists cannot change a saved request.
    bank_queue.reset(durable=False)
    assert bank_queue.restore(app) == 1
    assert bank_queue._process_next(app)
    assert received[0]['ids'] == [image.id]
    assert received[0]['include_asserted'] is True
    assert received[0]['ollama_model'] == 'example-vision:latest'
    assert received[0]['statuses'] == ['keep']
    assert received[0]['force'] is True


def test_machine_choice_is_durable_and_has_its_own_lane(app, rows, monkeypatch):
    first, second, _image = rows
    peer = '4fa2b7c1-0000-4000-8000-000000000001'
    monkeypatch.setattr(banks, '_remote_pass_device', lambda _device: True)
    monkeypatch.setattr(banks, 'refuse_steps_for_device', lambda *_args: None)
    bank_queue.enqueue_operation(app, LOCAL_USER, first.id, 'score', {'device_id': 'local'})
    bank_queue.enqueue_operation(app, LOCAL_USER, second.id, 'caption', {'device_id': peer})
    bank_queue.reset(durable=False)
    bank_queue.restore(app)
    local = bank_queue._claim_next('local')
    remote = bank_queue._claim_next(peer)
    assert local['bank_id'] == first.id
    assert remote['bank_id'] == second.id
    assert remote['operation_payload']['options']['device_id'] == peer


@pytest.mark.parametrize('replace', ['bank', 'image'])
def test_reused_ids_never_apply_a_saved_selection_to_replacements(app, rows, monkeypatch, replace):
    _first, bank, image = rows
    launched = []
    monkeypatch.setattr(banks, 'start_scan', lambda *a, **k: launched.append(True))
    bank_queue.enqueue_operation(app, LOCAL_USER, bank.id, 'scan', {'ids': [image.id]})
    (bank if replace == 'bank' else image).instance_id = 'f' * 32
    db.session.commit()
    bank_queue._process_next(app)
    assert launched == []
    assert bank_queue.state_for(bank.id)['state'] == 'failed'
    assert BankQueueEntry.query.count() == 1


def test_failed_jobs_survive_restart_and_retry_exact_options(app, rows, monkeypatch):
    _first, bank, image = rows
    def unavailable(*_args, **_kwargs):
        raise RuntimeError('Install the required model in Setup.')
    monkeypatch.setattr(banks, 'start_caption', unavailable)
    options = {'ids': [image.id], 'force': True, 'backend': 'ollama'}
    bank_queue.enqueue_operation(app, LOCAL_USER, bank.id, 'caption', options)
    bank_queue._process_next(app)
    assert bank_queue.state_for(bank.id)['error'] == 'Install the required model in Setup.'
    bank_queue.reset(durable=False)
    bank_queue.restore(app)
    assert bank_queue.state_for(bank.id)['state'] == 'failed'
    assert bank_queue._claim_next('local') is None
    received = []
    monkeypatch.setattr(banks, 'start_caption', lambda *a, **k: received.append(k))
    assert bank_queue.retry(app, bank.id)
    bank_queue._process_next(app)
    assert received == [options]
    assert BankQueueEntry.query.count() == 0


def test_a_runtime_failure_stays_visible_and_the_next_bank_can_run(app, rows, monkeypatch):
    first, second, _image = rows
    def fail_job(app, _user, bank_id, **_options):
        def crash(_job):
            raise RuntimeError('Synthetic worker failure')
        return bank_jobs.start(app, bank_id, 'scan', crash)
    monkeypatch.setattr(banks, 'start_scan', fail_job)
    bank_queue.enqueue_operation(app, LOCAL_USER, first.id, 'scan', {})
    bank_queue.enqueue_operation(app, LOCAL_USER, second.id, 'score', {})
    bank_queue._process_next(app)
    assert bank_queue.state_for(first.id)['state'] == 'failed'
    assert bank_queue._claim_next('local')['bank_id'] == second.id


def test_unsaved_submissions_cannot_run_or_be_acknowledged(client, rows, monkeypatch):
    _first, bank, _image = rows
    claimed = []
    def fail_insert(entry):
        claimed.append(bank_queue._claim_next('local'))
        raise RuntimeError('Synthetic storage failure')
    monkeypatch.setattr(bank_queue, '_persist_add', fail_insert)
    result = client.post(f'/api/bank/{bank.id}/score', json={})
    assert result.status_code == 503
    assert claimed == [None]
    assert bank_queue.snapshot()['items'] == []
    assert BankQueueEntry.query.count() == 0


def test_cancelled_old_worker_cannot_remove_a_new_entry_for_the_same_bank(app, rows, monkeypatch):
    _first, bank, _image = rows
    bank_queue.enqueue_operation(app, LOCAL_USER, bank.id, 'scan', {})
    old = bank_queue._queue[0]
    def replace(*_args, **_options):
        bank_queue.cancel(bank.id)
        bank_queue.enqueue_operation(app, LOCAL_USER, bank.id, 'score', {'rescore': True})
    monkeypatch.setattr(banks, 'start_scan', replace)
    bank_queue._process_next(app)
    assert bank_queue._queue[0] is not old
    assert bank_queue.state_for(bank.id)['operation'] == 'score'
    assert BankQueueEntry.query.one().operation == 'score'


def test_duplicate_submit_is_refused_and_cancel_removes_only_the_waiting_job(client, rows):
    _first, bank, _image = rows
    assert client.post(f'/api/bank/{bank.id}/score', json={}).status_code == 202
    assert client.post(f'/api/bank/{bank.id}/scan', json={}).status_code == 409
    assert client.post(f'/api/bank/{bank.id}/cancel', json={}).json['ok']
    assert bank_queue.state_for(bank.id) is None
    assert BankQueueEntry.query.count() == 0


def test_cancel_by_identity_cannot_stop_a_new_job(rows):
    first, _second, _image = rows
    old = bank_jobs.reserve(first.id, 'scan')
    bank_jobs.abort(old)
    new = bank_jobs.reserve(first.id, 'score')
    assert not bank_jobs.cancel(first.id, expected_job=old)
    assert not new['cancelled']


def test_remove_waiting_job_keeps_an_existing_pass_and_stop_targets_the_live_pass(client, rows):
    _first, bank, _image = rows
    job = bank_jobs.reserve(bank.id, 'scan')
    job['_launched'] = True
    assert client.post(f'/api/bank/{bank.id}/score', json={}).status_code == 202
    assert client.delete(f'/api/bank-queue/{bank.id}').status_code == 200
    assert not job['cancelled']
    assert client.post(f'/api/bank/{bank.id}/score', json={}).status_code == 202
    assert client.post(f'/api/bank/{bank.id}/cancel', json={}).json['ok']
    assert job['cancelled']
    assert bank_queue.state_for(bank.id)['state'] == 'pending'


@pytest.mark.parametrize('operation,service,options', [
    ('scan', 'start_scan', {}), ('score', 'start_score', {}),
    ('caption', 'start_caption', {}), ('pipeline', 'start_pipeline', {'steps': ['scan']}),
])
def test_a_gpu_blocked_submission_runs_after_release(client, app, rows, monkeypatch,
                                                    operation, service, options):
    from bank_queue_assertions import assert_waiting_job

    _first, bank, _image = rows
    launched = []
    monkeypatch.setattr(banks, service, lambda *a, **kw: launched.append((a[2], kw)))
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: 'A training run holds the GPU')
    monkeypatch.setattr(bank_queue, '_drain', lambda _app: pytest.fail('blocked work must stay pending'))
    response = client.post(f'/api/bank/{bank.id}/{operation}', json=options)
    assert_waiting_job(client, bank.id, response)
    assert launched == []
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: None)
    assert bank_queue._process_next(app)
    assert len(launched) == 1 and launched[0][0] == bank.id
    assert BankQueueEntry.query.count() == 0


def test_queued_options_are_not_exposed_in_activity_or_queue_snapshots(app, client, rows):
    _first, bank, image = rows
    bank_queue.enqueue_operation(app, LOCAL_USER, bank.id, 'scan', {'ids': [image.id]})
    assert 'operation_payload' not in bank_queue.snapshot()['items'][0]
    assert 'image_instances' not in client.get(f'/api/bank/{bank.id}/activity').json['queue_state']


@pytest.mark.parametrize('path,options', [
    ('caption', {'ollama_model': False}), ('caption', {'ollama_model': 0}),
    ('caption', {'ollama_model': []}), ('caption', {'ollama_model': {}}),
    ('watermark/inpaint', {'method': 1}), ('watermark/inpaint', {'target': []}),
])
def test_invalid_saved_options_never_enter_the_queue(client, rows, path, options):
    _first, bank, _image = rows
    response = client.post(f'/api/bank/{bank.id}/{path}', json=options)
    assert response.status_code == 400, response.json
    assert bank_queue.state_for(bank.id) is None
    assert BankQueueEntry.query.count() == 0


def test_admission_during_worker_exit_restarts_the_lane(app, rows, monkeypatch):
    _first, bank, _image = rows
    restarted = []
    def final_drain(_app):
        # Model an admission immediately after the worker's last claim check.
        bank_queue.enqueue_operation(app, LOCAL_USER, bank.id, 'score', {})
    monkeypatch.setattr(bank_queue, '_drain', final_drain)
    # Production admissions do not recursively run the TESTING inline drain.
    monkeypatch.setitem(app.config, 'TESTING', False)
    monkeypatch.setattr(bank_queue._current, 'lane', 'local', raising=False)
    monkeypatch.setattr(bank_queue, '_ensure_worker', lambda _app: restarted.append(True))
    bank_queue._worker_loop(app, 'local')
    assert len(restarted) == 2  # Admission, then the exiting worker's handover.
    assert bank_queue.state_for(bank.id)['state'] == 'pending'
