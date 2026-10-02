# HANDOFF

**Updated:** 2026-10-02 | **Branch:** noble/compact-app-interface | **Base:** c60852194 | **Tree:** dirty

## State
The interface density pass and rebuilt frontend/dist are on noble/compact-app-interface. The authorized publication target is this branch on origin; main retains its cloud landing gate.
Build, both linters and the privacy scanner passed. The user explicitly requested commit and clean push without tests. Tests, responsive probes and Gates remain deferred.

## Done this session
- Removed redundant Bank creation/workspace boxes, nested pass option cards and the duplicate overview disclosure; placed the pressed Subfolders toggle between Browse and Create.
- Matched Image/Video Bank headers and creation control heights. Kept equal-width lane choices and accessible sort names without visible Sort prefixes.
- Compacted Dataset, Studio, captions, primary/advanced training, Runs, settings, setup and plugin surfaces. Retained warnings, recovery guidance and functional help controls.
- Aligned shared host controls and standalone SDK settings fields. Textareas release the fixed single-line height.
- Updated contracts, guide labels and What's New. The read-only census covered 357 JSX sources; deeper sibling-row fixes include Repair, timeline, Canvas, Video and model pickers. Coverage: docs/UI_DENSITY_AUDIT.md.

## Open
1. Do not start tests, responsive probes or Gates unless the user requests validation again.
2. When validation is authorized, run frontend and bundled tests, privacy/contracts, and populated responsive probes for all affected routes. Fix failures without weakening probe thresholds.
3. Carry forward the cloud Gates landing requirement for the previous refactor fixes and this density pass. Prior targeted tests are not full qualification.
4. Preserve separate source and consolidated build(frontend): commits. Validate the exact published task-branch commits before any future landing on main.

## Decisions
- Removed framing only where it repeated the same parent task. Kept distinct data cards, measured results, confirmations and recovery boundaries.
- Used existing control sizes: 40px below lg; sm/md/lg remain 28/32/36px on desktop. Kept font sizes consistent within each control group.
- Retained short visible stale-count and input-format guidance. Moved repeated explanations into existing tooltips and the Guide.

## Traps
- The SDK exports controlHeight, but does not export host Button/Input/Select or fieldClass. Bundled code must use its public SDK boundary.
- Preserve local-only generation and the curated plugin distribution. Do not restore bundled/civitai_publish; retain existing compatibility shims.
- Isolate LDS_DATA_DIR, LDS_CONFIG, LDS_ENV, LDS_PLUGINS_DIR and LDS_EXTENSIONS_DIR before application imports. Vite writes must target an isolated backend.
- Empty fixtures skip key Bank/Dataset/Studio states. Use populated fixtures and inspect coverage; a skipped state is not a pass.
- Gates stop at the first failure. Use distinct short pytest scratch paths; do not reuse another run's basetemp or production state.
- The served bundle is read from disk. Source and dist must stay together in delivery, but in separate commits. Do not rewrite prior commit history.

## Verify
Ran: npm run build, npm run lint (32 warnings, zero errors), .venv/Scripts/python.exe -m ruff check ., git diff --check, and scripts/scan-sensitive.sh (zero findings).
The commands below require cloud execution or explicit local-test permission. They were not run in this session. Responsive URLs must point at populated isolated fixtures.

```powershell
Set-Location frontend
npm test
npm run lint
npm run build
npm run probe:responsive -- --url http://127.0.0.1:5173/#/bank
npm run probe:responsive -- --url http://127.0.0.1:5173/#/datasets
npm run probe:responsive -- --url http://127.0.0.1:5173/#/canvas
npm run probe:responsive -- --url http://127.0.0.1:5173/#/video-bank
npm run probe:responsive -- --url http://127.0.0.1:5173/#/settings
npm run probe:responsive -- --url http://127.0.0.1:5173/#/setup
npm run probe:responsive -- --url http://127.0.0.1:5173/#/plugins
npm run probe:responsive -- --url http://127.0.0.1:5173/#/guide
Set-Location ..
.venv/Scripts/python.exe -m ruff check .
pwsh -File scripts/gates.ps1 -Phase Gates
```

Also probe the affected Dataset and Video Dataset workspaces, populated Studio routes, Camera Angles, DLSS and scraper dialogs. Use the existing probe's portrait, landscape, tablet and desktop viewports, plus manual visual review of saved screenshots. Do not treat unsupported route states measured only at rest as complete interaction coverage.
