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
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (7 commits, release v2026.07.28.5: **find bank images by describing them** — a Find by text panel in the Curate row ranks the current filter by CLIP similarity to a phrase, reusing the Score embeddings and encoding ONLY the phrase, in-process, CPU-forced, warm-worker + on-disk query cache + idle reaper (`bank_scoring.text_search_idle_minutes`); and **Setup stops certifying a model file that cannot be loaded** — install rows gain a third state (`⚠ On disk, unreadable`), download-again now REPLACES a blocking-invalid file instead of no-opping "already present", and Setup reads the SAME `localEngineReadiness()` verdict the Generate page gates on, so the two screens can no longer name different causes for one gap — reported by zigzag4794 on Discord). Both features verified local-only before adopting: the CLIP text tower was already resident for Score, no network, no key. **One rejected-feature deletion**: upstream's `imageStep()` — the cloud "Image generation" Setup step listing Nano Banana / ChatGPT / OpenRouter — surfaced as the upstream SIDE of the `useSetupSteps.js` conflict (git aligned it against the fork's Klein-constants block, which upstream moved to the new `utils/kleinAssets.js`); both sides deleted — the constants now come from the leaf module, the cloud step never enters, `SETUP_STEP_IDS` stays four-step. Plus one dead upstream-ism: a new capabilities test cleared `OPENAI_API_KEY` before probing (gates their ChatGPT probe; nothing here reads it) — line dropped. **Divergence 1 recurred in the DOCS again, and PRE-EXISTING this time**: `troubleshooting.md`'s ComfyUI-folders section (merged with the nofaceman wave) still promised "the API engines (Gemini, ChatGPT, OpenRouter)" keep working without shared folders — a factual error on this fork, corrected while the file was open for the merge (D1 is non-negotiable; the D3 leave-drift-alone rule is about cosmetics, not about docs promising engines that do not exist). Eight conflicts (two dist, per policy fork's pre-merge dist kept and rebuilt from src): `conftest.py` kept the fork's both-anecdotes vision-lease docstring and appended upstream's new text-search-cache paragraph + `clip_text_encoder` import; `helpRegistry.js` and `whatsNew.js` were adjacent/prepend inserts (kept both; upstream's setup entry on top of the fork's same-day ref-edit entry); `localEngineReason.test.js` took upstream's side (the ZIGZAG payload fixture) with the fork's legacy-tag-answers-null test surviving below; `troubleshooting.md` was insert-vs-insert — upstream's greyed-out-Klein cause table re-attached to the section it continues, fork's own sections kept after it. **Diagnostic 12 struck TWICE more, in a new form**: `git diff --stat <range> -- ':(exclude)frontend/dist'` and pathspec'd `git diff <range> -- <file>` both silently dropped every BACKEND file from the recon — "an all-frontend window" was false (the window's biggest file is `clip_text_encoder.py`, 419 lines). The tell was commit messages describing backend work the stat did not list; recon was redone from ONE no-pathspec diff, which is now the only trustworthy form in this Git Bash. Divergence 3: 17 added lines stripped (a 13-line `🔤` family plus `🎨 🎯 🗃️` singles and the `⚠️`-variation form → `⚠`); `✨ ✓ ⚠ ↻ ▸ ✦ ⇒` kept per the glyph list; the `<span aria-hidden>🔤</span>` next to the result summary was REMOVED outright rather than left as an empty span (bank-badge lesson — nothing to see means no control, and this one was decorative). Gates: ESLint ran and is clean; build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; frontend 1286 -> **1317/1317**; backend 3152 -> **3180 passed** (+28, exactly the new upstream suites) with the SAME single pre-existing failure (`test_prefill_falls_back_to_telea_when_lama_absent`) and the same skip — baseline recorded BEFORE the fetch on this Windows machine, both runs from the repo root, CI's invocation. Divergence 5's carried `_app_context` fixture survived the merge untouched. |
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (16 commits: the face-mask preview names the stage it is on and survives leaving the panel — it is a server-side job now, rejoined on mount instead of abandoned and restarted; **Mask faces installs its own detector** from where it is ticked, and a run launched with it on but InsightFace absent no longer trains unmasked in silence — the pre-launch report says so (completes shivdbz2010's GitHub issue #15); delete a run AND everything it produced, as an explicit `?cascade=1` opt-in that keeps children, deployed LoRAs and rated-good images; generated images pin onto the LoRA Canvas as movable, resizable nodes that remember their geometry; a rebuilt full-screen image record publishing ten columns that were persisted and never shown; deployment state on every checkpoint pill's left edge; and **Pick diverse stops leading with the outliers** — pure farthest-point sampling is mathematically the criterion that selects ISOLATED points, so a kNN-density guard now discounts the lone meme without ever rewarding the centre). **The cleanest window in this fork's history: ZERO rejected-feature lines.** The sweep found no added line mentioning a cloud engine or GPU rental anywhere in `backend/` or `frontend/src` — the first sync where Divergence 1 required literally nothing. Eight conflicts. `image_bank_service.py`/`bank.py` took the typicality guard whole; `lora_training.py` took upstream's new face-mask preflight check and kept the fork's emoji-free verdict comment; `whatsNew.js` was prepend-vs-prepend (kept both, the fork's 07-28 entry staying on top because it is genuinely the newer one — the "upstream on top" rule is about ordering by date, not by side). **`ConceptFaceMaskField.jsx` was the one live trap**: upstream renames the button's `busy` to `running`, and the fork's side of the conflict still said `busy` — keeping it would have been the SEVENTH bare-identifier `ReferenceError` of this fork's history, in a file whose other hunk legitimately swaps a dead-end warning for `FaceDetectionInstallPrompt`. **Divergence 4 recurred in the DOCS, where no gate can see it** (diagnostic 4, new surface): `settings-reference.md` re-offered `### Cloud GPU (vast.ai)` + `### Cloud training` immediately below upstream's new, legitimate "face detection is optional" paragraph — paragraph kept, both sections re-deleted; the fork already documents the same `cloud.*` keys under Config-file-only settings, which is the honest place for a dormant backend with no card. Divergence 3: 55 added lines across 22 files (📌 🗑 🖼 👍 🎨 🔍 🔌 👁 and the `⚠️` variation-selector form), applied to merge-ADDED lines only. Two resisted the mechanical strip and were done by hand: a docstring where the glyph WAS the noun ("the SAME function the gallery's 🗑 uses" → "the gallery's own Delete"), and `CanvasImageNode`'s open-full-screen button whose entire label was `🔍` — replaced with `⛶`, the glyph this fork already uses for full-screen, not deleted into an empty control (the bank-badge lesson, third time it has come up). D3 also gained its measured scope and its keep/strip glyph list, so the next sync does not re-derive them. **New merge diagnostic 12**, from two tooling traps that made the strip script report "nothing to do" on real additions: `git diff <rev> -- <path>` returns EMPTY in this Git Bash for paths that plainly differ (`--numstat` with no pathspec reports `336 175` for the same file), and most of `backend/` is CRLF in the working tree where git's diff output is LF, so every added backend line failed an exact string compare. Both fail silently as a small hit count; verify the classifier against a file the merge created outright. Gates: ESLint v10.8.0 confirmed present and clean (diagnostic 11); build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; frontend 1231 -> **1286/1286**. Backend 3107 -> **3143 passed** (+36) with **10 failed** against the baseline's 1 — the 9 additions are ALL upstream's brand-new `test_face_mask_preview_progress.py`, and they fail **identically on a clean `upstream/main` worktree in this same environment**: `conftest.app` yields the application without pushing an app context and that file calls `svc.create_dataset` on it directly, so it is upstream's own test bug, not merge damage. **Judged "not merge damage, therefore not mine to fix" and left — which was wrong, and CI said so within the hour** (the backend job is `python -m pytest backend/tests -q`; a red suite is red whoever wrote it). Fixed in the follow-up below and recorded as **Divergence 5**, the fork's first carried patch to an upstream TEST file. |
| 2026-07-28 | *(follow-up)* | **Fix: 9 red backend tests upstream shipped, that the sync knowingly let through** — `test_face_mask_preview_progress.py` needs an application context its ten tests never push, so nine of them died on `RuntimeError: Working outside of application context` before their first assertion. The sync verified the failures reproduce on a clean `upstream/main` worktree, correctly concluded "not merge damage", and then drew the wrong conclusion from it: **"upstream's bug" and "not this fork's problem" are different claims, and only the first one was true.** CI turned red on the very next push. Fixed with one autouse `_app_context` fixture rather than upstream's own idiom of a `with app.app_context():` per test, so every upstream test body stays byte-identical and the divergence is a single hunk to re-apply — or drop, when upstream fixes it their way. Backend suite now **3152 passed / 1 failed** (the sole pre-existing `test_prefill_falls_back_to_telea_when_lama_absent`, which CI does not hit because it installs numpy + opencv), from the repo root, which is the invocation CI actually uses. New **Divergence 5** section exists so the next sync checks these carried test patches survived the merge — losing one turns CI red with no product-code change to notice. |
| 2026-07-28 | *(this wave)* + dist | **Reference editing, adopted local-only — the fork's first ADOPTION of a feature it had previously rejected** (new **Divergence 1c**). Upstream `47508ab` rebuilt Edit-reference to run on Klein and Krea 2 Edit as a ComfyUI queue job: free, private, no key. That retires the only objection this fork ever had — the deleted-file note said it outright, "Klein deliberately excluded, ChatGPT/Nano Banana only" — so by the Divergence-1b principle the local half was always in scope. It was rejected hours earlier **in the sync itself**, on sequencing rather than policy (a ~1,400-line resurrection inside a merge being judged by diffing test counts against a baseline is how leftovers ship), then taken here on a clean, green base. Restored trimmed: `reference_edit_jobs.py` (imports no cloud module), `ReferenceEditModal.jsx`, `referenceEdit.js`, the three `/ref/edit` routes, the service section, the `is_reference_edit` dispatch branch in `job_queue`, the `edit_reference` activity kind, and the `editReference`/`keepEditedReference`/`discardEditedReference` trio in `useDataset.js` **including its slot in the returned object** — the exact hiding spot diagnostic 3 names, and the exact list whose absence would have been a bare-identifier `ReferenceError` had the previous sync shipped upstream's version of it. **Every API branch DELETED, not left dead** (the 1b trap): `start_reference_edit` loses its `if engine in LOCAL_ENGINES` lane split, `_edit_engine_call` and `_run_reference_edit` go entirely, and `editCostNote`/`editKeepNote` lose the paid halves — a price quoted on a free render damages trust as much as one hidden on a paid one. **`editable_engines()` is upstream's `LOCAL_ENGINES + API_ENGINES` verbatim and is local-only BY CONSTRUCTION**, the payoff for keeping `API_ENGINES` as an empty export; the new test asserts the OUTCOME rather than the expression, so a sync that ever refilled that tuple would fail here instead of quietly handing the fork a paid edit lane. **Two upstream defaults recomputed, not inherited** (diagnostic 10): `defaultEditEngine` falls back to a cloud id upstream-side, which would open the modal on an engine no route accepts — repointed at `DEFAULT_ENGINE`; and the unknown-engine `EDIT_REF_SUPPORT` default is `'primary_only'` here rather than upstream's `'all'`, which would have promised transient-upload support nothing implements. **The transient-upload picker is absent rather than present-and-ignored** — no local graph can take request-scoped bytes, so the picker, its state and `editReference`'s `files` argument are gone and the route refuses uploads loudly. **`invalidate_reference_edit` re-wired into `crop_reference`/`recrop_reference_auto`**; those hooks had left with the feature, and without them a pending Before/After survives a crop and compares against a reference that no longer exists (regression-tested). **An upstream bug was found and NOT copied**: upstream's `/ref/edit/keep` calls `logger.exception(...)` in a module that never defines `logger`, so its error path raises `NameError` inside the very `except` meant to return an honest 500. **Caught by the guards, not by review**: the local-only contract's identifier budget went red on a single cloud engine name in one of my own explanatory comments — reworded rather than budget-bumped, which is what that guard asks for. Divergence 3: the `✦` on the button and heading stripped (the button reads `Edit` — real text, not an empty control); `⚠ → ✕` kept as glyphs this fork already carries. Also **merge diagnostic 11**: `frontend/node_modules` can exist while ESLint is absent from it, and `npm run lint` then fails with `'eslint' is not recognized` — non-zero, so not silent, but it reads as a broken toolchain rather than as "the tripwire for this fork's worst failure class never fired". It happened this session; CI is unaffected (`npm ci` runs first). Gates: lint clean; build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; frontend 1211 -> **1231/1231**; backend 3089 -> **3107 passed** (+18, exactly the new suite) with the SAME single pre-existing environment failure and the same skip. |
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (11 commits: Concept LoRAs can mask the FACES out of the training loss so they stop fighting your character LoRAs — reported by shivdbz2010, GitHub issue #15; a model ComfyUI cannot load now names itself before the job is queued instead of failing with "value not in list"; the resolvers never AUTO-pick an unloadable file — a `.gguf` dropped into a krea folder mid-session had the app choosing a model core ComfyUI cannot read, reported by naniii2352 on Discord; the checkpoint-gallery Select moved into the pinned bottom bar). **The judgement call this sync was upstream `47508ab`: reference editing became LOCAL** (Klein + Krea 2 Edit, a ComfyUI queue job, free) — which retires the ONLY objection this fork ever had to it, since the deleted-file note says in as many words "Klein deliberately excluded, ChatGPT/Nano Banana only". By the Divergence-1b principle the local half is genuinely IN SCOPE here. **Rejected anyway, on scheduling not policy** (owner decision): adopting it means resurrecting six deleted files plus the `/ref/edit` routes, the service section, the `editReference`/`keepEditedReference`/`discardEditedReference` trio rejected only last sync, the modal wiring and an activity kind, each trimmed of the API half it interleaves with — a feature wave, not something to bury in a merge that has to be diffed against a test baseline. Recorded as its own section under Divergence 1 (with the adoption checklist) so the next sync does not re-derive it. Re-deleted: the six conflicted ref-edit files plus TWO that merged with zero conflict markers (`test_ref_edit_local_engines.py`, `ReferenceEditModal.contract.test.js`). **Three clean-merge leftovers caught by the sweep, none flagged by git**: `job_queue._dispatch_completion` gained an `is_reference_edit` branch calling a `link_completed_reference_edit` that no longer exists (the backend's own bare-identifier class — an `AttributeError` on every local edit-shaped completion); `test_dataset_job_dispatch.py` gained a test `monkeypatch.setattr`-ing that same absent function; and `whatsNew.js` gained the entry ANNOUNCING the rejected feature, the documented hiding spot. **A real bare-identifier trap was defused in `TrainingSection.jsx`**: upstream's conflict hunk carried `VastKeyGuide` + `VAST_SECRET` + `CloudOfferFilter` + `CloudTrainingCard` (Divergence 4, rejected AGAIN) interleaved with the legitimate `ConceptFaceMaskCard` — but the file's IMPORT line auto-merged as the fork's, so keeping the concept card alone would have left `ResetToDefault` and `defaultValueAt` undefined and crashed Settings › Training on open. Resolved per hunk and both imports added (not `SecretField`/`useState`/`useEffect`, which only the cloud cards needed). `settingDefaults.test.js`: dropped upstream's seven `cloud.*` reset rows, KEPT the two `face_mask` ones — and **reversed last sync's note** that `TrainingSection.jsx` is deliberately absent from the "reads the shared lookup" list, because concept masking just gave it its first non-cloud resets (diagnostic 10: a fork invariant that MOVED). **`utils/localEngineReason.js` was adopted even though it arrived in the ref-edit commit** — it is not ref-edit plumbing but the extraction of Klein's four-cause availability answer out of `VariationCatalog.jsx`, whose GENERATION panel is its caller here; its ref-edit comments were reworded and its API-engine test re-pointed at `LEGACY_API_ENGINE_TAGS`. Upstream's `chore(release)` dist was reverted unmerged and rebuilt from fork src; `.gitattributes` `-merge` again turned `dist/index.html` into an explicit conflict rather than a silent content merge. Divergence 3: stripped 📌 🗑 👁 👍 and the `⚠️` variation-selector form from the merge's ADDED lines only (`ConceptFaceMaskField.jsx`, `CheckpointGalleryPanel.jsx`, `gallerySelection.js`/`.test.js`, `lineagePanelsResponsive.test.js`, one What's-new blurb); the gallery Select toggle's `✓`/`☑` pair was dropped rather than replaced, since the button's own Select/Done label and `aria-pressed` already carry the state — no invisible-badge repeat. `→ ▸ ⚠ ✕` kept (glyphs this fork already carries), `README.md` deliberately not stripped. Gates: lint clean; build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; backend guard 3/3; frontend 1189 -> **1211/1211**; backend 3060 -> **3089 passed with the SAME single pre-existing failure** (`test_prefill_falls_back_to_telea_when_lama_absent`) and the same skip — baseline recorded before the fetch, one pass, on Windows (where only that one environment failure occurs, not the Linux container's 57). |
| 2026-07-28 | *(merge)* + dist | **Upstream sync** (19 commits: re-run Upscale & improve from the SOURCE image with today's settings; judge an improvement side by side with its parent, at the same scale; click a run on the Canvas to see everything it made, by step (the checkpoint gallery grew a second scope); put any setting back to its default from the server's own value; a settings deep link that names one setting now lands on that setting; release notes generated from What's-new instead of shipped empty; README screenshots collapsed behind details) — **Divergence 1 work again, and again with no cloud-engine FILE touched**: the new reset-to-default feature enumerates the removed engines. Rejected: upstream's `ImageModelsCard` (three `ModelField`s for nanobanana/chatgpt/openrouter model slugs) and the ENTIRE `ChatgptSubscriptionCard` — device-code OAuth login, poll/import-codex/logout calls and `CHATGPT_AUTH_OPTIONS`, which FORK_NOTES already named as staying dropped — plus their renders and the `refreshCaps`/`toast` props that existed only for them. KEPT from the same hunks: `configDefaults`, because `ResetToDefault` is legitimate and is already wired to the Klein/Krea settings that survive here (verified live: changing Klein generation steps makes the button appear reading 'Reset to default: Generation steps, 5'). **The dangerous one was `useDataset.js`** — the documented hiding spot: upstream's returned object both DROPPED the fork's `renameDataset` and ADDED `editReference`/`keepEditedReference`/`discardEditedReference`, the rejected reference-edit-via-API trio whose backend this fork deleted. Undefined here, so shipping that list would have been a bare-identifier `ReferenceError` on every dataset page — the sixth instance of the class. Kept the fork's list, added only the legitimate `reimproveImage`. **Divergence 4**: upstream's `VastKeyGuide` (a 'how to get a vast.ai API key' walkthrough), the `Cloud GPU (vast.ai)` secret card and `CloudTrainingCard` all arrived in `TrainingSection.jsx`; rejected, and the four imports they alone needed (`useEffect`/`useState`/`SecretField`/`ResetToDefault`/`defaultValueAt`) reverted with them rather than left as unused leftovers. **Two new upstream contract tests pinned the rejected surface**: `settingDefaults.test.js` asserted `EnginesSection.jsx` offers resets for `chatgpt_auth`/`nanobanana_model`/`chatgpt_image_model`/`openrouter_model` (id anchors that do not exist here) and that `TrainingSection.jsx` covers seven `cloud.*` rental settings and imports the shared lookup — all re-pointed at this fork's real surface; `test_settings_api.py` asserted `config_defaults['engines']['nanobanana_model']`, a key this fork's `engines` section does not have, and probed secret-leakage with `OPENAI_API_KEY`, which is not in this fork's `SECRET_KEYS` and so proved nothing — re-pointed at `krea.base_model` and `HF_TOKEN`. Upstream's dist again carried ALL SIX forbidden strings and was deleted unmerged; `.gitattributes` `-merge` (added last wave) did its job — `dist/index.html` came through as an explicit conflict instead of auto-merging. Divergence 3: re-stripped `CheckpointGalleryPanel.jsx` (👍/👎 back to ✓/✗, 🗑/📝 dropped — the file the fork keeps emoji-free, stripped for the second sync running), `CaptioningSection.jsx` (🎨/👥/💔 and the four bank-flag glyphs), `DatasetGridItem.jsx`'s new re-run button (🔄✨ -> the fork's own ↻, NOT stripped to an empty button — the bank-badge lesson), `LineageCanvas.jsx`, `runGallery.js`, `improveRerun.js` and three test comments. Gates: lint clean (no bare-identifier leftover); build clean; local-only contract 8/8 against the rebuilt dist; `app.create_app()` OK; frontend 1088 -> **1189/1189**; backend 2953 -> **2975 pass with the SAME 57 failures and ZERO files changing their failure count** (one-pass baseline recorded before the fetch); all ten routes drive clean in a real browser and Settings shows no cloud engine. |
| 2026-07-27 | `2d66f9d`..`37c57a8` (+ `908e043`, dist `c5987f4`, `37c57a8`) | **Sync hardening: turn what the 2026-07-27 merge caught BY HAND into gates** — that sync found four cloud-engine leftovers, a moved file that silently un-stripped itself, and two upstream tests pinning the rejected surface, all of it manually. Four guards now cover that ground. (1) **Cloud-engine identifier budgets**: the local-only contract only ever matched exact UI sentences ('Powers Nano Banana'), which is why a whole `PromptPreview` engine picker, an `API_ENGINES` branch, six API-key help topics and a backend `PREVIEW_ENGINES` tuple all merged green — none contains a forbidden phrase, and `backend/app` had no guard of any kind. Per-file budgets on the IDENTIFIERS now cover `frontend/src` (in the existing contract test) and `backend/app` (new `test_local_only_engines.py`); a budget rather than a ban because `LEGACY_API_ENGINE_TAGS` is load-bearing, so that test also asserts the tags still EXIST and `API_ENGINES` stays empty — the budget can never be satisfied by deleting the compatibility path. Both verified by replanting this sync's real leftovers. (2) **The backend suite runs in ONE pass again**: a global `monkeypatch.setattr(os, 'name', 'nt')` made pytest's own traceback formatter build a `WindowsPath` on Linux whenever a test failed in that window, aborting the session — which is why diagnostic 7 demanded 174 per-file subprocesses (~15 min) twice per sync. A `makereport` hookwrapper restores the real `os.name` while a report is built: 2950 passed / 57 failed, zero INTERNALERROR, and the failure set reconciles exactly with the old method (51 counted per-file + 6 in `test_capabilities.py` that the old method could not SEE). (3) **`frontend/dist/** -merge`** in `.gitattributes`: the served bundle is a tracked build artifact and the one path that reintroduces the cloud Setup UI with no source change to notice — it arrived carrying all six forbidden strings this sync. Git now never content-merges it. (4) **Docs**: CLAUDE.md's identity rule claimed the author was 'already set in this repo's local git config' — it is not part of a clone, and this session authored two commits as the wrong author before it was caught; it now gives the commands, says to fix the TOOL not the author line, and records that wrong-author commits are repaired with `commit-tree`, never `rebase` (a rebase across a sync rewrites the merged UPSTREAM commits). Merge diagnostics 9 (a `modify/delete` conflict usually means upstream MOVED a file and the fork's edits did not follow) and 10 (never read counts/defaults off upstream — recompute them) added. **Two real bugs found while measuring whether a fifth guard was worth building**: `activeExtraRefPromptKey` still fell back to upstream's `'nanobanana'` default, badging `face_multi` — an API-engine prompt this fork does not surface and no local generation reads — as 'used by your current engine' on any profile that had not yet opened the Generate panel, with the unit test PINNING that behaviour rather than catching it; and the bank tile's promoted badge was `badge('')`, an over-strip that rendered an INVISIBLE pill (restored to the `⬆` that same file's own '⬆ Promote…' button uses). **Deliberately NOT built: an emoji (Divergence 3) contract test.** Measured first: `frontend/src` already carries ~40 distinct pictographs across dozens of files, and 5 of the 7 glyphs this sync stripped (`⬆ 🗃 🖼 👍 👎`) still live elsewhere in the tree — so a character allowlist would catch 2 of 7 and a per-file baseline is brittle (the gallery panel changed paths mid-sync). D3 is applied per merged hunk historically, not enforced tree-wide; enforcing it is a deliberate ~40-glyph cleanup, not something to smuggle into a sync. Gates: lint clean, frontend 1088/1088, local-only contract 8/8 against the rebuilt dist, backend guards green, `app.create_app()` OK. |
| 2026-07-27 | *(merge)* + dist | **Upstream sync** (49 commits: Krea 2 Edit installs from the app, node pack included, and its dead download links now point somewhere real; memory-saving levers (`quantize`/`quantize_te`/`low_vram`) become optional per run with card-aware guidance instead of being hard-coded; the Hugging Face token finally reaches the LOCAL trainer; Stop stays responsive while a run is starting (the vision revoke moved OUT of `_queue_lock`); promote a bank shortlist into a NEW BANK, not only into a dataset; sort a bank or dataset grid by score / sharpness / face similarity; ComfyUI's unreachable input folder now explains itself instead of failing blind, and the beta57 pin is gone; delete images from a checkpoint gallery; deleting a run clears everything it left behind; the six prompt parts become editable with a live composed-prompt preview; a privacy suite that fails when personal data reappears in tracked files) — **Divergence 1 work, despite no cloud-engine FILE being touched in the window**: the plumbing arrived inside otherwise-legitimate features, which is diagnostic 2 exactly. Stripped: `settings/PromptPreview.jsx` (new file — its engine picker listed Nano Banana / ChatGPT / OpenRouter and branched on an `API_ENGINES` membership test to grey out four controls; trimmed to `klein`+`krea` and the branch DELETED per the Divergence-1b trap, not left dead), `face_variations.PREVIEW_ENGINES` / `_API_PREVIEW_ENGINES` (same treatment — which also restored `wrap_variation` to caller-free, its documented state, since upstream's preview had given the retained dead code its first caller), six API-key/model topics in `helpRegistry.js` (kept the four legitimate prompt-part topics from the same hunk — diagnostic 4, resolved per hunk), upstream's `ModelField` per-API-engine card in `EnginesSection.jsx` (zero call sites here; `overrideBadge` was the fork side of that same conflict and is used), and cloud names from two new What's-new blurbs plus three test fixtures. **Upstream's `build(frontend):` dist arrived and carried ALL SIX forbidden contract strings** (`Powers Nano Banana`, `Powers ChatGPT`, `Gemini API key`, `OpenAI API key`, `Train in cloud`, `vast.ai API key`) — deleted unmerged and rebuilt from this fork's src, the hard stop working as designed. **Two upstream contract tests pinned the rejected surface and went red**: `prompt-parts-contract.test.mjs` asserted `PromptPreview` still contains `API_ENGINES` (re-pointed to assert its ABSENCE — the honest fork contract), and `kreaInstall.test.js` asserted `rows.length >= 12` (this fork has 9). **Caught by the modify/delete conflict:** upstream MOVED `CheckpointGalleryPanel.jsx` from `canvas/` to `shared/`, and the fork's entire Divergence-3 strip lived on the old path — accepting the move would have silently restored 🖼/🗑/👍/👎; re-applied on the new path. Divergence 3 elsewhere: `PromoteDialog.jsx` (⬆/📁/🗃/💾), `BankWorkspace.jsx`'s promoted badge (the fork carried a bare `badge('')` here — an over-strip that rendered an INVISIBLE badge; upstream's ⬆ was KEPT, matching that same file's own "⬆ Promote…" button and toasts, since Divergence 3 keeps a glyph when removing it leaves nothing to see), `LineageCanvas.jsx`, `settings-reference.md` (⚙️/⚠️/⎘) and the two promote tabs in `using-the-app.md`; `🔎 Scan quality` and `🎭 Analyze faces` were LEFT because those glyphs really are on the fork's buttons. Divergence 4: nothing to do — the window added no rental/cloud-training string. Also: capability rows 8 -> 9 (Krea joined upstream's list; recomputed from `deriveCapabilitySummary`, not copied), both sides' `conftest.py` vision-lease docstrings merged into one keeping BOTH real failure anecdotes, both sides' new tests kept in `test_training_queue_atomic.py`, and `postcss` took upstream's 8.5.23 security bump while keeping the fork's ESLint tooling. Gates: lint (no-undef) clean — **no bare-identifier leftover this sync**, the first since the tripwire landed; build clean; local-only contract 6/6 against the rebuilt dist; `app.create_app()` OK; frontend 988 -> **1086/1086**; backend 2625 -> **2883 pass** across 13 new upstream test files (all green), failures 50 -> 51 — the one addition is upstream's own `test_vision_revoke_runs_outside_the_queue_lock`, which fails identically (`RuntimeError: ai-toolkit is not configured`) on a CLEAN `upstream/main` worktree in this container, so it is environment, not merge damage; every other file's failure count is unchanged and no file lost a pass (per-file baseline recorded BEFORE the fetch, diagnostic 7). Footnote on those absolute numbers: they come from the per-FILE method, which silently under-counted — `test_capabilities.py`'s reporter crashed, so its 6 failures were invisible on BOTH sides and excluded from both totals. After the one-pass fix landed (diagnostic 7) the true post-merge figure is **2950 passed / 57 failed**, and 51 + those 6 reconciles exactly to 57 with an identical set of failing files. The DELTA the sync was judged on is unaffected: the same method, with the same blind spot, ran on both sides. |
| 2026-07-27 | `44db71e`..`2394ccc` (dist `1d18bec`, `2394ccc`) | **Fix wave: four workspace-crashing merge leftovers + a permanent lint tripwire** — the 2026-07-26 sync shipped four bare-identifier leftovers that merged with ZERO conflict markers, each a runtime `ReferenceError` taking a whole page down: `storage` (`VariationCatalog.jsx` — upstream defines the one-line localStorage helper near the top of the file; the resolution kept the fork's local-only header region without it, so EVERY dataset open/create crashed to the full-screen boundary — owner-reported as "create dataset errors" then "erroring non stop on any navigation", since the remembered `datasetCurrentId` re-opened the crashing workspace on every load); `actives`/`configured`/`limit` (`CloudRunsPage.jsx` — consumers of upstream's cloud-status poll survived Divergence 4's deletion of the poll itself; `actives` sits in a useMemo dep array, so the whole Runs page crashed on open; pinned to no-cloud values); missing `useState` import (`EnginesSection.jsx` — lost with the cloud-engine strip; Settings › Image engines crashed on open); `currentAvailable` (`VariationCatalog.jsx` Generate button — the fork's pre-multi-engine availability flag, undefined since Divergence 1b's multi-engine adoption, masked by `!selected.size` short-circuiting until a reference was set and shots ticked; rewired to `blockedReason`). **Root-cause guard**: `npm run lint` (ESLint `no-undef` ONLY — `frontend/eslint.config.js`), wired into CI, merge diagnostic 6, the merge routine step 5 and the CLAUDE.md shipping checklist; it statically catches this entire leftover class, which `npm run build` structurally cannot (bundlers resolve imports, not identifiers) and which the 2026-07-26 sync's grep sweep + full green test suites both missed (988/988 passed WITH the four landmines in-tree — a component that never mounts in a test never throws). Verified by driving the served app through every route headlessly, before and after. |
| 2026-07-26 | merge `2de3a4e` + dist `5f20e32` | **Upstream sync** (7 commits: every training launch now freezes a full snapshot — caption text, image content hashes, dataset kind/reference, and the machine's ai-toolkit/PyTorch/CUDA/GPU/base-model identity — so the run-compare drawer can show real caption diffs and a deduplicated copy of deleted images instead of guessing; a deployed checkpoint step is now scoped to the run that deployed it, not every run sharing that step number; Krea 2 Edit warns *before* a batch that a square/landscape reference will squeeze body/back shots, with a one-click crop-to-3:4; face-similarity scoring now covers the undecided triage pile, not just kept images, so 🎯 Auto-triage finally has fresh variations to act on) — **no rejected feature this window**: `git log --oneline` named run-freeze/compare, a checkpoint-deployment fix, Krea's reference-shape advisory and face-triage scoring, and `merge-base..upstream/main` touched no cloud-engine file. Seven conflicts, all prepend-vs-prepend or emoji-adjacent: `whatsNew.js` and the Maintenance bullets in `settings-reference.md` were upstream's new entries prepended above the fork's own (kept both); `workspaceSections.js`'s Curation description took upstream's updated "kept + still undecided" wording but re-stripped its re-added 🧹 icon per Divergence 3; `faceScoringGate.js` and `DatasetWorkspace.jsx` took upstream's `capable`/`capsLoading`-aware button state and `faceAnalysisLabel(...)` wholesale — the 🎭 glyph on this one button is a pre-existing fork exception (already in `settings-reference.md` and untouched `faceScoringGate.js` lines before this sync), not a fresh Divergence-3 violation; `frontend/dist/index.html` was resolved by reverting to the fork's pre-merge dist for the source commit, then rebuilt separately (per routine step 6). **Caught a real merge-interaction bug:** `VariationCatalog.jsx`'s multi-engine mode fieldset (legitimate now that Klein+Krea are both local — Divergence 1b) carried a bare `gptViaSub` identifier in its `estimateCost(...)` call, a leftover from upstream's ChatGPT-subscription pricing that no longer exists anywhere in this fork; `estimateCost`'s signature only destructures `{ multiplier }`, so it silently ate the argument rather than crashing — removed anyway, per diagnostic 6, since a dead reference to a deleted concept is exactly what the merge trap looks like before it bites. Tests: backend 2779 pass / 1 pre-existing environment failure (`test_prefill_falls_back_to_telea_when_lama_absent`, documented above); frontend 988/988 pass including the local-only contract test against the rebuilt dist. |
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
- **No transient-upload picker.** Upstream's third `EDIT_REF_SUPPORT` value,
  `'all'`, exists for API engines that also accept images uploaded in the modal.
  No engine here can (both graphs want file PATHS; the route refuses
  request-scoped bytes), so the picker, its state and the `files` argument of
  `editReference` are absent rather than present-and-ignored — and the
  unknown-engine default is `'primary_only'`, NOT upstream's `'all'`, so the UI
  cannot promise a capability nothing implements.
- The `editReference`/`keepEditedReference`/`discardEditedReference` trio is back
  in `useDataset.js` **and in its returned object** — the slot diagnostic 3 names
  as a hiding spot, called out here because that is where it will go missing next.
- `invalidate_reference_edit` is wired into `crop_reference` and
  `recrop_reference_auto`. Those hooks left the fork when the feature did; without
  them a pending Before/After survives a crop and compares against a reference
  that no longer exists.
- Divergence 3: the `✦` upstream puts on the button and heading is stripped —
  the button reads `Edit`, which is real text, not an empty control.

**Upstream bug NOT copied:** upstream's `/ref/edit/keep` route calls
`logger.exception(...)` in a module that never defines `logger` (it uses
`logging.getLogger(__name__)` inline elsewhere), so its error path raises
`NameError` inside the very `except` that exists to turn a failed Keep into an
honest 500. This fork uses the inline form.

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

**Scope, measured (2026-07-28).** The strip is repo-wide in intent — upstream
`866` pictographs in `frontend/src` against this fork's `160`, `111` vs `14` in
`backend/app`, `84` vs `37` in `docs/` — but it is applied PER MERGED HUNK, so
drift is real and is not a defect to fix mid-sync. Only lines this merge added
get stripped; a pre-existing fork line that still carries a glyph stays (see
diagnostic 12 for how to tell them apart, and for the two ways that check fails
silently). What is stripped: the emoji planes `U+1F000–U+1FAFF` (except `🔞`)
and the `U+FE0F` variation selector that turns `⚠` into `⚠️`. What is KEPT,
because the fork already carries them in quantity: `→ ✓ ⚠ ▸ ✕ ▶ ◉ ✂ ↻ ✗ ★ ⏹
⏏ ✎ ▾ ⓘ ✦ ⚙ ● ○ ⇒ ⛶ ✨`. Never leave an empty control behind: a glyph that was
the button's whole label is REPLACED (`👍`/`👎` → `✓`/`✗` with a `title`;
`🔍 open full-screen` → `⛶`), never deleted.

## Divergence 4: Local-only training (no remote GPU rental)

Settings → Training keeps **Defaults** only — no rental API-key card and no
cloud guardrails. Since 2026-07-28 it also carries **Concept face masking**
(`face_mask.expand` / `face_mask.min_weight`), which is local training work and
has nothing to do with the rental cards removed here — the two arrived in the
SAME conflict hunk and must be resolved apart (diagnostic 4). The UI also:

- Forces `cloud_training: false` in `CapabilitiesContext` (even if a leftover
  key sits in `.env`).
- Removes **Train in cloud**, GPU-speed picker, and Runs-page rental banners.
- Shows **Runs** as local history only (cloud rows filtered out).

Backend cloud routes may still exist dormant; they must not surface in the UI.
Upstream merges that restore Training Settings cards, Setup “rent a GPU” copy,
or Runs rental prompts: delete them again. Contract:
`frontend/tests/local-only-engines-contract.test.mjs` (also forbids rental UI
strings).

**The docs are a fourth recurrence surface, and the contract does not cover
them.** `docs/guide/settings-reference.md` carries upstream's `### Cloud GPU
(vast.ai)` + `### Cloud training` sections, and any upstream edit landing near
them re-offers the pair inside an otherwise-legitimate hunk (2026-07-28: a new
"face detection is optional" paragraph immediately above them). Delete the two
sections again, not the paragraph — the fork documents the same `cloud.*` keys
under **Config-file-only settings**, which is the honest place for a dormant
backend with no Settings card. The contract test only reads `frontend/src` and
`frontend/dist`, so this one is caught by reading the hunk, not by a gate.

## Divergence 5: patches carried on upstream TEST files (keep them alive)

Not a policy divergence — bugs in upstream's own tests that make this fork's CI
red. They live in files upstream is actively editing, so each is deliberately
written as ONE self-contained hunk that a future sync can re-apply or drop if
upstream fixes it their way. **A merge that silently loses one of these turns CI
red without touching a line of product code**, so check them after every sync.

- `backend/tests/test_face_mask_preview_progress.py` — an autouse `_app_context`
  fixture (2026-07-28). `conftest.app` yields the application WITHOUT pushing an
  application context, and every DB-touching helper in that file runs outside a
  request, so 9 of its 10 tests die on `RuntimeError: Working outside of
  application context` before their first assertion. Reproduced on a clean
  `upstream/main` worktree, so it is neither a merge artefact nor this machine —
  upstream shipped it red. The sibling suite
  (`test_face_mask_install_gate.py`) solves the same problem with an explicit
  `with app.app_context():` in every test body; doing it once, autouse, leaves
  every upstream test body byte-identical and keeps the divergence to one hunk.

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
    upstream moves them: the capability-row count (11->8, then 12->9 when Krea
    joined) and `DEFAULT_ENGINE` are the live examples. Both have bitten. A
    2026-07-27 audit found `activeExtraRefPromptKey` still falling back to
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

12. **A script that decides "did this merge ADD this line?" must be checked
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
    knows to keep it. A pre-existing failure that was ALREADY red before the sync
    (`test_prefill_falls_back_to_telea_when_lama_absent`) is the only kind to
    leave alone, and only because CI installs the numpy/OpenCV it needs.
    Corollary: **reproduce CI's exact invocation, from the repo root.** The
    routine below runs pytest from `backend/`; CI runs `python -m pytest
    backend/tests` from the root, which is a different rootdir and `sys.path`.

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
