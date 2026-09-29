# HANDOFF

**Updated:** 2026-09-28 · **Branch:** main · **Base:** 41637af13 (+ this handoff commit) · **Tree:** clean

## State
Fork is 0 behind `upstream/v2` (tip `d13337c`) and main carries the merge plus its rebuilt dist.
Full Gates passed locally on the merged tree; nothing is activated on a running instance.

## Done this session
- Upstream sync `4fb77a1..d13337c`, all six source commits adopted — FORK_NOTES.md changelog row 2026-09-28.
- Restored JoyCaption's live caption landing lost in the 2026-09-22 merge — backend/app/services/joycaption.py.
- Removed eight duplicated function definitions that shadowed live code — backend/app/setup_installer.py.
- Replaced the README vast.ai referral link with the fork's no-referral statement (D4 invariant).
- Deleted the merged remote branches `noble/affectionate-thompson-ev89j8` and `noble/desktop-workspace-readability`.

## Open
1. Activate on the live instance (Settings ▸ Update & restart); not performed. Do not serve the new bundle against an old backend.
2. Re-shoot `docs/screenshots/training/runs-hub.png` and `advanced-options.png` on a fork instance; both still show the rental lane — FORK_NOTES.md D4, "The third instance".
3. Physical-phone, real-model training and Docker qualification remain separate, unrun gates.

## Decisions
- Kept BOTH JoyCaption hooks (caller-thread `on_caption`/`progress` and reader-thread `on_progress`) over either alone — the fork persists live, upstream's new test needs a reader-thread counter.
- Fixed upstream's red tests by widening doubles (`**_kw`) and stubbing `bank_jobs.bump`, never by narrowing the product call.
- Folded upstream's Patreon badge into the fork's badge row over adding a second Discord badge.
- CHANGELOG.md left untouched: its header freezes it; release notes come from whatsNew.js.

## Traps
- ruff F811 does NOT catch duplicated top-level defs here; run the AST scan in FORK_NOTES.md D9 after any sync touching long modules.
- A stale `.venv` or `node_modules` produces thousands of setup errors (missing `tuf`, `parse5`); sync both from the manifests before trusting a baseline.
- `upstream_sync.ps1` stops at the first red step, so a red frontend hides the backend baseline entirely.
- Upstream commits marked "tests intentionally not run" arrive with their own suite red; expect test-double fixes.

## Verify
```powershell
pwsh -File scripts/upstream_sync.ps1 -Phase Quick
pwsh -File scripts/upstream_sync.ps1 -Phase Gates
.venv/Scripts/python.exe -m ruff check .
cd frontend; npm run lint; npm test
```
