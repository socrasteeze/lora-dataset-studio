"""Inference resource policy, without application imports or ML runtimes."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def resources():
    path = Path(__file__).resolve().parents[1] / 'infer' / 'pass_resources.py'
    spec = importlib.util.spec_from_file_location('pass_resources_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('cpus,native,workers', [(24, 4, 8), (16, 4, 5), (8, 2, 2), (2, 1, 1), (1, 1, 1)])
def test_hardware_budgets_reserve_capacity(resources, cpus, native, workers):
    assert resources.native_thread_count(cpus) == native
    assert resources.prepare_workers(cpus) == workers


def test_onnx_pools_respect_the_cpu_budget_and_do_not_spin(resources, monkeypatch):
    monkeypatch.setattr(resources.os, 'cpu_count', lambda: 24)
    monkeypatch.setenv('OMP_NUM_THREADS', '2')

    class Options:
        def __init__(self):
            self.entries = {}

        def add_session_config_entry(self, key, value):
            self.entries[key] = value

    options = resources.onnx_session_options(SimpleNamespace(SessionOptions=Options))
    assert options.intra_op_num_threads == 2
    assert options.inter_op_num_threads == 1
    assert options.entries == {'session.intra_op.allow_spinning': '0',
                               'session.inter_op.allow_spinning': '0'}
