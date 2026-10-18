# HANDOFF

**Updated:** 2026-10-18 | **Branch:** validation/identity-learning | **Source base:** 5d32d6ceb | **Main base:** 5306f107f

## State
The approved implementation is drafted in the isolated task worktree. Cloud qualification found issues now repaired for a fresh exact-head run. Real recognition accuracy remains open.

## Done this session
- Added identity records, per-subject references, corrections, rejected pairs, undo and shared filters in backend/app/services/identity_learning.py.
- Added prepared CPU inference, category-aware tag suggestions, bounded portable metadata and explicit held-out evaluation.
- Mounted shared controls in Bank and Dataset, added transfer/backup/ZIP/profile preservation, help and news.
- Added backend regressions and a cloud-only browser probe over 20 populated surface/kind/viewport states.
- Initial scope receipt: 88d17bb6a. The running checkout remains unchanged.
- Scope amendment: show per-folder Undo Group in Group by person, so a wrong single-person declaration can be cleared without hunting through filters. Preserve images and review decisions; rerun clustering to compute replacement groups.

## Open
1. Fork Gates for 3c03bac1a, run 39163879561: the full gate passed, including both linters, frontend/build/startup, bundled Python and full backend/tooling. Its identity probe reached final filtering in the first state, exposing a wrong Bank setF call shape; repaired in source. Bank/Settings completed four sizes/44 cases before a desktop tag-control timeout. The log showed a loaded Bank without tag controls; a failed-vocabulary-read recovery gap is repaired with bounded retries and a visible Retry Tags action, and the probe now forces both retry paths. This does not prove the cause of the original timeout. The latest source/bundle and new five-viewport folder-undo checks need a fully green exact-head run.
2. Repair every introduced backend/frontend/browser failure; do not count unrun synthetic cases or the production build as passing behaviors.
3. The operator chose a local accuracy set. Await its location/labels and explicit local-evaluation authorization; keep those images local and report wrong names, misses, abstentions and provenance.
4. Carry forward upstream-port and physical-device/trainer gates from 5d32d6ceb:HANDOFF.md. Activation of the running checkout needs a separate stop/start.

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
Cloud checkout only, with pinned dev/CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
node frontend/scripts/bankCurationProbe.mjs
node frontend/scripts/identityLearningProbe.mjs
```
