"""`comfyui.ignored`: the operator keeps a ComfyUI URL but tells LDS to leave it alone.

The case behind it: a configured ComfyUI on another machine that is often off.
Every caption pass still asked it to free VRAM (a failed connect and a warning
each time) and the capability probes kept retrying /object_info. With the
setting on, none of that may touch the network: every seam below is replaced
by a recorder, and a recorded call fails the test.

All addresses are synthetic.
"""
import logging

import pytest

from app import capabilities
from app import config as cfg
from app.utils import comfyui

REMOTE = 'http://127.0.0.1:8189'


@pytest.fixture(autouse=True)
def _clean_caches():
    comfyui.clear_model_caches()
    capabilities._cache = None
    capabilities._cache_ts = 0.0
    yield
    comfyui.clear_model_caches()
    capabilities._cache = None
    capabilities._cache_ts = 0.0


@pytest.fixture()
def network(monkeypatch):
    """Record every request utils.comfyui would send. Recorded = sent."""
    calls = []

    class _Ok:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {'KSampler': {}}

    def fake(method):
        def _call(url, *args, **kwargs):
            calls.append((method, url))
            return _Ok()
        return _call

    monkeypatch.setattr(comfyui.requests, 'get', fake('GET'))
    monkeypatch.setattr(comfyui.requests, 'post', fake('POST'))
    return calls


def _ignore(value=True):
    cfg.save_config({'comfyui': {'ignored': value}})


def test_default_is_off_and_keeps_contacting_comfyui(app, network):
    with app.app_context():
        assert cfg.DEFAULTS['comfyui']['ignored'] is False
        assert cfg.get('comfyui.ignored') is False
        assert comfyui.comfyui_ignored() is False
        assert comfyui.free_comfyui_vram() is comfyui.ComfyVramFreeVerdict.FREED
        assert comfyui.fetch_object_info_classes() == {'KSampler'}
    assert [m for m, _url in network] == ['POST', 'GET']


def test_ignored_free_vram_sends_nothing_and_reports_offline(app, network, caplog):
    with app.app_context():
        _ignore()
        with caplog.at_level(logging.WARNING, logger=comfyui.logger.name):
            verdict = comfyui.free_comfyui_vram()
    assert verdict is comfyui.ComfyVramFreeVerdict.COMFYUI_OFFLINE
    # Offline is the verdict that lets a vision/caption pass go ahead.
    assert verdict.permits_ollama is True
    assert network == []
    assert 'did not complete' not in caplog.text


def test_ignored_object_info_sends_nothing_and_fails_open(app, network, caplog):
    with app.app_context():
        _ignore()
        with caplog.at_level(logging.WARNING, logger=comfyui.logger.name):
            assert comfyui.fetch_object_info_classes() is None
            assert comfyui.fetch_object_info_enums() is None
            assert comfyui.fetch_object_info_model_files() is None
            assert comfyui.fetch_node_info('KSampler') is None
    assert network == []
    assert 'fetch_object_info failed' not in caplog.text


def test_ignored_queue_and_history_reads_send_nothing(app, network):
    with app.app_context():
        _ignore()
        probe = comfyui.get_comfyui_history_probe('prompt-1')
        assert probe.health is comfyui.ComfyHistoryHealth.UNHEALTHY
        assert comfyui.comfyui_prompt_is_absent('prompt-1') is None
        assert comfyui.running_prompt_identity() is None
        assert comfyui.fetch_output_image_bytes('out.png') is None
    assert network == []


def test_ignored_submission_fails_fast_without_a_request(app, network):
    with app.app_context():
        _ignore()
        result, error = comfyui.queue_prompt_to_comfyui({'1': {'class_type': 'KSampler'}}, 'c1')
    assert result is None
    # The tag job_queue treats as a clean terminal failure, never a recovery barrier.
    assert error.startswith('COMFYUI_UNREACHABLE (nothing was submitted)')
    assert 'Ignore' in error
    assert network == []


def test_ignored_enqueue_refuses_before_a_row_exists(app):
    from app.job_queue import ComfyUIIgnored, queue_manager
    from app.models import ImageGenerationQueue
    with app.app_context():
        _ignore()
        with pytest.raises(ComfyUIIgnored):
            queue_manager.add_job(workflow_data={'1': {'class_type': 'KSampler'}})
        assert ImageGenerationQueue.query.count() == 0


def test_explicit_remote_worker_is_not_covered(app, network):
    """Ignore covers the configured ComfyUI only; a remote backend URL is its own."""
    with app.app_context():
        _ignore()
        assert comfyui.free_comfyui_vram(worker_url=REMOTE) is comfyui.ComfyVramFreeVerdict.FREED
    assert network == [('POST', f'{REMOTE}/free')]


def test_explicit_worker_equal_to_the_configured_url_is_still_ignored(app, network):
    with app.app_context():
        _ignore()
        local = comfyui.api_address()
        assert comfyui.free_comfyui_vram(worker_url=local + '/') is \
            comfyui.ComfyVramFreeVerdict.COMFYUI_OFFLINE
    assert network == []


def test_probe_reports_ignored_without_a_request(app, monkeypatch):
    seen = []
    monkeypatch.setattr(capabilities, '_http_ok', lambda *a, **k: seen.append(a) or True)
    with app.app_context():
        _ignore()
        comfy = capabilities.probe_comfyui()
        assert cfg.get('comfyui.api_url')               # the URL is kept
    assert comfy['ok'] is False
    assert comfy['status'] == 'ignored'
    assert comfy['ignored'] is True
    assert seen == []


def test_enqueue_gate_names_the_setting(app, monkeypatch):
    from app.routes._common import _require_comfyui
    monkeypatch.setattr(capabilities, '_http_ok', lambda *a, **k: True)
    with app.test_request_context():
        _ignore()
        body, status = _require_comfyui()
    assert status == 409
    assert body.get_json()['code'] == 'comfyui_ignored'


def test_setting_round_trips_through_the_settings_api(client):
    url_before = client.get('/api/settings').get_json()['config']['comfyui']['api_url']
    assert client.get('/api/settings').get_json()['config']['comfyui']['ignored'] is False

    r = client.put('/api/settings', json={'config': {'comfyui': {'ignored': True}}})
    assert r.status_code == 200, r.get_json()
    saved = client.get('/api/settings').get_json()['config']['comfyui']
    assert saved['ignored'] is True
    assert saved['api_url'] == url_before          # ignoring never deletes the URL

    r = client.put('/api/settings', json={'config': {'comfyui': {'ignored': False}}})
    assert r.status_code == 200, r.get_json()
    assert client.get('/api/settings').get_json()['config']['comfyui']['ignored'] is False
