# HANDOFF

**Updated:** 2026-10-04 | **Branch:** main (local delivery target) | **Base:** 669df5f79

## State
PixAI delivery includes reviewed source and its rebuilt frontend bundle for the user-authorized local main merge. The latest origin/main plan is integrated. No push or restart is part of this delivery.
The user explicitly waived the main validation hold for this local merge. Tests, responsive probes and Gates remain deferred; the work is not fully qualified.

## Done this session
- Reviewed the remaining local PixAI source, tests, config and frontend changes for delivery.
- Replaced workstation-specific defaults with app-relative model storage; preserved the original model parent in ignored local configuration. No weights moved or downloaded.
- Added Setup package ownership and shared dependency bounds; expanded the isolated dependency probe.
- Added the settings reference, help topic and What's New entry for local booru captioning.
- Reconciled the incoming integration-removal plan without executing its future work.

## Open
1. Run the exact merged commit through cloud validation when the user resumes tests. Tests and rendered checks were not run for this delivery.
2. Install and qualify PixAI only with explicit permission. Weights remain absent; CPU/CUDA inference and model compatibility are unverified.
3. Validate PixAI dataset storage, Caption Lab, protected-caption recovery and partial failures with isolated fixtures.
4. Validate the offline runtime and shared local/peer API contracts; startup health is not proof of complete network isolation.
5. Reconcile legacy scraping/publishing fixtures with the offline profile. Do not restore excluded features to satisfy old expectations.
6. Continue the removal work only under a new implementation instruction; PLAN.md is a future plan.

## Decisions
- The user requested all remaining local changes, including PixAI, to be committed and merged into local main before cloud Gates. This is a local merge waiver, not a passing validation result or push authorization.
- PixAI stays a dataset-only booru backend. Auto, WD14 tags, Concept and prose captioning retain existing behavior.
- Setup preparation requires an explicit Install click and uses an isolated interpreter. Runtime uses local snapshots with offline guards.
- Source and frontend/dist remain separate commits in the same delivery.

## Traps
- Do not run tests, responsive probes, fixture-backed checks or Quick/Gates locally without explicit permission.
- Isolate LDS_DATA_DIR, LDS_CONFIG, LDS_ENV, LDS_PLUGINS_DIR and LDS_EXTENSIONS_DIR before importing the app for tests. Vite writes require an isolated API target.
- Preserve the curated ten-plugin offline distribution and the SDK public boundary. Do not restore online generators, rentals, scraping or publishers.
- The app serves frontend/dist from disk. Keep source and bundle together in delivery; preserve runtime data and local configuration.
- No browser opening, restart, model download or GPU job is authorized by this commit/merge instruction.
- Populated fixtures are required for rendered checks. Skipped states are not passes; keep thresholds and coverage intact.

## Verify
Delivery checks passed: frontend build, Ruff, frontend lint (32 existing warnings, no errors), syntax of nine changed Python files, reviewed outbound inventory and diff checks. The privacy scan checked 3049 text files with zero findings. Attribution candidates were technical provenance, scrub fixtures or history; no unresolved authorship attribution remains. The optional private-name list is unconfigured.
Tests, responsive probes and Gates: not run. Existing recorded test results are not validation of this PixAI delivery.

The following test commands require cloud execution or explicit local-test permission:

```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_pixai_tagger.py backend/tests/test_caption_provenance.py backend/tests/test_setup_installer.py backend/tests/test_no_personal_data.py backend/tests/test_fork_outbound_gate.py -q
Set-Location frontend
npm test
npm run probe:responsive -- --url http://127.0.0.1:5173/#/settings
npm run probe:responsive -- --url http://127.0.0.1:5173/#/setup
Set-Location ..
pwsh -File scripts/gates.ps1 -Phase Gates
```
