# HANDOFF

**Updated:** 2026-10-16 | **Branch:** noble/lora-curation | **Base:** 447864093 | **Tree:** clean

## State
Kind-aware Similar, Diverse and Balanced selection is implemented. Cloud qualification is pending. Main is unchanged by this task.
The task starts from a89f935c1 and retains the existing test-runtime work on that branch.

## Done this session
- Added one read-only policy for Character, Concept and Style, with references, pins, technical-quality preferences, duplicate limits and editable targets.
- Added current-cache face matching for Character, representative seeding, explicit unknowns and per-image selection receipts.
- Added synthetic backend regressions and a cloud browser probe for all three selectors, all three kinds and five viewport sizes.
- Updated the Guide, settings reference, help registry and What's New. The frontend bundle ships in a separate commit.
- Cloud b6a6efca7 passed all 45 kind/selector/viewport interactions. The standard probe reached all 15 states; its only findings were the inherited tablet Bank title. Reused that header hunk from 1352589c2.
- Earlier exact-head focused checks passed 125 backend and 23 frontend cases. Three skips: optional SciPy BLAS and two unconfigured private-name checks. No local tests or application imports ran.

## Open
1. Inspect the newest validation/noble-lora-curation Fork Gates after the header repair. Require a complete curation receipt, including empty-selection behavior, 45 interaction states and 15 standard responsive states with no skips.
2. Keep main unchanged until required gates pass and landing is authorized. The inherited baseline has 57 backend failures, 12 frontend failures and a Bank browser failure; see the handoff at a89f935c1.
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
