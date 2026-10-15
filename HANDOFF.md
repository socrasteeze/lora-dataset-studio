# HANDOFF

**Updated:** 2026-10-15 | **Target:** main | **Delivery base:** ef0e1084d | **Task branch:** noble/bank-launch-queue-unification

## State

The operator reported starting work inside one Bank, then queuing Launch All from the Bank list. The queued pipeline could start alongside that work, and the workspace job was absent from the queue panel. Source tracing confirmed that the queue checked only its own Bank and GPU flags, while direct jobs lived in a separate activity registry.
The fix bridges running Bank activity into queue waiting and visibility. The existing clean-main delivery and no-test instructions remain in effect. Source and rebuilt frontend are separate delivery commits. No tests, probes, application imports, live jobs or runtime changes ran during implementation.

## Done this session

- Added small active-image-Bank snapshots to bank_jobs, with normalized machine identity. Multi-Bank aliases are counted once; unstarted reservations and the separate video namespace are excluded.
- The queue waits for active Bank work on its machine through all phases, even when the GPU flag is clear. Same-Bank aliases and name groups also block conflicting work across machines. Separate machines remain separate lanes.
- Queue snapshots expose direct work as active_jobs, separate from durable pending/running pipeline entries. The Bank list shows Active Passes even when its pipeline queue is empty, and badges Banks with live workspace work.
- Stop for an active pass uses the existing Bank cancellation endpoint. Stop running covers direct passes and queued pipelines through their owning APIs; Clear waiting leaves direct work alone.
- Kept pass launch settings, pipeline execution, persisted queue schema and job options intact. No data migration or production work was performed.
- Added synthetic regression coverage for the reported ordering with a clear GPU flag, alias/video exclusion, device matching, group exclusion and active-pass rendering/controls. Tests are authored but unrun.
- Updated README, the Guide, help search terms and What's New. Ruff, ESLint, frontend build, whitespace and privacy scans passed. ESLint retains 32 existing warnings. Privacy: 3,000 text files, zero findings. Attribution matches are legitimate code, fixtures or project documentation.

## Open

1. The operator will test on another machine. Do not start or resume local or cloud suites without a new instruction. Commands below are for that machine only.
2. Direct-work queue coordination, populated panel layout, bulk profile moves, full Gates and physical-device behavior remain unqualified by runtime tests. The optional private-name check is unverified. This delivery uses the operator's no-test exception, not a full qualification.
3. Fully stop Studio after saving edits and finishing work, then run `start.bat`. An old supervisor cannot enable the new in-app switching protocol through a backend-only restart. Desktop picker and physical phone/PWA acceptance remain operator checks.
4. Prior cloud runs `38777264998` and `38777264930` were cancelled. Historical frontend results on `51ef21b88` do not qualify the current delivery.
5. After current work finishes, fully restart Studio to load the new backend job bookkeeping. Running jobs were not interrupted during implementation. The diagnosis is source-based; no live job reproduction ran.

## Decisions

- One installation owns one active profile. Each named profile owns its database, settings, credentials and mutable training files; model installations may be shared.
- Default uses existing environment overrides and its last recorded server port. No database, media or settings migration was performed.
- Switching starts from an embedded popup and uses a controlled backend restart. It never terminates jobs. A supervisor capability marker prevents an older supervisor from accepting a request it cannot consume.
- Moving a Bank changes profile ownership of metadata and working files. Its original source directory remains a live dependency. The source working cache is retained for recovery and is not automatically purged.
- A move into a profile that already contains this Bank or the same source folder/scope is refused; metadata is never silently merged. Profile thresholds remain independent.
- Bulk moves commit one Bank at a time and can partly succeed. Resolve a failed or uncertain move through its existing receipt before moving the next Bank.
- Source and bundles remain separate commits. This delivery uses `[skip ci]` under the operator's explicit instruction to publish without running tests.

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
.venv/Scripts/python.exe -m pytest backend/tests/test_bank_queue_direct_work.py backend/tests/test_bank_queue.py backend/tests/test_bank_queue_lanes.py backend/tests/test_bank_queue_device.py backend/tests/test_bank_waits_between_banks.py -q
.venv/Scripts/python.exe -m pytest backend/tests/test_dataset_storage.py backend/tests/test_dataset_routes.py backend/tests/test_bank_promote_to_new_dataset.py backend/tests/test_checkpoint_registry.py backend/tests/test_run_snapshot_compare.py backend/tests/test_full_backup.py backend/tests/test_storage_locations.py -q
.venv/Scripts/python.exe -m ruff check .
```

From frontend:

```powershell
node --import ./scripts/registerSdk.mjs --test tests/instance-profile-render.test.mjs tests/dataset-storage-render.test.mjs
node --import ./scripts/registerSdk.mjs --test src/components/bank/bankProfileMove.test.js src/components/bank/bankBulk.test.js
node --import ./scripts/registerSdk.mjs --test tests/bank-queue-panel-render.test.mjs src/components/bank/bankQueueActions.test.js
npm test
npm run lint
npm run build
```

Full qualification and the synthetic browser check:

```powershell
scripts/gates.ps1 -Phase Gates
node frontend/scripts/bankOtherTagsProbe.mjs
```
