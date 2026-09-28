# HANDOFF

**Updated:** 2026-09-28 | **Branch:** `noble/mobile-dataset-workflow` | **Base:** `d9436f78c`

## State
Mobile workflow fixes are implemented and verified on isolated browser fixtures.
Local commits are authorized. The compiled frontend is kept in an isolated checkout;
live activation still awaits the user's answer.

## Done this session
- In-app host-drive browsing replaces native-first Dataset imports; shared Bank picker improved.
- Durable per-file import queue and atomic server receipts; UUIDs reject stale recovery after ID reuse.
- Shared caption drafts, guarded exits, touch controls and guidance for all dataset kinds.
- AGENTS.md is canonical; CLAUDE.md points to it. Guide/help/news/fork notes updated.
- Frontend 6,282 passed / 4 skipped; 15/15 responsive dialog states; 10/10 IndexedDB scenarios.
- Staged build and compiled mobile workflow passed. Detailed evidence: docs/MOBILE_WORKFLOW.md.

## Open
1. Resolve the pending activation choice. Live LDS is running; do not silently swap its bundle or restart it.
2. If activation is approved, verify idle state, protect the live database, install the staged bundle, restart and verify served behavior.
3. Release qualification remains red: 35 host/backend failures and three bundled-video failures reproduce on pristine baseline. Do not claim a green gate.
4. The 24 additional full-run failures were old table-count assertions. They now name the new receipt table; the affected 55 tests pass.
5. Commit source on the task branch and the generated frontend as a separate child commit in the isolated build checkout. No push is authorized.
6. Earlier V2 cutover, physical-machine training and Docker gates remain outside this verification scope.
7. origin/main advanced by 13 commits after the reviewed base. Reconcile that work before future publication; this local commit request does not include remote integration.

## Decisions
- Browser folder selection on every client; only drives visible to the host account are available.
- File-level upload recovery, not byte-range resume. Pending originals stay in this browser and origin until sent or cancelled.
- Dataset/Bank/image identity guards prevent stale queues or drafts attaching to reused numeric IDs.
- HEIC/HEIF gets preflight conversion guidance; no new decoder dependency.
- Existing generation remains available in a disclosure; imported datasets need no reference image.
- Related buttons stay in equal-width rows where they fit; 30 rows passed checks at five viewports.
- A running production process caused the bundle to be staged instead of replacing dist during verification.

## Traps
- Do not touch the pre-existing untracked upscale-tests.md.
- create_app changes schema; isolate data/config/env/plugin/extension paths before importing it in tests.
- postForm already returns parsed JSON. Do not call response.json() on its result.
- The responsive probe needs --dataset-id for a populated fixture; empty-first priming silently skips image dialogs.
- Bank and Dataset draft keys must include durable identities; numeric IDs can be reused after deletion.
- Bundled video tests need backend on PYTHONPATH; their three remaining failures are independently reproduced baseline failures.

## Verify
```powershell
# Full frontend suite, including bundled contracts:
Push-Location frontend
npm test
npm run lint
Pop-Location
# Complete host/tooling suite with isolated test state:
.venv/Scripts/python.exe -X utf8 -m pytest backend/tests scripts/tests -q -rf -n 8 --dist loadfile
# Driver also executes isolated bundled Python tests. Baseline avoids replacing a live bundle:
pwsh -File scripts/upstream_sync.ps1 -Phase Baseline -KeepScratch
# Build into an isolated output directory while the live checkout serves dist:
Push-Location frontend
npm run build -- --outDir <staged-output-directory>
npm run probe:responsive -- --url <isolated-test-url>/#/datasets --dataset-id <fixture-id> --states folder-browser,caption-editor,crop-editor --json
Pop-Location
```
Full-run and baseline-comparison logs are in ignored data/mobile-*. The staged
bundle and browser harnesses are attached to this chat's local artifact directory.
The baseline managed worktree is archived. Isolated validation servers are stopped;
the existing live LDS process was left running.
