import errno
from unittest.mock import patch

import pytest
import requests
import urllib3

from app.services import ollama_gpu_fence as fence

# This file IS the fence's own test: it drives /api/ps through `requests`
# itself, so it opts out of the autouse stub that keeps the rest of the
# suite off this machine's Ollama (see conftest).
pytestmark = pytest.mark.ollama_fence


class _Response:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


def _ps(*names):
    return _Response({'models': [{'name': name} for name in names]})


@pytest.fixture(autouse=True)
def _reset_fence():
    fence.reset_for_tests()
    yield
    fence.reset_for_tests()


def test_endpoint_scope_never_treats_a_lookalike_hostname_as_local():
    assert fence._endpoint_scope('http://127.0.0.1:11434')[0] == 'local'
    assert fence._endpoint_scope('http://[::1]:11434') == ('local', 'http://[::1]:11434')
    assert fence._endpoint_scope('http://127.evil.example:11434')[0] == 'remote'
    assert fence._endpoint_scope('http://127.0.0.1:11434/ollama')[0] == 'unknown'
    assert fence._endpoint_scope('http://127.0.0.1:11434/?tenant=lds')[0] == 'unknown'
    assert fence._endpoint_scope('http://localhost:not-a-port')[0] == 'unknown'


def test_transient_probe_failure_can_recover_on_the_next_comfy_handoff():
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', side_effect=[_Response({}, status_code=500), _ps()]), \
            patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)):
        assert fence.mark_before_generate(endpoint, 'lds-model') == 'blocked'
        assert fence.ensure_released_for_comfy() is True

def test_mark_before_generate_refuses_a_preexisting_local_model_without_unload():
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', return_value=_ps('manual-model')) as get, \
            patch.object(fence.requests, 'post') as post:
        assert fence.mark_before_generate(endpoint, 'lds-model') == 'blocked'
    assert get.call_count == 1
    post.assert_not_called()


def test_comfy_handoff_rechecks_between_cells_and_preserves_manual_model():
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', side_effect=[_ps(), _ps('manual-model')]) as get, \
            patch.object(fence.requests, 'post') as post:
        assert fence.mark_before_generate(endpoint, 'lds-model') == 'local'
        assert fence.ensure_released_for_comfy() is False
    assert get.call_count == 2
    post.assert_not_called()


def test_comfy_handoff_releases_only_the_model_lds_admitted_then_confirms_empty():
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', side_effect=[_ps(), _ps('lds-model'), _ps()]), \
            patch.object(fence.requests, 'post', return_value=_Response({})) as post:
        assert fence.mark_before_generate(endpoint, 'lds-model') == 'local'
        assert fence.ensure_released_for_comfy() is True
    post.assert_called_once_with(
        f'{endpoint}/api/generate',
        json={'model': 'lds-model', 'keep_alive': 0},
        timeout=(10, 30), allow_redirects=False)


def test_a_remote_endpoint_is_never_probed_or_unloaded():
    remote = 'http://192.168.10.20:11434'
    with patch.object(fence.requests, 'get') as get, patch.object(fence.requests, 'post') as post:
        assert fence.mark_before_generate(remote, 'remote-model') == 'remote'
        assert fence.release_owned_models(ollama_url=remote) is None
    get.assert_not_called()
    post.assert_not_called()


def test_empty_probe_clears_a_foreign_marker_only_after_it_observes_empty():
    endpoint = 'http://127.0.0.1:11434'
    with fence._lock:
        fence._foreign_local_endpoints.add(endpoint)
    with patch.object(fence.requests, 'get', return_value=_ps()) as get, \
            patch.object(fence.requests, 'post') as post:
        assert fence.release_owned_models(ollama_url=endpoint) is True
    assert get.call_count == 1
    post.assert_not_called()
    with fence._lock:
        assert endpoint not in fence._foreign_local_endpoints


def test_malformed_or_non_successful_probe_blocks_comfy_handoff():
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', return_value=_Response({}, status_code=500)):
        assert fence.mark_before_generate(endpoint, 'lds-model') == 'blocked'
        assert fence.ensure_released_for_comfy() is False


# --- Ownership that survives a restart ---------------------------------------
# The fence used to keep ownership in process memory only. Restarting LDS while
# its own keep-warm model was still resident therefore made LDS read that model
# as a stranger's and refuse to use it - the app fencing itself out of its own
# GPU allocation, with a message telling the user to unload a model that was
# already theirs. These cover the claim file that closes that hole, and every
# case where the claim must NOT be believed.

def _ps_with_expiry(name, expires_at):
    return _Response({'models': [{'name': name, 'expires_at': expires_at}]})


def _iso(seconds_from_now):
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds_from_now)).isoformat()


@pytest.fixture
def fence_data_dir(tmp_path, monkeypatch):
    """Point the claim file at a throwaway data dir (never the real one)."""
    monkeypatch.setattr(fence, '_claims_path', lambda: tmp_path / 'ollama_fence_claims.json')
    return tmp_path


def test_keep_alive_seconds_only_bounds_a_claim_it_can_actually_bound():
    assert fence._keep_alive_seconds('120s') == 120
    assert fence._keep_alive_seconds('5m') == 300
    assert fence._keep_alive_seconds('1h') == 3600
    assert fence._keep_alive_seconds(90) == 90
    # No claim is written for these: an immediate unload, an unbounded
    # residency, or a form this fence will not guess at.
    assert fence._keep_alive_seconds(0) is None
    assert fence._keep_alive_seconds('-1') is None
    assert fence._keep_alive_seconds('forever') is None
    assert fence._keep_alive_seconds(None) is None
    assert fence._keep_alive_seconds(True) is None


def test_expires_at_parses_ollamas_nanosecond_timestamps():
    from datetime import datetime, timezone
    parsed = fence._parse_expires_at('2026-08-02T10:00:00.123456789Z')
    assert parsed == datetime(2026, 8, 2, 10, 0, 0, 123456, tzinfo=timezone.utc).timestamp()
    assert fence._parse_expires_at('2026-08-02T10:00:00+02:00') is not None
    assert fence._parse_expires_at('not a date') is None
    assert fence._parse_expires_at(None) is None


def test_restarted_lds_readopts_the_model_it_loaded_before_the_restart(fence_data_dir):
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'

    fence.reset_for_tests()  # the restart: process memory is gone, the claim is not

    with patch.object(fence.requests, 'get',
                      return_value=_ps_with_expiry('lds-model', _iso(90))), \
            patch.object(fence.requests, 'post') as post:
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'
    post.assert_not_called()


def test_a_model_loaded_by_another_app_after_the_restart_is_never_readopted(fence_data_dir):
    """Same name, later residency: the claim must lose."""
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'
    fence.reset_for_tests()

    # Another tool loaded the same model with its own, longer keep-alive: the
    # residency now ends well past anything LDS asked for.
    with patch.object(fence.requests, 'get',
                      return_value=_ps_with_expiry('lds-model', _iso(3000))), \
            patch.object(fence.requests, 'post') as post:
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'blocked'
    post.assert_not_called()


def test_a_claim_that_has_run_out_stops_speaking_for_the_runner(fence_data_dir):
    import json
    import time
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'
    fence.reset_for_tests()

    path = fence._claims_path()
    data = json.loads(path.read_text(encoding='utf-8'))
    data['claims'][endpoint]['lds-model']['deadline'] = time.time() - 600
    path.write_text(json.dumps(data), encoding='utf-8')

    with patch.object(fence.requests, 'get',
                      return_value=_ps_with_expiry('lds-model', _iso(60))):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'blocked'


def test_no_claim_is_written_for_a_call_that_unloads_straight_away(fence_data_dir):
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive=0) == 'local'
    assert fence._read_claims() == {}


def test_an_unwritable_data_dir_degrades_to_the_old_in_process_behaviour(monkeypatch):
    endpoint = 'http://127.0.0.1:11434'
    monkeypatch.setattr(fence, '_claims_path', lambda: None)
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'
    assert fence._read_claims() == {}


# --- A daemon that is not running is not an empty daemon ----------------------
# Reported by socrasteeze (GitHub #20): the probe mapped a REFUSED connection to
# 'empty', so with Ollama stopped the admission path took the claim branch and
# wrote a keep-warm lease for a model that was never loaded. Its only caller
# never returns the lease, so the phantom claim sat in the claim file for its
# whole keep-alive — long enough for the user's OWN later `ollama run` of the
# same model to be adopted as LDS's and unloaded from under them.

def _refused():
    """A connection-refused error shaped like the one requests actually raises."""
    import errno as _errno
    return fence.requests.exceptions.ConnectionError(
        ConnectionRefusedError(_errno.ECONNREFUSED, 'connection refused'))


def test_a_stopped_ollama_is_told_apart_from_an_empty_one():
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', side_effect=_refused()):
        assert fence._probe(endpoint)[0] == 'down'
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence._probe(endpoint)[0] == 'empty'
    # Anything else the network can do stays 'unknown' - it proves nothing.
    with patch.object(fence.requests, 'get',
                      side_effect=fence.requests.exceptions.ReadTimeout('slow')):
        assert fence._probe(endpoint)[0] == 'unknown'


def test_no_keep_warm_lease_is_written_for_a_model_that_never_loaded(fence_data_dir):
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', side_effect=_refused()), \
            patch.object(fence.requests, 'post') as post:
        # The call is still admitted: it will fail on its own connection error,
        # or start the daemon and be admitted for real on the retry.
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'
    post.assert_not_called()
    assert fence._read_claims() == {}
    with fence._lock:
        assert fence._owned_models == {}


def test_a_model_the_user_loads_after_a_refused_probe_is_never_adopted(fence_data_dir):
    """The teeth of the bug: LDS must not inherit a residency it never created."""
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', side_effect=_refused()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'

    # The user starts Ollama and loads that very model themselves.
    with patch.object(fence.requests, 'get',
                      return_value=_ps_with_expiry('lds-model', _iso(90))), \
            patch.object(fence.requests, 'post') as post:
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'blocked'
    post.assert_not_called()


def test_a_stopped_ollama_never_stands_in_comfyuis_way(fence_data_dir):
    """'down' still proves the GPU is free — the release paths must not regress."""
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get', side_effect=_refused()), \
            patch.object(fence.requests, 'post') as post:
        assert fence.ensure_released_for_comfy() is True
        assert fence.release_owned_models(ollama_url=endpoint) is True
        status = fence.fence_status()
        assert fence.unload_foreign_models()['reason'] == 'already-free'
    post.assert_not_called()
    # And the status says the daemon is not there rather than pretending it
    # answered with an empty runner.
    assert status == {'applies': True, 'blocked': False, 'scope': 'local',
                      'reachable': False, 'models': []}


def test_a_stopped_ollama_clears_a_claim_left_by_a_previous_run(fence_data_dir):
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'
    assert fence._read_claims() != {}
    fence.reset_for_tests()
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get', side_effect=_refused()):
        assert fence.ensure_released_for_comfy() is True
    assert fence._read_claims() == {}


# --- Status probe + consented unload -----------------------------------------

def test_fence_status_names_what_is_in_the_way_and_clears_when_it_goes(fence_data_dir):
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)):
        with patch.object(fence.requests, 'get', return_value=_ps('other-app-model')):
            state = fence.fence_status()
        assert state == {'applies': True, 'blocked': True, 'scope': 'local',
                         'reachable': True, 'models': ['other-app-model']}
        # Ollama's own idle unload, or the other app closing: the block ends
        # with nobody clicking anything.
        with patch.object(fence.requests, 'get', return_value=_ps()):
            assert fence.fence_status()['blocked'] is False


def test_fence_status_never_reports_blocked_for_an_unreachable_or_remote_daemon():
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get', return_value=_Response({}, status_code=500)):
        state = fence.fence_status()
    assert state['blocked'] is False and state['reachable'] is False

    with patch.object(fence, '_configured_local_endpoint', return_value=('remote', None)), \
            patch.object(fence.requests, 'get') as get:
        assert fence.fence_status() == {'applies': False, 'blocked': False,
                                        'scope': 'remote', 'models': []}
    get.assert_not_called()


def test_fence_status_does_not_call_its_own_residency_foreign_after_a_restart(fence_data_dir):
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='120s') == 'local'
    fence.reset_for_tests()
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get',
                         return_value=_ps_with_expiry('lds-model', _iso(90))):
        assert fence.fence_status()['blocked'] is False


def test_consented_unload_releases_the_external_model_and_proves_the_runner_empty(fence_data_dir):
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get',
                         side_effect=[_ps('other-app-model'), _ps('other-app-model'), _ps()]), \
            patch.object(fence.requests, 'post', return_value=_Response({})) as post:
        assert fence.mark_before_generate(endpoint, 'lds-model') == 'blocked'
        result = fence.unload_foreign_models()
    assert result == {'ok': True, 'reason': 'unloaded',
                      'unloaded': ['other-app-model'], 'still_loaded': []}
    post.assert_called_once_with(f'{endpoint}/api/generate',
                                 json={'model': 'other-app-model', 'keep_alive': 0},
                                 timeout=(10, 30), allow_redirects=False)
    # And the foreign marker is gone, so the next request is admitted.
    with patch.object(fence.requests, 'get', return_value=_ps()):
        assert fence.mark_before_generate(endpoint, 'lds-model') == 'local'


def test_consented_unload_reports_a_runner_that_did_not_actually_empty(fence_data_dir):
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get',
                         side_effect=[_ps('busy-model'), _ps('busy-model')]), \
            patch.object(fence.requests, 'post', return_value=_Response({})):
        result = fence.unload_foreign_models()
    assert result['ok'] is False and result['reason'] == 'still-loaded'
    assert result['still_loaded'] == ['busy-model']


def test_nothing_short_of_the_consent_route_ever_unloads_a_foreign_model(fence_data_dir):
    """The whole point of the fence: no automatic path evicts someone else's model."""
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get', return_value=_ps('other-app-model')), \
            patch.object(fence.requests, 'post') as post:
        assert fence.mark_before_generate(endpoint, 'lds-model') == 'blocked'
        assert fence.fence_status()['blocked'] is True
        assert fence.ensure_released_for_comfy() is False
        assert fence.release_owned_models(ollama_url=endpoint) is False
    post.assert_not_called()


# --- a refused connection is not an idle runner -----------------------------
# Ollama being STOPPED and Ollama answering "nothing is loaded" both mean no
# model is resident, and every release path may treat them alike. Ownership may
# not: a claim on a process that is not running is a claim on nothing, and it
# was being written to disk and believed after a restart.

def _refused():
    """The exception `requests` raises when nothing is listening on the port.

    Built as the real stack builds it — a socket ConnectionRefusedError, wrapped
    by urllib3's NewConnectionError, wrapped by requests' ConnectionError — so
    this also exercises `_connection_refused`'s walk down the __cause__ chain.
    A flat `ConnectionError('refused')` would prove nothing: NewConnectionError
    is not an OSError and carries no errno of its own.
    """
    sock = ConnectionRefusedError(errno.ECONNREFUSED, 'Connection refused')
    conn = urllib3.exceptions.NewConnectionError(
        None, 'Failed to establish a new connection')
    conn.__cause__ = sock
    exc = requests.exceptions.ConnectionError(conn)
    exc.__cause__ = conn
    return exc


def _refused_winerror():
    """The same thing as Windows actually delivers it (WinError 10061)."""
    return requests.exceptions.ConnectionError(OSError(10061, 'refused'))


@pytest.mark.parametrize('refused', [_refused, _refused_winerror],
                         ids=['posix-errno', 'winerror-10061'])
def test_a_stopped_ollama_is_never_claimed_as_a_model_lds_owns(fence_data_dir, refused):
    """Regression: a refused connection read as 'empty' — the PERMISSIVE state —
    so the admission path claimed the model and persisted a keep-warm lease for
    a runner that never loaded it. The call is still admitted (it fails on its
    own connection error, which names the real problem), but LDS records no
    ownership it cannot back up."""
    endpoint = 'http://127.0.0.1:11434'
    claims = fence_data_dir / 'ollama_fence_claims.json'
    with patch.object(fence.requests, 'get', side_effect=refused()):
        assert fence.mark_before_generate(endpoint, 'lds-model', keep_alive='5m') == 'local'

    assert fence._owned_models == {}, 'LDS claimed a residency on a stopped daemon'
    assert not claims.exists(), 'a keep-warm lease was persisted for a model that never loaded'


def test_a_stopped_ollama_cannot_make_lds_evict_a_model_the_user_loads_later(fence_data_dir):
    """The damage the phantom claim actually does. LDS 'owns' a name it never
    loaded; when the user later loads that same model themselves and Ollama
    comes back, the release path sees nothing unowned and unloads it — the one
    thing test_nothing_short_of_the_consent_route... forbids."""
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence.requests, 'get', side_effect=_refused()):
        fence.mark_before_generate(endpoint, 'shared-model', keep_alive='5m')

    # Ollama is back, and the resident model is the USER's.
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get', return_value=_ps('shared-model')), \
            patch.object(fence.requests, 'post') as post:
        assert fence.ensure_released_for_comfy() is False
    post.assert_not_called()


def test_a_stopped_ollama_still_counts_as_a_free_runner_for_release(fence_data_dir):
    """The payoff of the original mapping, which must not regress: a daemon that
    is not running is holding no VRAM, so ComfyUI is free to go."""
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get', side_effect=_refused()), \
            patch.object(fence.requests, 'post') as post:
        assert fence.ensure_released_for_comfy() is True
        assert fence.unload_foreign_models()['reason'] == 'already-free'
    post.assert_not_called()


def test_a_stopped_ollama_is_not_reported_as_reachable(fence_data_dir):
    """fence_status is polled by the surfaces that were refused, to notice the
    moment the fence lifts. Reporting a stopped daemon as reachable-and-idle
    told them to carry on waiting for something that was not there."""
    endpoint = 'http://127.0.0.1:11434'
    with patch.object(fence, '_configured_local_endpoint', return_value=('local', endpoint)), \
            patch.object(fence.requests, 'get', side_effect=_refused()):
        status = fence.fence_status()
    assert status['reachable'] is False
    assert status['blocked'] is False and status['models'] == []
