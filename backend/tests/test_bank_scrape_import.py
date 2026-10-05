"""Online image imports stay refused. Local folder import is a different route."""
import pytest

from app.services import face_dataset_service as datasets
from app.services import image_bank_service as banks


def test_bank_route_refuses_online_import(client):
    response = client.post('/api/bank/scrape-import', json={
        'name': 'offline', 'items': [{'url': 'https://example.invalid/a.jpg'}]})
    assert response.status_code == 403
    assert 'offline' in response.get_json()['error']


def test_dataset_route_refuses_online_import(client):
    response = client.post('/api/dataset/1/scrape-import', json={
        'items': [{'url': 'https://example.invalid/a.jpg'}]})
    assert response.status_code == 403
    assert 'offline' in response.get_json()['error']


def test_services_refuse_before_downloading():
    item = [{'url': 'https://example.invalid/a.jpg'}]
    with pytest.raises(ValueError, match='offline'):
        banks.scrape_import_to_bank('local', item, name='offline')
    with pytest.raises(ValueError, match='offline'):
        datasets.scrape_import_urls('local', 1, item)
