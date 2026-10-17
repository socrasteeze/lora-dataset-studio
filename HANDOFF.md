# HANDOFF

**Updated:** 2026-10-16 | **Branch:** noble/lora-curation | **Delivery:** origin/main

## State
The requested selector changes and remaining failure repairs are complete. Full Fork Gates [38988856257](https://github.com/socrasteeze/lora-dataset-studio/actions/runs/38988856257) passed at exact source and bundle 89af54f5415128a2a864537fbb2d6e99da42c085. The operator authorized landing on origin/main. This final receipt changes HANDOFF.md only; code, tests and bundle remain identical to that qualified head.

## Verified
- Backend and release tooling: 9991 passed, 14 skipped, eight subtests passed in 1230.30s. All 10005 case identities match the preceding run; no cases were removed.
- Core frontend: 5227 passed, zero failures. Bundled frontend: 1073 passed, four skipped. All six bundled Python suites passed, 229 cases total.
- Curation browser: 45 populated interactions across three LoRA kinds, three selectors and five sizes. All 15 responsive measurements passed with zero findings or skips. Empty selections cleared the grid; source bytes and review decisions stayed unchanged.
- Bank and Settings browser: five viewport cases, 55 Settings checks, 14 responsive Bank measurements with zero findings, six breakpoint-specific skipped states, and ten Settings responsive routes. Both initial-listing draft and late-parent-metadata races passed at every size.
- Both linters and the frontend build passed. ESLint retains 32 existing warnings. Privacy scans covered 3027 publishable text files with zero findings; attribution candidates were legitimate product, code and policy references.
- The 14 backend skips cover opt-in live or installed-source checks, excluded products, platform behavior, optional BLAS and two private-name checks without an external list. These are separate from the installed dev and CPU Torch test overlays.

## Done
- Similar, Diverse and Balanced share Character, Concept and Style policies. Multiple references, pins, technical-quality preferences, duplicate limits and coverage targets return selections for review. They never accept, reject, delete or promote images.
- Character framing weights 4:3:2:1 are editable starting heuristics. Concept defaults to caption views; Style defaults to subject categories. Cached face matching remains Character-only and reports unmeasured images.
- Integrated the independent queue admission, malformed-option, semantic metadata, long-name, schema and interface-contract repairs. Preserved fresh per-test state, eight file-local full-gate workers and one numerical-library thread per worker.
- Protected typed folder paths from delayed initial listings. The shared browser also preserves navigation when parent metadata arrives late. Its cloud regression forces both timings and verifies Browse does not save or move anything.
- Updated readiness assertions for metadata, shared pending state, multiple references and Balanced. Registered both added Guide headings in their chapters and aligned the source news order with the existing feed order without changing IDs.
- Browser failure receipts now upload before the full suite. Independent suite failures remain fatal. Source and generated frontend/dist stay in separate commits.

## Open
1. The running app checkout was preserved on validation/test-suite-runtime. Stop the app before switching that checkout to main, then start it. No production service, data or real job was changed or interrupted by validation.
2. Physical phone/PWA acceptance, installed-source trainer compatibility and real GPU/training comparisons remain operator checks. They are not claimed by synthetic cloud qualification.

## Decisions And Traps
- Tests and fixture-backed probes remain cloud-only unless the operator explicitly authorizes local execution. Local lint, build, syntax and privacy scans are permitted.
- Isolate all LDS runtime paths and inherited profile identity before application imports. create_app changes schema and runtime state.
- Fork Gates runs the complete backend suite once. Do not add a duplicate focused pytest prelude to that workflow.
- Pins bypass ranking, quotas and duplicate limits, but never filters, missing embeddings or unreadable images. Caption coverage is lexical; references and human review still matter.
- origin is the delivery remote. upstream stays read-only. No force push, history rewrite or release was required.

## Verify
Cloud checkout only, with the pinned dev/CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
node frontend/scripts/bankCurationProbe.mjs
```
