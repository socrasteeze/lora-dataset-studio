"""Bank controls must not wait for image statistics or ML runtime probes."""
import pytest

from test_bank_payload_poll_cost import _bank, _count_image_queries


def test_workspace_controls_do_not_read_images_walk_sources_or_probe_runtime(client, tmp_path, app, monkeypatch):
    from app.extensions import db
    from app.services import image_bank_service as banks

    bank_id, _ = _bank(client, tmp_path, count=3)

    def forbidden(*args, **kwargs):
        pytest.fail('control metadata waited for statistics, source I/O or runtime readiness')

    for name in ('bank_payload', 'refresh_bank', '_bp_counts',
                 '_semantic_eligible_paths', 'score_device_info', 'bank_dataset_conflict'):
        monkeypatch.setattr(banks, name, forbidden)
    with app.app_context():
        response, image_queries = _count_image_queries(
            db.engine, lambda: client.get(f'/api/bank/{bank_id}/workspace'))
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['id'] == bank_id
    assert payload['name'] == 'Poll cost'
    assert payload['source_path']
    assert 'activity' in payload and 'queue_state' in payload
    assert 'thresholds' in payload and 'undo' in payload
    assert 'counts' not in payload and 'score_device' not in payload
    assert image_queries == 0


def test_statistics_can_load_without_the_scoring_runtime(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks

    bank_id, _ = _bank(client, tmp_path, count=2)
    monkeypatch.setattr(banks, 'score_device_info', lambda *args: pytest.fail(
        'the background statistics waited for the scoring runtime'))
    response = client.get(f'/api/bank/{bank_id}?sync=0&runtime=0')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['counts']['total'] == 2
    assert 'flags' in payload and 'pass_scopes' in payload and 'semantic' in payload
    assert 'score_device' not in payload


def test_legacy_payload_and_separate_runtime_keep_their_device_contract(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks

    bank_id, _ = _bank(client, tmp_path, count=1)
    device = {'device': 'cpu', 'gpu': False, 'gpu_present': True, 'eta_minutes': 1}
    monkeypatch.setattr(banks, 'score_device_info', lambda bank_id: device)
    legacy = client.get(f'/api/bank/{bank_id}?sync=0')
    runtime = client.get(f'/api/bank/{bank_id}/score-device')
    assert legacy.status_code == runtime.status_code == 200
    assert legacy.get_json()['score_device'] == runtime.get_json()['score_device'] == device
    assert runtime.get_json()['id'] == bank_id


@pytest.mark.parametrize('endpoint', ['workspace', 'score-device'])
def test_independent_reads_refuse_missing_banks_before_runtime_probe(client, monkeypatch, endpoint):
    from app.services import image_bank_service as banks

    monkeypatch.setattr(banks, 'score_device_info', lambda *args: pytest.fail('missing bank probed a runtime'))
    assert client.get(f'/api/bank/999999/{endpoint}').status_code == 404
