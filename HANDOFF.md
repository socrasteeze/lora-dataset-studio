# HANDOFF

**Updated:** 2026-10-15 | **Branch:** noble/named-profiles | **Base:** 1b226c740 | **Tree:** clean after this handoff commit

## State

Named profiles and dataset storage are implemented; code head `51ef21b88` is on origin and draft PR #4.
Cloud runs `38777264998` and `38777264930` are confirmed cancelled. The operator will validate on another machine. Main and the live runtime remain unchanged.

## Done this session

- Added the picker in `backend/profile_launcher.py`; Default retains existing paths and named profiles start empty.
- Added a private registry, stable ports and an OS lease before app imports in `backend/instance_profiles.py` and `backend/run.py`.
- Isolated named-profile training exports, outputs, jobs, deployed LoRAs, automatic discovery, cleanup and trigger renaming. Default keeps its original training paths.
- Added five-digit dataset folders with legacy compatibility, host browsing, creation-form links and checkpoint/restore path corrections.
- Ruff, ESLint, frontend build, whitespace and privacy checks passed. ESLint retains 32 warnings. Privacy: 2,991 files, zero findings. No new attribution was found.
- Cloud frontend on `51ef21b88`: 5,191 core and 1,063 bundled tests passed; 14 bundled skips. Guide-anchor and router-fixture failures were corrected. No local tests ran.

## Open

1. The operator will test on another machine. Do not start or resume local or cloud suites without a new instruction. Commands below are for that machine only.
2. Backend/profile isolation, full Gates and populated responsive checks remain unqualified. The optional private-name check is unverified. Keep draft PR #4 and main held until required evidence exists.
3. Desktop picker, physical phone/PWA acceptance and the live restart remain operator checks. Save edits and finish work before stopping Studio and selecting another profile.

## Decisions

- One installation owns one active profile. Each named profile owns its database, settings, credentials and mutable training files; model installations may be shared.
- Default uses existing environment overrides and its last recorded server port. No database, media or settings migration was performed.
- Switching happens outside the running app. The picker refuses live servers and unresolved work; it never terminates jobs.
- Source and bundles remain separate commits. This handoff commit uses `[skip ci]` and stays local unless the operator requests a push.

## Traps

- Keep `.lds-profiles/`, configuration and credentials out of Git. No real profile registry was created during implementation.
- `create_app()` changes schema/runtime state. Isolate all five LDS runtime paths before imports and clear inherited profile identity for validation.
- The app serves the rebuilt frontend immediately. The running backend stays old until restart; no production restart was performed.
- Historical receipts do not qualify this head. Stopping suites does not waive the repository's main publication gate.

## Verify

For the other machine only. Use the pinned Python environment and Node >=22.22. Install the documented dev and CPU Torch test overlays first.

```powershell
git fetch origin
git switch noble/named-profiles
git pull --ff-only origin noble/named-profiles
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
.venv/Scripts/python.exe -m pytest backend/tests/test_dataset_storage.py backend/tests/test_dataset_routes.py backend/tests/test_bank_promote_to_new_dataset.py backend/tests/test_checkpoint_registry.py backend/tests/test_run_snapshot_compare.py backend/tests/test_full_backup.py backend/tests/test_storage_locations.py -q
.venv/Scripts/python.exe -m ruff check .
```

From frontend:

```powershell
node --import ./scripts/registerSdk.mjs --test tests/instance-profile-render.test.mjs tests/dataset-storage-render.test.mjs
npm test
npm run lint
npm run build
```

Full qualification and the synthetic browser check:

```powershell
scripts/gates.ps1 -Phase Gates
node frontend/scripts/bankOtherTagsProbe.mjs
```
