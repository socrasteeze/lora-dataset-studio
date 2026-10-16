# HANDOFF

**Updated:** 2026-10-16 | **Branch:** validation/test-suite-runtime | **Base:** 447864093 | **Tree:** dirty

## State
Full-suite runtime optimizations are implemented; cloud qualification is pending.
Main is unchanged. No local tests, application imports or service restarts ran.

## Done this session
- Added synthetic capability-import defaults with explicit transport-test opt-in.
- Preserved fresh app/config/database/plugin state; real Torch bridge tests remain enabled.
- Kept adversarial grouping coverage with smaller oracle inputs and one large production-block case.
- Prepared Git histories once and copied independent repositories per test; removed idle heartbeat waits.
- Removed duplicate workflow/preflight runs, bounded numerical-library threads and retained backend JUnit reports.
- Ruff, ESLint, syntax review and privacy scan passed; ESLint has 32 existing warnings.

## Open
1. Inspect the exact-commit Fork Gates run after the workflow follow-up; repair suite failures and rerun only as needed.
2. Record the complete backend/frontend/plugin results, skip reasons, browser receipt and measured timings before claiming qualification.
3. Keep main unchanged until qualification passes and landing is authorized.
4. Prior UI, profile moves, queue recovery and physical phone/PWA acceptance remain unqualified beyond the specific cloud checks.
5. The operator still needs a full Studio stop/start after current work finishes to load earlier backend/profile changes. Do not interrupt jobs.

## Decisions
- One complete Windows qualification per pull request; ordinary CI retains Linux frontend checks.
- Validation branches run Fork Gates on push; no personally authenticated CLI writes to GitHub APIs.
- Eight full-gate pytest workers, four ordinary hosted CI/release workers; numerical-library threads are one per worker.
- Plugin contracts stay in separate processes; no shared app, database or mutable capability caches.
- Real import transport tests opt in with runtime_imports; ordinary tests can override the raw seam.
- Existing profile ownership, move receipts and one-entry-per-Bank queue contracts remain intact.

## Traps
- Tests and fixture-backed probes require a cloud checkout; implementation does not authorize local test execution.
- create_app changes schema/runtime state; isolate all LDS runtime paths and inherited profile identity before imports.
- Optional private-name checks can skip without an external list; cloud gates do not prove physical-device or real GPU behavior.
- Earlier no-test deliveries and historical receipts do not qualify this head. Prior detail remains in Git at the recorded base.
- Cloud run 38958289726 stopped at an existing tablet Bank-name truncation before pytest; application source and bundle are unchanged on this branch. The workflow now preserves that failure while collecting full-gate evidence.
- Run 38958834328 also exposed unchanged frontend source/guide assertion failures before Python ran. The driver now collects every independent suite and retains all failures; lint/build/startup still stop dependent work.
- Keep configuration, profile registries, data and credentials out of Git. Do not restart production services.

## Verify
Run in the cloud checkout with the pinned dev and CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
```
