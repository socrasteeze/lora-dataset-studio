import json
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    'stage_fork_plugins', Path(__file__).resolve().parents[2] / 'packaging/stage_fork_plugins.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
stage = module.stage


def _plugin(root, plugin_id, *, bundled=True):
    folder = root / 'bundled' / plugin_id
    (folder / 'frontend').mkdir(parents=True)
    (folder / 'plugin.json').write_text(json.dumps({
        'id': plugin_id, 'bundled': bundled,
    }), encoding='utf-8')
    (folder / 'frontend' / 'index.js').write_text('export default {}', encoding='utf-8')
    return folder


def test_stage_copies_only_policy_plugins_with_runtime_resources(tmp_path):
    (tmp_path / 'fork-plugins.json').write_text(json.dumps({
        'enabled': ['alpha', 'bravo'], 'held': ['held'], 'excluded': ['excluded'],
    }), encoding='utf-8')
    for plugin_id in ('alpha', 'bravo', 'held', 'excluded', 'unreviewed'):
        _plugin(tmp_path, plugin_id)
    wheel = tmp_path / 'bundled' / 'alpha' / 'resources' / 'wheels' / 'fixture.whl'
    wheel.parent.mkdir(parents=True)
    wheel.write_bytes(b'wheel')
    test_file = tmp_path / 'bundled' / 'alpha' / 'tests' / 'test_private.py'
    test_file.parent.mkdir()
    test_file.write_text('not runtime', encoding='utf-8')
    secret = tmp_path / 'bundled' / 'alpha' / '.env'
    secret.write_text('SECRET=fixture', encoding='utf-8')
    residue = ('backup.zip', 'helper.exe', 'unreviewed.whl', 'production.env', 'state.db')
    for name in residue:
        (tmp_path / 'bundled' / 'alpha' / name).write_bytes(b'fixture')
    destination = tmp_path / 'staged'
    assert stage(tmp_path, destination) == ['alpha', 'bravo']
    assert {path.name for path in destination.iterdir()} == {'alpha', 'bravo'}
    assert (destination / 'alpha' / 'resources' / 'wheels' / 'fixture.whl').read_bytes() == b'wheel'
    assert not (destination / 'alpha' / 'tests').exists()
    assert not (destination / 'alpha' / '.env').exists()
    assert all(not (destination / 'alpha' / name).exists() for name in residue)


def test_stage_fails_closed_on_manifest_mismatch(tmp_path):
    (tmp_path / 'fork-plugins.json').write_text(json.dumps({
        'enabled': ['alpha'], 'held': [], 'excluded': [],
    }), encoding='utf-8')
    _plugin(tmp_path, 'alpha', bundled=False)
    with pytest.raises(ValueError, match='invalid manifest'):
        stage(tmp_path, tmp_path / 'first')


def test_stage_refuses_unsafe_policy_ids(tmp_path):
    (tmp_path / 'fork-plugins.json').write_text(json.dumps({
        'enabled': ['../escape'], 'held': [], 'excluded': [],
    }), encoding='utf-8')
    with pytest.raises(ValueError, match='valid curated'):
        stage(tmp_path, tmp_path / 'staged')


def test_stage_fails_closed_on_symlink(tmp_path):
    (tmp_path / 'fork-plugins.json').write_text(json.dumps({
        'enabled': ['alpha'], 'held': [], 'excluded': [],
    }), encoding='utf-8')
    folder = _plugin(tmp_path, 'alpha')
    link = folder / 'linked.py'
    try:
        link.symlink_to(folder / 'frontend' / 'index.js')
    except OSError:
        pytest.skip('symlinks unavailable')
    with pytest.raises(ValueError, match='symlink'):
        stage(tmp_path, tmp_path / 'second')
