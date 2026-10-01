"""wd14.device: GPU-only tagging must never fall back to the CPU.

A tagger interpreter with the CPU onnxruntime used to tag on every core
without saying so. `cuda` refuses instead, both before launch (parent) and
inside the worker (onnxruntime drops to CPU silently when CUDA fails to
initialise). `auto` keeps the old behaviour; `cpu` never takes the GPU."""
import importlib.util
import io
import json
import pathlib
import sys
import types

import pytest

from app import capabilities
from app.config import save_config
from app.services import wd14_tagger as w

INFER = pathlib.Path(__file__).resolve().parents[1] / 'infer'
CUDA, CPU = 'CUDAExecutionProvider', 'CPUExecutionProvider'


def _device(value):
    save_config({'wd14': {'device': value}})


@pytest.mark.parametrize('stored, expected', [
    (None, 'auto'), ('', 'auto'), ('CUDA', 'cuda'), ('cpu', 'cpu'), ('tpu', 'auto')])
def test_device_reads_known_values_and_defaults_to_auto(stored, expected):
    if stored is not None:
        _device(stored)
    assert w.device() == expected


def test_cpu_never_takes_the_gpu_even_when_cuda_exists(monkeypatch):
    monkeypatch.setattr(capabilities, 'wd14_gpu_available', lambda: True)
    _device('cpu')
    assert w.uses_gpu() is False
    _device('auto')
    assert w.uses_gpu() is True


def test_gpu_only_refuses_before_launch_without_cuda(monkeypatch):
    monkeypatch.setattr(capabilities, 'wd14_gpu_available', lambda: False)
    _device('cuda')
    assert 'onnxruntime-gpu' in w.gpu_refusal()
    _device('auto')
    assert w.gpu_refusal() is None
    monkeypatch.setattr(capabilities, 'wd14_gpu_available', lambda: True)
    _device('cuda')
    assert w.gpu_refusal() is None


def test_tag_pass_prereq_reports_the_gpu_refusal(monkeypatch):
    from app.services import image_bank_service as svc
    monkeypatch.setattr(capabilities, 'probe_wd14', lambda: {'ok': True, 'detail': ''})
    monkeypatch.setattr(capabilities, 'wd14_gpu_available', lambda: False)
    _device('cuda')
    assert 'GPU tagging is selected' in svc._tags_prereq()
    _device('auto')
    assert svc._tags_prereq() is None


def test_the_worker_is_told_the_device(monkeypatch, tmp_path):
    img = tmp_path / 'a.png'
    img.write_bytes(b'x')
    seen = {}

    def fake_run(_python, _script, payload, _budget, _on_line):
        seen.update(json.loads(payload))
        return json.dumps({'ok': True, 'results': {}}), [], 0, False

    monkeypatch.setattr(w, 'run_infer_script', fake_run)
    _device('cuda')
    assert w.tag_images([str(img)])['ok'] is True
    assert seen['device'] == 'cuda'


# --- the worker ------------------------------------------------------------------

def _run_worker(monkeypatch, capsys, tmp_path, device, available, active):
    """Run wd14_infer.main() with a fake onnxruntime whose session reports
    `active` as its first provider. Returns (last JSON line, providers asked)."""
    asked = {}

    class Session:
        def __init__(self, _path, providers):
            asked['providers'] = providers

        def get_providers(self):
            return [active, CPU]

        def get_inputs(self):
            return [types.SimpleNamespace(shape=[1, 448, 448, 3], name='in')]

        def get_outputs(self):
            return [types.SimpleNamespace(name='out')]

    ort = types.ModuleType('onnxruntime')
    ort.get_available_providers = lambda: list(available)
    ort.InferenceSession = Session
    monkeypatch.setitem(sys.modules, 'onnxruntime', ort)
    monkeypatch.setitem(sys.modules, 'cv2', types.ModuleType('cv2'))
    models = tmp_path / 'models'
    models.mkdir()
    (models / 'selected_tags.csv').write_text('tag_id,name,category,count\n1,solo,0,1\n',
                                              encoding='utf-8')
    if str(INFER) not in sys.path:
        sys.path.insert(0, str(INFER))
    spec = importlib.util.spec_from_file_location('wd14_infer_device_test', INFER / 'wd14_infer.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps(
        {'images': [], 'models_dir': str(models), 'model_files': {}, 'device': device})))
    module.main()
    lines = [ln for ln in capsys.readouterr().out.splitlines() if ln.startswith('{')]
    return json.loads(lines[-1]), asked.get('providers')


def test_worker_gpu_only_without_cuda_fails_instead_of_using_cpu(monkeypatch, capsys, tmp_path):
    out, providers = _run_worker(monkeypatch, capsys, tmp_path, 'cuda', [CPU], CPU)
    assert out['ok'] is False and 'GPU tagging is selected' in out['error']
    assert providers is None, 'no session may be created on the CPU'


def test_worker_gpu_only_fails_when_cuda_silently_falls_back(monkeypatch, capsys, tmp_path):
    out, _providers = _run_worker(monkeypatch, capsys, tmp_path, 'cuda', [CUDA, CPU], CPU)
    assert out['ok'] is False and 'failed to initialise' in out['error']


def test_worker_gpu_only_runs_on_cuda(monkeypatch, capsys, tmp_path):
    out, providers = _run_worker(monkeypatch, capsys, tmp_path, 'cuda', [CUDA, CPU], CUDA)
    assert out['ok'] is True
    assert providers[0] == CUDA


def test_worker_cpu_never_asks_for_cuda(monkeypatch, capsys, tmp_path):
    out, providers = _run_worker(monkeypatch, capsys, tmp_path, 'cpu', [CUDA, CPU], CPU)
    assert out['ok'] is True
    assert providers == [CPU]


def test_worker_auto_keeps_the_cpu_fallback(monkeypatch, capsys, tmp_path):
    out, providers = _run_worker(monkeypatch, capsys, tmp_path, 'auto', [CPU], CPU)
    assert out['ok'] is True
    assert providers == [CPU]
