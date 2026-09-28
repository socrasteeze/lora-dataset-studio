# Mobile dataset workflow implementation

Scope: the mobile audit fixes and shared repository guidance. Work is on
`noble/mobile-dataset-build`, integrating `422b8085e` with the mobile commits. No live dataset or GPU
workload was used as a fixture. The live application has not been restarted.

## Implemented

- [x] Dataset folder import uses the shared in-app host browser. Drive selection,
      parent/root navigation, typed paths, filtering and error recovery are present.
- [x] Bank and Dataset caption editors guard every exit and recover local drafts.
      Failed saves retain text. Changed server captions require a restore/discard decision.
- [x] Phone imports store pending originals in IndexedDB and checkpoint each file.
      Transactional server receipts make ambiguous-response retries idempotent.
      Pause, resume, cancellation, per-file failures and duplicate counts are visible.
- [x] Persistent dataset/Bank/image identities prevent recovery against reused IDs.
      Existing rows receive stable identities through an additive migration.
- [x] Crop handles and grid actions have larger touch areas. Dialogs use available
      viewport space; the mobile menu supports Escape, focus recovery and scroll locking.
- [x] Related folder, caption, crop and upload buttons stay in equal-width rows.
      Folder navigation has matching widths, with Go beside the path field.
- [x] All dataset kinds share progress guidance. Imports no longer require a
      generation reference. Add Images prioritizes imports and folds generation.
- [x] Phone image formats are checked before upload. HEIC/HEIF gets conversion
      guidance; actual JPEG bytes remain accepted despite stale HEIC labels.
      No HEIC decoder or conversion capability is claimed.
- [x] Clipboard failures explain manual copying. Newly typed secrets have Show/Hide.
- [x] AGENTS.md is canonical; CLAUDE.md remains a compatibility entry point.
- [x] Guide, help topics, What's New and fork notes describe the behavior.

## Verification

- Full integrated delivery gate passed: 10,343 backend/tooling tests, 106
  subtests, 244 isolated bundled Python tests and 6,283 frontend tests.
  The main backend suite skipped 22 tests; the bundled frontend skipped four.
- Both linters, fork ownership/startup checks and privacy checks passed.
- Earlier baseline failures were resolved during delivery qualification. Local
  plugin dispatch now uses the live registry while rejecting all API engines.
  Video readiness handles nested/qualified model paths without losing its direct
  configured-root fallback; the lineage fixture follows the current resolver API.
- Staged production frontend build passes and its compiled code passes the mobile
  import/reload/resume/caption scenario against an isolated backend.
- Folder browser, caption editor and crop editor: 15/15 measured states, zero
  violations, at 360x800, 412x915, 844x390, 768x1024 and 1280x800.
- Button-row follow-up: 30 measured rows have equal widths and aligned positions
  across the same five viewports. Labels remain readable and targets remain usable.
  Frontend tests and the refreshed staged build pass after the alignment changes.
- Real browser checks cover in-app host-folder import, three-file training ZIP
  download and matching captions, guarded exits, same-image draft recovery,
  injected save refusal, server-caption conflict and actual manual caption saving
  on both Bank and Dataset. Settings/menu checks also pass.
- IndexedDB browser probe: 10/10 checks, including reload, quota/transaction abort
  injection, missing blobs, cancellation, merged completions and stale sessions.
- Evidence and temporary fixtures are local artifacts, not published assets.
  Test logs under ignored `data/mobile-*` retain the measured receipts.
- No physical phone, native phone picker or real training job was exercised.

## Activation

The user authorized a clean push to origin/main and an idle-checked restart.
The integrated source and rebuilt frontend passed the full gate in an isolated
checkout. Publication and live activation are the remaining delivery steps.
Protect the live database/configuration and recheck active work before restarting.

## Preserved work

Pre-existing untracked `upscale-tests.md` remains untouched. Earlier V2 migration,
physical-device and Docker qualification gates are not closed by this work.
