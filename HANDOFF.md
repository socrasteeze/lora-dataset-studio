# HANDOFF

**Updated:** 2026-10-15 | **Target:** main | **Delivery base:** 50b7bc8d9 | **Task branch:** noble/bulk-bank-profile-moves

## State

Bulk Move to Profile in the Bank list extends the in-app profile popup and verified single-Bank transfer already delivered on main. The operator explicitly authorized a clean push to main without tests. Source and rebuilt frontend are separate delivery commits.
No local or cloud tests, responsive probes, application imports, live profile switches or real Bank moves ran for this change. The live runtime and profile registry remain untouched by implementation work.

## Done this session

- Added Move to Profile beside Edit Banks and Delete Banks in the list selection toolbar. Existing selection spans pages and filters and keeps its 500-Bank limit. Narrow layouts use two columns; wider layouts keep the actions on one row.
- Extended the existing Profiles popup with a stable selection snapshot, Bank progress/results and destination creation before the first submission. The destination stays fixed during retries.
- Each Bank uses the existing verified transfer endpoint sequentially. The backend still owns metadata preservation, cache verification, ID rebinding, promotion history and recovery. Source images stay in place. No backend or schema change was needed.
- Acknowledged moves leave the source list and selection immediately. Failed, unconfirmed and unprocessed Banks remain selected. Retry skips acknowledged moves and reuses the same operation IDs. A failed move or invalid acknowledgement stops the batch before the next Bank so later promotion-history changes cannot invalidate an unfinished transfer snapshot.
- Protected busy/unconfirmed moves against navigation and browser exit. Paused the Bank list queue poll while the profile popup is open so it does not contend with the transfer gate.
- Updated both Guide topics, README, help search terms and What's New. Added synthetic unit coverage for sequential execution, partial failures, exact retries and invalid acknowledgements, plus bulk popup render coverage. Tests are authored but unrun.
- Ruff, ESLint, frontend build, whitespace and privacy scans passed. ESLint retains 32 existing warnings. Privacy: 2,999 text files, zero findings. Attribution matches are legitimate code, fixtures or project documentation.

## Open

1. The operator will test on another machine. Do not start or resume local or cloud suites without a new instruction. Commands below are for that machine only.
2. Bulk selection/move/retry, profile switching, Bank move/recovery, full Gates and populated responsive behavior remain unqualified by runtime tests. The optional private-name check is unverified. This landing is an explicit operator exception, not a full qualification.
3. Fully stop Studio after saving edits and finishing work, then run `start.bat`. An old supervisor cannot enable the new in-app switching protocol through a backend-only restart. Desktop picker and physical phone/PWA acceptance remain operator checks.
4. Prior cloud runs `38777264998` and `38777264930` were cancelled. Historical frontend results on `51ef21b88` do not qualify the current delivery.

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
.venv/Scripts/python.exe -m pytest backend/tests/test_dataset_storage.py backend/tests/test_dataset_routes.py backend/tests/test_bank_promote_to_new_dataset.py backend/tests/test_checkpoint_registry.py backend/tests/test_run_snapshot_compare.py backend/tests/test_full_backup.py backend/tests/test_storage_locations.py -q
.venv/Scripts/python.exe -m ruff check .
```

From frontend:

```powershell
node --import ./scripts/registerSdk.mjs --test tests/instance-profile-render.test.mjs tests/dataset-storage-render.test.mjs
node --import ./scripts/registerSdk.mjs --test src/components/bank/bankProfileMove.test.js src/components/bank/bankBulk.test.js
npm test
npm run lint
npm run build
```

Full qualification and the synthetic browser check:

```powershell
scripts/gates.ps1 -Phase Gates
node frontend/scripts/bankOtherTagsProbe.mjs
```
