"""Bulk Bank management keeps each selected Bank identity-bound and isolated."""
import pytest
from PIL import Image

from app.extensions import db
from app.models import ImageBank
from app.services import bank_jobs, bank_queue
from app.services import image_bank_service as banks


def _create(client, tmp_path, name):
    src = tmp_path / name
    src.mkdir()
    Image.new('RGB', (24, 24), (40, 80, 120)).save(src / 'source.jpg')
    response = client.post('/api/bank/create',
                           json={'name': name, 'folder': str(src)})
    assert response.status_code == 200
    bank_id = response.get_json()['id']
    row = next(row for row in client.get('/api/banks').get_json()['banks']
               if row['id'] == bank_id)
    return row, src


def _ref(row, **updates):
    item = {'id': row['id'], 'instance_id': row['instance_id']}
    item.update(updates)
    return item


def test_bulk_edit_applies_each_item_and_both_fields_together(client, tmp_path):
    first, _ = _create(client, tmp_path, 'first')
    second, _ = _create(client, tmp_path, 'second')

    response = client.post('/api/banks/bulk-edit', json={'banks': [
        _ref(first, name='  Renamed  ', keep_separate=True),
        _ref(second, keep_separate=True),
    ]})

    assert response.status_code == 200
    body = response.get_json()
    assert body['succeeded'] == 2
    assert body['failed'] == 0
    assert body['results'] == [
        {'id': first['id'], 'instance_id': first['instance_id'], 'ok': True,
         'name': 'Renamed', 'keep_separate': True},
        {'id': second['id'], 'instance_id': second['instance_id'], 'ok': True,
         'name': 'second', 'keep_separate': True},
    ]


def test_bulk_edit_reports_busy_queued_stale_foreign_and_missing(
        client, app, tmp_path, monkeypatch):
    busy, _ = _create(client, tmp_path, 'busy-edit')
    queued, _ = _create(client, tmp_path, 'queued-edit')
    stale, _ = _create(client, tmp_path, 'stale-edit')
    with app.app_context():
        foreign_src = tmp_path / 'foreign-edit'
        foreign_src.mkdir()
        foreign = ImageBank(user_id='somebody-else', name='foreign',
                            source_path=str(foreign_src))
        db.session.add(foreign)
        db.session.commit()
        foreign_ref = {'id': foreign.id, 'instance_id': foreign.instance_id,
                       'name': 'must-not-change'}
    bank_jobs._jobs[busy['id']] = {
        'kind': 'faces', 'done': 0, 'total': 1, 'error': None,
        'cancelled': False, 'finished': False, 'detail': None,
        'started_at': 0, '_touched': __import__('time').time(),
        '_cancel_hook': None,
    }
    real_state_for = bank_queue.state_for
    monkeypatch.setattr(
        bank_queue, 'state_for',
        lambda bank_id: ({'state': 'pending', 'position': 1}
                         if bank_id == queued['id'] else real_state_for(bank_id)))

    response = client.post('/api/banks/bulk-edit', json={'banks': [
        _ref(busy, name='busy-changed'),
        _ref(queued, keep_separate=True),
        {'id': stale['id'], 'instance_id': 'stale', 'name': 'stale-changed'},
        foreign_ref,
        {'id': 987654321, 'instance_id': 'missing', 'name': 'missing'},
    ]})

    body = response.get_json()
    assert response.status_code == 200
    assert body['succeeded'] == 0
    assert [row['status'] for row in body['results']] == [409, 409, 409, 404, 404]
    assert body['results'][0]['busy_kind'] == 'faces'
    assert body['results'][1]['busy_kind'] == 'queue'
    listed = {row['id']: row for row in client.get('/api/banks').get_json()['banks']}
    assert listed[busy['id']]['name'] == 'busy-edit'
    assert listed[queued['id']]['keep_separate'] is False
    assert listed[stale['id']]['name'] == 'stale-edit'


def test_bulk_delete_reports_partial_failures_and_preserves_sources(
        client, app, tmp_path, monkeypatch):
    deleted, deleted_src = _create(client, tmp_path, 'deleted')
    busy, busy_src = _create(client, tmp_path, 'busy')
    queued, queued_src = _create(client, tmp_path, 'queued')
    stale, stale_src = _create(client, tmp_path, 'stale')
    with app.app_context():
        foreign_src = tmp_path / 'foreign'
        foreign_src.mkdir()
        foreign = ImageBank(user_id='somebody-else', name='foreign',
                            source_path=str(foreign_src))
        db.session.add(foreign)
        db.session.commit()
        foreign_ref = {'id': foreign.id, 'instance_id': foreign.instance_id}

    bank_jobs._jobs[busy['id']] = {
        'kind': 'scan', 'done': 0, 'total': 1, 'error': None,
        'cancelled': False, 'finished': False, 'detail': None,
        'started_at': 0, '_touched': __import__('time').time(),
        '_cancel_hook': None,
    }
    real_state_for = bank_queue.state_for
    monkeypatch.setattr(
        bank_queue, 'state_for',
        lambda bank_id: ({'state': 'pending', 'position': 1}
                         if bank_id == queued['id'] else real_state_for(bank_id)))

    response = client.post('/api/banks/bulk-delete', json={'banks': [
        _ref(deleted), _ref(busy), _ref(queued),
        {'id': stale['id'], 'instance_id': 'reused-id-guard'},
        foreign_ref, {'id': 987654321, 'instance_id': 'missing'},
    ]})

    assert response.status_code == 200
    body = response.get_json()
    assert body['succeeded'] == 1
    assert body['failed'] == 5
    assert [row.get('status') for row in body['results']] == [None, 409, 409,
                                                              409, 404, 404]
    assert body['results'][1]['busy_kind'] == 'scan'
    assert body['results'][2]['busy_kind'] == 'queue'
    assert 'stale' in body['results'][3]['error']
    assert body['results'][4]['error'] == 'not found'
    assert body['results'][5]['error'] == 'not found'
    assert (deleted_src / 'source.jpg').is_file()
    assert (busy_src / 'source.jpg').is_file()
    assert (queued_src / 'source.jpg').is_file()
    assert (stale_src / 'source.jpg').is_file()
    with app.app_context():
        assert banks.get_bank('local', deleted['id']) is None
        assert banks.get_bank('local', busy['id']) is not None
        assert banks.get_bank('local', queued['id']) is not None
        assert banks.get_bank('local', stale['id']) is not None


@pytest.mark.parametrize('payload', [
    None,
    [],
    {},
    {'banks': []},
    {'banks': [{'id': True, 'instance_id': 'token', 'name': 'changed'}]},
    {'banks': [{'id': 1, 'instance_id': '', 'name': 'changed'}]},
    {'banks': [{'id': 1, 'instance_id': 'x' * 129, 'name': 'changed'}]},
    {'banks': [{'id': 1, 'instance_id': 'token', 'keep_separate': 'true'}]},
    {'banks': [{'id': 1, 'instance_id': 'token'}]},
    {'banks': [
        {'id': 1, 'instance_id': 'token', 'name': 'changed'},
        {'id': 1, 'instance_id': 'token-2', 'name': 'changed-again'},
    ]},
])
def test_invalid_bulk_edit_never_mutates(client, tmp_path, payload):
    row, _ = _create(client, tmp_path, 'unchanged')
    if isinstance(payload, dict) and payload.get('banks'):
        for item in payload['banks']:
            if (isinstance(item, dict)
                    and not isinstance(item.get('id'), bool)
                    and item.get('id') == 1):
                item['id'] = row['id']

    response = client.post('/api/banks/bulk-edit', json=payload)

    assert response.status_code == 400
    current = next(item for item in client.get('/api/banks').get_json()['banks']
                   if item['id'] == row['id'])
    assert current['name'] == 'unchanged'
    assert current['keep_separate'] is False


def test_oversized_delete_batch_is_rejected_before_mutation(client, tmp_path):
    row, _ = _create(client, tmp_path, 'kept')
    items = [_ref(row)] + [
        {'id': index + 1000, 'instance_id': f'token-{index}'}
        for index in range(500)
    ]

    response = client.post('/api/banks/bulk-delete', json={'banks': items})

    assert response.status_code == 400
    assert client.get(f"/api/bank/{row['id']}").status_code == 200


def test_late_invalid_edit_rejects_the_whole_batch_before_mutation(client, tmp_path):
    first, _ = _create(client, tmp_path, 'first-unchanged')
    second, _ = _create(client, tmp_path, 'second-unchanged')

    response = client.post('/api/banks/bulk-edit', json={'banks': [
        _ref(first, name='would-change', keep_separate=True),
        _ref(second, name='x' * (banks.BANK_NAME_MAX + 1)),
    ]})

    assert response.status_code == 400
    listed = {row['id']: row for row in client.get('/api/banks').get_json()['banks']}
    assert listed[first['id']]['name'] == 'first-unchanged'
    assert listed[first['id']]['keep_separate'] is False


def test_failed_atomic_edit_rolls_back_both_fields_and_continues(
        client, tmp_path, monkeypatch):
    failed, _ = _create(client, tmp_path, 'failed-edit')
    later, _ = _create(client, tmp_path, 'later-edit')
    real_write = banks.write_with_retry
    calls = 0

    def fail_after_assignment(fn, *args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            fn()
            raise RuntimeError('forced transaction failure')
        return real_write(fn, *args, **kwargs)

    monkeypatch.setattr(banks, 'write_with_retry', fail_after_assignment)
    response = client.post('/api/banks/bulk-edit', json={'banks': [
        _ref(failed, name='must-roll-back', keep_separate=True),
        _ref(later, name='did-progress', keep_separate=True),
    ]})

    body = response.get_json()
    assert body['succeeded'] == 1
    assert body['failed'] == 1
    assert body['results'][0]['status'] == 500
    listed = {row['id']: row for row in client.get('/api/banks').get_json()['banks']}
    assert listed[failed['id']]['name'] == 'failed-edit'
    assert listed[failed['id']]['keep_separate'] is False
    assert listed[later['id']]['name'] == 'did-progress'
    assert listed[later['id']]['keep_separate'] is True


def test_bulk_delete_sends_an_app_managed_source_to_trash(
        client, app, monkeypatch):
    sent = []
    with app.app_context():
        source = banks.cfg.bank_sources_root() / 'bulk-delete-owned'
        source.mkdir(parents=True)
        Image.new('RGB', (24, 24), (10, 20, 30)).save(source / 'copy.jpg')
        bank = ImageBank(user_id='local', name='owned-copy', source_path=str(source))
        db.session.add(bank)
        db.session.commit()
        item = {'id': bank.id, 'instance_id': bank.instance_id}
    monkeypatch.setattr(
        banks.trash, 'send_to_trash',
        lambda path, **_kwargs: sent.append(path))

    response = client.post('/api/banks/bulk-delete', json={'banks': [item]})

    assert response.get_json()['succeeded'] == 1
    assert sent == [str(source)]


def test_bulk_delete_continues_after_an_unexpected_item_failure(
        client, tmp_path, monkeypatch):
    first, first_src = _create(client, tmp_path, 'first-delete')
    failed, failed_src = _create(client, tmp_path, 'failed-delete')
    last, last_src = _create(client, tmp_path, 'last-delete')
    real_delete = banks.delete_bank

    def fail_one(user_id, bank_id, **kwargs):
        if bank_id == failed['id']:
            raise RuntimeError('private-path-must-not-leak')
        return real_delete(user_id, bank_id, **kwargs)

    monkeypatch.setattr(banks, 'delete_bank', fail_one)
    response = client.post('/api/banks/bulk-delete', json={'banks': [
        _ref(first), _ref(failed), _ref(last),
    ]})

    assert response.status_code == 200
    body = response.get_json()
    assert body['succeeded'] == 2
    assert body['failed'] == 1
    assert body['results'][1]['status'] == 500
    assert body['results'][1]['error'] == 'operation failed'
    assert 'private-path' not in response.get_data(as_text=True)
    assert (first_src / 'source.jpg').is_file()
    assert (failed_src / 'source.jpg').is_file()
    assert (last_src / 'source.jpg').is_file()
