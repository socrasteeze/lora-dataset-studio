"""Core model downloads and prompt browsing retain their shared credentials."""
from test_public_backend_mount import factory  # noqa: F401
from app import config as cfg


def test_core_can_manage_shared_credentials_without_products(factory, monkeypatch):
    app = factory()
    monkeypatch.setattr('app.routes.settings._lan_ip', lambda: None)
    monkeypatch.setattr('app.routes.settings._tailscale_ip', lambda: None)
    client = app.test_client()
    for key in ('HF_TOKEN', 'CIVITAI_API_KEY'):
        before = client.get('/api/settings').json['secrets']
        assert before[key] is False
        response = client.put('/api/settings', json={'secrets': {key: 'fixture-credential'}})
        assert response.status_code == 200, response.json
        assert response.json['secrets'][key] is True
        assert 'fixture-credential' not in response.get_data(as_text=True)
        assert cfg.secret(key) == 'fixture-credential'
        assert client.delete(f'/api/settings/secret/{key}').status_code == 200
        assert not cfg.secret(key)
