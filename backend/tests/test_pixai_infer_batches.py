"""PixAI worker contracts with fake tensors/models and invented image fixtures."""
from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace

from PIL import Image
import pytest


class Tensor:
    def __init__(self, values):
        self.values = list(values)


@pytest.fixture
def worker(monkeypatch):
    path = Path(__file__).resolve().parents[1] / 'infer' / 'pixai_infer.py'
    spec = importlib.util.spec_from_file_location('pixai_batch_contract', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    torch = SimpleNamespace(
        cat=lambda parts, dim=0: Tensor([v for part in parts for v in part.values]),
        cuda=SimpleNamespace(empty_cache=lambda: None))
    monkeypatch.setitem(sys.modules, 'torch', torch)
    monkeypatch.setattr(module, '_log', lambda _message: None)

    def prepare(path, _tagger):
        value = int(path.rsplit('-', 1)[1])
        return {'model_input': Tensor([value])}, {'transparent': False, 'sha256': '0' * 64}

    monkeypatch.setattr(module, '_prepare_image', prepare)
    return module


class Tagger:
    def __init__(self, *, oom_above=None, bad_value=None, on_forward=None):
        self.oom_above = oom_above
        self.bad_value = bad_value
        self.on_forward = on_forward
        self.calls = []

    def forward(self, inputs):
        values = inputs['model_input'].values
        self.calls.append(list(values))
        if self.oom_above is not None and len(values) > self.oom_above:
            raise RuntimeError('CUDA out of memory')
        if self.bad_value in values:
            raise RuntimeError('invented image-specific failure')
        if self.on_forward:
            self.on_forward()
        return {'results': [{'general': {f'marker_{v}': .9}} for v in values]}


def paths(count):
    return [f'input-{n}' for n in range(count)]


def assert_alignment(result, count, failed=()):
    for n, path in enumerate(paths(count)):
        if n in failed:
            assert path in result['errors']
            assert path not in result['results']
        else:
            assert result['results'][path] == {'general': {f'marker_{n}': .9}}
            assert path in result['image_facts']


def test_cuda_uses_bounded_batches_and_keeps_image_alignment(worker):
    model = Tagger()
    result = worker._tag_images(model, paths(9), device_index=0)
    assert [len(call) for call in model.calls] == [4, 4, 1]
    assert result['stats']['device'] == 'cuda'
    assert result['stats']['processed'] == 9
    assert_alignment(result, 9)


def test_cpu_keeps_single_image_execution(worker):
    model = Tagger()
    result = worker._tag_images(model, paths(3), device_index=-1)
    assert [len(call) for call in model.calls] == [1, 1, 1]
    assert result['stats']['device'] == 'cpu'
    assert_alignment(result, 3)


def test_cuda_oom_retries_smaller_and_retains_every_result(worker):
    model = Tagger(oom_above=2)
    result = worker._tag_images(model, paths(8), device_index=0)
    assert [len(call) for call in model.calls] == [4, 2, 2, 2, 2]
    assert result['stats']['batch_size'] == 2
    assert result['stats']['batch_retries'] == 1
    assert_alignment(result, 8)


def test_image_failure_is_isolated_and_later_batches_recover(worker):
    model = Tagger(bad_value=2)
    result = worker._tag_images(model, paths(8), device_index=0)
    assert len(model.calls[0]) == 4
    assert len(model.calls[-1]) == 4
    assert result['stats']['processed'] == 8
    assert_alignment(result, 8, failed=(2,))


def test_invalid_batch_shape_never_shifts_captions_to_other_images(worker):
    class Incomplete(Tagger):
        def forward(self, inputs):
            output = super().forward(inputs)
            output['results'].pop()
            return output

    result = worker._tag_images(Incomplete(), paths(4), device_index=0)
    assert not result['results']
    assert len(result['errors']) == 4
    assert result['stats']['processed'] == 4


def test_stop_exits_after_the_current_batch_without_processing_the_rest(worker, tmp_path):
    stop = tmp_path / 'stop'
    model = Tagger(on_forward=lambda: stop.write_text('stop', encoding='ascii'))
    result = worker._tag_images(model, paths(8), device_index=0, cancel_file=str(stop))
    assert result['cancelled'] is True
    assert len(model.calls) == 1
    assert len(result['results']) == 4
    assert result['stats']['processed'] == 4
    assert_alignment(result, 4)


@pytest.fixture
def image_worker():
    path = Path(__file__).resolve().parents[1] / 'infer' / 'pixai_infer.py'
    spec = importlib.util.spec_from_file_location('pixai_image_contract', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('alpha,expected', [(255, False), (0, True), (128, True)])
def test_transparency_is_a_pixel_fact_not_a_mode_guess(image_worker, tmp_path, alpha, expected):
    source = tmp_path / 'input.png'
    Image.new('RGBA', (16, 12), (100, 120, 140, alpha)).save(source)
    seen = {}

    def preprocess(frame):
        seen['mode'] = frame.mode
        return {'model_input': 'invented tensor'}

    _, facts = image_worker._prepare_image(str(source), SimpleNamespace(preprocess=preprocess))
    assert facts['transparent'] is expected
    assert facts['sha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
    assert seen['mode'] == 'RGBA'


def test_preparation_preserves_exif_orientation(image_worker, tmp_path):
    source = tmp_path / 'input.jpg'
    image = Image.new('RGB', (16, 10), 'blue')
    exif = image.getexif()
    exif[274] = 6
    image.save(source, exif=exif)
    seen = {}

    def preprocess(frame):
        seen['size'] = frame.size
        return {'model_input': 'invented tensor'}

    _, facts = image_worker._prepare_image(str(source), SimpleNamespace(preprocess=preprocess))
    assert seen['size'] == (10, 16)
    assert (facts['width'], facts['height']) == (10, 16)


def test_corrupt_image_is_rejected_before_model_preprocessing(image_worker, tmp_path):
    source = tmp_path / 'input.png'
    source.write_bytes(b'invented corrupt image')

    def unexpected(_frame):
        pytest.fail('Invalid image reached the model processor')

    with pytest.raises(ValueError):
        image_worker._prepare_image(str(source), SimpleNamespace(preprocess=unexpected))
