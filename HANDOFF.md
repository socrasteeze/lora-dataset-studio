# HANDOFF

**Updated:** 2026-10-15 | **Target:** main | **Delivery base:** a48c6677d | **Branch:** main

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
