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
| 2026-07-29 | *(merge)* + dist | **Upstream sync — 4 commits, and the D1 replay arrived as a 476-line test file with zero conflict markers.** Adopted: **deploying a LoRA follows `extra_model_paths.yaml`** (Geekswordsman, GitHub #25 — reads were already plural, writes were not; new `write_root('loras')`, and the Settings folder-overrides preview follows the same resolution so the panel that promises to name the folder cannot diverge from it again); **training bases follow the yaml too** (`_sdxl_base_path` returned a BARE NAME that ai-toolkit then resolved against its own working directory and died on, about a path the user never typed; `zimage_convert._resolve_merge` looked in two folders; new `ci_resolve`/`resolve_model_file` walk ComfyUI's own root priority so a duplicated file name resolves to the weights ComfyUI would really load — 19 new tests); and **every Klein lane names the model it runs** (reference edit, small-scrape rescue, watermark inpaint all passed `klein_model=None`; the two lanes that hold a dataset now inherit its pick, a named-but-missing model is refused BY NAME instead of swapped for a neighbour, and the bank keeps automatic resolution on purpose because it has no dataset to inherit from). `Flux2KleinModelPicker.jsx` deleted upstream — the only surviving reference is upstream's own guard test asserting it is gone, which is diagnostic 18 answered before it could bite. **The rejection**: `f2c515e` rebuilt the ChatGPT/OpenRouter failure taxonomy. Four modify/delete conflicts re-deleted (`chatgpt_image.py`, `openrouter.py`, `test_engine_model_choice.py`, `test_openrouter_engine.py`) — and **`test_chatgpt_refusal.py` (476 lines) merged with ZERO conflict markers**, found by grepping for orphaned imports of the files just re-deleted rather than by any conflict prompt. Exactly last sync's `test_nanobanana_refusal.py` shape, one window later: **the D1 test file is now the recurring carrier, not the source file.** `settings-reference.md` had 2 conflicts and needed per-HUNK resolution — one was upstream re-offering the whole Gemini/SynthID/OpenRouter/ChatGPT-subscription/multi-engine-batch documentation against the fork's D2 pinned-model bullets (rejected, second sync running), the other the legitimate per-lane Klein text (adopted); the yaml paragraphs upstream added to the same file auto-merged outside both. `whatsNew.js` was prepend-vs-prepend, kept BOTH with upstream's on top minus its ChatGPT entry. `ReferenceEditModal.jsx`'s single conflict was two adjacent imports — a **keep-BOTH**, not either/or: taking one side would have dropped `DEFAULT_ENGINE` (used twice) or `KleinModelSetting` (rendered at :239). **Gate 1 earned its keep for the fourth time this session**: the whatsNew splice dropped one entry's `to:` and closing brace, and ESLint's parse error was the only thing that saw it — the bundler had not been run yet and no test imports that file's syntax. `API_ENGINES` is still `()` with no membership branches; grep for merge-ADDED lines matching the rejected terms returns **zero**. Gates: lint clean; build clean; local-only contract **8/8 against the rebuilt dist**; `app.create_app()` OK; frontend **1859 -> 1871/1871**; the merge's three new backend suites plus the fork's two local-only guards **62/62**; full backend suite diffed against a pre-merge worktree baseline. |
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

Backend cloud routes may still exist dormant; they must not surface in the UI.

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

Deleting either on the next sync because the diff says "cloud" would remove a
local feature. The rule is what SURFACES, not what a commit is named.
Upstream merges that restore Training Settings cards, Setup “rent a GPU” copy,
or Runs rental prompts: delete them again. Contract:
`frontend/tests/local-only-engines-contract.test.mjs` (also forbids rental UI
strings).

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

**One entry, added 2026-07-28 (evening):**

- `backend/tests/test_local_retry.py` — `_configure_aitoolkit` builds ONLY the
  Windows venv layout (`venv/Scripts/python.exe`), while
  `config.aitoolkit_derived_python` branches on `os.name` and looks for
  `venv/bin/python` on POSIX. On Linux the fake install therefore reads as
  ABSENT and five tests fail with `ai-toolkit is not configured` (409). The
  fork's hunk writes both layouts; the resolver picks the one for the platform,
  so it is inert on Windows and the tests assert the same thing on both.
  **Verified: 12 passed / 5 failed before, 17 passed after.**

  Why it is carried rather than left, when CI (`windows-latest`) is green on it:
  the container's failure floor is not free. These five were triaged as merge
  damage once, then as environment, then diagnosed twice — and diagnostic 7
  exists because that floor is what makes a baseline diff necessary at all.
  Five fewer is five fewer. Drop this hunk the moment upstream makes the fixture
  OS-agnostic.

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
    knows to keep it. A pre-existing failure that was ALREADY red before the sync
    (`test_prefill_falls_back_to_telea_when_lama_absent`) is the only kind to
    leave alone, and only because CI installs the numpy/OpenCV it needs.
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
