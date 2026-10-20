"""Face cache write frequency and Stop durability with synthetic worker inputs."""
import importlib.util
import io
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import types

from PIL import Image
import pytest


@pytest.mark.parametrize('interval,stop,expected', [(3600, False, [6]),
                                                  (0, False, [2, 4, 6, 6]),
                                                  (3600, True, [3])])
def test_face_checkpoints_limit_full_rewrites_and_stop_flushes(tmp_path, monkeypatch, interval, stop, expected):
    np = pytest.importorskip('numpy')
    directory = Path(__file__).resolve().parents[1] / 'infer'
    monkeypatch.syspath_prepend(str(directory))
    ort = types.ModuleType('onnxruntime')
    ort.get_available_providers = lambda: []
    ort.SessionOptions = lambda: SimpleNamespace(add_session_config_entry=lambda *_: None)
    cv2 = types.ModuleType('cv2')
    cv2.IMREAD_COLOR = 1
    cv2.BORDER_CONSTANT = 0
    cv2.imdecode = lambda *_: np.zeros((12, 16, 3), dtype='uint8')
    cv2.copyMakeBorder = lambda image, *_args, **_kwargs: image
    insightface = types.ModuleType('insightface')
    insightface.__path__ = []
    app = types.ModuleType('insightface.app')
    app.FaceAnalysis = lambda **_: SimpleNamespace(prepare=lambda **_: None, get=lambda _: [])
    for name, module in (('onnxruntime', ort), ('cv2', cv2),
                         ('insightface', insightface), ('insightface.app', app)):
        monkeypatch.setitem(sys.modules, name, module)
    spec = importlib.util.spec_from_file_location('face_checkpoint_test', directory / 'face_embed_infer.py')
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    monkeypatch.setattr(worker, '_repair_nested_antelopev2', lambda *_: None)
    monkeypatch.setattr(worker, '_discard_incomplete_pack', lambda *_: None)
    monkeypatch.setattr(worker, 'time', SimpleNamespace(monotonic=lambda: 0))
    monkeypatch.setattr(worker, 'CACHE_EVERY', 2)
    monkeypatch.setattr(worker, 'CACHE_SAVE_SECONDS', interval)
    cancel = tmp_path / 'worker.cancel'

    def progress(line):
        if stop and line.startswith('[embed] 3/'):
            cancel.write_text('stop', encoding='utf-8')

    monkeypatch.setattr(worker, '_log', progress)
    images = []
    for index in range(6):
        path = tmp_path / f'example-{index}.png'
        Image.new('RGB', (16, 12), (index, 20, 40)).save(path, 'PNG')
        images.append(str(path))
    cache = tmp_path / 'cache.npz'
    writes = []
    flush = worker._flush_cache

    def tracked(path, entries):
        writes.append(len(entries))
        return flush(path, entries)

    monkeypatch.setattr(worker, '_flush_cache', tracked)
    monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps({
        'images': images, 'cache': str(cache), 'cancel_file': str(cancel), 'device': 'cpu',
    })))
    output = io.StringIO()
    monkeypatch.setattr(sys, 'stdout', output)
    assert worker.main() == 0
    result = json.loads(output.getvalue().splitlines()[-1])
    assert writes == expected
    assert len(worker._load_cache(str(cache))) == (3 if stop else 6)
    assert bool(result.get('cancelled')) is stop
