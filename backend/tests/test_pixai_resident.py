"""Synthetic resident lifetime and bounded preparation regressions; no real model."""
from pathlib import Path
import sys
import threading
import time
from types import SimpleNamespace


def adapter(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / 'infer'))
    import pixai_resident
    loads = []
    library = SimpleNamespace(pipeline=lambda **kw: loads.append(kw) or object())
    monkeypatch.setitem(sys.modules, 'transformers', library)
    monkeypatch.setitem(sys.modules, 'torch', SimpleNamespace(cuda=SimpleNamespace(
        is_initialized=lambda: False, empty_cache=lambda: None)))
    monkeypatch.setattr(pixai_resident, 'prepare_workers', lambda: 4)
    folder = tmp_path / 'model'
    folder.mkdir()
    (folder / 'config.json').write_text('{}', encoding='utf-8')
    (folder / 'model.safetensors').write_bytes(b'invented weights')
    return pixai_resident, library, loads, folder


def module():
    obj = SimpleNamespace(_cancelled=lambda _path: False)
    obj._prepare_image = lambda path, _tagger: path

    def tag(tagger, images, **_kw):
        return {'results': [obj._prepare_image(p, tagger) for p in images], 'stats': {}}
    obj._tag_images = tag
    return obj


def test_model_loads_once_until_device_or_model_files_change(monkeypatch, tmp_path):
    a, library, loads, folder = adapter(monkeypatch, tmp_path)
    obj = module()
    a.enable(obj)
    first = library.pipeline(model=str(folder), device=0)
    assert library.pipeline(model=str(folder), device=0) is first
    assert len(loads) == 1
    assert library.pipeline(model=str(folder), device=-1) is not first
    assert len(loads) == 2
    (folder / 'config.json').write_text('{"revision": 2}', encoding='utf-8')
    library.pipeline(model=str(folder), device=-1)
    assert len(loads) == 3


def test_parallel_preparation_keeps_input_order_and_restores_the_worker(monkeypatch, tmp_path):
    a, _library, _loads, _folder = adapter(monkeypatch, tmp_path)
    obj = module()
    lock = threading.Lock()
    active = peak = 0

    def prepare(path, _tagger):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(.02)
        with lock:
            active -= 1
        return path
    obj._prepare_image = prepare
    a.enable(obj)
    images = [f'input-{i}' for i in range(16)]
    result = obj._tag_images(object(), images, device_index=0)
    assert result['results'] == images
    assert 1 < peak <= 4
    assert obj._prepare_image is prepare
    assert result['stats']['prefetch_images'] == 8


def test_cpu_keeps_sequential_preparation(monkeypatch, tmp_path):
    a, _library, _loads, _folder = adapter(monkeypatch, tmp_path)
    obj = module()
    prepare = obj._prepare_image
    a.enable(obj)
    result = obj._tag_images(object(), ['input-a', 'input-b'], device_index=-1)
    assert result['results'] == ['input-a', 'input-b']
    assert result['stats']['prepare_workers'] == 1
    assert obj._prepare_image is prepare


def test_lazy_transformers_replacement_is_the_module_that_gets_patched(monkeypatch, tmp_path):
    a, resolved, loads, folder = adapter(monkeypatch, tmp_path)
    factory = resolved.pipeline

    class LazyLibrary:
        @property
        def pipeline(self):
            sys.modules['transformers'] = resolved
            return factory
    monkeypatch.setitem(sys.modules, 'transformers', LazyLibrary())
    a.enable(module())
    first = resolved.pipeline(model=str(folder), device=0)
    assert resolved.pipeline(model=str(folder), device=0) is first
    assert len(loads) == 1
