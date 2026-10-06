"""Civitai browsing stays refused. The route returns before any upstream call."""


def test_route_refuses_online_browsing(client):
    response = client.get('/api/studio/civitai/images?period=month&sort=newest'
                          '&level=x&want=6&require_prompt=0&cursor=abc&skip=4')
    assert response.status_code == 403
    body = response.get_json()
    assert body['ok'] is False and 'offline' in body['error']


def test_route_never_attempts_an_upstream_call(client):
    response = client.get('/api/studio/civitai/images')
    assert response.status_code == 403
    assert 'Civitai' in response.get_json()['error']


def test_route_is_offline_even_with_bad_browser_params(client):
    response = client.get('/api/studio/civitai/images?period=fortnight')
    assert response.status_code == 403
