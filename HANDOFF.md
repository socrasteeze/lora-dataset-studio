# HANDOFF

## Current repair: Bank queue Stop (2026-09-30)
- Branch: `noble/bank-queue-stop`, base `a8142c334`; source and bundle are prepared for validation transport.
- Exempted `bank.bank_queue_remove` from the busy-write guard. Queue cancellation can reach the existing stop handler while the pipeline owns the Bank; other writes remain protected.
- Added four regression cases in `backend/tests/test_bank_queue.py`, a What's New entry and a rebuilt fork bundle.
- Verified: `git diff --check`, full Ruff, frontend lint (0 errors, 30 warnings in unchanged files), frontend build.
- Pending: queue, reservation, pipeline, privacy and changelog tests, plus full cloud delivery Gates. The user authorized a separate cloud validation task; no local tests ran.
- Both scrub passes found no unresolved findings. The privacy scanner checked 3,113 tracked and untracked text files; broader hits are synthetic fixtures and Docker hostnames.
- Keep main unchanged until cloud Gates pass. Activation needs a backend restart; no restart occurred.

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
4. Remove or reword the "usage statistics" What's New entry and the Settings search terms that point at it; no code implements it — `frontend/src/whatsNew.js:335`, `frontend/src/components/settings/registry.js:48-50`.
5. Drop the store's "Retry catalog" button; it can only return the store-off message — `frontend/src/pages/store/Catalog.jsx:56`.
6. Re-shoot `docs/screenshots/training/runs-hub.png` and `advanced-options.png` on a fork instance; both still show the rental lane — FORK_NOTES.md D4.
7. Physical-phone, real-model training and Docker qualification remain separate, unrun gates.

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
