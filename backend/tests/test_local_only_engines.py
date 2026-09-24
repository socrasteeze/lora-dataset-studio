"""Local-only fork guard, backend half (FORK_NOTES.md Divergence 1).

The frontend has had a contract test for this since the fork began, but it
checks exact UI SENTENCES ("Powers Nano Banana", "Gemini API key"). That is
precise and far too narrow, as the 2026-07-27 sync demonstrated: upstream added
a `PREVIEW_ENGINES` tuple and an `_API_PREVIEW_ENGINES` dispatch branch to
`face_variations.py` — live plumbing for three removed engines — and it merged
with zero conflicts, zero forbidden phrases and a green suite. Nothing on the
backend was watching at all.

So this budgets the IDENTIFIERS. A handful of references are legitimate and
must stay:

  * `LEGACY_API_ENGINE_TAGS` — rows created by the removed engines still carry
    their tag in `klein_model`, and that tuple is what makes them regenerate
    through Klein instead of being handed to the loader as a model filename;
  * comments explaining the divergence, or why a legacy id resolves to Klein.

Hence a per-file budget rather than a ban: a listed file may not GROW, and an
unlisted file may not gain one at all.

WHEN THIS FAILS after a merge: read the new occurrence. Live plumbing for a
removed engine gets stripped — that is the point. A genuinely historical or
explanatory mention gets the file's number bumped here, with the reason in the
commit message. Never delete a legitimate legacy reference to make it pass:
`LEGACY_API_ENGINE_TAGS` disappearing is a data-compat bug, not a cleanup.
"""
import pathlib
import re

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
APP_DIR = REPO_ROOT / 'backend' / 'app'

CLOUD_ENGINE_IDENTIFIERS = re.compile(r'nanobanana|chatgpt|openrouter', re.I)

# path relative to backend/app -> how many references are expected there
ALLOWED_APP_CLOUD_REFS = {
    # Divergence comment: stale cloud keys are dropped from the engine ledger,
    # PLUS the six identifiers in _PRODUCT_SETTINGS['api_engines'] (2026-09
    # V2/plugin sync) — a historical-ownership entry so settings_view() and
    # settings_secret_keys() correctly hide a removed plugin's legacy config
    # keys/secrets from an install with no api_engines plugin loaded. Data, not
    # a dispatch path: nothing here can start a cloud generation.
    'config.py': 8,
    # Comment: the removed API engines are not probed as capabilities.
    'capabilities.py': 1,
    # Comment + the clear 400 a client still sending a cloud engine id gets.
    'routes/datasets.py': 2,
    # Comment: legacy 'chatgpt:'/'nanobanana:' prefixes on stored rows.
    'routes/settings.py': 2,
    # LEGACY_API_ENGINE_TAGS itself, plus the comment above it and one
    # explanatory note on an OpenRouter-era failure mode.
    'services/face_dataset_service.py': 6,
}


def _counts():
    found = {}
    for path in sorted(APP_DIR.rglob('*.py')):
        hits = CLOUD_ENGINE_IDENTIFIERS.findall(
            path.read_text(encoding='utf-8', errors='ignore'))
        if hits:
            found[path.relative_to(APP_DIR).as_posix()] = len(hits)
    return found


def test_no_new_cloud_engine_identifier_reaches_backend_app():
    problems = []
    for file, n in sorted(_counts().items()):
        allowed = ALLOWED_APP_CLOUD_REFS.get(file)
        if allowed is None:
            problems.append(f'{file}: {n} cloud-engine reference(s) in a file that should have none')
        elif n > allowed:
            problems.append(f'{file}: {n} cloud-engine references, was {allowed}')
    assert not problems, (
        'Cloud-engine identifiers (Nano Banana / ChatGPT / OpenRouter) grew in '
        'backend/app:\n  ' + '\n  '.join(problems)
        + '\nSee FORK_NOTES.md Divergence 1. Strip live plumbing; only raise the '
          'budget for a genuinely historical mention, and say why in the commit.')


def test_the_cloud_reference_budget_has_no_stale_entries():
    """A file that drops to zero should lose its entry, or the budget quietly
    pre-authorises a future reintroduction in that exact file."""
    counts = _counts()
    stale = sorted(f for f in ALLOWED_APP_CLOUD_REFS if f not in counts)
    assert not stale, f'remove these from ALLOWED_APP_CLOUD_REFS: {stale}'


# The original budget above only ever covered backend/app. A whole ChatGPT
# motion-writer subsystem (video_motion_prompt.py, video_reference_prompt.py,
# a MotionModelDialog.jsx radio option, guide/help prose) reached bundled/
# through the V2/plugin sync and passed Gates 1-6 clean — this scan did not
# reach it, and only a manual attribution grep over the whole diff caught it
# (2026-09-24; see FORK_NOTES.md's changelog row for that date). Widened here
# so the next leak of this shape fails a NAMED test instead of a human grep.
OTHER_ROOTS = {
    # A bundled plugin's own tests exercise its refusal text on purpose
    # (e.g. asserting a 'chatgpt' legacy tag is rejected) — excluded the same
    # way ALLOWED_APP_CLOUD_REFS never counts backend/tests.
    'bundled': REPO_ROOT / 'bundled',
    'backend/lds_sdk': REPO_ROOT / 'backend' / 'lds_sdk',
}
# path relative to REPO_ROOT -> how many references are expected there
ALLOWED_OTHER_CLOUD_REFS = {
    # The generic, OPTIONAL api_engines integration shim: every call routes
    # through `_provider()`, which raises ServiceUnavailable unless the
    # (excluded, never-shipped) api_engines plugin is loaded — it cannot
    # reach a real API on this fork. Predates this budget; nothing imports it
    # any more after the 2026-09-24 strip, so it is inert, not live plumbing.
    'backend/lds_sdk/api_engines.py': 8,
}


def _other_counts():
    found = {}
    for label, root in OTHER_ROOTS.items():
        for path in sorted(root.rglob('*.py')) + sorted(root.rglob('*.js')) + sorted(root.rglob('*.jsx')):
            parts = path.relative_to(root).parts
            if 'tests' in parts or '__pycache__' in parts or 'node_modules' in parts or 'dist' in parts:
                continue
            if path.name.endswith(('.test.js', '.test.mjs', '.test.jsx')):
                continue
            hits = CLOUD_ENGINE_IDENTIFIERS.findall(
                path.read_text(encoding='utf-8', errors='ignore'))
            if hits:
                found[f'{label}/{path.relative_to(root).as_posix()}'] = len(hits)
    return found


def test_no_new_cloud_engine_identifier_reaches_bundled_plugins_or_lds_sdk():
    problems = []
    for file, n in sorted(_other_counts().items()):
        allowed = ALLOWED_OTHER_CLOUD_REFS.get(file)
        if allowed is None:
            problems.append(f'{file}: {n} cloud-engine reference(s) in a file that should have none')
        elif n > allowed:
            problems.append(f'{file}: {n} cloud-engine references, was {allowed}')
    assert not problems, (
        'Cloud-engine identifiers (Nano Banana / ChatGPT / OpenRouter) reached a '
        'bundled plugin or lds_sdk:\n  ' + '\n  '.join(problems)
        + '\nSee FORK_NOTES.md Divergence 1. Strip live plumbing; only raise the '
          'budget for a genuinely inert, gated reference, and say why in the commit.')


def test_the_other_roots_cloud_reference_budget_has_no_stale_entries():
    counts = _other_counts()
    stale = sorted(f for f in ALLOWED_OTHER_CLOUD_REFS if f not in counts)
    assert not stale, f'remove these from ALLOWED_OTHER_CLOUD_REFS: {stale}'


def test_legacy_api_engine_tags_still_exist():
    """The budget must never be satisfied by DELETING the compatibility path.

    Rows generated by the removed engines store their engine tag in
    `klein_model`; `LEGACY_API_ENGINE_TAGS` is what routes them back through
    Klein on regeneration instead of treating the tag as a model filename.
    """
    from app.services import face_dataset_service as svc
    assert set(svc.LEGACY_API_ENGINE_TAGS) >= {'nanobanana', 'chatgpt', 'openrouter'}
    assert 'klein' not in svc.LEGACY_API_ENGINE_TAGS
    assert set(svc.API_ENGINES) == set(), 'API_ENGINES must stay empty on this fork'
