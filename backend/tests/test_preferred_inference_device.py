"""GPU ownership and CPU fallback without loading models or processing media."""
from contextlib import contextmanager
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize('backend', ['torch', 'onnx'])
def test_cuda_stays_owned_until_the_operation_finishes(monkeypatch, backend):
    from app import capabilities
    from app.services import inference_device as service
    events = []
    monkeypatch.setattr(capabilities, '_cached_import', lambda *args: True)
    monkeypatch.setattr(service, 'vision_window_is_owned', lambda: False)

    @contextmanager
    def window(**kwargs):
        events.append('acquire')
        try:
            yield
        finally:
            events.append('release')

    monkeypatch.setattr(service, 'gpu_exclusive_vision_window', window)
    with service.preferred_device('python.exe', backend=backend) as device:
        assert device == 'cuda'
        events.append('operation')
    assert events == ['acquire', 'operation', 'release']


@pytest.mark.parametrize('available,preference', [(False, 'auto'), (True, 'cpu')])
def test_cpu_does_not_claim_the_gpu(monkeypatch, available, preference):
    from app import capabilities
    from app.services import inference_device as service
    monkeypatch.setattr(capabilities, '_cached_import', lambda *args: available)
    monkeypatch.setattr(service, 'gpu_exclusive_vision_window',
                        lambda **kwargs: pytest.fail('CPU must not claim the GPU'))
    with service.preferred_device('python.exe', preference=preference) as device:
        assert device == 'cpu'


def test_busy_gpu_falls_back_before_starting_the_operation(monkeypatch):
    from app import capabilities
    from app.services import inference_device as service
    monkeypatch.setattr(capabilities, '_cached_import', lambda *args: True)
    monkeypatch.setattr(service, 'vision_window_is_owned', lambda: False)

    @contextmanager
    def busy(**kwargs):
        raise service.GpuBusyError('occupied')
        yield

    monkeypatch.setattr(service, 'gpu_exclusive_vision_window', busy)
    with service.preferred_device('python.exe') as device:
        assert device == 'cpu'


def test_owned_window_is_reused_without_a_second_claim(monkeypatch):
    from app import capabilities
    from app.services import inference_device as service
    monkeypatch.setattr(capabilities, '_cached_import', lambda *args: True)
    monkeypatch.setattr(service, 'vision_window_is_owned', lambda: True)
    monkeypatch.setattr(service, 'gpu_exclusive_vision_window',
                        lambda **kwargs: pytest.fail('Do not re-enter the owned window'))
    with service.preferred_device('python.exe') as device:
        assert device == 'cuda'


def test_operation_error_is_not_retried_on_cpu(monkeypatch):
    from app import capabilities
    from app.services import inference_device as service
    monkeypatch.setattr(capabilities, '_cached_import', lambda *args: True)
    monkeypatch.setattr(service, 'vision_window_is_owned', lambda: True)
    calls = []
    with pytest.raises(service.GpuBusyError, match='operation failed'):
        with service.preferred_device('python.exe') as device:
            calls.append(device)
            raise service.GpuBusyError('operation failed')
    assert calls == ['cuda']


@pytest.mark.parametrize('engine', ['clip', 'siglip2'])
def test_gpu_text_worker_exits_before_gpu_ownership_ends(monkeypatch, engine):
    from app.services import bank_semantic_models, clip_text_encoder as service
    events = []
    monkeypatch.setattr(service.cfg, 'get', lambda key: None)
    monkeypatch.setattr(bank_semantic_models, 'semantic_python', lambda: 'python.exe')
    monkeypatch.setattr(service, '_proc', None)
    monkeypatch.setattr(service, '_siglip2_proc', None)

    @contextmanager
    def window(*args, **kwargs):
        events.append('acquire')
        try:
            yield 'cuda'
        finally:
            events.append('release')

    def start(device='cpu'):
        events.append('start-' + device)
        return SimpleNamespace(poll=lambda: None)

    monkeypatch.setattr(service, 'preferred_device', window)
    stop_name = '_stop_siglip2_worker_locked' if engine == 'siglip2' else '_stop_worker_locked'
    start_name = '_start_siglip2_worker_locked' if engine == 'siglip2' else '_start_worker_locked'
    monkeypatch.setattr(service, stop_name, lambda: events.append('stop'))
    monkeypatch.setattr(service, start_name, start)
    with service._query_worker(engine):
        events.append('operation')
    assert events == ['acquire', 'stop', 'start-cuda', 'operation', 'stop', 'release']
