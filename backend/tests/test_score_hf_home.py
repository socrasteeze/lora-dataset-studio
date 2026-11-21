"""Infer launch environments share the configured cache and stay offline."""
from contextlib import nullcontext
from pathlib import Path

import pytest

from app import config as cfg
from app.services import infer_env


def _assert_offline(env):
    for key in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_DATASETS_OFFLINE'):
        assert env[key] == '1'
    assert Path(env['LDS_INFER_OFFLINE_HELPER']).name == 'offline_network.py'


def test_plain_worker_env_keeps_ambient_home(tmp_path, monkeypatch):
    hf_home = tmp_path / 'hf-cache'
    monkeypatch.setattr(cfg, 'aitoolkit_path', {'hf_home': hf_home}.__getitem__)
    monkeypatch.delenv('HF_HOME', raising=False)
    assert 'HF_HOME' not in infer_env.worker_env()

    monkeypatch.setenv('HF_HOME', 'inherited-cache')
    env = infer_env.worker_env()
    assert env['HF_HOME'] == 'inherited-cache'
    _assert_offline(env)


@pytest.mark.parametrize('score', [True, False])
def test_bank_launch_sets_home_only_for_score(tmp_path, monkeypatch, score):
    from app.services import image_bank_service as banks, infer_pool

    hf_home = tmp_path / 'hf-cache'
    python = str(tmp_path / 'python.exe')
    script = banks._SCORE_SCRIPT if score else banks._SEMANTIC_SCRIPT
    monkeypatch.setattr(cfg, 'aitoolkit_path', {'hf_home': hf_home}.__getitem__)
    monkeypatch.setenv('HF_HOME', 'inherited-cache')
    seen = {}

    def intercept(argv, *, env):
        seen.update(argv=argv, env=env)
        raise OSError('launch intercepted')

    monkeypatch.setattr(infer_pool, 'popen', intercept)
    with pytest.raises(OSError, match='launch intercepted'):
        banks._drive_infer_subprocess(None, python, script, {}, tmp_path / 'cache',
                                     None, nullcontext())

    assert seen['argv'] == [python, '-s', script]
    assert seen['env']['HF_HOME'] == (str(hf_home) if score else 'inherited-cache')
    assert seen['env']['PYTHONNOUSERSITE'] == '1'
    _assert_offline(seen['env'])


def test_score_override_preserves_explicit_home(tmp_path, monkeypatch):
    hf_home = tmp_path / 'hf-cache'
    monkeypatch.setattr(cfg, 'aitoolkit_path', {'hf_home': hf_home}.__getitem__)
    base = {'HF_HOME': 'base-cache'}
    assert infer_env.score_hf_home_env(base=base) == {}
    assert infer_env.score_hf_home_env(extra={'HF_HOME': 'extra-cache'}) == {}
    assert infer_env.score_hf_home_env(extra={'HF_HOME': None}) == {}


def test_score_without_ai_toolkit_leaves_home_alone(monkeypatch):
    monkeypatch.setattr(cfg, 'aitoolkit_path', {'hf_home': None}.__getitem__)
    monkeypatch.delenv('HF_HOME', raising=False)
    env = infer_env.worker_env(**infer_env.score_hf_home_env())
    assert 'HF_HOME' not in env
    _assert_offline(env)

    monkeypatch.setenv('HF_HOME', 'inherited-cache')
    env = infer_env.worker_env(**infer_env.score_hf_home_env())
    assert env['HF_HOME'] == 'inherited-cache'
    _assert_offline(env)


@pytest.mark.parametrize('configured', [True, False])
def test_peer_score_environment_override(tmp_path, monkeypatch, configured):
    from app.services import peer_worker

    hf_home = tmp_path / 'hf-cache' if configured else None
    monkeypatch.setattr(cfg, 'aitoolkit_path', {'hf_home': hf_home}.__getitem__)
    score_env = peer_worker._SCRIPT_ENV_VARS['bank_score_infer.py']
    assert score_env() == ({'HF_HOME': str(hf_home)} if configured else {})


@pytest.mark.parametrize('tower', ['text', 'frames'])
def test_clip_encoder_launches_inherit_home(tmp_path, monkeypatch, tower):
    from app.services import clip_image_encoder, clip_text_encoder

    hf_home = tmp_path / 'hf-cache'
    python = str(tmp_path / 'python.exe')
    monkeypatch.setattr(cfg, 'aitoolkit_path', {'hf_home': hf_home}.__getitem__)
    monkeypatch.setattr(cfg, 'get', {'bank_scoring.python': python,
                                   'bank_scoring.models_root': ''}.__getitem__)
    monkeypatch.setenv('OMP_NUM_THREADS', '16')
    monkeypatch.setattr(infer_env, 'bounded_native_environment',
                        lambda env: dict(env, OMP_NUM_THREADS='4'))
    seen = {}

    def intercept(argv, *, env, **kwargs):
        seen.update(argv=argv, env=env)
        raise OSError('launch intercepted')

    monkeypatch.setattr(clip_text_encoder.subprocess, 'Popen', intercept)
    if tower == 'text':
        start = clip_text_encoder._start_worker_locked
        error = clip_text_encoder.TextEncodeError
        script = 'clip_text_infer.py'
    else:
        start = clip_image_encoder.ImageEncoder()._start
        error = clip_image_encoder.ImageEncodeError
        script = 'clip_image_embed_infer.py'

    with pytest.raises(error, match='launch intercepted'):
        start()

    assert seen['argv'][:2] == [python, '-s']
    assert Path(seen['argv'][2]).name == script
    assert seen['env']['HF_HOME'] == str(hf_home)
    assert seen['env']['PYTHONNOUSERSITE'] == '1'
    assert seen['env']['OMP_NUM_THREADS'] == ('16' if tower == 'text' else '4')
    _assert_offline(seen['env'])


def test_weights_warning_checks_cache_without_models_root(tmp_path, monkeypatch):
    from app.services import clip_text_encoder

    hf_home = tmp_path / 'hf-cache'
    monkeypatch.setattr(cfg, 'aitoolkit_path', {'hf_home': hf_home}.__getitem__)
    monkeypatch.setattr(cfg, 'get', lambda key, default=None: '')

    def missing(root, *, env):
        assert not root
        assert env['HF_HOME'] == str(hf_home)
        raise FileNotFoundError('OpenAI ViT-L-14 weights are missing. Searched synthetic cache.')

    monkeypatch.setattr(clip_text_encoder, 'resolve_clip_checkpoint', missing)
    assert clip_text_encoder.weights_warning() == 'OpenAI ViT-L-14 weights are missing.'
