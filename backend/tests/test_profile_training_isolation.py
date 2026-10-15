"""Identical triggers in different profiles must never share mutable artifacts."""
from pathlib import Path

import pytest

ONE = '1' * 32
TWO = '2' * 32


def _select(monkeypatch, tmp_path, ident):
    monkeypatch.setenv('LDS_PROFILE_ID', ident)
    monkeypatch.setenv('LDS_DATA_DIR', str(tmp_path / ident / 'data'))


def test_named_training_paths_ignore_shared_output_overrides(app, tmp_path, monkeypatch):
    from app import config as cfg
    with app.app_context():
        cfg.save_config({'aitoolkit': {
            'dir': str(tmp_path / 'trainer'), 'datasets_dir': str(tmp_path / 'shared'),
            'output_dir': str(tmp_path / 'shared'),
        }})
        sets = []
        for ident in (ONE, TWO):
            _select(monkeypatch, tmp_path, ident)
            owned = [cfg.aitoolkit_path(kind) for kind in ('datasets', 'output', 'jobs')]
            assert all(path.is_relative_to(tmp_path / ident / 'data' / 'training') for path in owned)
            assert len(set(owned)) == 3
            sets.append(set(owned))
        assert sets[0].isdisjoint(sets[1])
        monkeypatch.setenv('LDS_PROFILE_ID', 'default')
        assert cfg.aitoolkit_path('output') == tmp_path / 'shared'
        assert cfg.aitoolkit_path('jobs') == tmp_path / 'trainer' / 'config' / 'generated'


@pytest.mark.parametrize('family', ['zimage', 'sdxl', 'krea', 'flux', 'flux2klein', 'anima', 'qwenimage21'])
def test_deployment_and_resolution_use_only_the_current_profile(app, tmp_path, monkeypatch, family):
    from app.services import comfy_model_paths as paths, lora_training as training
    from types import SimpleNamespace

    root = tmp_path / 'loras'
    monkeypatch.setattr(paths, 'write_root', lambda _kind: str(root))
    monkeypatch.setattr(paths, 'search_roots', lambda _kind: [str(root)])
    dataset = SimpleNamespace(train_type=family)
    folders = {}
    with app.app_context():
        for ident in ('default', ONE, TWO):
            _select(monkeypatch, tmp_path, ident)
            folder = Path(training._lora_dest_dir(dataset))
            folder.mkdir(parents=True)
            (folder / 'lora_example.safetensors').write_bytes(ident.encode())
            folders[ident] = folder
            relative = str((folder / 'lora_example.safetensors').relative_to(root))
            assert Path(training._resolve_deployed_path(family, relative)) == folder / 'lora_example.safetensors'
            assert list(map(Path, training._lora_family_dirs(family))) == [folder]
        assert len(set(folders.values())) == 3
        # A named profile cannot resolve Default's file or a sibling's file.
        for other in ('default', ONE):
            relative = str((folders[other] / 'lora_example.safetensors').relative_to(root))
            assert training._resolve_deployed_path(family, relative) is None


def test_cleanup_and_trigger_rename_cannot_modify_other_profiles(app, tmp_path, monkeypatch):
    from app import config as cfg
    from app.services import comfy_model_paths as paths, lora_training as training, trash

    root = tmp_path / 'loras'
    monkeypatch.setattr(paths, 'write_root', lambda _kind: str(root))
    monkeypatch.setattr(paths, 'search_roots', lambda _kind: [str(root)])
    removed = []

    def record(path, **_kwargs):
        removed.append(Path(path))
        return str(path)

    monkeypatch.setattr(trash, 'send_to_trash', record)
    files = {}
    with app.app_context():
        cfg.save_config({'aitoolkit': {'dir': str(tmp_path / 'trainer')}})
        for ident in ('default', ONE, TWO):
            _select(monkeypatch, tmp_path, ident)
            family = Path(training._lora_dest_dir_zimage())
            family.mkdir(parents=True)
            lora = family / 'lora_example.safetensors'
            lora.write_bytes(ident.encode())
            output = cfg.aitoolkit_path('output') / 'ulocal_example'
            output.mkdir(parents=True)
            (output / 'checkpoint.bin').write_bytes(ident.encode())
            exports = cfg.aitoolkit_path('datasets') / 'ulocal_example'
            exports.mkdir(parents=True)
            jobs = cfg.aitoolkit_path('jobs')
            jobs.mkdir(parents=True)
            job = jobs / 'ulocal_example.json'
            job.write_text('{}', encoding='utf-8')
            files[ident] = {lora, output, exports, job}
        _select(monkeypatch, tmp_path, ONE)
        training.purge_training_artifacts('local', 'example')
        assert set(removed) == files[ONE]
        assert set(removed).isdisjoint(files['default'] | files[TWO])
        assert all(path.exists() for path in files['default'] | files[TWO])
        result = training.rename_training_artifacts('local', 'example', 'changed')
        assert result['ok'] is True
        assert {Path(source) for source, _target in result['renamed']} == files[ONE]
        assert all(Path(target).exists() for _source, target in result['renamed'])
        assert all(path.exists() for path in files['default'] | files[TWO])


def test_automatic_checkpoint_picker_excludes_other_profiles(app, tmp_path, monkeypatch):
    from types import SimpleNamespace
    from app.services import lora_test_studio as studio

    filename = 'lora_example_000001000.safetensors'
    expected = {'default': f'z image/{filename}',
                ONE: f'z image/profiles/{ONE}/{filename}',
                TWO: f'z image/profiles/{TWO}/{filename}'}
    monkeypatch.setattr(studio, '_pool_for_family', lambda _family: [
        {'filename': value} for value in expected.values()])
    monkeypatch.setattr(studio, '_resolve_lora_abs_path', lambda _filename: None)
    dataset = SimpleNamespace(trigger_word='example', train_type='zimage')
    for ident, owned in expected.items():
        _select(monkeypatch, tmp_path, ident)
        assert [row['filename'] for row in studio._trigger_match_checkpoints(dataset)] == [owned]
