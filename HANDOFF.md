# HANDOFF

**Updated:** 2026-10-18 | **Branch:** main | **Base:** cdd96f9e4

## State
Bank Queue uses fixed job/status/control columns; narrow phones put the full bank name above the job/status line. Active passes, failed rows and Retry retain the same alignment. Source and built assets are applied in the running main checkout.
The operator stopped testing and requires an explicit request for every future test run. Cloud run 39189043465 is cancelled; full qualification is incomplete. Backend runtime code is unchanged.

## Done this session
- Replaced content-sized Bank Queue rows with shared grid tracks. Names wrap, status badges use consistent casing, and device/wait/error details no longer move the primary columns.
- Added a cloud browser check over eight widths and five states each: initial, hover/focus, Remove, Retry and Stop. It uses invented API data on an isolated fixture, never real queued work. Captures redact data text in memory before saving.
- Recorded explicit test permission in project guidance. Delivery commits use `[skip ci]` when tests are not requested; workflow definitions and coverage remain intact.
- Applied the frontend-only fast-forward without restarting the backend. The listener process is unchanged; runtime source matches the prior main checkout.
- Prior identity/upstream delivery remains qualified at 2673a79fa and recorded on main at cdd96f9e4. Its private metadata checkpoint remains in .git/lds-activation-20261019.

## Open
1. The operator chose a local accuracy set. Await its location/labels and explicit local-evaluation authorization; keep those images local and report wrong names, misses, abstentions and provenance. Similarity thresholds remain unmeasured heuristics.
2. Physical phone/PWA acceptance, installed-source trainer compatibility and real GPU/training comparisons remain operator checks. Opt-in live encoder/Ollama checks were not run. Synthetic cloud qualification does not close these gates.
3. If the Bank tab error recurs, collect the first browser [ErrorBoundary] line. Live browser access was unavailable, and the server log had no matching exception. The original tab error and earlier desktop tag timeout have unconfirmed causes; automatic/manual recovery passed controlled failures. Do not infer a live cause from screenshots alone.

## Upstream review carried forward

On 2026-10-19, upstream's default branch remained v2 at 1a150ab4c6eb50ccd887d8e6b2675430fb2dca5c. v1 remained 3fe3d4f0e29e28de583a6e22bce886c35e5ecd3f. The review started at fork acf4ee146, with merge base d13337cc3. The previous reviewed SHA d566904e4 matched Overwatch and is an ancestor of the new head. The review window contains 7 commits; raw ancestry counts are not missing features.

| Upstream commits | Class and evidence |
| --- | --- |
| ceda138f1, b6a59b17d | REJECT. Patreon membership features on plugin catalog cards conflict with Distribution and Divergence 12. The catalog was removed in 6c056974f; `patreon_core.py` never existed in the fork. The What's New entry drops with the feature, per the 2026-10-18 Patreon precedent. |
| ba60ca167, 87d4d8984 | SKIP-BUILD. Rebuild the fork bundle from its own source. |
| bd5e42e6f | REJECT. Retain the fork version (`+fork`) and `APP_RELEASE_CHANNEL`. |
| d0fbe41c7 | REJECT. Docker Ollama test timeout; the test was deleted with the packaged-image path in ad0439ff9 (Distribution, Divergence 5). |
| 1a150ab4c | REJECT. Test fixture binds `lds_cloud_training.public_api_v1`; the cloud_training plugin is excluded in `fork-plugins.json` and removed in d9e94fc21 (Divergence 4). No fork test enables it, so the race cannot occur. |

Decision: nothing ported. A later review starts after `1a150ab4c`. Do not merge upstream/v1 or upstream/v2.

## Decisions
- Keep jobs/status/control columns aligned across queued and active Bank rows. Use two lines on narrow phones so names stay readable.
- Share identity records; keep photographic-face and anime-image/subject evidence distinct and allow several characters per image.
- Confirming a name enrolls subject evidence. Ambiguous multi-character images require an explicit subject region before enrollment.
- Only human-confirmed examples teach identity; corrections and undo remove prior contributions.
- Reuse prepared local engines first; model retraining needs measured benefit and an explicit operator action.
- Store content/model provenance and unknown results; similarity is not confirmed identity.
- Preserve profile boundaries, local inference, caption rules and source/dist commit separation.
- Photographic people, anime assignment and original-character learning remain required workstreams. Every test run needs an explicit operator request; authorized delivery without tests uses `[skip ci]` and reports incomplete qualification.

## Traps
- Build in an isolated worktree. A frontend-only fast-forward may preserve the backend process when runtime source is identical; backend changes need a controlled activation and metadata backup.
- Isolate runtime paths and inherited profile identity before application imports, which can mutate schema/state.
- All local/cloud tests, fixture-backed checks and probes remain unauthorized unless explicitly requested. Selecting a future local corpus did not authorize a run. Static lint/build/privacy scans are permitted.
- Bank clusters are disposable local numbers, not permanent identities; captions and tags are not confirmed evidence.
- Whole-image taggers cannot locate several characters. Multi-character enrollment needs a region; reviewed labels must never teach from replaced pixels.
- Keep real images and names private; accuracy needs a permitted labeled set with unseen artwork held out.

## Verify
Queue alignment source/bundle: 135001b92e96412111748686fc8dd2ed0fe91999. Local Ruff, ESLint (zero errors, 32 existing warnings), production build and JavaScript syntax checks passed before the no-test instruction. No local tests or fixture-backed probes ran.
Before cancellation, cloud run 39189043465 passed all 40 queue geometry/control cases at eight widths. All eight saved captures were redacted, metadata-free and visually reviewed. Linux startup, Bank/Settings, curation, identity and Studio browser steps completed successfully. The full Gates step did not finish. The run was already active when the operator stopped testing; GitHub confirms it is cancelled. No further test runs were started.
Receipt: worktree Git metadata, lds-gates-validation/cloud-39189043465/bank. Run: https://github.com/socrasteeze/lora-dataset-studio/actions/runs/39189043465. The historical full-gate receipt below qualifies the prior identity/upstream wave, not this queue wave.
Frontend activation advanced the application checkout from cdd96f9e4 to 8d1cd04c2 with an unchanged backend listener process. Backend and bundled runtime trees are identical to the previous main checkout. Tests remain stopped at the operator's request.
Fork Gates 39183822421 passed at 2673a79faf05a5d01d1c85585585620be51a2bbf. The receipt has Succeeded=true and zero exits for both linters, build, served plugin startup, core/bundled frontend, all bundled Python suites and the full backend/tooling suite. Backend JUnit: 10083 passed, 15 skipped, zero failures/errors. Linux startup: 13 passed, no skips.
The exact-head browser receipts passed 20 identity cases, five folder-undo cases, stale-pixel/preview/crop recovery, five Bank cases, 55 Settings cases, five normal Video-tab cases, 15 tab-recovery cases, 45 curation cases and 10 Studio cases. Curation layout measured 15 states with zero findings/skips. The broader Bank layout probe measured 14 states with zero findings and six hidden-state skips; skipped states are not claimed as measured.
Receipts: worktree Git metadata, lds-gates-validation/cloud-39183822421. Run: https://github.com/socrasteeze/lora-dataset-studio/actions/runs/39183822421.
Post-push CI 39185814233 passed at the same qualified commit: lint, change-size gate, frontend tests/build and backend tests. Run: https://github.com/socrasteeze/lora-dataset-studio/actions/runs/39185814233.
Local Ruff, ESLint (zero errors, 32 existing warnings), production build, whitespace, static privacy scans and Ghost policy checks passed. No software tests or responsive probes ran locally. The optional private-name tests skipped because no external name list was configured; other skips cover opt-in live/installed-source checks and platform/fork capabilities. Outbound inventory is unchanged.
After activation, read-only operational checks verified a new healthy boot identity, the unchanged bind/port/profile, served entry/Video assets matching the qualified bundle, six identity tables and all 14 existing metadata fingerprints. Local settings/credentials/profile-registry hashes were unchanged. Real recognition accuracy has not been measured.
Reference commands only. Run them only on an explicit operator request, in cloud with pinned dev/CPU Torch overlays and Node 24 unless local execution is also authorized:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
node frontend/scripts/bankCurationProbe.mjs
node frontend/scripts/identityLearningProbe.mjs
node frontend/scripts/studioBaseProbe.mjs
```
