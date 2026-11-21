"""Resolve Score weights from synthetic caches without loading a model."""
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from infer.clip_local_weights import resolve_clip_checkpoint


REPO = 'models--timm--vit_large_patch14_clip_224.openai'
SAFETENSORS = 'open_clip_model.safetensors'
LEGACY_SAFETENSORS = 'open_clip_pytorch_model.safetensors'
LEGACY_BIN = 'open_clip_pytorch_model.bin'


def _write(path, content='placeholder'):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
    return path


@pytest.mark.parametrize('ref', [None, 'main-revision', 'missing-revision'])
def test_hub_cache_prefers_safetensors(tmp_path, ref):
    repo = tmp_path / 'hub' / REPO
    snapshot = repo / 'snapshots' / 'main-revision'
    expected = _write(snapshot / SAFETENSORS)
    _write(snapshot / LEGACY_SAFETENSORS)
    _write(snapshot / LEGACY_BIN)
    if ref is not None:
        _write(repo / 'refs' / 'main', ref + '\n')
    if ref == 'main-revision':
        _write(repo / 'snapshots' / 'first-by-name' / SAFETENSORS)
    models_root = tmp_path / 'models'
    _write(models_root / 'open_clip' / SAFETENSORS)
    env = {'HF_HOME': str(tmp_path), 'XDG_CACHE_HOME': str(tmp_path / 'xdg')}
    assert resolve_clip_checkpoint(models_root, env=env) == str(expected)


@pytest.mark.parametrize('filename', [LEGACY_SAFETENSORS, LEGACY_BIN])
@pytest.mark.parametrize('layout', ['hub', 'custom hub', 'custom flat'])
def test_legacy_checkpoints(tmp_path, filename, layout):
    models_root = tmp_path / 'models'
    paths = {
        'hub': tmp_path / 'hub' / REPO / 'snapshots' / 'cached-revision',
        'custom hub': models_root / 'open_clip' / REPO / 'snapshots' / 'cached-revision',
        'custom flat': models_root / 'open_clip',
    }
    expected = _write(paths[layout] / filename)
    env = {'HF_HOME': str(tmp_path), 'XDG_CACHE_HOME': str(tmp_path / 'xdg')}
    assert resolve_clip_checkpoint(models_root, env=env) == str(expected)


@pytest.mark.parametrize('configured', [True, False])
def test_default_cache_works_with_unset_or_empty_hf_home(tmp_path, configured):
    env = {'XDG_CACHE_HOME': str(tmp_path)}
    if configured:
        empty_home = tmp_path / 'empty-hf-home'
        empty_home.mkdir()
        env['HF_HOME'] = str(empty_home)
    expected = _write(tmp_path / 'huggingface' / 'hub' / REPO
                      / 'snapshots' / 'cached-revision' / SAFETENSORS)
    assert resolve_clip_checkpoint(env=env) == str(expected)


@pytest.mark.parametrize('override', ['HF_HUB_CACHE', 'HUGGINGFACE_HUB_CACHE'])
def test_hub_override_wins_over_hf_home(tmp_path, override):
    hub_override = tmp_path / 'hub-override'
    hf_home = tmp_path / 'hf-home'
    suffix = Path(REPO) / 'snapshots' / 'cached-revision' / SAFETENSORS
    expected = _write(hub_override / suffix)
    home_checkpoint = _write(hf_home / 'hub' / suffix)
    _write(tmp_path / 'huggingface' / 'hub' / suffix)
    env = {override: str(hub_override), 'HF_HOME': str(hf_home), 'XDG_CACHE_HOME': str(tmp_path)}

    assert resolve_clip_checkpoint(env=env) == str(expected)
    expected.unlink()
    assert resolve_clip_checkpoint(env=env) == str(home_checkpoint)


def test_unreadable_ref_still_scans_cached_snapshots(tmp_path, monkeypatch):
    repo = tmp_path / 'hub' / REPO
    ref = _write(repo / 'refs' / 'main', 'main-revision\n')
    expected = _write(repo / 'snapshots' / 'cached-revision' / SAFETENSORS)
    original = Path.read_text

    def deny_ref(path, *args, **kwargs):
        if path == ref:
            raise PermissionError('synthetic access denial')
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, 'read_text', deny_ref)
    env = {'HF_HOME': str(tmp_path), 'XDG_CACHE_HOME': str(tmp_path)}
    assert resolve_clip_checkpoint(env=env) == str(expected)


def test_unreadable_snapshot_directory_is_skipped(tmp_path, monkeypatch):
    hf_home = tmp_path / 'hf-home'
    repo = hf_home / 'hub' / REPO
    _write(repo / 'snapshots' / 'blocked' / SAFETENSORS)
    original = Path.iterdir

    def deny(path):
        if path == repo / 'snapshots':
            raise PermissionError('synthetic access denial')
        return original(path)

    monkeypatch.setattr(Path, 'iterdir', deny)
    env = {'HF_HOME': str(hf_home), 'XDG_CACHE_HOME': str(tmp_path)}
    with pytest.raises(FileNotFoundError) as exc:
        resolve_clip_checkpoint(env=env)
    assert str(repo) in str(exc.value)

    expected = _write(tmp_path / 'huggingface' / 'hub' / REPO
                      / 'snapshots' / 'cached-revision' / SAFETENSORS)
    assert resolve_clip_checkpoint(env=env) == str(expected)


def test_missing_checkpoint_explains_local_offline_search(tmp_path):
    models_root = tmp_path / 'models'
    env = {'HF_HOME': str(tmp_path), 'XDG_CACHE_HOME': str(tmp_path),
           'HF_HUB_CACHE': str(tmp_path / 'hub-override')}
    with pytest.raises(FileNotFoundError) as exc:
        resolve_clip_checkpoint(models_root, env=env)
    error = str(exc.value)
    for expected in (str(tmp_path / 'hub-override' / REPO), str(tmp_path / 'hub' / REPO),
                     str(tmp_path / 'huggingface' / 'hub' / REPO), str(models_root / 'open_clip'),
                     SAFETENSORS, LEGACY_SAFETENSORS, LEGACY_BIN):
        assert expected in error
    assert 'Inference is offline and will not download weights' in error
    assert 'Failed to download weights for tag' not in error


@pytest.mark.parametrize('cached', [True, False])
def test_nsfw_head_uses_local_default_snapshot(tmp_path, monkeypatch, cached):
    from infer import bank_score_infer

    hf_home = tmp_path / 'empty-hf-home'
    hf_home.mkdir()
    monkeypatch.setenv('HF_HOME', str(hf_home))
    monkeypatch.setenv('XDG_CACHE_HOME', str(tmp_path))
    monkeypatch.delenv('HF_HUB_CACHE', raising=False)
    monkeypatch.delenv('HUGGINGFACE_HUB_CACHE', raising=False)
    repo = tmp_path / 'huggingface' / 'hub' / 'models--Marqo--nsfw-image-detection-384'
    snapshot = repo / 'snapshots' / 'cached-revision'
    if cached:
        _write(repo / 'refs' / 'main', 'cached-revision\n')
        for filename in ('config.json', 'model.safetensors'):
            _write(snapshot / filename)

    processor = object()
    model = Mock()
    model.to.return_value = model
    model.config.id2label = {1: 'nsfw'}
    load_processor = Mock(return_value=processor)
    load_model = Mock(return_value=model)
    monkeypatch.setitem(sys.modules, 'transformers', SimpleNamespace(
        AutoImageProcessor=SimpleNamespace(from_pretrained=load_processor),
        AutoModelForImageClassification=SimpleNamespace(from_pretrained=load_model),
    ))

    bundle, ok, reason = bank_score_infer._load_nsfw('cpu')

    if cached:
        assert (bundle, ok, reason) == ((model, processor, 1), True, None)
        hub = str(tmp_path / 'huggingface' / 'hub')
        load_processor.assert_called_once_with(
            'Marqo/nsfw-image-detection-384', cache_dir=hub, local_files_only=True)
        load_model.assert_called_once_with(
            'Marqo/nsfw-image-detection-384', cache_dir=hub, local_files_only=True)
        model.to.assert_called_once_with('cpu')
    else:
        assert bundle is None and not ok
        assert 'No local Marqo/nsfw-image-detection-384 snapshot' in reason
        assert 'Inference is offline' in reason
        load_processor.assert_not_called()
        load_model.assert_not_called()
