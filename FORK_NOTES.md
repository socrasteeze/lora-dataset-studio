# FORK_NOTES — socrasteeze/lora-dataset-studio

This is a personal fork of
[perfectgf/lora-dataset-studio](https://github.com/perfectgf/lora-dataset-studio).
This file is the always-current map of **where the fork diverges from upstream,
and why** — read it before every `git merge upstream/main`, and update it in the
same commit as any change that adds a new divergence.

> ## ▶ Doing a sync right now?
>
> **Start at [`docs/UPSTREAM_SYNC.md`](docs/UPSTREAM_SYNC.md)** — the ordered
> procedure, the derivation commands, the gate commands as CI invokes them, the
> recompute-not-copy values and the expected-failure baseline.
>
> Then come back here and read the **Divergence sections** below for the window
> you are merging. You do **not** need to read the changelog table to do a sync:
> it is a historical record and it now lives at the **bottom** of this file.
>
> One rule from that page is worth repeating here, because it is what makes the
> rest of this file safe to use: **derive, do not recall.** Every hand-maintained
> list in this repo has drifted from the tree at least once. Where a command can
> produce a list, trust the command over the prose — including the prose here.

## What is in this file

| Section | Answers |
|---|---|
| Divergences 1–7 (below) | what differs, why, and what must never come back |
| Merge diagnostics | how a past sync went wrong, so it does not repeat |
| Merge routine | the short form of the procedure |
| Fork changelog (at the end) | what shipped, wave by wave — a record, not a checklist |

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

> **DERIVE THIS LIST, DO NOT READ IT.** The authoritative set is whatever this
> prints:
>
> ```bash
> comm -13 <(git ls-files | sort) \
>          <(git ls-tree -r --name-only upstream/main | sort) | grep -v '^frontend/dist'
> ```
>
> **58 files as of 2026-08-05** — about 33 in the Divergence-4 cluster and 10 in
> the Divergence-1 cluster below. The hand-written list that used to live here
> named **nine** of them, and had done for several syncs; an agent working from
> it alone would have re-adopted 45 rejected files. The named entries below are
> kept only for the *reasoning* attached to each, which the command cannot carry.
> When the two disagree, the command is right.

Divergence-1 entries, with the reasoning worth keeping:

- `backend/app/services/nanobanana.py`
- `backend/app/services/chatgpt_image.py`
- `backend/app/services/chatgpt_oauth.py`
- `backend/app/services/openrouter.py` (2026-07-26: OpenRouter shipped upstream
  as a THIRD cloud engine — same rejection as the other two)
- `backend/app/services/engine_errors.py` — the shared EngineError/EngineFatal
  taxonomy; its only consumers were the three API engines and the API fan-out
- `backend/tests/test_engines.py`
- `backend/tests/test_chatgpt_oauth.py`
- `backend/tests/test_openrouter_engine.py`, `test_engine_model_choice.py`,
  `test_engine_lists_contract.py`, `test_config_new_engines.py` (2026-07-26 —
  all four merged in with ZERO conflicts; the diagnostic-2 sweep is what caught
  them)
- `backend/tests/test_generate_multi_engine.py` — upstream's mixed local+API
  fan-out suite. It had been deleted here for a while without ever being listed;
  the 2026-07-30 sync is what surfaced it, when upstream ADDED a case to it
  (`test_recovery_barrier_refuses_mixed_local_run_before_any_api_dispatch`,
  payload `{'generator': 'chatgpt'}`) and it arrived as a modify/delete conflict.
  Re-delete it. The local half of what it asserts is covered here by
  `test_cluster.py::test_a_stalled_local_comfyui_never_refuses_work_bound_for_another_machine`.

**`frontend/src/components/dataset/engineSelection.js` is no longer deleted** —
see "Divergence 1b" below. It is now maintained in a LOCAL-ONLY form.

**The whole reference-EDIT stack is no longer deleted either** (2026-07-28):
`reference_edit_jobs.py`, `ReferenceEditModal.jsx`, `referenceEdit.js` (+ its
test), `test_ref_edit_local_engines.py` and the three `/ref/edit` routes are
MAINTAINED here in local-only form — see Divergence 1c. Do not re-delete them on
autopilot from a stale reading of this list. `backend/tests/test_ref_edit.py`
stays deleted: it is upstream's API-lane suite, replaced here by
`test_ref_edit_local_engines.py`.

### Divergence 1c: reference editing is ADOPTED, local-only

**Status: adopted 2026-07-28** — rejected earlier the same day during the sync
itself, then taken as its own wave. The sequencing was deliberate, not a change
of mind: see the changelog rows.

Upstream `47508ab` rebuilt Edit-reference to run on **Klein and Krea 2 Edit**: a
ComfyUI queue job answered by its completion callback, no API call, no key, free.
That removed the one thing this fork ever objected to — the deleted-file note
above says it in as many words ("Klein deliberately excluded, ChatGPT/Nano Banana
only"). By the Divergence-1b principle (D1 forbids CLOUD engines, not second
engines or local features) the local half is in scope, so it is here.

**What this fork ships, and how it differs from upstream's:**

- `reference_edit_jobs.py` — restored as-is (it imports no cloud module), with its
  docstrings reworded: upstream describes TWO lanes filling one registry, and
  there is only one here.
- `face_dataset_service.py` — `start_reference_edit` has **no lane branch**.
  Upstream's `if engine in LOCAL_ENGINES` would be dead in the always-true
  direction, which is the 1b trap; it is deleted, along with `_edit_engine_call`
  and `_run_reference_edit` (the API worker thread). `app` stays in the signature
  so the route and the tests keep upstream's shape.
- `editable_engines()` is upstream's `LOCAL_ENGINES + API_ENGINES` **verbatim**,
  and is local-only BY CONSTRUCTION because `API_ENGINES` is empty. That is the
  payoff for keeping the empty export instead of deleting it.
  `test_ref_edit_local_engines.py` asserts the OUTCOME (`editable_engines() ==
  LOCAL_ENGINES`, no `LEGACY_API_ENGINE_TAGS` member), never the expression — a
  sync that refilled `API_ENGINES` would otherwise hand this fork a paid edit lane
  with no other code change, and nothing else would notice.
- `referenceEdit.js` uses the same derivation (`EDIT_ENGINES = [...ENGINES]`).
  `defaultEditEngine`'s fallback is **recomputed**: upstream hardcodes one of its
  removed cloud engine ids there, which would open the modal on an id no route
  accepts (diagnostic 10). `editCostNote`/`editKeepNote` lost their paid branches
  — a price quoted on a free render damages trust as much as one hidden on a paid
  render.
- **The transient-upload picker is Krea-only here.** Krea 2 Edit's `_b` slot now
  takes one dialog image as a different subject (another person, or a scene);
  request bytes are validated and normalized before a live batch is superseded,
  then handed to ComfyUI as a temporary file. Klein still reads the dataset's
  persistent extra angles instead, so a Klein-only selection hides/refuses the
  picker rather than silently dropping it. The unknown-engine default remains
  `'primary_only'`, never upstream's API-oriented `'all'`.
- The `editReference`/`keepEditedReference`/`discardEditedReference` trio is back
  in `useDataset.js` **and in its returned object** — the slot diagnostic 3 names
  as a hiding spot, called out here because that is where it will go missing next.
- `invalidate_reference_edit` is wired into `crop_reference` and
  `recrop_reference_auto`. Those hooks left the fork when the feature did; without
  them a pending Before/After survives a crop and compares against a reference
  that no longer exists.
- Divergence 3 is retired: keep upstream's `✦` button/heading glyphs.

**Upstream bug NOT copied — FIXED UPSTREAM 2026-08-03, divergence gone.**
Upstream's `/ref/edit/keep` route called `logger.exception(...)` in a module that
never defined `logger`, so its error path raised `NameError` inside the very
`except` that exists to turn a failed Keep into an honest 500. This fork had
side-stepped it with an inline `logging.getLogger(__name__)`. Upstream's
`b1a3d7bd` defines the module logger, which is the better fix, so the route here
is now byte-identical to theirs and the inline form is gone — **and the fork's
comment explaining why it used the inline form went with it, because the merge
made that comment false.**

The test upstream added to pin it lives in `backend/tests/test_ref_edit.py`,
which this fork does not carry (it is the API-lane suite — re-deleted on every
sync). It was PORTED into `test_ref_edit_local_engines.py` as
`test_keep_reports_a_failed_commit_instead_of_erroring_twice`, and verified red
without the module logger. Without that port, re-deleting upstream's suite would
have thrown away the only guard on a line this fork now depends on.

**`frontend/src/utils/localEngineReason.js`** was adopted 2026-07-28 in the sync
itself, ahead of the feature it arrived with, because it is not ref-edit plumbing:
it is the extraction of Klein's four-cause "why can't I pick this" answer out of
`VariationCatalog.jsx`, sitting next to Krea's in `kreaEngine.js`. The GENERATION
panel was its only caller for one commit; the edit modal is now the second, which
is the point of the file — one gap must not be explained two different ways two
clicks apart.

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
- `backend/app/models.py` + `backend/app/__init__.py` — **no `fail_kind` column**
  (2026-07-29). Upstream added it with the Gemini-refusal wave to split a
  provider REFUSAL (`'refused'`/`'empty'`) from a real malfunction (`'error'`).
  Only a cloud engine can refuse, so on this fork nothing ever wrote a non-NULL
  value: the column stayed NULL on every row and `dataset_payload` shipped
  `fail_kind: null` to a client that never read it — an API field advertising a
  classification this fork cannot produce, the same failure mode as upstream's
  `EDIT_REF_SUPPORT: 'all'` default (Divergence 1c). Removed at all seven sites:
  the model column, the `_SCHEMA_ADDITIONS` entry, the `dataset_payload` field,
  the `_BACKUP_IMG_FIELDS` member and the two `old_state`/reset pairs in
  `_reimprove_image_locked` and `regenerate_image`. **Databases that already ran
  the migration keep the column** — an addition that shipped cannot be withdrawn,
  and an unmapped always-NULL column is inert. Restore is unaffected: it reads
  `meta.get(f)`, so an older backup carrying the key is simply not asked for it.
  Expect a small conflict on those tuples whenever upstream edits them; that is
  the known cost, paid deliberately rather than leaving dead plumbing in place.
- `backend/app/setup_state.py` (2026-08-01, upstream's "don't re-run Setup"
  memory) — `TRACKED` drops upstream's `engines.nanobanana` / `engines.chatgpt` /
  `engines.openrouter` rows and `_RECOMMENDED_ENGINES` is `('klein', 'krea')`.
  **Do not "restore symmetry" by adding `engines.klein`/`engines.krea` to
  TRACKED.** Those are not durable here: they follow ComfyUI being REACHABLE, so
  a tracked engine row turns "ComfyUI is not running" into a reported REGRESSION,
  which is the nag this whole file exists to remove. `comfyui.dir_valid` is the
  durable half and is upstream's own. `backend/tests/test_setup_state.py`'s
  fixtures are re-pointed to `{klein, krea}` for the same reason; its
  `test_comfyui_or_ollama_merely_stopped_is_not_a_regression` is the test that
  catches the mistake.
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
- `backend/app/services/face_variations.py` — `PREVIEW_ENGINES` is
  `('klein', 'krea')`, and upstream's `_API_PREVIEW_ENGINES` branch in
  `compose_preview` is DELETED rather than left dead (2026-07-27). A legacy
  cloud tag then resolves to Klein through the function's own unknown-engine
  fallback, the same rule `LEGACY_API_ENGINE_TAGS` rows follow everywhere else.
  Deleting that branch is also what keeps `wrap_variation` caller-free, which is
  the documented state of that retained dead code (see the bullet below).
- Frontend: `VariationCatalog.jsx` (single Klein card), `EnginesSection.jsx`
  (Klein LoRA presets + only the `klein_identity` identity-prompt card — the
  `face_single`/`face_multi` cards, `CHATGPT_AUTH_OPTIONS` and the whole
  `ChatgptSubscriptionCard` OAuth block, and upstream's `ImageModelsCard` /
  `ModelField` per-API-engine model card stay dropped, no Gemini/OpenAI secret
  fields; it DOES take `configDefaults` so the legitimate `ResetToDefault`
  works on the Klein/Krea settings that survive, but not `refreshCaps`/`toast`,
  which only the subscription card used), `settings/PromptPreview.jsx` (engine picker is
  `klein` + `krea` only; upstream's `API_ENGINES`/`isApi` branch, which greys
  out four controls for the cloud family, is deleted — pinned by
  `frontend/tests/prompt-parts-contract.test.mjs`),
  `settings/settingDefaults.test.js` (its `COVERED` list is a fork contract:
  upstream also requires resets for `engines.chatgpt_auth` /
  `nanobanana_model` / `chatgpt_image_model` / `openrouter_model` and for the
  seven `cloud.*` rental settings in `TrainingSection.jsx` — none of those
  cards exist here. **`TrainingSection.jsx` JOINED the "reads the shared lookup"
  list on 2026-07-28**, reversing the previous sync's note: concept face masking
  gave that file its first NON-cloud resets (`face_mask.expand` /
  `face_mask.min_weight`), so it now imports `defaultValueAt` for a legitimate
  reason. The seven `cloud.*` rows stay out),
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
   It ALSO budgets the cloud-engine **identifiers** (`nanobanana` / `chatgpt` /
   `openrouter`) per file, in `frontend/src` and — via
   `backend/tests/test_local_only_engines.py` — in `backend/app`. That half
   exists because the phrase list is narrow: the 2026-07-27 sync merged a whole
   `PromptPreview` engine picker, an `API_ENGINES` branch, six API-key help
   topics and a backend `PREVIEW_ENGINES` tuple without tripping a single
   forbidden phrase. When the budget fails, strip the new plumbing; only raise a
   number for a genuinely historical mention, and say why in the commit.
2. After every upstream merge that touches `frontend/**`, run
   `cd frontend && npm run build` and commit dist in a separate
   `build(frontend):` commit (see CLAUDE.md).
3. Do **not** re-add `GEMINI_API_KEY` / `OPENAI_API_KEY` to Settings, Setup,
   `.env.example`, or help registry.
4. **The capability-row count is a divergence with a number.** This fork ships
   upstream's list minus the three cloud engines, so every upstream bump moves
   it too: 11 -> 8, and 12 -> **9** since Krea 2 Edit became a counted row
   (2026-07-27). Two suites assert it — `capability-destinations-contract.test.mjs`
   and `kreaInstall.test.js` — and an upstream sync that adds a capability will
   fail BOTH with upstream's number. Recompute it from
   `deriveCapabilitySummary`, never copy upstream's literal.

Compatibility notes:

- Existing datasets with API-generated rows keep working; those rows
  regenerate through Klein (see `LEGACY_API_ENGINE_TAGS`).
- Stale `engines.*` keys and GEMINI/OPENAI entries in an existing
  `config.json`/`.env` are ignored — nothing needs manual cleanup.

## Divergence 2: Klein model-file pins — RETIRED 2026-08-02 (upstream took it)

**This divergence is over, and it ended the way the fork wanted it to.** Upstream
ported the whole feature back from this fork's branch (GitHub #20) in
`644ab5dd` / `54032d62`, keeping the entry-point names (`resolve_model_ref`,
`_configured_model`, `klein_override_status`, `_stage_external_model`,
`_unet_weight_dtype`), then fixed a defect in their own port (`76b25466`).
All eight files this section used to list are now UPSTREAM's, and the sync took
their version on all 34 conflicting hunks.

What the fork still carries in those files is **Divergence 1**, not this one:
`EnginesSection.jsx` drops the cloud cards, `helpRegistry.js` drops the
`engines.chatgpt_auth` topic and the cloud keywords, `capabilities.py` and
`config.py` drop the cloud probes and keys. Resolve those per hunk as always.

**Two traps this retirement sprang, both of which take a feature BACKWARDS
without failing anything** — the general lesson is diagnostic 21:

- Upstream MOVED `KLEIN_OVERRIDE_KEYS` and `_PINNED_SUBDIR` to the top of
  `klein_edit_helper.py`. The fork's copies sat outside every conflict, so
  taking upstream's side left the module with two definitions of each. Same
  value, so nothing failed.
- `EnginesSection.jsx` was worse: upstream's improved `overrideBadge` /
  `KleinModelFilesCard` landed inside the conflict while the fork's OLDER pair
  sat 700 lines below it, outside. A `function` redeclaration is legal and the
  LAST one wins — so the merge would have shipped upstream's card definition
  dead and the fork's superseded one live, silently undoing `76b25466`'s fix.
  Neither the bundler nor `no-undef` says a word about a redeclaration.

## Divergence 3: emoji-free UI — RETIRED 2026-07-29

**This divergence is over. The fork keeps upstream's emoji, everywhere.** Do not
strip pictographs on a merge, do not "re-strip" a hunk, and do not add a glyph to
the keep/strip lists — there are no lists any more.

**Why it was retired: it was breaking the UI, and had been for a while.** Owner
report — "on the UI for Datasets, download buttons are blank squares, and when
trying to delete or X on images the buttons are malformed skinny rectangles".
Both were true. This app's author uses emoji AS the control, not as decoration
beside a text label, so a button whose entire child was `🗑` became
`<button …></button>` — a bordered box with no content, which renders as a thin
rectangle and is unclickable-looking. The strip's own rule ("never leave an empty
control behind: a glyph that was the button's whole label is REPLACED") was
written precisely because this kept happening, and it was applied by hand, per
merged hunk, across ~1 200 lines and four years of upstream waves. It missed
some every single time. Three empty `<button>` elements were live in the shipped
UI when this was retired (preset delete, open dataset folder, seed reroll), plus
a dozen invisible `<span aria-hidden></span>` badges.

**What the restoration did (2026-07-29).** Every line whose ONLY difference from
upstream was removed non-ASCII symbols was restored to upstream's version:
**1 200 lines across 149 files**. Fork-authored lines upstream does not have were
left alone, so a handful of fork-only strings are still emoji-free — that is
drift now, not policy, and it is fine to fix opportunistically.

**Two traps, if this ever has to be replayed.** Both bit during the restore:

- **Never treat ASCII characters as strippable symbols.** Python's
  `unicodedata.category('`') == 'Sk'`, so a naive "remove symbol chars" rule made
  an upstream line `  }\`` collapse to `  }` — which matches a `  }` in the fork,
  and the restore then wrote a stray backtick into `App.jsx` and broke the parse.
  ESLint caught it; nothing else would have. Restrict to non-ASCII.
- **A glyph owns exactly one following space, unconditionally.** Skipping that
  space only when the previous character was not itself a space leaves a double
  space, and the line then matches nothing — 597 restorations were silently
  missed until that was fixed. The tell is a suspiciously small hit count.

`🔞` was always kept and is unaffected. `README.md` was never stripped.

**Consequence for the merge routine:** the D3 re-strip step is GONE. Merge
diagnostic 14 (the three-pass strip) and the glyph accounting in the changelog
rows above are historical — they describe what the fork used to do, and are kept
because the changelog is a record, not instructions.

## Divergence 4: Local-only training (no remote GPU rental)

Settings → Training keeps **Defaults** only — no rental API-key card and no
cloud guardrails. Since 2026-07-28 it also carries **Concept face masking**
(`face_mask.expand` / `face_mask.min_weight`), which is local training work and
has nothing to do with the rental cards removed here — the two arrived in the
SAME conflict hunk and must be resolved apart (diagnostic 4). The UI also:

- Forces `cloud_training: false` in `CapabilitiesContext` (even if a leftover
  key sits in `.env`).
- Removes **Train in cloud**, GPU-speed picker, and Runs-page rental banners.
- Keeps Settings → Training free of the rental control panel. Upstream moved the
  whole thing there on 2026-07-28: `VastKeyGuide`, `VAST_SECRET`,
  `CloudOfferFilter` and `CloudTrainingCard` (eleven knobs + a live "Spent this
  month" line), plus 13 `helpRegistry` topics and 10 `settingDefaults` reset rows
  anchored on that card's DOM ids. All rejected. Re-check the orphan list after:
  `ResetToDefault`/`defaultValueAt` STAY (concept face masking uses them),
  `useState`/`useEffect`/`SecretField` go with the card.
- **Gate every NEW Continue host on `caps.cloud_training`** (diagnostic 16).
  `TrainingPanel` does; upstream's `LineageCanvas` host derives the lane from
  `configured` instead, which is a different question and would open the rental
  lane on the board alone.
- Shows **Runs** as local history only (cloud rows filtered out).
- Keeps the CPU-only **Quantize an existing model to fp8** tool in the ordinary
  local Training panel. Its file conversion and quantized-base guard are local
  utilities, not permission to restore dense rental recipes, pod delivery,
  cloud quantization, Hub storage controls, or any remote cleanup lane.
- **When rejecting a hunk deletes the dialog's only caller of a shared helper,
  delete the IMPORT too, not just check the call site (diagnostic 19).**
  2026-08-02: `cloudUnsupportedFamilyReason` (from `trainingFamilyScope.js`,
  shared with the fork's own local family-scoping) stayed imported in
  `TrainingPanel.jsx` after its one caller — the rejected dialog's
  `cloudDisabledReason` — was deleted. Harmless at runtime (an unused import),
  but a merge that keeps re-adding the dialog will keep re-adding this call
  site too, and nothing short of grepping the deleted code's helper names
  catches it.

Backend cloud routes may still exist dormant; they must not surface in the UI.

### Deleted files (D4) — derive, then check the clusters below

D4 had **no deleted-file list at all** until 2026-08-05, while D1 has had one
since the start — and D4 is now the *larger* recurrence surface: about 33 of the
58 rejected files, and six of the marker-less leftovers in the 2026-08-04 window
alone. Use the same derivation as D1:

```bash
comm -13 <(git ls-files | sort) \
         <(git ls-tree -r --name-only upstream/main | sort) | grep -v '^frontend/dist'
```

The D4 cluster in that output falls into five groups. Knowing the group is what
lets you recognise a NEW file of the same family on sight:

| Group | Files (2026-08-05) |
|---|---|
| Dense (full-model) services | `dense_artifacts.py`, `dense_fp8_delivery.py`, `dense_local_delivery.py`, `dense_pod_hub.py`, `dense_weights.py` |
| Pod transport / checkpoint handback | `pod_transfer_plan.py`, `pod_checkpoint_push.py`, `podTransportChoice.js` (+ test) |
| Hugging Face storage & presence | `hf_storage.py`, `hub_presence.py`, `useHubPresence.js`, `hfStorage.js` (+ test), `HfStorageCard.jsx` |
| Cloud / one-click quantization | `cloud_quantize.py`, `fp8_local_delivery.py` |
| Dense UI + its suites | `DenseModelsPanel.jsx`, `denseModels.js` (+ test), `DenseTurboAndCustomBase.test.js`, and the `dense-*`/`fp8-one-click-*` contract tests |
| Video Bank cloud training (2026-08-07) | `cloud_video_training.py`, `pod_video_probe.py`, `test_cloud_video_launch.py`, `test_cloud_video_lifecycle.py`, `VideoDatasetCloudPanel.jsx`, `videoCloudStatus.js` (+ test) |

**2026-08-07 — the Video Bank arrived as a whole new top-level page (87 files,
~72 commits) and split cleanly on the SAME line every other D4 sync has:**
`video_training_local.py` (ai-toolkit, this machine's GPU) is kept; its rented-pod
counterpart above is not. `video_datasets.py` marks the cut inline —
`# DIVERGENCE 4 — upstream continues here with the rented-pod video lane: ...
This fork trains video LOCALLY only` — naming the exact upstream routes
(`POST /train/cloud`, `GET /train/cloud/progress`, `/checkpoints`, `/checkpoint`,
`POST /train/cloud/retry`, `/continue`) that were never carried, so a future sync
re-adding any one of them reads as a diff against that comment, not a guess.
Everything else in the video lane — shot detection (TransNetV2), clip
dedup/export/search (CLIP + SigLIP2), captioning, probing, the local training
lane, the whole `videobank/` UI — is local-only by construction (Divergence 1
already forbids a cloud generation *or* training engine reappearing) and was
adopted whole.

**The naming trap, paid for twice on 2026-08-04.** `fp8_local_delivery.py` is
REJECTED (it fetches a dense run's master from a private HF repo); `fp8_quantize.py`
and `fp8_export.py` are KEPT (the local CPU-only tool). Two separate reviewers
classified the first as the second on filename resemblance alone. Read the
module docstring before deciding — never the filename.

**Not everything with a pod in its commit message is rental UI (2026-07-28).**
Two things arrived in the cloud-flavoured commits and are KEPT, deliberately:

- `frontend/src/utils/downloadProgress.js` + the `DownloadProgress` block in
  `TrainingProgress.jsx` — the byte counter parses whatever the run is fetching,
  and a LOCAL run pulls its base weights too. It is rendered by `TrainingPanel`
  as well as `CloudRunsPage`. Kept, with its comment and its What's-new entry
  reworded off the pod/vast.ai framing.
- `preflightLane.js` and the `?lane=` filter in `lora_training.py` — ▶ Continue
  shares the lane concept (the fork keeps the Local/Cloud Continue picker
  dead-but-visible), and `test_training_preflight_lane.py` covers it. Kept; only
  the cloud LAUNCH that called it (`launchCloud`) was rejected.
- `lora_merge.py` / `lora_merge_job.py` / `LoraMergeTool.jsx` / `routes/tools.py`
  (2026-08-04) — "fold a LoRA into a base and get a full model" arrived in the
  same commits as the rejected full-model checkpoints panel and shares the
  vocabulary ("full model"), but the merge itself is pure local file-in/file-out
  (no ai-toolkit gate, no ComfyUI gate, no cloud) and reuses the local fp8 tool's
  `quantize.python` interpreter. Kept; the `DenseModelsPanel` it was bundled
  inside was not, and the merge tool's standalone `<details>` mount in
  `TrainingPanel.jsx` had to be split out of that panel's render block by hand.

Deleting any of these on the next sync because the diff says "full model" or
"cloud" would remove a local feature. The rule is what SURFACES, not what a
commit is named.
Upstream merges that restore Training Settings cards, Setup “rent a GPU” copy,
or Runs rental prompts: delete them again. Contract:
`frontend/tests/local-only-engines-contract.test.mjs` (also forbids rental UI
strings).

**The README and the guides described the rental lane as if it shipped, for
every sync until 2026-08-01.** The removal had always been enforced in CODE and
recorded here, and never once propagated to the prose, so the front page carried
a `### No GPU? Train in the cloud` chapter (vast.ai key, price caps, pod safety)
plus ~20 further claims, and contradicted itself on the same page: *"there is no
rented-GPU training lane"* eight lines above a pointer to that chapter. The cause
is structural and worth naming — **the local-only contract reads `frontend/src`
and `frontend/dist`, and `README.md` is in neither**, so the one gate that would
have caught it never looked. Fixed across `README.md`, `docs/guide/workflow.md`,
`docs/DATASET_GUIDE.md`, `docs/guide/getting-started.md`,
`docs/guide/using-the-app.md`, `docs/guide/known-limitations.md`,
`docs/guide/settings-reference.md` and `.env.example`. Two of those said
something stronger than "stale": settings-reference claimed *"Cloud training
itself still works end to end … Continue/Retry still work"*, which
`CloudRunsPage.jsx:643` disproves in one line (`.filter(r => r.source !==
'cloud')`, with the three cloud status values pinned off right below it), and
`VAST_API_KEY` was documented as *"Required to enable cloud training at all"* —
setting it enables nothing here. **When a sync re-offers this prose, reject it in
the docs too, not only in the JSX.**

**The docs are a fourth recurrence surface, and the contract does not cover
them.** `docs/guide/troubleshooting.md` joined it on 2026-07-28 with a whole new
**A cloud run seems stuck** chapter (Cloud tab, vast.ai console, pod phases) —
rejected; the fork's help registry already points its `/cloud` topics elsewhere
precisely because that H2 does not exist here.
`docs/guide/settings-reference.md` carries upstream's `### Cloud GPU
(vast.ai)` + `### Cloud training` sections, and any upstream edit landing near
them re-offers the pair inside an otherwise-legitimate hunk (2026-07-28: a new
"face detection is optional" paragraph immediately above them). Delete the two
sections again, not the paragraph — the fork documents the same `cloud.*` keys
under **Config-file-only settings**, which is the honest place for a dormant
backend with no Settings card. The contract test only reads `frontend/src` and
`frontend/dist`, so this one is caught by reading the hunk, not by a gate.

## Divergence 5: patches carried on upstream TEST files

Not a policy divergence — bugs in upstream's own tests that make this fork's CI
red, or that cost this container a permanently red test nobody can act on. They live in files upstream is actively editing, so each is deliberately
written as ONE self-contained hunk that a future sync can re-apply or drop if
upstream fixes it their way. **A merge that silently loses one of these turns CI
red without touching a line of product code**, so check them after every sync.

**One entry, added 2026-07-28 (evening) — and it is carried in TWELVE files,
not one. Corrected 2026-08-02:** this section said "one entry" and named a
single file for five days. Anyone told to "drop this hunk when upstream fixes
the fixture" would have dropped one and left eleven. Counted from the diff, not
from memory: `git diff --name-only upstream/main -- 'backend/tests/*.py'`
filtered on hunks adding a `venv/.../bin/python` line.

- The bug, which is the same in every carrier: a test helper (usually named
  `_configure_aitoolkit`) builds ONLY the Windows venv layout
  (`venv/Scripts/python.exe`), while `config.aitoolkit_derived_python` branches
  on `os.name` and looks for `venv/bin/python` on POSIX. On Linux the fake
  install therefore reads as ABSENT and the tests behind it fail with
  `ai-toolkit is not configured` (409). Each hunk writes both layouts; the
  resolver picks the one for the platform, so it is inert on Windows and the
  tests assert the same thing on both.

- **The carriers — DERIVE them, the count in prose has already been wrong once:**

  ```bash
  git diff upstream/main -- 'backend/tests/*.py' | awk '/^\+\+\+ b\//{f=$2} /^\+/ && /venv/ && /bin/ {print f}' | sort -u
  ```

  **13 files as of 2026-08-05**, not the twelve this section claimed for several
  syncs: `test_anima_family.py`, `test_continue_flexible.py`,
  `test_custom_base_paths.py`, `test_final_save_step_number.py`,
  `test_flux2klein_family.py`, `test_local_retry.py`, `test_runs_lineage.py`,
  `test_slider_mode.py`, `test_train_base_family_scope.py`,
  `test_training_preflight.py`, `test_training_queue_atomic.py` (TWO sites, and
  it additionally carries an `os.name` branch of its own), `test_training_service.py`,
  and **`test_vision_features.py`** — the unrecorded thirteenth, exactly the
  silent-revert risk this section warns about, found by running the command
  instead of reading the list.

### The SECOND carrier family: `**_kw` widening of the infer-subprocess mocks

Undocumented as a family until 2026-08-05, though individual instances were
recorded as they bit. This fork calls `_drive_infer_subprocess` with
`stall_label=` / `busy_detail=` (the CUDA stall watchdog upstream does not
have), so an upstream double declaring the plain positional signature raises
`TypeError` — and it surfaces as *"one image deleted mid-pass killed the whole
pass"*, blaming the feature under test for a mock that never matched it.

```bash
git diff upstream/main -- 'backend/tests/*.py' | awk '/^\+\+\+ b\//{f=$2} /^\+/ && /\*\*_kw/ {print f}' | sort -u
```

**12 files as of 2026-08-05**: `test_bank_folder_person.py`,
`test_bank_infer_no_db_lock.py`, `test_bank_medium_after_score.py`,
`test_bank_pass_survives_deleted_image.py`, `test_bank_remote_pass.py`,
`test_bank_score_gpu_window.py`, `test_bank_vision_remote.py`,
`test_comfyui_model_file_capability.py`, `test_data_integrity_trash.py`,
`test_db_write_lock.py`, `test_image_bank_stop_honesty.py`,
`test_peer_worker_infer.py`.

**Widen the mock, never narrow the call.** A NEW upstream test that mocks that
function is a carrier the moment it lands, so re-run the command after every
merge — the fix is always `**_kw` on the double, and it is always cheaper than
the misdiagnosis it prevents.

The same shape recurs one level up: upstream doubles for `caption_paths` broke
when this fork began forwarding per-run engine/model overrides (2026-08-05).
Upstream fixed its own copy with `**_over`; both patches coexist in
`test_bank_pass_survives_deleted_image.py`, on different functions.

- `test_local_retry.py` is the one that was measured: **12 passed / 5 failed
  before, 17 passed after.** The other eleven were never counted individually.

  Two files create only the Windows layout and are deliberately NOT carriers:
  `test_run_snapshot_compare.py` monkeypatches the resolver itself, and
  `test_setup_installer.py` already writes both.

  Why it is carried rather than left, when CI (`windows-latest`) is green on it:
  the container's failure floor is not free. Those five were triaged as merge
  damage once, then as environment, then diagnosed twice — and diagnostic 7
  exists because that floor is what makes a baseline diff necessary at all.
  Five fewer is five fewer. Drop these hunks the moment upstream makes the
  fixtures OS-agnostic — **all of them, and re-derive with the command above
  rather than trusting any count written here.** Upstream asked for this as a PR on 2026-08-02, so the
  retirement may come soon.

**A second, unrelated entry, added 2026-08-02** — same section because it is the
same shape (a bug in an upstream test, not a policy divergence), but a different
bug and a different file:

- `backend/tests/test_bank_pass_survives_deleted_image.py` — upstream's new
  suite for the deleted-mid-pass fix mocks `_drive_infer_subprocess` with their
  exact positional signature. This fork's score and face passes call it with
  `stall_label=` and `busy_detail=` (the CUDA-interpreter stall watchdog upstream
  does not have), so the mock raises `TypeError` — and the failure surfaces
  through the suite's own `_assert_survived` helper as **"one image deleted
  mid-pass killed the whole pass"**, which blames the feature under test for a
  mock that never matched this fork's caller. Widened to `**_kwargs`, the same
  one-line fix `test_bank_infer_no_db_lock.py` needed on 2026-08-02's earlier
  sync; expect it on every new upstream suite that mocks that function.

**A third entry, added 2026-08-03 — and it had been carried UNRECORDED, which is
the part worth reading.** The patch was already in the tree; this section did not
list it, so the next merge that took upstream's version would have reverted it
silently and nothing would have looked wrong until the suite went red again.

- `backend/tests/test_bank_score_gpu_window.py` —
  `test_a_cpu_scoring_pass_never_takes_the_gpu_window` ends with
  `assert banks._resolve_score_device() == ('cpu', False)`, and upstream places
  that assert **outside** the `with patch('app.capabilities.
  bank_scoring_gpu_available', lambda: False)` block. Outside the patch the
  resolver probes the machine actually running the suite, so on any box with a
  CUDA GPU it answers `('cuda', True)` and the test fails — while asserting
  nothing about the CPU pass it is named for. Upstream's CI is `windows-latest`
  with no GPU, which is exactly why it is green for them and red for every
  contributor with a real card. The fork moves the assert inside the patch (and
  widens the `fake_drive` mock with `**_kw`, the same mock-signature story as the
  entry above).

  **Verified both ways on 2026-08-03**, because "it fails upstream" is a claim
  worth evidence: pristine `upstream/main`, detached worktree, `git status`
  clean, no changes of any kind → `1 failed, 5 passed`. The fork's copy of the
  same file → `6 passed`. It is a real upstream bug, not an environment
  accident, and it is a PR waiting to be sent — same class as the ai-toolkit
  venv-layout fixture (a test that only passes in the maintainer's environment).

  **Only HALF of this carrier is going upstream, and the halves retire
  separately.** Branch `fix/gpu-window-assert-outside-patch` proposes the assert
  move alone (+5/−1) — measured on upstream's own tree, that is sufficient there:
  `6 passed` without touching `fake_drive`. The `**_kw` widening is fork-only,
  because it exists for a caller upstream does not have (`stall_label=` /
  `busy_detail=`, the CUDA-interpreter stall watchdog), exactly like the
  `test_bank_pass_survives_deleted_image.py` entry above. **So when the assert
  move lands upstream, drop that hunk and KEEP the `**_kw` one** — this entry
  shrinks rather than retiring.

  **How it was found is the transferable part.** It surfaced only because a
  contribution branch was checked with the FULL backend suite rather than the
  file it touched — the branch changed zero backend files and still came back
  `1 failed`. Do that for every upstream PR: run `python -m pytest backend/tests
  -q` against the branch, and when something fails, re-run it on pristine
  `upstream/main` before believing the change caused it.

An adjacent patch was checked at the same time and is deliberately NOT listed
here: `backend/tests/test_comfyui_model_file_capability.py` carries a `**_kwargs`
widening and a `status_code = 200` on its `requests.post` mock, but upstream's
own version of that file passes against this fork's code (15 passed, measured).
It is inert — merge surface with nothing behind it — so it is not a carrier, and
a sync may take upstream's side freely.

**A fourth entry, added 2026-08-05 — this one on the FRONTEND side, and pinning
a signature rather than a fixture.** `frontend/tests/bank-score-rescore-contract.test.mjs`
(new this sync, guarding the ✨ Score resume-on-stop feature) asserted
`start_score`'s exact Python parameter list with a regex anchored on `):` right
after `rescore=False`. This fork's `start_score` also carries `device_id=`
(Divergence 6 peer dispatch), which upstream's signature does not have, so the
exact-match regex failed on a caller upstream never wrote. Widened to tolerate
extra keyword parameters in either position rather than pin the literal list:

```js
assert.match(service,
  /def start_score\(app, user_id, bank_id,[^)]*\brescore=False\b[^)]*\):/)
```

Same shape as the other three entries — a merge that takes upstream's version
of this ONE assertion verbatim turns the frontend suite red with no product
change behind it — but it is not derivable by the grep commands above (no
`venv`, no `**_kw`); check it by hand after any sync that touches `start_score`'s
signature or this test file.

The section previously held the worked example of how these are meant to end:

- ~~`backend/tests/test_face_mask_preview_progress.py` — an autouse
  `_app_context` fixture~~ — **RETIRED 2026-07-28**, upstream `64c25c2`. It did
  exactly what the section promises: carried as one hunk, then dropped whole the
  moment upstream fixed it their way (each test now pushes its own context and
  `_dataset` returns an ID rather than a detached ORM instance). Upstream's
  version is taken verbatim; the fork carries nothing here again.
  **The postscript is the useful part**: upstream's suite was green on their dev
  machines and 9-red in CI because the optional `pytest-flask` sits beside their
  dev interpreter and its autouse `_push_request_context` hides the missing
  context — while CI installs `requirements.txt`, which does not list it. This
  fork never saw that gap (the plugin is absent here, so local == CI and the
  failure reproduced immediately), which is why the fork spotted the bug within
  hours of the feature landing and upstream took two days. Their fix ships
  `backend/pytest.ini` with `addopts = -p no:flask`, adopted here: it forces the
  CI condition on every machine, and it must live in `addopts` because by
  conftest-import time the entry-point plugins' fixtures are already parsed
  (upstream tried `set_blocked()` and `unregister()`; both left the suite passing
  for the wrong reason). Note it makes `backend/` the pytest rootdir for CI's
  `python -m pytest backend/tests -q` — verified harmless, both here and on
  upstream's own green run.

## Divergence 6: upstream's dormant `worker_url` plumbing is now LIVE here

Upstream's `utils/comfyui.py` has carried `worker_url=` parameters on
`queue_prompt_to_comfyui` / `get_comfyui_history` / `cancel_comfyui_prompt` /
`free_comfyui_vram`, plus `download_image_from_worker` and the
`ImageGenerationQueue.worker_id` column, since before this fork — **with zero
callers on either side**: abandoned scaffolding from an upstream remote-worker
feature that never shipped.

On 2026-07-29 this fork activated it: `services/backend_worker.py` drives
remote ComfyUI **API backends** through those exact parameters, and
`services/cluster.py` + `job_queue.add_job` route `worker_id` values of the
form `api:<hex>` to per-backend worker threads (peer UUIDs and `local` keep
their existing meaning).

**Merge caution:** if upstream ever revives its own version of this feature,
its calls will collide with ours in `job_queue.py` and `utils/comfyui.py` with
few or no conflict markers (the signatures already match — that is the trap).
On such a sync, diff upstream's new *callers* of `worker_url`/`worker_id`
against `backend_worker.py` before resolving anything, and keep the fork's
`api:` id namespace and the "backends work in ANY role" behaviour. Meanwhile
do NOT strip the "unused" `worker_url` params during any cleanup pass —
they are upstream surface AND fork load-bearing now.

### The collision arrived on 2026-07-30, and it is now a carried divergence

Upstream `65e96e85` added a durable **ComfyUI recovery barrier**: a stalled local
prompt installs `comfyui_stalled_barrier`, and `require_comfyui_enqueue_ready()`
refuses new ComfyUI work until it is resolved. It is enforced in two places, and
BOTH had to be scoped here, because the barrier describes **this machine's**
ComfyUI while this fork can aim a job at a peer or an `api:` backend that runs its
own:

- **`job_queue.add_job`** — upstream wraps the insert in
  `with GPU_ARBITER_LOCK: require_comfyui_enqueue_ready()`. Here the check runs
  only on the LOCAL branch (`backend` / `remote` return earlier). The arbiter is
  skipped on the remote branches too, deliberately: it serializes local GPU
  consumers, and the peer path would otherwise hold it across
  `_publish_remote_comfy_job`'s **artifact file copies** for no benefit.
- **`routes/datasets.py::dataset_generate`** — this one **auto-merged with ZERO
  conflict markers**, which is the whole reason Divergence 6 exists. Upstream
  gates on `any(generator in svc.LOCAL_ENGINES for generator, _ in batches)`,
  which is the **D1b trap**: `API_ENGINES` is empty here, so that test is
  ALWAYS TRUE and cannot tell a local run from a remote one. Re-gated on
  `not remote_device`, beside the Klein/Krea preflights that already skip for
  peers. The other new gates upstream added (`/improve`, `/reimprove`,
  `/improve-batch`, `lora-test/run|resume`, and both in `routes/studio.py`) are
  correct **as upstream wrote them** — none of those lanes accepts a `device_id`.

Left unscoped, a stuck ComfyUI on the Primary would refuse every batch aimed at a
healthy rented GPU, with a 409 the user could only clear by going and fixing a
machine they were not using.

**Pinned by** `test_cluster.py::test_a_stalled_local_comfyui_never_refuses_work_bound_for_another_machine`,
which was verified to FAIL when the scoping is removed (it raises the real
`ComfyUIRecoveryRequired` on the peer enqueue). Keep that test: the signatures
match upstream's exactly, so this re-breaks silently, not loudly.

### 6a. `local_rows_only` — every "is the GPU busy?" query must be scoped

Activating `worker_id` created a second, quieter obligation that took until
2026-07-31 to satisfy: **any query that asks "is this machine's GPU busy?" must
filter to rows this machine owns.** Upstream has no live `worker_id` concept, so
every such query there is correctly unscoped — and each one adopted verbatim is
a silent bug here, because a remote backend writes `processing`/`sent_to_comfy`
into the same shared table.

Three sites had it wrong, all blocking LOCAL work on a REMOTE render:
`process_one`'s admission check (froze the local worker for the whole remote
job, up to 15 min), `has_comfyui_work` (blocked a training launch and the vision
GPU window), and `vision_keepalive.gpu_is_contended` (unloaded the local vision
model for a card nobody was contending). All three now route through
`job_queue.local_rows_only(query)`.

**Merge trap:** these are ordinary-looking queries with no fork marker in them.
An upstream rewrite of `process_one`, `has_comfyui_work` or `gpu_is_contended`
will clean-merge and quietly drop the filter — no conflict, no grep hit, and the
regression is invisible until someone owns two machines. After any sync touching
those functions, re-grep `status.in_(` in `job_queue.py` and
`vision_keepalive.py` and confirm each GPU-busy query still goes through
`local_rows_only`. `backend/tests/test_job_queue.py` guards all three
(`test_a_backend_render_does_not_block_local_work`,
`test_a_backend_render_does_not_block_a_training_launch`,
`test_backend_rows_do_not_make_local_ollama_unload`), each paired with a mirror
test proving a LOCAL row still blocks — so the filter cannot be over-applied
into removing the guard.

Correctly left unscoped: `_prune_staged_inputs` (over-keeping files is the safe
direction for a destructive prune) and the four non-queue flags in
`process_one`'s check (`training_in_progress`, `vision_in_progress`, the vision
window fence, the stalled barrier) — those really are about this machine.

**Two more sites, found by MERGING 6 into 6a — neither side had them wrong
alone.** `_recover_stuck_jobs` and `_stall_comfyui_prompt` were left unscoped
when 6a shipped, recorded there as deferred rather than half-fixed. Merging the
two divergences is what made them dangerous, and it is worth being precise about
why, because this is the exact shape Divergence 6 warns about:

`_recover_stuck_jobs` queries `status.in_(('processing','sent_to_comfy',
'cancel_requested'))` with no `worker_id` filter, and `backend_worker` writes a
REMOTE row into `sent_to_comfy` with the remote prompt id. Restart the app mid
remote render and startup recovery stalls that remote row and installs the
**single global** `comfyui_stalled_barrier`. Before the merge that cost one
paused queue worker. After it, Divergence 6's `require_comfyui_enqueue_ready()`
reads the same global slot from `add_job` **and six route preflights** — so every
local Studio run, LoRA test, resume, improve and improve-batch returns 409
`comfyui_recovery_required`, naming a machine the user is not sitting at. That is
precisely the failure 6 re-gated `dataset_generate` to avoid; the barrier's
INSTALLATION side was still open. Both queries now go through `local_rows_only`.
Remote rows are reaped by `backend_worker`/`cluster` on their own terms.

`_stall_comfyui_prompt` is the same class at lower probability — it matches on
`comfyui_prompt_id` alone, so a false hit needs a prompt-id collision across two
ComfyUI instances. Scoped for symmetry: the rule is "every shared-table predicate
that means *this machine*", not "every one we have seen fail".

**Pinned by** `test_job_queue.py::test_startup_recovery_ignores_a_backend_render`,
verified to FAIL without the scoping (the barrier installs and the local
`add_job` raises `ComfyUIRecoveryRequired`).

## Divergence 7: fixes carried AHEAD of upstream — one dropped line, one new fix

Not a policy divergence and not a permanent one: bugs found here, reported
upstream, and fixed here because waiting would leave this fork exposed. Upstream
has said it is taking each of these, so **expect a conflict on the next sync and
prefer THEIR version when it arrives** — unless the reasoning below says
otherwise. Delete an entry the moment its upstream fix lands.

**The 2026-08-02 entry is gone: upstream took it, and five others with it.** The
whole six-fix batch reported from here as GitHub #20 landed upstream overnight
(`b1a3d7bd`, `9c3ddad0`, `bb2df2e6`, `dd1e355d`, `f99567df`, `f089ebb5`) and was
merged back on 2026-08-03. Every one of them is now UPSTREAM's code, so there is
nothing left to carry and nothing left to re-apply. Four of the six had already
been fixed here, so the sync's real work was comparing two independent fixes for
the same bug and keeping theirs — see the changelog row.

The fence entry (`ollama_gpu_fence.py`) was checked against the three things this
section said to check, and upstream's version satisfies all three: the release
paths still accept a stopped daemon (their `_RUNNER_HOLDS_NOTHING` tuple is
exactly this fork's retired `_runner_is_idle` helper), `mark_before_generate`
returns `'local'` and writes no claim, and `fence_status` reports
`reachable: False`. Their file was taken whole.

**One line of it is deliberately NOT taken, and this is the only thing left of
Divergence 7:**

- `_CLAIM_MAX_AGE_S = 3600.0` — upstream's fix re-adds this constant and tests it
  in `_adopt_persisted` as `now > horizon or now > deadline + _CLAIM_MAX_AGE_S`,
  where `horizon` is `deadline + _CLAIM_SLACK_S` (30 s). Any `now` that satisfies
  the second disjunct satisfied the first long before, so the clause **cannot
  ever be the one that fires** — it is unreachable by construction, while
  documenting a guarantee ("a claim never speaks for a runner an hour later")
  that no code path provides. Dropped here, with the reasoning kept as a comment
  above `_CLAIM_SLACK_S` so the next sync does not silently re-adopt it.
  Behaviour is identical either way; that is precisely why nothing will fail if
  it comes back, and why the note has to live in the file as well as here.

  **If upstream ever makes it reachable** (by shortening the slack, or by testing
  it against something other than the same deadline), this note is void — take
  their version and delete this bullet.

**Carried ahead as of 2026-08-03 — not yet reported upstream:**

- `relative` on the three mobile chip rails (`DatasetWorkspace.jsx` ×2,
  `SettingsPage.jsx`, `GuidePage.jsx`). Upstream has the same markup and
  therefore the same bug: an `overflow-x-auto` rail that is `position: static`
  is not the containing block for its absolutely positioned descendants, so the
  `.sr-only` label inside a NavBadge escapes the scroller, keeps its static
  position out at the far end of a 1123 px rail, and widens the DOCUMENT to
  ~598 px against a 440 px viewport. Mobile Safari then shrinks the whole page
  to fit and every bar draws at ~73% of the screen. Measured live at 440 px
  before and after; pinned by `tests/mobile-rail-containing-block.test.mjs`.
  **On the next sync, prefer whichever side has `relative`** — this is additive
  and conflicts only if upstream rewrites the same className.

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
     backend/app backend/tests frontend/src frontend/tests docs

   # Divergence 4 - remote-GPU / dense training. ADDED 2026-08-05: this grep
   # was D1-only for its whole life, and D4 is now the LARGER surface - it
   # produced SIX marker-less leftovers in the 2026-08-04 window alone, none
   # of which this sweep could see. Each was caught by hand or by a red suite.
   grep -rln --exclude-dir=__pycache__ "dense_artifacts\|dense_local_delivery\|dense_pod_hub\|dense_weights\|dense_fp8_delivery\|fp8_local_delivery\|cloud_quantize\|hf_storage\|hfStorage\|HfStorageCard\|hub_presence\|useHubPresence\|pod_transfer_plan\|pod_checkpoint_push\|podTransportChoice\|DenseModelsPanel\|DenseBasePicker\|CloudQuantizeButton\|denseModels" backend/app backend/tests frontend/src frontend/tests docs
   ```
   **The most reliable finder is neither list: grep for the identifiers of
   the feature you JUST rejected.** A phrase list only knows yesterday's
   features; the symbols of today's rejection are exact, and that grep asks
   what the merge KEPT rather than what it asked you about. It is what caught
   `trainingMode.js` on 2026-08-05 after `git checkout --ours` silently
   failed to revert it (diagnostic 25).

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
   **What the bundler canNOT catch: a bare identifier whose definition the
   merge dropped.** `npm run build` resolves imports, not variables — a hunk
   that keeps `readEngines(storage())` while the resolution loses the one-line
   `const storage = …` helper builds clean and throws `ReferenceError` the
   moment the component mounts (three real cases: `isKlein` 2026-07-22,
   `gptViaSub` 2026-07-26, `storage` 2026-07-27 — the last one crashed the
   workspace on every dataset open/create). `npm run lint` (ESLint `no-undef`
   only, see `frontend/eslint.config.js`) catches this class statically; it is
   as REQUIRED a sweep step as the build, and CI runs it on every push.
7. **Run the test suites BEFORE the merge and diff the results after.** This
   repo has ~50 environment-dependent failures on a Linux container (Windows
   drive letters, absent ML deps, no `xdg-open`) that have nothing to do with
   any sync. Without a recorded baseline they are indistinguishable from merge
   damage. Record it with the failure LIST, not just totals:

   ```
   python -m pytest --tb=no -q -rf > /tmp/backend-before.txt      # from backend/
   cd frontend && node --test 2>&1 | tail -20 > /tmp/frontend-before.txt
   ```

   then diff the same two files after. **A whole-suite run works now** — until
   2026-07-27 it aborted partway with `INTERNALERROR ... WindowsPath`, forcing
   one pytest invocation PER FILE (174 subprocesses, ~15 min a side). The cause
   was a global `monkeypatch.setattr(os, 'name', 'nt')`: when a test failed
   inside that window, pytest's traceback formatter built a `WindowsPath` on
   Linux and killed the session. `tests/conftest.py` now restores the real
   `os.name` while a report is being built, so one command gives complete
   results. If you ever see that INTERNALERROR again, that hook is what
   regressed — do not go back to per-file loops without checking it.
8. **A file with no conflict markers and no matches in step 2's grep is not
   automatically clean** — run the standard test suites anyway (step 4 below);
   they catch what grep can't (renamed imports, prop-shape mismatches).
9. **When upstream MOVES a file this fork had edited, the fork's edits do not
   move with it.** Git reports this as a `modify/delete` conflict — the least
   alarming-looking line in the whole merge output, because "deleted in
   upstream, modified in HEAD" reads like a file that simply went away. It
   isn't: upstream usually re-created it elsewhere, and every fork edit that
   lived on the old path is now missing from the new one. 2026-07-27:
   `CheckpointGalleryPanel.jsx` moved `canvas/` -> `shared/`, and the fork's
   entire Divergence-3 strip (four pictographs, one of them a rating badge
   rewritten to `✓`/`✗`) lived on the old path. Accepting the move as-is
   restored every glyph, silently. **For each `modify/delete`: find where
   upstream re-created the file (`git log --diff-filter=A -- '**/<name>'` on
   `upstream/main`), diff the fork's old version against the merge-base to see
   what the fork had changed, and re-apply those hunks on the new path** before
   deleting the old one.
10. **Do not read counts, defaults or lists off upstream — recompute them.**
    Several fork invariants are upstream's value minus this fork's removals, and
    upstream moves them: the capability-row count and `DEFAULT_ENGINE` are the
    live examples. Both have bitten.

    **And do not read them off THIS file either.** The capability count was
    written here as 11->8, then 12->9, while
    `frontend/tests/capability-destinations-contract.test.mjs:49` had already
    moved to **10** (Krea 2 Edit, then the WD14 tagger). Prose describing a
    number is a snapshot; the contract test is the number. Recompute from
    `deriveCapabilitySummary`, confirm against the test, then fix whichever
    piece of prose is behind — including this one. The same applies to the
    help-tip count (**12** here, 17 upstream: `helpTips().length`), which the
    2026-08-05 sync had to recompute rather than copy.

    A 2026-07-27 audit found `activeExtraRefPromptKey` still falling back to
    upstream's `'nanobanana'` default, which badged an API-engine prompt box
    this fork does not even surface, and the unit test PINNED that behaviour
    rather than catching it. When a merged test asserts a number or a default,
    check it against this fork's own source before believing it.

11. **Confirm the lint gate actually RAN, not just that it "didn't complain".**
    `frontend/node_modules` can exist while ESLint is absent from it (a checkout
    whose `npm install` predates the dev-dependency, a partial install). `npm run
    lint` then exits NON-zero — it does not silently pass — but what it prints is
    `'eslint' is not recognized as an internal or external command`, which reads
    as a broken toolchain rather than as "the tripwire for this fork's worst
    failure class never fired". That happened on 2026-07-28. CI is unaffected (it
    runs `npm ci` first); this is a local-checkout trap. If lint's output is
    anything other than ESLint's own, run `npm install` in `frontend/` and run it
    again before believing Gate 1.

12. *(The Divergence-3 re-strip this describes is RETIRED — kept because the
    classifier itself is still how you answer "did this merge add this line?")*
    **A script that decides "did this merge ADD this line?" must be checked
    against a line you KNOW was added.** The Divergence-3 re-strip is the one
    step in this routine that has to tell merged-in lines from pre-existing fork
    lines (the tree still carries ~160 pictographs in `frontend/src` alone that
    are deliberately NOT touched mid-sync — see Divergence 3). Two independent
    traps made that classifier answer "pre-existing" for real additions, and both
    fail SILENTLY as "nothing to strip":
    - **`git diff <rev> -- <path>` returns empty in this Git Bash** for paths
      that plainly differ (`git diff 40e5ebb..HEAD -- frontend/src/whatsNew.js`
      prints nothing while `--numstat` without a pathspec reports `336 175` for
      that same file). Take ONE diff with no pathspec and split it on `+++ b/`
      instead of running a per-file diff.
    - **Working-tree lines are CRLF where git's diff output is LF.** Most of
      `backend/` is CRLF here, so every added backend line failed an exact
      string compare against the diff's `+` lines. Compare on `rstrip('\r')` and
      re-attach the carriage return when writing.
    The tell in both cases is a suspiciously small hit count on a large window.
    Verify the classifier on a file the merge created outright (every line of it
    is an addition) before trusting a zero.

13. **"Not merge damage" is not the same claim as "not ours to fix", and only
    the first one ends the sync's job.** Diagnostic 7's baseline diff exists to
    answer ONE question — did this merge break something — and a failure that
    reproduces on a clean `upstream/main` worktree answers it: no. That is a
    complete answer to the question asked, and the 2026-07-28 sync then treated
    it as permission to ship nine red tests, writing "left unfixed on purpose"
    into this file. CI went red on the next push. **The gate is not "did I break
    it", it is `.github/workflows/ci.yml` — `python -m pytest backend/tests -q`,
    which does not care who wrote the failing test.** So: run the baseline diff
    to CLASSIFY a failure, then fix any failure that is red at HEAD regardless of
    where it came from, and record the fix under Divergence 5 so the next merge
    knows to keep it. There is currently **no failure of the leave-alone kind**:
    the one this bullet used to name
    (`test_prefill_falls_back_to_telea_when_lama_absent`, red because OpenCV was
    absent locally) has been green since `opencv-python-headless` was declared on
    2026-07-28 and installed — re-measured 2026-08-06, `test_watermarks.py` 134
    passed — and the sentence excusing it outlived the fact by a week. Anything
    red today is either damage or a dev env behind `requirements-dev.txt`; the
    live list and how to tell those apart are in
    [`docs/UPSTREAM_SYNC.md`](docs/UPSTREAM_SYNC.md), which is the one copy —
    do not restate a baseline here again.
    Corollary: **reproduce CI's exact invocation, from the repo root.** The
    routine below runs pytest from `backend/`; CI runs `python -m pytest
    backend/tests` from the root, which is a different rootdir and `sys.path`.

14. *(HISTORICAL — the strip is retired. Kept as the record of what it cost.)*
    **The Divergence-3 strip script must change ONLY the glyphs — a "tidy the
    whitespace while we are here" step will silently rewrite lines it was never
    meant to touch.** Both halves of this bit on 2026-07-28. First, collapsing
    runs of spaces was applied to every merge-added line rather than only to
    lines that actually lost a glyph: it flattened deliberate column alignment in
    `CONTRIBUTING.md`'s command comments and re-indented comment blocks in
    `models.py`, none of which contained an emoji at all. Nothing failed — a
    build, a lint and 4 800 tests are all blind to a comment's spacing — so the
    damage was found only by diffing the result against upstream's blobs.
    Second, removing a glyph is not always cosmetic: `CanvasImageNode`'s header
    comment ended up reading "with the immediately beside it" because the `🔍`
    WAS the noun in that sentence, and six controls were left as
    `<span aria-hidden></span>`, including the run-gallery tile's pin button
    whose entire label the glyph had been.

    So the strip is three passes, and the third is not optional:
    - remove each stripped glyph **together with the one space it owned**
      (following if present, else preceding), and change nothing else;
    - re-derive every rewritten line from upstream's blob and assert it differs
      from the original **only** by that removal — this catches the whole
      over-reach class in one check;
    - grep the result for `the  `, `>\s*<`, `''` and a glyph-only label, then
      read each hit. A glyph that was a control's whole content is REPLACED
      (`◉`, `⛶`), and a sentence that pointed at one is rewritten.

15. **`docs/guide/**.md` is COMPILED INTO `frontend/dist`, so the local-only
    contract can go red on a documentation line — and its `frontend/src` half
    will not point at it.** 2026-07-28 (evening): the dist test failed on
    `vast.ai API key` while the src test passed, because the string lived in a
    merge-added Guide paragraph (`using-the-app.md`, the Canvas Continue lane
    table), which vite bundles. Two wrong turns are available here and both waste
    the session: re-grepping `frontend/src` (clean — the src scan does not read
    `docs/`), and assuming the dist is stale and rebuilding (the rebuild
    reproduces it, because the source of truth is the doc).

    Trace it from the BUNDLE: `grep -o '.\{0,200\}<phrase>.\{0,200\}'` on
    `frontend/dist/assets/*.js` prints the surrounding prose, which identifies the
    chapter immediately. Then fix the DOC. And note what a doc hit usually means —
    it is rarely just a forbidden phrase: that paragraph also promised "both lanes
    for both kinds of run" and a checkpoint "finished on a rented GPU", neither of
    which is true on this fork. The contract caught a factual divergence, not a
    typo.

16. **A Continue surface added by upstream must be gated on
    `caps.cloud_training`, not on whatever the shared util uses.** The fork's D4
    switch is `caps.cloud_training` (forced false in `CapabilitiesContext`), and
    `TrainingPanel` gates its copy of `ContinueDialog` on exactly that. Upstream's
    new `LineageCanvas` host derives the same lane from `runsHubContinueLanes`'s
    `configured` flag (is a rental key present), which is a DIFFERENT question —
    so a hand-set `VAST_API_KEY` would have opened the rental lane on the board
    while the dataset's own dialog kept it shut. Two surfaces, two answers to one
    question. Gate new hosts at the HOST (as `TrainingPanel` does) rather than
    editing the shared util, so the util keeps upstream's shape and the next merge
    has less surface.

17. **When you resolve conflicts with a script, ASSERT the hunk count — and
    never trust `awk '/^<<<<<<</,/^>>>>>>>/'` to show you all of them.** 2026-07-29:
    `face_dataset_service.py` looked like a two-conflict file because the awk
    one-liner printed the first region and the eye stopped there. It had FOUR, and
    the two unseen ones were the entire API regenerate lane and the API fan-out —
    ~340 lines importing `chatgpt_image`, `engine_errors` and calling
    `api_generate`, in a file where HEAD contained **zero** such references. A
    `re.sub` with a blind "keep ours" lambda would have written a plausible-looking
    file; the `assert n == 2` fired instead and nothing was written.

    So: `grep -n '^<<<<<<< HEAD\|^=======$\|^>>>>>>> upstream/main'` to COUNT
    first (it prints one line per marker, so the count is unambiguous), then assert
    that number in the resolver. A conflict you did not know about is resolved by
    whichever branch your lambda happens to take, and on this fork that is how a
    removed engine comes back.

18. **After deleting a file the merge re-added, grep for its IMPORTS before
    anything else.** Deleting `generationOutcome.js` left
    `import { summarizeGeneration, refusalHeadline, failureHeadline } from
    './generationOutcome.js'` plus two `const` lines in `DatasetWorkspace.jsx` —
    all three auto-merged OUTSIDE the conflict region, so resolving the conflict
    did not touch them. This is diagnostic 6's class arriving from the other
    direction: not upstream importing a file we delete, but US deleting a file
    upstream imports. `npm run build` would have caught it, but only after the
    strip and the docs work were done on a tree that could not build. One grep for
    the module's basename immediately after `git rm` costs nothing.

19. **Deleting a rejected hunk can orphan an IMPORT the same way it orphans a
    definition (diagnostic 5, from the calling side).** 2026-08-02: rejecting
    `TrainingPanel.jsx`'s rented-GPU dialog deleted its only call to
    `cloudUnsupportedFamilyReason`, but the `import { basesForFamily,
    cloudUnsupportedFamilyReason } from './trainingFamilyScope.js'` line sat
    outside the conflict hunk and was never touched. `npm run build` cannot
    catch this — the module still exists and the name still resolves, it is
    simply never called — only a test asserting the caller's *behaviour*
    (`trainingFamilyScope.test.js`) caught it, and only because that test
    happened to assert the import was present. After rejecting a hunk, grep the
    file for every symbol the deleted code was the ONLY caller of, not just the
    ones a definition-side diagnostic would find.
20. **A brand-new app-wide `before_request`/`after_request` hook can break a
    fork-only route upstream has never exercised, and no upstream test will
    catch it.** 2026-08-02: `reject_unparsable_json_body` reads
    `request.get_data(cache=True)` on every strict-method `/api/` write to
    catch a body that silently degrades to `{}` — reasonable, since upstream's
    own routes all read JSON. `cluster.peer_upload_artifact` (device-to-device
    training, no upstream equivalent) reads a raw `application/octet-stream`
    body via `request.stream` in chunks specifically so a multi-GB checkpoint
    never sits in memory; `get_data()` buffers that same WSGI stream first, so
    the route read nothing after it — not a 400, a 200 with a 0-byte file on
    disk. The guard's own multipart skip didn't cover it (this body isn't
    multipart). Any new global request/response middleware from upstream needs
    a check against this fork's OWN routes, not just upstream's — `grep -rn
    "request.stream\b" backend/app/routes/*.py` before trusting a guard that
    reads the body itself.
21. **When upstream PORTS a fork feature back, the fork's older copy of a moved
    helper survives OUTSIDE the conflict — and in JavaScript it wins.** 2026-08-02,
    the Klein pins (Divergence 2). Upstream relocated `KLEIN_OVERRIDE_KEYS` and
    `_PINNED_SUBDIR` within `klein_edit_helper.py`, and rewrote `overrideBadge` /
    `KleinModelFilesCard` in `EnginesSection.jsx`. Every relocation puts the NEW
    definition inside the conflict and leaves the OLD one, hundreds of lines
    away, untouched. In Python a re-binding is merely dead weight; in a JS module
    a `function` redeclaration is legal and the LAST definition wins, so the
    merge would have shipped upstream's fixed card as dead code and kept the
    fork's superseded one live — reverting a fix while the diff says it was
    adopted. `npm run build` and ESLint `no-undef` are both blind to it.
    **After taking upstream's side on a ported feature, grep the file for every
    top-level name in the hunk you took** and confirm each is defined exactly
    once. `grep -c '^function <name>\|^const <name> ='` is the whole check.
22. **An auto-merged TAIL can reference a variable the resolution never
    defines** — diagnostic 6's class, arriving from the far end of the function.
    2026-08-02: upstream's deleted-image fix added a `vanished` counter to eight
    bank passes. In five of them the fork's own rewrite owned the loop, so the
    resolution kept the fork's side — while the end-of-pass `if vanished:` line,
    forty lines below the conflict, merged in clean. Five `NameError`s, each
    raised only at the very END of a pass that runs for minutes to hours, i.e.
    exactly where a test suite is least likely to reach and a user is most
    likely to have already left. The tell is cheap: after resolving a file,
    grep it for every identifier upstream's side introduced and check each has
    a definition on the path that survived.
23. **`git checkout --theirs <file>` is a WHOLE-FILE revert, not a hunk
    resolution — it is diagnostic 4's blanket-revert wearing a safe-looking
    name.** 2026-08-03, and it is the closest this fork has come to shipping
    Divergence 1 back in. `face_dataset_service.py` had exactly ONE conflict
    hunk (a five-line guard), so `--theirs` read as "take upstream's side of
    that hunk". It does not: it checks out stage 3, i.e. upstream's entire file,
    discarding the merge — which for this file means the whole API fan-out lane
    returning at once, `from .chatgpt_image import ...`, `_run_nanobanana_batch`,
    `API_ENGINES = ('nanobanana', 'chatgpt', 'openrouter')` and all. **Nothing
    complained.** There were no conflict markers left, `git diff --diff-filter=U`
    was empty, and the file imports modules this fork deletes, so even the build
    equivalent would only have caught it at `create_app()` — after the commit.
    What caught it was Phase 4 scoped to merge-ADDED lines: 64 hits in one file.

    So: never use `--theirs`/`--ours` on a file that has any fork divergence —
    which here is most of them. Resolve the hunk textually (take the region
    between `=======` and `>>>>>>>` and leave the rest of the merged file
    alone), and assert the hunk count while doing it (diagnostic 17). If you
    have already run `--theirs`, `git checkout -m -- <file>` recreates the
    conflict so you can redo it properly — note it re-labels the markers
    `ours`/`theirs` instead of `HEAD`/`upstream/main`, which will break a
    resolver script that pattern-matches the original labels.

    The general rule this is an instance of: **a resolution that produces no
    markers is not evidence of a correct resolution.** The only check that
    speaks to correctness is diffing the result against the fork's pre-merge
    HEAD and reading what the merge ADDED — `git diff <pre-merge-HEAD> --
    . ':(exclude)frontend/dist'`, filtered on the rejected-feature patterns.
    Run it every sync, not only when something feels wrong.

24. `whatsNew.js`'s prepend-vs-prepend conflicts can hide a real boundary from
    BOTH sides at once when the fork's last new entry and upstream's last new
    entry happen to close with the identical trailing lines (a common `to:`
    route plus `},`) — git's diff treats that shared suffix as unchanged
    CONTEXT, not as part of either side's hunk, so neither `<<<<<<< HEAD` nor
    `>>>>>>> upstream/main` shows it and a naive keep-both resolution leaves
    the fork's own last entry with no `to:`/closing brace at all (a syntax
    error, caught by `npm run build`, not by eye). `git show HEAD:<path>` on
    the pre-merge file is the fix — read what the fork's own last entry
    actually closed with and duplicate it explicitly before the next entry
    starts, rather than trusting the marker boundaries to contain everything
    that needs closing.

25. **`git checkout --ours -- <file>` silently does NOTHING on a file git
    auto-merged.** It resolves *unmerged* paths only; for a path with no
    conflict it is a no-op that still exits 0 and prints nothing, so a batch
    like `git checkout --ours -- a.py b.py c.js d.js` can revert three files
    and quietly leave the fourth carrying upstream's version. 2026-08-05: the
    dense Turbo/custom-base commit was rejected wholesale and four of its files
    reverted in one such command; `frontend/src/utils/trainingMode.js` was the
    one that had auto-merged, so `isKreaTurboVariant`, `fullTransformerBaseLabel`
    and `denseTurboWarning` stayed in the tree, along with an
    `isFullTransformerEligible` loosened for the rejected feature and stripped
    of its refusal strings. Lint passed, the build passed, and the resolution
    reported success. **Use `git checkout HEAD -- <file>` to revert to the
    fork's pre-merge content** (that works whether or not the path conflicted),
    and confirm with `git diff HEAD -- <file>` returning empty. Then re-grep
    the rejected feature's own identifiers across the tree — that grep, not the
    conflict list, is what catches this class, because it asks what the merge
    KEPT rather than what it asked about.

26. **A hand-restored fix from a PAST sync is not immune to a LATER sync
    dropping it again — the region does not need to conflict with upstream a
    second time, it only needs to be rewritten.** 2026-08-05's 11-commit sync
    (the row above) had already hit this once: upstream's new caption button
    auto-merged over the fork's `passGate.caption`-gating and its adjacent
    `<DevicePicker>` render, hand-restored, and recorded in that row's own
    text ("re-gated on the fork's `passGate.caption` and have the fork's
    `DevicePicker` put back beside it"). The 32-commit sync six rows below
    rewrote the ENTIRE pass-button row for the new launch-window dialog
    architecture (`setPassOpen('caption')` replacing the direct-launch
    button) — a rewrite done during THIS session's own conflict resolution,
    not a re-conflict with upstream — and both fixes vanished again in the
    same stroke, with zero conflict markers, because nothing about the
    rewrite touched upstream's side at all. `<DevicePicker>` was gone from
    the render tree entirely (its state and `on()` helper stayed wired, so
    nothing looked broken by inspection), and the caption `PassButton`'s
    `disabled`/`title` dropped back to `{live}` with no `passGate.caption.ok`
    or `.reason`. **What caught it was a test written AFTER the first
    occurrence** — `analyzeRowDevice.contract.test.js`'s `'the row has its
    own picker'` and `'the buttons grey out per machine through the SAME
    gate as Launch all'` — which is the whole point of pinning a hand-fix
    with a test instead of trusting the diff: the fix itself is one rewrite
    from disappearing, the test is not. It failed exactly as designed, at
    Gate 6, on the full suite — Gates 1-5 (lint, build, both local-only
    halves, `create_app()`) were all clean, because a missing JSX control and
    a loosened `disabled` prop are neither an unresolved identifier nor an
    import failure. **The same rewrite dropped a THIRD, newer thing in the
    same family**: the generic dialog's `onLaunch` dispatch sent `score` and
    `framing` through a bare `runPass(passOpen, run)` with no `on()` anywhere
    in the call chain, silently breaking peer dispatch for two of the five
    travelling passes despite their buttons still showing device-aware
    greying. Fixed once, structurally, by moving `...on()` into `passBody()`
    itself — the one place every dialog-launched pass's body is built — so
    the property no longer depends on each call site remembering to ask for
    it. **The transferable rule: when a UI region gets rewritten for an
    unrelated reason, re-diff it against a known-good prior commit
    (`git show <old-sha>:<path> | grep <the-control>`) rather than trusting
    that "it compiled and the tests I thought to run passed" — and prefer
    fixing the CLASS (thread the property through the shared builder) over
    re-patching each call site, which is exactly the shape that broke twice.**

27. **"Confirmed it's a strict superset" is a claim, not a check, until it is
    read against the SPECIFIC predicates being replaced — and adopting the
    replacement wholesale means the fork's own refinements are gone the
    moment that claim is wrong.** The 32-commit sync six rows below adopted
    upstream's refactored `_apply_facets(...)` "wholesale (confirmed it's a
    strict superset covering all of fork's inline predicates including WD14
    tags)" — and that confirmation was never actually diffed against what it
    replaced. It dropped THREE fork-only refinements at once, all silent
    (no conflict, no lint hit, no import error): (1) `flag == 'dups'` /
    `'semantic_dups'` reverted from "member of a group STILL holding ≥2
    non-rejected rows" back to upstream's plain `dup_group IS NOT NULL` — the
    exact bug a fork test already existed to pin, because it is the one that
    handed "▶ Review" 10 060 rows (6 887 already rejected) under a chip
    reading 0; (2) the `wd14_tags` facet — a list of whole tag names ANDed
    against `tags_text` — was not merely narrowed, it was **not wired in at
    all**: the parameter still travelled from the route through `list_images`
    (docstring and all), the query just never filtered on it, so `blonde_hair`
    silently returned every row, tagged or not; (3) both regressions needed
    `bank_id` reaching `_apply_facets` for the fix (`_unresolved_dup_groups_q`
    needs it to scope the subquery to one bank), and the refactored signature
    had dropped the parameter entirely, because upstream's own predicates
    never needed it. **None of this showed up in Gates 1-5** — lint, build,
    both local-only halves and `create_app()` are all silent on a filter that
    quietly does less than it used to. It surfaced only at Gate 6, in tests
    that already existed for exactly this reason (`test_bank_dup_live_badge.py`
    predates this sync) plus two NEW upstream test files
    (`test_bank_tags.py`) that happened to cover the second regression. **The
    transferable check: before writing "confirmed superset" about an adopted
    refactor, grep the FORK's pre-merge version of the function for every
    branch keyed on a fork-only concept (a `bank_id`-scoped subquery, a
    peer/device parameter, a fork-added filter key) and paste each one
    against the adopted version side by side — "the tests still pass" is not
    evidence, because the tests that would catch a SILENTLY DISABLED filter
    are the ones exercising that exact facet, and nothing forces those to run
    before the confirmation is written down.**

## Merge routine (every upstream sync)

```
git fetch upstream
git log --oneline HEAD..upstream/main         # read every message (diagnostic 1)
git merge upstream/main
# 1. Re-delete any resurrected API-engine files (list above).
# 2. Resolve conflicts — for engine/Setup/EnginesSection, prefer THIS fork;
#    NOTE: there is no emoji re-strip step any more (Divergence 3 retired
#    2026-07-29). Take upstream's glyphs as they come.
#    for a file mixing a legit feature with a rejected one, resolve per-hunk
#    (diagnostic 4), don't revert the whole file.
# 3. Sweep the WHOLE tree for clean-merged rejected-feature leftovers
#    (diagnostics 2-3), not just conflicted files.
# 4. If frontend/dist or Setup/engines UI came from upstream, wipe their effect:
cd frontend && npm run build
# 5. Prove local-only did not regress, and no merged hunk references an
#    identifier whose definition the resolution dropped (diagnostic 6):
cd frontend && npm run lint
cd frontend && node --test tests/local-only-engines-contract.test.mjs
python -m pytest tests/test_local_only_engines.py     # backend half of the same guard
cd frontend && node --test
# 6. The whole backend suite, ONE pass (diagnostic 7), run the way CI runs it —
#    from the repo ROOT, not from backend/ (different rootdir and sys.path):
python -m pytest backend/tests -q -rf                 # == .github/workflows/ci.yml
# 7. Diff that against the baseline to CLASSIFY each failure — then fix every
#    failure still red at HEAD, upstream's or ours (diagnostic 13). Carried
#    patches to upstream test files go under Divergence 5.
# 8. Commit sources, then a separate build(frontend): commit for dist.
# 9. Ask before push; never force-push without confirmation.
```

**Hard stop:** if Setup shows "Image generation" with Gemini/OpenAI key fields,
`frontend/dist` is stale — rebuild; do not "fix" by re-adding the engines.

## Fork changelog (enhancements shipped on this fork)

Newest first. Add a row per shipped wave — this is the "what have I actually
done on this fork" ledger; the divergence sections below stay the *file-level*
merge map.

| Date | Commits | Enhancement |
|---|---|---|
| 2026-08-07 | *(merge)* + dist | **Upstream sync — 202 commits (`41697eb5`…`dd8aad51`), the largest window this fork has taken by a wide margin, dominated by the Video Bank (~72 commits, 87 files, a whole new top-level page) — and the sync that found the most Gate-6-only regressions of any window so far, by a similarly wide margin.** Adopted whole (full detail in `whatsNew.js`, one entry per feature — already correctly prepended by their originating commits, verified 515 unique ids, 0 duplicates post-merge): the **Video Bank** — point it at a folder of source video, it detects shots (TransNetV2), measures quality (motion/exposure/freeze/audio), captions the action, indexes clips for keyword search (CLIP/SigLIP2), cuts target-aware training clips, and trains locally through ai-toolkit; **peer/device dispatch extended to the watermark scan and framing passes** — both can now run on a joined compute peer exactly like Score/Faces already could; **the bank list opens without re-walking every folder** (`folder_sync_state`, replacing an always-walk that cost 690–1 190 ms per load on a real 8-bank/86 493-image library — a single bank still walks on open, cooldown-limited); **scraper coverage** — a generic "any gallery site" source, web image search with origin links, Reddit's load-more no longer drops posts, and scan-truncation/blocked-page honesty; **Setup lists every installable capability** with unlocked rows linking straight to their install, and counts the Video Bank's own pieces; **✕ ≈ Duplicates headline now counts what's actually left** instead of a bank-wide total; and a **face-mask preview that stops and resumes** instead of restarting cold. **Rejected wholesale under Divergence 4, cleanly split from the local half that shipped:** the Video Bank's rented-pod training lane — `cloud_video_training.py`, `pod_video_probe.py`, `VideoDatasetCloudPanel.jsx`, `videoCloudStatus.js` (+ test), `test_cloud_video_launch.py`, `test_cloud_video_lifecycle.py` — documented inline where the cut happens (`video_datasets.py`'s `# DIVERGENCE 4` comment names every un-carried route) and in the Deleted-files table above. **The regressions, roughly in the order they were found (all fixed, none left for a follow-up task):** `image_bank_service.folder_sync_state` — upstream's new function, called from `routes/bank.py` and referenced in two docstrings, had its entire ~40-line BODY silently dropped in conflict resolution while every caller and comment survived, so `GET /api/banks` 500'd with `AttributeError` on every load; restored from upstream's copy verbatim, same position relative to `_remember_sync`/`refresh_banks` it already had there. `bank_jobs.start` — the fork's own `_log(bank_id, f'{kind} started', ...)` call, present since before this merge, was dropped when upstream's job-reservation rewrite (multi-id `reserve_ids`, `_reserve_locked`, `_adopt_reservation_locked`) replaced the old single-dict job creation it used to sit right after; every bank pass has been silently missing its "started" activity-log line since the merge landed until this was restored in the equivalent spot in the new flow. `bank_jobs.get` — reads `job['pipeline']` unguarded, unlike the very next line's `job.get('device')` (already defensive, with its own comment explaining why); a raw `_jobs[bank_id] = {...}` test fixture that predates the `pipeline` key — and any future one like it — hit a bare `KeyError` through the new `_guard_reserved_bank_writes` before_request hook, which now calls `bank_jobs.running()` on every write. Fixed with the same `.get()` idiom, same reasoning, right beside it. **The watermark and framing passes' vision loops were the single biggest cluster.** Both share one shape: `source` is built once above a `with window:` block, branching cleanly between `map_vision(prepared(), ask, ...)` locally and `bank_remote.run_remote_vision(...)` on a peer — and the loop under it, in the merged tree, called `map_vision(prepared(), ask, ...)` a SECOND time directly instead of iterating `source`. That silently discarded every peer's answers in favour of a spurious local rerun, and — because `prepared()` has a destructive side effect (unlinking a stale cleaned watermark blob before staging) — ran that side effect twice. The loop's own tuple-unpack variable was also renamed to `rid` while the eleven lines below it still read `row_id`, and `_framing_job`'s `prepared()` yielded `analysis_image_path(bank, row, refresh_rotation=True)` against a `row` that was never fetched at all (only existence-checked and discarded) — three independent NameErrors stacked in the same two functions, none of them reachable until the first was fixed, which is why they surfaced one at a time across several fix-and-rerun cycles rather than in one traceback. Once `_framing_job` actually ran to completion, a fourth bug appeared: unlike `_watermark_job`, it never gained a per-iteration `db.session.commit()` after the new fingerprint guard (`_prepare_analysis_write`) started writing `row.analysis_fingerprint` directly to the ORM row outside the staged `pending` dict — so that write sat uncommitted until the next periodic flush, autoflushing open on the very next iteration's `_live_image()` SELECT and holding a write transaction across that iteration's Ollama call, exactly the class of hold `_watermark_job`'s own comment says cost two paid cloud runs before. Fixed by adding the twin commit, same placement, same comment. **`bank_remote.run_remote_vision` was never updated for the fingerprint guard at all** — it kept yielding a bare answer string where every caller now expects `{raw, fingerprint, error}`, so `isinstance(answer, dict)` silently coerced every peer answer to `{}` and a remote watermark/framing pass reported 100% "not analysed" having genuinely gotten every answer back correctly; separately, and only visible once the shape was fixed, it always yielded `None` for the hub-side path instead of the real one, which the guard needs to re-resolve the row and would have refused every write anyway. Fixed by fingerprinting each file at staging time (the closest remote equivalent of the local worker fingerprinting the bytes it just read) and carrying the real path through — three of this file's own unit tests, which assert on `run_remote_vision`'s return shape directly, were updated alongside it. `setup_installer._run_bank_scoring` was a hybrid of the fork's old "refuse on any borrowed Python" flow and upstream's new "always install into the managed venv, just remember a borrowed selection" flow — the merge kept the old refusal branches (which would still incorrectly refuse a genuinely different borrowed interpreter before ever reaching the new code) AND a tail referencing an undefined `borrowed` name, crashing every call with `NameError`; replaced with upstream's version wholesale (already-correct `_ensure_bank_scoring_env(..., save_score_python=not borrowed)` was sitting right there, unused). Five new `backend/infer/*.py` worker scripts (`bank_semantic_infer.py`, `clip_image_embed_infer.py`, `shot_detect_infer.py`, `siglip2_text_infer.py`, `video_caption_infer.py`) landed without the `claim_result_stream(__name__)` call every sibling script makes — a library banner print from any of their dependencies would have corrupted the result channel exactly the way this mechanism exists to prevent; caught by the fork's own `test_infer_result_channel.py`, which walks every file under `backend/infer/`. `face_embed_infer._is_stale` gained a content-hash check layered on top of the fork's existing mtime-signature one, but the new version made a MISSING signature or hash grounds for staleness — inverting the fork's own additive rule ("a cache written before signatures shipped is never called stale") the docstring one function up still describes; would have forced every existing user's face-embedding cache to a full re-embed on first run after upgrade. Restored the additive rule, layered the hash check on top rather than instead of it. `image_bank_service`'s bank-caption job counted a pass where every image was refused for changing mid-inference (`stale`, the new fingerprint guard again) the same as a pass where the engine genuinely answered nothing — `if not captioned and not vanished:` needed `stale` added beside `vanished`, the exact reasoning the surrounding comment already gives for `vanished`. `test_test_imports_are_declared.py`, a brand-new upstream contract test with no fork equivalent before this merge, correctly surfaced a PRE-EXISTING gap it was never possible to catch before: `test_ollama_gpu_fence.py` imports `urllib3` at module level (present only transitively, via `requests`) with nothing declaring it in `requirements-dev.txt` — declared, following the file's own `safetensors`/`instaloader` precedent for the identical trap. **Two D5-shaped test-mock gaps, same "widen the mock" rule as the established families:** a NEW upstream test file, `test_bank_effective_analysis_transfer.py`, mocks `_drive_infer_subprocess` with the plain positional signature, missing the fork's `stall_label=`/`busy_detail=` kwargs; and `test_bank_folder_person.py` — already a carrier, already widened at most of its `fake_driver` definitions — turned out to have four more, unwidened, that the file's own presence in the derive command's output had been hiding. **One test bug, not a source bug:** `test_display_and_copy_readers_are_pinned_to_the_resolver`'s `follow=True` (a fork addition to an upstream contract test, needed only to inline `_promote_rows`) started picking up two functions' legitimate internal `abs_image_path` use once upstream's admission-pass rewrite folded `_promote_job`'s row loop straight into the job closure — it no longer delegates to `_promote_rows` at all (that extraction now serves only `_group_promote_job`, outside this contract's scope) — so the `follow` this test needed for the OLD architecture was quietly defeating the assertion it exists to make under the NEW one; fixed by dropping `follow=True`, matching upstream's own (non-`follow`) version of the same check. **One test-timeout bug, not a reservation bug:** `test_reserved_destination_allows_reads_and_cancel_but_refuses_writes_and_delete` holds a Bank job open under a 3-second `threading.Event` timeout while it drives several HTTP requests through the reservation guard — `GET /bank/<id>` on the reserved destination transitively calls `score_device_info` → `gpu_vram_gb()`, a real `nvidia-smi` subprocess probe with a 10-minute cache; on a machine with no NVIDIA GPU the failed subprocess lookup alone measured ~3.5 s, timing out the job before the test ever reached its `relocate?confirm=1` assertion — nothing to do with the reservation guard itself, which a direct reproduction confirmed works correctly at every step. Widened the timeout to 15 s with a comment explaining why, rather than mocking away a real (if unrelated) cost. Gates: lint clean; build clean; local-only contract 8/8 frontend + 3/3 backend against the rebuilt dist; `app.create_app()` OK; privacy/ASCII 13 passed, 2 skipped; full frontend **3381/3381, 0 failed**; full backend, from a baseline of **5826 passed / 16 skipped / 0 failed** — first full pass **220 failed** (every regression above, discovered and fixed across several successive full-suite and targeted reruns, not one pass) **/ 6676 passed / 20 skipped**, down to **69** after the first wave of fixes, then **9**, then the final clean run: **5 failed / 6891 passed / 20 skipped** — the 5 survivors are all Video Bank capability-gated: `av` and `transnetv2-pytorch` (both declared in `requirements-ml.txt`, which CI installs and this dev box does not) are genuinely absent here, and `open_clip` — installed on demand into its own managed venv via Setup, never a `requirements*.txt` package — is absent too, so one test asserting specifically on an `open_clip`-shaped 503 instead sees the `av`/`transnetv2-pytorch` one. The same class of environment-only exception every prior sync's no-OpenCV row already documents. |
| 2026-08-05 | *(merge)* + dist | **Upstream sync — 32 commits (`945b2631`…`760530cf`), entirely local Image Bank / dataset-watermark work with nothing to reject under D1 or D4 — and the sync that found the most Gate-6-only regressions of any window so far, none of them caught by lint, build, or either local-only half.** Adopted whole (full detail in `whatsNew.js`, one entry per feature): **captions remember who wrote them** — a new `caption_origin` column travels every copy path (dataset→bank, bank→bank, promotion, backups) so 🔄 Re-caption spares hand-written captions by default; **✨ Score keeps what it computed when you stop it**, with resume-on-cancel write-back, an explicit "Rescore all" for a genuine full recompute, and a scoring pass that names the head that failed to download instead of finishing silently empty; **the dataset watermark surface** gains bulk "reject all flagged", a shared `watermark_detect.backend` setting driving both the bank and dataset screens, and a stoppable scan; **every bank pass now opens a launch window** stating its scope (kept/undecided/unkept/selection, each quoting the count it will touch), with "Rescan all"/"Rescore all" folded into that window as an explicit redo line, and three passes (✨ Score, 👥 Faces, ✂ crops & variants) refusing a partial scope because their ids are one numbering of the whole bank; **select images to see their 🏷️ tags** with how often each is cited across the selection, not just an intersection; **filter chip counts now match the filtered grid** instead of a bank-wide total; passes say what they skipped and a lopsided style/person grouping says when it swallowed nearly everything; and a Linux-only fix so the Klein enhancement LoRA is found instead of endlessly re-downloaded (credit **@_nofaceman**, Discord, who also reported the empty-scoring-pass symptom). **Marker-less leftovers, resolution-time:** a stray dangling `=======`/`>>>>>>> upstream/main` pair orphaned the entire fork-only `_device_label`/`_remote_pass_device`/`refuse_steps_for_device` block in `image_bank_service.py` (content was fine, only the marker was stray); `_page_images(page, th)` lost its required `bank_id` arg in one scripted resolution; a `_promote_rows` vs. upstream's competing inline duplicate in `_promote_job` had to be reconciled by hand-adding `caption_origin` support to the fork's factored version and discarding upstream's copy, so `_group_promote_job` does not drift from it; two D4-rejected `whatsNew.js` entries (`…full-model-reaches-the-pod`, `…has-not-checked`) rode back in via a stale merge-base despite being rejected before, caught by `git log --grep` against their commit subjects; a duplicated/corrupted `whatsNew.js` entry (wrong blurb under the right title) was caught only by `release-notes-contract.test.mjs`'s id-count assertion. **The big one, caught only at Gate 6:** adopting upstream's refactored `_apply_facets(...)` "wholesale" on the strength of an unverified "it's a strict superset" turned out to drop three fork-only refinements silently — `flag == 'dups'`/`'semantic_dups'` reverted to upstream's plain `dup_group IS NOT NULL` (the exact "▶ Review hands back 10 060 already-resolved rows under a chip reading 0" bug a fork test already existed to pin), `wd14_tags` facet filtering was not merely narrowed but **never wired into the query at all** (a `blonde_hair` filter silently returned every tagged and untagged row alike), and both needed a `bank_id` parameter the refactored signature had dropped. See Diagnostic 27 for the transferable lesson. **Also self-inflicted, this session, while re-architecting the pass-button row into the new launch-window dialogs:** the SAME `passGate.caption`-gating + `<DevicePicker>` render this fork restored once already (11-commit sync, three rows below) vanished a second time — not from a re-conflict with upstream, but from this session's own rewrite of that region for the new `setPassOpen(...)` dialogs, caught only because `analyzeRowDevice.contract.test.js` already existed from the first occurrence (Diagnostic 26); and `score`/`framing`/the faces-dialog fallback were silently posting with no `device_id` at all through the new generic `runPass()`, fixed by moving `...on()` into the shared `passBody()` builder so device threading is no longer each call site's job to remember. **Three D5-shaped test-mock gaps**, same "widen the mock" rule as the established families, none involving `_drive_infer_subprocess`: `bank_jobs.start`'s `device_label=` kwarg (new this window) broke `test_bank_score_resume.py`'s local job-start wrapper; `_score_job`'s new `rescore` parameter broke the pre-existing `test_bank_remote_pass.py` mock; `_watermark_job`'s fork-only `device_id` sits as upstream's new test's THIRD positional parameter, ahead of `use_detector`, so the two collided (`got multiple values for argument 'use_detector'`) rather than merely erroring on an unknown kwarg — all three widened, `bank-score-rescore-contract.test.mjs`'s signature-pinning regex recorded as D5 entry 4. `backend/tests/test_infer_result_channel.py`'s own regression test (a fork-owned guard against a `print(json.dumps(...))` bypassing the claimed result stream) flagged the three new `bank_score_infer.py` print sites from a prior resolution as offenders — not because `file=_OUT` was missing (it was there), but because the dict literals ran longer than the test's 4-line lookahead window; fixed by hoisting each payload into a named variable so `print(json.dumps(payload), file=_OUT)` is always one line, rather than loosening the test's window and risking it bleeding into an adjacent call. `pipelineStepLabels.contract.test.js` (upstream's new guard, adopted this window) caught a genuinely PRE-EXISTING fork gap unrelated to this sync's own changes: `'tags'` has been in `PIPELINE_STEPS`/`LOCAL_ONLY_STEPS` since before this merge but never had a `STEP_LABEL` entry in `PipelineReport.jsx`, so a Launch-all report naming 🔖 Tags would have printed the raw identifier — fixed, folded into the existing "the Launch-all report calls every step by its name" entry (now "three of nine" rather than "two of eight"). Two contract tests pinning the now-superseded individual pass launchers (`tags-ui.test.js`'s "unlike `startFraming`, which passes `on()`"; `analyzeRowDevice.contract.test.js`'s literal `/score\`, on())` / `/framing\`, on())` source patterns) were rewritten to pin the new architecture — that `passBody()` itself spreads `on()` and that `runPass()` hands it there — since `startScore`/`startFraming`/`startMedium`/`startAngles`/`startSemanticDedup` were legitimately deleted as dead code once every pass button switched to opening a dialog. Gates: lint clean; build clean; local-only contract 8/8 frontend + 3/3 backend against the rebuilt dist; `app.create_app()` OK; privacy/ASCII 7 passed, 1 skipped; full frontend **2936/2936, 0 failed**; full backend, first pass **21 failed** (20 real regressions above + the one documented no-OpenCV case) **/ 5805 passed / 5 skipped** — every one of the 20 fixed, and the full suite re-run clean afterward: **1 failed (the same no-OpenCV case) / 5825 passed / 5 skipped**. |
| 2026-08-05 | *(fix)* | **CI had been red for three pushes, and the reason was a sentence nobody checked.** Four `test_peer_training_over_http.py` failures were written off as "Windows-only, green on CI's Linux" and carried through an entire sync as accepted baseline. **The backend CI job runs on `windows-latest`** (`ci.yml:136`; only the frontend job and the gate are `ubuntu-latest`), so CI reproduced all four exactly — red since `5463cb65` added the file, through `e9c45e6a`, `5dc39262` and the merge `fdec5af3`. The check that would have caught it costs one grep: read `runs-on` for the job that is failing. **Two real fixes, one of them product.** `_mirror_log` opened the mirrored log in text mode, so Python translated every `\n` to `os.linesep` on write: the local copy of a peer's log grew one byte per line and stopped being the byte-faithful mirror its own docstring promises, which is also what the returned cursor is computed against. Now `newline=''`. The test double `FakePeer.write_log` had the same flaw and it mattered for the same reason — the fake peer serves that file's SIZE as the log cursor, so the bytes on disk must be the bytes handed in. The fourth failure was test-only: it asserted `'%2F' in segment`, pinning a POSIX separator, where the property under test is that the separator is percent-encoded at all (`\` → `%5C` on Windows); widened to accept either, with the raw segment in the failure message. `test_peer_training_over_http.py` **16 passed / 4 failed → 20 passed**. Also recorded in `docs/UPSTREAM_SYNC.md`: the expected-failure table is now one line (the genuine no-OpenCV case), carries the reasoning that made it wrong, and states that `gh` defaults to the **upstream parent** for a fork — a bare `gh run list` shows perfectgf's CI, not this one, which is why the failure looked like someone else's. |
| 2026-08-05 | *(merge)* + dist | **Upstream sync — 11 commits (`74682f80`…`caf4ac1a`), a clean two-waves-in / one-wave-out window, and the sync where `git checkout --ours` was finally caught being a NO-OP.** Adopted whole: **the 🔎 quality scan stops taking the whole app away with it** — three separate holders behind one symptom, all three fixed upstream and all three kept here: the tail re-grouped unconditionally (measured 96–124 s to regroup 50 389 rows after a scan that found 2 changed), the pairwise walk held an unbounded seen-set (~4.3 GB extrapolated at 36 000 images) and is now a numpy block comparison with the GIL released, and the write was one transaction of ~5 000 UPDATEs held 6–9.5 s past SQLite's busy_timeout, now one prepared statement per batch **with a real pause between batches** (without the pause the next batch retook the lock inside the other writer's busy-handler sleep — batching alone measured no better). The phase also finally publishes progress and honours Stop. **The bank caption pass stops deciding who writes it, and over what**: the engine and the Ollama vision model are pickable **for one run** without rewriting the Settings every dataset inherits, the pass can be aimed at Kept / Undecided / both, and the button now **quotes the number it will actually write** instead of "Caption all" — the same counter mistake auto-reject paid for last window, where "5 930 flagged" rejected 0. And **🔄 Re-caption**, for the bank that is already fully captioned and whose 🏷️ button had therefore greyed out *taking the engine and model selects with it* — it states what it overwrites before the click, says that nothing records WHO wrote a caption (so one corrected by hand is indistinguishable from a generated one and no undo covers it), and refuses to run on a selection because a selection can span unloaded pages and the count would be a guess. Also adopted: upstream's correction of **a pointer that lied** — the Ollama vision-model field lives in Settings ▸ Local tools, and four surfaces had been sending people to Settings ▸ Captioning & quality, which holds the engine selector instead. **Rejected wholesale under D4:** `c670cc23` + `5e5f63b0`, full-model (dense) training accepting Krea 2 Turbo and a custom checkpoint, plus its `DenseBasePicker`. The reason is written in this fork's own `TrainingPanel.jsx`: the LoRA/Full-model radio was removed here because `/train` answers `full_transformer` with a 400, so `fullMode` can never become true through any user action — the new picker would be a **dead control inside an unreachable arm**, which is precisely the line that file's D4 comment draws ("dormant backend is allowed; a dead BUTTON is not"). Its `dense_artifacts.py` half was already deleted here last window, and its doc half re-offered the `### Cloud GPU (vast.ai)` + `### Cloud training` settings sections and six `full_model_*`/`fp8_deliver` help topics anchored at a guide section that has never existed here — all deleted again, for the fourth sync running. **THE LESSON OF THIS SYNC, and it is a new diagnostic: `git checkout --ours -- <path>` silently does NOTHING on a file git auto-merged.** It only resolves *unmerged* paths. Four files were reverted that way in one command; three were genuinely conflicted and reverted correctly, but `frontend/src/utils/trainingMode.js` had auto-merged with **zero markers**, so the command reported success and left upstream's `isKreaTurboVariant` / `fullTransformerBaseLabel` / `denseTurboWarning` in the tree — together with a loosened `isFullTransformerEligible` that had dropped its refusal strings. Nothing flagged it: not the resolution, not lint, not the build. It fell to the Phase-4 grep for the symbols of the feature just rejected, which is the only check that looks at what the merge *kept* rather than at what it asked about. The fix is `git checkout HEAD -- <path>`, and the rule is to re-grep every rejected feature's own identifiers after resolving, never to trust `--ours` as a revert. Two orphaned test files for the same rejected picker (`DenseTurboAndCustomBase.test.js`, `dense-base-picker-render.test.mjs`) came in the same way and were deleted. **Three genuine keep-BOTH resolutions**, each of which would have lost a symbol taken either way: `sqlalchemy` imports (fork's `update`, upstream's `text`); `_caption_job` / `start_caption` signatures (fork's D6 `device_id=` beside upstream's `backend=` / `ollama_model=` / `statuses=`); and the bank pass row, where upstream's new count-quoting caption button had to be re-gated on the fork's `passGate.caption` and have the fork's `DevicePicker` put back beside it. **The substantive interaction was `_scan_job` + `rebuild_dup_groups`, and taking either side was wrong in both halves.** Upstream re-reads each row under `db.session.no_autoflush` and mutates the ORM object; this fork stages every write as plain data and holds no ORM row at all (the db-lock wave), which is the stronger property — so the fork's shape was kept and upstream's new `hashed` counter folded into it, read off the row the existing liveness test already had in hand rather than paying a second SELECT. In the tail, upstream's `db.session.commit()` became the fork's `_flush_scan_batch(...)`. And upstream's rewritten `rebuild_dup_groups` **dropped the fork-only `restore_stranded_dup_keepers` call** — the repair that fixes a duplicate group left with no surviving member, measured at 444 such groups on this fork's own data before it existed, and covered by its own suite. Re-applied on **both** exits, since a stop part-way strands a keeper exactly like a full pass does. `_assign_groups` was kept as well: upstream's rewrite no longer uses it, but the semantic near-duplicate pass still does. **Two README debts fixed rather than carried:** the roadmap claimed "*and so has full-model training on Krea 2*" — inherited last window and flatly contradicted eight sections later by "*Cloud / rented-GPU training: **Not available in this fork***", the same self-contradiction D4 recorded on 2026-08-01; and the newly adopted caption controls needed a fork-shaped row, because upstream edits a "People, framing and captions" row this fork's heavily-customised Image bank table does not have. The **help-registry tip count was recomputed from this fork's own registry** (`helpTips().length` → 12), not copied from upstream's 17 — those five extra tips belong to the rejected dense topics. Also of note, and adopted gratefully: upstream now **appends What's-new entries at the TAIL** with a comment explaining that ordering is by date, so a new entry never has to be prepended — an upstream fix for the exact prepend-splice mangling this fork has been bitten by twice. Gates: lint clean (ESLint's own output); build clean; local-only contract **8/8 frontend + 3/3 backend**; `app.create_app()` OK; privacy/ASCII 7 passed, 1 skipped; full frontend **2815 → 2855 passed (+40), 0 failed**. **The backend baseline for this window was NOT the usual single known failure**: it recorded **4** — the documented no-OpenCV one, plus three Windows-only failures in `test_peer_training_over_http.py` (two from text-mode `\n`→`\r\n` translation making a log one byte longer per line, one from an assertion hard-coding `%2F` where Windows encodes `\` as `%5C`). They are pre-existing and unrelated to this sync, and were recorded in the baseline rather than fixed inside the merge, then spun off as their own task. **The classification was WRONG and is corrected in the row above: the backend CI job runs on `windows-latest`, so CI had been RED on all four since the file landed — calling them "green on CI's Linux" was an assumption never checked against `runs-on`** — one of them is a real product nit (`_mirror_log` opens the mirrored log in text mode, so it re-encodes the remote bytes it promises to copy verbatim). |
| 2026-08-04 | *(merge)* + dist | **Upstream sync — 59 commits (`a339ee4a`…`74682f80`), the largest window yet, and roughly two-thirds of it was Divergence-4 pod/cloud-delivery territory.** Adopted whole: the **LoRA-into-checkpoint merge tool** (`🧬 Merge a LoRA into a base checkpoint`), a pure local file-in/file-out operation — no ai-toolkit, no ComfyUI, no cloud gate — that plans first (tensor count, output size, destination drive, ETA) and reuses the same `quantize.python` interpreter as the local fp8 tool (one setting now governs both, so they cannot drift apart); a fix so the fp8 quantize/merge tools **read a checkpoint one tensor at a time instead of memory-mapping it**, which had been refusing a 12.8–25.6 GB conversion on a machine with plenty of free RAM ("the paging file is too small") — the same defect existed independently in the Z-Image custom-base converter and was fixed there too; the **Krea 2 base selector now lists every Krea 2 checkpoint on disk** (yaml-declared folders included, root-filename matches like the Generate resolver always allowed) instead of one hardcoded official name, refactored through a new shared `elect_krea_base` ranking so the Generate resolver and the Test Studio can never elect different files from the same folder — the fork kept its own improved "pin not in effect" warning wording on top of upstream's refactor; a **typed custom-base path is now checked the moment you stop typing** (packed-export refusal, fp8-cast precision warning) instead of only at save/launch; the **Krea base picker also accepts a root-filename fp8 twin**, so a file the local merge/quantize tools just produced (which land at the folder root) is selectable as a Test Studio base with CFG 4 / 25 steps pre-filled, instead of being invisible to the one screen meant to try it; **auto-reject now shows the count a click will actually act on** (still-undecided images only) instead of every image ever flagged, which had been showing "5,930 flagged" for a click that rejected zero; the **merge tool's form survives a layout resize** instead of the `<details>` losing its state and emptying the typed path/LoRA rows; a **quantization-format detection rewrite** in `model_integrity.py` distinguishing a *structured* export (extra dequantization tensors — refused, the load fails immediately) from a *plain fp8 cast* (no extra tensors — allowed, with a precision warning) — several widely-used community Krea 2 fp8 files are the latter and were being refused needlessly; the **CLIP text-encoder worker now tolerates a banner/greeting line before its JSON handshake** the way the Score-pass reader already does, fixing a false "check the Score interpreter" on 🎨 Medium and 🔎 text search; **SeedVR2 settings now name which tiling lane a configured target actually takes**, since the crossover is a strict `>` that lands exactly on the round numbers people type (1536 px against a 1024 px tile silently ran full-frame); **Setup now tells a broken *optional* Klein asset (the consistency LoRA) from a broken *required* one** — amber "still works without it" instead of the same red "dead engine" badge, and the same file stopped simultaneously reading "✓ Installed" on the ComfyUI download screen; and **every caption pass now says which engine actually wrote each caption** (JoyCaption / Ollama / JoyCaption-then-Ollama-refined) when `captioning.backend='auto'` silently chains them. Also adopted, unrelated to the wave above: a CI dependency fix (`safetensors` declared in `requirements-dev.txt`, not just the Torch overlay, so a Torch-only machine stops failing the streaming Z-Image converter test on a package it never installed); a privacy fix removing two real Tailscale/CGNAT addresses from test fixtures and teaching the privacy guard to catch a tailnet address in the future; a `packaging/`-level fix so the release-archive privacy scan covers the ZIP's actual textual members (gitignored files, the compiled `frontend/dist` bundle) instead of only `git ls-files`; and a Windows-path regex fix in that same scanner (`[\/]` inside a character class only ever matched `/`, never `\`). **Rejected wholesale under D4** — all confirmed to touch only files this fork has already deleted, or to gate kept-dormant files (`cloud_training.py`, `training.py`, `ContinueDialog.jsx`, `CloudRunsPage.jsx`) behind the hard-blocked `full_transformer` local launch: the **full-model checkpoints panel** (`dense_artifacts.py`, its routes, `DenseModelsPanel.jsx`) and its canvas "full model" deletion-guard badge; **choosing which road a 26 GB checkpoint takes back to a rented pod** (`pod_transfer_plan.py`, `pod_checkpoint_push.py`, `podTransportChoice.js`, the `aitoolkit_remote.py` streamed-upload plumbing built only for it); the **live Hub-presence check** (`hub_presence.py`, `useHubPresence.js`) that asks whether a delivered model's Hugging Face repository still answers; the **one-click fp8 delivery tool** (`fp8_local_delivery.py`) that fetches a dense run's master from a private HF repo — misclassified as the kept local tool on first pass by two different reviewers (the recon agent and this session's own first read of `8c6ea236`/`f284c9a3`) purely on filename resemblance to `fp8_quantize.py`/`fp8_export.py`, caught by reading the diff before trusting the name; the pod-side cloud-quantize onstart script (`cloud_quantize.py`); and the "Turbo dense-training is untested, not impossible" doc correction, three separate times across the window (`43437fe0`, `86ed991c`, `5640b0e6`) — all target a `### Why full-model training targets Raw, not Turbo` guide section that has never existed in this fork's `DATASET_GUIDE.md`. A LoRA-bench feature (`53c5598c`) was added and fully reverted (`ae10d81b`) inside the window itself — verified as a genuine no-op (files, `whatsNew.js` entry and help topic all cleanly restored) before letting the merge apply both commits through untouched. **Six marker-less leftovers, the most of any sync so far, none caught by a conflict marker:** (1) `routes/training.py`'s checkpoints-listing route auto-merged a `dense_models` key calling the deleted `dense_artifacts.list_dense_models` — `create_app()` still passed, since the call sits inside a handler; (2) `cloud_training.py`'s dataset-upload path and `_disk_gb_for` auto-merged calls into the deleted `pod_transfer_plan`/`pod_checkpoint_push`, both wrapped in enough surrounding code that no conflict fired; (3) `ContinueDialog.jsx` auto-merged an import from the deleted `podTransportChoice.js`; (4) `TrainingPanel.jsx` auto-merged a full `<DenseModelsPanel>` mount, its state and its data fetch, immediately adjacent to (and interleaved with) the legitimately-adopted merge-tool `<details>` block — the two shipped in the same upstream commit and had to be split by hand; (5) seven `whatsNew.js` entries for rejected features rode in on the same clean prepend as the legitimate ones, the now-familiar "text lands, the feature does not" trap, this time including a **misclassification risk of its own**: three of the *kept* entries (`merge-a-lora-into-a-base-checkpoint`, `train-krea-on-a-checkpoint-you-already-have`, `full-model-is-selectable-as-a-studio-base`) had to be reworded rather than kept verbatim — their upstream prose said "a full model trained here" / "hours of GPU" / "a cloud run offers to push it to your private repo first", which is only true of the rejected dense-training lane; in this fork a "full model" only ever comes from the local merge tool or a file the user already had; (6) `test_scaled_fp8_export_is_refused` (a pre-existing, untouched-by-this-merge fork test) started failing after the adopted quantization-detection rewrite changed `QUANT_REFUSAL`'s wording — caught only by the full suite, fixed by updating the regex to the new stable phrase rather than reverting the improvement. Gates: lint clean; build clean; local-only contract **8/8 frontend + 3/3 backend** against the rebuilt dist; `app.create_app()` OK; privacy/ASCII 7 passed, 1 skipped; full frontend **2696 → 2784 passed (+88), 0 failed**; full backend **5410 → 5619 passed (+209), 7 → 5 skipped, 1 failed** — the same pre-existing no-OpenCV environment failure, plus 2 skips resolved by installing the newly-declared `safetensors` dependency this same window adds. The first backend gate run (pre-`safetensors`-install) showed 3 failed/4 errors, all four errors and one failure from the one file needing that dependency, the other failure a stale local test assertion; both are environment/test-currency issues, not merge-resolution bugs, and both are fixed above. |
| 2026-08-04 | *(merge)* + dist | **Upstream sync — 20 commits (`f5322cb7`…`a339ee4a`), the most heavily SPLIT window this fork has taken: 20 conflict regions across 13 files, and three leftovers that carried no marker at all.** Adopted whole: the **Images grid pages at 500** with a Prev/Next pager, so a 6 000-image dataset stops drawing ~148 000 DOM nodes on one page (selection, counters, sort, filters and every bulk action still read the whole list — only the rendering is paged); **a batch of saved prompts renders one labelled grid per prompt** instead of collapsing into the last one, because `run_id` — always written by `create_run`, never serialised — now reaches the studio payload and the view groups by it rather than inferring a run from `run_seed` + prompt; **the ComfyUI recovery banner leads with "LDS cannot reach ComfyUI at &lt;url&gt;"** (userinfo/query/fragment scrubbed via a new `redact_url_secrets`, because that banner gets screenshotted into public threads) instead of blaming a paused job for an unreachable link — reported by **jerkyjunky (Discord)**; and **the person preflight redraws sampled images it cannot read a face in**, under a stated per-folder budget, instead of ending with "only 0 of 15 sampled images had a usable face". Adopted **split away from features this fork rejects**: the fp8 quantizer's plan-time disk guard (budget derived from the job, measured on the `realpath`-resolved volume — a flat 30 GB floor had been refusing a 12.8 GB conversion with 17.6 GB free) and its **subprocess execution under `quantize.python`**, which is the fix for a tool that could not run *at all* on an install without torch while every test passed; a one-line `apiFetch` fix (it resolves a **parsed body**, so the `.then((r) => r.json())` on it threw a TypeError into a swallowing `.catch` — the quantize panel had never once reported a completion or a failure); and `_stamp_pod_image`, hand-ported so a run records the trainer image the pod really booted. **Rejected under D4:** the dense quality levers and their recipe-card UI (backend half already rejected the previous sync); **local full-model delivery and dense continue, whole** — 4 commits, 3 new services, 2 new test suites, all gated behind a `full_transformer` launch this fork hard-blocks; the one-click fp8 auto-detect that fetches a master from a private Hugging Face repo; the Turbo dense-training doc fix (its anchors no longer exist here); and the canvas full-model deletion guard. **The three marker-less leftovers are the lesson of this sync:** (1) `routes/training.py` auto-merged a `/cloud/fetch-local` route calling `ct.fetch_dense_locally`, deleted with the rest of the lane — `create_app()` still passed, because the call sits inside a handler, so the `AttributeError` would have waited for a live request; (2) `settings-reference.md` auto-merged prose claiming the fp8 file lands in ComfyUI's own models folder and that a full drive offers another folder — `plan()` writes **next to the source** and no such UI exists here, caught by reading the code rather than trusting the doc; (3) the fp8 doors contract test auto-merged onto upstream's renamed endpoint **and** its renamed title — the endpoint half fell to the Phase-4 sweep, the **title half only to the full suite**, since it is a mounted assertion no grep reaches. Also dropped a What's-new entry for the cloud quantizer **rejected the previous sync**, re-offered here through a clean prepend — the recurring shape where the text lands and the feature behind it does not. Gates: lint clean; build clean; local-only contract **8/8 frontend + 3/3 backend** against the **rebuilt** dist; `app.create_app()` OK; privacy/ASCII 10 passed, 1 skipped; full frontend **2644 → 2697 passed (+53), 0 failed**; full backend **5389 → 5410 passed (+21), 7 skipped, 1 failed** — the pre-existing no-OpenCV environment failure. The backend gate was **re-run against the FINAL tree** after the three leftovers were fixed (the first run had executed against the tree that still carried the dangling route); both runs agree, and only the second one counts. |
| 2026-08-04 | *(merge)* | **Upstream sync — 3 commits (`0d982943`…`f5322cb7`), reviewed hunk-by-hunk before merging; no frontend changes, no dist rebuild.** Adopted: `vast_client.create_instance` now checks an ask's image-reference and onstart-script length against vast's own hard limits (1024 / 16384 characters) before sending — an oversized ask is refused locally instead of costing a round trip and reading as an indistinguishable "offer is gone" 400, and this applies to this fork's own dormant training-rental lane independent of the cloud-quantize pipeline the fix was written for. Also adopted a privacy fix removing a real first name from a `test_canvas_image_improve.py` docstring. **Rejected wholesale, and the investigation is worth recording:** gradient accumulation, LR schedule/warmup and timestep type as three new editable levers on the "full-model (dense) recipe" (`FULL_TRANSFORMER_GRAD_ACCUM`/`_LR_SCHEDULE`/`_WARMUP`/`_TIMESTEP_TYPE`, the `dense_*` helper functions, `DENSE_SETTING_KEYS`). The commit's own text says "Backend only. The controls in the recipe card follow separately" — and this fork's `launch_settings_snapshot` for `full_transformer` mode is still, verified by direct inspection, fully hardcoded (`grad_accum=1`, `timestep_type='linear'`, `lr=1e-6`, no `lr_scheduler` key at all): none of this machinery exists here, and Divergence 4 already rejected "dense full-model recipe controls" twice before (the `ace622f1` split and this sync's own predecessor row, both above). The change touched **five separate conflict regions in `lora_training.py` plus several call sites that auto-merged with zero markers** — git considered `launch_settings_snapshot`'s hardcoded `'grad_accum': 1` non-conflicting because this fork's own merge commit never touched those exact lines, so upstream's replacement (`_dense_grad_accum(dense_ds)`) landed silently and would have raised `NameError` the moment a dense recipe launched, since the function it calls lived inside a conflict region resolved the other way. Confirmed every line of the diff traced back to the one feature (no unrelated fix riding along), so the whole file was reverted to its pre-merge content in one `git checkout --ours` rather than resolved hunk-by-hunk. `dense_fp8_delivery.py` (pod-side dense-model delivery) and its new test file were re-deleted, unrelated to anything this fork carries. Gates: lint clean; build clean; local-only contract 8/8 frontend + 3/3 backend; `app.create_app()` OK; privacy/ASCII 10 passed, 1 skipped; full frontend **2644/2644 unchanged**; full backend **5387 → 5389 passed (+2), 7 skipped, 1 failed** — the same pre-existing no-OpenCV environment failure. |
| 2026-08-04 | *(merge)* + dist | **Upstream sync — 3 commits (`61f8d8e2`…`0d982943`), reviewed hunk-by-hunk before merging.** Adopted: the fp8 quantize tool's second door in **Settings ▸ Storage**, for someone who downloaded a model but has no dataset — same component as the Training-panel door, `framed` the only difference, so the refusals and read-back verification can never drift between them; a mobile fix so the path field and its button stop sharing one line below `sm`; `vast_client` no longer discards a non-200 response body, so a rental refusal quotes what vast actually said (secrets scrubbed, capped at 400 chars) instead of an empty `{}`; and `cloud_training`'s offer selection gains a disk floor plus `rent_with_fresh_offers`, so a refused offer costs one candidate instead of the run — both land in this fork's own dormant training-rental lane, independent of the feature they shipped alongside. Rejected under Divergence 4: the cloud quantization lane wholesale (`cloud_quantize.py`, its routes, `CloudQuantizeButton.jsx` and their tests — this fork never carried that service, confirmed by a zero-hit grep before touching anything), the Hugging Face storage forecast (`hfStorage.js`, its Settings card, its `cloud.full_transformer.*`/`cloud.quantize.*` config rows — none read by any surviving code), and a "Full-model (dense) recipe" doc table describing five editable settings that do not exist in this fork's Training panel (only Steps is). Upstream's "the full-model recipe card" wording was corrected to this fork's actual placement — the ordinary Training panel — in every doc, comment and help topic it touched. **One over-adoption caught on re-verification, not on the first pass:** upstream's "What lives where" / "Moving a folder" docs listed cloud-run staging and the checkpoint store as user-facing Storage controls, and the first draft here adopted that language wholesale — but `StorageSection.jsx`'s own `HIDDEN_REMOTE_KEYS` filters both out of every row and relocation list on this fork (the original, correct HEAD note said so before it was discarded). Caught by checking the actual component instead of trusting the doc's own claim, and trimmed before it shipped a page describing controls nobody can see. Two What's-new entries and a help-topic anchor auto-merged in cleanly (zero conflict markers) describing the rejected cloud-quantize fix and a Hugging Face forecast correction — the recurring "text lands via a clean prepend-merge, the feature behind it does not exist" trap; stripped/reworded rather than left to advertise a feature this fork doesn't have. One dead test call to the now-deleted `vast_client.execute_command` (itself dead D4 plumbing with zero callers, deleted alongside the merge) was caught only by the full suite, not by any grep. Gates: lint clean; build clean; local-only contract 8/8 frontend + 3/3 backend; `app.create_app()` OK; privacy/ASCII 7 passed, 1 skipped; full frontend **2636 → 2644 passed, 0 failed**; full backend **5380 → 5387 passed (+7), 7 skipped, 1 failed** — the same pre-existing no-OpenCV environment failure as the baseline. |
| 2026-08-03 | *(merge)* + dist | **Upstream sync follow-up — 2 commits (`d12ed260`…`30b2870f`) that landed during the full-suite gate.** Adopted the local Canvas/gallery source wave: **Upscale & improve** now appears in checkpoint and run galleries through the same `useCanvasImageImprove` handler as the board, so the `lora_test_image` route is spelled once and an already-improved row remains ineligible; dragging either a pinned picture or a run card now claims the Canvas view, preventing the automatic fit from throwing away the user's framing on drop while preserving first-open fit and the explicit **Fit** action. Kept its docs, help topics and focused mount/gesture contracts. Rejected upstream's `30b2870f` dist and rebuilt from resolved fork source. The merge had **one source conflict region (3 marker lines)** in the prepend-only What's-new list plus the expected dist conflict. The first resolution pass exposed a whole-file trap: accepting upstream's changelog restored ten historical Nano Banana / ChatGPT / OpenRouter mentions previously removed by D1, and the local-only budget failed (**2635 passed, 1 failed**); restoring the fork-safe file and adding only the two legitimate Canvas entries returned the full suite to green. Gates: ESLint clean; build clean; focused Canvas/gallery/help **40/40**; local-only contract **8/8**; full frontend **2624 → 2636 passed (+12), 0 failed**. Backend source did not change; the immediately preceding full backend gate remains **5389 passed, 20 skipped, 0 failed**. |
| 2026-08-03 | *(merge)* + dist | **Upstream sync follow-up — 1 late commit (`ace622f1`) split along Divergence 4 after the preceding 14-commit merge.** Adopted the reusable scaled-fp8 writer, the CPU-only **Quantize an existing model to fp8** tool in the ordinary local Training panel, its plan/start/status routes, verified output and disk/refusal behavior, header-only quantization inspection, the hard guard against selecting inference-only fp8/int8 exports as local training bases, and Krea Raw/full/fp8 Test Studio defaults (CFG 4, 25 steps). Rejected the rented half wholesale: pod-side post-run export/delivery, cloud quantization and orphan-pod sweep, Hugging Face storage changes, Vast changes, dense full-model recipe controls, Cloud Quantize button, Cloud Runs UI, rental docs/help/announcement, and their cloud tests. The retained exporter was trimmed to its local library surface — no pod CLI, Hub upload, token or remote cleanup remained. **Ten textual conflict regions (30 marker lines)** were counted before resolution. One clean-merge interaction was caught by the focused suite: Krea Test Studio imported two sample constants that existed only in the rejected dense recipe, which would have raised `AttributeError` when selecting a Raw/full/fp8 Krea model; the local service now owns those defaults and the regression is green. Gates: ESLint clean; build clean; local-only contract 8/8 frontend + 3/3 backend; `app.create_app()` OK; privacy/ASCII 10 passed, 1 skipped; help contract 14/14; focused fp8/Krea backend 40 passed, 2 skipped; full frontend **2624 → 2624 passed, 0 failed**; full backend **5361 → 5389 passed (+28), 20 → 20 skipped, 0 → 0 failed**. |
| 2026-08-03 | *(merge)* + dist | **Upstream sync — 14 commits (`bc22c53e`…`5929f746`), five local waves adopted and three upstream bundles rejected.** Adopted the privacy cleanup; Krea 2 Edit's one compositional second-subject image from the edit dialog (kept local-only, with the useful pool-separation assertion ported out of the re-deleted `test_engine_lists_contract.py`); prompt batches with no arbitrary 24-prompt ceiling and estimates measured from this machine's recent pace; free placement plus honest provenance/Tidy-up for Canvas pins and strips; and local Canvas **Upscale & improve**, whose derived rows remain pinnable without entering Test Studio counts, scores or timing. Rejected `b63120f5`, `cf41a89b` and `5929f746` dist and rebuilt from resolved fork source. **Twenty-three textual conflict regions (69 marker lines)** were counted before resolution. Two clean-merge interactions were caught before commit: the new Krea upload path referenced upstream's API-lane `sanitize_external_reference`, which did not exist after D1c resolution and raised `NameError`; it now has a local modal-upload sanitizer that validates and normalizes before superseding a live batch. Separately, upstream's Krea helper knew only local ComfyUI staging, so its second image would have touched an undefined local input directory when `device_id` selected a peer; the fork now publishes both reference paths through D6's `staged_input_paths`, pinned by a real remote-enqueue test. The whole-tree added-line sweep caught and removed one stale “API engines” guide claim; D5, D6/6a and D7 carriers survived. Gates: ESLint clean; build clean; local-only contract 8/8 frontend + 3/3 backend; `app.create_app()` OK; privacy/ASCII 7 passed, 1 skipped; focused changed-feature suites 118 frontend + 187 backend; full frontend **2575 → 2624 passed (+49), 0 failed**; full backend **5323 → 5361 passed (+38), 20 → 20 skipped, 0 → 0 failed**. |
| 2026-08-03 | *(merge)* + dist | **Upstream sync — 4 commits (`fc4e29d3`…`35f4d827`), one dormant data-safety wave adopted, one mixed Storage wave split along Divergence 4, and one Canvas fix converged.** Adopted `fc4e29d3`'s durable checkpoint store in the dormant cloud backend: finished-run cleanup now rescues `.safetensors` before trashing staging, readers prefer the store with a legacy fallback, boot performs an idempotent retrofit, and orphan folders are named rather than silently called clean. Adopted the local half of `38757773`: **Settings › Storage** now maps the app's local folders with paths/free space and on-demand sizes, safely relocates the dataset root with an explicit move-vs-adopt decision and progress, and moves Trash plus the run image archive out of Maintenance. Rejected its rental surface: `HfStorageCard.jsx`, the private Hugging Face allowance, cloud-run staging/checkpoint-store editors and housekeeping, plus their help topics, reset rows, docs and announcement claims. The backend `paths.cloud_runs_dir` / `paths.checkpoints_dir` defaults and storage services remain dormant so the checkpoint-rescue implementation stays upstream-shaped; the frontend filters those rows and does not measure their directories. `0857d6b4`'s `barH` crash fix had already landed independently on this fork, so the merge kept a single upstream-shaped declaration and adopted its real JSX mount harness plus exact drag-out regression test. **Lint caught the clean-merge interaction before runtime:** both sides declared `barH`, producing a duplicate binding with zero conflict markers. Upstream's `35f4d827` bundle was rejected and dist rebuilt from the resolved fork source. **Twenty textual conflict regions (60 marker lines)** were counted before resolution; the whole-tree added-line sweep found zero cloud image-engine resurrection, and D5, D6/6a and D7 carriers survived. Gates: ESLint clean; local-only/render/settings focused frontend 92/92; checkpoint/storage/local-only backend 86/86; `app.create_app()` OK; full frontend **2558 → 2575 passed (+17), 0 failed**; full backend **5314 → 5323 passed (+9), 20 → 20 skipped, 0 → 0 failed**. The first post-merge frontend pass had one wording-contract failure after removing a stale `Settings › Storage` pointer from the dormant cleanup message; restoring the honest phrase `checkpoint store` without restoring the hidden UI claim made the immediate full rerun green. |
| 2026-08-03 | *(merge)* + dist | **Upstream sync — 5 commits (`21c92154`…`f882505c`), two local feature waves adopted and one cloud-only wave rejected whole.** Adopted: **saved-prompt batches** in both Test Studio and Generate-from-the-board (tick up to 24 prompts and render them in one comparable run); **steps and CFG controls for multi-LoRA Compare/Blend**, carried through the same axes and request payload as the single-LoRA surfaces; and **the person pass checking subfolders first**, sampling likely one-person folders before the expensive full pass and asking once before turning accepted suggestions into ordinary, revocable assertions. Rejected under Divergence 4: `a002ad36`'s entire rented full-model / `HF_CLOUD_TOKEN` private-storage precheck, `hf_storage.py`, its routes/tests/config/refusal flag, the Settings ▸ Training Hugging Face storage card, docs/help topic and What's-new entry. Both upstream `build(frontend):` commits were rejected and the bundle rebuilt from the resolved fork source. **Seven textual conflict hunks (21 marker lines) were counted before resolution.** The D5 carrier in `test_bank_folder_person.py` survived at all five `_drive_infer_subprocess` mocks (`**_kw`). **One clean merge interaction was caught and pinned:** upstream's new folder probe is a local face-embedding child process with no peer-dispatch lane, while this fork lets the person pass run on another machine. The preflight gate now returns straight through for a non-local `passDevice`, so selecting a peer never silently takes the primary machine's GPU before handing the real pass away; `analyzeRowDevice.contract.test.js` guards that ordering. The whole-tree added-line sweep found **zero rejected-feature additions** and zero imports of the re-deleted storage modules. Existing What's-new/help/guide entries from the two adopted waves were kept; the cloud-storage entries were dropped. Gates: ESLint clean; build clean; local-only contract 8/8 frontend + 3/3 backend; `app.create_app()` OK; privacy/ASCII 7 passed, 1 skipped; focused changed-feature suites 54 frontend + 100 backend; full frontend **2515 → 2558 passed**, full backend **5290 → 5314 passed (+24), 20 → 20 skipped, 0 → 0 failed**. The first pre-fetch frontend attempt reported one file-level runner failure for `LocalToolsSection.contract.test.js`; its 5 tests passed immediately in isolation and the immediate full rerun was 2515/2515, which is the baseline used here. |
| 2026-08-03 | *(merge)* + dist | **Upstream sync — 39 commits (`593527ed`…`5a942e76`), the biggest single window this fork has taken, and zero cloud-engine content anywhere in it.** Adopted whole: a **caption length dial** (concise/standard/detailed, riding the same preset lane as the vocabulary register); **🎨 Medium and ⤢ Angle** — a zero-shot CLIP medium classifier (photo/anime/3D render/illustration) reusing ✨ Score's own embeddings, and a head-yaw sort reusing the face pass's existing InsightFace measurement, both new `BankImage` columns, both auto-chained after their host pass; **"this subfolder is one person"** folder-level assertions plus the app suggesting them itself (`services/folder_person.py`, `bank_folder_person`/`bank_folder_probe`); a **dedicated watermark detector** (SigLIP2 rank + Grounding DINO locate, both Apache-2.0, ~10x the vision model's speed and no Ollama dependency); **SeedVR2 tiling** made a real setting (tile size, crossover threshold, VAE pin) and the DEFAULT for large upscales; **dataset passes surviving a deleted image** (caption/watermark/framing/short-caption, matching the bank-side fix from two days ago); a **🧬 weight sweep** (tick several weights per LoRA in a Blend, render every combination in one run); **blend provenance edges** on the LoRA Canvas; a **Pinokio install mode**; and an **export fix** that stops re-encoding images that need no conversion (a 6.7x size blowup on one reported dataset). **Two real divergence collisions, both caught because a "clean" merge is treated as hostile until proven otherwise.** (1) `backend/app/__init__.py`: upstream's `5a942e76` deletes the fork's `_set_dataset_archive_request_limit` before_request hook in favour of an `ArchiveAwareRequest.max_content_length` property — and the replacement auto-merged with **zero conflict markers**, silently dropping the fork-only `_PEER_ARTIFACT_UPLOAD_ENDPOINTS` branch (a rented peer's checkpoint/dataset uploads, introduced by the cluster feature, absent from upstream entirely). Left as merged, a real checkpoint handback from a peer would have 413'd at the ordinary 64 MiB ceiling. Extended the new property class with the peer branch instead of restoring the old hook — same fix, upstream's shape. (2) `image_bank_service.start_watermark`: upstream's new detector extra is a **local-only** child process with no peer-dispatch path, while the fork's `device_id` routes a pass to a joined compute peer's own Ollama. Scoped so a remote pass always takes the vision-model route (which already supports `bank_remote.run_remote_vision`); the detector only ever runs when `not remote`. **`face_embed_infer.py`'s cache tuple got wider, not conflicting**: fork's `sig` (stale-file detection) and upstream's `yaw` (head angle) both extended the SAME 5th position independently — merged to a 6-wide `(state, det, bbox_frac, emb, sig, yaw)`, both `_load_cache`/`_save_cache` and every write site updated, `require_yaw` composed with the existing staleness check. **Two genuine bugs in upstream's own new code, not merge artifacts** (auto-merged clean, so nothing flagged them): `watermark_detect_infer.py` never claimed the result stdout stream via `infer_io.claim_result_stream()` the way every other infer script does, so a torch/transformers banner could have corrupted its result line — fixed to match the established pattern. The watermark **vision**-route loop's new `watermark_source`/`watermark_score` stamping referenced an undefined `row` (`NameError`) instead of the loop's own staged-write pattern (`pending.setdefault(row_id, {})`) every other field in it already uses — this alone broke ~12 tests across five files touching the watermark pass, fixed to match the surrounding code. **Divergence 5(B) recurred twice**: two NEW upstream test files (`test_bank_folder_person.py`, `test_bank_medium_after_score.py`) mock `_drive_infer_subprocess` with the plain 7-positional signature, missing the fork's `stall_label=`/`busy_detail=` kwargs — widened to `**_kw`, the same fix as every prior occurrence. One genuine ordering bug of this sync's own making: `start_faces`'s `angles_only` "nothing to backfill" `ValueError` (400) needs to fire *before* the `is_available()` install-probe `RuntimeError` (503) — a bank needing no more work must never be told to install a 300 MB extra it does not need; upstream's original ordering had this right, the first merge pass put the fork's remote-gate ahead of it. `docs/guide/settings-reference.md`'s **Cloud GPU (vast.ai)** Settings-UI-card section (Divergence 4) was rejected again — it describes a card that has never existed here; the reconnection-after-restart sentence upstream added to `unreachable_grace_minutes` was hand-folded into the fork's own dormant-config row instead. `README.md`'s Bank capability table landed on the WRONG `<details>` section (a context-matching artifact, not a real conflict); its **Medium/Angle** row was added to the real, fork-customised Bank table instead of duplicating a generic one under "Build any dataset". `frontend/src/whatsNew.js` needed no new entries — all ten user-visible features already carry their own, prepended by the originating commits; two prepend collisions resolved keep-both (one hid a second, IDENTICAL trailing `to: '/datasets', },` snippet common to both sides' last entry, which is why it never showed as part of either side's diff). `react-router` was found installed at 6.30.4 against a `package.json` pin of `^8.3.0` — pre-existing drift, `git diff` confirmed neither file moved in this merge — fixed with `npm install` (not `npm ci`) per the documented rule. Gates: lint clean; build clean; local-only contract 8/8 (frontend) + 3/3 (backend); `app.create_app()` OK; privacy/ASCII 7 passed, 1 skipped; frontend **2416 → 2515/2515**; backend, from the repo ROOT as CI runs it, **5137 → 5304 passed (+167), 1 → 1 failed, 5 → 5 skipped** — the one survivor is the documented environment failure (`test_prefill_falls_back_to_telea_when_lama_absent`, no OpenCV here), red on the baseline too. |
| 2026-08-03 | *(docs)* | **Two upstream PR branches prepared — and preparing them found an unrecorded Divergence 5 carrier and a rule collision.** Both branches (`fix/mobile-rail-containing-block`, `fix/aitoolkit-venv-layout-posix-v2`) are cut from `upstream/main`, not from this fork's `main` — a branch off `main` would carry the whole divergence, cloud-engine removals included, into a public PR. **The rule collision, worth internalising: `CLAUDE.md` step 2 says never commit `frontend/dist` beside sources, and upstream's `CONTRIBUTING.md` says the exact opposite for a contribution** — "if you change anything under `frontend/src`, run `npm run build` and commit the regenerated `frontend/dist/` in the same PR", because people run from source and would otherwise not see the change. The fork rule governs waves on this `main`; upstream's governs a PR to upstream. The dist was stripped from the rail PR under the wrong rule and put back. Step 2 of the shipping checklist now says so. **The unrecorded carrier** is `test_bank_score_gpu_window.py` — see Divergence 5's third entry. It surfaced only because the contribution branches were checked with the FULL backend suite: the rail branch changes **zero** backend files and still returned `1 failed`, which is what forced the question. Re-run on pristine detached `upstream/main` with a clean `git status`: `1 failed, 5 passed`; the fork's copy: `6 passed`. Upstream's assert sits outside its own `bank_scoring_gpu_available` patch and so probes the real machine — green on their GPU-less `windows-latest` CI, red for every contributor with a CUDA card. Also audited, since one missing entry implies others: of the 67 upstream test files this fork has patched, the ones whose diffs carry no cloud-engine content were classified, and `test_comfyui_model_file_capability.py` was **checked and rejected** as a carrier — upstream's version passes here (15 passed), so it is inert merge surface rather than a load-bearing patch. Several small diffs in that set are retired-Divergence-3 emoji residue in docstrings, which is conflict surface with no purpose now. Branch suites: rail `4953 passed / 1 failed`, ai-toolkit `4952 passed / 1 failed` — the same pre-existing upstream failure in both, and nothing else. |
| 2026-08-03 | *(fix)* + dist | **The phone layout drew at 73% of the screen, and the cause was a one-pixel invisible box.** Reported from mobile/PWA: on the dataset page the header bar, the section chips and every card rendered at about three quarters of the screen width with dead space down the right. **Diagnosed live rather than by eye** — the served app at a 440 px viewport reported `innerWidth` 598 and `documentElement.scrollWidth` 598 while `body.scrollWidth` stayed 440, which is the signature of an element escaping the body and widening the document, and 440/598 = 73.6% is exactly the ratio measured off the screenshot's pixels. The escapee: `overflow-x-auto` clips a descendant only when the scroller is ALSO its containing block, and a `position: static` box never is — so the `.sr-only` label inside a NavBadge count (Tailwind implements `.sr-only` as `position: absolute` with no offsets) resolved against the document and kept its static position out at the far end of a rail 1123 px wide. Proven both ways in the live page before touching code: setting `position: relative` on the rail took the document 598 → 440, reverting took it back to 598. Fixed with `relative` on the dataset sections rail, its destinations sibling, and the Settings and Guide rails — the last two are latent, not broken (Settings' rail is already 1217 px wide and would reproduce this the day a badge is added there). Screen-reader labels and rail scrolling both verified intact afterwards. Pinned by `tests/mobile-rail-containing-block.test.mjs`, verified red against the unfixed markup. Frontend 2337 → 2342 passed / 0 failed. |
| 2026-08-03 | *(merge)* + dist | **Upstream sync, third merge of the day — 2 commits, both adopted whole.** `b053ea1c` (🧬 Blend: load every ticked checkpoint into ONE generation from the Canvas board, each on its own weight slider) and `c28be7a8` (Coverage gains the two axes labels cannot see — visual spread from the CLIP embeddings ✨ Score already cached, and caption variety from the 🏷️ lexicon). **Checked, not assumed, on the two things that could have gone wrong quietly:** (1) `b053ea1c` renames Combine→Blend and the commit says labels-only — verified against the code, not the message: `studioComp_mode`, `'combine'`, `combine: true`, `studio-combine-loras` and `combineBlocker` all still present, so nothing in localStorage or on the wire moved (CLAUDE.md rule 7); (2) its `cloud_training.py` and `LineageCanvas.jsx` hits are NOT Divergence 4 — the first adds `trigger_word` to `canvas_dataset_index` (that file hosts the Canvas index despite its name) and the second passes `triggerWord` into a pick, deriving no lane from `configured`, so diagnostic 16 does not fire. **The one real catch:** upstream's import block in `BankWorkspace.jsx` drops `forgetMissingConfirm` from the `bankSync.js` import — fork-only (their `bankSync.js` never exported it) and called at line 708, so taking their side wholesale would have shipped a `ReferenceError` on the "forget missing" gesture. Kept, alongside their two new imports. Also aligned the ⚖️ Pick a balanced set glyph with upstream's (the fork carried a bare U+2696 where upstream has U+2696 U+FE0F — leftover drift from the retired Divergence 3), so the Guide and the button now agree. Prepend-vs-prepend on `whatsNew.js` resolved keep-both, upstream on top: 392 entries, no fused blocks, no duplicate ids. Merge-added rejected-feature lines: 0. Tests: frontend 2313 → 2337 passed / 0 failed; backend 5049 → 5065 passed / 16 skipped / 0 failed. |
| 2026-08-03 | *(merge)* + dist | **Upstream sync — 13 commits over two merges, and six of them are this fork's own bug reports coming home.** The whole GitHub #20 batch landed upstream overnight (`b1a3d7bd` ref-edit Keep logger, `9c3ddad0` Ollama pull read timeout, `bb2df2e6` dead `ComfyUIService.queue_prompt`, `dd1e355d` Klein bare-name guard on Linux, `f99567df` Ollama fence `down` state, `f089ebb5` Docker launcher assertion), each credited "Reported by socrasteeze". **Four of the six were already fixed here, so the real work was comparing two independent fixes for the same bug and keeping theirs** — which retires four carried patches. **Divergence 7 is now one bullet: `_CLAIM_MAX_AGE_S`**, which upstream's fence fix re-adds and which cannot ever fire (`now > deadline + 30` sits in the same `or` and is true first) — dropped again, with the reasoning kept in the file so the next sync does not re-adopt it silently. Adopted whole: `602c7720` (Browse… opens the modern Windows folder dialog via COM interop under PowerShell 5.1), `316b2ec9` (🏷️ tag chips — click an image's tags to find the images that share them; its own `tags` payload key, AND matching, whole-word), `db0c380e` (the scoring pass counts rows it WROTE, not paths it asked about), `acafb43f`, `4fa37172` (Anima is hybrid-prompting: booru AND prose), `a66591ae` (the caption-mismatch refusal names YOUR family). Rejected: `ad809fa6`, upstream's `build(frontend):` dist — restored to this fork's bundle and rebuilt separately, as always. **The near-miss worth reading is new diagnostic 23**: `git checkout --theirs` on a ONE-hunk conflict in `face_dataset_service.py` silently restored upstream's ENTIRE file — the whole API fan-out lane, `chatgpt_image`, `_run_nanobanana_batch`, `API_ENGINES = ('nanobanana', 'chatgpt', 'openrouter')` — with zero conflict markers left and a clean `--diff-filter=U`. Caught only by sweeping merge-ADDED lines (64 hits in one file), then redone per hunk: 0 hits, both merges. `BankWorkspace.jsx` was the one real keep-both: the fork's `dupBadges()` (still-open groups only) kept, upstream's superseded raw `dup_group` badges dropped, its new 🏷️ BUTTON adopted. Both Divergence-5 carriers upstream edited this window (`test_anima_family.py`, `test_bank_pass_survives_deleted_image.py`) were checked line-by-line and survived. Also ported upstream's new Keep-failure test into `test_ref_edit_local_engines.py` (their copy lives in the API-lane suite this fork re-deletes), verified red without the module logger. Tests: frontend 2292 → 2305 passed / 0 failed; backend (from the repo ROOT, as CI runs it) 5031 → 5049 passed / 16 skipped / 0 failed. |
| 2026-08-02 | *(merge)* + dist | **Upstream sync — 19 commits, and the headline is that a fork divergence ENDED: upstream ported the Klein model-file pins back from this fork's branch (GitHub #20) and Divergence 2 is retired.** `644ab5dd` / `54032d62` take `resolve_model_ref`, `_configured_model`, `klein_override_status`, `_stage_external_model` and `_unet_weight_dtype` under their original names, and `76b25466` then fixes a defect in the port — the pinned-file badge told the consistency LoRA row "Not found — auto-detection is used", naming a mechanism that slot does not have (there is no detection behind it; a miss means the LoRA is skipped). Upstream's version was taken on **all 34 conflicting hunks** across the eight D2 files, so the fork now runs the same code as upstream on a feature it used to carry alone. **The retirement sprang two traps, both of which take a feature backwards without failing anything, and they are new diagnostic 21**: upstream RELOCATED `KLEIN_OVERRIDE_KEYS` and `_PINNED_SUBDIR` inside `klein_edit_helper.py`, leaving the fork's copies outside every conflict (duplicate definitions, same value, silent); and `EnginesSection.jsx` put upstream's improved `overrideBadge` / `KleinModelFilesCard` INSIDE the conflict while the fork's older pair sat 700 lines below it, outside — a JS `function` redeclaration is legal and the **last one wins**, so the merge would have shipped upstream's fixed card as dead code and kept the superseded one live, undoing `76b25466` while the diff said it was adopted. Neither the bundler nor `no-undef` sees a redeclaration. Also adopted: **▶ Review opens in one `ids_only=1` request** instead of paging the whole grid (3 771 ms → 44 ms on upstream's 22 940-image bank); **sort by anything a pass measured** plus a 🚫 Exclude box; **text search can push down what you do not want** (CLIP cannot hear "without" — measured 60 % bikinis against a 10.1 % base rate on "a woman without a bikini", an inversion, not an imprecision); a **🔍 Coverage panel**; **both upscalers in the lightbox** with engine-true labels and a waiting-result badge; the **Pinokio launcher**; a dark `color-scheme` so the Sort menu's `<optgroup>` headers stop rendering as white bands; and the Docker test-mode timeout. **The substantive merge interaction was `image_bank_service.py`, and taking either side whole was wrong.** Upstream's `b87830f6` makes every bank pass survive an image deleted mid-pass, by re-reading each row through `_live_image` (`Session.get(..., populate_existing=True)`, which answers None instead of raising `ObjectDeletedError`). Three passes (faces, score, inpaint) auto-merged and took that fix verbatim. The other five are the ones **this fork rewrote in the db-lock wave** to hold no ORM rows at all — and there upstream's side would have reverted the write-lock fix (the ORM row is dirtied again by `_discard_clean_blob`) *and* deleted the fork's remote-peer support outright, because their loop hardcodes `map_vision(prepared(), ask, ...)` where the fork branches on `source` being the peer stream or the local pool. Resolved by keeping the fork's staged-write shape and adopting upstream's liveness half as an **existence test only** — which is safe here for the reason the original bug report identified: the hazard was a SELECT autoflushing DIRTY ORM rows, and with every write staged as plain data there is nothing dirty for a read to flush. That buys both properties at once: the pass no longer pays a ~1.7 s Ollama call for a row that is gone, and the write transaction still never spans an inference call. **The counter that came with it is new diagnostic 22**: upstream's `vanished` tally is defined at the TOP of each pass and reported at the BOTTOM, and in all five fork-owned passes the bottom half auto-merged clean while the top half was inside the conflict — five `NameError`s waiting at the very end of a job that runs for minutes to hours, which is exactly where a suite is least likely to reach. **One correctness fix went in on top rather than being merged**: the caption pass fails the job when it produced no captions ("the caption engine answered nothing"), which becomes a lie when the images were deleted instead — it now only blames the engine when nothing vanished. **Two What's-new entries were deliberately DROPPED**, and this is the editorial call of the sync: upstream's `2026-08-02-klein-model-paths` and `2026-08-02-klein-model-file-pins` announce the Klein pins as new, and on this fork they shipped on **2026-07-19** with their own entries. Prepending them would have lit the unseen badge to tell these users about a feature they have had for two weeks. **Rejected**: `engines.chatgpt_auth` and the `nanobanana`/`chatgpt`/`openrouter` keywords upstream re-added to the enabled-engines help topic (D1, keeping their genuine keyword enrichment on the `klein.unet` row), and upstream's `test_service_fanout_refuses_nsfw_on_api_engines`, which calls a `generate_variations_nanobanana` this fork does not have — its sibling route test is kept, renamed to `test_generate_route_refuses_removed_api_engines`, which is what it actually asserts here. **Zero rejected-feature lines were ADDED by this merge** (diagnostic-2 sweep over merge-added lines only). **The sync also arrived carrying a fresh copy of the bug fixed yesterday**: upstream's new Pinokio instructions tell the user to install from `perfectgf/lora-dataset-studio`, i.e. a one-click installer for a different codebase — repointed in `README.md`, `docs/guide/getting-started.md` and `pinokio.js`, along with two pre-existing README pointers (the release download and the `git clone`) that had the same effect and were missed when `updates.repo` was fixed. Sponsorship and issue links stay upstream's on purpose. **The keep-both splice in `whatsNew.js` failed again, in a quieter shape than last time**: the boundary between upstream's last entry and the fork's first lost its `},\n  {`, so the two objects FUSED — and because duplicate keys are legal, the result was valid JavaScript that parsed, linted and built cleanly while `2026-08-02-bank-sort-every-measure` simply ceased to exist in `WHATS_NEW`. The 2026-07-29 version of this mistake broke the parse and ESLint caught it in seconds; this one was caught only by `release-notes-contract.test.mjs`'s *"no entry is swallowed by a merge"* (383 `id:` lines against 382 parsed entries), which is a test whose entire purpose is this failure and which earned its keep on the first sync after it was written. A silently dropped entry is also a silently dropped RELEASE note, since the notes are the diff of this file. `backend/run.py` was a genuine keep-BOTH: upstream added `_announce_when_ready` to print `[LDS] Ready on <url>` (Werkzeug's own banner goes to `data/app.log`, so a launcher reading the terminal waits forever) while the fork carries browser-opening at the REAL bound address with the LAN token and a Settings switch. Merged into one readiness thread — one `/api/health` probe, both jobs — since they want the same moment; the announcement is now unconditional, because a launcher needs the address even when the browser is off. `start.js` additionally sets `LDS_NO_BROWSER=1`: upstream's comment says LDS_OPEN_BROWSER is "intentionally not set", which is not enough here, where `server.auto_open_browser` DEFAULTS to true and would pop a second browser beside Pinokio's own tab. **One more duplicate, in prose this time**: `docs/guide/settings-reference.md` auto-merged with ZERO conflict markers into TWO `### Klein model files (optional)` sections — the fork's older one and upstream's fuller port, 95 lines apart, with the duplicate heading also splitting the anchor the help registry points at. Upstream's is a strict superset (it keeps the per-dataset-picker precedence and the wrong-kind-of-file caveat and adds the "present but unreadable" explanation), so the fork's 18 lines were deleted. Carried under Divergence 5: upstream's new `test_bank_pass_survives_deleted_image.py` mocks `_drive_infer_subprocess` with their positional signature and this fork passes `stall_label=`/`busy_detail=`, so 2 of its 8 cases failed — and failed through the suite's own helper as *"one image deleted mid-pass killed the whole pass"*, blaming the feature under test for a mock that never matched. Widened to `**_kwargs`; the other 6 passed unaided, which is the useful signal, since those six cover the passes whose loops were re-engineered here rather than taken. Gates: lint clean (ESLint's own output, diagnostic 11); build clean; local-only contract **8/8** against the rebuilt bundle; `create_app()` OK; frontend **2236 → 2292/2292**; backend, run from the repo ROOT as CI does, **4961 → 5031 passed (+70), 16 → 16 skipped, 0 → 0 failed**. |
| 2026-08-02 | *(merge)* + dist | **Upstream sync — 54 commits, a React 19 / react-router 8 migration, and a global request guard that broke the one route it had never met.** Adopted: **SeedVR2 as a second local upscaler** (a `ComfyUI-SeedVR2_VideoUpscaler` node pack + two downloaded models, offered beside Klein improve, added to the feature matrix); **Krea generation-LoRA presets** (a Settings card + per-run picker mirroring Klein's, both engines resolving their OWN preset list so one name can mean two different chains); **the whole Docker launcher restructure** — `start-docker.bat` now adopts an EXISTING host ComfyUI (folder picker, port auto-allocation 5050-5149/8188-8287, an explicit Ollama choice inside Setup instead of silent download) while `start-docker-gpu.bat` keeps the isolated fresh-ComfyUI path; the watermark pass now commits **once per image traversed**, not once per 25 parsed answers, closing a hold-window upstream's own instrumentation found beyond what this fork's existing periodic flush already bounded; and `_release_db_before_inference()`, a bare commit inserted before every hour-long face/score child process to close whatever the ORM's autobegin opened on the read side. **The React 19 / react-router 8 bump needed a real `npm install`, not `npm ci`**: taking upstream's `package-lock.json` wholesale left `node_modules` on router 6.30 + React 18, and `npm ci` itself refused (`Missing ... from lock file` on several transitive deps) — the lockfile was resolved against a different npm run than this checkout's. Diagnostic 6 caught the aftermath: `EnginesSection.jsx`'s new SeedVR2 model-list fetch called `useEffect` with only `useState` imported, invisible until lint ran on the freshly-built dist. **Rejected** (Divergence 4, fifth consecutive sync): the whole rented-GPU launch dialog (three hunks against an empty HEAD side, again), the `VastKeyGuide` card and its ten cloud settings, and every `cloud.*` help-registry topic — upstream's three new `trainingMode.test.js` assertions collapsed into one inverted test, per the established pattern. **The catch, and it is the fifth diagnostic-6 hit this fork has logged**: `TrainingPanel.jsx` still imported `cloudUnsupportedFamilyReason` from `trainingFamilyScope.js` after its only caller (the rejected dialog) was deleted — an orphaned import with zero runtime effect, caught only by `trainingFamilyScope.test.js` asserting the panel spells it out; re-pointed to assert the import's ABSENCE instead, since the helper itself stays defined and unit-tested for the day this fork's D4 stance changes. **A genuine bug this sync's own new guard introduced, found by a pre-existing test rather than anything this fork wrote**: `9cb3ddc9`'s app-wide `reject_unparsable_json_body` before_request hook calls `request.get_data(cache=True)` on every strict-method `/api/` write to catch a body that silently degrades to `{}` — and that call buffers the WHOLE WSGI input stream, which `cluster.peer_upload_artifact` (a fork-only route with no upstream equivalent) then reads a second time via `request.stream` in 1 MiB chunks to avoid holding a LoRA checkpoint in memory. The guard's own multipart skip didn't cover it — the peer upload is `application/octet-stream`, not multipart — so a real peer training upload would silently write a 0-byte file while answering 200. Fixed by skipping `application/octet-stream` before the buffering call, alongside multipart, with a regression test added to the guard's own suite (`test_json_body_strict.py`) verified to fail without the skip. Two of the three CI-run failures traced to test infrastructure rather than product bugs: `test_bank_infer_no_db_lock.py`'s two new tests mocked `_drive_infer_subprocess` with a 7-positional-argument signature, missing this fork's own `stall_label`/`busy_detail` kwargs (the CUDA-interpreter stall watchdog upstream doesn't have); widened to `**_kwargs`. `test_dataset_job_dispatch.py` carried a HARDCODED engine-list test that upstream's own commit message says doesn't work (`test_dataset_job_harvest.py`'s AST-based discovery supersedes it) — taken, not kept alongside. Gates: lint clean; build clean (after `npm install`); local-only contract 8/8 against the rebuilt bundle; `create_app()` OK; frontend 2138 → 2230/2230; backend 4642 → 4945 passed / 16 skipped / 0 failed, run from the repo root as CI does. **One editorial call, not obviously mechanical, recorded rather than silently made**: upstream's own README has quietly been ~250 lines shorter than this fork's for a long time (a "quick visual tour" table + a pointer to `docs/guide/workflow.md`, no numbered walkthrough, no Recent-improvements changelog) — today's real upstream diff to it was only 52 insertions / 19 deletions, folded into the fork's existing long-form structure rather than adopted wholesale; the fork's structure is kept on the grounds that CLAUDE.md's own README rule ("not a changelog") is already satisfied by it, and switching would need a dedicated pass to re-point every internal anchor this file and its ToC depend on. |
| 2026-08-01 | *(merge)* + dist | **Upstream sync — 9 commits, and the D1 arrival was a file that did not exist an hour earlier.** Adopted: **the bank ceiling, counted against the FOLDER** (50 000 → 200 000, and a folder that once hit the cap could previously never accept another image because `refresh_bank` is deliberately additive and every deleted file kept consuming budget for ever); **🗑 Delete rejected as an ordinary bank job** (progress, Stop, chunked row drops) ; **Test Studio LoRA stacking** (`combine=True`, per-selection weights through the same `extra_loras` channel all three families already use, every trigger word injected) and a **✨ Enhance prompt** button that runs on the local Ollama client — in scope by the Divergence-1b principle, since it is `vision_ollama.generate_text_ollama`, not a provider; **Klein edits stop carrying a detail LoRA at 0.8** on four lanes that never asked for one (`klein.edit_base_lora_strength`, default 0.0); **canvas per-run strips in epoch order** plus each character lane's reference face; and **a verified install is no longer re-offered the Setup wizard** (`backend/app/setup_state.py` + a background re-probe). **The catch, and it merged with zero conflict markers because the file is BRAND NEW**: `setup_state.py`'s `TRACKED` tuple opens with `engines.nanobanana` / `engines.chatgpt` / `engines.openrouter` and `_RECOMMENDED_ENGINES` names all three — a fresh D1 surface that no re-delete list could have predicted and no conflict would have flagged. Stripped, and **deliberately NOT replaced with `engines.klein`/`engines.krea`**: upstream's three are durable (an API key stays valid while nothing is running), whereas Klein/Krea readiness follows ComfyUI being REACHABLE, so tracking them would report "ComfyUI is not running" as a REGRESSION — the exact nag the feature exists to remove, and upstream's own `test_comfyui_or_ollama_merely_stopped_is_not_a_regression` is what proved it (it fails against the klein-tracking version). `comfyui.dir_valid` is the durable half of that question and stays. **Rejected**: `a539370b`'s first half — the 80 GB GPU picker's `HF_CLOUD_TOKEN` banner, `CustomBasePushSection` and the whole `CloudLaunchDialog` arrived as ONE conflict hunk against an empty HEAD side (D4, fourth consecutive sync), together with its two What's-new entries; its second half (`_set_soft` on the cloud monitor's progress heartbeat) is dormant backend and was taken. Upstream's three new `trainingMode.test.js` cases pin that dialog and were **INVERTED to assert its absence** rather than deleted, per the documented pattern. **One real merge interaction, resolved as keep-BOTH rather than either/or**: upstream replaced `image_bank_service`'s row-by-row insert with a chunked CORE insert (`_insert_bank_images`, 141 → 35 µs/file) while this fork carries `_register_bank` (the split's `root_only` bank) and the db-lock fix that commits instead of flushing. Taking upstream's `create_bank` verbatim would have reintroduced that lock bug in a worse form — its `db.session.flush()` opens the write transaction and the new code then runs up to 200 000 `os.path.getsize` syscalls inside it. The fork's structure keeps the commit, and `_insert_bank_images` builds its whole row list BEFORE the first insert statement, so the size walk holds no lock at all; `refresh_bank` took upstream's side whole, where the same ordering already holds. `routes/__init__.py` was a one-line keep-both (`setup_state` + the fork's `cluster`). **Two fork tests went red, both fairly**, and the first is the more interesting: `test_creating_a_bank_saves_as_it_walks` asserted mid-walk DURABILITY (≥500 rows committed 560 files in) as a proxy for "the write lock is not held across the walk". Upstream's chunked insert commits NOTHING mid-walk and holds the lock for none of it, so the proxy went false while the property it stood for got STRONGER. Rewritten to measure the property itself — a second connection takes `BEGIN IMMEDIATE` at the probe point — which is also what "database is locked" means to the rest of the app; verified to fail with the real `database is locked` when `_register_bank`'s commit is put back to a flush. `test_a_singleton_left_by_delete_rejected_is_not_badged` wanted a 200 from a route that is now 202 (the delete is a bank job; `bank_jobs` runs it inline under TESTING, so the body is still complete). Gates: lint clean; build clean; local-only contract **8/8**; `create_app()` OK; frontend **2092 → 2138/2138**; backend **4587 → 4642 passed, 14 skipped, 0 failed**, run from the repo ROOT as CI does. |
| 2026-08-01 | *(merge)* + dist | **Upstream sync — 53 commits, and the biggest single reversal of a first-pass judgement this fork has made.** Adopted: the whole **GPU Docker stack** (~25 commits — `Dockerfile.gpu`, `docker-compose.gpu.yml`, `start-docker-gpu.bat`, `packaging/docker/{studio_launch.sh,healthcheck.py,seed_comfy_config.py}`, `backend/port_utils.py`), which ships ComfyUI INSIDE the container and so makes local generation work with nothing on the host — it still cannot train, and the README now says so rather than letting the capability table's "Available in Docker GPU mode" line argue with an Option 3 that called Docker curation-only; **Canvas** checkpoint-timeline playback, grid export, advanced filters and pin-batch concatenation; the **exact full-state training resume** (`aitoolkit_state_bridge`, `training_state_bundle`, `training_state_identity`, `backend/app/training_bridge/**`); a bank **promotion dHash cache**; and a CI torch-test job. **The reversal**: `f55ae7ab` "compare reference edits across engines" reads as a pure D1 rejection — the engines it compares are chatgpt/openrouter/klein/krea, and it rewrites four files D1c says this fork MAINTAINS (~1 300 added lines). Counting the lines that are actually provider-lane said otherwise: **5 of 421** in `reference_edit_jobs.py` (`claim_api_dispatch` + its `_api_dispatch_claimed` flag), **4 of 489** in `face_dataset_service.py`, **1 of 174** in `ReferenceEditModal.jsx`, and **zero** in `routes/datasets.py`, `referenceEdit.js` and `useDataset.js`. The batch/compare restructure is engine-agnostic; the cloud fan-out is a skin. Adopted whole and the lane excised — `reference_edit_jobs.py` now contains the string `api` **zero** times — so the fork keeps klein-vs-krea compare instead of diverging forever on a file upstream is actively rewriting. **Rejected**: `afd5656b` (a help link onto a rental price cap) and the **HF_CLOUD_TOKEN trio** (`1c4f99f8`/`2ff63352`/`f895e756`) — that token was the one thing the plan expected to SPLIT into a local write-token half and a cloud half, and it does not split: `1c4f99f8` touches `cloud_training.py` and `test_cloud_full_transformer.py`, and the token's stated job is reading `krea/Krea-2-Raw` for a rented run. **Five catches, and greps found none of them.** (1) `_all_ref_bytes` arrived CALLED and defined NOWHERE — upstream's new code invoking a helper this fork deleted, a `NameError` on every reference edit. Defined locally rather than importing upstream's, because upstream's is an EGRESS sanitiser that downscales to 2048 px for a base64 request; taking it verbatim would have silently degraded the reference of every local Klein edit, which is the opposite of the divergence's point. (2) `<FullArtifactStatus>` rendered at two sites with its definition inside a rejected hunk (diagnostic 18, from the other direction) — surface removed, not panel restored. (3) `cloudActiveHere` and then a whole `HF_CLOUD_TOKEN` notice, both auto-merged OUTSIDE every conflict region; the second was found only because a contract test was INVERTED to assert absence, which is the argument for inverting them rather than deleting them. (4) `test_cloud_full_transformer.py` merged with zero conflict markers and was caught by `test_no_personal_data` on a bearer token — the rejected-feature TEST FILE as carrier, third sync running. (5) An em-dash reached `requirements-dev.txt` from taking upstream's comment (CLAUDE.md rule 8). **One judgement call**: upstream added a LoRA / Full-model radio whose own tooltip says "cloud-only", against a `/train` that answers `full_transformer` with a 400 here — a control that could only ever fail. Radio removed, backend plumbing left dormant (which D4 permits), and the refusal reworded off "choose Cloud training" to name the real reason. Seven upstream tests were re-pointed rather than deleted, so a sync that reintroduces any of these surfaces fails here. Gates: lint clean; build clean; local-only contract **8/8 + 3/3**; `create_app()` OK; privacy/ASCII 7 passed; frontend **1973 → 2067/2067**. |
| 2026-07-31 | *(merge)* + dist | **Upstream sync — 1 commit, and the one real catch had ZERO conflict markers.** Adopted `827def6a release: v2026.07.31 presets and GPU recovery` whole: **five source-linked community training presets** (Krea 2 Raw character, fast LoKr, compact style, a 16 GB concept setup, Z-Image Turbo character, with switching family/kind/variant no longer leaving hidden settings active and Conv checkpoints refusing an incompatible continuation up front), and **a named generation-cancel recovery taxonomy** — `cancel_job` becomes `cancel_job_outcome` returning `cancelled`/`terminal`/`missing`/`retry`/`restart_required`/`barrier_corrupt`, `cancel_pending` returns a recovery dict instead of `(cancelled, unconfirmed)`, and a new `confirm-comfyui-restart` route clears an unknown submission only after a human-confirmed restart. **Adopted rather than defended**, even though it supersedes fork-authored work (`853be775`'s `unconfirmed` count): upstream's version is strictly better and fixes the same CLASS of bug this fork spent the day on — it KEEPS the card when ComfyUI ownership cannot be proven, because dropping it orphaned the durable global recovery barrier and left every GPU action reporting busy with nothing recoverable left. That is the enforcement end of exactly what Divergence 6a's `_recover_stuck_jobs` fix addressed at the installation end. **Divergence 6's collision, second appearance, and benign this time**: the sole `job_queue.py` conflict was the fork-only `_publish_remote_comfy_job` sitting immediately above the method upstream rewrote — a keep-BOTH, resolved per hunk. `local_rows_only` survives at all 8 sites; upstream added no new jobs-table query. **The catch, and it is the whole reason diagnostic 2 exists**: `services/global_stop.py` is FORK-ONLY, so upstream could not update it and nothing conflicted — it kept unpacking `c, u = cancel_pending(...)` against the new 5-key dict and would have raised `too many values to unpack (expected 2)` on the first press of ⏹ Stop everything with anything in flight. **The suite stayed green because every existing `test_global_stop.py` case stubs `_datasets_with_pending` to `[]`**, so `cancel_pending` was never actually reached from there. Its user-facing wording was a second, quieter bug: it promised *"their rows are gone either way"*, which upstream's fix makes false — in the one module whose stated purpose is never claiming an unproven success. Both fixed, and two tests added that drive the real call (verified to fail against the pre-merge unpack with that exact ValueError). `face_dataset_service.py` took upstream's side on all 5 hunks **per hunk, never `--theirs`** — 244 fork-only lines live outside them. `whatsNew.js` kept both sides, upstream's on top. One fork test retired on purpose (`test_cancel_pending_reports_renders_comfyui_never_confirmed_stopping`) because it pins semantics upstream deliberately replaced. **Zero rejected-feature lines added** (grep over merge-ADDED lines only); `API_ENGINES` still `()`. Gates: lint clean; build clean; local-only contract **8/8 against the rebuilt dist**; `app.create_app()` OK; frontend **1961 → 1962/1962**; backend **4219 → 4235 passed (+16), 1 → 1 failed** — the same documented environment failure (Ollama holds the 8B vision model resident for the live server's keep-warm lease, confirmed against `/api/ps`, so the local-Ollama fence correctly refuses; identical by name and cause to the pre-sync baseline). |
| 2026-07-31 | *(merge + this wave)* + dist | **The write-lock holder, found and fixed — and the merge that made a fourth bug reachable.** Landed `claude/db-lock-investigation` (its own row below) and then fixed the root cause it had deliberately handed off. **Causation confirmed from this machine's own log before a line was changed**: `vision GPU window renewal failed` ×17 at exactly **22 s** apart, then `sqlite write lock unavailable on POST /api/cluster/peer/heartbeat` ×20 at exactly **20 s** apart — 15 s `busy_timeout` + `peer_worker.POLL_ERROR_SECONDS` 5 s. That arithmetic is also the answer to "nothing ran for an hour": `peer_worker._tick` calls `raise_for_status()`, so a 503 heartbeat does not delay the peer, it sets `_connected = False` and makes it **skip that tick's job pull**. **The mechanism**: `extensions.py` is a bare `SQLAlchemy()`, so `expire_on_commit` and `autoflush` are both on — commit expires every loaded row → the generator's next lazy pull reads `bank.source_path`/`row.relpath` → refresh SELECT → **autoflush turns that read into a flush, which opens the write transaction** → and `vision_pool` refills before it yields, so the transaction is held across the next 25 Ollama calls (~20 s measured). Every value written was correct throughout, which is why no test caught it in three attempts. **Fixed by plain tuples + staged writes**: no ORM row means no refresh SELECT means no autoflush, and results are applied as one bulk UPDATE inside `write_with_retry` — plain data being precisely what makes the retry correct, since a rollback discards everything staged and wrapping the OLD shape would have silently thrown away 25 answers already paid for in Ollama time. `_abs_under` (which existed, with a docstring prescribing exactly this, and which neither loop had adopted) resolves the bank folder once instead of per row. Four more holders fixed the same way: `_register_bank` (flush→commit, the twin of `refresh_bank`'s own documented fix, with the non-obvious trap that reading `bank.id` after the commit re-SELECTs and **reopens** the transaction), `_scan_job`, `_bank_promote_job`, `_watermark_crop_job`. `cluster.py`'s seven write surfaces now retry — `complete_cluster_job` keeps `_finish_comfy_bridge` OUTSIDE the unit (a replay would double-dispatch) and `pull_next_job` is deliberately TWO units (`if not updated: return None` is a real early exit). **Divergence 6a gained two sites the merge itself created** — see there. **Shipped as opt-in: `utils/dbtrace.py`** (`LDS_DB_TRACE` / `diagnostics.db_trace_seconds`, plus `LDS_SQLITE_BUSY_TIMEOUT_MS`), because "database is locked" is only ever raised on the VICTIM and this class has now been diagnosed from scratch three times in one file. It reads the raw `sqlite3.in_transaction` flag rather than SQLAlchemy's `begin` event — pysqlite defers the real BEGIN until a DML statement, so the engine event fires for read-only work and would report a lock nobody holds. It reported the unfixed pass immediately, and **corrected the plan's own guess**: the statement NAMED is the autoflushed UPDATE of the previous batch, not the refresh SELECT that triggered it. **Test discipline, and one failure worth recording**: the first counter test asserted that the success-only gate held the write lock, and it **passed against the old counter too** — once results are staged as plain data the counter no longer affects lock duration at all. Rewritten to assert what the counter actually costs (durability: a pass killed mid-run losing every stamp), checked mid-pass from a second connection because the final flush hides the difference. That wrong version is kept in the test's docstring rather than deleted quietly. All seven new backend tests verified to FAIL against the unfixed code; two deliberately are NOT stopwatches, because at any size a test can build, 50 000 syscalls' worth of hold cannot be reproduced and a timing assertion would have passed both ways. Also fixed two diagnostic lines that cost an hour of the investigation: `klein_model=no` beside `klein=yes` (a NAME scan vs the RESOLVER — not a contradiction, and the raw flag no longer prints), and `krea.base_model` warning on every resolution while never saying the user's pin was not in effect. Gates: lint clean; frontend **1958 → 1961/1961**; backend **4209 → 4219 passed (+10), 1 → 1 failed**, that one being the documented environment failure (`test_detect_head_bbox_falls_back_to_none_when_ollama_unreachable` — a local Ollama model held outside LDS by the live server on this box), identical by name and cause to the post-merge baseline taken before a line of this wave was written. |
| 2026-07-31 | *(this wave)* + dist | **Two machines really do work at once, and a busy database no longer strands the GPU.** Two independent reports, one root shape: work that was queued and never ran. **(a) A remote ComfyUI backend froze this machine.** `process_one`'s admission check, `has_comfyui_work` and `vision_keepalive.gpu_is_contended` each asked *is the GPU busy?* without filtering on `worker_id`, while `backend_worker` writes `processing`/`sent_to_comfy` into the same shared table — so a remote render blocked the local worker (up to the 15 min poll timeout), blocked a **training launch**, and made the local vision model unload for a card nobody wanted. The correct predicate already existed ten lines below the first one, on the claim query; the busy check never got it. All three now share `job_queue.local_rows_only()`, so *is a local job running?* and *which job may I claim?* cannot drift apart again — that divergence WAS the bug. `README.md:292/:912` had been selling this behaviour since the backends shipped, so the fix makes a published promise true rather than adding one. Peers were never affected (their rows stay `pending` locally). **(b) A contended SQLite writer stranded the GPU reservation.** Owner diagnostic: `sqlite3.OperationalError: database is locked` out of `_set_system_state`, repeated `sqlite write lock unavailable` 503s, and a queue that did nothing for an hour. The vision window's heartbeat wrote the TTL re-arm with a bare commit and **gave up on the first collision**, leaving the in-process fence set and every job refused for the rest of the pass. The renewal now goes through `write_with_retry`, and the beat tolerates `_HEARTBEAT_MAX_MISSES` transient failures — but still stops on the FIRST genuine ownership loss, which is the only terminal case. The two were previously one log line and are now told apart, so the next stuck reservation says which it was. **The engine, found on the SECOND report**: `_get_system_state` DELETED and committed whenever it read an EXPIRED row -- a read that writes. With one SQLite writer, a contended delete fails, the row stays expired, and every polling reader retries it on its next tick (the 1 Hz queue worker, the UI's gpu-flags poll, the peer heartbeat path, `vision_keepalive`) -- so a brief collision sustained itself indefinitely. Measured: 21 delete attempts across 21 reads against a contended writer, now 1. An expired row is logically ABSENT, so the read answers `default` regardless; the cleanup is housekeeping and now backs off per key on a LOCK error (a benign `StaleDataError` race does NOT back off -- the row is already gone, which was the goal). **Considered and REVERTED**: `GET /api/banks` re-walks every bank folder with `force=True`, and a `db_busy` 503 is replayed by the SPA -- but the replay is capped at 2 retries with 400/800 ms backoff (`fetchClient.js`), so the amplification is a bounded 3 requests over ~1.2 s, not a loop. Throttling it broke `test_image_bank_refresh.py::test_bank_list_ignores_the_cooldown`, which deliberately asserts that navigating to the list shows files dropped seconds ago -- a product decision, not an oversight. The third diagnostic showed no `/api/banks` 503 at all. Reverted rather than shipped with the contract test rewritten to match: **the fix was a mis-diagnosis, and the test was right.** **Every fix is paired with a mirror test** proving the guard still fires — a local row still blocks, a real ownership loss still stops the beat, a genuine navigation still walks — and all five new tests were verified to FAIL against the unfixed code before being kept. Deliberately deferred and written down in Divergence 6a rather than silently half-fixed: `_recover_stuck_jobs` routes remote rows through local-ComfyUI recovery machinery, and the stalled barrier is a single global slot. Gates: lint clean; frontend 1946/1946; local-only contract 8/8; the eight suites over every touched module 131/131 (+ the 66-failure Linux environment floor, unchanged). |
| 2026-07-30 | *(merge)* + dist | **Upstream sync — 4 commits, and Divergence 6's predicted collision finally arrived, in the one shape the notes said it would: with ZERO conflict markers.** Adopted: **a durable ComfyUI recovery barrier** (a stalled prompt now refuses new ComfyUI work with a named, actionable 409 instead of piling rows behind a dead worker, and `_comfyui_recovery_target()` names the exact paused Studio cell rather than saying "recovery required" about an unspecified machine); **a per-dataset Ollama caption model bound across EVERY Concept inference pass** — previously only the main caption/refine honoured the override while blocklist expansion and omission rewrites silently loaded the global model; **Krea zero-strength controls run first and emit no loader node** (returning to a tested-LoRA-free graph after Krea began loading the tested LoRA was a real ordering bug); a Windows `ConnectTimeout`-vs-`ReadTimeout` split so a missing loopback listener is no longer read as an occupied port; and **`release.yml` diffing notes from the last PUBLISHED release rather than the nearest tag** — verified adoptable because this fork's `releaseNotes.mjs` already accepts `--prev`. **Divergence 6, first live hit.** Upstream's `require_comfyui_enqueue_ready()` describes THIS machine's ComfyUI, and this fork can aim a job at a peer or an `api:` backend running its own. In `add_job` the check was scoped to the local branch (and the GPU arbiter deliberately NOT taken on the remote ones — it serializes local consumers, and the peer path would hold it across `_publish_remote_comfy_job`'s artifact FILE COPIES for nothing). The dangerous one was **`dataset_generate`, which auto-merged clean**: upstream gates on `any(generator in svc.LOCAL_ENGINES ...)`, the **D1b trap** — `API_ENGINES` is empty here, so that test is always true and cannot distinguish a local run from a remote one. Left as merged, a stuck ComfyUI on the Primary would have refused every batch bound for a healthy rented GPU, with a 409 clearable only by fixing a machine the user was not using. Re-gated on `not remote_device`, beside the Klein/Krea preflights that already skip for peers; upstream's other five new gates were kept verbatim, since none of those lanes takes a `device_id`. **Divergence 1** cost exactly one file: `test_generate_multi_engine.py`, absent here and never listed under "Deleted files" — upstream ADDING a `{'generator': 'chatgpt'}` case to it is what turned a silent absence into a visible modify/delete conflict. Re-deleted and now listed. **Zero rejected-feature lines were ADDED anywhere by this merge** (diagnostic-2 sweep over merge-added lines only, not the fork's own historical hits). Seven upstream test files conflicted and all seven were resolved **per hunk to upstream's side, not with `--theirs`** — `test_captioning.py` also carries fork-authored `_FakePopen.wait` semantics OUTSIDE its conflict region that a whole-file take would have destroyed. Upstream had independently **converged** on the fork's position in three of them (the `_queue_lock, GPU_ARBITER_LOCK` pair, `unload_vision_model() is True`, dropping `face_score`/`face_state` from the mirror's stable set), so those carried patches are retired rather than re-applied; the merge did leave `test_image_mirror.py` asserting the same thing twice, deduped by hand. **The regression test was verified to BITE** — removing the `not remote` scoping makes the peer enqueue raise the real `ComfyUIRecoveryRequired`, so it is not green for the wrong reason. Gates: lint clean; build clean; local-only contract **8/8 against the rebuilt dist**; backend guard 3/3; `app.create_app()` OK; frontend **1946 → 1958/1958**; backend, run from the repo ROOT exactly as CI does, **4162 → 4198 passed (+36), 5 → 2 failed — 3 FIXED, ZERO new.** The three that went green are `test_studio_service.py`'s `test_create_run_commits_rows_before_enqueue`, `test_create_comparison_run_commits_rows_before_enqueue` and `test_comparison_run_failure_keeps_previous_cells_and_marks_the_failed_one` — they were red on the pre-merge baseline and are repaired by upstream's own `_persist_and_enqueue_cell` restructure, which is the rare case of a sync ARRIVING with the fix for a failure the fork was already carrying. The 2 survivors are the documented environment pair (`test_prefill_falls_back_to_telea_when_lama_absent`, no OpenCV here; `test_detect_head_bbox_falls_back_to_none_when_ollama_unreachable`), both red on the baseline too. |
| 2026-07-29 | *(this wave)* | **A red CI test that was not a red feature, a dead column, and a history rewrite that moved every SHA below it.** Three things, one session, no upstream interaction — `git fetch upstream` reported 123 incoming commits and a second fetch showed the ref had simply been stale: the window was already merged (the v2026.07.29 row below), fork **139 ahead / 0 behind**, nothing to sync. (1) **CI red on `test_display_and_copy_readers_are_pinned_to_the_resolver`, and the JOIN it guards was fine.** Promotion still reads through `resolved_image_path`; the row loop had moved out of `_promote_job`'s `run` closure into `_promote_rows`, now shared with the promote-into-a-new-bank job, so an AST contract that walked only the closure reported a break that did not exist. `calls()` gained an **opt-in, one-level** follow into module-level helpers. Both limits are load-bearing and were measured, not guessed: `ensure_thumb` reads the resolver DIRECTLY and at one level of following picks up an unrelated helper's legitimate `abs_image_path`, so following there would turn its `abs_image_path not in thumb` into a rubber stamp; two levels does the same to promotion. Verified the tripwire still BITES by rebinding `_promote_rows` back to `abs_image_path` — fails again, on both assertions. The suite's other failure (`test_prefill_falls_back_to_telea_when_lama_absent`) is the documented pre-existing one: OpenCV is absent here and CI installs it via `requirements-dev.txt`, so CI never reaches it. (2) **`fail_kind` deleted at all seven sites** — see the new bullet under Divergence 1. It was inert rather than dangerous (always NULL, no deleted symbol referenced, no branch that could invert), which is why it survived the sync that rejected the feature around it; what condemned it is that `dataset_payload` published `fail_kind: null` on every image row, promising a classification a local-only fork cannot produce. (3) **Every AI-attribution trailer removed from the fork's own history**, owner's call: 35 trailer lines across 23 commits (12 Opus 5 with a `Claude-Session:` URL, 6 Fable 5, 5 Sonnet 5), plus **6 commits authored AND committed under the AI vendor's own identity** rather than this fork's — the exact "a fresh clone inherits whatever global identity is there" failure CLAUDE.md warns about, and the same six the 2026-07-27 row already records as wrong-authored. Rewritten with `commit-tree` per CLAUDE.md, never `rebase`: **133 commits rebuilt**, because a commit names its parent by hash, so the oldest offender drags every descendant with it even though only 29 changed content. Verified after: same 1256 commits, same 34 merges, `git diff` old..new **empty**, and `upstream/main` still an ancestor — the ancestry the rebase ban exists to protect. **The 48 SSH signatures in that range are gone**: a signature cannot survive a message change, and the key that made them is not on the machine that did the rewrite, so they were dropped rather than forged or re-made under a different key. **The knock-on nobody would have noticed until it mattered: 29 of this table's own SHA citations became unreachable from `origin/main`** — resolvable in the local clone via the backup tag and reflog, dangling in a fresh one. All 34 cited SHAs were re-pointed by pairing old and new history in topological order and refusing unless every pair matched on **both** tree and subject (139/139 did). If a future sync finds a hash here that does not resolve, this is why, and pairing by tree+subject against a pre-rewrite clone is how to recover it. |
| 2026-07-29 | *(this wave)* + dist | **A cancelled pass could strand the GPU reservation for 30 minutes — and the app had no way to show you.** Owner-reported with screenshots, on a phone at a LAN address: a bank pass was cancelled, and every launch afterwards was refused with *"a vision/GPU pass is already running"* while nothing was running. **This is a genuine race, not the wedge Feature 5 was built for**, and the previous row's recovery would only have survived it. `gpu_exclusive_vision_window` keeps a heartbeat re-arming the flag's TTL for as long as the window is open (so a long legitimate pass cannot have the card pulled out from under it), and the close ordered itself against that heartbeat with `heartbeat.join(timeout=5)` plus a comment asserting beats are two fast local DB ops. That holds until SQLite's single write lock is contended — which this app hits often enough to carry `write_with_retry` and a `db_busy` error shape. On a timed-out join: the beat passes its stop-check and reads the flag as still ours → the close clears it → the beat's write lands, re-arming with a fresh 1800 s TTL, then exits. A reservation no process holds and no heartbeat will refresh, for the full TTL: **the reported half hour exactly.** The beat's check-and-rearm and the close's check-and-clear are now ONE mutually-exclusive critical section; the join stays as tidy-up with nothing correctness-critical resting on it. **The regression test took three attempts to become honest, and the first two are the lesson**: v1 passed against the unfixed code because the beat interval is `max(floor, flag_ttl/3)` and no beat was ever in flight at close; v2 passed because shrinking the TTL to force a beat let the flag self-expire before the assertion, so it was green for the wrong reason. v3 parks the beat inside its WRITE, by thread name, for longer than the hardcoded 5 s join — and is verified to FAIL without the fix (`assert 'f3c9…' is None`). A race test that passes both ways is worse than no test, and two of the three would have shipped as exactly that. **The second half of the same report** — *"verbose logging so I can see if it's stuck or not having to switch between pages"* — is `services/activity_log.py` + `GET /api/system/activity` + the 📋 header panel: a bounded in-memory ring plus a live snapshot whose `stale_seconds` per running job is the ONLY thing that separates slow from stuck (a bar frozen at 34 % and one about to move are drawn identically). Sources hook in from `bank_jobs` (start/stop/fail/finish) and `gpu_window` (taken/released) — the window unloads ComfyUI and blocks training and previously did all of it with **no visible trace anywhere**, which is most of why a stranded flag was baffling. Three rules: recording is best-effort and swallowed whole (visibility must never break the work it describes), events APPEND via an id cursor rather than redrawing (a full redraw every 2 s loses the scroll position mid-read), and nothing is persisted (a log of jobs that did not survive the restart would be a lie). **Also caught in this pass**: two What's-new entries were dated `2026-07-30` against a real clock of `2026-07-29` — ids are permanent handles keyed to the seen-marker, so they were corrected BEFORE the push rather than after, and the ordering hit taken rather than a date invented to win a sort. Gates: lint clean; build clean; local-only contract 8/8; `app.create_app()` OK; frontend **1871 → 1886/1886**; the seven suites over every touched module **76/76**. |
| 2026-07-29 | *(merge)* + dist | **Upstream sync — 4 commits, and the D1 replay arrived as a 476-line test file with zero conflict markers.** Adopted: **deploying a LoRA follows `extra_model_paths.yaml`** (Geekswordsman, GitHub #25 — reads were already plural, writes were not; new `write_root('loras')`, and the Settings folder-overrides preview follows the same resolution so the panel that promises to name the folder cannot diverge from it again); **training bases follow the yaml too** (`_sdxl_base_path` returned a BARE NAME that ai-toolkit then resolved against its own working directory and died on, about a path the user never typed; `zimage_convert._resolve_merge` looked in two folders; new `ci_resolve`/`resolve_model_file` walk ComfyUI's own root priority so a duplicated file name resolves to the weights ComfyUI would really load — 19 new tests); and **every Klein lane names the model it runs** (reference edit, small-scrape rescue, watermark inpaint all passed `klein_model=None`; the two lanes that hold a dataset now inherit its pick, a named-but-missing model is refused BY NAME instead of swapped for a neighbour, and the bank keeps automatic resolution on purpose because it has no dataset to inherit from). `Flux2KleinModelPicker.jsx` deleted upstream — the only surviving reference is upstream's own guard test asserting it is gone, which is diagnostic 18 answered before it could bite. **The rejection**: `f2c515e` rebuilt the ChatGPT/OpenRouter failure taxonomy. Four modify/delete conflicts re-deleted (`chatgpt_image.py`, `openrouter.py`, `test_engine_model_choice.py`, `test_openrouter_engine.py`) — and **`test_chatgpt_refusal.py` (476 lines) merged with ZERO conflict markers**, found by grepping for orphaned imports of the files just re-deleted rather than by any conflict prompt. Exactly last sync's `test_nanobanana_refusal.py` shape, one window later: **the D1 test file is now the recurring carrier, not the source file.** `settings-reference.md` had 2 conflicts and needed per-HUNK resolution — one was upstream re-offering the whole Gemini/SynthID/OpenRouter/ChatGPT-subscription/multi-engine-batch documentation against the fork's D2 pinned-model bullets (rejected, second sync running), the other the legitimate per-lane Klein text (adopted); the yaml paragraphs upstream added to the same file auto-merged outside both. `whatsNew.js` was prepend-vs-prepend, kept BOTH with upstream's on top minus its ChatGPT entry. `ReferenceEditModal.jsx`'s single conflict was two adjacent imports — a **keep-BOTH**, not either/or: taking one side would have dropped `DEFAULT_ENGINE` (used twice) or `KleinModelSetting` (rendered at :239). **Gate 1 earned its keep for the fourth time this session**: the whatsNew splice dropped one entry's `to:` and closing brace, and ESLint's parse error was the only thing that saw it — the bundler had not been run yet and no test imports that file's syntax. `API_ENGINES` is still `()` with no membership branches; grep for merge-ADDED lines matching the rejected terms returns **zero**. Gates: lint clean; build clean; local-only contract **8/8 against the rebuilt dist**; `app.create_app()` OK; frontend **1859 -> 1871/1871**; the merge's three new backend suites plus the fork's two local-only guards **62/62**; full backend suite run on a pre-merge WORKTREE and on the merged tree, **3685 -> 3726 passed (+41)**, 68 -> 68 failed with the failure set **identical by name** (`diff` of the sorted FAILED lines is empty). Worth recording how that baseline was nearly botched: the first attempt started before the merge and finished executing against post-merge files — a run that collects from one tree and executes against another is not a baseline, and its numbers were discarded rather than reported. |
| 2026-07-29 | *(this wave)* + dist | **Seven fork-only bank/system features, in one wave — all fork-authored, no upstream interaction.** Two were live defects the owner reported. (1) **✨ Score "gets stuck" on a borrowed CUDA interpreter, and everything after says "GPU busy".** One bug, two halves. Pointing `bank_scoring.python` at ComfyUI's Python flips `_resolve_score_device()` to `('cuda', True)`, so Score starts taking `gpu_exclusive_vision_window` — correct, and never mentioned by a picker that sold it purely on speed. The permanence was worse than the plan assumed: `_drive_infer_subprocess` sat in a blocking `proc.stdout.read()`, and the window's TTL **cannot** rescue that because gpu_window's heartbeat re-arms the TTL for as long as the window is open — so a wedged-but-alive child held `vision_in_progress` until the app was restarted, not for 30 minutes. Fixed with a stall watchdog (15 min of complete SILENCE, not of no-progress: killing a pass that logs while getting nowhere would be guessing) raising `InferStalled` from outside `with window`, plus the cost stated on every CUDA row of the picker and standing on the bank panel while it is in force. (2) **⏹ Stop everything + a stale-flag clear**, reachable from the refusal itself and rendered ONLY when the server has checked and found nothing behind the flag. It reports per target and refuses to round up — an unreachable ComfyUI is `unconfirmed`, and a training stop that cannot be verified is a failure whose flag is HELD, which is the same principle `_wait_pid_dead` and the unconfirmed generation cancel already encode. (3) **"Copy diagnostic report"** put the build and the copy in one `try`, so every non-localhost origin — i.e. every LAN address this app is opened on — reported a build failure for a report that had built perfectly, then threw the text away. Split, plus a focused pre-selected textarea and a new `utils/copyText.js`. Then five requested features: (4) `forget_missing` — the ACCEPT half of the deliberately-additive folder walk, rows only, refused while the folder is unreachable (where every row looks missing and an eager forget would delete the whole bank); (5) `exclude` on the subfolder split, pruned at depth 0 inside `os.walk`, whose sharpest edge is the empty-buckets FALLBACK: `create_bank(parent)` recurses and would re-import exactly what was excluded, so with exclusions it is the loose bank or an explicit refusal; (6) **queue-all** — `enqueue_many` sanitizing steps BEFORE enqueuing anything (a half-queued 400 is the worst outcome available), plus `pipelineVerdict` on the bank CARD, because a night where every GPU pass was skipped for "GPU busy" was indistinguishable from a clean one, and skipped-for-a-prerequisite is deliberately NOT flagged; (7) **banks that share a name become one card** — grouping by name instead of merging, because `source_path` is a single non-nullable column and hardlinking was already rejected upstream, so the literal ask would change the most load-bearing rule in the service. The rule is implemented TWICE (`bank_groups.py` / `bankGroups.js`) pinned to one shared table of cases; publishing it on the row would break the list's in-place rename patch. New: `keep_separate` (additive, NULL = groups normally), `bank_groups.member_ids` as the SERVER authority for the group queue and promote, and `_promote_rows` extracted so single and group promotion cannot drift on the resolved path / caption / framing / `promoted_dataset_id`. **The ESLint gate earned its place again** — a `bg-surface-raised/60` opacity modifier on a baked-alpha token was caught by `theme-token-contract`, and the group-promote dialog was caught missing by `no-undef` on `setPromotingGroup`. Two test-fixture lessons worth carrying: flat-colour PIL fills are perceptual DUPLICATES of each other (a promote test asserting 3 got 1), and patching `bank_jobs.running` to hold a queue drain SPINS FOREVER under TESTING — `_freeze_worker` (patch `_process_next`) is the idiom. Gates: lint clean; build clean; `node --test` **1756 -> 1859**; `app.create_app()` OK; backend full suite diffed against the pre-wave baseline. |
| 2026-07-29 | *(this wave)* + dist | **Divergence 3 RETIRED — the emoji come back, because stripping them was breaking the UI.** Owner report: *"on the UI for Datasets, download buttons are blank squares, and when trying to delete or X on images the buttons are malformed skinny rectangles"*. Both were accurate, and the cause was this fork's own oldest divergence. **The mistaken premise was calling the emoji decorative.** This app uses them AS the control — a button whose entire child is `🗑` becomes `<button …></button>` once stripped: a bordered box with nothing in it, which renders as a thin rectangle and reads as broken. The strip's own rule (*"never leave an empty control behind: a glyph that was the button's whole label is REPLACED"*) existed precisely because this kept happening, and it was applied BY HAND, per merged hunk, across four years of upstream waves. It missed some every single time: **three empty `<button>` elements were live in the shipped UI** (preset delete, open dataset folder, seed reroll) plus a dozen invisible `<span aria-hidden></span>` badges — and two of those three were introduced by syncs earlier in this same session, by the agent applying the rule. **Restored ~1 200 lines across 149 files**: every line whose ONLY difference from upstream was removed non-ASCII symbols now matches upstream exactly. Fork-authored lines upstream does not have were left alone, so a few fork-only strings stay emoji-free — drift now, not policy. **Two traps hit during the restore, both recorded in the divergence section.** (1) `unicodedata.category('`') == 'Sk'`, so a naive "strip symbol characters" rule collapsed an upstream `  }\`` to `  }`, matched a real `  }` in `App.jsx` and wrote a stray backtick into it — **ESLint caught the parse error; nothing else would have**, which is the third time this session that gate has earned its place. Restricted to non-ASCII. (2) A glyph owns exactly ONE following space unconditionally; skipping it only when the previous char was not a space left a double space that matched nothing, silently missing 597 restorations. The tell is a suspiciously small hit count — the same signature as merge diagnostic 12. Also updated: the sync SKILL (its D3 section now says do not strip), the merge routine (the re-strip step is gone), and diagnostics 12/14 marked HISTORICAL rather than deleted — they are the record of what the strip cost, and 12's classifier is still how you answer "did this merge add this line?". One fork test re-pointed (`StopButtonWording.test.js` pinned a glyph-free `'Stop'`; the button reads `'⏹ Stop'` again). Gates: lint clean; build clean; local-only contract **8/8** — worth stating because the restore re-added `☁` glyphs and the contract proves no forbidden rental/cloud SENTENCE came with them; `app.create_app()` OK; backend guard 3/3; frontend **1756/1756**; backend **3605 passed / 67 failing — byte-identical to before the restore, zero new, zero fixed**. Invisible controls in `frontend/src`: **0**. |
| 2026-07-29 | *(merge)* + dist | **Upstream sync — v2026.07.29, and the biggest Divergence-1 window since the fork began** (17 commits. Adopted: **the training base and variant are remembered per FAMILY** (new `train_family_bases` column — one shared column had a Z-Image merge name attached to a Krea 2 run, advertised in the summary line and offered for upload); **a memory saver turned off elsewhere no longer follows you onto a 12B in silence** (warning, not a per-family memory — `quantize=false` is a statement about the CARD) with `timestep_type` remembered per family instead; **the lightbox gives its actions the side space a portrait photo cannot use** (one geometric inequality, hysteresis so the bar never moves under the pointer); **ComfyUI gets its staged input copies back** — 3 896 orphans / 0.67 GB measured on a three-month install, cleaned per job and swept at boot behind three independent fences; **choose the Klein model improve runs on**, one setting on the dataset rather than two dropdowns; and **a refused save no longer throws away what you typed** across four dialogs. **The rejection**: upstream `81c98a2` rebuilt Nano Banana's refusal reporting, and it arrived on EVERY surface at once. Three modify/delete conflicts re-deleted (`engine_errors.py`, `nanobanana.py`, `test_engine_model_choice.py`); `test_nanobanana_refusal.py` (478 lines) and `generationOutcome.js`/`.test.js` merged with ZERO conflict markers and were deleted; the `DatasetWorkspace` refusal notice, the `VariationCatalog` Gemini/SynthID paragraph, the `nanobanana-filter-and-synthid` help topic, the README block, the settings-reference API model fields and the whole *What the Gemini engine will and will not do* section, and the What's-new entry announcing it — all rejected. **`fail_kind` is KEPT** (additive column, serialized, reset on regenerate): nothing writes `'refused'` here any more, but the column is honest row schema and diverging `models.py` to drop it would buy nothing. **Two catches, and the second is the one that mattered.** First, deleting `generationOutcome.js` left its `import` plus two `const` lines in `DatasetWorkspace.jsx`, all auto-merged OUTSIDE the conflict region — **new diagnostic 18**, diagnostic 6's class arriving from the other direction. Second, `face_dataset_service.py` LOOKED like a two-conflict file because `awk` printed only the first region; it had **four**, and the two unseen ones were the entire API regenerate lane and the API fan-out (~340 lines, `api_generate` / `EngineRefused` / `chatgpt_image` imports) in a file where HEAD carried **zero** such references. The resolver's `assert n == 2` fired and nothing was written — **new diagnostic 17**: count the markers with `grep -n`, then assert that number, because a conflict you did not know about is resolved by whichever branch your lambda happens to take. The **D1b trap recurred** in the same file (`img.klein_model not in API_ENGINES`, always-true on an empty tuple); the fork's `LEGACY_API_ENGINE_TAGS` test was kept and upstream's genuinely new `dataset_klein_model(ds)` fallback adopted into it. **Keep-BOTH resolutions**: `LaunchAllDialog` took upstream's busy/error machinery AND kept the fork's Add-to-queue (upstream inlines the body; the fork's `config()` feeds both); `BankWorkspace`'s fork side turned out to be a SUPERSEDED duplicate post — upstream's restructured `startPipeline` had already auto-merged above it — so taking `--ours` there would have posted twice. Two tests updated rather than deleted: the fork's own `queue-split-ui.test.js` pinned the pre-refactor synchronous `launch`, and upstream's new `lightboxActionPlacement.test.js` pins `✨ Upscale & improve` where this fork's button reads `Upscale & improve` (D3). Divergence 3: 14 merge-added lines across 9 files (🚀×7, `U+FE0F`×4, 🔄×3, 🖥, 🗑); the diagnostic-14 third pass flagged one line, a false positive. Gates: lint clean; build clean; local-only contract **8/8 against the rebuilt dist**; backend guard 3/3; `app.create_app()` OK; frontend **1682 -> 1756/1756**; backend **3543 -> 3605 passed (+62)**, 61 -> 67 failing. All 6 additions are in upstream's two NEW suites, fail identically on a clean `upstream/main` worktree here, and assert **Windows path semantics**: `'sub\\model.safetensors'` is not a separator on POSIX and `os.path.isabs('C:\\weights\\krea.safetensors')` is False, so the production code — which is correctly OS-aware — does not raise. **Deliberately NOT patched**, unlike the previous sync's Divergence-5 entry: that was a fixture writing one layout, this would mean changing production path handling to satisfy a Linux test run, which is upstream's call. CI's backend job is `windows-latest`. |
| 2026-07-28 | *(merge)* + dist | **Upstream sync — late evening** (22 commits: **edit a watermark mask by hand in a bank and have the clean use it** (Qeeyana, Reddit — the real defect was the cleaning levels routing on `watermark_bbox` only, so an edited mask was ignored); **"Upscale & improve" quotes the instruction it is about to send** and warns on an Anime dataset, plus the Klein model may live in far more places than Setup ever said (two more Reddit reports, both discoverability rather than behaviour); **choose the import resolution** (`dataset_import.max_side`/`encoding`, default unchanged) and **caption elsewhere and come back** — the re-import used to drop every image as a perceptual duplicate; **an ML capability install that does not work no longer reports success** (1Tomber #24 — three stacked defects, the worst being that pip's "already satisfied" was read as "the feature loads"); **a refused Continue no longer throws away what you picked** — the dialog stays open and the refusal lands next to the inputs that caused it; **a bank can no longer be created on a dataset's folder** and delete its images (`path_guard`, enforced at every door that sets `source_path`); **masked training became a dataset setting** instead of a browser preference, so the readiness badge can finally warn that a dataset set to masked will train unmasked; and a pod still booting is no longer read as stuck). **Divergence 4**: `launchCloud` + the GPU-speed dialog rejected for the THIRD consecutive sync; `registry.js`'s Training entry kept cloud-free (upstream re-describes it as "Default model family and cloud GPU guardrails" and adds `vast`/`budget`/`offer filter` keywords); the masked-training doc bullet reworded off "the **paid** run trains unmasked". Upstream deliberately kept the two new boot timeouts JSON-only, so no rental card arrived with them. **Divergence 1**: `settings-reference.md` re-offered the two API-engine identity-prompt rows (`face_single`/`face_multi`) inside the hunk carrying the legitimate expanded `klein_improve` text — resolved per hunk, rows dropped, the fork's "not surfaced here" note preserved. **Caught before Gate 3 by the Phase-4 sweep**: `continueOutcome.test.js` shipped a sample refusal hint reading `add a vast.ai API key` — in `frontend/src`, which the local-only contract scans, so it would have gone red; the fixture tests "hint is appended to error", which any refusal exercises, so it was reworded rather than budget-bumped. **Two conflicts were keep-BOTH, not either/or**: `conftest.py` (the fork's `makereport` `os.name` hookwrapper — diagnostic 7's whole subject — plus upstream's new `--basetemp` collision guard) and `BankPage.jsx`, where upstream's conflict side introduced a SECOND "Create bank" button carrying the new dataset-folder guard; the fork already has a splitMode-aware one, so the guard was applied to the existing button instead of duplicating it. **The correction this sync owes, and the one it does NOT.** Upstream `b742f18` says four backend tests "were reported failing intermittently by four different agents this week and all four were filed as flake. None of them is one", and `768df6b` says two agents read a 620 s suite as the CAUSE of failures when it was 83 tests really calling huggingface.co — this fork's sessions are among those agents, and both are fixed here. But `09f7c8f`'s capabilities-probe-cache fix, which looked like it would explain the four `test_local_retry` 409s the previous row attributed to a Windows venv fixture, **does not**: the failure set post-merge is byte-identical (0 fixed, 0 new). **Proved by experiment rather than argued**: adding `venv/bin/python` beside upstream's `venv/Scripts/python.exe` in `_configure_aitoolkit` takes that file from 12 passed/5 failed to **17 passed**. The previous diagnosis was right, so the fixture is now carried as **Divergence 5's first live entry** — inert on Windows, five fewer permanently-red tests on Linux. Divergence 3: 56 merge-added lines across 23 files (🗑×16, 🗃×11, 🚩×11, 🧽×10, 📦×6, 🎭×3, 📥, 📂, 📁); the diagnostic-14 third pass flagged two lines, both false positives (`() => {` and a docstring bullet), and no empty control was created. Gates: lint clean; build clean; local-only contract **8/8 against the rebuilt dist**; backend guard 3/3; `app.create_app()` OK; frontend **1600 -> 1682/1682**; backend **3432 -> 3538 passed (+106)** with the failure set **IDENTICAL** (66 -> 66, zero new, zero lost) before the Divergence-5 fixture patch, which then takes it to **61**. |
| 2026-07-28 | *(merge)* + dist | **Upstream sync — evening wave** (16 commits, release v2026.07.28.9: **Continue training straight from a checkpoint on the Canvas** — the greyed "go find the run on another page" line becomes the app's ONE ContinueDialog, opened on the exact save clicked; **drop one pinned image onto another to fuse them into a strip** (membership, not a container — each picture keeps its own row, geometry and actions); **download a generated image, or a whole gallery as a ZIP**, the lineage carried in the FILE NAME because there is no sidecar; a notification raised over a dialog is no longer drawn behind it (toast z-[10000], pinned by a contract test); **Retry asks instead of doing nothing** — the route now forwards all five confirmation flags and `postJson`'s silent 400 is spoken (1Tomber, #23); the Discord announcement generated from What's-new instead of written from memory; and the first-step watchdog no longer kills a pod that is downloading normally). **Divergence 4, the biggest single rejection this fork has made in one hunk**: upstream moved the whole rental control panel into Settings → Training — `VastKeyGuide` (a ≈2-minute "how to get a vast.ai API key" walkthrough), `VAST_SECRET`, `CloudOfferFilter` and `CloudTrainingCard` with its eleven knobs and live "Spent this month" line. Rejected whole; the orphan check that follows it found none (`ResetToDefault`/`defaultValueAt` survive because concept face masking legitimately uses them, `useState`/`useEffect`/`SecretField` left with the card). With it: 13 `helpRegistry` topics anchored on that card's DOM ids, 10 `settingDefaults` reset rows, the `### Cloud GPU (vast.ai)` + `### Cloud training` doc sections (**second sync running**), and the paid-cloud-run What's-new entry — **which the previous sync had already dropped**: upstream still carries it, so the merge re-offered it, which is the recurrence pattern diagnostic 2 describes, on a whatsNew entry rather than on code. **The catch of this sync is new merge diagnostic 16**: upstream's new Canvas Continue host derives its cloud lane from `runsHubContinueLanes`'s `configured` flag (is a rental key present) while this fork's D4 switch is `caps.cloud_training`, forced off in `CapabilitiesContext` and honoured by `TrainingPanel`'s copy of the very same dialog. Nothing failed and nothing conflicted — the board would simply have become the ONE surface offering an open rental lane, disagreeing with the dataset's own dialog about why an option is unavailable. Gated at the HOST, not in the shared util, so the util keeps upstream's shape. **And the local-only contract earned its keep in a way it never had before (new diagnostic 15)**: the dist half went red on `vast.ai API key` while the src half passed, because the string was in a merge-added GUIDE paragraph — `docs/guide/**.md` is compiled into `frontend/dist` by vite. Rebuilding does not fix it and re-grepping `frontend/src` finds nothing; it has to be traced out of the bundle. The paragraph it found was not a stray phrase either: it promised "both lanes for both kinds of run" and a checkpoint "finished on a rented GPU", neither true here — rewritten to describe what this fork actually does. **A correction to the previous row.** That sync classified the two `test_bank_busy_refusal` failures as environment and left them, on the grounds that they reproduced on clean `upstream/main`. Upstream's `c92467b` says what that actually was: *"This is what failed the v2026.07.28.9 release: CI has no Ollama, so the two 409-shape assertions got a 503. Two agents had already met it locally and both filed it as a load-sensitive flake — it was neither load-sensitive nor a flake"*. It was a real ordering bug (Ollama probed before the occupancy check) and it is fixed in this window — diagnostic 13 catching this fork a second time, and the reason the four new failures below were traced to a CAUSE rather than to a classification. Divergence 3: 39 merge-added lines across 20 files (🖼×42, 🔍×6, `U+FE0F`×5, 🎁, 🧹, 💻, 🙏, 📌); `canvasNodeChrome`'s comments and test names realigned to the fork's `⛶` (upstream's cluster is `🔍+⬇+✕`, this fork's is `⛶+⬇+✕`), and **the prose hole the previous sync left in `CanvasImageNode.jsx` is repaired** — "with the immediately beside it" was a stripped 🔍 that had been the sentence's noun, which is the case diagnostic 14 exists for and which its own author then failed to close. Gates: lint clean; build clean; local-only contract **8/8 against the rebuilt dist** (after the guide fix) and the backend guard 3/3; `app.create_app()` OK; frontend **1506 -> 1600/1600**. Backend under CI's environment: **3383 -> 3432 passed (+49)**, 64 -> 66 failing = **2 FIXED** (the bank-busy pair above) and **4 new**, all in upstream's new `test_local_retry.py` guard tests and all traced to one cause: `_configure_aitoolkit` builds a **Windows** venv (`venv/Scripts/python.exe`) while `config.aitoolkit_derived_python` branches on `os.name` and looks for `venv/bin/python` on POSIX, so the launch refuses with `ai-toolkit is not configured`. They fail identically on a clean `upstream/main` worktree here and pass on CI, whose backend job is `windows-latest`. |
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (68 commits, releases v2026.07.28.6/.7/.8 plus post-release work: **scrape the web straight into a bank** — the scraper gains a second destination, and a bank stores what it downloaded instead of applying training-grade gates before you can judge; **one step back on a bulk decision** (`bank_undo`, depth one, status dimension only); **every filter threshold tunable from the Bank** with a live count of what a candidate value would catch; **a balanced pick that covers your framings** instead of the top of one ranking; **curation answers in ~2 s instead of ~32** on a 9 500-image pool; rotate 90/180/270 in the dataset and the bank; a crop that stops re-compressing and never enlarges; pin a whole run's images onto the Canvas at once, with node controls a finger can actually hit; **a slow ComfyUI is no longer reported as a stopped one**; **model names spelled the way the target ComfyUI spells them** — which is what made generation work on Linux and across WSL/Docker at all (1Tomber, #21); the Z-Image VAE/text-encoder resolver; a pre-launch interpreter guard that names the Python that cannot import torch; **dual captions no longer crash a Krea 2 or Anima run** (1Tomber, #22); an offline banner + background-marked polls; and `requirements-dev.txt` — CI now installs the declared test environment rather than `requirements.txt`). **Divergence 4 was the whole judgement of this sync, and it came in five places at once**: upstream's `launchCloud` + GPU-speed dialog in `TrainingPanel.jsx` (rejected — the fork has no rented-GPU launch); `PreflightModal`'s "this run is billed per hour on a rented GPU" variant (removed rather than left present-and-unreachable, since nothing here can set `report.lane`); troubleshooting.md's new **A cloud run seems stuck** chapter; settings-reference.md re-offering `### Cloud GPU (vast.ai)` + `### Cloud training` (deleted again — the fork documents those keys under Config-file-only settings); and a What's-new entry selling a fix to `cloud_training.py`. **What was NOT rejected, and must not be next time**: the download byte counter (`downloadProgress.js` + `TrainingProgress.jsx`) reads a LOCAL run's base-weight download too — it is shared plumbing, not rental UI — and the `?lane=` preflight filter is kept because ▶ Continue shares the lane concept; both were reworded off their pod/vast.ai framing rather than deleted. **Divergence 1**: `capabilities.py` arrived with `probe_gemini` / `probe_openai` / `probe_openrouter` interleaved in ONE hunk with `_object_info_timeout` and `comfyui_down_message` — diagnostic 4 exactly; the three probes dropped, the two ComfyUI helpers kept (they are what the new slow-vs-stopped message needs). Upstream's only `EnginesSection.jsx` change in the window was inside `ChatgptSubscriptionCard`, so that file took the fork side wholesale. **The real merge-interaction work was `image_bank_service.py`**: upstream wrapped three bulk mutators in a `bank_undo.Snapshot`, while this fork wraps the same three in `write_with_retry` (Divergence-free, but the fork's own dbbusy feature). Taken together, not either/or — the snapshot is now built INSIDE `_apply` and published only after the write commits, because `write_with_retry` REPLAYS its callable after a rollback and a snapshot assembled outside it can describe a transaction that never landed. **An upstream contract test found a real gap in the fork's OWN code**: `bankThresholds.test.js` bans an unlabelled occupied-bank 409, and the fork's `/bank/<id>/queue` route (a fork-only feature upstream never had) answered `BankAlreadyQueued` with a bare `{'error': ...}` — so the UI could not reword it. It now carries `busy_kind: None`: occupied, but not by a running pass. **Three upstream tests re-pointed** at this fork's real surface rather than deleted (the documented pattern): `preflightLane.test.js` asserted `launchCloud` exists and that the modal names the cloud lane — both inverted to assert their ABSENCE, so a sync that reintroduced the button fails here; and `offline-quiet-polling-contract.test.mjs` required a `background: true` poll in `EnginesSection.jsx`, where the only poll upstream has is the ChatGPT-subscription OAuth one this fork removed. Divergence 3: **161 merge-added lines stripped across 50 files** (📌×29, `U+FE0F`×27, 📐×15, 🎚×13, 🗑×12, 🎨×11, 🔍×11, 🔄, 🚀, 🕸, 🔎, 👥, 🗃, 📡, 🌫, 🚩, 🕷, 🟢), and **six empty controls repaired** — the strip left `<span aria-hidden></span>` as the entire content of the run-gallery tile's pin button (replaced with `◉`, never deleted: the bank-badge lesson, fourth time), plus five decorative spans dropped outright and `BankThresholdsPanel`'s group marker guarded so a stripped group renders no empty badge. `CanvasImageNode`'s full-screen button kept the fork's `⛶` over upstream's `🔍` while taking upstream's larger hit target, and the prose sentence that pointed AT that glyph was rewritten rather than left with a hole in it. **New merge diagnostic 14**, earned twice this sync. Gates: ESLint v10.8.0 present and clean; build clean; local-only contract **8/8 against the rebuilt dist** and the backend guard 3/3; `app.create_app()` OK; frontend **1317 -> 1506/1506**. Backend, measured under CI's own environment (`requirements-dev.txt` installed, run from the repo root): **3130 -> 3383 passed (+253, exactly the new upstream suites), 51 -> 64 failing**. All 13 additions are Windows path-separator assertions belonging to upstream's new separator feature, and every one of them **fails identically on a clean `upstream/main` worktree in this same container** — and **CI's backend job runs on `windows-latest`** (`ci.yml`), which is why this Linux container carries a 51-failure floor the fork's CI never sees. NOT verifiable here: no Windows runner, so the Windows-side result of those 13 is upstream's to own. Zero fork tests regressed and no file lost a pass. |
| 2026-07-28 | *(merge)* | **Upstream sync — the sync that DELETES a divergence** (2 commits, backend tests only, no product code, no dist): upstream fixed the `test_face_mask_preview_progress.py` app-context bug this fork had been carrying as **Divergence 5**, so the carried hunk was dropped whole and upstream's rewrite taken verbatim (each test pushes its own context; `_dataset` returns an ID, not a detached ORM instance — Flask-SQLAlchemy removes the session when the context pops). Divergence 5 is now EMPTY, and the section says so rather than being deleted, since the situation recurs. **The interesting part is WHY upstream shipped it red and this fork did not**: `pytest-flask` is not in their `requirements.txt` — all CI installs — but pip drags it onto dev machines, where its autouse `_push_request_context` silently wraps every test taking an `app` fixture. Their suite was green locally and 9-red in CI for two days. The plugin is absent on this machine, so local == CI here and the failure reproduced on the first run — which is how the fork found and fixed it within hours of the feature landing (and, per diagnostic 13, only after CI called out the sync that first waved it through). Adopted their `backend/pytest.ini` (`addopts = -p no:flask`), which forces the CI condition on every machine; it has to be `addopts` because by conftest-import time the entry-point plugins' fixtures are already parsed (upstream tried `set_blocked()` and `unregister()` — both left the suite passing for the wrong reason). It makes `backend/` the pytest rootdir under CI's `python -m pytest backend/tests -q`; verified harmless here and on upstream's own green run, and a no-op on this machine where the plugin was never installed. One conflict, resolved `--theirs` wholesale — the fork's side was only its own now-superseded fixture. No frontend file changed, so **no dist rebuild and no `build(frontend):` commit** (routine step 8 is conditional on `frontend/**`, and rebuilding to confirm nothing changed is what diagnostic 1 warns against). Gates: `app.create_app()` OK; local-only contract 8/8 and lint clean (unchanged frontend, run anyway — they are seconds); backend **3180 -> 3180 passed**, same single pre-existing `test_prefill_falls_back_to_telea_when_lama_absent`, same skip, run from the repo root exactly as CI does. |
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (7 commits, release v2026.07.28.5: **find bank images by describing them** — a Find by text panel in the Curate row ranks the current filter by CLIP similarity to a phrase, reusing the Score embeddings and encoding ONLY the phrase, in-process, CPU-forced, warm-worker + on-disk query cache + idle reaper (`bank_scoring.text_search_idle_minutes`); and **Setup stops certifying a model file that cannot be loaded** — install rows gain a third state (`⚠ On disk, unreadable`), download-again now REPLACES a blocking-invalid file instead of no-opping "already present", and Setup reads the SAME `localEngineReadiness()` verdict the Generate page gates on, so the two screens can no longer name different causes for one gap — reported by zigzag4794 on Discord). Both features verified local-only before adopting: the CLIP text tower was already resident for Score, no network, no key. **One rejected-feature deletion**: upstream's `imageStep()` — the cloud "Image generation" Setup step listing Nano Banana / ChatGPT / OpenRouter — surfaced as the upstream SIDE of the `useSetupSteps.js` conflict (git aligned it against the fork's Klein-constants block, which upstream moved to the new `utils/kleinAssets.js`); both sides deleted — the constants now come from the leaf module, the cloud step never enters, `SETUP_STEP_IDS` stays four-step. Plus one dead upstream-ism: a new capabilities test cleared `OPENAI_API_KEY` before probing (gates their ChatGPT probe; nothing here reads it) — line dropped. **Divergence 1 recurred in the DOCS again, and PRE-EXISTING this time**: `troubleshooting.md`'s ComfyUI-folders section (merged with the nofaceman wave) still promised "the API engines (Gemini, ChatGPT, OpenRouter)" keep working without shared folders — a factual error on this fork, corrected while the file was open for the merge (D1 is non-negotiable; the D3 leave-drift-alone rule is about cosmetics, not about docs promising engines that do not exist). Eight conflicts (two dist, per policy fork's pre-merge dist kept and rebuilt from src): `conftest.py` kept the fork's both-anecdotes vision-lease docstring and appended upstream's new text-search-cache paragraph + `clip_text_encoder` import; `helpRegistry.js` and `whatsNew.js` were adjacent/prepend inserts (kept both; upstream's setup entry on top of the fork's same-day ref-edit entry); `localEngineReason.test.js` took upstream's side (the ZIGZAG payload fixture) with the fork's legacy-tag-answers-null test surviving below; `troubleshooting.md` was insert-vs-insert — upstream's greyed-out-Klein cause table re-attached to the section it continues, fork's own sections kept after it. **Diagnostic 12 struck TWICE more, in a new form**: `git diff --stat <range> -- ':(exclude)frontend/dist'` and pathspec'd `git diff <range> -- <file>` both silently dropped every BACKEND file from the recon — "an all-frontend window" was false (the window's biggest file is `clip_text_encoder.py`, 419 lines). The tell was commit messages describing backend work the stat did not list; recon was redone from ONE no-pathspec diff, which is now the only trustworthy form in this Git Bash. Divergence 3: 17 added lines stripped (a 13-line `🔤` family plus `🎨 🎯 🗃️` singles and the `⚠️`-variation form → `⚠`); `✨ ✓ ⚠ ↻ ▸ ✦ ⇒` kept per the glyph list; the `<span aria-hidden>🔤</span>` next to the result summary was REMOVED outright rather than left as an empty span (bank-badge lesson — nothing to see means no control, and this one was decorative). Gates: ESLint ran and is clean; build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; frontend 1286 -> **1317/1317**; backend 3152 -> **3180 passed** (+28, exactly the new upstream suites) with the SAME single pre-existing failure (`test_prefill_falls_back_to_telea_when_lama_absent`) and the same skip — baseline recorded BEFORE the fetch on this Windows machine, both runs from the repo root, CI's invocation. Divergence 5's carried `_app_context` fixture survived the merge untouched. |
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (16 commits: the face-mask preview names the stage it is on and survives leaving the panel — it is a server-side job now, rejoined on mount instead of abandoned and restarted; **Mask faces installs its own detector** from where it is ticked, and a run launched with it on but InsightFace absent no longer trains unmasked in silence — the pre-launch report says so (completes shivdbz2010's GitHub issue #15); delete a run AND everything it produced, as an explicit `?cascade=1` opt-in that keeps children, deployed LoRAs and rated-good images; generated images pin onto the LoRA Canvas as movable, resizable nodes that remember their geometry; a rebuilt full-screen image record publishing ten columns that were persisted and never shown; deployment state on every checkpoint pill's left edge; and **Pick diverse stops leading with the outliers** — pure farthest-point sampling is mathematically the criterion that selects ISOLATED points, so a kNN-density guard now discounts the lone meme without ever rewarding the centre). **The cleanest window in this fork's history: ZERO rejected-feature lines.** The sweep found no added line mentioning a cloud engine or GPU rental anywhere in `backend/` or `frontend/src` — the first sync where Divergence 1 required literally nothing. Eight conflicts. `image_bank_service.py`/`bank.py` took the typicality guard whole; `lora_training.py` took upstream's new face-mask preflight check and kept the fork's emoji-free verdict comment; `whatsNew.js` was prepend-vs-prepend (kept both, the fork's 07-28 entry staying on top because it is genuinely the newer one — the "upstream on top" rule is about ordering by date, not by side). **`ConceptFaceMaskField.jsx` was the one live trap**: upstream renames the button's `busy` to `running`, and the fork's side of the conflict still said `busy` — keeping it would have been the SEVENTH bare-identifier `ReferenceError` of this fork's history, in a file whose other hunk legitimately swaps a dead-end warning for `FaceDetectionInstallPrompt`. **Divergence 4 recurred in the DOCS, where no gate can see it** (diagnostic 4, new surface): `settings-reference.md` re-offered `### Cloud GPU (vast.ai)` + `### Cloud training` immediately below upstream's new, legitimate "face detection is optional" paragraph — paragraph kept, both sections re-deleted; the fork already documents the same `cloud.*` keys under Config-file-only settings, which is the honest place for a dormant backend with no card. Divergence 3: 55 added lines across 22 files (📌 🗑 🖼 👍 🎨 🔍 🔌 👁 and the `⚠️` variation-selector form), applied to merge-ADDED lines only. Two resisted the mechanical strip and were done by hand: a docstring where the glyph WAS the noun ("the SAME function the gallery's 🗑 uses" → "the gallery's own Delete"), and `CanvasImageNode`'s open-full-screen button whose entire label was `🔍` — replaced with `⛶`, the glyph this fork already uses for full-screen, not deleted into an empty control (the bank-badge lesson, third time it has come up). D3 also gained its measured scope and its keep/strip glyph list, so the next sync does not re-derive them. **New merge diagnostic 12**, from two tooling traps that made the strip script report "nothing to do" on real additions: `git diff <rev> -- <path>` returns EMPTY in this Git Bash for paths that plainly differ (`--numstat` with no pathspec reports `336 175` for the same file), and most of `backend/` is CRLF in the working tree where git's diff output is LF, so every added backend line failed an exact string compare. Both fail silently as a small hit count; verify the classifier against a file the merge created outright. Gates: ESLint v10.8.0 confirmed present and clean (diagnostic 11); build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; frontend 1231 -> **1286/1286**. Backend 3107 -> **3143 passed** (+36) with **10 failed** against the baseline's 1 — the 9 additions are ALL upstream's brand-new `test_face_mask_preview_progress.py`, and they fail **identically on a clean `upstream/main` worktree in this same environment**: `conftest.app` yields the application without pushing an app context and that file calls `svc.create_dataset` on it directly, so it is upstream's own test bug, not merge damage. **Judged "not merge damage, therefore not mine to fix" and left — which was wrong, and CI said so within the hour** (the backend job is `python -m pytest backend/tests -q`; a red suite is red whoever wrote it). Fixed in the follow-up below and recorded as **Divergence 5**, the fork's first carried patch to an upstream TEST file. |
| 2026-07-28 | *(follow-up)* | **Fix: 9 red backend tests upstream shipped, that the sync knowingly let through** — `test_face_mask_preview_progress.py` needs an application context its ten tests never push, so nine of them died on `RuntimeError: Working outside of application context` before their first assertion. The sync verified the failures reproduce on a clean `upstream/main` worktree, correctly concluded "not merge damage", and then drew the wrong conclusion from it: **"upstream's bug" and "not this fork's problem" are different claims, and only the first one was true.** CI turned red on the very next push. Fixed with one autouse `_app_context` fixture rather than upstream's own idiom of a `with app.app_context():` per test, so every upstream test body stays byte-identical and the divergence is a single hunk to re-apply — or drop, when upstream fixes it their way. Backend suite now **3152 passed / 1 failed** (the sole pre-existing `test_prefill_falls_back_to_telea_when_lama_absent`, which CI does not hit because it installs numpy + opencv), from the repo root, which is the invocation CI actually uses. New **Divergence 5** section exists so the next sync checks these carried test patches survived the merge — losing one turns CI red with no product-code change to notice. |
| 2026-07-28 | *(this wave)* + dist | **Reference editing, adopted local-only — the fork's first ADOPTION of a feature it had previously rejected** (new **Divergence 1c**). Upstream `47508ab` rebuilt Edit-reference to run on Klein and Krea 2 Edit as a ComfyUI queue job: free, private, no key. That retires the only objection this fork ever had — the deleted-file note said it outright, "Klein deliberately excluded, ChatGPT/Nano Banana only" — so by the Divergence-1b principle the local half was always in scope. It was rejected hours earlier **in the sync itself**, on sequencing rather than policy (a ~1,400-line resurrection inside a merge being judged by diffing test counts against a baseline is how leftovers ship), then taken here on a clean, green base. Restored trimmed: `reference_edit_jobs.py` (imports no cloud module), `ReferenceEditModal.jsx`, `referenceEdit.js`, the three `/ref/edit` routes, the service section, the `is_reference_edit` dispatch branch in `job_queue`, the `edit_reference` activity kind, and the `editReference`/`keepEditedReference`/`discardEditedReference` trio in `useDataset.js` **including its slot in the returned object** — the exact hiding spot diagnostic 3 names, and the exact list whose absence would have been a bare-identifier `ReferenceError` had the previous sync shipped upstream's version of it. **Every API branch DELETED, not left dead** (the 1b trap): `start_reference_edit` loses its `if engine in LOCAL_ENGINES` lane split, `_edit_engine_call` and `_run_reference_edit` go entirely, and `editCostNote`/`editKeepNote` lose the paid halves — a price quoted on a free render damages trust as much as one hidden on a paid one. **`editable_engines()` is upstream's `LOCAL_ENGINES + API_ENGINES` verbatim and is local-only BY CONSTRUCTION**, the payoff for keeping `API_ENGINES` as an empty export; the new test asserts the OUTCOME rather than the expression, so a sync that ever refilled that tuple would fail here instead of quietly handing the fork a paid edit lane. **Two upstream defaults recomputed, not inherited** (diagnostic 10): `defaultEditEngine` falls back to a cloud id upstream-side, which would open the modal on an engine no route accepts — repointed at `DEFAULT_ENGINE`; and the unknown-engine `EDIT_REF_SUPPORT` default is `'primary_only'` here rather than upstream's `'all'`, which would have promised transient-upload support nothing implements. **The transient-upload picker is absent rather than present-and-ignored** — no local graph can take request-scoped bytes, so the picker, its state and `editReference`'s `files` argument are gone and the route refuses uploads loudly. **`invalidate_reference_edit` re-wired into `crop_reference`/`recrop_reference_auto`**; those hooks had left with the feature, and without them a pending Before/After survives a crop and compares against a reference that no longer exists (regression-tested). **An upstream bug was found and NOT copied**: upstream's `/ref/edit/keep` calls `logger.exception(...)` in a module that never defines `logger`, so its error path raises `NameError` inside the very `except` meant to return an honest 500. **Caught by the guards, not by review**: the local-only contract's identifier budget went red on a single cloud engine name in one of my own explanatory comments — reworded rather than budget-bumped, which is what that guard asks for. Divergence 3: the `✦` on the button and heading stripped (the button reads `Edit` — real text, not an empty control); `⚠ → ✕` kept as glyphs this fork already carries. Also **merge diagnostic 11**: `frontend/node_modules` can exist while ESLint is absent from it, and `npm run lint` then fails with `'eslint' is not recognized` — non-zero, so not silent, but it reads as a broken toolchain rather than as "the tripwire for this fork's worst failure class never fired". It happened this session; CI is unaffected (`npm ci` runs first). Gates: lint clean; build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; frontend 1211 -> **1231/1231**; backend 3089 -> **3107 passed** (+18, exactly the new suite) with the SAME single pre-existing environment failure and the same skip. |
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (11 commits: Concept LoRAs can mask the FACES out of the training loss so they stop fighting your character LoRAs — reported by shivdbz2010, GitHub issue #15; a model ComfyUI cannot load now names itself before the job is queued instead of failing with "value not in list"; the resolvers never AUTO-pick an unloadable file — a `.gguf` dropped into a krea folder mid-session had the app choosing a model core ComfyUI cannot read, reported by naniii2352 on Discord; the checkpoint-gallery Select moved into the pinned bottom bar). **The judgement call this sync was upstream `47508ab`: reference editing became LOCAL** (Klein + Krea 2 Edit, a ComfyUI queue job, free) — which retires the ONLY objection this fork ever had to it, since the deleted-file note says in as many words "Klein deliberately excluded, ChatGPT/Nano Banana only". By the Divergence-1b principle the local half is genuinely IN SCOPE here. **Rejected anyway, on scheduling not policy** (owner decision): adopting it means resurrecting six deleted files plus the `/ref/edit` routes, the service section, the `editReference`/`keepEditedReference`/`discardEditedReference` trio rejected only last sync, the modal wiring and an activity kind, each trimmed of the API half it interleaves with — a feature wave, not something to bury in a merge that has to be diffed against a test baseline. Recorded as its own section under Divergence 1 (with the adoption checklist) so the next sync does not re-derive it. Re-deleted: the six conflicted ref-edit files plus TWO that merged with zero conflict markers (`test_ref_edit_local_engines.py`, `ReferenceEditModal.contract.test.js`). **Three clean-merge leftovers caught by the sweep, none flagged by git**: `job_queue._dispatch_completion` gained an `is_reference_edit` branch calling a `link_completed_reference_edit` that no longer exists (the backend's own bare-identifier class — an `AttributeError` on every local edit-shaped completion); `test_dataset_job_dispatch.py` gained a test `monkeypatch.setattr`-ing that same absent function; and `whatsNew.js` gained the entry ANNOUNCING the rejected feature, the documented hiding spot. **A real bare-identifier trap was defused in `TrainingSection.jsx`**: upstream's conflict hunk carried `VastKeyGuide` + `VAST_SECRET` + `CloudOfferFilter` + `CloudTrainingCard` (Divergence 4, rejected AGAIN) interleaved with the legitimate `ConceptFaceMaskCard` — but the file's IMPORT line auto-merged as the fork's, so keeping the concept card alone would have left `ResetToDefault` and `defaultValueAt` undefined and crashed Settings › Training on open. Resolved per hunk and both imports added (not `SecretField`/`useState`/`useEffect`, which only the cloud cards needed). `settingDefaults.test.js`: dropped upstream's seven `cloud.*` reset rows, KEPT the two `face_mask` ones — and **reversed last sync's note** that `TrainingSection.jsx` is deliberately absent from the "reads the shared lookup" list, because concept masking just gave it its first non-cloud resets (diagnostic 10: a fork invariant that MOVED). **`utils/localEngineReason.js` was adopted even though it arrived in the ref-edit commit** — it is not ref-edit plumbing but the extraction of Klein's four-cause availability answer out of `VariationCatalog.jsx`, whose GENERATION panel is its caller here; its ref-edit comments were reworded and its API-engine test re-pointed at `LEGACY_API_ENGINE_TAGS`. Upstream's `chore(release)` dist was reverted unmerged and rebuilt from fork src; `.gitattributes` `-merge` again turned `dist/index.html` into an explicit conflict rather than a silent content merge. Divergence 3: stripped 📌 🗑 👁 👍 and the `⚠️` variation-selector form from the merge's ADDED lines only (`ConceptFaceMaskField.jsx`, `CheckpointGalleryPanel.jsx`, `gallerySelection.js`/`.test.js`, `lineagePanelsResponsive.test.js`, one What's-new blurb); the gallery Select toggle's `✓`/`☑` pair was dropped rather than replaced, since the button's own Select/Done label and `aria-pressed` already carry the state — no invisible-badge repeat. `→ ▸ ⚠ ✕` kept (glyphs this fork already carries), `README.md` deliberately not stripped. Gates: lint clean; build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; backend guard 3/3; frontend 1189 -> **1211/1211**; backend 3060 -> **3089 passed with the SAME single pre-existing failure** (`test_prefill_falls_back_to_telea_when_lama_absent`) and the same skip — baseline recorded before the fetch, one pass, on Windows (where only that one environment failure occurs, not the Linux container's 57). |
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (19 commits: re-run Upscale & improve from the SOURCE image with today's settings; judge an improvement side by side with its parent, at the same scale; click a run on the Canvas to see everything it made, by step (the checkpoint gallery grew a second scope); put any setting back to its default from the server's own value; a settings deep link that names one setting now lands on that setting; release notes generated from What's-new instead of shipped empty; README screenshots collapsed behind details) — **Divergence 1 work again, and again with no cloud-engine FILE touched**: the new reset-to-default feature enumerates the removed engines. Rejected: upstream's `ImageModelsCard` (three `ModelField`s for nanobanana/chatgpt/openrouter model slugs) and the ENTIRE `ChatgptSubscriptionCard` — device-code OAuth login, poll/import-codex/logout calls and `CHATGPT_AUTH_OPTIONS`, which FORK_NOTES already named as staying dropped — plus their renders and the `refreshCaps`/`toast` props that existed only for them. KEPT from the same hunks: `configDefaults`, because `ResetToDefault` is legitimate and is already wired to the Klein/Krea settings that survive here (verified live: changing Klein generation steps makes the button appear reading 'Reset to default: Generation steps, 5'). **The dangerous one was `useDataset.js`** — the documented hiding spot: upstream's returned object both DROPPED the fork's `renameDataset` and ADDED `editReference`/`keepEditedReference`/`discardEditedReference`, the rejected reference-edit-via-API trio whose backend this fork deleted. Undefined here, so shipping that list would have been a bare-identifier `ReferenceError` on every dataset page — the sixth instance of the class. Kept the fork's list, added only the legitimate `reimproveImage`. **Divergence 4**: upstream's `VastKeyGuide` (a 'how to get a vast.ai API key' walkthrough), the `Cloud GPU (vast.ai)` secret card and `CloudTrainingCard` all arrived in `TrainingSection.jsx`; rejected, and the four imports they alone needed (`useEffect`/`useState`/`SecretField`/`ResetToDefault`/`defaultValueAt`) reverted with them rather than left as unused leftovers. **Two new upstream contract tests pinned the rejected surface**: `settingDefaults.test.js` asserted `EnginesSection.jsx` offers resets for `chatgpt_auth`/`nanobanana_model`/`chatgpt_image_model`/`openrouter_model` (id anchors that do not exist here) and that `TrainingSection.jsx` covers seven `cloud.*` rental settings and imports the shared lookup — all re-pointed at this fork's real surface; `test_settings_api.py` asserted `config_defaults['engines']['nanobanana_model']`, a key this fork's `engines` section does not have, and probed secret-leakage with `OPENAI_API_KEY`, which is not in this fork's `SECRET_KEYS` and so proved nothing — re-pointed at `krea.base_model` and `HF_TOKEN`. Upstream's dist again carried ALL SIX forbidden strings and was deleted unmerged; `.gitattributes` `-merge` (added last wave) did its job — `dist/index.html` came through as an explicit conflict instead of auto-merging. Divergence 3: re-stripped `CheckpointGalleryPanel.jsx` (👍/👎 back to ✓/✗, 🗑/📝 dropped — the file the fork keeps emoji-free, stripped for the second sync running), `CaptioningSection.jsx` (🎨/👥/💔 and the four bank-flag glyphs), `DatasetGridItem.jsx`'s new re-run button (🔄✨ -> the fork's own ↻, NOT stripped to an empty button — the bank-badge lesson), `LineageCanvas.jsx`, `runGallery.js`, `improveRerun.js` and three test comments. Gates: lint clean (no bare-identifier leftover); build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; frontend 1088 -> **1189/1189**; backend 2953 -> **2975 pass with the SAME 57 failures and ZERO files changing their failure count** (one-pass baseline recorded before the fetch); all ten routes drive clean in a real browser and Settings shows no cloud engine. |
| 2026-07-27 | `4565bf1`..`1667124` (+ `cbe3848`, dist `62a3efa`, `1667124`) | **Sync hardening: turn what the 2026-07-27 merge caught BY HAND into gates** — that sync found four cloud-engine leftovers, a moved file that silently un-stripped itself, and two upstream tests pinning the rejected surface, all of it manually. Four guards now cover that ground. (1) **Cloud-engine identifier budgets**: the local-only contract only ever matched exact UI sentences ('Powers Nano Banana'), which is why a whole `PromptPreview` engine picker, an `API_ENGINES` branch, six API-key help topics and a backend `PREVIEW_ENGINES` tuple all merged green — none contains a forbidden phrase, and `backend/app` had no guard of any kind. Per-file budgets on the IDENTIFIERS now cover `frontend/src` (in the existing contract test) and `backend/app` (new `test_local_only_engines.py`); a budget rather than a ban because `LEGACY_API_ENGINE_TAGS` is load-bearing, so that test also asserts the tags still EXIST and `API_ENGINES` stays empty — the budget can never be satisfied by deleting the compatibility path. Both verified by replanting this sync's real leftovers. (2) **The backend suite runs in ONE pass again**: a global `monkeypatch.setattr(os, 'name', 'nt')` made pytest's own traceback formatter build a `WindowsPath` on Linux whenever a test failed in that window, aborting the session — which is why diagnostic 7 demanded 174 per-file subprocesses (~15 min) twice per sync. A `makereport` hookwrapper restores the real `os.name` while a report is built: 2950 passed / 57 failed, zero INTERNALERROR, and the failure set reconciles exactly with the old method (51 counted per-file + 6 in `test_capabilities.py` that the old method could not SEE). (3) **`frontend/dist/** -merge`** in `.gitattributes`: the served bundle is a tracked build artifact and the one path that reintroduces the cloud Setup UI with no source change to notice — it arrived carrying all six forbidden strings this sync. Git now never content-merges it. (4) **Docs**: CLAUDE.md's identity rule claimed the author was 'already set in this repo's local git config' — it is not part of a clone, and this session authored two commits as the wrong author before it was caught; it now gives the commands, says to fix the TOOL not the author line, and records that wrong-author commits are repaired with `commit-tree`, never `rebase` (a rebase across a sync rewrites the merged UPSTREAM commits). Merge diagnostics 9 (a `modify/delete` conflict usually means upstream MOVED a file and the fork's edits did not follow) and 10 (never read counts/defaults off upstream — recompute them) added. **Two real bugs found while measuring whether a fifth guard was worth building**: `activeExtraRefPromptKey` still fell back to upstream's `'nanobanana'` default, badging `face_multi` — an API-engine prompt this fork does not surface and no local generation reads — as 'used by your current engine' on any profile that had not yet opened the Generate panel, with the unit test PINNING that behaviour rather than catching it; and the bank tile's promoted badge was `badge('')`, an over-strip that rendered an INVISIBLE pill (restored to the `⬆` that same file's own '⬆ Promote…' button uses). **Deliberately NOT built: an emoji (Divergence 3) contract test.** Measured first: `frontend/src` already carries ~40 distinct pictographs across dozens of files, and 5 of the 7 glyphs this sync stripped (`⬆ 🗃 🖼 👍 👎`) still live elsewhere in the tree — so a character allowlist would catch 2 of 7 and a per-file baseline is brittle (the gallery panel changed paths mid-sync). D3 is applied per merged hunk historically, not enforced tree-wide; enforcing it is a deliberate ~40-glyph cleanup, not something to smuggle into a sync. Gates: lint clean, frontend 1088/1088, local-only contract 8/8 against the rebuilt dist, backend guards green, `app.create_app()` OK. |
| 2026-07-27 | *(merge)* + dist | **Upstream sync** (49 commits: Krea 2 Edit installs from the app, node pack included, and its dead download links now point somewhere real; memory-saving levers (`quantize`/`quantize_te`/`low_vram`) become optional per run with card-aware guidance instead of being hard-coded; the Hugging Face token finally reaches the LOCAL trainer; Stop stays responsive while a run is starting (the vision revoke moved OUT of `_queue_lock`); promote a bank shortlist into a NEW BANK, not only into a dataset; sort a bank or dataset grid by score / sharpness / face similarity; ComfyUI's unreachable input folder now explains itself instead of failing blind, and the beta57 pin is gone; delete images from a checkpoint gallery; deleting a run clears everything it left behind; the six prompt parts become editable with a live composed-prompt preview; a privacy suite that fails when personal data reappears in tracked files) — **Divergence 1 work, despite no cloud-engine FILE being touched in the window**: the plumbing arrived inside otherwise-legitimate features, which is diagnostic 2 exactly. Stripped: `settings/PromptPreview.jsx` (new file — its engine picker listed Nano Banana / ChatGPT / OpenRouter and branched on an `API_ENGINES` membership test to grey out four controls; trimmed to `klein`+`krea` and the branch DELETED per the Divergence-1b trap, not left dead), `face_variations.PREVIEW_ENGINES` / `_API_PREVIEW_ENGINES` (same treatment — which also restored `wrap_variation` to caller-free, its documented state, since upstream's preview had given the retained dead code its first caller), six API-key/model topics in `helpRegistry.js` (kept the four legitimate prompt-part topics from the same hunk — diagnostic 4, resolved per hunk), upstream's `ModelField` per-API-engine card in `EnginesSection.jsx` (zero call sites here; `overrideBadge` was the fork side of that same conflict and is used), and cloud names from two new What's-new blurbs plus three test fixtures. **Upstream's `build(frontend):` dist arrived and carried ALL SIX forbidden contract strings** (`Powers Nano Banana`, `Powers ChatGPT`, `Gemini API key`, `OpenAI API key`, `Train in cloud`, `vast.ai API key`) — deleted unmerged and rebuilt from this fork's src, the hard stop working as designed. **Two upstream contract tests pinned the rejected surface and went red**: `prompt-parts-contract.test.mjs` asserted `PromptPreview` still contains `API_ENGINES` (re-pointed to assert its ABSENCE — the honest fork contract), and `kreaInstall.test.js` asserted `rows.length >= 12` (this fork has 9). **Caught by the modify/delete conflict:** upstream MOVED `CheckpointGalleryPanel.jsx` from `canvas/` to `shared/`, and the fork's entire Divergence-3 strip lived on the old path — accepting the move would have silently restored 🖼/🗑/👍/👎; re-applied on the new path. Divergence 3 elsewhere: `PromoteDialog.jsx` (⬆/📁/🗃/💾), `BankWorkspace.jsx`'s promoted badge (the fork carried a bare `badge('')` here — an over-strip that rendered an INVISIBLE badge; upstream's ⬆ was KEPT, matching that same file's own "⬆ Promote…" button and toasts, since Divergence 3 keeps a glyph when removing it leaves nothing to see), `LineageCanvas.jsx`, `settings-reference.md` (⚙️/⚠️/⎘) and the two promote tabs in `using-the-app.md`; `🔎 Scan quality` and `🎭 Analyze faces` were LEFT because those glyphs really are on the fork's buttons. Divergence 4: nothing to do — the window added no rental/cloud-training string. Also: capability rows 8 -> 9 (Krea joined upstream's list; recomputed from `deriveCapabilitySummary`, not copied), both sides' `conftest.py` vision-lease docstrings merged into one keeping BOTH real failure anecdotes, both sides' new tests kept in `test_training_queue_atomic.py`, and `postcss` took upstream's 8.5.23 security bump while keeping the fork's ESLint tooling. Gates: lint (no-undef) clean — **no bare-identifier leftover this sync**, the first since the tripwire landed; build clean; local-only contract 6/6 against the rebuilt dist; `app.create_app()` OK; frontend 988 -> **1086/1086**; backend 2625 -> **2883 pass** across 13 new upstream test files (all green), failures 50 -> 51 — the one addition is upstream's own `test_vision_revoke_runs_outside_the_queue_lock`, which fails identically (`RuntimeError: ai-toolkit is not configured`) on a CLEAN `upstream/main` worktree in this container, so it is environment, not merge damage; every other file's failure count is unchanged and no file lost a pass (per-file baseline recorded BEFORE the fetch, diagnostic 7). Footnote on those absolute numbers: they come from the per-FILE method, which silently under-counted — `test_capabilities.py`'s reporter crashed, so its 6 failures were invisible on BOTH sides and excluded from both totals. After the one-pass fix landed (diagnostic 7) the true post-merge figure is **2950 passed / 57 failed**, and 51 + those 6 reconciles exactly to 57 with an identical set of failing files. The DELTA the sync was judged on is unaffected: the same method, with the same blind spot, ran on both sides. |
| 2026-07-27 | `1a5e19c`..`47a7611` (dist `5bf5d35`, `47a7611`) | **Fix wave: four workspace-crashing merge leftovers + a permanent lint tripwire** — the 2026-07-26 sync shipped four bare-identifier leftovers that merged with ZERO conflict markers, each a runtime `ReferenceError` taking a whole page down: `storage` (`VariationCatalog.jsx` — upstream defines the one-line localStorage helper near the top of the file; the resolution kept the fork's local-only header region without it, so EVERY dataset open/create crashed to the full-screen boundary — owner-reported as "create dataset errors" then "erroring non stop on any navigation", since the remembered `datasetCurrentId` re-opened the crashing workspace on every load); `actives`/`configured`/`limit` (`CloudRunsPage.jsx` — consumers of upstream's cloud-status poll survived Divergence 4's deletion of the poll itself; `actives` sits in a useMemo dep array, so the whole Runs page crashed on open; pinned to no-cloud values); missing `useState` import (`EnginesSection.jsx` — lost with the cloud-engine strip; Settings › Image engines crashed on open); `currentAvailable` (`VariationCatalog.jsx` Generate button — the fork's pre-multi-engine availability flag, undefined since Divergence 1b's multi-engine adoption, masked by `!selected.size` short-circuiting until a reference was set and shots ticked; rewired to `blockedReason`). **Root-cause guard**: `npm run lint` (ESLint `no-undef` ONLY — `frontend/eslint.config.js`), wired into CI, merge diagnostic 6, the merge routine step 5 and the CLAUDE.md shipping checklist; it statically catches this entire leftover class, which `npm run build` structurally cannot (bundlers resolve imports, not identifiers) and which the 2026-07-26 sync's grep sweep + full green test suites both missed (988/988 passed WITH the four landmines in-tree — a component that never mounts in a test never throws). Verified by driving the served app through every route headlessly, before and after. |
| 2026-07-26 | merge `1c23d7a` + dist `6f8ea75` | **Upstream sync** (7 commits: every training launch now freezes a full snapshot — caption text, image content hashes, dataset kind/reference, and the machine's ai-toolkit/PyTorch/CUDA/GPU/base-model identity — so the run-compare drawer can show real caption diffs and a deduplicated copy of deleted images instead of guessing; a deployed checkpoint step is now scoped to the run that deployed it, not every run sharing that step number; Krea 2 Edit warns *before* a batch that a square/landscape reference will squeeze body/back shots, with a one-click crop-to-3:4; face-similarity scoring now covers the undecided triage pile, not just kept images, so 🎯 Auto-triage finally has fresh variations to act on) — **no rejected feature this window**: `git log --oneline` named run-freeze/compare, a checkpoint-deployment fix, Krea's reference-shape advisory and face-triage scoring, and `merge-base..upstream/main` touched no cloud-engine file. Seven conflicts, all prepend-vs-prepend or emoji-adjacent: `whatsNew.js` and the Maintenance bullets in `settings-reference.md` were upstream's new entries prepended above the fork's own (kept both); `workspaceSections.js`'s Curation description took upstream's updated "kept + still undecided" wording but re-stripped its re-added 🧹 icon per Divergence 3; `faceScoringGate.js` and `DatasetWorkspace.jsx` took upstream's `capable`/`capsLoading`-aware button state and `faceAnalysisLabel(...)` wholesale — the 🎭 glyph on this one button is a pre-existing fork exception (already in `settings-reference.md` and untouched `faceScoringGate.js` lines before this sync), not a fresh Divergence-3 violation; `frontend/dist/index.html` was resolved by reverting to the fork's pre-merge dist for the source commit, then rebuilt separately (per routine step 6). **Caught a real merge-interaction bug:** `VariationCatalog.jsx`'s multi-engine mode fieldset (legitimate now that Klein+Krea are both local — Divergence 1b) carried a bare `gptViaSub` identifier in its `estimateCost(...)` call, a leftover from upstream's ChatGPT-subscription pricing that no longer exists anywhere in this fork; `estimateCost`'s signature only destructures `{ multiplier }`, so it silently ate the argument rather than crashing — removed anyway, per diagnostic 6, since a dead reference to a deleted concept is exactly what the merge trap looks like before it bites. Tests: backend 2779 pass / 1 pre-existing environment failure (`test_prefill_falls_back_to_telea_when_lama_absent`, documented above); frontend 988/988 pass including the local-only contract test against the rebuilt dist. |
| 2026-07-26 | `1d649c3` + dist `58112b0` | **Fix: phantom vision keep-warm lease on Ollama-down** — `vision_keepalive.py`'s lease has to be recorded BEFORE an isolated vision call ships (`keep_alive` rides in the request payload), so a head-crop or Studio-describe call made while Ollama was unreachable still recorded a 120 s lease for a model that was never loaded. The next `launch_training` within that window saw `lease_is_live()` true and paid `unload_vision_model()`'s doomed retries (~4 s on Windows: two attempts, each connect walking `::1` then `127.0.0.1`) before the trainer spawned. `describe_image_ollama` now hands the lease back via a new `_forget_lease_if_unreachable` on CONNECTION-level failures only (no HTTP response = server gone); an HTTP rejection or read timeout keeps it (server answered, may hold the model). Six new tests in `test_vision_keepalive.py`; no divergence, no upstream interaction. |
| 2026-07-27 | *(merge)* | **Upstream sync** (9 commits: LoRA Canvas checkpoint actions — the run-card popover extracted into a SHARED `CheckpointActionsPopover` + `useCheckpointActions` so the board and the in-card graph can no longer drift; details-on-demand instead of a drawer that sprang open; a persisted canvas generation tracker; the compact checkpoint pill swapping its illegible 14-px thumbnail for a results count; bank image-provenance — real-detail measurement, origin from file metadata, black bars, JPEG quality; a settings deep-link fix; a Krea generate→dataset-row dispatch fix). **The first sync in this fork's history with NO Divergence-1 work**: the nine commits touch no cloud-engine file, so nothing had to be re-deleted — verified by diffing `merge-base..upstream/main` (diagnostic 1) rather than the full historical `HEAD..upstream/main`, whose cloud-engine hits are all the fork's OWN removals and were the obvious trap here. Eight conflicts, all Divergence 3 (emoji) or adjacent-addition: `README.md` and `whatsNew.js` were prepend-vs-prepend (kept both lists, upstream's new entries on top); `RunLineageGraph.jsx` took upstream wholesale — its ~90-line inline popover and its own `importing`/`deleting` state are superseded by the shared hook, so keeping the fork side would have forked the popover permanently, exactly what the upstream commit set out to prevent. Divergence 3: stripped pictographs from the merged **UI strings** (`bankProvenance.js`'s `PROVENANCE_FLAG_LABEL`/`ORIGIN_CHIPS`, which feed the emoji-free `BankWorkspace`; `CheckpointActionsPopover`'s Deploy/Delete buttons; the pill's results chip; `CanvasRunTracker`; the two new `CaptioningSection` settings) and from `docs/guide/**`, while **leaving `README.md` alone** — README carries ~600 emoji on this fork and is deliberately not stripped. Divergence 4: dropped the "no longer competes with a cloud run recording its progress" clause from the README Test-Studio bullet and the "a cloud run this machine has no link to" reason from a What's-new blurb. Origin badges in `BankWorkspace` became text (`AI`/`Camera`) rather than 🤖/📷, since a bare stripped glyph would have rendered an empty badge. Noted but NOT fixed (pre-existing, out of scope): `BankReviewLightbox.jsx` was never emoji-stripped and still carries 🌫/📺/📐/🚩/👤, so it now shows emoji-free provenance labels beside its own emoji ones. Tests (baseline recorded BEFORE the merge, per diagnostic 7): backend 2696→2730 pass with the SAME 2 pre-existing environment failures either side (`test_stop_waits_until_launch_publishes_the_new_pid`, `test_prefill_falls_back_to_telea_when_lama_absent`); frontend 910→960 pass, 0 fail. |
| 2026-07-26 | *(merge)* | **Upstream sync** (94 commits: LoRA Canvas — every dataset's training lineage on one zoomable board, with card dragging, generate-from-the-board and a per-checkpoint gallery; a Classify-framing button under the Composition bar; bank relocate / overlap warnings / GPU-Python picker for Score / concurrent vision passes; a live training dot on Runs; unified run ids and lineage edge fixes; RTX-50 torch-arch crash diagnosis; anime subject type + Anima pointer; ComfyUI custom input/output folders; JSON shot-catalog import) — **the big adoption is Krea 2 Identity Edit as a SECOND LOCAL engine**, which is why this sync changes a divergence instead of just defending it: see the new **Divergence 1b**. `engineSelection.js` is no longer re-deleted — it is kept, trimmed to `ENGINES=['klein','krea']` with `API_ENGINES=[]`, `DEFAULT_ENGINE='klein'` and all-zero rates; `face_dataset_service` mirrors it (`API_ENGINES=()`, `KNOWN_ENGINES=LOCAL_ENGINES`). Settings regained a **Which engines to offer** card (so `SettingsPage` passes `toggleEngine` again) and `config.py` kept upstream's engine ledger with `LEGACY_KNOWN_ENGINES=('klein',)`, which is what makes Krea reach installs that already saved their settings. Rejected wholesale per Divergence 1: **OpenRouter as a third cloud engine** (`068732e`), the **Nano Banana / ChatGPT image-model pickers** (`3bad281`), and **reference editing with OpenRouter** (`ec5bf6b`) — deleting `openrouter.py`, `engine_errors.py` (its only consumers were the API engines), `chatgpt_image.py`, `nanobanana.py`, `referenceEdit*`, `ReferenceEditModal.jsx` and five test files. **Four of those test files merged with ZERO conflict markers** — `test_openrouter_engine.py`, `test_engine_model_choice.py`, `test_engine_lists_contract.py`, `test_config_new_engines.py` — exactly diagnostic 2, and three MORE clean-merged tests had been silently re-pointed at the cloud catalogue (`test_diagnostic.py`, `test_settings_api.py`, the new `capability-destinations-contract.test.mjs`, which expected 11 capability rows where this fork has 8). A clean-merged `import { editEngineNames } from './referenceEdit'` in `ReferencePanel.jsx` survived both the conflict pass AND the grep sweep — only `npm run build` caught it, which is the argument for building before calling a sync done. **Caught a real merge-interaction bug:** with `API_ENGINES` emptied, upstream's `model = img.klein_model if img.klein_model not in API_ENGINES else …` inverts to always-true and would have handed a legacy engine TAG to the Klein loader as if it were a model filename; now tested against `LEGACY_API_ENGINE_TAGS + (KREA_ENGINE,)`. Also restored `check_fanout_budget`/`fanout_in_flight` (dropped in the 2026-07-23 sync with the cloud fan-out, and load-bearing again now that two LOCAL engines dispatch as separate batches — without it `/generate` 500s on every multi-engine call). Divergence 3: re-stripped 404 lines of emoji across 172 merged files, keeping `🔞`; three upstream tests asserted on stripped glyphs and were re-pointed at the wording they actually guard. Divergence 4: dropped the resurrected vast.ai key guide in `TrainingSection.jsx`, the **Train in cloud** button and the cloud-run progress block in `TrainingPanel.jsx`. Settings' engine section went plural (`## Image engines`) with both help anchors and the docs realigned. README's "Seventeen researched presets" claim was NOT taken: both trees ship 13, so the number was corrected rather than propagated. |
| 2026-07-25 | *(merge)* | **Upstream sync** (20 commits: bank review lightbox + two-level watermark cleaning + live folder re-walk + per-run staging cleanup + explicit Undeploy + Checkpoints-panel deployed state + per-subject identity prompts + Klein generation steps) — no rejected feature shipped in this window: the only cloud token the 20 commits add is one `face_single` description string in the SHARED `promptOverride.js` metadata, which the UI already filters out. Adopted as-is: the whole bank wave, the lineage/checkpoint Undeploy work, and both `2013790` features. Divergence work: `IdentityPromptModal.jsx` — upstream imports `readEngines` from `engineSelection.js`, **a file this fork deleted** (build breaker); kept upstream's per-subject storage (`readIdentityPrompt`/`writeIdentityPrompt`/`identityPromptPatch`/`identityDefaultsFor`, `subjectType` prop) but restored the fork's single-generator `activeExtraRefPromptKey(currentGenerator())`. `EnginesSection.jsx` — kept upstream's subject-type chip picker and switched to `identityPromptFields(subject)`, re-applying the fork's `.filter((f) => f.engines.includes('klein'))` and rewording the card copy from "three prompts" to one. `SettingsPage.jsx` — dropped upstream's `toggleEngine` prop (not defined in this fork → ReferenceError). `face_dataset_service.py` — dropped the re-added `API_ENGINES` regenerate branch but adopted its `sampler_steps=_generation_steps()`. `CloudRunsPage.jsx`/`whatsNew.js` — kept upstream's `TRASH_REMINDER` refactor, reworded rented-"pods" copy (Divergence 4). `helpRegistry.js` — kept the `klein.generation_steps` topic, dropped the API-engine `identity_prompts.face` topic, and repointed `runs-clean-one-run-staging` off the `#a-cloud-run-seems-stuck` H2 this fork does not carry. Divergence 3: re-stripped the badge pictographs upstream re-added in `BankWorkspace.jsx` (kept its `key=f` React fix) and the `🔎` in the guide; `⏏` kept as a monochrome state glyph, consistent with the `✓` the fork already keeps. **Caught a real merge-interaction bug:** upstream's new live folder re-walk (`refresh_bank`, forced on every `/api/banks`) is recursive, so the split's parent-rooted "(loose files)" bank absorbed every subfolder image its sibling banks own (1 → 4 in a 2-subfolder export). Fixed with a persisted `image_bank.root_only` marker (additive migration) that prunes the walk; two regression tests added. Also stopped `BankPage` polling `/api/banks` every 2.5 s — that route now force-re-walks every source folder and toasts, so the queue badge is derived from the cheap `/api/bank-queue` snapshot instead. |
| 2026-07-24 | *(this wave)* | **Image-bank queue + split-by-subfolder** — two Bank additions. (1) A **cross-bank "Launch all" queue** (`backend/app/services/bank_queue.py`, an in-memory FIFO + single worker mirroring the `bank_jobs` contract): line up several banks and they run one at a time, each *waiting* for the GPU/bank to be free (reusing `start_pipeline` + `_gpu_busy_reason`) instead of the old busy-GPU **503** rejection. New routes `POST /bank/<id>/queue`, `GET/DELETE /bank-queue`, `POST /bank-queue/clear`; `list_banks` now carries `queue_state` for the card badge; UI is a queue panel + per-card "Add to queue" on `BankPage.jsx` (reusing `LaunchAllDialog` via a new `onQueue`). (2) **One bank per subfolder** — importing a folder-of-folders creates a separate bank per top-level subfolder (`split_folder_into_banks` / `split_folder_preview`, `create_bank` refactored to share `_register_bank`); loose root images get their own bank by default so nothing is dropped; routes `POST /bank/split[/preview]`, a create-form toggle + live preview. Local-only, no cloud surface touched. Tests: `test_bank_queue.py`, `test_bank_split.py`, `queue-split-ui.test.js`; What's-new + help topics (`bank-launch-queue`, `bank-split-subfolders`) added. |
| 2026-07-24 | *(merge)* | **Upstream sync** (subject-type selector for generation — Human/Animal/Creature/Object/Other, steering the shot catalogue and identity lock for non-human LoRAs; case-insensitive whole-word Find & Replace in captions; Test Studio keeps every recent prompt instead of capping at ten; a form-dialog opacity contract test) — the big item to reject was upstream's **"edit the reference photo with a prompt"** feature, built entirely on ChatGPT/Nano Banana (`/ref/edit` routes, `reference_edit_jobs.py`, `ReferenceEditModal.jsx`, `referenceEdit.js` which imports the already-deleted `engineSelection.js`, `test_ref_edit.py`, the `✦ Edit` button in `ReferencePanel.jsx`, the `edit_reference` activity kind, and its What's New entry). Per Divergence 1 this was rejected wholesale: deleted every file above, stripped the routes/service functions/hooks that called them from `datasets.py`, `face_dataset_service.py`, `useDataset.js`, `DatasetWorkspace.jsx`. Also re-rejected upstream's recurring **multi-engine batch generation** rewrite of `VariationCatalog.jsx` (`EngineCard`, `MODE_CHOICES`, `engineSelection.js` imports) and `regenerate_image`'s API-engine branch/`generate_variations_nanobanana` fan-out in `face_dataset_service.py` — same pattern as the 2026-07-23 sync, upstream keeps developing this feature on top of the same rejected base. The subject-type feature's own wiring (`subjectTypes.js`, the `SUBJECT_TYPES` radio group, `normalize_subject_type`/`subject_type_of` on the backend, the `subject_type` DB column) merged in cleanly alongside the rejection and was kept — it has no cloud-engine dependency. Dropped the orphaned `dataset-engine-mode` help topic and the `action-edit-reference` help topic. |
| 2026-07-23 | *(merge)* `20e9380` + dist `5c8fb24` | **Upstream sync** (Anima — a first-class anime training family, Cosmos-Predict2 2B, local-only for now) — clean adoption, no cloud-generation risk (it's a training family, not an image-generation engine). Per Divergence 4, deleted upstream's resurrected rental-GPU "Choose cloud GPU speed" launch dialog and custom-base push UI in `TrainingPanel.jsx` (dead/unrendered code brought back by the merge) and dropped the reintroduced `2026-07-23-multi-engine-generation` What's New entry already rejected in the prior sync per Divergence 1. |
| 2026-07-23 | *(merge)* | **Upstream sync** (crop extra reference photos + one editable prompt box per identity prompt + bank cards show first five images + French→English typography fixes + one Backup menu + import from a bank in Add images + delete a checkpoint from its lineage pill + grid filter by decision + bulk-improve/stop-generation refactors) — the big item was upstream's **"generate with several engines in one batch"** (`6f1656a`), which reintroduces Nano Banana/ChatGPT checkbox selection, `engine_batches`, `API_ENGINES`, `generate_variations_nanobanana` and a per-tile engine-colour pill end to end (routes, service, capabilities, `VariationCatalog.jsx`, new `engineSelection.js`, `DatasetGridItem.jsx`). Per Divergence 1 this was rejected wholesale: kept this fork's single-generator Klein-only `/generate` route and `VariationCatalog.jsx` card (upstream's whole 352-line rewrite of that file discarded), deleted `engineSelection.js`/`.test.js` and `test_generate_multi_engine.py`, dropped the broken clean-merged leftovers that referenced the now-undefined `API_ENGINES` (`_image_engine`/`'engine'` tile field, `check_fanout_budget`/`fanout_in_flight`, the `IdentityPromptModal.jsx`/`useDataset.js`/`promptOverride.js` multi-engine plumbing — reverted each to its pre-merge single-engine shape), and removed the orphaned `dataset-engine-mode` help topic. Caught a real regression along the way: the clean-merged `IdentityPromptsCard` in `EnginesSection.jsx` had switched to rendering the *shared, unrestricted* `IDENTITY_PROMPT_FIELDS` (3 entries — `face_single`/`face_multi`/`klein_identity`) instead of the fork's Klein-only local list, which would have resurfaced the two API-engine prompt cards in Settings; now filtered to `f.engines.includes('klein')`. Everything else above was adopted as-is (all non-cloud, generically useful); re-stripped emoji from conflicting hunks per Divergence 3 (kept upstream's guillemets→curly-quotes typography fixes where they landed on already emoji-free fork text), fixed a stale `#image-engines` help anchor (upstream's H2 is plural, this fork's Klein-only section is `## Image engine` singular), and dropped one duplicate What's-new entry (`stop-generation-works-again` restated this fork's own `stop-buttons-actually-stop` announcement from the day before). |
| 2026-07-22 | `24106d1` + dist `854ec0b` | **Hang-audit hardening** — full audit of every blocking call and stop/pause path. Fixed: Ollama model pulls (setup action + Settings pull) streamed with no read timeout and could hang their worker thread forever (now `(10, 300)` — five silent minutes fails the pull with a visible error); a latent no-timeout `/prompt` post in `comfyui_service.py`; and the GPU-exclusive vision window's TTL was set once at entry, so a caption/vision batch longer than 30 min silently lost its lock and queued image jobs could pile onto the GPU mid-batch (the window now re-arms the TTL from an in-window heartbeat, joined on exit; crash-recovery semantics unchanged). Audit also verified the rest of the stop surface is bounded (training scheduler tick clears stale flags in ~60 s, activities end via try/finally + 30-min TTL, frontend polls self-heal). |
| 2026-07-22 | `853be77`, `30a98ef` + dist `e81d5e3`, `d34520e` | **Honest Stop buttons + real-address startup** — Stop generation stays clickable during the whole batch (`'generate'` excluded from the workspace `disabled` condition like `'improve'`); Stop training verifies the PID actually died (`_wait_pid_dead`, 5 s) and returns 502 (`TrainingStopVerificationError`) instead of a false success; generation cancel reports `unconfirmed` renders when ComfyUI never confirmed the interrupt (with a benign-case fix: a reachable ComfyUI whose queue no longer holds the prompt counts as confirmed stopped, so the warning only fires when ComfyUI is unreachable). Launcher: browser-open moved from `start.bat` (hardcoded, fired-too-early 127.0.0.1) into `run.py` — opens the actual bound host:port with the access token once the server accepts connections; `LDS_NO_BROWSER=1` disables. |
| 2026-07-23 | *(merge)* | **Upstream sync** (bulk Klein improve moved to a server-side job, stoppable and reload-proof) — clean merge, no divergence policy involved; kept our `renameDataset` export in `useDataset.js` alongside upstream's new `improveBatch`, and dropped the superseded client-side `onImprove`/`bulkImprove` polling state from `DatasetGrid.jsx` in favor of upstream's `onImproveBatch`/`improveLabel`. |
| 2026-07-22 | *(merge)* | **Upstream sync** (Continue lane picker on the Runs hub + HF-gate cloud preflight + trigger/style rename cascade + Import-to-bank export disclosure + Klein improve-profile tuning) — kept the Local/Cloud Continue-lane picker (dead-but-visible per Divergence 4: `caps.cloud_training` stays forced off) but deleted the resurrected fresh "Train in cloud" launch dialog/GPU-speed picker and the Runs-page rental banner from `TrainingPanel.jsx`/`CloudRunsPage.jsx`; reworded the cloud-lane "reason" strings (was `vast.ai API key`) to stay clear of the local-only contract's forbidden-string list; re-stripped emoji from conflicting Export/workspaceSections hunks per Divergence 3. |
| 2026-07-20 | *(merge)* | **Upstream sync** (Bank curation series + lineage Experiment Lab + editable identity prompts) — kept only the `klein_identity` identity-prompt card in Settings (dropped upstream's `face_single`/`face_multi`/`CHATGPT_AUTH_OPTIONS` UI); re-stripped emoji from conflicting Bank/Settings hunks per Divergence 3. |
| 2026-07-19 | *(docs)* | **Preset alignment report** — full cross-check of the fifteen LDS built-ins against the ai-toolkit fork's presets/advisor (`docs/preset-alignment-2026-07.md`; copy + additive preset sync landed in the ai-toolkit fork). No LDS preset values changed. |
| 2026-07-19 | `e542ff0` + dist `0f83988` | **Local-only dist guard** — contract test + merge routine so an upstream `frontend/dist` rebuild cannot resurrect Nano Banana / OpenAI Setup UI. |
| 2026-07-19 | `9a78fc8` / merge `03013de` | **Klein paths from anywhere** — absolute pins outside Comfy roots hardlink/symlink into `lds-pinned/`; bf16 UNETs use `weight_dtype: default`; Training Settings drop vast.ai cards (Runs/backend left). |
| 2026-07-19 | `c2b5312` + dist `f2951e7` | **Configurable model paths everywhere** — every Klein model reference (UNET/TE/VAE pins, the consistency LoRA — now editable in Settings — and generation-LoRA preset rows) accepts a full absolute path as well as a ComfyUI-relative name; paths under any registered root auto-convert to loader names, with a three-state badge (found / not found / outside ComfyUI's folders). |
| 2026-07-19 | `0fcfdd6` + dist `84d659d` | **Emoji-free UI** — stripped ~700 decorative emoji across the app, docs and comments; plain-text labels, monochrome state glyphs kept, real text where an emoji was a button's only content. The `🔞` label prefix is kept as a functional NSFW data marker. |
| 2026-07-19 | `59f0529`, `c91ae08` | **PLAN.md** — the phased integration plan for the whole local stack (ComfyUI + SwarmUI + ai-toolkit + TagGUI) with LDS as the hub. |
| 2026-07-19 | `c56790d` + dist `6677553` | **Klein model-file pins** — Settings ▸ Image engine fields (`klein.unet` / `klein.text_encoder` / `klein.vae`) to name the exact loader files, incl. files outside `klein`-named folders and `extra_model_paths.yaml` roots; missing pins fall back to auto-detect with a visible "not found" badge. |
| 2026-07-19 | `738f2ec` + dist `035056a`, notes `b115182` | **Local-only generation** — removed the Nano Banana (Gemini) and ChatGPT (`gpt-image-2`) API engines end to end; Klein (ComfyUI) is the sole engine. Legacy API-generated rows regenerate through Klein. Divergence details in the sections below. |
