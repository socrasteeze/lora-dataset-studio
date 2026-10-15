"""The picker starts a separate backend without loading or stopping the app."""
from pathlib import Path

import pytest

import instance_profiles as profiles
import profile_launcher as launcher


def test_launcher_checks_safety_before_spawning(tmp_path, monkeypatch):
    store = profiles.ProfileStore(root=tmp_path, environ={})
    calls = []
    monkeypatch.setattr(store, 'check_other_work', lambda ident: calls.append(('check', ident)))
    monkeypatch.setattr(launcher.subprocess, 'Popen', lambda args, **kwargs: calls.append(('spawn', args, kwargs)))
    launcher.launch(store, 'default')
    assert calls[0] == ('check', 'default')
    assert Path(calls[1][1][-1]).name == 'supervise.py'
    assert calls[1][2]['env']['LDS_PROFILE_ID'] == 'default'


def test_busy_profile_does_not_spawn_or_terminate_anything(tmp_path, monkeypatch):
    store = profiles.ProfileStore(root=tmp_path, environ={})
    named = store.create('Example')
    monkeypatch.setattr(launcher.subprocess, 'Popen', lambda *_args, **_kwargs: pytest.fail('must not spawn'))
    with profiles.FileLease(store.home / 'active.lock'):
        with pytest.raises(profiles.ProfileError):
            launcher.launch(store, named['id'])
