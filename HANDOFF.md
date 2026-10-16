# HANDOFF

**Updated:** 2026-10-16 | **Branch:** validation/test-suite-runtime | **Base:** 447864093

## State
Full-suite optimizations are implemented on the task branch. Cloud receipts carry exact-commit qualification; main is unchanged.
Application source, production state and the shipped frontend bundle are unchanged.

## Done this session
- Bounded numerical-library pools to one thread per worker; retained eight full-gate workers, four ordinary CI/release workers and file-local scheduling.
- Removed duplicate full/focused checks and collected independent suite failures without hiding them; preserved standalone Quick preflight.
- Stubbed incidental capability imports with runtime_imports opt-in; added guard and runner regressions.
- Reset only Bank queue memory between tests; preserved durable rows and within-test restart checks.
- Reused independent copies of prepared Git histories for updater/migration tests; retained real Git and fresh databases/media fixtures.
- Reduced quadratic oracle inputs while retaining threshold/seed coverage and a real production-block case; retained the heartbeat write beyond the original timeout.

## Open
1. Before landing, inspect the latest exact-head Fork Gates receipt and repair the remaining baseline test and Bank layout failures. Hold main until required qualification and delivery authorization.
2. The earlier full run e5a310440 (38959711992) had 198 backend failures, 9721 passes and 14 skips in 912.23s, plus 12 frontend failures and a tablet Bank-name truncation. Those results do not qualify later commits.
3. The expanded comparison (38964253881) passed: baseline 161.86s/466 cases/159 failures versus optimized 108.08s/480 cases/57 failures, with no new failures, skips or missing cases. Migration coverage passed in both stages: 57.12s/27 cases versus 41.68s/28 cases. These are focused comparison timings, not full-suite speed claims.
4. Earlier physical phone/PWA and production restart acceptance remain operator checks; no production services or real jobs were started or interrupted here.

## Decisions
- Fresh apps, databases, config, plugin state and mutable caches remain per test; no shared application shortcuts.
- Prepared Git templates are immutable. Every test copies its own refs, files and settings and rewires its own local remote.
- Real Torch bridge/quantization coverage remains; ordinary capability import transport is synthetic unless a test opts in or overrides it.
- Independent suites all finish, but any failure keeps the gate red. Lint, build and startup failures still stop dependent work.
- Source, tests and bundle stay separate where a bundle changes; this tooling-only frontend rebuild left dist unchanged.
- Diagnostic workflow/helper/manifest live only on diagnostic/test-suite-runtime and must not land with this implementation.

## Traps
- Do not run tests or fixture-backed probes locally without explicit permission. Local lint, build, syntax and privacy checks passed; ESLint retains 32 warnings.
- create_app changes schema/runtime state. Isolate all LDS runtime paths and inherited profile identity before imports.
- Optional private-name checks skip without an external list. Installed-source, real GPU and physical-device gates are separate from synthetic cloud coverage.
- Keep configuration, profile registries, data and credentials out of Git. No history rewrite, release or main push was performed.

## Verify
Cloud checkout only, using the pinned dev/CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
```
