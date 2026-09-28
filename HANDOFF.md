# HANDOFF

**Updated:** 2026-09-28 | **Branch:** `noble/bulk-bank-management` | **Base:** `bd0c7f9d8`

## State
Bulk Image Bank editing and deletion are implemented in the attached worktree.
The full landing gate passed. Source and rebuilt frontend land as separate commits.
The live app remains on the previously delivered mobile workflow.

## Done
- Select individual banks, including grouped members, across filtered results; show hidden selections and enforce a 500-bank limit.
- Edit individual names, apply literal replacement/prefix/suffix, and change name grouping.
- Confirm bulk deletion with named source paths and explicit source/Trash effects.
- Bind requests to stable bank identities; refuse stale, queued and running banks.
- Keep partial failures and exact-request retries in the dialogs; guard unsaved edits and browser navigation.
- Preserve external source images; use existing Trash behavior for managed imported copies.
- Add help, Guide, What's New, README and a Bank-list mode to the responsive probe.

## Verification
- Backend and privacy: 101 passed, 2 skipped. Optional private-name coverage has no supplied list.
- Full landing gate: 10,361 backend/tooling tests and 106 subtests passed, with 22 tests skipped; all 244 bundled Python tests passed.
- Frontend: 5,129 core and 1,162 bundled tests passed; 4 bundled tests skipped.
- Both linters passed with no errors; frontend retains 44 existing warnings.
- Production build passed. Isolated compiled-browser workflow: 7 scenarios passed with no page errors.
- Responsive probe: 15 states passed across five viewports, with zero findings or skips.
- Button geometry: 21 rows passed across seven viewports; equal widths, aligned rows, 40px targets and no horizontal background shift.
- Privacy scanner: no findings in tracked or publishable untracked text.
- Logs and synthetic screenshots remain under ignored data/bulk-bank-* in the worktree.

## Delivery
Clean publication to origin/main is authorized and the complete landing gate passed.
Activation has not been performed for this follow-up. Do not serve the new bundle against the old backend.
The primary checkout stays on the prior build until an authorized update and restart.
The previous mobile wave remains deployed at build efe277cc7; main includes its bd0c7f9d8 evidence commit.

## Boundaries
- Preserve the primary checkout's unrelated upscale-tests.md.
- No live data was edited or deleted by these tests.
- Physical phone, real-model training and Docker qualification remain separate.
- Upstream is read-only. Test instances must isolate all five LDS state paths.
