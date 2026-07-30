"""Vision model keep-warm: the lease is contention-driven AND revocable.

The two halves have to hold together. Keeping 7.5 GB warm is only defensible if
it is handed back the moment something else wants the card — a lease that can't
be revoked is worse than the always-unload behaviour it replaces, because it
swaps a predictable 12.8 s reload for an unpredictable silent eviction (WDDM
pages instead of raising OOM, so nothing would even report it).
"""
import io
from unittest.mock import patch

import pytest
from PIL import Image

from app.services import vision_keepalive as vk


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new('RGB', (8, 8), (200, 50, 50)).save(buf, 'PNG')
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _clean_lease():
    vk.forget_lease()
    yield
    vk.forget_lease()


# -- the knob ---------------------------------------------------------------

@pytest.mark.parametrize('raw,expected', [
    (None, vk.DEFAULT_WARM_SECONDS),
    ('', vk.DEFAULT_WARM_SECONDS),
    ('   ', vk.DEFAULT_WARM_SECONDS),
    ('not a number', vk.DEFAULT_WARM_SECONDS),
    (-5, 0),
    (0, 0),
    ('60', 60),
    (10 ** 6, vk.MAX_WARM_SECONDS),
])
def test_warm_seconds_is_total(raw, expected):
    """Whatever the settings form stored, we get a usable int."""
    assert vk.warm_seconds(override=raw) == expected


def test_zero_disables_the_feature_entirely(app):
    with app.app_context(), patch.object(vk, 'warm_seconds', return_value=0), \
            patch.object(vk, 'gpu_is_contended') as contended:
        assert vk.keep_alive_for_isolated_call() == vk.UNLOAD
        # Not even worth asking who wants the GPU.
        contended.assert_not_called()
    assert vk.lease_is_live() is False


# -- the decision -----------------------------------------------------------

def test_idle_card_leases_the_model_warm(app):
    with app.app_context():
        assert vk.keep_alive_for_isolated_call() == f'{vk.DEFAULT_WARM_SECONDS}s'
    assert vk.lease_is_live() is True


def test_a_training_run_forces_an_immediate_unload(app):
    from app.job_queue import queue_manager
    with app.app_context():
        queue_manager._set_system_state('training_in_progress', True)
        try:
            assert vk.gpu_is_contended() is True
            assert vk.keep_alive_for_isolated_call() == vk.UNLOAD
        finally:
            queue_manager._set_system_state('training_in_progress', None)
    assert vk.lease_is_live() is False


@pytest.mark.parametrize('status', ['pending', 'processing', 'sent_to_comfy'])
def test_an_unfinished_comfyui_job_forces_an_immediate_unload(app, status):
    from app.extensions import db
    from app.models import ImageGenerationQueue
    with app.app_context():
        db.session.add(ImageGenerationQueue(
            job_id=f'ka-{status}', user_id='local',
            status=status, workflow_data='{}'))
        db.session.commit()
        assert vk.gpu_is_contended() is True
        assert vk.keep_alive_for_isolated_call() == vk.UNLOAD


def test_a_finished_job_does_not_count_as_contention(app):
    from app.extensions import db
    from app.models import ImageGenerationQueue
    with app.app_context():
        db.session.add(ImageGenerationQueue(
            job_id='ka-done', user_id='local',
            status='completed', workflow_data='{}'))
        db.session.commit()
        assert vk.gpu_is_contended() is False


def test_an_unreadable_signal_degrades_to_the_old_behaviour():
    """No app context at all: the DB read raises, and we must NOT gamble 7.5 GB
    on an optimistic guess. Unloading is exactly what the code did before."""
    assert vk.gpu_is_contended() is True
    assert vk.keep_alive_for_isolated_call() == vk.UNLOAD
    assert vk.lease_is_live() is False


# -- the revocation ---------------------------------------------------------

def test_revoke_unloads_a_live_lease(app):
    with app.app_context():
        vk.keep_alive_for_isolated_call()
    assert vk.lease_is_live() is True
    with patch('app.services.vision_ollama.unload_vision_model',
               return_value=True) as unload:
        assert vk.revoke('test') is True
    unload.assert_called_once()
    assert vk.lease_is_live() is False


def test_revoke_is_free_when_nothing_is_leased():
    """This runs on the job queue's hot path — it must not fire an HTTP call per
    job just to discover there is nothing to unload."""
    with patch('app.services.vision_ollama.unload_vision_model') as unload:
        assert vk.revoke() is False
    unload.assert_not_called()


def test_unloading_clears_the_lease(app):
    """A batch pass ends with its own unload_vision_model(); after that, a later
    revoke() must not fire a second, pointless unload."""
    from app.services import vision_ollama
    with app.app_context():
        vk.keep_alive_for_isolated_call()
    with patch('app.services.vision_ollama.requests.post'):
        vision_ollama.unload_vision_model()
    assert vk.lease_is_live() is False


# -- the failure path: a lease must not outlive the call it was granted for --

def test_an_unreachable_ollama_hands_back_the_lease(app):
    """The lease is recorded BEFORE the call ships (keep_alive rides in the
    payload). If Ollama turns out to be unreachable, the grant is a phantom —
    left in place, the next launch_training within warm_seconds() would pay
    unload_vision_model()'s doomed retries against the same dead socket before
    the trainer spawns."""
    import requests
    from app.services import vision_ollama

    def _down(*a, **k):
        raise requests.exceptions.ConnectionError('connection refused')

    with app.app_context(), \
            patch('app.services.vision_ollama.requests.post', _down):
        keep = vk.keep_alive_for_isolated_call()
        assert keep == f'{vk.DEFAULT_WARM_SECONDS}s'
        assert vision_ollama.describe_image_ollama(_png(), 'p', keep_alive=keep) == ''
    assert vk.lease_is_live() is False


def test_head_crop_failure_does_not_leave_a_lease(app):
    """Same guarantee end-to-end through the production call site: an upload's
    head-crop with Ollama down must not tax the next training launch."""
    import requests
    from app.services import face_dataset_service as fds

    def _down(*a, **k):
        raise requests.exceptions.ConnectionError('connection refused')

    with app.app_context(), \
            patch('app.services.vision_ollama.requests.post', _down):
        assert fds.detect_head_bbox(_png()) is None
    assert vk.lease_is_live() is False


def test_an_http_rejection_keeps_the_lease(app):
    """The server ANSWERED — it is reachable and may have loaded the model
    before rejecting the request, so the lease stays: revoking against a live
    server is one cheap POST, and forgetting here could leave a resident model
    with nobody to hand it back."""
    import requests
    from app.services import vision_ollama

    class _Reject:
        status_code = 400
        text = 'bad image'

        def json(self):
            return {'error': 'bad image'}

        def raise_for_status(self):
            raise requests.HTTPError('400 Client Error', response=self)

    with app.app_context(), \
            patch('app.services.vision_ollama.requests.post',
                  lambda *a, **k: _Reject()):
        keep = vk.keep_alive_for_isolated_call()
        assert vision_ollama.describe_image_ollama(b'img', 'p', keep_alive=keep) == ''
    assert vk.lease_is_live() is True


def test_a_read_timeout_keeps_the_lease(app):
    """Connect succeeded: Ollama is alive and likely mid-load or mid-inference
    with the model resident — exactly the state the lease exists to hand back."""
    import requests
    from app.services import vision_ollama

    def _slow(*a, **k):
        raise requests.exceptions.ReadTimeout('read timed out')

    with app.app_context(), \
            patch('app.services.vision_ollama.requests.post', _slow):
        keep = vk.keep_alive_for_isolated_call()
        assert vision_ollama.describe_image_ollama(b'img', 'p', keep_alive=keep) == ''
    assert vk.lease_is_live() is True


def test_auto_start_failure_hands_back_the_lease(app):
    """The Studio describe path (auto_start_local=True): Ollama unreachable AND
    unstartable raises to the user — the lease must not survive the wreck."""
    import requests
    from app.services import ollama_control, vision_ollama

    def _down(*a, **k):
        raise requests.exceptions.ConnectionError('connection refused')

    with app.app_context(), \
            patch('app.services.vision_ollama.requests.post', _down), \
            patch.object(ollama_control, 'ensure_captioning_ready',
                         return_value={'ok': False, 'error': 'not installed'}):
        keep = vk.keep_alive_for_isolated_call()
        with pytest.raises(RuntimeError, match='not installed'):
            vision_ollama.describe_image_ollama(_png(), 'p', keep_alive=keep,
                                                auto_start_local=True)
    assert vk.lease_is_live() is False


def test_auto_start_retry_success_keeps_the_lease(app):
    """Server restarted and the retry captioned: the model IS warm under the
    granted keep_alive, so the lease must survive for revoke() to hand it back."""
    import requests
    from app.services import ollama_control, vision_ollama
    calls = []

    def _post(*a, **k):
        calls.append(1)
        if len(calls) == 1:
            raise requests.exceptions.ConnectionError('server stopped')

        class _Ok:
            def raise_for_status(self):
                pass

            def json(self):
                return {'response': 'a caption'}
        return _Ok()

    with app.app_context(), \
            patch('app.services.vision_ollama.requests.post', _post), \
            patch.object(ollama_control, 'ensure_captioning_ready',
                         return_value={'ok': True, 'reachable': True}):
        keep = vk.keep_alive_for_isolated_call()
        out = vision_ollama.describe_image_ollama(_png(), 'p', keep_alive=keep,
                                                  auto_start_local=True)
    assert out == 'a caption' and len(calls) == 2
    assert vk.lease_is_live() is True


# -- the wiring: the paths that take the GPU actually revoke -----------------

def test_the_comfyui_queue_proves_ollama_released_before_submitting(app):
    """The load-bearing handoff runs before the workflow reaches ComfyUI.

    `ensure_released_for_comfy` subsumes an optional warm-lease revoke and the
    mandatory `/api/ps` ownership check. It must finish before `/prompt`.
    """
    from app.job_queue import queue_manager
    with app.app_context():
        queue_manager.add_job(workflow_data={'1': {}}, prompt='p')
    order = []
    with patch('app.services.vision_keepalive.ensure_released_for_comfy',
               side_effect=lambda *a, **k: (order.append('fence'), True)[1]), \
         patch('app.job_queue._submit',
               side_effect=lambda *a, **k: (order.append('submit'), 'pid-1')[1]), \
         patch('app.job_queue._poll_outputs', return_value=('out.png', False)), \
         patch('app.job_queue._dispatch_completion'):
        with app.app_context():
            assert queue_manager.process_one() is True
    assert order == ['fence', 'submit']


def test_head_crop_asks_the_policy_instead_of_hardcoding_zero(app):
    """`detect_head_bbox` is the burst case: five reference crops in a row used
    to pay the 12.8 s cold load five times."""
    from app.services import face_dataset_service as fds
    seen = {}

    def fake_describe(image_bytes, prompt, **kw):
        seen['keep_alive'] = kw.get('keep_alive')
        return ''

    with app.app_context(), \
            patch('app.services.vision_ollama.describe_image_ollama', fake_describe):
        fds.detect_head_bbox(b'not-an-image')
    assert seen['keep_alive'] == f'{vk.DEFAULT_WARM_SECONDS}s'
