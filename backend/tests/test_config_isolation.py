"""🧪 The suite must never read the developer's real config.json.

Found the hard way: two wrapper tests (test_klein_models, test_subject_types)
assert the SHIPPED default prompt. They take no `app` fixture, so they used the
default LDS_CONFIG — the real file at the repo root — and started failing the
moment the owner edited the Klein identity prompt in Settings. The mirror image
is worse: on a clean checkout those same tests pass for the wrong reason, so CI
could never catch the drift.

conftest's autouse `_isolate_config` redirects every test at an empty temporary
config. These cases pin that contract, so it can't silently regress.
"""
import json
import os

import app.config as cfg


def test_every_test_reads_an_isolated_config(tmp_path):
    """The redirect is in force WITHOUT asking for the `app` fixture — that's the
    exact hole the two wrapper tests fell through."""
    path = cfg._config_path()
    assert path != cfg.REPO_ROOT / 'config.json'
    assert str(tmp_path) not in str(cfg.REPO_ROOT)      # sanity: tmp is elsewhere
    assert not path.exists()                            # empty: nothing carried over


def test_identity_prompts_resolve_to_the_shipped_defaults():
    """The concrete symptom: with a real config an override leaks in and the
    'shipped default' assertions become machine-dependent."""
    from app.services import face_variations as fv
    for kind in fv.IDENTITY_PROMPT_KINDS:
        assert fv.get_identity_prompt(kind) == fv.identity_prompt_default(kind), kind
    assert fv.IDENTITY_GUARD_KLEIN in fv.wrap_variation_klein('a portrait', framing='bust')


def test_a_write_lands_in_the_temp_config_not_the_repo_one():
    """save_config() writes wherever LDS_CONFIG points; a leak here would edit the
    user's real settings from a test run."""
    repo_config = cfg.REPO_ROOT / 'config.json'
    before = repo_config.read_bytes() if repo_config.exists() else None
    cfg.save_config({'bank': {'dup_distance': 7}})
    assert cfg.get('bank.dup_distance') == 7
    written = json.loads(cfg._config_path().read_text(encoding='utf-8'))
    assert written['bank']['dup_distance'] == 7
    if before is not None:
        assert repo_config.read_bytes() == before      # untouched
    assert os.environ.get('LDS_CONFIG')                # the redirect is env-driven
