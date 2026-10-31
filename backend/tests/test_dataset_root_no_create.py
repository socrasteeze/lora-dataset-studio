"""Resolving the legacy datasets root never creates it.

With an installation destination set, new Datasets go there, but the legacy
`paths.dataset_images_root` folder kept reappearing empty: every path lookup,
folder-conflict check and Settings › Storage listing created it."""
import json

from app import config as cfg
from app.services import storage_locations


def _point_root_at(tmp_path, monkeypatch):
    legacy = tmp_path / 'legacy-datasets'
    settings = tmp_path / 'config.json'
    settings.write_text(json.dumps({'paths': {'dataset_images_root': str(legacy)}}), encoding='utf-8')
    monkeypatch.setenv('LDS_CONFIG', str(settings))
    monkeypatch.setattr(cfg, '_cache', None)
    return legacy


def test_read_only_resolution_leaves_no_folder(tmp_path, monkeypatch):
    legacy = _point_root_at(tmp_path, monkeypatch)
    assert cfg.dataset_images_root(create=False) == legacy
    assert not legacy.exists()
    entry = next(d for d in storage_locations._DEFS if d['key'] == 'datasets')
    assert entry['resolve']() == legacy
    storage_locations.sizes(['datasets'])
    assert not legacy.exists()
    monkeypatch.setattr(cfg, '_cache', None)


def test_the_writing_default_still_creates_it(tmp_path, monkeypatch):
    legacy = _point_root_at(tmp_path, monkeypatch)
    assert cfg.dataset_images_root() == legacy
    assert legacy.is_dir()
    monkeypatch.setattr(cfg, '_cache', None)
