# HANDOFF

**Updated:** 2026-10-18 | **Branch:** validation/identity-learning | **Base:** 5306f107f | **Tree:** clean after this commit

## State
The approved implementation is drafted in the isolated task worktree. Static lint/build/privacy checks pass; exact-source cloud behavioral/rendered qualification and real recognition accuracy remain open.

## Done this session
- Added identity records, per-subject references, corrections, rejected pairs, undo and shared filters in backend/app/services/identity_learning.py.
- Added prepared CPU inference, category-aware tag suggestions, bounded portable metadata and explicit held-out evaluation.
- Mounted shared controls in Bank and Dataset, added transfer/backup/ZIP/profile preservation, help and news.
- Added backend regressions and a cloud-only browser probe over 20 populated surface/kind/viewport states.
- Initial scope receipt: 88d17bb6a. The running checkout remains unchanged.

## Open
1. Inspect cloud Fork Gates on the latest task head. Initial 43c41d2fe run 39161578218 found sparse identity-row sizing; the local grid repair needs a fresh cloud render.
2. Repair every introduced backend/frontend/browser failure; do not count unrun synthetic cases or the production build as passing behaviors.
3. Exercise the explicit held-out evaluation on permitted labeled unseen artwork. Corpus selection remains pending; report wrong names, misses, abstentions and provenance.
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
- Local tests, fixture-backed checks and probes remain unauthorized; static lint/build/privacy scans are permitted.
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
