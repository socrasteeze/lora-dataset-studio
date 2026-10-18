# HANDOFF

**Updated:** 2026-10-18 | **Branch:** validation/identity-learning | **Base:** 5306f107f | **Tree:** clean after this commit

## State
The operator approved photographic and anime identity assignment, learning through confirmed examples, and original-character matching across artwork. Implementation follows this scope receipt; feature and accuracy qualification remain open.

## Done this session
- Compared dataset-manager vocabulary/person matching with current LDS source.
- Created an isolated worktree from 5d32d6ceb; the running checkout and bundle remain unchanged.
- Recorded the approved scope and checks in docs/plans/identity-learning.md.

## Open
1. Implement profile-scoped identities, subject evidence, assignments, corrections and undo; preserve confirmed decisions through rescans.
2. Add photographic recognition and anime catalog/custom assignment with reviewed WD14/PixAI suggestions on Bank and Dataset.
3. Add original-character matching across artwork, outfits and styles; named examples teach future matches and rejected pairs stay excluded.
4. Preserve provenance through promotion/import/export and profile transfer; keep captions, triggers, source bytes and review decisions unchanged.
5. Add isolated regressions and populated responsive checks; qualify exact source and bundle with cloud Gates before landing.
6. Qualify recognition on labeled unseen artwork; permitted corpus selection remains pending. Synthetic tests do not establish accuracy.
7. Carry forward unqualified upstream ports and physical-device/trainer gates from 5d32d6ceb:HANDOFF.md. The running checkout has an unresolved frontend/backend activation mismatch; activation needs a separate stop/start.

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
No tests or probes ran for this documentation-only receipt. Review the diff, scan publishable files for privacy/attribution, and check whitespace before commit.
Cloud checkout only, with pinned dev/CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
node frontend/scripts/bankCurationProbe.mjs
```
