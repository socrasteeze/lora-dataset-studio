# HANDOFF

**Updated:** 2026-09-20 · **Branch:** `main` · **Qualified code:** `aa173b437` · **Tree:** clean

## State
The V2 source migration is qualified on main. Live data, running services and external media have not been switched or modified.

## Done this session
- Source integration and fork fixes: `f32e6acb1`; separate source-built frontend: `aa173b437`.
- Latest full driver gate: 9,977 host/tooling tests passed, 24 skipped, 106 subtests passed; 182 isolated bundled Python tests passed. Frontend: 6,152 passed, four skips on Node 24.
- Both linters pass; frontend retains 40 warnings. The 46-second Quick gate now stops before expensive runs on failure; All runs one full qualification, not a duplicate baseline/gate pair.
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
Use Node 24 and the pinned `.venv`. The driver isolates data/configuration, uses
unique short scratch directories, restores environment overrides and cleans up.
```powershell
# Before an upstream merge, on the untouched tree:
pwsh -File scripts/upstream_sync.ps1 -Phase Baseline
# During repair (not release qualification):
pwsh -File scripts/upstream_sync.ps1 -Phase Quick
# Freeze edits, then qualify once before landing:
pwsh -File scripts/upstream_sync.ps1 -Phase Gates
& 'C:/Program Files/Git/bin/bash.exe' scripts/scan-sensitive.sh
```
The full host/tooling run measured 390 seconds. Small timing receipts remain under
the checkout's Git metadata; they are not cached qualification. Details and the
remaining profiling opportunity are in `docs/UPSTREAM_SYNC.md`.
