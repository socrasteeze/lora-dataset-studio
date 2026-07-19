# FORK_NOTES — socrasteeze/lora-dataset-studio

This is a personal fork of
[perfectgf/lora-dataset-studio](https://github.com/perfectgf/lora-dataset-studio).
This file is the always-current list of where the fork diverges from upstream —
read it before merging upstream and update it in the same commit as any change
that adds a new divergence (same convention as the sibling ai-toolkit fork).

## Fork changelog (enhancements shipped on this fork)

Newest first. Add a row per shipped wave — this is the "what have I actually
done on this fork" ledger; the divergence sections below stay the *file-level*
merge map.

| Date | Commits | Enhancement |
|---|---|---|
| 2026-07-19 | *(this wave)* | **Configurable model paths everywhere** — every Klein model reference (UNET/TE/VAE pins, the consistency LoRA — now editable in Settings — and generation-LoRA preset rows) accepts a full absolute path as well as a ComfyUI-relative name; paths under any registered root auto-convert to loader names, with a three-state badge (found / not found / outside ComfyUI's folders). |
| 2026-07-19 | `1ca80bc` + dist `1398e56` | **Emoji-free UI** — stripped ~700 decorative emoji across the app, docs and comments; plain-text labels, monochrome state glyphs kept, real text where an emoji was a button's only content. The `🔞` label prefix is kept as a functional NSFW data marker. |
| 2026-07-19 | `59f0529`, `1b74d5b` | **PLAN.md** — the phased integration plan for the whole local stack (ComfyUI + SwarmUI + ai-toolkit + TagGUI) with LDS as the hub. |
| 2026-07-19 | `c56790d` + dist `6677553` | **Klein model-file pins** — Settings ▸ Image engine fields (`klein.unet` / `klein.text_encoder` / `klein.vae`) to name the exact loader files, incl. files outside `klein`-named folders and `extra_model_paths.yaml` roots; missing pins fall back to auto-detect with a visible "not found" badge. |
| 2026-07-19 | `738f2ec` + dist `035056a`, notes `b115182` | **Local-only generation** — removed the Nano Banana (Gemini) and ChatGPT (`gpt-image-2`) API engines end to end; Klein (ComfyUI) is the sole engine. Legacy API-generated rows regenerate through Klein. Divergence details in the sections below. |

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

## Divergence 2: Klein model-file pins

Optional `klein.unet` / `klein.text_encoder` / `klein.vae` config keys pin the
exact loader files, ahead of the auto-detection. All model references — the
pins, `klein.consistency_lora` (now a Settings field) and generation-LoRA
preset rows — also accept absolute paths, auto-converted to ComfyUI-relative
loader names when the file sits under a registered root
(`resolve_model_ref` in klein_edit_helper). Touched upstream files:
`backend/app/config.py` (defaults), `backend/app/services/klein_edit_helper.py`
(`_configured_model`, `klein_override_status`, resolver priority),
`backend/app/capabilities.py` (`comfyui.klein_overrides` payload),
`frontend/src/components/settings/EnginesSection.jsx` (the card),
`frontend/src/help/helpRegistry.js`, `docs/guide/settings-reference.md`,
`backend/tests/test_klein_models.py`.

## Divergence 3: emoji-free UI (repo-wide, cosmetic)

All decorative pictographic emoji were stripped from UI strings, docs and
comments (~700 across 130 files); `🔞` is kept everywhere as the functional
NSFW label marker. Merge guidance: upstream hunks touching emoji-bearing lines
conflict trivially — take upstream's content, then re-strip the emoji from the
merged result (a line-safe strip: never let a removal eat the newline of a line
that ends with an emoji).

## Merge routine

```
git remote add upstream https://github.com/perfectgf/lora-dataset-studio  # once
git fetch upstream && git merge upstream/main
# re-delete any resurrected API-engine files, re-run:
#   backend:  python -m pytest
#   frontend: node --test   (from frontend/)
# then rebuild dist in a separate build(frontend): commit.
```
