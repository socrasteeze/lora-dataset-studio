# HANDOFF

## Current: integrate/2026-10-01 (2026-10-01)
- PLAN.md is the execution plan for what follows (detach, prune, UI consistency). It supersedes PLAN_BRIEF.md, which is deleted. Wave 0 of the plan is landing this branch.
- Agent-rules audit applied in `7e9f69f73`: `.claude/rules/release-mechanics.md` now states the real CI trigger and the warn-only release dist check; AGENTS.md no longer names a Codex cloud task.
- Branch `integrate/2026-10-01`, pushed to origin. Main is still `f3815e82e`; it was NOT fast-forwarded because the gates failed.
- Merged (no-ff) onto main `f3815e82e`: `fix/config-isolation` (restored autouse `_isolate_user_state`, FORK_NOTES D5), `noble/bank-queue-stop` (queued Bank runs can be stopped while active), `fix/settings-copy-restore` (Klein pin wording, usage-statistics entry withdrawn, Pick a balanced set opens Curate). Bundle `f3d66ad2c`.
- Review fix `e14ed5585`: `captionStepNote` returns null for a step with `superseded_at`, so a standalone Caption re-run clears "N not captioned" and "needs attention". Test in `pipelineVerdict.test.js`. Bundle `21db95291`.
- Stale branches `fix/config-isolation`, `fix/settings-copy-restore`, `noble/bank-queue-stop` are NOT deleted yet; delete them with the integrate branch once main lands.

### Gate results at `21db95291`
The run happened on this Windows machine, not in the cloud: the "remote" agent request ran locally. Treat it as local evidence only. Docker is not installed here, so the Docker smoke test did NOT run.
- PASS: ruff 0.16.4; `npm run lint` (0 errors, 30 warnings); `npm run build`; `check_release_artifacts.py`; 6 bundled-plugin suites in separate processes; `testBundled.mjs` (1162 pass, 4 skip); `test_no_personal_data`, `test_fork_outbound_gate`, `test_config_isolation` (22 pass, 2 skip: no private-name list, so the name scan did not run).
- FAIL `npm test`, 2 tests, both reproduce alone and are already on main by content:
  - `frontend/src/pages/SetupPage.contract.test.js:76` regex expects `['ready', 'skipped']`; `SetupPage.jsx:1519` now has `'ignored'` too (f1bbcd3cf).
  - `frontend/tests/plugin-framework-guide.test.mjs:20` wants `tagging-wd14` in `CORE_GUIDE_ANCHORS['settings-reference']` (`frontend/src/help/guideHosts.js`); the heading came in fb4ec40a4.
- FAIL host suite: `backend/tests/test_setup_state.py::test_tracked_local_engine_is_not_a_regression_while_comfyui_is_down`. Its `SimpleNamespace` engine spec lacks `counts_as_recommended`. Reproduces alone and at main `f3815e82e`.
- Isolation gap, also on main: with `LDS_PLUGINS_DIR` set for the whole run, `test_static_mime_types.py` and `test_bank_pass_write_lock.py` call `create_app()` without their own plugins dir, so xdist workers collide on `admission.lock` (`StorageError: Another process is preparing...`). Each passes alone; with the variable unset only the setup_state failure remains (10472 pass). Fix: per-test `LDS_PLUGINS_DIR`, or redirect it in the autouse fixture (see item 11).
- Install trap: `pip install -r requirements-dev.txt -r requirements-torch-tests.txt` in ONE command fails, because the torch file's `--index-url` replaces PyPI. Install them in two commands.
- The three failing tests are fixed in `bccf53d6c` (bundle `a93882c91`); not yet re-run. Docker is out of scope: the user does not use it.
- Next: re-run the gates at `a93882c91` in a real cloud environment, then fast-forward main and delete the four branches.

### Open low-severity review notes
- `backend/app/capabilities.py:54` `_POSITIVE_IMPORT_TTL = 24 * 3600` keeps a JoyCaption "ready" verdict for 24 h, so an uninstall or a broken env reads as ready for up to a day.
- `frontend/src/pages/BankPage.jsx:590` `cancelQueued`: the confirm reads a queue snapshot polled every 2 s. A ✕ on a row still shown as waiting can cancel a run that just started, without the running-row confirm.
- `frontend/src/index.css:346` `.bank-tile__actions`: on touch the full-width 40px strip covers the tile bottom and blocks tap-to-select there.
- The bank list payload `_report_steps` (`backend/app/services/image_bank_service.py:3052`) drops `counts`, `blocked` and `superseded_at`. List tiles therefore never show the caption note, and judge "blocked" from prose only.

## Previous session

**Updated:** 2026-09-29 · **Branch:** main · **Base:** c49e5b67e · **Tree:** clean

## State
`origin/main` holds this session's Bank phone header and outbound lockdown (FORK_NOTES.md D12), with another session's 8 commits on top.
No tests ran on the tip, and the final lockdown commit ran none locally at all; Gates run separately on another machine.

## Done this session
- Bank header at 360×800 went from 234 px to 123 px: counters fold into ⚙ Passes below `sm`, and action buttons never shrink or wrap — `frontend/src/components/bank/BankWorkspace.jsx`.
- Update checks run only on click; the upstream-ahead check is deleted; the plugin store is off — FORK_NOTES.md D12.
- Google Fonts replaced by bundled `@fontsource` fonts — `frontend/src/main.jsx`.
- Startup no longer resumes vast.ai rentals or runs `pip` for Pillow — `backend/app/__init__.py`, `backend/run.py`.
- Outbound review gate with an exact-match inventory — `backend/tests/test_fork_outbound_gate.py`, `fork_outbound_inventory.json`.

## Open
1. Run Gates at `c49e5b67e` on the other machine. The full backend suite has not run for any D12 commit.
2. Re-run the Bank probe: `883467b46` ("first images above the fold", another session) changed the header after the 123 px measurement.
3. Activate on the live instance: pull, then restart. The update badge no longer checks by itself; press Check for updates. Do not serve the new bundle against an old backend.
4. Done in `72380e23c` (merged via `fix/settings-copy-restore`): the usage-statistics entry is withdrawn.
5. Drop the store's "Retry catalog" button; it can only return the store-off message — `frontend/src/pages/store/Catalog.jsx:56`.
6. Re-shoot `docs/screenshots/training/runs-hub.png` and `advanced-options.png` on a fork instance; both still show the rental lane — FORK_NOTES.md D4.
7. Physical-phone, real-model training and Docker qualification remain separate, unrun gates.
8. Merged into `integrate/2026-10-01`; `test_config_isolation.py` passes (5/5). Original note: branch `fix/config-isolation` restores the autouse `_isolate_user_state` fixture that merge `891d61e33` dropped — FORK_NOTES.md D5. It is local and unpushed; no tests ran locally. Push it, then start CI by dispatch or a PR (item 9). Pass means the four `backend/tests/test_config_isolation.py` cases go green. Then carry it to `noble/bank-queue-stop`, which fails the same four. The `4af9136c7` message wrongly says upstream deleted the test; a squash before pushing keeps that out of history, and FORK_NOTES cites no SHA, so either way is safe.
9. Still open. Decide the CI push trigger. `.github/workflows/ci.yml:12` has read `branches: [v2]` since `891d61e33`, so no push to `main` starts CI. Restore `[main]`, or keep CI dispatch-only on purpose.
10. After item 8 is green, restore `assert not path.exists()` in `test_every_test_reads_an_isolated_config` (`f32e6acb1` loosened it, `backend/tests/test_config_isolation.py:28-29`) and confirm on CI.
11. The autouse fixture redirects `LDS_CONFIG`, `LDS_DATA_DIR` and `LDS_ENV` but not `LDS_PLUGINS_DIR` or `LDS_EXTENSIONS_DIR`, which AGENTS.md also lists; only `create_test_app` covers those. The gap predates `891d61e33`.
12. Between `891d61e33` and the fix landing, any plain local pytest run outside Gates could write the checkout's real `config.json`, `data/` and `.env`. Nobody has inspected them yet.

## Decisions
- Exact-match review gate over a runtime egress block — the user's choice; a block would break click-driven HF export, the scraper and downloads.
- Store switched off by `store_switched_off()` returning a literal `True`, with a conftest override for the 8 upstream store suites, over deleting store code — keeps syncs conflict-free.
- Kept `legacy_cloud_recovery.start` and `ensure_pillow_consistent`, uncalled, over deleting them — upstream tests exercise them; the gate pins that startup never calls them.
- An update check without `force` returns the last explicit answer or `ok:false`, not `ok:true` — otherwise the UI reads "up to date" without having checked.
- Bank counters moved into ⚙ Passes rather than hidden — they stay one tap away. The action row stays one scrolling line because two rows measure about 27% of the fold.
- Pushed to main without local tests, on the user's instruction.

## Traps
- ruff F811 misses duplicated top-level defs; run the AST scan in FORK_NOTES.md D9 after syncs that touch long modules.
- Worktrees have no `.venv`: `scripts/scan-sensitive.sh` exits 127 there, so run its heredoc with the main checkout's interpreter. `npm install` re-sorts devDependencies in both `package.json` and the lockfile; restore the order. Several sources are CRLF in the repo; preserve line endings.
- `upstream_sync.ps1` stops at the first red step, so a red frontend hides the backend baseline. Upstream commits marked "tests intentionally not run" arrive red.
- Update-check tests must stub `is_git_checkout`: the checkout is a git repo, so `?force=1` would run a real `git fetch`.
- The runtime outbound test only sees sockets in the TESTING app. It misses subprocesses (git, pip, inference) and production-only boot threads; the inventory is the only cover there.
- Probe coverage of the Bank caption-lab states changes between runs on identical code; a skipped state there is timing, not a regression.

## Verify
```powershell
pwsh -File scripts/upstream_sync.ps1 -Phase Quick
pwsh -File scripts/upstream_sync.ps1 -Phase Gates
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m pytest backend/tests/test_fork_outbound_gate.py -q
.venv/Scripts/python.exe backend/tests/fork_outbound_scan.py --write   # only after reviewing a gate diff
cd frontend; npm run lint; npm test
cd frontend; npm run probe:responsive -- --url http://127.0.0.1:5173/#/bank   # isolated backend + LDS_DEV_API_TARGET, see AGENTS.md
```
