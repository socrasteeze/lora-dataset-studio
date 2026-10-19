# HANDOFF

**Updated:** 2026-10-18 | **Branch:** validation/identity-upstream | **Source base:** 5d32d6ceb | **Main base:** 5306f107f

## State
The identity implementation qualified in cloud at be06ddbab26a32e5d4032201c8a19cfb4b5e0851. Seven upstream source ports now join it on validation/identity-upstream. Combined cloud qualification is pending. The operator authorized clean landing on origin/main and the Overwatch baseline update. The running checkout is unchanged. Activation and real recognition accuracy remain open.

## Done this session
- Added identity records, per-subject references, corrections, rejected pairs, undo and shared filters in backend/app/services/identity_learning.py.
- Added prepared CPU inference, category-aware tag suggestions, bounded portable metadata and explicit held-out evaluation.
- Mounted shared controls in Bank and Dataset, added transfer/backup/ZIP/profile preservation, help and news.
- Added backend regressions and a cloud-only browser probe over 20 populated surface/kind/viewport states.
- Initial scope receipt: 88d17bb6a. The running checkout remains unchanged.
- Scope amendment: show per-folder Undo Group in Group by person, so a wrong single-person declaration can be cleared without hunting through filters. Preserve images and review decisions; rerun clustering to compute replacement groups.
- Added the required bulk Unassign Name action and a scope-level Undo Identity control that stays available when the identity filter empties the grid. Cloud cases removed two names and restored them from that empty state on both surfaces.
- Bind every human label to its reviewed pixel hash, including before model setup. Analysis cannot turn a name from replaced pixels into an example. Crop corrections keep their existing region; whole-image anime learners cannot silently coexist with another named character crop.
- Metadata merges now invalidate old previews/undo, preserve current evidence, and stop conflicting imported names from teaching. Dataset payloads carry a revision token for graph and image-instance changes; identity filters refresh without clearing a still-valid grid during the read.
- Displayed subject previews now use the same reviewed pixel hash as assignment. Pixel replacement clears old crop/single-character choices and blocks learning until the new preview loads. The cloud probe replaces a synthetic image between review and Assign, expects 409, then checks fresh crop dimensions before retrying.

## Open
1. Complete exact-head cloud Gates, Studio/identity/Bank/Settings/curation browser checks and the Linux startup-port check. Then land the qualified branch on origin/main and advance only the reviewed LDS baseline in Overwatch. Preserve its unrelated existing config edits. Runtime activation still needs explicit authorization before updating or restarting the running checkout.
2. The operator chose a local accuracy set. Await its location/labels and explicit local-evaluation authorization; keep those images local and report wrong names, misses, abstentions and provenance. Similarity thresholds remain unmeasured heuristics.
3. Carry forward physical-device/trainer gates from 5d32d6ceb:HANDOFF.md. The prior picked-image import and Qwen preset ports are included in the qualified identity source. The original desktop tag timeout's exact cause remains unproven; automatic and manual recovery passed forced-failure checks.
4. Added operator report: Bank's Video tab shows an inline render fallback. Live browser access is unavailable; the server log has no matching backend exception. Await the first browser ErrorBoundary line. Prepared a concrete recovery repair: plugin imports have panel-specific reload limits, unsaved forms suppress automatic reload, and lane failures show Reload Page without squeezing Images. The enabled-Video cloud fixture checks five normal states and 15 transient/permanent/dirty-form cases, including the Images and recovery target sizes. Do not claim the live cause from the screenshot alone.

## Upstream review carried forward

On 2026-10-18, upstream's default branch remained v2 at d566904e40f80f3513b4f9f0675f52cee69ec9d7. v1 remained 3fe3d4f0e29e28de583a6e22bce886c35e5ecd3f. The review started at fork 2f295a1a9, with merge base d13337cc3. The previous reviewed SHA 1d6670a5f was recovered from 5d32d6ceb:HANDOFF.md and matched Overwatch. It is an ancestor of the new head. The review window contains 57 commits; raw ancestry counts are not missing features.

| Upstream commits | Class and evidence |
| --- | --- |
| 92e1a0521, ea2010e10 | PORT + DIVERGENCE as 5c77f88e2 and 79ef1b21a. Health boot identity and the local Server restart use a shared wait helper. Divergence 12 keeps update banners and Maintenance's offline refusal unchanged. |
| 690dc7972 | PORT + DIVERGENCE as b069902ee. Local base-model Studio runs need no LoRA. Divergence 10 keeps one help registry; compact styles and phone touch targets remain. |
| ea9616243 | PORT + DIVERGENCE as 006e2fc2e. MOSS-Image uses prepared local files and explicit Setup actions. Preserve the pinned Apache-2.0 runtime NOTICE/license and the single help registry. No MOSS training lane is advertised. |
| d21127d29, 69d3c84a0 | PORT as a4e606866 and 0048bd1d3. Guide anchor, explicit installer action and family contracts follow the adopted base-only generation behavior. |
| e57a23e5d | PORT as 6fe9df903. Shared Linux TIME_WAIT probing and managed bind selection only; no Docker distribution or updater is restored. A Linux cloud case covers the platform-specific behavior. |
| 569a51ef8, aeb1d8a1a, 34331e9be, e929e9e01, 68174a805, ece790abd, 195915512, 649604bf4, e48cbb321, 9b5991f92, adaace74e, 45a2c1980, 31717ad77 | SKIP-BUILD. Rebuild the fork bundle from its own source. |
| 2122505f9, b1b581439, 73fce1eb2, ec01f8d40, 81c662ecc, 1b8501e84, 5713579b6, a4f6bf554, e90a64d85, 4f49c55a5, 19e974269, c3888fdb2, 2633d13e5, 8897e4377, 91243d2c7, 123ae9ada, 8f4371945, 057b5d064, 39e0e2a9e, f2353bbf7, b4e5e2d90, 2f39b2786, b2a281046, ecf552657, 92a299910, 62c637bcf, edf43a711, d09165661, 7ac09034e, 45c9de2b7, d566904e4 | REJECT. Patreon, external catalog/plugins, online updates and their docs/tests conflict with Distribution and Divergence 12. The fork has no live Patreon service to isolate. |
| 55cb05ea7, 30cbeba7b, 686b34c1a, a7079a722 | REJECT. Upstream merge commits bring rejected access-line history; wanted source changes are picked individually. |
| 3ad18cd67 | REJECT. The Docker updater is outside this fork's distribution. |
| d4c9b3dbc | REJECT. Retain the fork version/channel and announce only adopted behavior. |

Decision: retain the seven named source ports, then qualify and land them with the identity work. A later review starts after `d566904e4`. Do not merge upstream/v1 or upstream/v2. Advance Overwatch's full-SHA compare URL and review comment/subtitle only after the qualified fork landing.

## Decisions
- Photographic people, anime assignment and original-character learning are required workstreams.
- Share identity records; keep photographic-face and anime-image/subject evidence distinct and allow several characters per image.
- Confirming a name enrolls subject evidence. Ambiguous multi-character images require an explicit subject region before enrollment.
- Only human-confirmed examples teach identity; corrections and undo remove prior contributions.
- Reuse prepared local engines first; model retraining needs measured benefit and an explicit operator action.
- Store content/model provenance and unknown results; similarity is not confirmed identity.
- Preserve profile boundaries, local inference, caption rules and source/dist commit separation.
- Scrubbed task-branch pushes may transport cloud validation; main needs passing Gates and landing authorization.

## Traps
- Do not switch, rebuild or migrate the running checkout; retain its unresolved activation gate.
- Isolate runtime paths and inherited profile identity before application imports, which can mutate schema/state.
- Local tests, fixture-backed checks and probes remain unauthorized; selecting a future local corpus did not authorize a run. Static lint/build/privacy scans are permitted.
- Bank clusters are disposable local numbers, not permanent identities.
- Whole-image taggers cannot locate several characters; captions are not confirmed evidence.
- Keep real images and names private; accuracy needs a permitted labeled set with unseen artwork held out.

## Verify
Local Ruff, ESLint (zero errors), production build, whitespace and publishable-file privacy scan passed. Outbound inventory is unchanged. Tests/probes have not run locally.
Combined run 39176250128 at 40a4c8ce0 passed Linux ports and the existing Bank/Settings, curation and identity browser cases. Backend: 10082 passed, one workflow-contract failure and 15 skips. Core frontend found one introduced guide ellipsis. The Studio probe used steps_list although the client sends steps. All three integration repairs are staged for the next exact-head cloud run. The Windows workflow guard still forbids replaying targeted pytest before its full suite; the independent Linux job covers platform-specific bind rules.
Fork Gates run 39172784150 succeeded at be06ddbab26a32e5d4032201c8a19cfb4b5e0851. Its full Gates receipt reports Succeeded=true and zero exit codes for every step, including both linters, build, served plugin startup, core/bundled frontend, bundled Python and the full backend/tooling suite. Backend JUnit: 10063 passed, 14 skipped, zero errors/failures.
The same exact-head browser receipts passed 20 identity cases, 5 folder-undo cases, stale-pixel/preview/crop recovery, Bank/Settings and curation checks. Folder Undo works even when the bank has only one folder, where the old Subfolder menu is hidden. No live declarations were changed.
Receipts are retained under the worktree Git metadata in lds-gates-validation/cloud-39172784150. Run: https://github.com/socrasteeze/lora-dataset-studio/actions/runs/39172784150.
The optional private-name checks skipped because no external name list was configured. Live model/tool/device checks remain separate from synthetic cloud qualification. Recognition accuracy has not been measured on real artwork.
Cloud checkout only, with pinned dev/CPU Torch overlays and Node 24:

```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/bankOtherTagsProbe.mjs
node frontend/scripts/bankCurationProbe.mjs
node frontend/scripts/identityLearningProbe.mjs
node frontend/scripts/studioBaseProbe.mjs
```
