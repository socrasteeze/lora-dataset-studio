# HANDOFF

**Updated:** 2026-10-19 | **Branch:** perf/framing-throughput-20261019 | **Base:** e58eedb06

## State
Framing tuning is implemented: Dataset warms its provider once, then uses the shared bounded request pool; database operations stay on the owner thread and results recheck source bytes and scope. Stop joins submitted requests before model release and saves no further Dataset results after cancellation. The shared image gate copies only the resized raster while preserving JPEG pixels and stripping metadata. Capability import probes now use CREATE_NO_WINDOW to address Windows console flashes.
Ollama 0.40.5 forces qwen3vl to one execution slot in server/sched.go. Increasing LDS or OLLAMA_NUM_PARALLEL does not remove that guard. No vendor binary, model, prompt, output budget, precision, crop threshold or live configuration was changed.
The operator authorized a local synthetic benchmark. Eight 6-megapixel fixtures produced identical prepared JPEG bytes; preparation median fell from 0.6411s to 0.5937s (7.4% less time). The final controlled benchmark used a fixed seed, per-path warm-ups and ABBA order with two measured passes per path. ComfyUI was ignored only in the isolated benchmark config to remove periodic failed-connection overhead. Dataset median was 9.9089s before and 9.2283s after (6.9% less time). Bank median was 9.9952s before and 9.9344s after (0.6%, within observed variation, so no Bank end-to-end gain is established). Every timed pass classified 8/8, with identical framing buckets and angle/expression labels. Earlier 14-15% figures included startup or retry noise and are superseded. The first harness attempt rejected workers because its isolated queue-manager app was not registered; the corrected harness retains the production GPU fence. No speed result is taken from that failed attempt.
New regressions are written but unrun. The local benchmark is the only newly authorized test scope. Earlier cloud qualification below applies to the base, not this tuning wave. The running checkout remains b6bacc836; activation is separate.
Cloud repair passed full qualification in run 39367594617 on source/bundle 2d74f60e9: backend 10,218 passed / 15 skipped plus 8 subtests, frontend 6,322 passed / 4 skipped, bundled Python 229 passed and Linux startup 13 passed. All browser steps passed, including all 10 Image Sources cases and 13 header checks with no skips. Backend runtime was 22m16s. Two optional privacy name checks lacked an external name list. No local tests ran. The launch-only workflow commit stays on the validation branch and must not reach main.
All Bank/Dataset pass families have been reviewed. Source 8eb711979 and bundle be92d4fa2 are active after an idle, backed-up restart: hardware-scaled worker budgets, adaptive CUDA Score batches, bounded ONNX sessions, unused face-head removal and rate-limited embedding checkpoints. Models used for scores/identity/pose, precision, thresholds, image validation and provenance stay intact. The local Framing benchmark above is complete; other pass speedups remain unmeasured.
Dataset Auto-Crop now shares Bank's status and grid-selection controls. The default is kept and undecided; a selection narrows that pool. Rejected images require an explicit bin/all scope. Empty selections cannot widen the run. Choices remain after a failed request. Source 66125fce8 and bundle 5b0f11dac are active after a controlled restart.
Confidence-gated Auto-Crop is implemented in the image editor and as an opt-in Bank/Dataset Framing option. The shared server gate defaults to 90%; missing/invalid/lower confidence skips pixel writes. Confidence is an uncalibrated model estimate.
The authorized cloud tests and isolated rendered checks are complete; live inference remains off. A new healthy backend boot serves the matching built bundle. Dataset metadata and four saved configuration files are unchanged. Bank inventory and Forget Missing requests occurred during activation; the Bank image table changed while surviving rows stayed identical. Cloud qualification passed on the repair commit above; live activation remains pending.

## Done this session
- Added bounded Dataset Framing overlap, first-request provider warm-up, source/scope rechecks and explicit changed-image results. Bank already used the request pool; its new shared change is bounded image-copy overhead only.
- Added concurrency, cancellation, source-replacement, image-byte equivalence and no-window probe regressions without running them. Removed unqualified speed claims from the concurrency controls and documented the server-slot limit.
- Fixed the Image Sources status layout and added verification that its selected ffmpeg binary runs. Added broken/unconfirmed binary and failed-install regressions.
- Updated the Score Stop test to select database write-back separately from inference batching. Reconciled the video schema inventory, lightbox hosts, queue layout contracts and Guide anchors without relaxing browser thresholds.
- Added shared native thread budgets to inference worker environments, preserving stricter inherited limits and the parent environment. Quality scan and Score preparation use the same CPU-capacity policy.
- Score batches CLIP and NSFW together, sizes batches from free CUDA memory, backs off on OOM and isolates other failures per image. Stop saves the current batch; runtime output reports its budget.
- Face/angle and Dataset face sessions bound ONNX threads and disable idle spinning. Face/identity analysis keeps identity and 3D pose inputs while skipping unused heads; face masking uses detection only.
- Face and SigLIP2 caches share Score's checkpoint interval. Normal Stop/completion flush all finished work; abrupt process termination can require more recomputation. Face cancellation also reaches the error path.
- Wrote CPU-budget, ONNX-pool, batch-equivalence, OOM-backoff, isolated-head-failure, batch-Stop/resume, replaced-source and checkpoint-durability regressions without running them.
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
0. Publish source and bundle with CI skipped, then activate the console-flicker fix after an idle checkpoint. The operator explicitly requested the live flicker repair. The broad regression suite remains unrun for this wave; real-image accuracy and a Bank end-to-end speed gain are unmeasured.
1. Auto-Crop confidence calibration, crop accuracy and live providers remain unverified; the cloud suite and existing browser checks passed. Run only an explicitly requested scope. Fixture speedup qualification against aeb09dae9 also remains unrun.
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

## Pass review
| Pass family | Result |
| --- | --- |
| Quality | Existing single decode supplies metrics/provenance/hash/thumbnail. Preparation workers now use the shared CPU policy. |
| Score | Bounded preparation/native threads; adaptive CLIP and NSFW batches; per-image failure isolation and batch Stop. |
| Semantic index | CLIP inherits Score changes. SigLIP2 keeps its existing model/processor and limits full-cache rewrites. |
| Faces/person groups | Bounded ONNX pools without idle spinning; identity/pose heads retained; unused heads skipped; checkpoint I/O limited. |
| Angles | Shares the face worker and keeps its 3D pose estimator and yaw gates. |
| Watermark detection | Shared worker budget; existing streaming detector chunks and memory-bounded tile sweep retained. Vision concurrency stays configured. |
| Text scan | Existing vision/OCR route and persistence retained; native worker budget applies where an inference worker is used. |
| Watermark crop | Existing lossless image-edit and mutation guards retained. |
| Watermark inpaint | Native worker budget; LaMa keeps one model for bulk work. External Klein/ComfyUI scheduling stays unchanged. |
| Improve/upscale | Native helper budget; external ComfyUI workflows and GPU ownership stay unchanged. |
| Framing/Auto-Crop | Existing vision concurrency, confidence gate, source fence and serial crop publication retained. |
| Medium | Existing cached Score embeddings and prototype classifier retained. |
| Semantic dedup | Existing cached embeddings, bounded comparisons and threshold semantics retained. |
| Caption | Native worker budget; WD14 adds ONNX limits and retains eight-image batches. Existing VLM concurrency and bulk caption workers retained. |
| Identity/masking | Identity retains detection/recognition/3D pose. Face masking skips unused face heads. |

## Verify
Pass tuning activation: source 8eb711979 and bundle be92d4fa2 are active in a new healthy boot on the same profile. Served entry and JavaScript bytes match the build. All 46 metadata-table fingerprints and all four saved-setting hashes match the pre-activation checkpoint. Work remained idle; no tests, inference or benchmarking were used for this deployment readback. Backup and receipts are under ignored Git storage, lds-auto-crop-activation-20261019-1f7da945. Both task-branch commits use [skip ci].
Pass tuning: Ruff and ESLint passed; ESLint has zero errors and 32 existing warnings. AST parsing covered 20 changed Python files without imports or execution. Production build passed in 6.74s. Privacy inspection covered 3084 text files with zero findings; added-source attribution inspection and whitespace review had zero findings. The pure-text outbound inventory has zero differences. Tests, fixtures, inference, benchmarks and rendered checks were not run. No workflow, dependency or saved-setting changes were made. Full qualification and throughput/equivalence measurement remain incomplete.
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
