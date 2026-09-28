# Mobile dataset workflow implementation

Scope: the mobile audit fixes and shared repository guidance. Work is on
`noble/mobile-dataset-workflow`, based on `d9436f78c`. No live dataset or GPU
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

- Frontend: 5,120 core and 1,162 bundled tests passed; four bundled skips.
- Backend mobile/migration/Bank slice: 47 passed. Import receipt/identity tests
  cover lost responses after commit, duplicates, invalid input and stale identities.
- The full backend/tooling run completed: 10,245 passed, 59 failed, 33 skipped,
  and 106 subtests passed. Of the failures, 35 reproduce on pristine `d9436f78c`.
  The other 24 were schema-count assertions that predated the intentional new
  receipt table. Those assertions now require 34 tables and explicitly include
  `dataset_import_receipt`; all 55 tests in the three affected files pass.
- The isolated bundled-video run needs the host backend directory on PYTHONPATH.
  With that environment, three additional video contracts fail on both current
  source and pristine `d9436f78c` (83 pass). Full release qualification is not green.
- Backend lint passes. Frontend lint has zero errors and 44 warnings.
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

The validated bundle is staged outside `frontend/dist` because an existing LDS
process serves the checkout. Activation requires the user's pending decision.
If approved: check for active work, protect the database, install the validated
bundle, restart LDS and verify the new backend identity fields and served UI.
If the user chooses staging, preserve the build and report that it is not live.
No commit, push, release or deployment approval is implied by test completion.
The user subsequently requested local commits. Source and generated frontend
are committed separately. The bundle commit stays in an isolated checkout so
the existing live process does not receive a frontend built for a newer backend.
Remote integration, pushing and activation remain separate actions.

## Preserved work

Pre-existing untracked `upscale-tests.md` remains untouched. Earlier V2 migration,
physical-device and Docker qualification gates are not closed by this work.
