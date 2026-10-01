"""joycaption_infer.py: batched generation, batch splitting, and bf16 selection.

Runs the worker's main() against fake torch/transformers modules: no model,
GPU or network. Each image is a solid colour whose red value becomes its caption,
so the tests can check which caption reached which image."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import pathlib
import sys
import types

from PIL import Image

INFER = pathlib.Path(__file__).resolve().parents[1] / 'infer'
EOH, EOT, PAD = 10, 11, 12
GIB = 2 ** 30


class _OOM(RuntimeError):
    pass


class _T:
    """A fake tensor: either one image (tag) or a batch of input rows."""
    def __init__(self, tags=None, rows=None):
        self.tags = list(tags or [])
        self.rows = rows

    def unsqueeze(self, _dim):
        return self

    def to(self, *_args, **_kwargs):
        return self

    def __truediv__(self, _other):
        return self


def _fake_torch(free_gib, oom_over=None):
    torch = types.ModuleType('torch')
    torch.bfloat16 = 'bfloat16'
    torch.long = 'long'
    torch.nn = types.SimpleNamespace(Linear=lambda *a, **k: None)
    torch.tensor = lambda rows, **_k: _T(rows=rows)
    torch.ones_like = lambda t: t
    torch.cat = lambda parts: _T(tags=[tag for p in parts for tag in p.tags])
    torch.inference_mode = contextlib.nullcontext
    torch.cuda = types.SimpleNamespace(
        mem_get_info=lambda: (free_gib * GIB, 32 * GIB),
        empty_cache=lambda: None,
        OutOfMemoryError=_OOM)
    torch.generate_calls = []
    torch.oom_over = oom_over
    return torch


def _fake_transformers(torch, loads):
    transformers = types.ModuleType('transformers')
    transformers.__version__ = '4.50.0'

    class Tokenizer:
        def convert_tokens_to_ids(self, token):
            return {'<|end_header_id|>': EOH, '<|eot_id|>': EOT}[token]

        def apply_chat_template(self, *_a, **_k):
            return 'prompt'

        def encode(self, *_a, **_k):
            return [1]

        def decode(self, ids, **_k):
            return ' '.join(f'red{i}' for i in ids if i not in (PAD,))

    class AutoTokenizer:
        @staticmethod
        def from_pretrained(*_a, **_k):
            return Tokenizer()

    class BitsAndBytesConfig:
        def __init__(self, **_k):
            pass

    weight = types.SimpleNamespace(dtype='bfloat16', device='vision')
    vision = types.SimpleNamespace(vision_model=types.SimpleNamespace(
        head=types.SimpleNamespace(attention=types.SimpleNamespace(embed_dim=1)),
        embeddings=types.SimpleNamespace(patch_embedding=types.SimpleNamespace(weight=weight))))
    language = types.SimpleNamespace(get_input_embeddings=lambda: types.SimpleNamespace(
        weight=types.SimpleNamespace(device='language')))

    class Row(list):
        def tolist(self):
            return list(self)

    class Model:
        device = 'model'
        config = types.SimpleNamespace(image_token_index=99, image_seq_length=1)
        model = types.SimpleNamespace(vision_tower=vision, language_model=language)

        def eval(self):
            return self

        def generate(self, input_ids, pixel_values, **_k):
            n = len(pixel_values.tags)
            assert len(input_ids.rows) == n, 'one prompt row per image'
            torch.generate_calls.append(n)
            if torch.oom_over is not None and n > torch.oom_over:
                raise _OOM('CUDA out of memory')
            return [Row([1, EOH, tag, EOT, PAD]) for tag in pixel_values.tags]

    class LlavaForConditionalGeneration:
        @staticmethod
        def from_pretrained(model_id, **kwargs):
            loads.append((model_id, kwargs))
            return Model()

    transformers.AutoTokenizer = AutoTokenizer
    transformers.BitsAndBytesConfig = BitsAndBytesConfig
    transformers.LlavaForConditionalGeneration = LlavaForConditionalGeneration
    return transformers


def _run(monkeypatch, capsys, tmp_path, images, free_gib, oom_over=None, home=None):
    torch = _fake_torch(free_gib, oom_over)
    loads = []
    functional = types.ModuleType('torchvision.transforms.functional')
    functional.pil_to_tensor = lambda image: _T(tags=[image.getpixel((0, 0))[0]])
    functional.normalize = lambda t, *_a: t
    transforms = types.ModuleType('torchvision.transforms')
    transforms.__path__ = []
    transforms.functional = functional
    torchvision = types.ModuleType('torchvision')
    torchvision.__path__ = []
    torchvision.transforms = transforms
    monkeypatch.setitem(sys.modules, 'torch', torch)
    monkeypatch.setitem(sys.modules, 'transformers', _fake_transformers(torch, loads))
    monkeypatch.setitem(sys.modules, 'torchvision', torchvision)
    monkeypatch.setitem(sys.modules, 'torchvision.transforms', transforms)
    monkeypatch.setitem(sys.modules, 'torchvision.transforms.functional', functional)
    home = home or tmp_path / 'home'
    monkeypatch.setenv('HF_HOME', str(home / 'hf'))
    monkeypatch.setenv('HOME', str(home))
    monkeypatch.setenv('USERPROFILE', str(home))
    if str(INFER) not in sys.path:
        sys.path.insert(0, str(INFER))
    spec = importlib.util.spec_from_file_location('joycaption_infer_batch_test',
                                                  INFER / 'joycaption_infer.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, '_model_is_cached', lambda: True)
    monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps({'images': images})))
    assert module.main() == 0
    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines()
             if line.startswith('{')]
    return module, torch, loads, lines


def _images(tmp_path, reds):
    paths = []
    for red in reds:
        p = tmp_path / f'img{red}.png'
        Image.new('RGB', (64, 64), (red, 0, 0)).save(p)
        paths.append(str(p))
    return paths


def test_batches_follow_free_vram_and_keep_each_caption_on_its_image(
        tmp_path, monkeypatch, capsys):
    paths = _images(tmp_path, [21, 22, 23, 24, 25])
    _module, torch, _loads, lines = _run(monkeypatch, capsys, tmp_path, paths, free_gib=3)
    assert torch.generate_calls == [3, 2]
    per_image = [line for line in lines if 'path' in line]
    assert [line['i'] for line in per_image] == [1, 2, 3, 4, 5]
    assert {line['path']: line['caption'] for line in per_image} == {
        p: f'red{red}' for p, red in zip(paths, [21, 22, 23, 24, 25])}
    assert lines[-1]['errors'] == {}


def test_no_cuda_reading_falls_back_to_one_image_at_a_time(tmp_path, monkeypatch, capsys):
    paths = _images(tmp_path, [31, 32])
    _module, torch, _loads, lines = _run(monkeypatch, capsys, tmp_path, paths, free_gib=0)
    assert torch.generate_calls == [1, 1]
    assert len(lines[-1]['captions']) == 2


def test_out_of_memory_batch_is_split_and_later_batches_shrink(tmp_path, monkeypatch, capsys):
    paths = _images(tmp_path, [41, 42, 43, 44, 45, 46])
    _module, torch, _loads, lines = _run(monkeypatch, capsys, tmp_path, paths,
                                         free_gib=4, oom_over=2)
    # 4 fails -> halves of 2 succeed; batch size is now 2 for the rest.
    assert torch.generate_calls == [4, 2, 2, 2]
    assert len(lines[-1]['captions']) == 6
    assert lines[-1]['errors'] == {}


def test_unreadable_image_is_reported_without_losing_its_batch(tmp_path, monkeypatch, capsys):
    paths = _images(tmp_path, [51, 52])
    bad = tmp_path / 'broken.png'
    bad.write_bytes(b'not an image')
    paths.insert(1, str(bad))
    _module, torch, _loads, lines = _run(monkeypatch, capsys, tmp_path, paths, free_gib=8)
    assert torch.generate_calls == [2]
    assert set(lines[-1]['captions']) == {paths[0], paths[2]}
    assert set(lines[-1]['errors']) == {str(bad)}


def _snapshot(hub, model_id, shards, present):
    snap = hub / ('models--' + model_id.replace('/', '--')) / 'snapshots' / 'abc'
    snap.mkdir(parents=True)
    (snap / 'model.safetensors.index.json').write_text(
        json.dumps({'weight_map': {f'w{i}': s for i, s in enumerate(shards)}}), encoding='utf-8')
    for name in ['config.json', 'tokenizer.json', 'tokenizer_config.json', *present]:
        (snap / name).write_bytes(b'{}')


def test_bf16_is_used_from_a_complete_local_snapshot_with_room(tmp_path, monkeypatch, capsys):
    home = tmp_path / 'home'
    module_id = 'fancyfeast/llama-joycaption-beta-one-hf-llava'
    shards = ['model-1.safetensors', 'model-2.safetensors']
    _snapshot(home / '.cache' / 'huggingface' / 'hub', module_id, shards, shards)
    paths = _images(tmp_path, [61])
    module, _torch, loads, _lines = _run(monkeypatch, capsys, tmp_path, paths,
                                         free_gib=24, home=home)
    model_id, kwargs = loads[0]
    assert model_id == module.FULL_MODEL_ID == module_id
    assert kwargs['local_files_only'] is True
    assert 'quantization_config' not in kwargs


def test_incomplete_snapshot_or_small_gpu_keeps_nf4(tmp_path, monkeypatch, capsys):
    home = tmp_path / 'home'
    module_id = 'fancyfeast/llama-joycaption-beta-one-hf-llava'
    shards = ['model-1.safetensors', 'model-2.safetensors']
    _snapshot(home / 'hf' / 'hub', module_id, shards, shards[:1])   # a shard is missing
    paths = _images(tmp_path, [71])
    module, _torch, loads, _lines = _run(monkeypatch, capsys, tmp_path, paths,
                                         free_gib=24, home=home)
    assert loads[0][0] == module.MODEL_ID
    assert 'quantization_config' in loads[0][1]


def test_complete_snapshot_without_vram_headroom_keeps_nf4(tmp_path, monkeypatch, capsys):
    home = tmp_path / 'home'
    module_id = 'fancyfeast/llama-joycaption-beta-one-hf-llava'
    shards = ['model-1.safetensors']
    _snapshot(home / 'hf' / 'hub', module_id, shards, shards)
    paths = _images(tmp_path, [81])
    module, _torch, loads, _lines = _run(monkeypatch, capsys, tmp_path, paths,
                                         free_gib=12, home=home)
    assert loads[0][0] == module.MODEL_ID
