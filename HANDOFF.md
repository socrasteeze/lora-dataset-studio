# HANDOFF

**Updated:** 2026-09-20 · **Branch:** `main` · **Qualified code:** `aa173b437` · **Tree:** clean

## State
The V2 source migration is qualified on main. Live data, running services and external media have not been switched or modified.

## Done this session
- Source integration and fork fixes: `f32e6acb1`; separate source-built frontend: `aa173b437`.
- Backend: 9,862 passed, 23 skipped. Frontend on Node 24.21.0: 5,043 core + 1,109 bundled passed, four skips.
- Both linters pass; frontend retains 40 warnings. Privacy/ASCII: 13 passed, two optional private-name skips; working-tree and archive pattern scans found no sensitive data.
- Ten curated plugins boot in the extracted release ZIP without environment profile overrides; held/excluded packages are absent.
- Eight rendered routes and the Bank Python picker passed desktop/mobile checks; the picker covered five widths with stubbed calculation results.
- A synthetic legacy database survived two V2 starts with IDs, captions, decisions, tags and paths intact; an independent old-state rollback copy booted under old code.

## Open
1. Before live cutover, inventory and protect external media, drain work, stop writers and take a fresh complete state snapshot.
2. Rehearse migration and rollback on an isolated copy of the actual installation, with writable paths/endpoints remapped and dispatch blocked.
3. Verify local generation/training and owned-machine routing on the intended machines before accepting live cutover.
4. Docker recipes and staging tests pass, but no Docker image was built locally because the CLI is unavailable.

## Decisions
- `fork-plugins.json` is authoritative: ten enabled sources, Civitai publisher held, API engines and rental training excluded.
- Normal frontend build selects the fork profile; backend reads its build marker. Store archives cannot replace fork-owned sources.
- Core repair recipes remain fallback primitives; discovered disabled owners block resolution, preflight and enqueue.
- Core Help wording and historical news remain canonical; duplicate source-plugin guide sections cannot overwrite fork docs.
- Mixed local tests were retained. A deleted-plugin marker is not evidence that a whole test file is obsolete.
- The temporary Git replacement was removed; its object remains under local `refs/migration/v2-content-base`. Published commits keep real ancestry.

## Traps
- `create_app()` changes schema and state. Never use production data for an import or smoke test.
- Use `npm test`; bare Node discovery omits the SDK loader and bundled suite.
- Core `app.services.cloud_training` is local training; deleted `lds_cloud_training` is the rental product.
- Test direct app factories must isolate plugin and extension directories as well as database/configuration paths.
- Use distinct short pytest basetemps; keep live services and model downloads outside test runs.
- Upstream is read-only. Do not use its fork-refusing migration helper or carry its generated frontend.

## Verify
Set LDS_DATA_DIR, LDS_CONFIG and LDS_ENV to a disposable root before backend commands.
```powershell
.venv\Scripts\python.exe -m pytest backend/tests -q -n 8 --dist loadfile --basetemp=D:/tmp/lds-final
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m pytest backend/tests/test_no_personal_data.py backend/tests/test_windows_scripts_are_ascii.py -q
& 'C:/Program Files/Git/bin/bash.exe' scripts/scan-sensitive.sh
cd frontend
npm test
npm run lint
npm run build
```
The final frontend gate used Node 24, matching CI. Runtime archive construction uses `packaging/release_bundle.py` from a committed tree, followed by `scripts/check_release_artifacts.py <archive>`.
