"""GPU tagging finds a CUDA interpreter instead of skipping every bank.

The incident: wd14.python pointed at the app's own .venv. A rebuild of that
venv reinstalled the CPU onnxruntime pinned in requirements-ml.txt, so every
GPU tag pass refused with "the tagger's Python has no CUDA onnxruntime" while
another env on the same machine (the one serving masks) had a working CUDA
build. The run interpreter now falls through to a CUDA-capable candidate, the
install target stays where it was, and the UI is told when none exists.
"""
import importlib.util
import json
import pathlib
import sys

import pytest

from app import capabilities
from app.config import save_config
from app.services import wd14_tagger as w

INFER = pathlib.Path(__file__).resolve().parents[1] / 'infer'


def _python(tmp_path, name):
    path = tmp_path / name / 'python.exe'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'')
    return str(path)


def _cuda_in(monkeypatch, *pythons):
    """Fake the cached import probe: only these interpreters have CUDA."""
    asked = []

    def fake(key, python, expr):
        asked.append((key, python))
        return key == 'wd14_gpu' and python in pythons
    monkeypatch.setattr(capabilities, '_cached_import', fake)
    return asked


def test_the_configured_interpreter_is_kept_when_it_has_cuda(monkeypatch, tmp_path):
    venv = _python(tmp_path, 'venv')
    save_config({'wd14': {'python': venv, 'device': 'cuda'}})
    _cuda_in(monkeypatch, venv)
    assert w.run_python() == venv


def test_a_cpu_only_tagger_python_falls_through_to_a_cuda_env(monkeypatch, tmp_path):
    venv = _python(tmp_path, 'venv')
    quality = _python(tmp_path, 'quality')
    save_config({'wd14': {'python': venv, 'device': 'cuda'},
                 'masks': {'python': quality}})
    _cuda_in(monkeypatch, quality)
    assert w.run_python() == quality
    # The Setup install target does not move: pip never lands in the masks env.
    assert w.wd14_python() == venv


def test_auto_also_prefers_a_cuda_env(monkeypatch, tmp_path):
    venv = _python(tmp_path, 'venv')
    quality = _python(tmp_path, 'quality')
    save_config({'wd14': {'python': venv, 'device': 'auto'},
                 'masks': {'python': quality}})
    _cuda_in(monkeypatch, quality)
    assert w.run_python() == quality


def test_cpu_device_never_probes_or_switches(monkeypatch, tmp_path):
    venv = _python(tmp_path, 'venv')
    quality = _python(tmp_path, 'quality')
    save_config({'wd14': {'python': venv, 'device': 'cpu'},
                 'masks': {'python': quality}})
    asked = _cuda_in(monkeypatch, quality)
    assert w.run_python() == venv
    assert asked == []


def test_app_managed_envs_are_candidates(monkeypatch, tmp_path):
    from app import config as cfg
    env_python = cfg.data_dir() / 'envs' / 'zz-test-env' / 'Scripts' / 'python.exe'
    env_python.parent.mkdir(parents=True, exist_ok=True)
    env_python.write_bytes(b'')
    try:
        venv = _python(tmp_path, 'venv')
        save_config({'wd14': {'python': venv, 'device': 'cuda'}})
        _cuda_in(monkeypatch, str(env_python))
        assert str(env_python) in w.candidate_pythons()
        assert w.run_python() == str(env_python)
    finally:
        env_python.unlink()


def test_missing_and_duplicate_candidates_are_dropped(tmp_path):
    venv = _python(tmp_path, 'venv')
    save_config({'wd14': {'python': venv},
                 'masks': {'python': venv},
                 'face_scoring': {'python': str(tmp_path / 'gone' / 'python.exe')}})
    found = w.candidate_pythons()
    assert found.count(venv) == 1
    assert all(pathlib.Path(p).is_file() for p in found)


def test_no_cuda_anywhere_warns_instead_of_skipping(monkeypatch, tmp_path):
    venv = _python(tmp_path, 'venv')
    save_config({'wd14': {'python': venv, 'device': 'cuda'}})
    _cuda_in(monkeypatch)
    assert w.run_python() == venv
    assert 'no Python on this machine has a CUDA onnxruntime' in w.gpu_warning()
    save_config({'wd14': {'device': 'auto'}})
    assert 'runs on the CPU' in w.gpu_warning()
    save_config({'wd14': {'device': 'cpu'}})
    assert w.gpu_warning() is None


def test_no_warning_when_a_cuda_env_exists(monkeypatch, tmp_path):
    venv = _python(tmp_path, 'venv')
    quality = _python(tmp_path, 'quality')
    save_config({'wd14': {'python': venv, 'device': 'cuda'},
                 'masks': {'python': quality}})
    _cuda_in(monkeypatch, quality)
    assert capabilities.wd14_gpu_available() is True
    assert w.gpu_warning() is None
    assert w.gpu_refusal() is None


def test_the_tag_pass_runs_in_the_cuda_interpreter(monkeypatch, tmp_path):
    venv = _python(tmp_path, 'venv')
    quality = _python(tmp_path, 'quality')
    save_config({'wd14': {'python': venv, 'device': 'cuda'},
                 'masks': {'python': quality}})
    _cuda_in(monkeypatch, quality)
    img = tmp_path / 'a.png'
    img.write_bytes(b'x')
    used = {}

    def fake_run(python, _script, _payload, _budget, _on_line):
        used['python'] = python
        return json.dumps({'ok': True, 'results': {}}), [], 0, False

    monkeypatch.setattr(w, 'run_infer_script', fake_run)
    assert w.tag_images([str(img)])['ok'] is True
    assert used['python'] == quality


# --- the worker's batching -------------------------------------------------------

@pytest.fixture
def infer_module():
    if str(INFER) not in sys.path:
        sys.path.insert(0, str(INFER))
    spec = importlib.util.spec_from_file_location('wd14_infer_batch_test',
                                                  INFER / 'wd14_infer.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cuda_batches_are_bigger_than_cpu_batches(infer_module):
    m = infer_module
    assert m._batch_size(None, 'CUDAExecutionProvider') == m._BATCH_GPU
    assert m._batch_size(None, 'CPUExecutionProvider') == m._BATCH
    assert m._BATCH_GPU > m._BATCH
    assert m._batch_size(64, 'CPUExecutionProvider') == 64
    assert m._batch_size(10_000, 'CUDAExecutionProvider') == m._BATCH_MAX
    assert m._batch_size('junk', 'CUDAExecutionProvider') == m._BATCH_GPU


def test_parallel_loading_keeps_order_and_reports_bad_files(infer_module, monkeypatch):
    m = infer_module

    def fake_load(path, size):
        if 'bad' in path:
            return path, None, 'unreadable'
        return path, f'tensor:{path}', None
    monkeypatch.setattr(m, '_load', fake_load)
    images = [f'img{i}.png' for i in range(7)] + ['bad.png']
    batches = list(m._loaded_batches(images, 448, 3, workers=4))
    assert [len(b) for b in batches] == [3, 3, 2]
    flat = [entry for b in batches for entry in b]
    assert [p for p, _t, _e in flat] == images
    assert flat[-1] == ('bad.png', None, 'unreadable')
    assert list(m._loaded_batches([], 448, 3)) == []


def test_vectorised_scores_keep_ratings_in_full_and_threshold_the_rest(
        infer_module, monkeypatch, capsys, tmp_path):
    import io
    import types

    import numpy as np
    m = infer_module
    probs = np.array([[0.9, 0.2, 0.7, 0.4, 0.99],
                      [0.1, 0.8, 0.3, 0.6, 0.0]], dtype='float32')

    class Session:
        def __init__(self, *_a, **_k):
            pass

        def get_providers(self):
            return ['CUDAExecutionProvider']

        def get_inputs(self):
            return [types.SimpleNamespace(shape=[1, 448, 448, 3], name='in')]

        def get_outputs(self):
            return [types.SimpleNamespace(name='out')]

        def run(self, _out, feed):
            return [probs[:len(feed['in'])]]

    ort = types.ModuleType('onnxruntime')
    ort.get_available_providers = lambda: ['CUDAExecutionProvider']
    ort.SessionOptions = lambda: types.SimpleNamespace(add_session_config_entry=lambda *_: None)
    ort.InferenceSession = Session
    monkeypatch.setitem(sys.modules, 'onnxruntime', ort)
    monkeypatch.setitem(sys.modules, 'cv2', types.ModuleType('cv2'))
    monkeypatch.setattr(m, '_load', lambda p, size: (p, np.zeros((448, 448, 3), 'float32'), None))
    models = tmp_path / 'models'
    models.mkdir()
    # columns: rating, general, character, general, (5th column has no name)
    (models / 'selected_tags.csv').write_text(
        'tag_id,name,category,count\n1,general_r,9,1\n2,solo,0,1\n3,hero,4,1\n4,hat,0,1\n',
        encoding='utf-8')
    monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps(
        {'images': ['a.png', 'b.png'], 'threshold': 0.5, 'models_dir': str(models),
         'model_files': {}, 'device': 'cuda'})))
    m.main()
    out = json.loads([ln for ln in capsys.readouterr().out.splitlines()
                      if ln.startswith('{')][-1])
    assert out['results'] == {'a.png': {'hero': 0.7}, 'b.png': {'solo': 0.8, 'hat': 0.6}}
    assert out['ratings'] == {'a.png': {'general_r': 0.9}, 'b.png': {'general_r': 0.1}}
