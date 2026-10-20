"""Hardware budgets and batch failure boundaries, without real models or CUDA."""
import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def pipeline(monkeypatch):
    path = Path(__file__).resolve().parents[1] / 'infer' / 'score_pipeline.py'
    monkeypatch.syspath_prepend(str(path.parent))
    spec = importlib.util.spec_from_file_location('score_pipeline_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('cpus,cuda,free_gib,workers,threads,batch', [
    (24, True, 24, 8, 1, 8),
    (8, True, 5, 2, 1, 4),
    (4, True, 2, 1, 1, 2),
    (2, True, 1, 1, 1, 1),
    (24, False, 32, 1, 4, 1),
    (None, False, 0, 1, 1, 1),
])
def test_plan_reserves_cpu_capacity_and_caps_cuda_batches(pipeline, cpus, cuda, free_gib, workers, threads, batch):
    plan = pipeline.score_plan(cpus, cuda, free_gib * 1024 ** 3)
    assert plan['prepare_workers'] == workers
    assert plan['torch_threads'] == threads
    assert plan['batch_size'] == batch
    assert plan['prefetch'] <= 16


def test_native_limits_keep_stricter_settings_and_restore_on_failure(pipeline, monkeypatch):
    monkeypatch.setattr(os, 'cpu_count', lambda: 24)
    monkeypatch.setenv('OMP_NUM_THREADS', '1')
    monkeypatch.setenv('MKL_NUM_THREADS', '32')
    monkeypatch.delenv('OPENBLAS_NUM_THREADS', raising=False)
    monkeypatch.setenv('NUMEXPR_NUM_THREADS', 'invalid')
    before = dict(os.environ)
    with pytest.raises(RuntimeError, match='synthetic'):
        with pipeline.native_thread_limits():
            assert os.environ['OMP_NUM_THREADS'] == '1'
            assert os.environ['MKL_NUM_THREADS'] == '4'
            assert os.environ['OPENBLAS_NUM_THREADS'] == '4'
            assert os.environ['NUMEXPR_NUM_THREADS'] == '4'
            raise RuntimeError('synthetic')
    assert dict(os.environ) == before


def _entries(torch, values):
    entries = []
    for index, value in enumerate(values):
        tensor = torch.tensor([float(value), 1.0, 2.0, 3.0])
        entries.append((f'example-{index}', {'error': None, 'clip': tensor,
                        'nsfw': {'pixel_values': tensor.unsqueeze(0)}, 'nsfw_error': None}))
    return entries


class _Clip:
    def encode_image(self, inputs):
        return inputs


def _heads(torch):
    aesthetic = lambda inputs: inputs.sum(dim=-1, keepdim=True)

    def nsfw(pixel_values):
        values = pixel_values.sum(dim=-1)
        return SimpleNamespace(logits=torch.stack((values, -values), dim=-1))

    return aesthetic, (nsfw, None, 1)


def test_batch_results_match_single_image_models_and_keep_head_failures_local(pipeline):
    torch = pytest.importorskip('torch')
    np = pytest.importorskip('numpy')
    entries = _entries(torch, [1, 2, 3, 4])
    entries[1][1]['error'] = ValueError('invalid image')
    entries[2][1]['nsfw_error'] = ValueError('invalid head input')
    aesthetic, nsfw = _heads(torch)
    batched = pipeline.predict_batch(entries, torch, _Clip(), aesthetic, nsfw, 'cpu', str)
    singles = [pipeline.predict_batch([entry], torch, _Clip(), aesthetic, nsfw, 'cpu', str)[0]
               for entry in entries]
    for batch, single in zip(batched, singles):
        assert batch['error'] is single['error']
        assert batch['heads'] == single['heads']
        assert batch['aesthetic'] == single['aesthetic']
        assert batch['nsfw'] == single['nsfw']
        if batch['error'] is None:
            np.testing.assert_allclose(batch['embedding'], single['embedding'])
    assert batched[2]['embedding'] is not None and batched[2]['aesthetic'] is not None
    assert batched[2]['nsfw'] is None


def test_oom_halves_batches_without_skipping_or_reordering_images(pipeline, monkeypatch):
    torch = pytest.importorskip('torch')
    entries = _entries(torch, range(8))
    attempted = []
    released = []
    predict = pipeline.predict_batch

    def limited(part, *args):
        attempted.append(len(part))
        if len(part) > 2:
            raise torch.cuda.OutOfMemoryError('synthetic OOM')
        return predict(part, *args)

    monkeypatch.setattr(pipeline, 'predict_batch', limited)
    monkeypatch.setattr(torch.cuda, 'empty_cache', lambda: released.append(True))
    plan = {**pipeline.score_plan(24, True, 24 * 1024 ** 3), 'device': 'cpu'}
    aesthetic, nsfw = _heads(torch)
    results = pipeline.predict_adaptive(entries, plan, torch, _Clip(), aesthetic, nsfw, str, lambda _: None)
    assert attempted == [8, 4, 2, 2, 2, 2]
    assert len(released) == 2 and plan['batch_size'] == 2
    assert len(results) == 8 and all(item['error'] is None for item in results)
    assert [round(float(item['embedding'][0]), 6) for item in results] == sorted(
        round(float(item['embedding'][0]), 6) for item in results)


def test_one_failed_head_does_not_remove_good_images_or_other_scores(pipeline):
    torch = pytest.importorskip('torch')
    entries = _entries(torch, [1, -2, 3])
    _, nsfw = _heads(torch)

    def aesthetic(inputs):
        if (inputs[:, 0] < 0).any():
            raise ValueError('synthetic head failure')
        return inputs.sum(dim=-1, keepdim=True)

    plan = {**pipeline.score_plan(24, True, 24 * 1024 ** 3), 'device': 'cpu'}
    results = pipeline.predict_adaptive(entries, plan, torch, _Clip(), aesthetic, nsfw, str, lambda _: None)
    assert all(item['error'] is None for item in results)
    assert all(item['nsfw'] is not None for item in results)
    assert results[0]['aesthetic'] is not None and results[2]['aesthetic'] is not None
    assert results[1]['aesthetic'] is None
    assert 'aesthetic' in results[1]['heads']
