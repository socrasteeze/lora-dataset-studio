# FORK_NOTES — socrasteeze/lora-dataset-studio

This is a personal fork of
[perfectgf/lora-dataset-studio](https://github.com/perfectgf/lora-dataset-studio).
This file is the always-current list of where the fork diverges from upstream —
read it **before every** `git merge upstream/main` and update it in the same
commit as any change that adds a new divergence (same convention as the sibling
ai-toolkit fork).

## Fork changelog (enhancements shipped on this fork)

Newest first. Add a row per shipped wave — this is the "what have I actually
done on this fork" ledger; the divergence sections below stay the *file-level*
merge map.

| Date | Commits | Enhancement |
|---|---|---|
| 2026-07-22 | `06093b5` + dist `d6b1fd8` | **Hang-audit hardening** — full audit of every blocking call and stop/pause path. Fixed: Ollama model pulls (setup action + Settings pull) streamed with no read timeout and could hang their worker thread forever (now `(10, 300)` — five silent minutes fails the pull with a visible error); a latent no-timeout `/prompt` post in `comfyui_service.py`; and the GPU-exclusive vision window's TTL was set once at entry, so a caption/vision batch longer than 30 min silently lost its lock and queued image jobs could pile onto the GPU mid-batch (the window now re-arms the TTL from an in-window heartbeat, joined on exit; crash-recovery semantics unchanged). Audit also verified the rest of the stop surface is bounded (training scheduler tick clears stale flags in ~60 s, activities end via try/finally + 30-min TTL, frontend polls self-heal). |
| 2026-07-22 | `683686e`, `eec55df` + dist `25dff41`, `b844f2a` | **Honest Stop buttons + real-address startup** — Stop generation stays clickable during the whole batch (`'generate'` excluded from the workspace `disabled` condition like `'improve'`); Stop training verifies the PID actually died (`_wait_pid_dead`, 5 s) and returns 502 (`TrainingStopVerificationError`) instead of a false success; generation cancel reports `unconfirmed` renders when ComfyUI never confirmed the interrupt (with a benign-case fix: a reachable ComfyUI whose queue no longer holds the prompt counts as confirmed stopped, so the warning only fires when ComfyUI is unreachable). Launcher: browser-open moved from `start.bat` (hardcoded, fired-too-early 127.0.0.1) into `run.py` — opens the actual bound host:port with the access token once the server accepts connections; `LDS_NO_BROWSER=1` disables. |
| 2026-07-23 | *(merge)* | **Upstream sync** (bulk Klein improve moved to a server-side job, stoppable and reload-proof) — clean merge, no divergence policy involved; kept our `renameDataset` export in `useDataset.js` alongside upstream's new `improveBatch`, and dropped the superseded client-side `onImprove`/`bulkImprove` polling state from `DatasetGrid.jsx` in favor of upstream's `onImproveBatch`/`improveLabel`. |
| 2026-07-22 | *(merge)* | **Upstream sync** (Continue lane picker on the Runs hub + HF-gate cloud preflight + trigger/style rename cascade + Import-to-bank export disclosure + Klein improve-profile tuning) — kept the Local/Cloud Continue-lane picker (dead-but-visible per Divergence 4: `caps.cloud_training` stays forced off) but deleted the resurrected fresh "Train in cloud" launch dialog/GPU-speed picker and the Runs-page rental banner from `TrainingPanel.jsx`/`CloudRunsPage.jsx`; reworded the cloud-lane "reason" strings (was `vast.ai API key`) to stay clear of the local-only contract's forbidden-string list; re-stripped emoji from conflicting Export/workspaceSections hunks per Divergence 3. |
| 2026-07-20 | *(merge)* | **Upstream sync** (Bank curation series + lineage Experiment Lab + editable identity prompts) — kept only the `klein_identity` identity-prompt card in Settings (dropped upstream's `face_single`/`face_multi`/`CHATGPT_AUTH_OPTIONS` UI); re-stripped emoji from conflicting Bank/Settings hunks per Divergence 3. |
| 2026-07-19 | *(docs)* | **Preset alignment report** — full cross-check of the fifteen LDS built-ins against the ai-toolkit fork's presets/advisor (`docs/preset-alignment-2026-07.md`; copy + additive preset sync landed in the ai-toolkit fork). No LDS preset values changed. |
| 2026-07-19 | `a61612c` + dist `8434e09` | **Local-only dist guard** — contract test + merge routine so an upstream `frontend/dist` rebuild cannot resurrect Nano Banana / OpenAI Setup UI. |
| 2026-07-19 | `610b499` / merge `fe76cb8` | **Klein paths from anywhere** — absolute pins outside Comfy roots hardlink/symlink into `lds-pinned/`; bf16 UNETs use `weight_dtype: default`; Training Settings drop vast.ai cards (Runs/backend left). |
| 2026-07-19 | `aecc839` + dist `c4b4274` | **Configurable model paths everywhere** — every Klein model reference (UNET/TE/VAE pins, the consistency LoRA — now editable in Settings — and generation-LoRA preset rows) accepts a full absolute path as well as a ComfyUI-relative name; paths under any registered root auto-convert to loader names, with a three-state badge (found / not found / outside ComfyUI's folders). |
| 2026-07-19 | `1ca80bc` + dist `1398e56` | **Emoji-free UI** — stripped ~700 decorative emoji across the app, docs and comments; plain-text labels, monochrome state glyphs kept, real text where an emoji was a button's only content. The `🔞` label prefix is kept as a functional NSFW data marker. |
| 2026-07-19 | `59f0529`, `1b74d5b` | **PLAN.md** — the phased integration plan for the whole local stack (ComfyUI + SwarmUI + ai-toolkit + TagGUI) with LDS as the hub. |
| 2026-07-19 | `c56790d` + dist `6677553` | **Klein model-file pins** — Settings ▸ Image engine fields (`klein.unet` / `klein.text_encoder` / `klein.vae`) to name the exact loader files, incl. files outside `klein`-named folders and `extra_model_paths.yaml` roots; missing pins fall back to auto-detect with a visible "not found" badge. |
| 2026-07-19 | `738f2ec` + dist `035056a`, notes `b115182` | **Local-only generation** — removed the Nano Banana (Gemini) and ChatGPT (`gpt-image-2`) API engines end to end; Klein (ComfyUI) is the sole engine. Legacy API-generated rows regenerate through Klein. Divergence details in the sections below. |

## Divergence 1: local-only generation (API engines removed)

**Non-negotiable.** The fork generates exclusively on the local Klein engine
(ComfyUI). The two cloud API engines — **Nano Banana (Gemini)** and **ChatGPT
(`gpt-image-2`)**, including the experimental ChatGPT-subscription OAuth lane —
were removed end to end (2026-07-19) and must **never** return via an upstream
merge.

### What "back" looks like (real regression, 2026-07-19)

Upstream still has a Setup step **"Image generation"** with Gemini / OpenAI key
fields ("Powers Nano Banana", "Powers ChatGPT"). The fork's **source** removed
that step (`useSetupSteps` is `comfyui → ollama → quality → training` only), but
**`frontend/dist` is what Flask serves**. Taking upstream's `build(frontend):`
commit during a merge silently reintroduces the cloud UI until you rebuild dist
from this fork's `frontend/src`. Always treat a dirty/upstream `frontend/dist`
as hostile until `npm run build` and the local-only contract test pass.

### Deleted files (upstream has them — re-delete after merge)

- `backend/app/services/nanobanana.py`
- `backend/app/services/chatgpt_image.py`
- `backend/app/services/chatgpt_oauth.py`
- `backend/tests/test_engines.py`
- `backend/tests/test_chatgpt_oauth.py`

### Upstream files with fork edits (prefer fork side for engine UI)

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
- `backend/app/services/face_variations.py` — API identity-guard wrapper
  (`wrap_variation`, `IDENTITY_GUARD`/`IDENTITY_GUARD_MULTI`) came back
  2026-07-20 as shared plumbing for upstream's editable-identity-prompts
  feature (`get_identity_prompt`, `identity_prompt_defaults`); it is DEAD CODE
  in this fork (nothing calls `wrap_variation` — the Klein-only pipeline only
  ever resolves `klein_identity`/`klein_improve`) but stays since removing it
  would mean forking `IDENTITY_PROMPT_KINDS`/`identity_prompt_defaults()` off
  upstream's shape too. Keep it merged in as-is; just don't surface
  `face_single`/`face_multi` in Settings (see EnginesSection.jsx below).
- Frontend: `VariationCatalog.jsx` (single Klein card), `EnginesSection.jsx`
  (Klein LoRA presets + only the `klein_identity` identity-prompt card — the
  `face_single`/`face_multi` cards and any `CHATGPT_AUTH_OPTIONS`-style block
  upstream adds stay dropped, no Gemini/OpenAI secret fields),
  `SetupPage.jsx` / `useSetupSteps.js` (**no** API-keys / "Image generation"
  step), `CapabilitiesContext.jsx`, `settings/registry.js`,
  `OverviewSection.jsx`, `helpRegistry.js` (no `GEMINI_API_KEY`/
  `OPENAI_API_KEY` topics), `diagnosticFormat.js`,
  `DatasetWorkspace.jsx`, `ReferencePanel.jsx` + their tests.
- Docs: `README.md`, `docs/guide/settings-reference.md`,
  `docs/guide/getting-started.md`, `docs/guide/using-the-app.md`,
  `docs/guide/getting-help.md` (say **curation-only**, never "API-only").

### Guardrails (do not skip)

1. **Contract test:** `frontend/tests/local-only-engines-contract.test.mjs`
   fails if Setup/Settings source or **served `frontend/dist`** contain the
   cloud-engine UI strings, or if `SETUP_STEP_IDS` regains an `engines` step.
2. After every upstream merge that touches `frontend/**`, run
   `cd frontend && npm run build` and commit dist in a separate
   `build(frontend):` commit (see CLAUDE.md).
3. Do **not** re-add `GEMINI_API_KEY` / `OPENAI_API_KEY` to Settings, Setup,
   `.env.example`, or help registry.

Compatibility notes:

- Existing datasets with API-generated rows keep working; those rows
  regenerate through Klein (see `LEGACY_API_ENGINE_TAGS`).
- Stale `engines.*` keys and GEMINI/OPENAI entries in an existing
  `config.json`/`.env` are ignored — nothing needs manual cleanup.

## Divergence 2: Klein model-file pins (+ paths from anywhere)

Optional `klein.unet` / `klein.text_encoder` / `klein.vae` config keys pin the
exact loader files, ahead of the auto-detection. Absolute paths outside every
ComfyUI root are hardlinked/symlinked into `<models>/<type>/lds-pinned/` so
stock loaders can open them (`_stage_external_model` in klein_edit_helper).
Native / bf16 UNETs (filename without `fp8`) enqueue with `weight_dtype:
default`. Touched: `backend/app/config.py`, `klein_edit_helper.py`,
`watermark_klein.py`, `capabilities.py`, `EnginesSection.jsx`,
`helpRegistry.js`, `docs/guide/settings-reference.md`,
`backend/tests/test_klein_models.py`.

## Divergence 3: emoji-free UI (repo-wide, cosmetic)

All decorative pictographic emoji were stripped from UI strings, docs and
comments (~700 across 130 files); `🔞` is kept everywhere as the functional
NSFW label marker. Merge guidance: upstream hunks touching emoji-bearing lines
conflict trivially — take upstream's content, then re-strip the emoji from the
merged result (a line-safe strip: never let a removal eat the newline of a line
that ends with an emoji).

## Divergence 4: Local-only training (no remote GPU rental)

Settings → Training keeps **Defaults** only — no rental API-key card and no
cloud guardrails. The UI also:

- Forces `cloud_training: false` in `CapabilitiesContext` (even if a leftover
  key sits in `.env`).
- Removes **Train in cloud**, GPU-speed picker, and Runs-page rental banners.
- Shows **Runs** as local history only (cloud rows filtered out).

Backend cloud routes may still exist dormant; they must not surface in the UI.
Upstream merges that restore Training Settings cards, Setup “rent a GPU” copy,
or Runs rental prompts: delete them again. Contract:
`frontend/tests/local-only-engines-contract.test.mjs` (also forbids rental UI
strings).

## Merge routine (every upstream sync)

```
git fetch upstream
git merge upstream/main
# 1. Re-delete any resurrected API-engine files (list above).
# 2. Resolve conflicts — for engine/Setup/EnginesSection, prefer THIS fork.
# 3. If frontend/dist or Setup/engines UI came from upstream, wipe their effect:
cd frontend && npm run build
# 4. Prove local-only did not regress:
cd frontend && node --test tests/local-only-engines-contract.test.mjs
python -m pytest
cd frontend && node --test
# 5. Commit sources, then a separate build(frontend): commit for dist.
# 6. Ask before push; never force-push without confirmation.
```

**Hard stop:** if Setup shows "Image generation" with Gemini/OpenAI key fields,
`frontend/dist` is stale — rebuild; do not "fix" by re-adding the engines.
