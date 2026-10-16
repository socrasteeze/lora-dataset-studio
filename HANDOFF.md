# HANDOFF

**Updated:** 2026-10-16 | **Branch:** noble/lora-curation | **Base:** 447864093 | **Tree:** clean

## State
Kind-aware Similar, Diverse and Balanced selection is implemented and feature-verified at 82e27995e. Full Fork Gates remains red on recorded baseline failures. Main and production services are unchanged by this task.
The task starts from a89f935c1 and retains the existing test-runtime work on that branch.

## Done this session
- Added one read-only policy for Character, Concept and Style, with references, pins, technical-quality preferences, duplicate limits and editable targets.
- Added current-cache face matching for Character, representative seeding, explicit unknowns and per-image selection receipts.
- Updated the Guide, settings reference, help registry, What's New and the separate frontend bundle. Reused the tablet Bank header hunk from 1352589c2.
- Selector/privacy checks: 125 backend passed, 3 skipped; the focused frontend checks passed 23. Skips: optional SciPy BLAS and two unconfigured private-name checks. No local tests ran.
- Run 38976783076 at 82e27995e passed all 45 kind/selector/viewport interactions and 15 standard responsive states with zero findings or skips. Empty selections cleared the grid; status and source hashes remained unchanged.
- Full gate: 9922 backend passed, 57 failed, 14 skipped; core frontend 5212 passed, 12 failed; bundled frontend 1073 passed, 4 skipped; all six bundled Python suites passed. Failure identities match baseline 38965160764 exactly. The CI duplication contract passes after removing the redundant unit replay.

## Open
1. Reconcile the independent validation/test-suite-runtime baseline repairs before landing. Keep main unchanged until required gates pass and landing is authorized. The original checkout and its pending edits were preserved.
2. The separate Bank/Settings browser check still fails its storage-folder selection assertion at bankOtherTagsProbe.mjs:223. The same assertion failed in baseline 38965160764. It passed at 05ede1745 and failed at 82e27995e with unchanged application source; retain both receipts and investigate without weakening the probe.
3. Physical phone/PWA and real GPU/training comparisons remain separate operator checks. No training quality improvement is measured yet.

## Decisions
- Existing API clients that omit selection retain legacy behavior. The new UI sends the shared policy to each of the three selectors.
- Character framing weights 4:3:2:1 are editable starting heuristics, not optimal training ratios. Concept defaults to caption views; Style defaults to subject categories.
- Face matching uses existing SHA-bound measurements. Missing, stale or unsupported faces remain unmeasured and reviewable.
- Pins override ranking, quotas and duplicate limits, but never filters, missing embeddings or unreadable images. Selection does not accept, reject, delete or promote.

## Traps
- Tests and fixture-backed browser probes run only in cloud unless the operator explicitly authorizes a local run.
- The current branch includes prior suite-runtime commits. Do not land them blindly or treat their baseline failures as feature validation.
- The original validation/test-suite-runtime checkout has newer independent repairs and a handoff edit. Preserve them. Only its Bank header hunk was reused here.
- Caption coverage is lexical and can miss details or misread negation. Subject/style relevance still requires filters and references.
- Local lint, build and privacy checks are allowed. No production application imports, restarts, data changes or real jobs are authorized by validation.

## Verify
Cloud checkout with the pinned dev/CPU Torch overlays and Node 24:

```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_bank_curation_policy.py backend/tests/test_image_bank_curation.py backend/tests/test_curation_selection_cost.py backend/tests/test_no_personal_data.py -q
node frontend/scripts/bankCurationProbe.mjs
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
```
