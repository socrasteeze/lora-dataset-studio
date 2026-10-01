"""The waiting a Launch-all queue paid between banks, taken out piece by piece.

Measured on a queue of banks: every GPU step POSTed ComfyUI /free while holding
GPU_ARBITER_LOCK (about 2 s per step when ComfyUI was stopped, for a ComfyUI on
another machine too), the queue polled every 2 s for the previous bank to end,
and the caption prerequisite asked Ollama twice before looking at JoyCaption's
cached verdict, whose positive answer then expired every 10 minutes.

Each test pins one of those, without sleeping: time is moved by editing the
remembered timestamps, and the queue's waits are observed through injected
seams. All addresses are documentation or synthetic ranges.
"""
import ipaddress
import threading

import pytest
import requests

from app.utils import comfyui

# Captured at import, before conftest's autouse fixture replaces it with a stub
# for every test: the cache under test lives inside the REAL function.
_REAL_FREE = comfyui.free_comfyui_vram

OTHER_MACHINE = 'http://192.0.2.10:8188'      # TEST-NET-1
THIS_MACHINE_IP = ipaddress.ip_address('198.51.100.7')   # TEST-NET-2


@pytest.fixture()
def real_free(monkeypatch):
    monkeypatch.setattr(comfyui, 'free_comfyui_vram', _REAL_FREE)
    comfyui.forget_comfyui_refused()
    yield
    comfyui.forget_comfyui_refused()


@pytest.fixture()
def own_addresses(monkeypatch):
    monkeypatch.setattr(comfyui, '_this_machine_addresses',
                        lambda: {ipaddress.ip_address('127.0.0.1'), THIS_MACHINE_IP})


def _forbid_requests(monkeypatch):
    def _no(*_a, **_k):
        raise AssertionError('a request was sent')
    monkeypatch.setattr(comfyui.requests, 'post', _no)
    monkeypatch.setattr(comfyui.requests, 'get', _no)


# --- /free for a ComfyUI on another machine ---------------------------------

def test_free_is_skipped_for_a_comfyui_on_another_machine(
        app, real_free, own_addresses, monkeypatch):
    from app import config as cfg
    _forbid_requests(monkeypatch)
    with app.app_context():
        cfg.save_config({'comfyui': {'api_url': OTHER_MACHINE}})
        verdict = comfyui.release_comfyui_for_local_gpu()
    assert verdict is comfyui.ComfyVramFreeVerdict.COMFYUI_NOT_LOCAL
    # It opens the vision window exactly as "offline" does …
    assert verdict.permits_ollama is True
    # … and claims nothing about that ComfyUI's memory.
    assert verdict.value != comfyui.ComfyVramFreeVerdict.FREED.value


@pytest.mark.parametrize('url', [
    'http://127.0.0.1:8188',              # loopback
    'http://localhost:8188',              # loopback name
    'http://[::ffff:127.0.0.1]:8188',     # loopback written as IPv6
    'http://0.0.0.0:8188',                # unspecified
    f'http://{THIS_MACHINE_IP}:8188',     # one of this machine's own addresses
    'http://172.17.0.2:8188',             # a container or WSL guest on this machine
    'http://comfy-box:8188',              # a NAME may resolve to this machine
    'http://192.0.2.10:8188/comfy',       # a proxy path: the fence calls it unknown
])
def test_anything_that_may_be_this_machine_is_still_asked(url, own_addresses):
    assert comfyui.comfyui_is_on_another_machine(url) is False


def test_unlisted_interfaces_mean_maybe_local(monkeypatch):
    monkeypatch.setattr(comfyui, '_this_machine_addresses', lambda: None)
    assert comfyui.comfyui_is_on_another_machine(OTHER_MACHINE) is False


def test_explicit_actions_still_ask_a_comfyui_on_another_machine(
        app, real_free, own_addresses, monkeypatch):
    """Free memory and Stop everything call free_comfyui_vram directly; only the
    vision window's helper skips."""
    from app import config as cfg
    sent = []

    class _Ok:
        status_code = 200

    monkeypatch.setattr(comfyui.requests, 'post',
                        lambda url, **_k: sent.append(url) or _Ok())
    with app.app_context():
        cfg.save_config({'comfyui': {'api_url': OTHER_MACHINE}})
        assert comfyui.free_comfyui_vram() is comfyui.ComfyVramFreeVerdict.FREED
    assert sent == [f'{OTHER_MACHINE}/free']


# --- a refused connection is remembered briefly -----------------------------

def _refusing_post(calls):
    def _post(url, **_k):
        calls.append(url)
        raise requests.exceptions.ConnectionError(
            ConnectionRefusedError(10061, 'connection refused'))
    return _post


def test_a_refused_free_is_remembered_then_expires(app, real_free, monkeypatch):
    calls = []
    monkeypatch.setattr(comfyui.requests, 'post', _refusing_post(calls))
    with app.app_context():
        addr = comfyui.api_address().rstrip('/')
        first = comfyui.release_comfyui_for_local_gpu()
        second = comfyui.release_comfyui_for_local_gpu()
        assert first is second is comfyui.ComfyVramFreeVerdict.COMFYUI_OFFLINE
        assert len(calls) == 1, 'the second window paid the connect timeout again'

        # Age the remembered refusal past its lifetime instead of sleeping.
        comfyui._refused_at[addr] -= comfyui._REFUSED_TTL_S + 1
        comfyui.release_comfyui_for_local_gpu()
    assert len(calls) == 2, 'an expired refusal must be asked again'


def test_only_a_real_refusal_is_remembered(app, real_free, monkeypatch):
    """A timeout is UNKNOWN and keeps the window closed; remembering it as
    offline would open the GPU to a ComfyUI that may hold it."""
    calls = []

    def _timeout(url, **_k):
        calls.append(url)
        raise requests.exceptions.ConnectTimeout('slow')

    monkeypatch.setattr(comfyui.requests, 'post', _timeout)
    with app.app_context():
        assert comfyui.release_comfyui_for_local_gpu() is \
            comfyui.ComfyVramFreeVerdict.UNKNOWN
        comfyui.release_comfyui_for_local_gpu()
    assert len(calls) == 2


def test_a_successful_free_forgets_the_refusal(app, real_free, monkeypatch):
    calls = []
    monkeypatch.setattr(comfyui.requests, 'post', _refusing_post(calls))
    with app.app_context():
        comfyui.release_comfyui_for_local_gpu()

        class _Ok:
            status_code = 200

        # An explicit Free memory click reaches ComfyUI, which is now up.
        monkeypatch.setattr(comfyui.requests, 'post',
                            lambda url, **_k: calls.append(url) or _Ok())
        assert comfyui.free_comfyui_vram() is comfyui.ComfyVramFreeVerdict.FREED
        assert comfyui._refused_at == {}
        assert comfyui.release_comfyui_for_local_gpu() is \
            comfyui.ComfyVramFreeVerdict.FREED
    assert len(calls) == 3


def test_saving_the_comfyui_settings_forgets_the_refusal(
        app, client, real_free, monkeypatch):
    calls = []
    monkeypatch.setattr(comfyui.requests, 'post', _refusing_post(calls))
    with app.app_context():
        comfyui.release_comfyui_for_local_gpu()
        url = comfyui.api_address()
    assert comfyui._refused_at, 'precondition: the refusal is remembered'
    r = client.put('/api/settings', json={'config': {'comfyui': {'api_url': url}}})
    assert r.status_code == 200, r.get_json()
    assert comfyui._refused_at == {}


def test_starting_comfyui_from_the_app_forgets_the_refusal(app, monkeypatch):
    from app.services import comfyui_control
    comfyui._note_comfyui_refused('http://127.0.0.1:8188')
    monkeypatch.setattr(comfyui_control, '_safe_local_api_url', lambda _u: True)
    monkeypatch.setattr(comfyui_control, '_validated_portable_layout', lambda: object())
    monkeypatch.setattr(comfyui_control, '_history_state',
                        lambda: comfyui_control._HISTORY_READY)
    with app.app_context():
        assert comfyui_control.start_comfyui()['ok'] is True
    assert comfyui._refused_at == {}


# --- the vision window does not hold the arbiter lock across /free ----------

def test_the_window_asks_comfyui_outside_the_arbiter_lock(app, monkeypatch):
    """The window is claimed first (flag + in-process token, under the lock),
    so nothing can start on the card; the HTTP call then runs with the lock
    free, and the queue dock and Stop no longer wait on it."""
    from app.gpu_window import gpu_exclusive_vision_window, vision_gpu_window_blocks_gpu
    from app.job_queue import GPU_ARBITER_LOCK, queue_manager

    seen = {}

    def _release():
        seen['fenced'] = vision_gpu_window_blocks_gpu()
        seen['flag'] = bool(queue_manager._get_system_state('vision_in_progress'))
        got = {}

        def _other_thread():
            got['lock'] = GPU_ARBITER_LOCK.acquire(timeout=1)
            if got['lock']:
                GPU_ARBITER_LOCK.release()

        t = threading.Thread(target=_other_thread)
        t.start()
        t.join(timeout=5)
        seen['lock_free'] = got.get('lock')
        return comfyui.ComfyVramFreeVerdict.FREED

    monkeypatch.setattr(comfyui, 'release_comfyui_for_local_gpu', _release)
    with app.app_context():
        with gpu_exclusive_vision_window():
            pass
        assert queue_manager._get_system_state('vision_in_progress') is None
    assert seen == {'fenced': True, 'flag': True, 'lock_free': True}


def test_a_refusing_comfyui_still_closes_the_window_cleanly(app, monkeypatch):
    from app.gpu_window import (GpuBusyError, gpu_exclusive_vision_window,
                                vision_gpu_window_blocks_gpu)
    from app.job_queue import queue_manager

    monkeypatch.setattr(comfyui, 'release_comfyui_for_local_gpu',
                        lambda: comfyui.ComfyVramFreeVerdict.UNKNOWN)
    with app.app_context():
        with pytest.raises(GpuBusyError, match='did not confirm'):
            with gpu_exclusive_vision_window():
                pass
        assert queue_manager._get_system_state('vision_in_progress') is None
    assert vision_gpu_window_blocks_gpu() is False


def test_a_comfyui_on_another_machine_opens_the_window(app, monkeypatch):
    from app.gpu_window import gpu_exclusive_vision_window
    monkeypatch.setattr(comfyui, 'release_comfyui_for_local_gpu',
                        lambda: comfyui.ComfyVramFreeVerdict.COMFYUI_NOT_LOCAL)
    entered = []
    with app.app_context():
        with gpu_exclusive_vision_window():
            entered.append(True)
    assert entered == [True]


# --- the queue wakes when the previous bank ends -----------------------------

def test_a_job_end_wakes_a_waiter_at_once():
    """No 2 s tick: the waiter is released by the announcement itself. The
    timeout is far longer than the join, so only the wake-up can pass this."""
    from app.services import bank_jobs

    seen = bank_jobs.ended_count()
    result = {}
    t = threading.Thread(
        target=lambda: result.update(woke=bank_jobs.wait_for_end(seen, 60)),
        daemon=True)
    t.start()
    bank_jobs._announce_ended()
    t.join(timeout=5)
    assert not t.is_alive(), 'the waiter slept through the announcement'
    assert result['woke'] is True


def test_an_end_between_the_check_and_the_wait_is_not_lost():
    from app.services import bank_jobs
    seen = bank_jobs.ended_count()
    bank_jobs._announce_ended()             # lands before the wait starts
    assert bank_jobs.wait_for_end(seen, 60) is True


def test_a_finished_bank_job_announces_its_end(app):
    from app.services import bank_jobs
    before = bank_jobs.ended_count()
    with app.app_context():
        bank_jobs.start(app, 987654, 'scan', lambda job: None)
    try:
        assert bank_jobs.ended_count() == before + 1
    finally:
        bank_jobs.reset()


def test_the_queue_waits_on_the_job_end_not_on_a_sleep(app, monkeypatch):
    """The pipeline wait hands bank_jobs its counter with the poll as a
    timeout, and returns as soon as that wait reports the end. A fixed
    `time.sleep(_POLL_SECONDS)` would never call the injected wait at all."""
    from app.services import bank_jobs, bank_queue
    from app.services import image_bank_service as banks

    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: None)
    state = {'running': False, 'waits': []}
    monkeypatch.setattr(bank_jobs, 'running', lambda _b: state['running'])

    def _start(*_a, **_k):
        state['running'] = True          # the pipeline is now live

    def _wait(seen, timeout):
        state['waits'].append(timeout)
        state['running'] = False         # ... and ends: the announcement
        return True

    monkeypatch.setattr(banks, 'start_pipeline', _start)
    monkeypatch.setattr(bank_jobs, 'wait_for_end', _wait)
    entry = {'bank_id': 31, 'user_id': 'local', 'steps': ['scan'],
             'reject_flags': [], 'resolve_dups': False, 'device_id': None,
             'enqueued_at': 0, 'state': 'pending'}
    bank_queue.reset(durable=False)
    with bank_queue._lock:
        bank_queue._queue.append(entry)
    try:
        with app.app_context():
            assert bank_queue._process_next(app) is True
    finally:
        bank_queue.reset(durable=False)
    assert state['waits'] == [bank_queue._POLL_SECONDS], (
        'one wait, woken by the end, with the poll only as its fallback')


# --- the caption prerequisite looks at JoyCaption first ---------------------

def test_auto_with_joycaption_ready_asks_ollama_nothing(app, monkeypatch):
    from app import capabilities
    from app import config as cfg
    from app.services import image_bank_service as banks

    def _no_ollama(*_a, **_k):
        raise AssertionError('Ollama /api/tags was asked')

    monkeypatch.setattr(capabilities, '_http_ok', _no_ollama)
    monkeypatch.setattr(capabilities, '_ollama_tags', _no_ollama)
    monkeypatch.setattr(capabilities, 'probe_ollama_model', _no_ollama)
    monkeypatch.setattr('app.services.joycaption.availability',
                        lambda: {'ok': True, 'detail': 'JoyCaption deps import OK'})
    with app.app_context():
        cfg.save_config({'captioning': {'backend': 'auto'}})
        assert banks._caption_prereq() is None


def test_auto_without_joycaption_still_checks_ollama(app, monkeypatch):
    from app import config as cfg
    from app.services import image_bank_service as banks
    asked = []
    monkeypatch.setattr('app.services.joycaption.availability',
                        lambda: {'ok': False, 'detail': 'no venv'})
    monkeypatch.setattr('app.capabilities.probe_ollama_model',
                        lambda *a, **k: asked.append(1) or {'ok': True})
    with app.app_context():
        cfg.save_config({'captioning': {'backend': 'auto'}})
        assert banks._caption_prereq() is None
    assert asked == [1]


# --- a working JoyCaption venv is not re-probed every 10 minutes -------------

_KEY, _PY, _EXPR = 'joycaption', 'synthetic-python', 'import transformers'


def _age(capabilities, seconds, python=_PY):
    prefix = f'{_KEY}:{python}'
    matches = [k for k in capabilities._import_cache if k.startswith(prefix)]
    assert len(matches) == 1, matches
    cache_key = matches[0]
    ts, ok = capabilities._import_cache[cache_key]
    capabilities._import_cache[cache_key] = (ts - seconds, ok)


def test_a_positive_joycaption_probe_outlives_the_short_ttl(app, monkeypatch):
    from app import capabilities
    calls = []
    monkeypatch.setattr(capabilities, '_import_ok',
                        lambda *a, **k: calls.append(1) or True)
    with app.app_context():
        capabilities._import_cache.clear()
        assert capabilities._cached_import(_KEY, _PY, _EXPR) is True
        _age(capabilities, capabilities._IMPORT_TTL + 60)
        assert capabilities._cached_import(_KEY, _PY, _EXPR) is True
        assert len(calls) == 1, 'a working venv was probed again after 600 s'

        # The documented triggers: an install action and "Check again" both
        # call clear_import_cache, and the next read probes for real.
        capabilities.clear_import_cache()
        assert capabilities._cached_import(_KEY, _PY, _EXPR) is True
        assert len(calls) == 2

        # A different interpreter is a different question.
        capabilities._cached_import(_KEY, 'another-python', _EXPR)
        assert len(calls) == 3


def test_a_negative_joycaption_probe_keeps_the_short_ttl(app, monkeypatch):
    from app import capabilities
    calls = []
    monkeypatch.setattr(capabilities, '_import_ok',
                        lambda *a, **k: calls.append(1) or False)
    with app.app_context():
        capabilities._import_cache.clear()
        assert capabilities._cached_import(_KEY, _PY, _EXPR) is False
        _age(capabilities, capabilities._IMPORT_TTL + 1)
        capabilities._cached_import(_KEY, _PY, _EXPR)
    assert len(calls) == 2, 'an install by hand must be seen within the short TTL'


def test_other_import_probes_keep_the_short_ttl(app, monkeypatch):
    from app import capabilities
    calls = []
    monkeypatch.setattr(capabilities, '_import_ok',
                        lambda *a, **k: calls.append(1) or True)
    with app.app_context():
        capabilities._import_cache.clear()
        capabilities._cached_import('masks', _PY, _EXPR)
        cache_key = f'masks:{_PY}:{_EXPR}'
        ts, ok = capabilities._import_cache[cache_key]
        capabilities._import_cache[cache_key] = (ts - capabilities._IMPORT_TTL - 1, ok)
        capabilities._cached_import('masks', _PY, _EXPR)
    assert len(calls) == 2
