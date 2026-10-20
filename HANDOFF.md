# HANDOFF

**Updated:** 2026-10-19 | **Branch:** main | **Base:** 873411c4b

## State
Dataset Auto-Crop now shares Bank's status and grid-selection controls. The default is kept and undecided; a selection narrows that pool. Rejected images require an explicit bin/all scope. Empty selections cannot widen the run. Choices remain after a failed request. Source 66125fce8 and bundle 5b0f11dac are active after a controlled restart.
Confidence-gated Auto-Crop is implemented in the image editor and as an opt-in Bank/Dataset Framing option. The shared server gate defaults to 90%; missing/invalid/lower confidence skips pixel writes. Confidence is an uncalibrated model estimate.
Tests, rendered checks and inference remain off. A new healthy backend boot serves the matching built bundle. Dataset metadata and four saved configuration files are unchanged. Bank inventory and Forget Missing requests occurred during activation; the Bank image table changed while surviving rows stayed identical. Full qualification remains incomplete.

## Done this session
- Extracted the shared Bank/Dataset status and selection controls without changing stored scope IDs. Dataset shows eligible counts, blocks empty scopes and clears stale grid selections on navigation. Framing waits for bulk curation to finish.
- Dataset validates status/ID options before reserving the GPU, intersects them with dataset ownership, excludes rejected images by default and rechecks status after inference before saving.
- Added scope, selection, foreign-ID, invalid-input and status-change regressions without running them. Updated Guide, help keywords and What's New.
- Published source 66125fce8 and bundle 5b0f11dac on the task branch with CI skipped. Activated both from a clean main checkout after an idle-work check and local metadata/settings backup. No crop or inference was used for deployment readback.
- Added shared confidence validation, full-subject crop geometry and source-byte checks in auto_crop.py. Framing requests crop evidence in the same model call, including on compute peers.
- Bank preserves pass status/selection scope, queue options, existing edit history and its active mutation reservation. Reports crops/skips/failures; no source file is overwritten.
- Dataset Auto-Crop includes already-classified image files, uses an exclusive activity reservation and atomic crop publication, and provides Stop Framing. Changed previews receive fresh versions.
- The image editor's Auto-Crop saves after a qualifying detection. Manual crop remains available. Failed saves retain the detected box; aspect ratios cannot cut the detected subject.
- Updated Guide, help anchors, README and What's New. Wrote confidence/bounds/source-change, stop-isolation and Bank/Dataset regression cases without running them.
- Activated source 46926f85b and bundle d1ca52fd0 after an idle-work check and local metadata/settings backup. Served entry and JavaScript bytes match the built bundle; no jobs or inference were started.

## Open
1. Auto-Crop confidence calibration, crop accuracy, rendered behavior and live providers remain unverified. Run only an explicitly requested scope. Fixture speedup qualification against aeb09dae9 also remains unrun.
2. The operator chose a local identity accuracy set. Await its location/labels and explicit evaluation authorization; keep images local. Report wrong names, misses, abstentions and provenance. Similarity thresholds remain unmeasured heuristics.
3. Physical phone/PWA acceptance, installed-source trainer compatibility and real GPU/training comparisons remain operator gates. Opt-in live encoder/Ollama checks were not run.
4. If the Bank tab error recurs, collect the first browser ErrorBoundary line. The original live tab error and earlier desktop tag timeout have unconfirmed causes.

## Decisions
- Dataset Auto-Crop uses Bank's kept/undecided default, explicit kept/undecided/bin/all choices and selection priority. A selection excludes rejected images; choosing a status scope replaces the selection. Legacy classification without Auto-Crop keeps its existing pool.
- Image Sources uses manual Scan, Load Previews, Download and Import Images actions. Opening a panel does not start network work.
- Keep two aligned columns of text/controls above the full-width normal Bank thumbnail grid. Stack controls on mobile.
- Auto-Crop uses full subjects with roughly 10% padding and a 90% default minimum. The editor saves in one click; Framing cropping is opt-in. Model confidence is not measured accuracy.
- Preserve Bank derivative saves and Dataset training-image crop limits. Retain the selection after failed saves; refuse ratios that cut the detected subject.
- Keep main's aligned queue columns and its shared human-confirmed identity records, correction/Undo behavior, subject regions and content/model provenance.
- Every test run needs an explicit request. Delivery without tests uses [skip ci] and does not claim full qualification.
- Reuse immutable fixture inputs only. Keep per-test writable files and Git metadata, fresh app/database/config/plugin state, and real integration transports.
- Keep worker counts, loadfile scheduling, request budgets and test parameter sets. Optimize setup and teardown instead of reducing coverage.

## Traps
- Build away from the running checkout. Backend activation needs a metadata backup and a controlled restart with the normal CSRF session; do not import create_app against production as a check.
- Tests, responsive probes, fixtures and model inference remain off. Static lint/build/privacy inspection is permitted.
- Keep frontend source and generated dist in separate commits. Preserve unrelated worktrees and the original scraper branch.
- Keep real data names, images, settings and credentials private. Checkpoint metadata under ignored Git storage only.
- Do not move Auto-Crop inference into passive requests/effects. Keep old route/help/What's New identifiers. Failed-save exceptions must reach CropModal.
- Do not merge upstream branches. The upstream review below is carried forward unchanged.

## Verify
Dataset scope source inspection: Ruff passed; ESLint reported zero errors and 32 existing warnings. Three changed Python files parsed without imports or execution. Production build passed in 6.76s. Privacy inspection covered 3079 text files with zero findings; whitespace review passed. No tests, fixtures, browser checks, model inference or rendered probes ran. New regression cases remain unrun. Full qualification is incomplete.
Dataset scope activation: new healthy boot, same profile, matching served entry and bundle bytes, idle work state and unchanged hashes for four configuration files. Of 46 metadata tables, 45 were identical. The Bank image delta was 3427 added pending rows and 1267 removed pending rows, with zero field changes in surviving rows. Timestamped logs show successful Bank create/inventory and Forget Missing requests during that interval. No live data was restored or overwritten. Backup and filtered metadata/request receipts remain under ignored Git storage, lds-auto-crop-activation-20261019-899e4e9e.
Auto-Crop source inspection: Ruff passed; ESLint passed with zero errors and 32 existing warnings. AST parsing covered nine Python files without imports or test collection. Final production build passed in 7.04s. Privacy inspection covered 3075 text files with zero findings; new attribution scan had zero findings. The pure-text outbound inventory has zero differences. No tests, fixtures, model inference or rendered probes ran. Bank and Dataset confidence policy uses the same server helper; options are validated before queued admission or the Dataset GPU window. Bank framing is rebound to the saved crop's fingerprint. No workflow or dependency changes were made. Accuracy and full qualification remain unverified.
Previous confidence-wave activation readback confirmed an idle app, a new healthy boot on the same profile, matching served entry/bundle, identical fingerprints for all 46 metadata tables and unchanged hashes for all four saved configuration files. Checkpoint and receipts remain under ignored Git storage, lds-auto-crop-activation-20261019-8d5cbaf4. No real image crop or model call was used for verification.
Historical fixture optimization: source comparison against aeb09dae9 retained all 75 existing test function bodies/decorators in its five changed files, with one new isolation regression. Both linters/privacy inspection passed. Tests and benchmarks did not run.
Prior application baseline aeb09dae9 records the merged scraper/Auto-Center activation and its metadata checkpoint. Those operational results are historical and do not qualify this wave.
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
