# HANDOFF

**Updated:** 2026-09-20 · **Branch:** `feat/v2-integration` · **Base:** `d51efc88a` · **Tree:** dirty; merge from origin/main pending

## State
V2 migration repairs are in the working tree. Frontend and rendered UI qualification pass; the final backend gate is in progress. Delivery commits and publication follow the final qualification gates.

## Done this session
- Restored actual plugin route registration, startup ownership, local restoration dispatch, Caption Lab parity and capability probes.
- Completed installer admission/FIFO, managed Python verification, node preparation and companion model downloads.
- Added a curated ten-plugin fork profile, archive replacement refusal, and matching frontend/backend build marker.
- Ported Video routes, checkpoint/lineage UI and folder reuse to local-only plugin owners; held publisher remains excluded from the profile.
- Preserved mixed local tests, restored cache/disabled-owner regression coverage, and updated moved-owner contracts.
- Frontend: 5,043 core + 1,109 bundled passed, four bundled skips. Privacy/ASCII: 13 passed, two optional private-name skips.

## Open
1. Finish final backend gate after the plugin blueprint fix; do not land a red tree.
2. Finish isolated rendered UI smoke and address any actual runtime errors.
3. Complete fork runtime packaging: root policy and curated source plugins must ship together; stock Store exclusions cannot drop required runtime files.
4. Rebuild dist from final fork source, run both linters, local-only contracts, privacy scan and final suites.
5. Review all source changes and update migration docs; commit source separately from the generated frontend bundle.
6. Push/land only after qualification. Live copied-state migration, rollback rehearsal, media recovery and live machine tests remain separate cutover gates.

## Decisions
- Ten enabled sources in `fork-plugins.json`; Civitai publisher stays on hold, API engines and rental training stay excluded.
- Normal frontend build selects the curated fork; backend reads its marker unless a test/development profile is explicit.
- Core repair recipes remain fallback primitives; a discovered disabled owner must block resolution, preflight and enqueue.
- Core Help wording and historical news remain canonical. Bundled duplicate guide sections cannot overwrite fork docs.
- Remove only tests for rejected functionality. The prior handoff's blanket instruction to delete 30 marked files was wrong for mixed local suites.

## Traps
- Never boot against production data: `create_app()` migrates, backfills and cleans state.
- Use `npm test`; bare Node discovery omits the SDK loader and bundled suite.
- Core `app.services.cloud_training` is local training. Deleted `lds_cloud_training` is the rental product.
- A loaded Python registry does not prove a working frontend: `/api/plugins/` must return 200 and expose the same enabled set.
- Use distinct short pytest basetemps. A killed worker requires isolated replay before attribution.
- Upstream remains read-only; never carry its generated dist or use its fork-refusing migration helper.

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
