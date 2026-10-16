# HANDOFF

**Updated:** 2026-10-16 | **Branch:** validation/test-suite-runtime | **Base:** 447864093

## State
Full-suite optimizations and the remaining failure repairs are implemented. Main and production state are unchanged. Tests remain cloud-only.
Focused retry 38972514249 passed all 81 backend cases (22.31s), all five browser sizes and 55 Settings checks with the full CPU test overlay installed. The Bank responsive probe measured 14 applicable states with zero findings and six breakpoint-specific skips. Its application source and bundle match 8c7d14ebb; only diagnostic helpers differ. Final full qualification remains required.

## Done this session
- Bounded numerical-library pools to one thread per worker; retained eight full-gate workers, four ordinary CI/release workers and file-local scheduling.
- Removed duplicate full/focused checks and collected independent suite failures without hiding them; preserved standalone Quick preflight.
- Stubbed incidental capability imports with runtime_imports opt-in; added guard and runner regressions.
- Reset only Bank queue memory between tests; preserved durable rows and within-test restart checks.
- Reused independent copies of prepared Git histories for updater/migration tests; retained real Git and fresh databases/media fixtures.
- Reduced quadratic oracle inputs while retaining threshold/seed coverage and a real production-block case; retained the heartbeat write beyond the original timeout.
- Allowed workspace jobs to queue behind active passes; immediate edits and deletes remain fenced. Queue regressions check saved failures, pending work, cancellation and GPU release.
- Separated semantic runtime readiness from statistics for both engines; the frontend merges partial responses without losing counts or readiness.
- Rejected malformed caption/inpaint options before queue admission and checked empty improvement scopes before model preflight.
- Kept folder navigation when storage metadata arrives late; added a delayed-response browser regression. Preserved Bank title space with a full-name fallback and a long-name viewport check.
- Reconciled schema, queue, shared keyboard, help-anchor and extracted-component contracts without dropping cases or probe limits. Rebuilt dist separately.

## Open
1. Run final exact-head Fork Gates. Do not overlap cloud jobs. Hold main until required qualification and delivery authorization.
2. Previous full run 38970245011 at 8dff8c7a7 had 9929 passes, five new malformed-input failures and 14 skips in 756.25s. All original and adjacent failures passed. Core frontend: 5222 passes; bundled frontend: 1073 passes and four skips; all six bundled Python suites passed. The five route-forwarding failures and the cached-document browser wait are repaired and covered by the successful focused retry. The new redundant source-regex test was removed in favour of that rendered regression.
3. The expanded comparison (38964253881) passed: baseline 161.86s/466 cases/159 failures versus optimized 108.08s/480 cases/57 failures, with no new failures, skips or missing cases. Migration coverage passed in both stages: 57.12s/27 cases versus 41.68s/28 cases. These are focused comparison timings, not full-suite speed claims.
4. Earlier physical phone/PWA and production restart acceptance remain operator checks; no production services or real jobs were started or interrupted here.

## Decisions
- Fresh apps, databases, config, plugin state and mutable caches remain per test; no shared application shortcuts.
- Prepared Git templates are immutable. Every test copies its own refs, files and settings and rewires its own local remote.
- Real Torch bridge/quantization coverage remains; ordinary capability import transport is synthetic unless a test opts in or overrides it.
- Independent suites all finish, but any failure keeps the gate red. Lint, build and startup failures still stop dependent work.
- Source and rebuilt bundle stay in separate commits. Local lint, syntax, build and privacy checks are permitted; tests and fixture servers are not.
- The delayed-storage browser regression starts a fresh document and awaits the request before interacting. Falsy HTTP options must reach validation unchanged. Browser behaviour coverage replaces the redundant new source-regex assertion.
- Diagnostic workflow/helper/manifest live only on diagnostic/test-suite-runtime and must not land with this implementation.

## Traps
- Do not run tests or fixture-backed probes locally without explicit permission. Local lint, build, syntax and privacy checks passed; ESLint retains 32 warnings.
- create_app changes schema/runtime state. Isolate all LDS runtime paths and inherited profile identity before imports.
- Two optional private-name checks skipped without an external list. Installed-source, real GPU and physical-device gates are separate from synthetic cloud coverage.
- Keep configuration, profile registries, data and credentials out of Git. No history rewrite, release or main push was performed. The final receipt update changes HANDOFF.md only; runtime source matches the full-gated commit 650fe6536.

## Verify
Cloud checkout only, using the pinned dev/CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
```
