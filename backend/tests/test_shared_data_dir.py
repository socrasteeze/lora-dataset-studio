"""Model weights and managed tool envs are shared across profiles.

A named profile's data dir is its own, but `models/` and `envs/` resolve to the
Default profile's (LDS_SHARED_DATA_DIR), and a blank `<tool>.python` answers
with the shared managed env when Setup built it there."""
import json
import os

import pytest

from app import config as cfg


@pytest.fixture()
def profile(tmp_path, monkeypatch):
    shared = tmp_path / 'default-data'
    own = tmp_path / 'profile-data'
    settings = tmp_path / 'profile-config.json'
    settings.write_text(json.dumps({'wd14': {'python': ''}, 'pixai': {'python': 'C:/custom/python.exe'}}),
                        encoding='utf-8')
    monkeypatch.setenv('LDS_DATA_DIR', str(own))
    monkeypatch.setenv('LDS_SHARED_DATA_DIR', str(shared))
    monkeypatch.setenv('LDS_CONFIG', str(settings))
    monkeypatch.delenv('LDS_PROFILES_HOME', raising=False)
    monkeypatch.setattr(cfg, '_cache', None)
    yield shared, own
    monkeypatch.setattr(cfg, '_cache', None)


def _fake_env(root, name):
    exe = root / 'envs' / name / ('Scripts' if os.name == 'nt' else 'bin') \
        / ('python.exe' if os.name == 'nt' else 'python')
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b'')
    return str(exe)


def test_models_and_envs_resolve_to_the_shared_data_dir(profile):
    shared, own = profile
    assert cfg.data_dir() == own
    assert cfg.models_dir() == shared / 'models'
    assert cfg.envs_dir() == shared / 'envs'


def test_a_blank_tool_python_falls_back_to_the_shared_managed_env(profile):
    shared, _own = profile
    assert cfg.get('wd14.python') == ''          # nothing built yet: the blank stays
    quality = _fake_env(shared, 'quality')
    assert cfg.get('wd14.python') == quality
    assert cfg.get('face_scoring.python') == quality
    # A configured interpreter always wins over the managed one.
    _fake_env(shared, 'pixai')
    assert cfg.get('pixai.python') == 'C:/custom/python.exe'
    # The stored settings are untouched: the fallback is read-time only.
    assert cfg.load_config()['wd14']['python'] == ''


def test_without_the_launcher_variable_the_shared_dir_is_this_profiles_own(tmp_path, monkeypatch):
    monkeypatch.setenv('LDS_DATA_DIR', str(tmp_path / 'data'))
    monkeypatch.delenv('LDS_SHARED_DATA_DIR', raising=False)
    monkeypatch.delenv('LDS_PROFILES_HOME', raising=False)
    assert cfg.shared_data_dir() == cfg.data_dir()


def test_a_named_profile_reads_the_default_data_dir_from_the_registry(tmp_path, monkeypatch):
    # A supervisor started before LDS_SHARED_DATA_DIR existed keeps its old
    # environment across a plain restart; the registry still names the Default.
    home = tmp_path / 'profiles'
    home.mkdir()
    (home / 'profiles.json').write_text(json.dumps({'version': 1, 'profiles': [
        {'id': 'default', 'name': 'Default', 'port': 5050,
         'paths': {'LDS_DATA_DIR': str(tmp_path / 'default-data')}},
        {'id': 'abc', 'name': 'Named', 'port': 5050,
         'paths': {'LDS_DATA_DIR': str(tmp_path / 'named-data')}},
    ]}), encoding='utf-8')
    monkeypatch.setenv('LDS_DATA_DIR', str(tmp_path / 'named-data'))
    monkeypatch.setenv('LDS_PROFILES_HOME', str(home))
    monkeypatch.setenv('LDS_PROFILE_ID', 'abc')
    monkeypatch.delenv('LDS_SHARED_DATA_DIR', raising=False)
    assert cfg.shared_data_dir() == tmp_path / 'default-data'
    monkeypatch.setenv('LDS_PROFILE_ID', 'default')
    assert cfg.shared_data_dir() == tmp_path / 'named-data'
