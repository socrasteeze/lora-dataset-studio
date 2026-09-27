# HANDOFF

**Updated:** 2026-09-27 · **Branch:** `main` · **Base:** `3f7f3b3` · **Tree:** clean

## State
Fork is current with `upstream/v2` (0 behind at `4fb77a1`). Two syncs landed on main this session; nothing in flight.

## Done this session
- Synced `8b76628..db72abf` (Camera angles workspace, video picker virtualization) — `fbf7625`, dist `b70ebc3`.
- Synced `db72abf..4fb77a1` (Python picker dismissal, GitHub #73) — `a11ec39`, dist `3f7f3b3`.
- Fixed `APP_RELEASE_CHANNEL` being fused onto a comment line (the release workflow's grep needs it) — `backend/app/version.py`.
- New Divergence 5 carrier: Pexels contract test kept fork-side — `bundled/scrape/tests/scrapeSettings.contract.test.js`, see FORK_NOTES D5.

## Open
1. Delete the landed branch `noble/affectionate-thompson-ev89j8` from GitHub. It is fully contained in main; this container's git proxy drops branch-delete pushes.
2. Before live cutover, inventory and protect external media, drain work, stop writers and take a fresh complete state snapshot.
3. Rehearse migration and rollback on an isolated copy of the actual installation, with writable paths/endpoints remapped and dispatch blocked.
4. Verify local generation/training and owned-machine routing on the intended machines before accepting live cutover.
5. Docker recipes and staging tests pass, but no Docker image has been built (the CLI was unavailable).

## Decisions
- Upstream's What's-new entries `2026-09-26-windows-dataset-forge` and `2026-09-26-cloud-video-release-compatibility` are rejected. They were re-offered in the 09-27 conflict and dropped again; expect them to come back.
- Video `2026-09-26-video-publishing-help` news entry is kept. Its topic requires `civitai_publish`, which is held, not excluded.
- Test-contract conflicts are resolved fork-side unless the merged source changed the asserted shape (e.g. the `VideoPickerGrid` grid count took upstream's).
- `publicPluginFixtures.mjs` includes `qwenDataset` (enabled here). The fixture still omits the api_engines, cloud_training and civitai_publish descriptors.
- `fork-plugins.json` is authoritative: ten enabled sources, Civitai publisher held, API engines and rental training excluded.
- Upstream's release `APP_VERSION` literal is never copied: recompute as `<date>+fork`.

## Traps
- `upstream/main` no longer exists; fetch `v1`/`v2` explicitly (see `docs/UPSTREAM_SYNC.md` top). A plain `--prune` makes the window read "0 incoming".
- Linux containers carry a fixed floor: backend 105 failed / 1076 errors (path separators, `dlss5: incompatible`). Diff failure IDs against a pre-merge baseline; never read totals.
- `download.pytorch.org` is blocked in the cloud container, so the Torch test overlay cannot install there. Baseline and post-merge still compare on the same env.
- `create_app()` changes schema and state; use disposable `LDS_DATA_DIR`/`LDS_CONFIG`/`LDS_ENV` with `TESTING=True` for an import check.
- `npm test` runs core and bundled suites; bare `node --test` misses the SDK loader and `testBundled.mjs`.
- Upstream bundles (`build(frontend):`) are never taken: restore the fork's `frontend/dist`, then rebuild in its own commit.

## Verify
```powershell
# Pinned venv (both lines), then from the repo root:
.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
.venv/Scripts/python.exe -m pip install --no-cache-dir -r backend/requirements-torch-tests.txt
pwsh -File scripts/upstream_sync.ps1 -Phase Baseline   # before any merge
pwsh -File scripts/upstream_sync.ps1 -Phase Quick      # during repair
pwsh -File scripts/upstream_sync.ps1 -Phase Gates      # once, before landing
# Manual equivalents (CI's own lint commands):
ruff check .
cd frontend; npm run lint; npm run build; npm test; cd ..
.venv/Scripts/python.exe -X utf8 -m pytest backend/tests scripts/tests -n 8 --dist loadfile -q -rf
```
