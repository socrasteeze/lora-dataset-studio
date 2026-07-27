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
| 2026-07-26 | `9898281` + dist `0ee1d01` | **Fix: phantom vision keep-warm lease on Ollama-down** — `vision_keepalive.py`'s lease has to be recorded BEFORE an isolated vision call ships (`keep_alive` rides in the request payload), so a head-crop or Studio-describe call made while Ollama was unreachable still recorded a 120 s lease for a model that was never loaded. The next `launch_training` within that window saw `lease_is_live()` true and paid `unload_vision_model()`'s doomed retries (~4 s on Windows: two attempts, each connect walking `::1` then `127.0.0.1`) before the trainer spawned. `describe_image_ollama` now hands the lease back via a new `_forget_lease_if_unreachable` on CONNECTION-level failures only (no HTTP response = server gone); an HTTP rejection or read timeout keeps it (server answered, may hold the model). Six new tests in `test_vision_keepalive.py`; no divergence, no upstream interaction. |
| 2026-07-27 | *(merge)* | **Upstream sync** (9 commits: LoRA Canvas checkpoint actions — the run-card popover extracted into a SHARED `CheckpointActionsPopover` + `useCheckpointActions` so the board and the in-card graph can no longer drift; details-on-demand instead of a drawer that sprang open; a persisted canvas generation tracker; the compact checkpoint pill swapping its illegible 14-px thumbnail for a results count; bank image-provenance — real-detail measurement, origin from file metadata, black bars, JPEG quality; a settings deep-link fix; a Krea generate→dataset-row dispatch fix). **The first sync in this fork's history with NO Divergence-1 work**: the nine commits touch no cloud-engine file, so nothing had to be re-deleted — verified by diffing `merge-base..upstream/main` (diagnostic 1) rather than the full historical `HEAD..upstream/main`, whose cloud-engine hits are all the fork's OWN removals and were the obvious trap here. Eight conflicts, all Divergence 3 (emoji) or adjacent-addition: `README.md` and `whatsNew.js` were prepend-vs-prepend (kept both lists, upstream's new entries on top); `RunLineageGraph.jsx` took upstream wholesale — its ~90-line inline popover and its own `importing`/`deleting` state are superseded by the shared hook, so keeping the fork side would have forked the popover permanently, exactly what the upstream commit set out to prevent. Divergence 3: stripped pictographs from the merged **UI strings** (`bankProvenance.js`'s `PROVENANCE_FLAG_LABEL`/`ORIGIN_CHIPS`, which feed the emoji-free `BankWorkspace`; `CheckpointActionsPopover`'s Deploy/Delete buttons; the pill's results chip; `CanvasRunTracker`; the two new `CaptioningSection` settings) and from `docs/guide/**`, while **leaving `README.md` alone** — README carries ~600 emoji on this fork and is deliberately not stripped. Divergence 4: dropped the "no longer competes with a cloud run recording its progress" clause from the README Test-Studio bullet and the "a cloud run this machine has no link to" reason from a What's-new blurb. Origin badges in `BankWorkspace` became text (`AI`/`Camera`) rather than 🤖/📷, since a bare stripped glyph would have rendered an empty badge. Noted but NOT fixed (pre-existing, out of scope): `BankReviewLightbox.jsx` was never emoji-stripped and still carries 🌫/📺/📐/🚩/👤, so it now shows emoji-free provenance labels beside its own emoji ones. Tests (baseline recorded BEFORE the merge, per diagnostic 7): backend 2696→2730 pass with the SAME 2 pre-existing environment failures either side (`test_stop_waits_until_launch_publishes_the_new_pid`, `test_prefill_falls_back_to_telea_when_lama_absent`); frontend 910→960 pass, 0 fail. |
| 2026-07-26 | *(merge)* | **Upstream sync** (94 commits: LoRA Canvas — every dataset's training lineage on one zoomable board, with card dragging, generate-from-the-board and a per-checkpoint gallery; a Classify-framing button under the Composition bar; bank relocate / overlap warnings / GPU-Python picker for Score / concurrent vision passes; a live training dot on Runs; unified run ids and lineage edge fixes; RTX-50 torch-arch crash diagnosis; anime subject type + Anima pointer; ComfyUI custom input/output folders; JSON shot-catalog import) — **the big adoption is Krea 2 Identity Edit as a SECOND LOCAL engine**, which is why this sync changes a divergence instead of just defending it: see the new **Divergence 1b**. `engineSelection.js` is no longer re-deleted — it is kept, trimmed to `ENGINES=['klein','krea']` with `API_ENGINES=[]`, `DEFAULT_ENGINE='klein'` and all-zero rates; `face_dataset_service` mirrors it (`API_ENGINES=()`, `KNOWN_ENGINES=LOCAL_ENGINES`). Settings regained a **Which engines to offer** card (so `SettingsPage` passes `toggleEngine` again) and `config.py` kept upstream's engine ledger with `LEGACY_KNOWN_ENGINES=('klein',)`, which is what makes Krea reach installs that already saved their settings. Rejected wholesale per Divergence 1: **OpenRouter as a third cloud engine** (`068732e`), the **Nano Banana / ChatGPT image-model pickers** (`3bad281`), and **reference editing with OpenRouter** (`ec5bf6b`) — deleting `openrouter.py`, `engine_errors.py` (its only consumers were the API engines), `chatgpt_image.py`, `nanobanana.py`, `referenceEdit*`, `ReferenceEditModal.jsx` and five test files. **Four of those test files merged with ZERO conflict markers** — `test_openrouter_engine.py`, `test_engine_model_choice.py`, `test_engine_lists_contract.py`, `test_config_new_engines.py` — exactly diagnostic 2, and three MORE clean-merged tests had been silently re-pointed at the cloud catalogue (`test_diagnostic.py`, `test_settings_api.py`, the new `capability-destinations-contract.test.mjs`, which expected 11 capability rows where this fork has 8). A clean-merged `import { editEngineNames } from './referenceEdit'` in `ReferencePanel.jsx` survived both the conflict pass AND the grep sweep — only `npm run build` caught it, which is the argument for building before calling a sync done. **Caught a real merge-interaction bug:** with `API_ENGINES` emptied, upstream's `model = img.klein_model if img.klein_model not in API_ENGINES else …` inverts to always-true and would have handed a legacy engine TAG to the Klein loader as if it were a model filename; now tested against `LEGACY_API_ENGINE_TAGS + (KREA_ENGINE,)`. Also restored `check_fanout_budget`/`fanout_in_flight` (dropped in the 2026-07-23 sync with the cloud fan-out, and load-bearing again now that two LOCAL engines dispatch as separate batches — without it `/generate` 500s on every multi-engine call). Divergence 3: re-stripped 404 lines of emoji across 172 merged files, keeping `🔞`; three upstream tests asserted on stripped glyphs and were re-pointed at the wording they actually guard. Divergence 4: dropped the resurrected vast.ai key guide in `TrainingSection.jsx`, the **Train in cloud** button and the cloud-run progress block in `TrainingPanel.jsx`. Settings' engine section went plural (`## Image engines`) with both help anchors and the docs realigned. README's "Seventeen researched presets" claim was NOT taken: both trees ship 13, so the number was corrected rather than propagated. |
| 2026-07-25 | *(merge)* | **Upstream sync** (20 commits: bank review lightbox + two-level watermark cleaning + live folder re-walk + per-run staging cleanup + explicit Undeploy + Checkpoints-panel deployed state + per-subject identity prompts + Klein generation steps) — no rejected feature shipped in this window: the only cloud token the 20 commits add is one `face_single` description string in the SHARED `promptOverride.js` metadata, which the UI already filters out. Adopted as-is: the whole bank wave, the lineage/checkpoint Undeploy work, and both `2013790` features. Divergence work: `IdentityPromptModal.jsx` — upstream imports `readEngines` from `engineSelection.js`, **a file this fork deleted** (build breaker); kept upstream's per-subject storage (`readIdentityPrompt`/`writeIdentityPrompt`/`identityPromptPatch`/`identityDefaultsFor`, `subjectType` prop) but restored the fork's single-generator `activeExtraRefPromptKey(currentGenerator())`. `EnginesSection.jsx` — kept upstream's subject-type chip picker and switched to `identityPromptFields(subject)`, re-applying the fork's `.filter((f) => f.engines.includes('klein'))` and rewording the card copy from "three prompts" to one. `SettingsPage.jsx` — dropped upstream's `toggleEngine` prop (not defined in this fork → ReferenceError). `face_dataset_service.py` — dropped the re-added `API_ENGINES` regenerate branch but adopted its `sampler_steps=_generation_steps()`. `CloudRunsPage.jsx`/`whatsNew.js` — kept upstream's `TRASH_REMINDER` refactor, reworded rented-"pods" copy (Divergence 4). `helpRegistry.js` — kept the `klein.generation_steps` topic, dropped the API-engine `identity_prompts.face` topic, and repointed `runs-clean-one-run-staging` off the `#a-cloud-run-seems-stuck` H2 this fork does not carry. Divergence 3: re-stripped the badge pictographs upstream re-added in `BankWorkspace.jsx` (kept its `key=f` React fix) and the `🔎` in the guide; `⏏` kept as a monochrome state glyph, consistent with the `✓` the fork already keeps. **Caught a real merge-interaction bug:** upstream's new live folder re-walk (`refresh_bank`, forced on every `/api/banks`) is recursive, so the split's parent-rooted "(loose files)" bank absorbed every subfolder image its sibling banks own (1 → 4 in a 2-subfolder export). Fixed with a persisted `image_bank.root_only` marker (additive migration) that prunes the walk; two regression tests added. Also stopped `BankPage` polling `/api/banks` every 2.5 s — that route now force-re-walks every source folder and toasts, so the queue badge is derived from the cheap `/api/bank-queue` snapshot instead. |
| 2026-07-24 | *(this wave)* | **Image-bank queue + split-by-subfolder** — two Bank additions. (1) A **cross-bank "Launch all" queue** (`backend/app/services/bank_queue.py`, an in-memory FIFO + single worker mirroring the `bank_jobs` contract): line up several banks and they run one at a time, each *waiting* for the GPU/bank to be free (reusing `start_pipeline` + `_gpu_busy_reason`) instead of the old busy-GPU **503** rejection. New routes `POST /bank/<id>/queue`, `GET/DELETE /bank-queue`, `POST /bank-queue/clear`; `list_banks` now carries `queue_state` for the card badge; UI is a queue panel + per-card "Add to queue" on `BankPage.jsx` (reusing `LaunchAllDialog` via a new `onQueue`). (2) **One bank per subfolder** — importing a folder-of-folders creates a separate bank per top-level subfolder (`split_folder_into_banks` / `split_folder_preview`, `create_bank` refactored to share `_register_bank`); loose root images get their own bank by default so nothing is dropped; routes `POST /bank/split[/preview]`, a create-form toggle + live preview. Local-only, no cloud surface touched. Tests: `test_bank_queue.py`, `test_bank_split.py`, `queue-split-ui.test.js`; What's-new + help topics (`bank-launch-queue`, `bank-split-subfolders`) added. |
| 2026-07-24 | *(merge)* | **Upstream sync** (subject-type selector for generation — Human/Animal/Creature/Object/Other, steering the shot catalogue and identity lock for non-human LoRAs; case-insensitive whole-word Find & Replace in captions; Test Studio keeps every recent prompt instead of capping at ten; a form-dialog opacity contract test) — the big item to reject was upstream's **"edit the reference photo with a prompt"** feature, built entirely on ChatGPT/Nano Banana (`/ref/edit` routes, `reference_edit_jobs.py`, `ReferenceEditModal.jsx`, `referenceEdit.js` which imports the already-deleted `engineSelection.js`, `test_ref_edit.py`, the `✦ Edit` button in `ReferencePanel.jsx`, the `edit_reference` activity kind, and its What's New entry). Per Divergence 1 this was rejected wholesale: deleted every file above, stripped the routes/service functions/hooks that called them from `datasets.py`, `face_dataset_service.py`, `useDataset.js`, `DatasetWorkspace.jsx`. Also re-rejected upstream's recurring **multi-engine batch generation** rewrite of `VariationCatalog.jsx` (`EngineCard`, `MODE_CHOICES`, `engineSelection.js` imports) and `regenerate_image`'s API-engine branch/`generate_variations_nanobanana` fan-out in `face_dataset_service.py` — same pattern as the 2026-07-23 sync, upstream keeps developing this feature on top of the same rejected base. The subject-type feature's own wiring (`subjectTypes.js`, the `SUBJECT_TYPES` radio group, `normalize_subject_type`/`subject_type_of` on the backend, the `subject_type` DB column) merged in cleanly alongside the rejection and was kept — it has no cloud-engine dependency. Dropped the orphaned `dataset-engine-mode` help topic and the `action-edit-reference` help topic. |
| 2026-07-23 | *(merge)* `a8861fd` + dist `131efa9` | **Upstream sync** (Anima — a first-class anime training family, Cosmos-Predict2 2B, local-only for now) — clean adoption, no cloud-generation risk (it's a training family, not an image-generation engine). Per Divergence 4, deleted upstream's resurrected rental-GPU "Choose cloud GPU speed" launch dialog and custom-base push UI in `TrainingPanel.jsx` (dead/unrendered code brought back by the merge) and dropped the reintroduced `2026-07-23-multi-engine-generation` What's New entry already rejected in the prior sync per Divergence 1. |
| 2026-07-23 | *(merge)* | **Upstream sync** (crop extra reference photos + one editable prompt box per identity prompt + bank cards show first five images + French→English typography fixes + one Backup menu + import from a bank in Add images + delete a checkpoint from its lineage pill + grid filter by decision + bulk-improve/stop-generation refactors) — the big item was upstream's **"generate with several engines in one batch"** (`6f1656a`), which reintroduces Nano Banana/ChatGPT checkbox selection, `engine_batches`, `API_ENGINES`, `generate_variations_nanobanana` and a per-tile engine-colour pill end to end (routes, service, capabilities, `VariationCatalog.jsx`, new `engineSelection.js`, `DatasetGridItem.jsx`). Per Divergence 1 this was rejected wholesale: kept this fork's single-generator Klein-only `/generate` route and `VariationCatalog.jsx` card (upstream's whole 352-line rewrite of that file discarded), deleted `engineSelection.js`/`.test.js` and `test_generate_multi_engine.py`, dropped the broken clean-merged leftovers that referenced the now-undefined `API_ENGINES` (`_image_engine`/`'engine'` tile field, `check_fanout_budget`/`fanout_in_flight`, the `IdentityPromptModal.jsx`/`useDataset.js`/`promptOverride.js` multi-engine plumbing — reverted each to its pre-merge single-engine shape), and removed the orphaned `dataset-engine-mode` help topic. Caught a real regression along the way: the clean-merged `IdentityPromptsCard` in `EnginesSection.jsx` had switched to rendering the *shared, unrestricted* `IDENTITY_PROMPT_FIELDS` (3 entries — `face_single`/`face_multi`/`klein_identity`) instead of the fork's Klein-only local list, which would have resurfaced the two API-engine prompt cards in Settings; now filtered to `f.engines.includes('klein')`. Everything else above was adopted as-is (all non-cloud, generically useful); re-stripped emoji from conflicting hunks per Divergence 3 (kept upstream's guillemets→curly-quotes typography fixes where they landed on already emoji-free fork text), fixed a stale `#image-engines` help anchor (upstream's H2 is plural, this fork's Klein-only section is `## Image engine` singular), and dropped one duplicate What's-new entry (`stop-generation-works-again` restated this fork's own `stop-buttons-actually-stop` announcement from the day before). |
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
- `backend/app/services/reference_edit_jobs.py` (2026-07-24: "edit the reference
  photo with a prompt" — Klein deliberately excluded, ChatGPT/Nano Banana only)
- `backend/app/services/openrouter.py` (2026-07-26: OpenRouter shipped upstream
  as a THIRD cloud engine — same rejection as the other two)
- `backend/app/services/engine_errors.py` — the shared EngineError/EngineFatal
  taxonomy; its only consumers were the three API engines and the API fan-out
- `backend/tests/test_engines.py`
- `backend/tests/test_chatgpt_oauth.py`
- `backend/tests/test_ref_edit.py`
- `backend/tests/test_openrouter_engine.py`, `test_engine_model_choice.py`,
  `test_engine_lists_contract.py`, `test_config_new_engines.py` (2026-07-26 —
  all four merged in with ZERO conflicts; the diagnostic-2 sweep is what caught
  them)
- `frontend/src/components/dataset/ReferenceEditModal.jsx`
- `frontend/src/components/dataset/referenceEdit.js` (+ `.test.js`) — imported
  the (then absent) `engineSelection.js`; `ReferencePanel.jsx` kept a clean-merged
  `import { editEngineNames }` of it that only the BUILD caught

**`frontend/src/components/dataset/engineSelection.js` is no longer deleted** —
see "Divergence 1b" below. It is now maintained in a LOCAL-ONLY form.

### Divergence 1b: a SECOND local engine, and a local-only engine catalogue

Adopted 2026-07-26. Upstream shipped **Krea 2 Identity Edit**, which renders on
the user's own GPU through ComfyUI (the `comfyui-krea2edit` node pack) with no
API key and no network call. Divergence 1 forbids CLOUD engines, not second
engines, so this one is in scope for the fork and was taken.

The consequence is that `engineSelection.js` — historically re-deleted on every
sync — is now **kept and maintained**, trimmed to the local half:

- `ENGINES = ['klein', 'krea']`, `LOCAL_ENGINES` identical to it.
- `API_ENGINES = []` — kept as an EMPTY export rather than removed. Every
  "is this engine billable / does it refuse NSFW / does it queue behind another"
  helper derives from it, and an empty list makes them all answer correctly by
  construction instead of by special case. **Never add an id to it.**
- `DEFAULT_ENGINE = 'klein'` (upstream's is `'nanobanana'`).
- `ENGINE_RATES` are all 0, so `estimateCost`/`billingEngines` are structurally
  incapable of quoting a price; the cost confirm never fires.
- Storage keys are upstream's, unchanged (`datasetGenerator` /
  `datasetGenerators` / `datasetGeneratorMode`) — they are persisted, and
  `canonicalEngines` is what quietly retires a stored `nanobanana`.

Mirrored on the backend in `face_dataset_service.py`: `API_ENGINES = ()`,
`LOCAL_ENGINES = ('klein', 'krea')`, `KNOWN_ENGINES = LOCAL_ENGINES + API_ENGINES`.
`LEGACY_API_ENGINE_TAGS` gained `'openrouter'`.

**Merge trap this created (bit once, 2026-07-26):** with `API_ENGINES` empty,
every upstream `if x in API_ENGINES:` branch becomes dead but still REFERENCES
functions this fork deleted (`_api_generate_fn`, `_all_ref_bytes`) — and
`img.klein_model not in API_ENGINES` silently inverts to always-true, which
would have passed a legacy engine TAG off as a real model filename. Do not
leave those branches "harmlessly dead": delete them, and test row provenance
against `LEGACY_API_ENGINE_TAGS`, never against the empty `API_ENGINES`.

Settings gained a **"Which engines to offer"** card (`engines.default` /
`engines.enabled`), so `SettingsPage.jsx` now DOES pass `toggleEngine` — the
opposite of the 2026-07-25 note. `config.py` keeps upstream's `_merge_new_engines`
ledger with `LEGACY_KNOWN_ENGINES = ('klein',)`: that single-entry tuple is what
makes Krea reach installs that had already saved their Settings.

### Upstream files with fork edits (prefer fork side for engine UI)

- `backend/app/config.py` — `SECRET_KEYS` without GEMINI/OPENAI/OPENROUTER;
  `engines` defaults are `{default: 'klein', enabled: ['klein', 'krea'],
  known: []}`; `LEGACY_KNOWN_ENGINES = ('klein',)`; no `chatgpt_*`/`*_model` keys.
- `backend/app/capabilities.py` — no gemini/openai/openrouter probes,
  `engines` is `{klein, krea}` only, no `chatgpt_subscription` block. Keep
  upstream's `_cached_import` refactor: the 2026-07-26 conflict interleaved it
  with the three cloud probes in ONE hunk (diagnostic 4 — resolve per hunk, the
  helper is load-bearing for face-scoring/masks/joycaption).
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

## Merge diagnostics (read BEFORE resolving a single conflict)

Lessons from actually doing these merges, aimed at an agent seeing this repo
cold each time. The goal: spend the least effort finding what genuinely needs
a decision, and don't miss the parts that merge with zero conflict markers.

1. **`git diff --stat HEAD..upstream/main` is not "what's new this sync" — it
   is the full historical divergence.** It re-lists every file this fork has
   ever diverged on (README.md, FORK_NOTES.md, deleted cloud-engine files,
   PLAN.md, docs/, …), most of which nothing touched in the current window.
   The ground truth for "what's actually new" is the **commit list**:
   `git log --oneline HEAD..upstream/main`. Read every commit *message* first
   — they usually name the feature outright ("edit the reference photo with a
   prompt (ChatGPT / Nano Banana)", "generate with several engines in one
   batch") which tells you in one line whether a Divergence applies, before
   you've opened a single diff.
2. **After merging, conflict markers only mark where BOTH sides touched the
   SAME lines.** A rejected feature's plumbing routinely lands with ZERO
   conflicts in files this fork didn't happen to touch that sync — a new
   route, a new hook + its slot in the returned object, a new button, a new
   `whatsNew.js`/help-registry entry, a new tuple member. Conflict-resolution
   alone will miss all of these. After every merge, sweep the WHOLE tree:
   ```
   grep -rln "chatgpt\|nanobanana\|ChatGPT\|Nano Banana\|reference_edit\|engineSelection\|GEMINI_API_KEY\|OPENAI_API_KEY" \
     backend/app backend/tests frontend/src frontend/tests
   ```
   Vet every hit against "Deleted files" / "kept as-is dead code" above —
   most will be pre-existing legacy references (`LEGACY_API_ENGINE_TAGS`,
   explanatory comments). Anything **new** (a fresh function, prop, JSX
   button, activity kind, changelog entry) belongs to the rejected feature
   and must be stripped even though nothing flagged it as a conflict.
3. **Known clean-auto-merge hiding spots**, checked every time a cloud-engine
   feature recurs: `frontend/src/whatsNew.js` (a new entry describing it),
   `frontend/src/help/helpRegistry.js` (a new `action`/`setting` topic),
   `frontend/src/hooks/useDataset.js` (a new callback **and** its slot in the
   big returned object at the bottom of the hook), the consuming component's
   button/modal wiring (e.g. `ReferencePanel.jsx`'s button, `DatasetWorkspace.jsx`'s
   modal + state), `backend/app/services/dataset_activity.py`'s `KINDS` tuple
   (a new activity kind for the rejected feature's progress indicator).
4. **When a legitimate feature and a rejected one ship in the SAME upstream
   commits, they commonly interleave inside the same file/hunk** (e.g.
   `VariationCatalog.jsx` carrying both `subject-type` and multi-engine
   `EngineCard`/`MODE_CHOICES` in the 2026-07-24 sync). Resolve **at the hunk
   level** — keep the legitimate half, drop the cloud half. Never blanket-
   revert the whole file to `--ours`/HEAD, or the good half is lost too.
5. **Before deleting a function/constant that belonged only to a rejected
   feature, confirm it truly has zero remaining callers**:
   `grep -rn '<symbol>' backend/ frontend/src/` — a helper can be referenced
   from a spot well outside the conflict hunk you're currently editing (this
   is how `_all_ref_bytes`-style orphans happen). Delete definitions only
   after every call site is gone.
6. **`npm run build` is a REQUIRED sweep step, not a packaging step.** A
   rejected feature's last trace is often a plain `import` of a file this fork
   deletes. It survives conflict resolution (nothing conflicted), it survives
   the step-2 grep (2026-07-26: `import { editEngineNames } from './referenceEdit'`
   in `ReferencePanel.jsx` — the deleted MODULE name matched the sweep pattern,
   the imported SYMBOL did not, and the line sat nowhere near a conflict). Only
   the bundler resolves imports, so run it BEFORE believing the sweep. The
   backend equivalent is importing the app: `python -c "import app; app.create_app()"`.
7. **Run the test suites BEFORE the merge and diff the results after.** This
   repo has ~50 environment-dependent failures on a Linux container (Windows
   drive letters, absent ML deps, no `xdg-open`) that have nothing to do with
   any sync. Without a recorded baseline they are indistinguishable from merge
   damage, and pytest's own reporter crashes mid-run when a test that patched
   `os.name = 'nt'` fails — so run PER FILE and compare counts per file.
8. **A file with no conflict markers and no matches in step 2's grep is not
   automatically clean** — run the standard test suites anyway (step 4 below);
   they catch what grep can't (renamed imports, prop-shape mismatches).

## Merge routine (every upstream sync)

```
git fetch upstream
git log --oneline HEAD..upstream/main         # read every message (diagnostic 1)
git merge upstream/main
# 1. Re-delete any resurrected API-engine files (list above).
# 2. Resolve conflicts — for engine/Setup/EnginesSection, prefer THIS fork;
#    for a file mixing a legit feature with a rejected one, resolve per-hunk
#    (diagnostic 4), don't revert the whole file.
# 3. Sweep the WHOLE tree for clean-merged rejected-feature leftovers
#    (diagnostics 2-3), not just conflicted files.
# 4. If frontend/dist or Setup/engines UI came from upstream, wipe their effect:
cd frontend && npm run build
# 5. Prove local-only did not regress:
cd frontend && node --test tests/local-only-engines-contract.test.mjs
python -m pytest
cd frontend && node --test
# 6. Commit sources, then a separate build(frontend): commit for dist.
# 7. Ask before push; never force-push without confirmation.
```

**Hard stop:** if Setup shows "Image generation" with Gemini/OpenAI key fields,
`frontend/dist` is stale — rebuild; do not "fix" by re-adding the engines.
