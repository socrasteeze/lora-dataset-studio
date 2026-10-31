"""encode_queries sends every cache miss through ONE encoder call.

On CUDA the text worker is released after every call, so one call per phrase
meant one model load per phrase: the medium pass's prototypes took minutes."""
from collections import OrderedDict

import numpy as np
import pytest

from app.services import clip_text_encoder as enc


@pytest.fixture()
def encoder(monkeypatch):
    calls = []

    def fake_uncached(texts, models_root=None):
        calls.append(list(texts))
        out = []
        for i, _ in enumerate(texts):
            v = np.zeros(enc._CLIP_TEXT_DIMENSION, dtype='float32')
            v[i % enc._CLIP_TEXT_DIMENSION] = 2.0
            out.append(v)
        return out

    monkeypatch.setattr(enc, '_memory', OrderedDict())
    monkeypatch.setattr(enc, '_load_disk_cache', lambda: None)
    monkeypatch.setattr(enc, '_save_disk_cache', lambda: None)
    monkeypatch.setattr(enc, 'unavailable_reason', lambda **_: None)
    monkeypatch.setattr(enc, '_encode_uncached', fake_uncached)
    return calls


def test_misses_go_through_one_call_and_repeats_hit_the_cache(encoder):
    phrases = ['a photograph', 'an anime drawing', 'a 3D render', 'a photograph']
    vecs = enc.encode_queries(phrases)
    assert len(encoder) == 1
    assert encoder[0] == ['a photograph', 'an anime drawing', 'a 3d render']
    assert len(vecs) == 4
    assert all(abs(float(np.linalg.norm(v)) - 1.0) < 1e-5 for v in vecs)
    assert np.array_equal(vecs[0], vecs[3])
    enc.encode_queries(phrases)
    assert len(encoder) == 1, 'a second batch must be served from the cache'


def test_an_empty_query_is_refused_before_anything_starts(encoder):
    with pytest.raises(enc.TextEncodeError):
        enc.encode_queries(['a photograph', '   '])
    assert encoder == []
