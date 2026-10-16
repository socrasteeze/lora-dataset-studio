# HANDOFF

## Training controls and caption TXT delivery

- The operator authorized a clean commit and push of all pending changes to main, with tests skipped. Source and the rebuilt frontend bundle use separate `[skip ci]` commits. Verify publication against the final origin/main SHA.
- Scope: themed Training checkbox chips, aligned dropdowns and launch/preset/base/preview controls, plus trigger-prefixed TXT writing for all Dataset kinds. The preview grid aligns items at the top so the left selector cannot center itself beside the taller quality/help block.
- Ruff, ESLint, the frontend build and diff review passed. ESLint retains 32 existing warnings. The privacy scan checked 3,014 publishable tracked and untracked text files with zero findings. Attribution-pattern matches are technical project references, policy filenames, scanner patterns, cursor variables or synthetic fixtures. There are no unresolved scrub findings, and no credential rotation or history rewrite is indicated.
- No tests, cloud suites, browser probes, fixture servers, application imports, production caption-file writes or restarts ran for this delivery. Earlier test results below do not qualify the current changes. Save work and restart Studio after current jobs finish to enable the TXT-writing backend change, then refresh the browser.

## Caption TXT trigger follow-up

- Implemented on noble/training-control-chips alongside the Training UI work below and included in this delivery.
- The explicit Write TXT action prepends the chosen trigger once for Character, Concept and Style datasets. Trigger Word starts with the saved dataset trigger and accepts an operator-entered prefix, including an @artist tag. This override applies to the written files; stored captions, the dataset trigger and image files stay intact.
- The caption-tools component is keyed by dataset, so a typed prefix cannot carry into another dataset. Pristine input follows the saved trigger; edits survive background polls and failed requests. Writing disables the input and button, and the button reserves its width for its busy label. Requests surface failures and allow retry.
- The endpoint accepts an optional trigger_word and retains no-body compatibility. It rejects malformed requests and invalid, empty, multiline or overlong prefixes before writing any files. Repeated writes and existing leading copies of the selected prefix produce one prefix. Existing stale-file cleanup and skip counts remain in place.
- Style ZIP exports and built-in training still use their existing content-only rules. This request changes the explicit TXT-writing action. Bank captions have no Dataset trigger and use a separate workflow. No Bank behavior was changed.
- Added synthetic backend regressions for all three dataset kinds, overrides, repeat writes, duplicate prefixes, image/caption/metadata preservation and invalid requests. Updated the existing Style TXT expectation while retaining its content-only ZIP and stale-cleanup assertions. Tests have not run.
- Updated the Guide, help search, What's New and the README's former blanket no-trigger claim. Ruff, ESLint, the frontend build and diff review passed; ESLint retains 32 existing warnings. Rebuilt frontend/dist. Privacy scan: 3,014 publishable tracked and untracked text files, zero findings. No new source attribution was found.
- No tests, browser probes, application imports, production TXT writes or restarts ran. Save work and restart Studio after current jobs finish to load the backend change. Refresh the browser for the updated controls.

```text
# UI Stability Audit - Caption TXT
Scope: /datasets Captions / Caption Tools | Viewports: not rendered | Runtime: static-only

## Verdict
SHIP under the no-test exception. Runtime layout remains unqualified.

## Findings
| # | Check | Status | Severity | Evidence | Fix |
| 1 | Trigger input, write state and retry | WARN | SHIFT | frontend/src/components/dataset/CaptionToolsBar.jsx:174 | Keep the prefix in place, align the controls and reserve the writer's busy-state width. |
| 2 | Populated layout and interaction | NOT RUN | SHIFT | No browser or fixture server was started. | Verify on the operator's test machine. |
```

## Training control-chip follow-up

- Implementation branch: noble/training-control-chips, based on the previous main delivery at 6cb46d0a8. These changes are included in this delivery.
- Scope is the Training panel shown by the operator. Each native checkbox is in its own clickable chip, including memory saving, gradient checkpointing, Compile, dual captions, differential guidance, face masking and masked training. Native keyboard behavior, settings keys, save handlers and disabled conditions remain intact. Dual-caption, differential-guidance and face-mask help controls sit outside their checkbox labels.
- Chips use the app's surface, content and amber accent tokens. Checked, hover, focus and disabled states keep the same border width. Chip targets are at least 40 px below lg and 32 px on desktop; labels wrap instead of truncating.
- Training dropdowns use a common 20 rem preferred width, capped by available space. Heights are 40 px below lg and 32 px on desktop. Advanced and Expert option rows use the same 9 rem label track, place supplementary details beneath the control and stack labels above controls below sm. No dynamic measurement or setting changes were added.
- Extended the layout to the launch, preset, base and preview rows. Preset actions use equal grid cells with a 9 rem minimum, wrap to available space and use the shared 32 px desktop / 40 px mobile button height. The existing delete action now says Delete Preset. The selector and action group use two columns where space permits.
- Model Family, Presets, Base and the option rows align on the same label track. Preview numeric inputs and Auto use the shared control height. Use Dataset Captions uses the shared button system in both of its training call sites. The launch summary has a separate full-width line, and Training Defaults follows the controls in DOM order as well as visual order. Launch, save, import/export and preview handlers remain intact.
- The Bank pass dialog has separate operation choices and is outside this Training styling request. The shared ConceptFaceMaskField has both its enabled and unavailable variants updated; it is used by Training only.
- ESLint and the frontend build passed; ESLint retains 32 existing warnings. Rebuilt frontend/dist. The privacy scan checked 3,013 publishable text files with zero findings. Diff review passed, with no new source attribution. Updated the affected memory-label, preview-quality and caption-button expectations without running them. No tests, browser probes, fixtures, application imports or service restarts ran.

```text
# UI Stability Audit - Training Controls
Scope: /datasets Training launch, Advanced and Expert | Viewports: not rendered | Runtime: static-only

## Verdict
SHIP under the operator's no-test exception. Runtime layout remains unqualified.

## Findings
| # | Check | Status | Severity | Evidence | Fix |
| 1 | Checkbox targets and state geometry | WARN | POLISH | frontend/src/index.css:99 | Use native checkboxes inside themed chips with fixed border widths and visible focus. |
| 2 | Dropdown dimensions and alignment | WARN | SHIFT | frontend/src/index.css:60; frontend/src/index.css:86 | Apply one preferred width and height, shared label tracks and narrow-screen stacking. |
| 3 | Disabled face-masking control and help | WARN | POLISH | frontend/src/components/dataset/ConceptFaceMaskField.jsx:177 | Keep the unavailable control visible and move help outside its chip. |
| 4 | Preset actions and launch summary | WARN | SHIFT | frontend/src/index.css:76; frontend/src/components/dataset/TrainingPanel.jsx:1985 | Use equal action cells and place the run summary below the launch controls. |
| 5 | Populated layout, keyboard and pointer interaction | NOT RUN | SHIFT | No browser or fixture server was started. | Verify on the operator's test machine. |
```

## Training and caption delivery

- The operator authorized a clean commit and push of these follow-ups to main, with tests skipped. Source and the rebuilt frontend bundle use separate `[skip ci]` commits. Verify the final publication SHA against origin/main.
- Scope: the two-column Training layout, direct duplicate-pair review, persisted Keep Both decisions and aligned, larger image-card caption controls. The previously delivered ATK resume repair remains intact.
- Ruff and ESLint passed; ESLint retains 32 existing warnings. The frontend build and diff review passed. The privacy scan checked 3,013 publishable tracked and untracked text files with zero findings. Attribution-pattern hits are technical project references, policy filenames, scanner patterns, cursor variables or synthetic fixtures. No new source attribution was found. No credential rotation or history rewrite is indicated by these scans.
- No tests, cloud suites, browser probes, fixture servers, application imports, production schema changes, service restarts or training jobs ran for this delivery. Runtime layout and the new duplicate decisions remain unqualified by execution. Earlier test results below apply only to their recorded scope.
- Save current work and restart Studio to load Keep Both and its additive table. Refresh the browser to load the rebuilt interface. No runtime restart was performed during delivery.

## Image-card readability follow-up

- Implemented on noble/training-layout-duplicate-review and included in this delivery with the Training follow-up below.
- Dataset tiles reserve a square image frame before the thumbnail loads. Image content and placeholders cannot change its height. Low face scores retain a thicker warning through an inset outline, with the same content width as other cards.
- Status controls and caption actions use shared button heights and equal grid cells. Reject is on the left and Keep is on the right. Narrow tiles stack Expand and Caption, using the tile width rather than the viewport width. The disabled Caption action reserves its space when text is empty.
- Caption boxes use 14 px desktop text, 16 px below lg, four rows and a fixed 112 px height. The origin line reserves its height even when no author is recorded. Source credits remain available below the controls so they cannot offset the caption rows. Existing caption draft, blur-save, busy-state and expanded-editor handlers remain in place.
- Reviewed the Bank tile counterpart. Bank tiles use image overlays and an expanded editor, with no inline caption textarea to align. Its controls retain their existing touch targets and shared caption-origin helper.
- ESLint and the frontend build passed; ESLint retains 32 existing warnings. Rebuilt frontend/dist. Diff review passed. Privacy scan: 3,013 publishable text files, zero findings. No new source attribution was found. Tests and rendered/browser probes remain unrun under this chat's instruction.

```text
# UI Stability Audit - Dataset Image Cards
Scope: /datasets Images grid | Viewports: not rendered | Runtime: static-only

## Verdict
SHIP under the no-test exception. Runtime layout remains unqualified.

## Findings
| # | Check | Status | Severity | Evidence | Fix |
| 1 | Intrinsic image height and score-border width | WARN | SHIFT | frontend/src/components/dataset/DatasetGridItem.jsx:65; frontend/src/components/dataset/DatasetGridItem.jsx:218 | Reserve the square frame and keep warning thickness out of layout sizing. |
| 2 | Caption author and empty-caption geometry | WARN | SHIFT | frontend/src/components/dataset/DatasetGridItem.jsx:433 | Reserve the author line and both caption-action cells. |
| 3 | Control alignment and readable captions | WARN | POLISH | frontend/src/components/dataset/DatasetGridItem.jsx:477; frontend/src/index.css:394 | Use shared button heights, narrow-card stacking and larger fixed-height caption boxes. |
| 4 | Responsive geometry, hover and editing | NOT RUN | SHIFT | No browser or fixture server was started. | Verify on the operator's test machine. |
```

## Training layout and duplicate-review follow-up

- Implementation branch: noble/training-layout-duplicate-review, based on fa09095f4. The prior ATK resume repair below was already committed separately; its source was preserved.
- Training Advanced and Expert settings use two aligned columns at xl, larger labels/help text and consistent label widths. Phones keep one column. Preview prompts span the full form. Readiness checks use two columns on wide screens.
- The duplicate warning opens Review Pairs on the Training page. The popup contains the flagged copies, with Reject and Keep Both. It cannot launch training in review-only mode. Pair actions serialize saves, show errors and update Resolved only after acceptance. Live dataset status prevents stale rejected copies being treated as active.
- Keep Both writes a per-pair DatasetDuplicateKeep record. Ownership, kept statuses, dataset identity and both image-content fingerprints are checked. Approvals survive reopening and restart; changed image contents require review again. Other pairs remain unresolved. Reject and Keep Both refresh readiness, including decisions made from normal training preflight.
- The new table is additive through normal startup db.create_all. No production app import, migration, restart, image mutation or training job was performed during implementation. Restart Studio to load the new routes/model before using Keep Both.
- Added synthetic backend regressions for persistence, idempotency, metadata/file preservation, stale content, manual rejection, cross-dataset inputs and invalid requests. Added frontend render cases proving review-only cannot start training and normal preflight retains confirmation. These tests have not run. Earlier ATK test counts below do not qualify this follow-up.
- Ruff, ESLint, the frontend build and diff review passed; ESLint retains 32 existing warnings. Rebuilt frontend/dist. Privacy scan: 3,013 publishable text files, zero findings. No new source attribution was found. Tests, cloud suites, fixtures and rendered/browser probes remain unrun under this chat's instruction.

```text
# UI Stability Audit — Training
Scope: /datasets Training and duplicate review | Viewports: not rendered | Runtime: static-only

## Verdict
SHIP under the no-test exception. Runtime layout remains unqualified.

## Findings
| # | Check | Status | Severity | Evidence | Fix |
| 1 | Wide form space and alignment | WARN | POLISH | frontend/src/components/dataset/TrainingPanel.jsx:2476 | Use two equal responsive columns, larger type and equal label widths. |
| 2 | Duplicate warning navigation | WARN | POLISH | frontend/src/components/dataset/TrainingReadiness.jsx:95 | Open the actual flagged pair report in an embedded review popup. |
| 3 | Responsive geometry and interaction | NOT RUN | SHIFT | No browser or fixture server was started. | Verify desktop, tablet and phone layouts on the operator's test machine. |
```

**Updated:** 2026-10-15 | **Target:** main | **Delivery base:** fa09095f4

## ATK resume compatibility

- The operator authorized the resume-bridge repair and focused local tests, then a clean commit and push to main with further tests skipped. Source and the rebuilt frontend use separate `[skip ci]` commits. Verify publication against the final delivery commit. No service restart or real training job is authorized. Earlier unrelated runtime and delivery gaps below remain open.
- Bridge 1.2.0 recognises both the previous serial cache lifecycle and the inspected threaded latent/text-target lifecycle. Full-state snapshots now capture and restore caption-dropout, preservation and self-reference text variants, including shared cache files. Unknown cache layouts and unsafe destinations still fail closed.
- The current installed ATK 0.13.26 source at `89db2ee89a2c8696e019e2f7f128581f6b90ac6f` passes the bridge probe; the unchanged LDS baseline rejects it. Regressions extract its three cache methods, execute them with isolated synthetic files and CPU Torch, and reject encoding attempts. A separate bootstrap test passed using ATK's own interpreter in a disposable CPU process: real trainer classes import and bridge hooks install without constructing a job or loading a model. ATK source is unchanged.
- Focused backend validation: 102 passed, 10 skipped across cache compatibility (including the installed-interpreter bootstrap), bridge, identity, bundle, cross-interpreter, privacy and outbound-gate tests. Eight skips lack Windows symlink privileges; two privacy checks lack a private-name list. All five LDS runtime paths and profile state were isolated before imports; CUDA visibility and online model access were disabled.
- Frontend release-note checks: 28 passed. Ruff and ESLint passed; ESLint retains 32 existing warnings. Rebuilt frontend/dist. Full Gates, cloud qualification and GPU training/resume have not run. Restart LDS after saving work to load the repaired backend; this session does not restart services or start training.
- Delivery privacy scan: 3,010 tracked and untracked text files, zero findings. Attribution matches are legitimate engine references, policy filenames, technical cursor variables or synthetic fixtures. No credential rotation or history rewrite is indicated. Further tests and cloud CI are skipped under the operator's explicit instruction; this delivery is not full Gates qualification.
- Repeat installed-source checks with `LDS_TEST_AITK_ROOT` set to the operator's checkout. Use a new scratch root, isolate the five runtime paths and profile state, and run the focused files below with the pinned interpreter. The environment setting is test-only and is never saved to production config.

```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_aitoolkit_cache_compat.py backend/tests/test_aitoolkit_state_bridge.py backend/tests/test_training_state_identity.py backend/tests/test_training_state_bundle.py backend/tests/test_cross_interpreter_twins.py backend/tests/test_no_personal_data.py backend/tests/test_fork_outbound_gate.py -q
```

## Tag-panel spacing delivery

- The operator authorized a clean commit and push to main. Source and the rebuilt frontend bundle use separate `[skip ci]` commits. Verify the final publication SHA against origin/main.
- Caption Tags has a compact heading, a separate selection count or truncated image name, and Close on the same row with the shared button sizing. Removed the introductory filler and duplicate missing-caption paragraph. Existing counts, filtering, frozen-selection and unread-caption notes remain intact.
- Updated the affected source expectations without running them. ESLint, the frontend build and diff review passed during implementation; ESLint retains 32 existing warnings. Ruff passed during delivery. Rebuilt frontend/dist. The privacy scan checked 3,009 publishable text files with zero findings. Attribution hits are existing technical references, policy filenames, scanner patterns or synthetic fixtures; there are no new source findings. No credential rotation or history rewrite is indicated. No tests, rendered probes or cloud jobs ran.

## Toolbar loading delivery

- Bank controls use a lightweight `/workspace` read with no image aggregates, source walk, semantic inspection or runtime probe. Statistics request `sync=0&runtime=0`; scoring-device readiness uses its own read. The original full payload retains its runtime field for older callers.
- Metadata, statistics and images load independently. The source check follows images without waiting for statistics. Runtime reads are deduplicated, cancelled on exit and refreshed after a Python change. Request generations reject old-bank and superseded replies; late metadata preserves newer fields and statistics preserve a newer folder-check result.
- Source controls render from the first paint and enable after metadata arrives. Header counters and action rows reserve their height, including scrollbar space. Unknown quality counts show a dash. Failed statistics offer Retry. Promotion, deletion and auto-reject still wait for their required information.
- Passes opens only on an explicit click and scrolls inside a bounded viewport area. Analysis buttons use fixed cells so late counts and readiness labels cannot resize them. Statistics cannot open the panel. Folder/conflict notices and the last pipeline report sit in the results pane below the toolbars, so they cannot move the rail or either toolbar. Live progress and Stop remain above the scrolling panes. Bank-specific endpoints do not change Dataset loading or shared control behavior.
- Added synthetic backend cases for the lightweight/no-probe contract, separate statistics/runtime reads, legacy compatibility and missing-bank checks. Added frontend cases for delayed/out-of-order data and stable loading/error markup. Updated obsolete auto-open expectations. None of these tests ran.
- Ruff, ESLint and the frontend build passed. ESLint retains 32 existing warnings. The scrub checked 3,009 publishable text files, including the rebuilt bundle, with zero privacy findings and no new source attribution. Existing attribution-pattern hits are technical references, policy filenames, scanner patterns or synthetic fixtures. No credential rotation or history rewrite is indicated by the scans.
- The operator authorized a clean commit and push to main without tests. No tests, cloud tasks, responsive probes, fixture servers, application imports or production jobs ran. Source and rebuilt frontend/dist use separate `[skip ci]` commits. Verify final publication against origin/main. No production restart or measured latency qualification was performed.

## UI stability evidence

```text
# UI Stability Audit — Bank Workspace
Scope: /bank controls, loading and caption tags | Viewports: not rendered | Runtime: static-only

## Verdict
SHIP under the explicit no-test exception. Runtime layout remains unqualified.

## Findings
| # | Check | Status | Severity | Evidence | Fix |
| 1 | Loading/final geometry | WARN | SHIFT | frontend/src/components/bank/BankStatsStrip.jsx:7 | Reserve the counter height for loading, populated and error states. |
| 2 | Late panel expansion | WARN | SHIFT | frontend/src/components/bank/BankWorkspace.jsx:2094 | Require a click to open Passes and bound its scrolling height. |
| 3 | Background notices above controls | WARN | SHIFT | frontend/src/components/bank/BankWorkspace.jsx:2742 | Keep folder/conflict notices and reports inside the results pane. |
| 4 | CLS, overflow and touch targets | NOT RUN | SHIFT | No rendered session or fixture server was started. | Operator verification remains open. |
| 5 | Caption-tag header wrapping and duplicate empty text | WARN | SHIFT | frontend/src/components/bank/SelectionTagsPanel.jsx:20 | Keep Close beside the compact heading and show the shared missing-caption note once. |
```

## Duplicate and scroll delivery

- The six actions on duplicate and same-shot cards use one shared button shape and equal-width grid columns. Heights are 28 px on desktop and 40 px below lg. Rows use two, three or six equal columns as space permits.
- Desktop pane sizing now reserves actual shell padding and the selection/Undo bar. It uses document coordinates and no scroll listener, so outer-page scrolling cannot grow the panes again. Tall expanded tools retain a minimum usable pane and allow necessary page scrolling. Rendered behavior remains unverified.
- Duplicate and same-shot resolution now marks elected survivors Keep. Automatic resolution favors existing kept copies and also protects the lone undecided survivors left by earlier versions. Launch All resolves duplicates before applying quality flags. Manual Keep/Reject decisions remain protected; multiple manual keeps remain kept. A stale rejected keeper without a comparison snapshot is refused before it can reject the last live copy. Source images and group metadata stay in place, and Undo includes the survivor's prior status. Dataset quality triage has no matching Bank duplicate-group resolution action and keeps its existing quality-only contract.
- Added synthetic regressions for per-group survivors, existing decisions, repeated runs, legacy pending survivors, stale exact/semantic picks, overlapping quality flags, Undo and pane sizing. Tests, visual probes, cloud gates, application imports and live jobs remain unrun under the operator's explicit no-test instruction.
- Rebuilt frontend/dist. Ruff, ESLint and the build passed; ESLint retains 32 existing warnings. The privacy scan checked 3,004 publishable text files with zero findings. Attribution findings are existing technical references, policy filenames, scanner patterns or synthetic fixtures; changed source adds no attribution. No credential rotation or history rewrite is indicated by the scans.
- The operator authorized a clean commit and push to main with tests skipped. Source and frontend/dist use separate commits marked `[skip ci]`. Verify the final publication SHA against origin/main. The earlier UI delivery below is on main at the delivery base above.

## UI delivery

- Removed the Bank filter rail's section divider lines. Added amber hover/focus highlights to chips, tag menus and disclosure controls.
- Watermark scanning starts unchecked in the shared Launch All dialog, including queue submissions. Existing queued jobs retain their saved choices. Updated the relevant test expectations without running them.
- Selected status filters, Review and curation controls share the same amber palette. Toolbar sizes, hover/focus styles, disabled colors and label capitalization are consistent. Review and Select All disable for empty filtered results.
- Desktop Bank filters and results scroll separately. Both use one measured height based on the space below their actual visible top, so the sidebar scrollbar is reachable before reaching the canvas bottom. Header/viewport resizing and page scrolling update that height; image counts do not determine it. Scrollbar gutters stay reserved. Removed scroll containment after the operator reported trapped wheel scrolling. Both panes explicitly allow their grid minimum height to shrink. Runtime and device behavior remain unverified.
- Bank and Dataset selection bars put Reject on the left and Keep on the right, with R/K shortcuts. Full-screen culling opts into Left=Reject, Right=Keep and Down=Back; read-only previews retain arrow navigation. Back does not undo a saved decision. The selection listener excludes editors, overlays, repeat keys, modifiers and typing, and serializes keyboard requests. Failed Bank bulk writes keep the selection. Added key-grammar regressions without running them.
- Rebuilt frontend/dist. Ruff, ESLint and the build passed; ESLint retains 32 existing warnings. The privacy scan checked 3,004 publishable text files and found no issues. No tests, visual probes, application imports or live jobs ran.
- The operator authorized a clean commit and push of all these follow-ups to main, with tests skipped. Source and the consolidated frontend bundle use separate commits with `[skip ci]`. Verify the final publication SHA against origin/main. Refresh the browser to load the frontend; visual and device verification remain unrun.

## Previous queue delivery

The operator asked for workspace jobs to join the shared queue and wait when another Bank is running. The preceding delivery exposed direct work and made queued pipelines wait for it. This delivery queues workspace analysis passes, folder checks and Launch All themselves.
The operator explicitly authorized a clean push to main without tests. Source and rebuilt frontend are separate delivery commits. No tests, probes, application imports, live jobs or runtime changes ran during implementation.

## Done this session

- Workspace analysis routes submit explicit operation IDs and serialized options through the existing queue worker. Legacy list pipelines retain their execution path and share the same machine lanes and Bank-group exclusion.
- Added two nullable queue columns through the additive schema path. Workspace submissions must persist before becoming runnable. Saved Bank/image UUIDs prevent stale numeric IDs from applying work to replacements. No live schema migration ran.
- Saved scope, selected images, redo flags, per-run caption/model settings and machine choice. Failed workspace jobs retain their errors and options across restarts; Retry reuses them and Remove clears them. Failed jobs do not block the lane or count as Clear Waiting targets.
- Cancellation and completion use entry identity and durable row IDs, so an older worker cannot delete a newer job for the same Bank. Cancellation during launch preflight reaches the newly created job. Worker exit hands new admissions to another worker.
- Workspace polling follows waiting jobs through launch and completion. The workspace and Bank list show waiting/failed states and controls. Folder preflight can wait or be cancelled before its turn. Existing missing-engine recovery for Improve remains available before admission.
- Authored synthetic backend and frontend regressions for queue order, options/restart persistence, failure/retry, cancellation, stale IDs, lane choice and rendering. These tests have not run.
- Updated README, the Guide, help search and What's New. Ruff, ESLint and the frontend build passed; ESLint retains 32 existing warnings. Privacy scan: 3,003 publishable text files, zero findings. Attribution hits are legitimate engine references, policy filenames, synthetic fixtures or technical cursor variables. No credential rotation or history rewrite was indicated by these scans. Publication must be checked against the delivery commits.

## Open

1. The operator will test on another machine. Do not start or resume local or cloud suites without a new instruction. Commands below are for that machine only.
2. Duplicate survivors and Undo, outer-page scrolling, equal button sizing, filter layout stability, culling shortcuts, watermark defaults, workspace queue behavior, restart migration, bulk profile moves, full Gates and physical-device behavior remain unqualified by runtime tests. The optional private-name check is unverified. This delivery uses the operator's no-test exception, not a full qualification.
3. Fully stop Studio after saving edits and finishing work, then run `start.bat`. An old supervisor cannot enable the new in-app switching protocol through a backend-only restart. Desktop picker and physical phone/PWA acceptance remain operator checks.
4. Prior cloud runs `38777264998` and `38777264930` were cancelled. Historical frontend results on `51ef21b88` do not qualify the current delivery.
5. After current work finishes, fully restart Studio to load the new backend and additive queue columns. Running jobs were not interrupted. The diagnosis is source-based; no live job reproduction ran.

## Decisions

- One installation owns one active profile. Each named profile owns its database, settings, credentials and mutable training files; model installations may be shared.
- Default uses existing environment overrides and its last recorded server port. No database, media or settings migration was performed.
- Switching starts from an embedded popup and uses a controlled backend restart. It never terminates jobs. A supervisor capability marker prevents an older supervisor from accepting a request it cannot consume.
- Moving a Bank changes profile ownership of metadata and working files. Its original source directory remains a live dependency. The source working cache is retained for recovery and is not automatically purged.
- A move into a profile that already contains this Bank or the same source folder/scope is refused; metadata is never silently merged. Profile thresholds remain independent.
- Bulk moves commit one Bank at a time and can partly succeed. Resolve a failed or uncertain move through its existing receipt before moving the next Bank.
- Source and bundles remain separate commits. This delivery uses `[skip ci]` under the operator's explicit instruction to publish without running tests.
- One queued entry per Bank remains the contract. Imports, promotion, synchronous edits and file deletion keep their existing action flows. Analysis operations use an explicit dispatch allowlist, never request replay or serialized callables.

## Traps

- Keep `.lds-profiles/`, configuration and credentials out of Git. No real profile registry was created during implementation.
- `create_app()` changes schema/runtime state. Isolate all five LDS runtime paths before imports and clear inherited profile identity for validation.
- The app serves the rebuilt frontend immediately. The running backend stays old until restart; no production restart was performed.
- Historical receipts do not qualify this head. Record the operator's explicit no-test publication exception; do not describe it as passed Gates.

## Verify

For the other machine only. Use the pinned Python environment and Node >=22.22. Install the documented dev and CPU Torch test overlays first.

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
```

Isolate runtime paths before focused checks:

```powershell
$profileScratch = Join-Path $env:TEMP 'lds-profile-validation'
New-Item -ItemType Directory -Force -Path $profileScratch | Out-Null
$env:LDS_DATA_DIR = Join-Path $profileScratch 'data'
$env:LDS_CONFIG = Join-Path $profileScratch 'config.json'
$env:LDS_ENV = Join-Path $profileScratch 'isolated.env'
$env:LDS_PLUGINS_DIR = Join-Path $profileScratch 'plugins'
$env:LDS_EXTENSIONS_DIR = Join-Path $profileScratch 'extensions'
$env:LDS_PROFILES_HOME = Join-Path $profileScratch 'profiles'
Remove-Item Env:LDS_PROFILE_ID,Env:LDS_PROFILE_NAME,Env:LDS_PROFILE_PORT -ErrorAction SilentlyContinue
.venv/Scripts/python.exe -m pytest backend/tests/test_instance_profiles.py backend/tests/test_profile_launcher.py backend/tests/test_profile_training_isolation.py backend/tests/test_single_instance.py backend/tests/test_supervise.py backend/tests/test_restart_supervised.py backend/tests/test_lora_deploy_extra_paths.py backend/tests/test_no_personal_data.py backend/tests/test_fork_outbound_gate.py -q
.venv/Scripts/python.exe -m pytest backend/tests/test_profiles_api.py backend/tests/test_profile_bank_move.py backend/tests/test_bank_collections.py -q
.venv/Scripts/python.exe -m pytest backend/tests/test_bank_queue_workspace.py backend/tests/test_bank_queue_direct_work.py backend/tests/test_bank_queue.py backend/tests/test_bank_queue_durable.py backend/tests/test_bank_queue_lanes.py backend/tests/test_bank_queue_device.py backend/tests/test_bank_waits_between_banks.py -q
.venv/Scripts/python.exe -m pytest backend/tests/test_image_bank.py backend/tests/test_image_bank_pipeline.py backend/tests/test_image_bank_semantic_dedup.py backend/tests/test_image_bank_undo.py backend/tests/test_bank_dup_live_badge.py backend/tests/test_bank_dup_distinct.py backend/tests/test_bank_write_holds.py backend/tests/test_bank_collections.py -q
.venv/Scripts/python.exe -m pytest backend/tests/test_dataset_storage.py backend/tests/test_dataset_routes.py backend/tests/test_bank_promote_to_new_dataset.py backend/tests/test_checkpoint_registry.py backend/tests/test_run_snapshot_compare.py backend/tests/test_full_backup.py backend/tests/test_storage_locations.py -q
.venv/Scripts/python.exe -m ruff check .
```

From frontend:

```powershell
node --import ./scripts/registerSdk.mjs --test tests/instance-profile-render.test.mjs tests/dataset-storage-render.test.mjs
node --import ./scripts/registerSdk.mjs --test src/components/bank/bankProfileMove.test.js src/components/bank/bankBulk.test.js
node --import ./scripts/registerSdk.mjs --test tests/bank-queue-panel-render.test.mjs src/components/bank/bankQueueActions.test.js
node --import ./scripts/registerSdk.mjs --test src/components/bank/bankLayout.test.js
node --import ./scripts/registerSdk.mjs --test src/components/shared/reviewShortcuts.test.js src/components/dataset/DatasetLightbox.test.js src/components/bank/pipelineSteps.test.js src/components/bank/pipeline-ui.test.js tests/bank-review-lightbox-contract.test.mjs tests/bank-decision-bar-contract.test.mjs
npm test
npm run lint
npm run build
```

Full qualification and the synthetic browser check:

```powershell
scripts/gates.ps1 -Phase Gates
node frontend/scripts/bankOtherTagsProbe.mjs
```
