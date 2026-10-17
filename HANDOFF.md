# HANDOFF

**Updated:** 2026-10-16 | **Branch:** noble/lora-curation | **Base:** 447864093

## State
The operator authorized repairing the remaining failures, rerunning cloud gates, and cleaning and pushing the combined changes to origin/main. Selector changes and the independent validation/test-suite-runtime repairs are reconciled. Main stays unchanged until the combined head passes all required cloud checks. Run 38983056774 at 39031202c passed 9991 backend/tooling cases with 14 skips, all six bundled Python suites, the bundled frontend suite and both browser checks. Three frontend integration contracts failed and are repaired for the next full cloud run.

## Done
- Similar, Diverse and Balanced share Character, Concept and Style policies. References, pins, technical-quality penalties, duplicate caps and coverage targets produce review selections only. They never accept, reject, delete or promote images.
- Character framing weights 4:3:2:1 are editable starting heuristics. Concept defaults to caption views; Style defaults to subject categories. Cached face matching remains Character-only and reports unmeasured images.
- The selector head 82e27995e passed 45 populated browser interactions and 15 responsive measurements with zero findings or skips. Empty selections cleared the grid; source hashes and review decisions stayed unchanged.
- The independent repair head b3272eb3d passed full cloud run 38973216595: 9934 backend/tooling passes, 14 skips, eight subtest passes, 229 bundled Python passes, 5221 core frontend passes and 1073 bundled frontend passes with four skips.
- Those repairs cover queue admission behind active work, malformed saved options, semantic readiness versus statistics, late folder metadata, long Bank names and current schema/interface contracts. Browser qualification covered five sizes, 14 applicable Bank states, 55 Settings checks and ten Settings responsive routes.
- Suite-runtime changes retain fresh per-test app/database/config/plugin state, immutable Git templates copied per test, eight file-local full-gate workers and one numerical-library thread per worker. Independent failures remain fatal.

## Open
1. Rerun cloud Fork Gates after registering the curation Guide anchor, aligning the source news order with the existing feed order, and updating the readiness contract for metadata, shared pending state and multiple references. Preserve all existing entry IDs, readiness checks and probe limits. Rebuild the frontend separately and scrub before transport.
2. Require the full fork gate, Bank/Settings browser check and curation browser check to pass on the combined source and bundle before landing on main.
3. Refresh origin/main immediately before landing. Preserve the independent checkout and any later work. Do not merge diagnostic-only workflows or helpers.
4. Physical phone/PWA, installed-source restart and real GPU/training comparisons remain operator checks. No production service, data or real job was changed by validation.

## Decisions And Traps
- Tests and fixture-backed probes remain cloud-only. Local lint, build, syntax and privacy scans are permitted.
- Isolate every LDS runtime path and inherited profile identity before importing the application. create_app changes schema and runtime state.
- Source and generated frontend/dist remain separate commits. Rebuild from the reconciled source; do not combine hashed bundles by hand.
- Fork Gates runs the complete backend suite once. Do not add a duplicate focused pytest prelude to that workflow.
- Pins bypass ranking, quotas and duplicate limits, but never filters, missing embeddings or unreadable images. Caption coverage is lexical; references and human review still matter.
- Optional private-name checks can skip without an external list. Report that limit. Do not treat a skipped state as a pass.
- origin is the delivery remote. upstream stays read-only. No force push, history rewrite or release is authorized by this landing request.

## Verify
Cloud checkout only, with the pinned dev/CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
node frontend/scripts/bankCurationProbe.mjs
```
