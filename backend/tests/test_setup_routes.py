import pytest


@pytest.fixture(autouse=True)
def _reset_runs():
    from app import setup_installer
    setup_installer._runs.clear()
    yield
    setup_installer._runs.clear()


def test_install_unknown_action_404(client):
    assert client.post('/api/setup/install/rm_rf').status_code == 404


def test_status_unknown_action_404(client):
    assert client.get('/api/setup/install/rm_rf/status').status_code == 404


def test_install_ml_extras_starts(client, monkeypatch):
    from app import setup_installer
    monkeypatch.setattr(setup_installer, 'start',
                        lambda a: {'state': 'running', 'returncode': None, 'log': []})
    r = client.post('/api/setup/install/ml_extras')
    assert r.status_code == 200 and r.get_json()['state'] == 'running'


def test_install_conflict_409(client, monkeypatch):
    from app import setup_installer
    def _raise(a): raise setup_installer.AlreadyRunning(a)
    monkeypatch.setattr(setup_installer, 'start', _raise)
    assert client.post('/api/setup/install/ml_extras').status_code == 409


def test_install_ollama_precondition_400(client, monkeypatch):
    from app import config
    config.save_config({'ollama': {'url': '', 'vision_model': ''}})
    # real start() runs the precondition check and raises before spawning a thread
    assert client.post('/api/setup/install/ollama_model').status_code == 400


def test_status_idle(client):
    r = client.get('/api/setup/install/ml_extras/status')
    assert r.status_code == 200 and r.get_json()['state'] == 'idle'


# --- "Install everything" orchestrator endpoints ---------------------------

def test_install_all_plan_endpoint(client, monkeypatch):
    from app import capabilities, setup_installer
    monkeypatch.setattr(capabilities, 'probe', lambda force=False: {'python': {'ml_supported': True}})
    monkeypatch.setattr(setup_installer, 'install_all_plan', lambda caps: ['face_scoring', 'masks'])
    r = client.get('/api/setup/install-all/plan')
    assert r.status_code == 200 and r.get_json()['plan'] == ['face_scoring', 'masks']


@pytest.mark.parametrize('scrape_installed', [
    pytest.param(False, marks=pytest.mark.plugins()),
    pytest.param(True, marks=pytest.mark.plugins('scrape')),
])
def test_install_all_starts_plan(client, monkeypatch, scrape_installed):
    from app import capabilities, setup_installer
    started = []
    monkeypatch.setattr(capabilities, 'probe', lambda force=False: {})
    monkeypatch.setattr(setup_installer, 'start',
                        lambda a: (started.append(a) or {'state': 'running', 'returncode': None,
                                                          'log': [], 'progress': None,
                                                          'waiting_for': None,
                                                          'manual_command': ''}))
    r = client.post('/api/setup/install-all')
    body = r.get_json()
    assert r.status_code == 200
    # the {} snapshot -> the always-runnable extras (scrape stack + the four ML ones)
    assert body['plan'] == ['face_scoring', 'masks', 'watermark_inpaint', 'wd14']
    assert set(body['statuses']) == set(body['plan'])
    assert started == body['plan']
    # Scrape remains explicit in the owner's preparation, even when installed.
    assert setup_installer.known_action('scrape_extras') is True
    if scrape_installed:
        prepared = client.post('/api/setup/install/scrape_extras')
        assert prepared.status_code == 200 and prepared.get_json()['state'] == 'running'
        # Upstream names its plan `expected`; this fork asserts the plan inline
        # above (its list is longer -- scrape_extras and wd14 are fork actions),
        # so the same property reads off body['plan'] here. Adapted, not deleted:
        # it still proves an explicit re-prepare APPENDS rather than replacing.
        assert started == body['plan'] + ['scrape_extras']


def test_install_all_status_batches_requested_actions(client):
    r = client.get('/api/setup/install-all/status',
                   query_string={'actions': 'face_scoring,masks,not_real'})
    body = r.get_json()
    assert r.status_code == 200
    assert set(body['statuses']) == {'face_scoring', 'masks'}   # unknown dropped
    assert body['statuses']['face_scoring']['state'] == 'idle'


# --- ComfyUI directory validation endpoint (Setup Volet 1) -----------------

def test_validate_comfyui_dir_blank(client):
    r = client.get('/api/setup/comfyui-dir?path=')
    assert r.status_code == 200 and r.get_json()['status'] == 'empty'


def test_validate_comfyui_dir_valid(client, tmp_path):
    (tmp_path / 'main.py').touch()
    (tmp_path / 'models').mkdir()
    r = client.get('/api/setup/comfyui-dir', query_string={'path': str(tmp_path)})
    assert r.status_code == 200 and r.get_json()['status'] == 'valid'


def test_validate_comfyui_dir_nested_suggests_child(client, tmp_path):
    child = tmp_path / 'ComfyUI'
    child.mkdir()
    (child / 'main.py').touch()
    (child / 'models').mkdir()
    r = client.get('/api/setup/comfyui-dir', query_string={'path': str(tmp_path)})
    body = r.get_json()
    assert body['status'] == 'nested'
    assert body['suggestion'].endswith('ComfyUI')


def test_validate_comfyui_dir_missing(client, tmp_path):
    r = client.get('/api/setup/comfyui-dir', query_string={'path': str(tmp_path / 'nope')})
    assert r.get_json()['status'] == 'missing'


def test_retired_ollama_mode_reads_as_host(client):
    from app import capabilities, config
    assert capabilities.normalized_ollama_deployment_mode('none') == 'none'
    assert capabilities.normalized_ollama_deployment_mode('host') == 'host'
    assert capabilities.normalized_ollama_deployment_mode('retired') == 'host'
    assert capabilities.normalized_ollama_deployment_mode('') == 'host'
    config.save_config({'ollama': {'deployment_mode': 'retired', 'url': 'http://127.0.0.1:9'}})
    body = client.get('/api/setup/runtime-readiness').get_json()
    assert body['ollama']['mode'] == 'local'
    config.save_config({'ollama': {'deployment_mode': 'none'}})
    disabled = client.get('/api/setup/runtime-readiness').get_json()
    assert disabled['ollama']['mode'] == 'none'
    assert disabled['ollama']['state'] == 'disabled'
    assert disabled['ollama']['ready'] is False


def test_runtime_readiness_describes_a_direct_install(client, monkeypatch):
    monkeypatch.setenv('LDS_RUNTIME', 'custom')
    body = client.get('/api/setup/runtime-readiness').get_json()
    assert body['comfyui']['mode'] == 'external'
    assert body['comfyui']['state'] == 'manual'
    assert body['ollama']['mode'] == 'local'
    assert client.put('/api/setup/ollama-deployment', json={'mode': 'host'}).status_code == 404















def test_runtime_readiness_http_probe_is_bounded_streamed_and_closed(monkeypatch):
    from app import capabilities
    seen = {}

    class Response:
        status_code = 204
        closed = False

        def close(self):
            self.closed = True

    response = Response()

    def fake_get(url, **kwargs):
        seen.update(url=url, **kwargs)
        return response

    monkeypatch.setattr(capabilities.requests, 'get', fake_get)

    assert capabilities._http_ok(
        'http://ollama:11434/api/tags', timeout=99, readiness=True) is True
    assert seen == {
        'url': 'http://ollama:11434/api/tags',
        'timeout': 1.0,
        'allow_redirects': False,
        'stream': True,
    }
    assert response.closed is True













def test_ollama_cancel_endpoint_is_idempotent(client):
    from app import setup_installer

    setup_installer._runs['ollama_model'] = setup_installer._new_run()
    first = client.post('/api/setup/install/ollama_model/cancel')
    second = client.post('/api/setup/install/ollama_model/cancel')

    assert first.status_code == second.status_code == 200
    assert first.get_json()['cancel_requested'] is True
    assert second.get_json()['cancel_requested'] is True


def test_cancel_rejects_non_streamed_installs(client):
    response = client.post('/api/setup/install/ml_extras/cancel')
    assert response.status_code == 409
