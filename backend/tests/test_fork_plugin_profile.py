"""Fork distribution keeps reviewed sources and refuses stock replacements."""
import json
from pathlib import Path
import zipfile

import pytest

from app.plugins import fork_profile, official
from app.plugins.discovery import development_bundles
from app.plugins.install import ArchiveError, inspect_plugin_zip
from app.plugins.loader import _discover
from app.plugins.registry import PluginRegistry


def _manifest(root, plugin_id, *, bundled=True):
    directory = root / plugin_id
    directory.mkdir(parents=True)
    value = {'id': plugin_id, 'name': plugin_id, 'version': '1.0.0',
             'api': 1, 'bundled': bundled, 'requires': [], 'owns': {}}
    (directory / 'plugin.json').write_text(json.dumps(value))
    return value


def _marker(path, distribution, **extra):
    value = {'schema_version': 1, 'distribution': distribution, **extra}
    path.write_text(json.dumps(value), encoding='utf-8')


def test_fork_discovery_loads_only_curated_sources(tmp_path, monkeypatch):
    monkeypatch.setenv('LDS_PLUGIN_DISTRIBUTION', 'fork')
    monkeypatch.setattr(official, 'bundled_retired', lambda _: True)
    for plugin_id in (*fork_profile.RESERVED, 'unreviewed'):
        _manifest(tmp_path, plugin_id)
    registry = PluginRegistry()
    _discover(registry, tmp_path, bundled=True)
    assert development_bundles()
    assert set(registry.records) == fork_profile.ENABLED
    assert all(record.bundled for record in registry.records.values())


def test_fork_refuses_external_copies_even_without_bundled_directory(tmp_path, monkeypatch):
    monkeypatch.setenv('LDS_PLUGIN_DISTRIBUTION', 'fork')
    for plugin_id in fork_profile.RESERVED:
        _manifest(tmp_path, plugin_id, bundled=False)
    _manifest(tmp_path, 'sample.feature', bundled=False)
    registry = PluginRegistry()
    _discover(registry, tmp_path, bundled=False)
    assert set(registry.records) == {'sample.feature'}
    assert {record['dir'] for record in registry.invalid} == fork_profile.RESERVED


@pytest.mark.parametrize('plugin_id', sorted(fork_profile.RESERVED))
def test_fork_refuses_archive_replacement(tmp_path, monkeypatch, plugin_id):
    monkeypatch.setenv('LDS_PLUGIN_DISTRIBUTION', 'fork')
    archive = tmp_path / 'plugin.zip'
    with zipfile.ZipFile(archive, 'w') as stream:
        stream.writestr('plugin.json', json.dumps({'id': plugin_id}))
    with pytest.raises(ArchiveError, match='managed by the fork repository'):
        inspect_plugin_zip(archive, official=True)


def test_store_profile_remains_explicitly_available(monkeypatch):
    monkeypatch.setenv('LDS_PLUGIN_DISTRIBUTION', 'store')
    monkeypatch.delenv('LDS_BUNDLED_DIR', raising=False)
    assert not development_bundles()
    assert not fork_profile.refuses_archive('video')


def test_fork_build_marker_boots_the_exact_curated_registry_without_hidden_env(tmp_path, monkeypatch):
    marker = tmp_path / 'plugin-build.json'
    _marker(marker, 'fork', plugins=list(fork_profile._POLICY['enabled']))
    monkeypatch.delenv('LDS_PLUGIN_DISTRIBUTION', raising=False)
    monkeypatch.delenv('LDS_BUNDLED_DIR', raising=False)
    monkeypatch.setattr(fork_profile, 'BUILD_MARKER', marker)
    root = Path(__file__).resolve().parents[2] / 'bundled'
    registry = PluginRegistry()
    _discover(registry, root, bundled=True)
    assert development_bundles()
    assert list(registry.records) == sorted(fork_profile.ENABLED)
    assert set(registry.records) == fork_profile.ENABLED


@pytest.mark.parametrize('value, message', [
    ({'schema_version': 1, 'distribution': 'fork', 'plugins': ['video']}, 'curated fork policy'),
    ({'schema_version': 1, 'distribution': 'fork', 'plugins': list(reversed(fork_profile._POLICY['enabled']))}, 'curated fork policy'),
    ({'schema_version': 1, 'distribution': 'store', 'plugins': list(fork_profile._POLICY['enabled'])}, 'Only a fork'),
    ({'schema_version': 99, 'distribution': 'fork', 'plugins': list(fork_profile._POLICY['enabled'])}, 'unsupported schema'),
    ({'schema_version': 1, 'distribution': 'mystery'}, 'unknown distribution'),
])
def test_invalid_or_contradictory_build_marker_fails_closed(tmp_path, monkeypatch, value, message):
    marker = tmp_path / 'plugin-build.json'
    marker.write_text(json.dumps(value), encoding='utf-8')
    monkeypatch.delenv('LDS_PLUGIN_DISTRIBUTION', raising=False)
    monkeypatch.setattr(fork_profile, 'BUILD_MARKER', marker)
    with pytest.raises(ValueError, match=message):
        development_bundles()


def test_explicit_distribution_overrides_a_build_marker_for_fixtures(tmp_path, monkeypatch):
    marker = tmp_path / 'plugin-build.json'
    marker.write_text('{broken', encoding='utf-8')
    monkeypatch.setattr(fork_profile, 'BUILD_MARKER', marker)
    monkeypatch.setenv('LDS_PLUGIN_DISTRIBUTION', 'development')
    assert development_bundles()
    monkeypatch.setenv('LDS_PLUGIN_DISTRIBUTION', 'store')
    assert not fork_profile.active()


def test_curated_source_manifests_exist_and_dependencies_stay_inside_profile():
    root = Path(__file__).resolve().parents[2] / 'bundled'
    for plugin_id in fork_profile.ENABLED:
        manifest = json.loads((root / plugin_id / 'plugin.json').read_text())
        assert manifest['id'] == plugin_id
        assert manifest['bundled'] is True
        assert set(manifest['requires']) <= fork_profile.ENABLED
    assert not (fork_profile.ENABLED & {'api_engines', 'cloud_training', 'civitai_publish'})
