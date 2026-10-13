"""Guards that keep a local install from following a URL it did not check."""
import pytest


def test_metadata_address_is_not_a_local_api():
    from app.utils.local_api import local_api_url
    with pytest.raises(ValueError, match='Online API'):
        local_api_url('http://169.254.169.254/')
    with pytest.raises(ValueError, match='Online API'):
        local_api_url('http://[::ffff:169.254.169.254]/')
    assert local_api_url('http://169.254.1.1/') == 'http://169.254.1.1/'
    assert local_api_url('http://100.64.0.1:8188') == 'http://100.64.0.1:8188'


def test_probe_backend_does_not_follow_redirects(monkeypatch):
    import requests
    from app.services import cluster

    seen = {}

    class Response:
        status_code = 302

    def fake_get(url, timeout=None, allow_redirects=True):
        seen['url'] = url
        seen['allow_redirects'] = allow_redirects
        return Response()

    monkeypatch.setattr(requests, 'get', fake_get)
    assert cluster.probe_backend('http://127.0.0.1:8188', fresh=True) is False
    assert seen['allow_redirects'] is False
    assert seen['url'].startswith('http://127.0.0.1:8188/')


def test_output_image_fetch_does_not_follow_redirects(monkeypatch):
    import requests
    from app.utils import comfyui

    class Response:
        status_code = 302
        content = b'not-the-image'

        def raise_for_status(self):
            return None

    seen = {}

    def fake_get(url, timeout=None, allow_redirects=True):
        seen['allow_redirects'] = allow_redirects
        return Response()

    monkeypatch.setattr(comfyui, 'comfyui_ignored', lambda: False)
    monkeypatch.setattr(comfyui, 'api_address', lambda: 'http://127.0.0.1:8188')
    monkeypatch.setattr(requests, 'get', fake_get)
    assert comfyui.fetch_output_image_bytes('shot.png') is None
    assert seen['allow_redirects'] is False


def test_gallery_dl_offline_does_not_spawn(monkeypatch):
    from app.scrape.sources import gdl

    def fail(*args, **kwargs):
        raise AssertionError('gallery-dl was started')

    monkeypatch.setattr(gdl.subprocess, 'run', fail)
    entries, err = gdl._run_simulate('https://example.invalid/a', 1, None, None)
    assert entries is None
    assert 'offline' in str(err)
    ok, path, err = gdl.download('https://example.invalid/a', '/tmp', 'clip')
    assert ok is False and path is None
    assert 'offline' in str(err)
