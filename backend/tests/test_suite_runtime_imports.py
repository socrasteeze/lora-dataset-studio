"""Ordinary tests do not spawn ML import probes; transport tests still can."""
from types import SimpleNamespace

import pytest


def test_uncached_bank_device_checks_do_not_start_an_interpreter(monkeypatch):
    from app import capabilities as caps

    def forbidden(*args, **kwargs):
        pytest.fail('An ordinary device check started a subprocess')

    monkeypatch.setattr(caps.subprocess, 'run', forbidden)
    for _ in range(2):
        caps.clear_import_cache()
        assert caps.bank_scoring_gpu_available() is False
        assert caps.bank_siglip2_gpu_available() is False


def test_a_test_can_supply_positive_and_unknown_import_results(monkeypatch):
    from app import capabilities as caps

    for state in (True, None):
        monkeypatch.setattr(caps, '_import_ok', lambda *a, **k: state)
        caps.clear_import_cache()
        assert caps._cached_import_state('fixture', 'fixture-python', 'import fixture') is state


@pytest.mark.runtime_imports
def test_transport_opt_in_keeps_command_and_timeout_handling(monkeypatch):
    from app import capabilities as caps

    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(caps.subprocess, 'run', run)
    assert caps._import_ok('fixture-python', 'import fixture', timeout=7) is True
    assert len(calls) == 1
    assert calls[0][0][-2:] == ['-c', 'import fixture']
    assert calls[0][1]['timeout'] == 7

    def timeout(*args, **kwargs):
        raise caps.subprocess.TimeoutExpired('fixture-python', 7)

    monkeypatch.setattr(caps.subprocess, 'run', timeout)
    assert caps._import_ok('fixture-python', 'import fixture', timeout=7) is None
