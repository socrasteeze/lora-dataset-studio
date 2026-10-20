# HANDOFF

**Updated:** 2026-10-19 | **Branch:** perf/test-suite-overhead | **Base:** aeb09dae9

## State
Suite fixture overhead changes are implemented on perf/test-suite-overhead. Source comparison preserves all 75 existing test function bodies and decorators in the five affected Python files; one fixture-isolation regression was added.
Tests and CI remain off. Static checks passed; runtime improvement and full qualification are unmeasured. Application runtime, frontend assets and workflow definitions are unchanged.

## Done this session
- Release tests prepare one committed template per worker, then copy its worktree and Git metadata for each test. Added an unrun isolation regression.
- FP8 tests cache only immutable serialized input bytes. Tensor shapes/dtypes, separate writable model files, real interpreter probes and CPU conversion workers remain.
- Real HTTP fixture servers use a short shutdown poll; segmented transfers connect to their bound IPv4 address directly. Request timeouts, retry limits, barriers and existing assertions remain unchanged.
- Updated CONTRIBUTING.md and FORK_NOTES.md with the fixture isolation rules. Ruff, ESLint, syntax/source comparison, whitespace and privacy inspection passed; no tests ran.

## Open
1. Only if explicitly requested, qualify the exact new source and compare full-suite timing/coverage with aeb09dae9 on equivalent cloud runners. No speedup percentage is claimed for this wave.
2. Tests, rendered behavior, live provider access and Auto-Center model accuracy remain unverified. Run only an explicitly requested scope. Earlier source-panel screenshots do not cover Auto-Center.
3. The operator chose a local identity accuracy set. Await its location/labels and explicit evaluation authorization; keep images local. Report wrong names, misses, abstentions and provenance. Similarity thresholds remain unmeasured heuristics.
4. Physical phone/PWA acceptance, installed-source trainer compatibility and real GPU/training comparisons remain operator gates. Opt-in live encoder/Ollama checks were not run.
5. If the Bank tab error recurs, collect the first browser ErrorBoundary line. The original live tab error and earlier desktop tag timeout have unconfirmed causes.

## Decisions
- Image Sources uses manual Scan, Load Previews, Download and Import Images actions. Opening a panel does not start network work.
- Keep two aligned columns of text/controls above the full-width normal Bank thumbnail grid. Stack controls on mobile.
- Auto-Center defaults to Full Subject with roughly 10% padding; review and adjust the box before Crop. Reuse the configured local vision model only after a click.
- Preserve Bank derivative saves and Dataset training-image crop limits. Retain the selection after failed saves; refuse ratios that cut the detected subject.
- Keep main's aligned queue columns and its shared human-confirmed identity records, correction/Undo behavior, subject regions and content/model provenance.
- Every test run needs an explicit request. Delivery without tests uses [skip ci] and does not claim full qualification.
- Reuse immutable fixture inputs only. Keep per-test writable files and Git metadata, fresh app/database/config/plugin state, and real integration transports.
- Keep worker counts, loadfile scheduling, request budgets and test parameter sets. Optimize setup and teardown instead of reducing coverage.

## Traps
- Build away from the running checkout. Backend activation needs a metadata backup and a controlled restart; do not import create_app against production as a check.
- Tests, responsive probes, fixtures and model inference remain off. Static lint/build/privacy inspection is permitted.
- Keep frontend source and generated dist in separate commits. Preserve unrelated worktrees and the original scraper branch.
- Keep real data names, images, settings and credentials private. Checkpoint metadata under ignored Git storage only.
- Do not move Auto-Center inference into passive requests or effects. Failed-save exceptions must reach CropModal.
- Do not merge upstream branches. The upstream review below is carried forward unchanged.

## Verify
Static AST comparison against aeb09dae987dbe28a070774c90b9ccae6aa628de found no removed or changed existing test function bodies/decorators in the five modified Python files: 75 retained, one added. This was source parsing only; no test imports, collection, fixtures or execution occurred.
Ruff passed. ESLint passed with zero errors and 32 existing warnings. Privacy inspection covered 3072 text files with zero findings. Whitespace inspection passed. No application, bundled runtime, frontend source/assets, workflow or test selection changes were made. A frontend rebuild is not needed. No tests or performance benchmarks ran; improvement and full qualification remain unverified.
Prior application baseline aeb09dae9 records the merged scraper/Auto-Center activation and its metadata checkpoint. Those operational results are historical; this wave does not restart the app or exercise models/providers.
Prior identity/upstream qualification: 2673a79faf05a5d01d1c85585585620be51a2bbf, Fork Gates 39183822421 and post-push CI 39185814233. Queue run 39189043465 was cancelled before full Gates finished; no further tests were authorized.
Scraper tip c053c7d72 had successful lint/build/privacy inspection, with 32 existing ESLint warnings. Auto-Center regression files were written but never run; no live model call or rendered check was made.
Permitted commands (use the existing pinned interpreter from the primary checkout when this worktree has no .venv):
```powershell
.venv/Scripts/python.exe -m ruff check .
cd frontend
npm run lint
```

### Carried-forward upstream review
On 2026-10-19, upstream's default branch remained v2 at 1a150ab4c6eb50ccd887d8e6b2675430fb2dca5c. v1 remained 3fe3d4f0e29e28de583a6e22bce886c35e5ecd3f. The review started at fork acf4ee146, with merge base d13337cc3. The previous reviewed SHA d566904e4 matched Overwatch and is an ancestor of the new head. The review window contains 7 commits; raw ancestry counts are not missing features.

| Upstream commits | Class and evidence |
| --- | --- |
| ceda138f1, b6a59b17d | REJECT. Patreon membership features on plugin catalog cards conflict with Distribution and Divergence 12. The catalog was removed in 6c056974f; `patreon_core.py` never existed in the fork. The What's New entry drops with the feature, per the 2026-10-18 Patreon precedent. |
| ba60ca167, 87d4d8984 | SKIP-BUILD. Rebuild the fork bundle from its own source. |
| bd5e42e6f | REJECT. Retain the fork version (`+fork`) and `APP_RELEASE_CHANNEL`. |
| d0fbe41c7 | REJECT. Docker Ollama test timeout; the test was deleted with the packaged-image path in ad0439ff9 (Distribution, Divergence 5). |
| 1a150ab4c | REJECT. Test fixture binds `lds_cloud_training.public_api_v1`; the cloud_training plugin is excluded in `fork-plugins.json` and removed in d9e94fc21 (Divergence 4). No fork test enables it, so the race cannot occur. |

Decision: nothing ported. A later review starts after `1a150ab4c`. Do not merge upstream/v1 or upstream/v2.
