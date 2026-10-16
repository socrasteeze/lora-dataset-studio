"""Assert the public and durable outcomes of synthetic workspace submissions."""
import json

from app.models import BankQueueEntry
from app.services import bank_jobs


def assert_queued_state(client, bank_id, response, state):
    assert response.status_code == 202, response.get_json()
    assert response.json['ok'] and response.json['queued']
    snapshot = client.get(f'/api/bank/{bank_id}/activity').json['queue_state']
    assert snapshot['state'] == state, snapshot
    assert snapshot['operation'] == response.json['operation']
    assert not bank_jobs.running(bank_id)
    with client.application.app_context():
        stored = BankQueueEntry.query.filter_by(bank_id=bank_id).one()
        assert stored.operation == snapshot['operation']
        error = json.loads(stored.operation_payload).get('error')
    if state == 'failed':
        assert error and error == snapshot['error']
        return error
    assert state == 'pending' and not error
    return snapshot


def assert_failed_job(client, bank_id, response):
    return assert_queued_state(client, bank_id, response, 'failed')


def assert_waiting_job(client, bank_id, response):
    return assert_queued_state(client, bank_id, response, 'pending')
