"""Header-only checks for inference exports selected as local training bases."""
import json
import struct

import pytest

from app.services import lora_training as lt
from app.services import model_integrity as mi


def _write_header(path, tensors, metadata=None):
    index = {}
    offset = 0
    for name, (dtype, shape, nbytes) in tensors.items():
        index[name] = {'dtype': dtype, 'shape': list(shape),
                       'data_offsets': [offset, offset + nbytes]}
        offset += nbytes
    if metadata:
        index['__metadata__'] = metadata
    blob = json.dumps(index).encode('utf-8')
    with open(path, 'wb') as handle:
        handle.write(struct.pack('<Q', len(blob)))
        handle.write(blob)
        handle.write(b'\0' * 16)
    return str(path)


def _bf16_model(path):
    return _write_header(path, {
        f'blocks.{i}.attn.wq.weight': ('BF16', [3072, 3072], 128)
        for i in range(20)
    })


def test_plain_bf16_base_is_accepted(tmp_path):
    path = _bf16_model(tmp_path / 'raw.safetensors')
    report = lt.assert_trainable_base_file(path)
    assert report['checked'] is True and report['quantized'] is False


def test_scaled_fp8_export_is_refused(tmp_path):
    path = _write_header(tmp_path / 'q.safetensors', {
        'blocks.0.attn.wq.weight': ('F8_E4M3', [3072, 3072], 128),
        'blocks.0.attn.wq.scale_weight': ('F32', [], 4),
        'scaled_fp8': ('F8_E4M3', [2], 2),
    })
    with pytest.raises(ValueError, match='inference-only quantized export'):
        lt.assert_trainable_base_file(path)


def test_modern_comfy_quant_metadata_is_refused(tmp_path):
    path = _write_header(
        tmp_path / 'mixed.safetensors',
        {'blocks.0.attn.wq.weight': ('F8_E4M3', [3072, 3072], 128),
         'blocks.0.attn.wq.comfy_quant': ('U8', [63], 63),
         'blocks.0.norm.scale': ('BF16', [3072], 8)},
        metadata={'_quantization_metadata': '{"format_version":"1.0"}'})
    report = mi.quantization_report(path)
    assert report['quantized'] is True
    assert '_quantization_metadata' in report['signals']


def test_unreadable_header_is_not_guessed_quantized(tmp_path):
    path = tmp_path / 'gate.safetensors'
    path.write_bytes(b'<!doctype html><html>licence gate</html>')
    report = mi.quantization_report(str(path))
    assert report['checked'] is False and report['quantized'] is False


def test_quantization_check_reads_header_only(tmp_path, monkeypatch):
    path = _bf16_model(tmp_path / 'raw.safetensors')
    reads = []
    real_open = mi._open

    class CountingReader:
        def __init__(self, handle):
            self.handle = handle

        def read(self, size=-1):
            reads.append(size)
            return self.handle.read(size)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            self.handle.close()
            return False

    monkeypatch.setattr(mi, '_open',
                        lambda *args, **kwargs: CountingReader(real_open(*args, **kwargs)))
    mi.quantization_report(path)
    assert reads and all(size > 0 for size in reads)
