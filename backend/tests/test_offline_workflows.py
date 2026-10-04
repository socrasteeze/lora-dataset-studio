"""The fork refuses hosted product APIs before network or data mutations."""
import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import socket

import pytest


def test_online_products_cannot_enter_the_curated_profile():
    from app.plugins import fork_profile
    online = {'api_engines', 'civitai_publish', 'cloud_training', 'hf_publish', 'scrape'}
    assert not (fork_profile.ENABLED & online)
    assert online <= fork_profile.EXCLUDED
    assert fork_profile.offline_only()


@pytest.mark.parametrize('distribution', ['fork', 'store', 'development'])
@pytest.mark.parametrize('bundled', [False, True])
def test_excluded_plugins_are_not_discovered(monkeypatch, tmp_path, distribution, bundled):
    from app.plugins import fork_profile, loader
    from app.plugins.registry import PluginRegistry
    monkeypatch.setenv('LDS_PLUGIN_DISTRIBUTION', distribution)
    for plugin_id in fork_profile.EXCLUDED:
        (tmp_path / plugin_id).mkdir()
        assert fork_profile.refuses_archive(plugin_id)
    monkeypatch.setattr(loader, 'load_manifest',
                        lambda *a, **kw: pytest.fail('an excluded plugin manifest was loaded'))
    registry = PluginRegistry()
    loader._discover(registry, tmp_path, bundled=bundled)
    assert not registry.records
    assert not registry.misplaced
    assert not registry.invalid


def test_civitai_service_refuses_before_http(monkeypatch):
    from app.services import civitai_browser
    monkeypatch.setattr(civitai_browser.requests, 'get',
                        lambda *a, **kw: pytest.fail('offline service attempted HTTP'))
    with pytest.raises(RuntimeError, match='offline'):
        civitai_browser._http_get_json('https://example.invalid/api', 'fake')


@pytest.mark.plugins('video')
def test_online_video_import_refuses_before_bank_mutation(client, app):
    from app.models import ImageBank
    with app.app_context():
        before = ImageBank.query.count()
    result = client.post('/api/video-bank/scrape-import', json={
        'name': 'Offline fixture', 'items': [{'url': 'https://example.invalid/clip.mp4'}],
    })
    assert result.status_code == 403
    with app.app_context():
        assert ImageBank.query.count() == before


@pytest.mark.plugins('video')
@pytest.mark.parametrize('suffix', ['scrape-import', 'import'])
def test_online_video_dataset_import_refuses_before_intake(client, monkeypatch, suffix):
    from lds_video import video_dataset_import as intake
    monkeypatch.setattr(intake, 'start',
                        lambda *a, **kw: pytest.fail('an online import reached dataset intake'))
    response = client.post(f'/api/video-dataset/999/{suffix}', json={
        'items': [{'url': 'https://example.invalid/clip.mp4', 'type': 'video'}],
    })
    assert response.status_code == 403


def test_online_video_intake_refuses_before_dataset_lookup(monkeypatch):
    from lds_video import video_dataset_import as intake
    monkeypatch.setattr(intake, '_require_dataset',
                        lambda *a, **kw: pytest.fail('an online import reached dataset lookup'))
    with pytest.raises(ValueError, match='offline'):
        intake.start(None, 'local', 999, items=[{'url': 'https://example.invalid/clip.mp4'}])


def test_public_media_helpers_refuse_without_starting_downloads(monkeypatch, tmp_path):
    from app.scrape import netfetch
    monkeypatch.setattr(netfetch.subprocess, 'run',
                        lambda *a, **kw: pytest.fail('offline helper started a downloader'))
    destination = tmp_path / 'absent' / 'video'
    ok, filename, reason = netfetch.download_via_ytdlp('https://example.invalid/clip', str(destination))
    assert not ok and filename is None and 'offline' in reason
    assert not destination.parent.exists()
    assert netfetch.fetch_hardened_bytes('https://example.invalid/image',
                                       allowed_types=('image/jpeg',), max_bytes=1024)[-1] == 'offline'


def test_inference_environment_is_offline_without_editing_the_host():
    from app.services import infer_env
    before = dict(os.environ)
    env = infer_env.worker_env(HF_HUB_OFFLINE='0', TRANSFORMERS_OFFLINE='0')
    assert env['HF_HUB_OFFLINE'] == '1'
    assert env['HF_DATASETS_OFFLINE'] == '1'
    assert env['TRANSFORMERS_OFFLINE'] == '1'
    assert env['HF_HUB_DISABLE_TELEMETRY'] == '1'
    assert Path(env['LDS_INFER_OFFLINE_HELPER']).is_file()
    assert dict(os.environ) == before


def _guard():
    path = Path(__file__).resolve().parents[1] / 'infer' / 'offline_network.py'
    spec = importlib.util.spec_from_file_location('offline_network_fixture', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_inference_socket_guard_blocks_public_connections():
    guard = _guard()
    sock = SimpleNamespace(family=socket.AF_INET)
    guard.inference_audit('socket.connect', (sock, ('127.0.0.1', 8188)))
    guard.inference_audit('socket.connect', (sock, ('100.64.0.1', 8188)))
    with pytest.raises(OSError, match='offline'):
        guard.inference_audit('socket.connect', (sock, ('8.8.8.8', 443)))
    with pytest.raises(OSError, match='offline'):
        guard.inference_audit('socket.getaddrinfo', ('example.com', 443, 0, 0, 0))


def test_local_api_scope_refuses_public_or_mixed_dns(monkeypatch):
    from app.utils.local_api import local_api_url
    assert local_api_url('http://127.0.0.1:8188') == 'http://127.0.0.1:8188'
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **kw: [
        (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 8188)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('8.8.8.8', 8188)),
    ])
    with pytest.raises(ValueError, match='Online API'):
        local_api_url('http://fixture.example:8188')


def test_public_peer_join_refuses_before_http(client, monkeypatch):
    from app.routes import cluster
    import requests
    monkeypatch.setattr(cluster.cluster_svc, 'local_capabilities',
                        lambda: pytest.fail('a public join reached local capability collection'))
    monkeypatch.setattr(requests, 'post',
                        lambda *a, **kw: pytest.fail('a public join sent its token'))
    response = client.post('/api/cluster/peer/connect', json={
        'primary_url': 'http://8.8.8.8:5050', 'token': 'synthetic-join-token',
    })
    assert response.status_code == 400
    assert 'Online API' in response.get_json()['error']


def test_refused_comfyui_target_preserves_failure_results(monkeypatch, tmp_path):
    from app.utils import comfyui
    endpoint = 'http://8.8.8.8:8188'
    def unexpected(*args, **kwargs):
        pytest.fail('a refused ComfyUI target reached HTTP')
    monkeypatch.setattr(comfyui.requests, 'get', unexpected)
    monkeypatch.setattr(comfyui.requests, 'post', unexpected)
    prompt_id, error = comfyui.queue_prompt_to_comfyui({'1': {}}, 'fixture', endpoint)
    assert prompt_id is None and 'Online API' in error
    probe = comfyui.get_comfyui_history_probe('fixture', endpoint)
    assert probe.health is comfyui.ComfyHistoryHealth.UNHEALTHY
    assert comfyui.cancel_comfyui_prompt_state('fixture', 'client', endpoint) is comfyui.ComfyPromptState.UNKNOWN
    assert comfyui.interrupt_own_prompt('fixture', 'client', endpoint) == 'unknown'
    assert comfyui.fetch_node_info('FixtureNode', worker_url=endpoint) is None
    with pytest.raises(RuntimeError, match='Online API'):
        comfyui.upload_input_image_to_worker('fixture.png', str(tmp_path / 'absent.png'), endpoint)
