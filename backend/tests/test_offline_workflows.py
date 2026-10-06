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


def test_civitai_service_refuses_before_http():
    from app.services import civitai_browser
    with pytest.raises(RuntimeError, match='offline'):
        civitai_browser._http_get_json('https://example.invalid/api', 'fake')


def test_settings_key_tests_do_not_call_public_hosts(client, monkeypatch):
    """A stored rental or cloud token is answered locally. The probe must not open a socket."""
    from app import capabilities
    from app.services import cloud_training
    import requests
    monkeypatch.setenv('VAST_API_KEY', 'synthetic-rental-key')
    monkeypatch.setenv('HF_CLOUD_TOKEN', 'hf_synthetic_token')

    def unexpected(*args, **kwargs):
        pytest.fail('a settings key test reached HTTP')

    monkeypatch.setattr(requests, 'get', unexpected)
    monkeypatch.setattr(requests, 'post', unexpected)
    monkeypatch.setattr(capabilities.requests, 'get', unexpected)
    monkeypatch.setattr(cloud_training, 'full_transformer_token_status', unexpected)
    monkeypatch.setattr(cloud_training, '_validate_full_transformer_token', unexpected)
    monkeypatch.setattr(cloud_training, '_make_hf_api', unexpected)
    rental = client.post('/api/settings/test/vast')
    cloud = client.post('/api/settings/test/hf_cloud')
    saved = client.put('/api/settings', json={
        'secrets': {'HF_CLOUD_TOKEN': 'hf_synthetic_cloud_token'},
    })
    assert rental.status_code == 200
    assert rental.get_json()['ok'] is False
    assert 'offline' in rental.get_json()['detail']
    assert cloud.status_code == 200
    body = cloud.get_json()
    assert body['ok'] is False
    assert 'removed' in body['detail']
    assert saved.status_code == 400
    saved_body = saved.get_json()
    assert 'removed' in saved_body['error']
    assert saved_body['secret_checks']['HF_CLOUD_TOKEN']['ok'] is False
    assert 'console.vast.ai' not in Path(capabilities.__file__).read_text(encoding='utf-8')


def test_preflight_and_token_validator_do_not_call_huggingface(client, app, monkeypatch):
    """Dense preflight and the cloud token validator stop before Hugging Face."""
    from lds_sdk import cloud_training as sdk_cloud
    from app import config as cfg
    from app.services import cloud_training, lora_training as lt
    monkeypatch.setattr(sdk_cloud, 'full_transformer_token_preflight',
                        lambda *a, **k: pytest.fail('preflight called the cloud product'))
    monkeypatch.setattr(cloud_training, '_make_hf_api',
                        lambda *a, **k: pytest.fail('the token validator built an HfApi'))
    created = client.post('/api/dataset/create', json={
        'name': 'Local fixture', 'trigger_word': 'localfix',
    })
    assert created.status_code == 200
    dataset_id = created.get_json()['id']
    with app.app_context():
        report = lt.training_preflight(
            cfg.LOCAL_USER, dataset_id, training_mode='full_transformer')
    assert any('removed' in item for item in report['blockers'])
    token_check = next(row for row in report['checks'] if row['id'] == 'hf_cloud_token')
    assert token_check['status'] == 'fail'
    assert 'removed' in token_check['detail']
    status = cloud_training.full_transformer_token_status('hf_synthetic_cloud_token')
    assert status['ok'] is False
    assert 'removed' in status['error']
    with pytest.raises(ValueError, match='removed'):
        cloud_training._validate_full_transformer_token('hf_synthetic_cloud_token')


def test_hosted_clients_and_rental_imports_refuse():
    """Hugging Face clients and the rental product are not imported."""
    from lds_sdk import cloud_training as sdk_cloud
    from lds_sdk import _cloud_provider
    from app.services import cloud_training, hf_publish, training_state_identity
    from app.services.hf_publish import HfPublishError

    with pytest.raises(RuntimeError, match='removed'):
        cloud_training._make_hf_api('hf_synthetic')
    with pytest.raises(RuntimeError, match='removed'):
        cloud_training._create_full_transformer_repo(None, 'hf_synthetic')
    with pytest.raises(RuntimeError, match='removed'):
        sdk_cloud._active_product()
    video_sdk = Path(__file__).resolve().parents[1] / 'lds_sdk' / 'video_host' / 'cloud_video_training.py'
    video_text = video_sdk.read_text(encoding='utf-8')
    assert 'Cloud training was removed from this install.' in video_text
    assert 'from lds_cloud_training import' not in video_text
    with pytest.raises(RuntimeError, match='removed'):
        _cloud_provider.provider()
    preflight = sdk_cloud.full_transformer_token_preflight()
    assert preflight['ok'] is False
    assert 'removed' in preflight['error']
    with pytest.raises(HfPublishError, match='removed'):
        hf_publish.publish_to_hf(1, 'fixture/repo', True, True, 'mit', False, 'hf_synthetic')
    with pytest.raises(training_state_identity.TrainingStateIdentityError, match='removed'):
        training_state_identity._resolve_hf_commit('fixture/repo', token='hf_synthetic')
    cloud_text = Path(cloud_training.__file__).read_text(encoding='utf-8')
    assert 'Cloud training was removed from this install.' in cloud_text
    assert 'urlopen' not in cloud_text
    assert 'huggingface.co' not in cloud_text
    assert 'krea.ai' not in cloud_text
    assert 'from lds_cloud_training import' not in Path(sdk_cloud.__file__).read_text(encoding='utf-8')


def test_cloud_launch_route_refuses_before_rental(client, monkeypatch):
    from app.services import cloud_training
    monkeypatch.setattr(cloud_training.vast_client, 'search_offers',
                        lambda **kw: pytest.fail('cloud launch searched for a rental'))
    monkeypatch.setattr(cloud_training.vast_client, 'create_instance',
                        lambda *a, **kw: pytest.fail('cloud launch rented a machine'))
    response = client.post('/api/dataset/1/train/cloud', json={'steps': 100})
    assert response.status_code == 403
    assert 'removed' in response.get_json()['error']


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


def test_scrape_scan_and_thumb_are_not_mounted(client, app, monkeypatch):
    """The scrape plugin is not installed, so the app has no scan route.

    The handler module still refuses before it resolves a source, in case a
    later import calls it directly.
    """
    from app.routes import scrape as scrape_routes
    from app.scrape.sources import registry
    monkeypatch.setattr(registry, 'resolve',
                        lambda *a, **k: pytest.fail('a scan resolved an online source'))
    assert client.post('/api/scrape/scan', json={'url': 'https://example.invalid/page'}).status_code == 404
    assert client.get('/api/scrape/thumb', query_string={
        'url': 'https://example.invalid/thumb.jpg'}).status_code == 404
    with app.test_request_context('/api/scrape/scan', method='POST',
                                  json={'url': 'https://example.invalid/page'}):
        body, status = scrape_routes.scrape_scan()
    assert status == 403 and 'offline' in body.get_json()['error']
    with app.test_request_context('/api/scrape/thumb?url=https://example.invalid/thumb.jpg'):
        body, status = scrape_routes.scrape_thumb()
    assert status == 403 and 'offline' in body.get_json()['error']


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


def test_local_files_runs_and_private_peers_stay_local(client, app, monkeypatch, tmp_path):
    """Dataset, bank, checkpoints, runs, and gallery read this machine's files.

    A private peer address still passes the same gate that refuses a public one.
    A localhost tool test still calls that localhost address.
    """
    import requests
    from PIL import Image
    from app import capabilities, config as cfg
    from app.extensions import db
    from app.models import CloudTrainingRun, LoraTestImage, TrainingRunRecord
    from app.routes import cluster
    from app.services import cloud_training as ct
    from app.services import lora_training as lt
    from app.utils.local_api import local_api_url

    def unexpected(*args, **kwargs):
        pytest.fail('a local file path opened a public socket')

    monkeypatch.setattr(requests, 'get', unexpected)
    monkeypatch.setattr(requests, 'post', unexpected)
    monkeypatch.setattr(lt, '_lt_spawn_transaction', unexpected)

    created = client.post('/api/dataset/create', json={
        'name': 'Local fixture', 'trigger_word': 'localfix',
    })
    assert created.status_code == 200
    dataset_id = created.get_json()['id']
    listed = client.get('/api/dataset/list').get_json()['datasets']
    storage = Path(next(row['storage_path'] for row in listed if row['id'] == dataset_id))
    root = cfg.dataset_images_root().resolve()
    assert storage.is_absolute()
    assert storage.resolve().is_relative_to(root)

    source = tmp_path / 'photos'
    source.mkdir()
    Image.new('RGB', (32, 32), (20, 40, 60)).save(source / 'shot.png')
    imported = client.post(f'/api/dataset/{dataset_id}/import-folder', json={'path': str(source)})
    assert imported.status_code == 200
    assert imported.get_json()['imported'] == 1
    copied = list(storage.glob('*.png'))
    assert len(copied) == 1
    assert copied[0].is_file()
    assert copied[0].resolve().is_relative_to(root)

    bank_dir = tmp_path / 'bank'
    bank_dir.mkdir()
    Image.new('RGB', (16, 16), (1, 2, 3)).save(bank_dir / 'ref.png')
    made = client.post('/api/bank/create', json={'name': 'Local bank', 'folder': str(bank_dir)})
    assert made.status_code == 200
    banks = client.get('/api/banks').get_json()['banks']
    bank = next(row for row in banks if row['id'] == made.get_json()['id'])
    assert Path(bank['source_path']).resolve() == bank_dir.resolve()
    assert bank['total'] == 1
    assert (bank_dir / 'ref.png').is_file()

    trained = client.post(f'/api/dataset/{dataset_id}/train', json={'steps': 10})
    assert trained.status_code == 409
    assert 'ai-toolkit' in trained.get_json()['error']

    toolkit = tmp_path / 'toolkit'
    cfg.save_config({'aitoolkit': {'dir': str(toolkit), 'output_dir': str(toolkit / 'output')}})
    marker = b'local-checkpoint-bytes'
    with app.app_context():
        run_dir = Path(lt._run_dir(cfg.LOCAL_USER, dataset_id))
        run_dir.mkdir(parents=True)
        (run_dir / 'localfix_0100.safetensors').write_bytes(marker)
    downloaded = client.get(
        f'/api/dataset/{dataset_id}/train/checkpoint/file?filename=localfix_0100.safetensors')
    assert downloaded.status_code == 200
    assert downloaded.data == marker
    with app.app_context():
        served = Path(lt.checkpoint_file_path(
            cfg.LOCAL_USER, dataset_id, 'localfix_0100.safetensors'))
    assert served.resolve() == (run_dir / 'localfix_0100.safetensors').resolve()
    assert served.resolve().is_relative_to((toolkit / 'output').resolve())

    with app.app_context():
        record = TrainingRunRecord(
            dataset_id=dataset_id, family='sdxl', source='local',
            fingerprint='local0000000001', version=1, steps=10)
        db.session.add(record)
        db.session.flush()
        image_name = 'local-render.png'
        Image.new('RGB', (8, 8), (9, 9, 9)).save(storage / image_name)
        db.session.add(LoraTestImage(
            dataset_id=dataset_id, checkpoint='localfix_0100.safetensors',
            strength=1.0, filename=image_name, status='done', record_id=record.id, step=100))
        stored = CloudTrainingRun(dataset_id=dataset_id, status='done', train_params='{}')
        db.session.add(stored)
        db.session.flush()
        store = Path(ct.checkpoint_store_dir(stored, create=True))
        (store / 'kept_0100.safetensors').write_bytes(b'stored-locally')
        record_id, stored_id = record.id, stored.id
        db.session.commit()
    assert store.resolve().is_relative_to(cfg.checkpoints_root(create=False).resolve())
    kept = client.get(
        f'/api/dataset/{dataset_id}/train/cloud/checkpoint?run_id={stored_id}&filename=kept_0100.safetensors')
    assert kept.status_code == 200
    assert kept.data == b'stored-locally'
    runs = client.get('/api/dataset/train/cloud/runs').get_json()
    row = next(item for item in runs['recent'] if item['record_id'] == record_id)
    assert row['source'] == 'local'
    assert row['dataset_id'] == dataset_id
    gallery = client.get(f'/api/train/run/{record_id}/images').get_json()
    assert gallery['count'] == 1
    image_id = gallery['groups'][0]['images'][0]['id']
    rendered = client.get(f'/api/train/image/{image_id}/download')
    assert rendered.status_code == 200
    assert rendered.data == (storage / image_name).read_bytes()

    for address in (
        'http://127.0.0.1:8188',
        'http://localhost:8188',
        'http://192.168.1.40:5050',
        'http://10.1.2.3:7860',
        'http://100.64.0.8:8188',
    ):
        assert local_api_url(address) == address

    seen = {}

    def join(url, *args, **kwargs):
        seen['url'] = url
        raise requests.RequestException('fixture did not open a socket')

    monkeypatch.setattr(requests, 'post', join)
    monkeypatch.setattr(cluster.cluster_svc, 'local_capabilities', lambda: {'local': True})
    peer = client.post('/api/cluster/peer/connect', json={
        'primary_url': 'http://192.168.1.40:5050', 'token': 'synthetic-join-token',
    })
    assert peer.status_code == 400
    assert seen['url'] == 'http://192.168.1.40:5050/api/cluster/join'
    assert 'Online API' not in peer.get_json()['error']

    cfg.save_config({'comfyui': {'api_url': 'http://127.0.0.1:8188'}})

    def localhost_get(url, *args, **kwargs):
        seen['comfy'] = url
        return type('Response', (), {'status_code': 200})()

    monkeypatch.setattr(capabilities.requests, 'get', localhost_get)
    tool = client.post('/api/settings/test/comfyui')
    assert tool.status_code == 200
    assert tool.get_json()['ok'] is True
    assert seen['comfy'] == 'http://127.0.0.1:8188/system_stats'


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
