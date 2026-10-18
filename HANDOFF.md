# HANDOFF

**Updated:** 2026-10-18 | **Branch:** validation/identity-learning | **Source base:** 5d32d6ceb | **Main base:** 5306f107f

## State
The approved implementation is committed in the isolated task worktree. Full cloud qualification passed at be06ddbab26a32e5d4032201c8a19cfb4b5e0851 on validation/identity-learning. The running checkout is unchanged. Activation and real recognition accuracy remain open.

## Done this session
- Added identity records, per-subject references, corrections, rejected pairs, undo and shared filters in backend/app/services/identity_learning.py.
- Added prepared CPU inference, category-aware tag suggestions, bounded portable metadata and explicit held-out evaluation.
- Mounted shared controls in Bank and Dataset, added transfer/backup/ZIP/profile preservation, help and news.
- Added backend regressions and a cloud-only browser probe over 20 populated surface/kind/viewport states.
- Initial scope receipt: 88d17bb6a. The running checkout remains unchanged.
- Scope amendment: show per-folder Undo Group in Group by person, so a wrong single-person declaration can be cleared without hunting through filters. Preserve images and review decisions; rerun clustering to compute replacement groups.
- Added the required bulk Unassign Name action and a scope-level Undo Identity control that stays available when the identity filter empties the grid. Cloud cases removed two names and restored them from that empty state on both surfaces.
- Bind every human label to its reviewed pixel hash, including before model setup. Analysis cannot turn a name from replaced pixels into an example. Crop corrections keep their existing region; whole-image anime learners cannot silently coexist with another named character crop.
- Metadata merges now invalidate old previews/undo, preserve current evidence, and stop conflicting imported names from teaching. Dataset payloads carry a revision token for graph and image-instance changes; identity filters refresh without clearing a still-valid grid during the read.
- Displayed subject previews now use the same reviewed pixel hash as assignment. Pixel replacement clears old crop/single-character choices and blocks learning until the new preview loads. The cloud probe replaces a synthetic image between review and Assign, expects 409, then checks fresh crop dimensions before retrying.

## Open
1. Await explicit activation authorization before updating or restarting the running checkout. Main remains at 5306f107fb355434caef337496aac34a68ee2e13. The software and consolidated bundle qualified at be06ddbab; any later receipt-only handoff commit does not change that qualified source.
2. The operator chose a local accuracy set. Await its location/labels and explicit local-evaluation authorization; keep those images local and report wrong names, misses, abstentions and provenance. Similarity thresholds remain unmeasured heuristics.
3. Carry forward upstream-port and physical-device/trainer gates from 5d32d6ceb:HANDOFF.md. The original desktop tag timeout's exact cause remains unproven; automatic and manual recovery passed forced-failure checks.

## Decisions
- Photographic people, anime assignment and original-character learning are required workstreams.
- Share identity records; keep photographic-face and anime-image/subject evidence distinct and allow several characters per image.
- Confirming a name enrolls subject evidence. Ambiguous multi-character images require an explicit subject region before enrollment.
- Only human-confirmed examples teach identity; corrections and undo remove prior contributions.
- Reuse prepared local engines first; model retraining needs measured benefit and an explicit operator action.
- Store content/model provenance and unknown results; similarity is not confirmed identity.
- Preserve profile boundaries, local inference, caption rules and source/dist commit separation.
- Scrubbed task-branch pushes may transport cloud validation; main needs passing Gates and landing authorization.

## Traps
- Do not switch, rebuild or migrate the running checkout; retain its unresolved activation gate.
- Isolate runtime paths and inherited profile identity before application imports, which can mutate schema/state.
- Local tests, fixture-backed checks and probes remain unauthorized; selecting a future local corpus did not authorize a run. Static lint/build/privacy scans are permitted.
- Bank clusters are disposable local numbers, not permanent identities.
- Whole-image taggers cannot locate several characters; captions are not confirmed evidence.
- Keep real images and names private; accuracy needs a permitted labeled set with unseen artwork held out.

## Verify
Local Ruff, ESLint (zero errors), production build, whitespace and publishable-file privacy scan passed. Outbound inventory is unchanged. Tests/probes have not run locally.
Fork Gates run 39172784150 succeeded at be06ddbab26a32e5d4032201c8a19cfb4b5e0851. Its full Gates receipt reports Succeeded=true and zero exit codes for every step, including both linters, build, served plugin startup, core/bundled frontend, bundled Python and the full backend/tooling suite. Backend JUnit: 10063 passed, 14 skipped, zero errors/failures.
The same exact-head browser receipts passed 20 identity cases, 5 folder-undo cases, stale-pixel/preview/crop recovery, Bank/Settings and curation checks. Folder Undo works even when the bank has only one folder, where the old Subfolder menu is hidden. No live declarations were changed.
Receipts are retained under the worktree Git metadata in lds-gates-validation/cloud-39172784150. Run: https://github.com/socrasteeze/lora-dataset-studio/actions/runs/39172784150.
The optional private-name checks skipped because no external name list was configured. Live model/tool/device checks remain separate from synthetic cloud qualification. Recognition accuracy has not been measured on real artwork.
Cloud checkout only, with pinned dev/CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
node frontend/scripts/bankCurationProbe.mjs
node frontend/scripts/identityLearningProbe.mjs
```
