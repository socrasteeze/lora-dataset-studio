"""⏹ Stop everything, and the way out of a "GPU busy" that is not true.

`_gpu_busy_reason()` gates every bank GPU pass, every queued bank and every
training start on two system-state flags. A process that dies without clearing
one leaves the whole app refusing — and the TTL does not rescue it, because
gpu_window's heartbeat re-arms the TTL for as long as the window is open. Before
this, the only recovery was restarting the app.

Two things are pinned here:

* the recovery WORKS on a stale flag with nothing running — that is the common
  case, and it must not require stopping anything;
* it still REFUSES to lie. A live training process means the GPU really is busy;
  clearing `training_in_progress` over it is the exact failure the fork's
  stop-verification exists to prevent.
"""
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _clean_registries():
    from app.services import bank_jobs, dataset_activity
    bank_jobs.reset()
    dataset_activity.reset()
    yield
    bank_jobs.reset()
    dataset_activity.reset()


def _set(key, value):
    from app.job_queue import queue_manager
    queue_manager._set_system_state(key, value)


def _get(key):
    from app.job_queue import queue_manager
    return queue_manager._get_system_state(key)


# --- reading the gate --------------------------------------------------------

def test_a_flag_with_nothing_behind_it_is_reported_as_stale(app):
    from app.services import global_stop

    with app.app_context():
        _set('vision_in_progress', 'tok')
        state = global_stop.gpu_flag_state()
        assert state['any_set'] is True
        assert state['stale'] is True, \
            'nothing is running — the user has to be able to see that'
        assert state['flags']['vision_in_progress'] is True
        assert state['flags']['training_in_progress'] is False


def test_a_flag_a_live_pass_owns_is_not_stale(app):
    from app.services import bank_jobs, global_stop

    with app.app_context():
        _set('vision_in_progress', 'tok')
        with patch.object(bank_jobs, 'live_bank_ids', lambda: [7]):
            state = global_stop.gpu_flag_state()
        assert state['stale'] is False
        assert state['live_bank_ids'] == [7]


def test_no_flags_at_all_is_not_stale(app):
    from app.services import global_stop

    with app.app_context():
        assert global_stop.gpu_flag_state()['stale'] is False


# --- clearing it on its own --------------------------------------------------

def test_clearing_a_stale_flag_needs_nothing_stopped(app):
    """The whole point: "nothing is running and it still says GPU busy" is fixed
    from the refusal itself, not by restarting the app."""
    from app.services import global_stop

    with app.app_context():
        _set('vision_in_progress', 'tok')
        out = global_stop.clear_gpu_flags()
        assert out['cleared'] == ['vision_in_progress']
        assert _get('vision_in_progress') is None
        # …and _gpu_busy_reason agrees, which is the only thing the user notices.
        from app.services import image_bank_service as banks
        assert banks._gpu_busy_reason() is None


def test_clearing_refuses_while_a_pass_is_really_running(app):
    from app.services import bank_jobs, global_stop

    with app.app_context():
        _set('vision_in_progress', 'tok')
        with patch.object(bank_jobs, 'live_bank_ids', lambda: [3]):
            with pytest.raises(RuntimeError, match='still running'):
                global_stop.clear_gpu_flags()
        assert _get('vision_in_progress') == 'tok', 'a live pass keeps its flag'


def test_clearing_refuses_while_the_trainer_is_alive(app):
    from app.services import global_stop

    with app.app_context():
        _set('training_in_progress', True)
        with patch.object(global_stop, '_training_pid_alive', lambda: True):
            with pytest.raises(RuntimeError, match='training process'):
                global_stop.clear_gpu_flags()
        assert _get('training_in_progress') is True


def test_even_forced_the_training_flag_is_held_over_a_live_trainer(app):
    """force exists for a wedge, not to declare a running trainer finished. An
    alive trainer means the GPU IS busy, and saying otherwise is how two runs end
    up on one card."""
    from app.services import global_stop

    with app.app_context():
        _set('training_in_progress', True)
        _set('vision_in_progress', 'tok')
        with patch.object(global_stop, '_training_pid_alive', lambda: True):
            out = global_stop.clear_gpu_flags(force=True)
        assert out['cleared'] == ['vision_in_progress']
        assert [h['key'] for h in out['held']] == ['training_in_progress']
        assert _get('training_in_progress') is True


def test_clearing_nothing_is_not_an_error(app):
    from app.services import global_stop

    with app.app_context():
        out = global_stop.clear_gpu_flags()
        assert out['cleared'] == [] and 'nothing was flagged' in out['detail']


# --- the global stop ---------------------------------------------------------

def _stop(app, **over):
    """stop_everything with every external target neutralised unless overridden,
    so a case says exactly which target it is about."""
    from app.services import global_stop, lora_training
    from app.utils import comfyui
    with patch.object(comfyui, 'free_comfyui_vram',
                      over.get('comfyui', lambda *a, **k: True)), \
         patch.object(lora_training, 'stop_training',
                      over.get('training', lambda *a, **k: False)), \
         patch.object(global_stop, '_datasets_with_pending', lambda uid: []), \
         patch.object(global_stop, '_SETTLE_SECONDS', 0):
        return global_stop.stop_everything(app, 'local')


def _target(report, name):
    return next(t for t in report['targets'] if t['name'] == name)


def test_stop_everything_clears_the_flags_and_reports_every_target(app):
    from app.services import global_stop

    with app.app_context():
        _set('vision_in_progress', 'tok')
        report = _stop(app)
        assert global_stop.GPU_FLAGS[1] in report['cleared']
        assert _get('vision_in_progress') is None
        names = [t['name'] for t in report['targets']]
        for expected in ('Bank queue', 'Bank passes', 'Dataset batches',
                         'Generations', 'ComfyUI', 'Training'):
            assert expected in names, f'{expected} must report its own outcome'


def test_an_unreachable_comfyui_is_never_counted_as_stopped(app):
    """The fork already refuses to let Stop answer "ok" without proof. A global
    stop that hid an unreachable ComfyUI would throw that away."""
    with app.app_context():
        report = _stop(app, comfyui=lambda *a, **k: False)
        t = _target(report, 'ComfyUI')
        assert t['state'] == 'unconfirmed'
        assert 'could not be reached' in t['detail']


def test_a_training_stop_that_cannot_be_verified_is_a_failure_and_holds_its_flag(app):
    from app.services import global_stop, lora_training

    def _refuse(*_a, **_k):
        raise lora_training.TrainingStopVerificationError(
            'Could not confirm training process 1234 stopped')

    with app.app_context():
        _set('training_in_progress', True)
        _set('vision_in_progress', 'tok')
        with patch.object(global_stop, '_training_pid_alive', lambda: True):
            report = _stop(app, training=_refuse)
        assert _target(report, 'Training')['state'] == 'failed'
        # The vision flag is still cleared — one stuck target must not strand the
        # rest — but the training flag stays, because the trainer is still alive.
        assert 'vision_in_progress' in report['cleared']
        assert [h['key'] for h in report['held']] == ['training_in_progress']
        assert _get('training_in_progress') is True


def test_the_bank_queue_is_emptied_before_the_running_pass_is_cancelled(app):
    """Order matters: cancelling the running pass first lets the worker start the
    next queued bank in the gap."""
    from app.services import bank_queue, global_stop
    order = []

    with app.app_context():
        with patch.object(bank_queue, 'clear',
                          lambda: (order.append('queue'), 2)[1]), \
             patch.object(global_stop, '_datasets_with_pending', lambda uid: []):
            from app.services import bank_jobs, lora_training
            from app.utils import comfyui
            with patch.object(bank_jobs, 'live_bank_ids',
                              lambda: (order.append('jobs'), [])[1]), \
                 patch.object(comfyui, 'free_comfyui_vram', lambda *a, **k: True), \
                 patch.object(lora_training, 'stop_training', lambda *a, **k: False), \
                 patch.object(global_stop, '_SETTLE_SECONDS', 0):
                report = global_stop.stop_everything(app, 'local')
    assert order[0] == 'queue', 'the queue is drained first, or it refills the gap'
    assert _target(report, 'Bank queue')['detail'].startswith('2 queued')


def test_nothing_running_reports_idle_rather_than_pretending_it_stopped_things(app):
    with app.app_context():
        report = _stop(app)
        assert _target(report, 'Bank passes')['state'] == 'idle'
        assert _target(report, 'Generations')['state'] == 'idle'
        assert _target(report, 'Training')['state'] == 'idle'


def test_one_broken_target_does_not_skip_the_others(app):
    from app.services import bank_queue

    def _boom():
        raise RuntimeError('queue module exploded')

    with app.app_context():
        _set('vision_in_progress', 'tok')
        with patch.object(bank_queue, 'clear', _boom):
            report = _stop(app)
        assert _target(report, 'Bank queue')['state'] == 'failed'
        assert _target(report, 'ComfyUI')['state'] == 'stopped'
        assert _get('vision_in_progress') is None, \
            'the flags are still cleared — that is what the button is for'


# --- the routes --------------------------------------------------------------

def test_the_clear_route_answers_409_rather_than_lying(app, client):
    from app.services import bank_jobs

    with app.app_context():
        _set('vision_in_progress', 'tok')
    with patch.object(bank_jobs, 'live_bank_ids', lambda: [1]):
        r = client.post('/api/system/gpu-flags/clear')
    assert r.status_code == 409
    assert 'still running' in r.get_json()['error']


def test_the_clear_route_works_when_the_flag_really_is_stale(app, client):
    with app.app_context():
        _set('vision_in_progress', 'tok')
    r = client.post('/api/system/gpu-flags/clear')
    assert r.status_code == 200
    assert r.get_json()['cleared'] == ['vision_in_progress']
    assert client.get('/api/system/gpu-flags').get_json()['any_set'] is False


# --- the generations target actually calls cancel_pending ---------------------
# Every case above stubs _datasets_with_pending to [], so cancel_pending was
# never reached from here. When upstream replaced its (cancelled, unconfirmed)
# tuple with a named recovery dict, this fork-only module kept unpacking two
# values — it merged with ZERO conflict markers, the whole suite stayed green,
# and ⏹ Stop everything would have raised on the first press with anything in
# flight. These drive the real call.

def _stop_with_generations(app, results):
    """stop_everything with one dataset in flight, cancel_pending stubbed."""
    from app.services import face_dataset_service as ds
    from app.services import global_stop, lora_training
    from app.utils import comfyui
    seq = iter(results)
    with patch.object(comfyui, 'free_comfyui_vram', lambda *a, **k: True), \
         patch.object(lora_training, 'stop_training', lambda *a, **k: False), \
         patch.object(global_stop, '_datasets_with_pending', lambda uid: [1]), \
         patch.object(ds, 'cancel_pending', lambda *a, **k: next(seq)), \
         patch.object(global_stop, '_SETTLE_SECONDS', 0):
        return global_stop.stop_everything(app, 'local')


def test_stopping_proven_generations_reports_stopped(app):
    with app.app_context():
        report = _stop_with_generations(app, [
            {'cancelled': 3, 'recovery_pending': 0, 'retry_pending': 0,
             'restart_required': 0, 'recovery_error': 0}])
        t = _target(report, 'Generations')
        assert t['state'] == 'stopped', t
        assert '3 cancelled' in t['detail']


def test_a_generation_that_cannot_be_proven_is_never_claimed_stopped(app):
    """And the wording must not promise the card is gone — it is deliberately
    KEPT now, because dropping it orphaned the global recovery barrier."""
    with app.app_context():
        report = _stop_with_generations(app, [
            {'cancelled': 1, 'recovery_pending': 2, 'retry_pending': 1,
             'restart_required': 1, 'recovery_error': 0}])
        t = _target(report, 'Generations')
        assert t['state'] == 'unconfirmed', t
        assert 'KEPT' in t['detail'], 'the card is preserved — say so'
        assert 'restart' in t['detail'].lower()
        assert 'rows are gone' not in t['detail'], (
            'this promise is no longer true and this module exists to not lie')
