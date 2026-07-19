# FORK_NOTES — socrasteeze/lora-dataset-studio

This is a personal fork of
[perfectgf/lora-dataset-studio](https://github.com/perfectgf/lora-dataset-studio).
This file is the always-current list of where the fork diverges from upstream —
read it before merging upstream and update it in the same commit as any change
that adds a new divergence (same convention as the sibling ai-toolkit fork).

## Divergence 1: local-only generation (API engines removed)

The fork generates exclusively on the local Klein engine (ComfyUI). The two
cloud API engines — **Nano Banana (Gemini)** and **ChatGPT (`gpt-image-2`)**,
including the experimental ChatGPT-subscription OAuth lane — were removed
end to end (2026-07-19).

Deleted files (upstream has them, the fork doesn't — an upstream merge will
try to resurrect them; delete them again unless re-adopting the engines):

- `backend/app/services/nanobanana.py`
- `backend/app/services/chatgpt_image.py`
- `backend/app/services/chatgpt_oauth.py`
- `backend/tests/test_engines.py`
- `backend/tests/test_chatgpt_oauth.py`

Upstream files with fork edits (merge conflicts will concentrate here; the
fork side is almost always "the API-engine half of this file is gone"):

- `backend/app/config.py` — `SECRET_KEYS` without GEMINI/OPENAI;
  `engines` defaults are `{default: 'klein', enabled: ['klein']}`.
- `backend/app/capabilities.py` — no gemini/openai probes, `engines.klein` only,
  no `chatgpt_subscription` block.
- `backend/app/routes/settings.py` — no gemini/openai test targets, no
  chatgpt-oauth routes, diagnostic reports Klein only.
- `backend/app/routes/datasets.py` — generate/regenerate are Klein-only
  (non-klein generator → clear 400).
- `backend/app/services/face_dataset_service.py` — API fan-out section removed;
  `LEGACY_API_ENGINE_TAGS` keeps rows created by the removed engines
  regenerating through Klein (their `klein_model` column holds an engine tag).
- `backend/app/services/face_variations.py` — API identity-guard wrappers
  (`wrap_variation`, `IDENTITY_GUARD*`) removed; Klein wrapper untouched.
- Frontend: `VariationCatalog.jsx` (single Klein card), `EnginesSection.jsx`
  (Klein LoRA presets only), `SetupPage.jsx`/`useSetupSteps.js` (no API-keys
  step), `CapabilitiesContext.jsx`, `settings/registry.js`,
  `OverviewSection.jsx`, `helpRegistry.js`, `diagnosticFormat.js`,
  `DatasetWorkspace.jsx`, `ReferencePanel.jsx` + their tests.
- Docs: `README.md`, `docs/guide/settings-reference.md`,
  `docs/guide/getting-started.md`, `docs/guide/using-the-app.md`
  ("API-only" run mode is described as "curation-only").

Compatibility notes:

- Existing datasets with API-generated rows keep working; those rows
  regenerate through Klein (see `LEGACY_API_ENGINE_TAGS`).
- Stale `engines.*` keys and GEMINI/OPENAI entries in an existing
  `config.json`/`.env` are ignored — nothing needs manual cleanup.

## Merge routine

```
git remote add upstream https://github.com/perfectgf/lora-dataset-studio  # once
git fetch upstream && git merge upstream/main
# re-delete any resurrected API-engine files, re-run:
#   backend:  python -m pytest
#   frontend: node --test   (from frontend/)
# then rebuild dist in a separate build(frontend): commit.
```
