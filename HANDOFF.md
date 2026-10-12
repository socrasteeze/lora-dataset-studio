# HANDOFF

**Updated:** 2026-10-12 | **Delivery target:** main | **Base:** 4b303f302 | **Qualification:** exact-head Fork Gates

## State

The delivery wave includes the filter fix, suite repairs and separate source/frontend bundle commits.
The user authorized main publication after exact-commit cloud Gates. Git refs and GitHub Actions record landing/qualification status. No live restart ran.

## Done this session

- Curation now forwards resolution, framing, origin, WD14 tags and rejection reason to the shared grid predicates, including hidden folders. Similar and text search share the correction.
- Added 18 regression cases: all pass on the fix and all fail against unchanged base application code. Ruff, frontend build and ESLint passed; ESLint reports 32 warnings on unchanged files.
- Laptop source snapshot `765c12e40c99e16c1dafc5f915340a3585978afd`: backend initially 161 passed / 2 failed / 2 skipped; correcting the archive checkout's missing Git ref makes privacy 8 passed / 2 private-name skips. The remaining folder/job-state failure reproduces on base `4b303f302`. Frontend core 5159 passed / 17 failed; all 17 reproduce across ten unchanged-base test files. Bundled frontend 1073 passed / 4 skipped. Logs and source hashes are ignored under `.superpowers/curation-filter-scope/`.
- Suite repairs restore the visible mask button, phase/Stop text and crop guidance; fix deletion's self-conflicting lease check, stale source assertions, guide anchor and ellipsis. Frontend core 5179 passed / 0 failed, bundled 1073 passed / 4 skipped; targeted backend 108 passed / 2 private-name skips.
- Full Gates exposed 20 stale schema-count assertions and one cross-module HTTP-mock contamination. Schema tests now require all 36 tables, including both collection tables; the node-installer recorder stays module-local. Replays: 72 schema/SDK tests and 241 installer/Setup tests passed. Populated workspace/Review probe measured ten states across five sizes with zero findings; list priming skipped because the workspace was already open. Stop moves the grid 0 px at all five sizes. Evidence is ignored under `.superpowers/suite-repairs/`.
- Final laptop Gates completed every test-bearing phase: backend/tooling 9727 passed / 10 skipped, frontend core 5179 passed, bundled frontend 1073 passed / 4 skipped; all bundled Python phases passed. The invocation exited 1 at attribution because the archive had source and dist staged together. The exact attribution function passed after mirroring source `d10f82e79` and bundle `c466964a9`, with an empty index and preserved author identity. All 18 changed implementation/test files match by Git blob across machines. Build, Ruff and ESLint passed; ESLint retains 32 existing warnings. Privacy scrub: 2976 files / 0 findings.

Earlier delivery:

- Bank comparison opens from style/duplicate groups, similarity/manual selections, and collections; previews page at 24 and full detail opens on demand.
- Persistent collections support create, rename, membership edits, merge, split, delete, undo, grid scope, and kept-only promotion through existing destinations.
- Membership stores image IDs plus instance guards. Restart/reclustering, missing sources, stale revisions, and source-byte preservation passed isolated checks.
- The prior review edits remain: nearby preloads, confirmed-save advance, phone decisions, held-key guards, and late-response protection.
- Latest targeted backend run: 40 passed, 2 private-name checks skipped; earlier broader regression run: 170 passed, 2 skipped. New collection suite contains 24 tests.
- Browser workflows and five-size dialog probes passed; Bank workspace resting checks also had zero findings (Bank-list priming skipped on the direct workspace fixture). Build, Ruff and ESLint passed; ESLint retains 32 existing warnings. Guide, help ownership and What's New are updated.

## Open

1. Qualification is recorded by `.github/workflows/fork-gates.yml`, which runs the existing Gates script with pinned dev/CPU Torch dependencies on the exact PR head. Check the cloud receipt for the delivered commit; laptop receipts alone do not qualify a later landing.
2. The user authorized clean push, main merge and stale-branch deletion. Preserve the declared skips. Merge only after cloud Gates passes; delete only branches contained in main and absent from other worktrees.
3. Desktop tests remain restricted. Laptop tests were explicitly authorized and isolated; the cloud workflow uses a fresh test environment. Preserve the original snapshot invocation's exit 1 receipt and its attribution replay as separate evidence.
   Cloud CI passed all suites on `5bb5cb35b`; Fork Gates exposed one vision-pool wall-clock assertion at 0.47 s versus its 0.4 s limit. Its replacement uses a three-party barrier across two rounds to prove actual overlap; a serial pool fails rather than merely running slower. Requalify the updated commit before main delivery.
4. The operator must restart Studio to register collection routes and create the two additive tables. Production data and the live runtime were not exercised.
5. Physical phone/PWA acceptance remains open. Browser validation used synthetic component fixtures and the actual Bank workspace against an isolated test backend.
6. Source and the consolidated build(frontend) bundle remain separate commits. Remove only task branches whose tips are contained in main and which have no other worktree.
7. The earlier Runs and LM Studio framing ports (`f8dccc89b`, `dbe88f50a`) are already ancestors of main. There is no remaining local upstream-review branch to land or delete. Do not restore excluded plugins.

## Decisions

- Collections have Bank scope because they organize source candidates before promotion; Dataset keeps its existing original/reference comparison and review.
- BankCollection and BankCollectionMember are new create_all tables. Missing image records keep their membership; instance IDs prevent numeric-ID reuse from binding another image.
- Collection writes use the Bank mutation lease, revision checks, and atomic one-step persisted undo. Merge/split undo checks every affected collection.
- Generic comparison decisions affect selected candidates only. Explicit duplicate resolution rejects other copies; snapshot validation refuses changed groups. Distinct preserves decisions.
- Collection promotion rechecks available kept members on the server and refuses an empty eligible set. Collection metadata never changes source files or verified attribution.
- The user authorized isolated local tests and responsive checks during implementation, then instructed delivery without further tests. No real datasets, GPU jobs or external media were used for validation. No deployment or production restart is authorized.

## Upstream review carried forward

On 2026-10-11, `upstream` `v2` was `9d936b9e4`
(`docs: simplify the Vast.ai signup badge label`, 2026-10-11). `v1` was
`3fe3d4f0e`. The review used fork commit `d658c6357` and merge base
`d13337cc3`. Git counted 700 fork-only and 22 upstream-only commits. The
latter count is an ancestry difference, not 22 missing features.

| Upstream commits | Decision and evidence |
| --- | --- |
| `d5a837849` | Ported as `f8dccc89b`. The fork ships no Runs-hub plugin, so `/cloud` polled the unregistered `/dataset/train/runs` and showed HTTP 404. Both `/dataset/train/runs` and `/dataset/train/cloud/runs` now serve `ct.all_runs`; What's New drops the Cloud-plugin wording. |
| `c4fedcd46` | Ported cleanly as `dbe88f50a`. LM Studio now receives the image before the classify prompt. |
| `6e80370cc`, `7bb6b6b96` | Bundle-only. Rebuilt from source as `0f49073dc`. |
| `57217e137`, `9d936b9e4` | Skip the README Vast.ai referral badge under Divergence 4. It advertises the rented-GPU lane this fork removed. |

Decision: adopt `d5a837849` and `c4fedcd46` on `upstream-review/2026-10-11`.
A later review starts after `9d936b9e4`. Do not merge `upstream/v1` or
`upstream/v2`.

## Traps

- Isolate LDS_DATA_DIR, LDS_CONFIG, LDS_ENV, LDS_PLUGINS_DIR and LDS_EXTENSIONS_DIR before importing the app. create_app changes schema/runtime state.
- Use the pinned .venv interpreter. Vite must target the isolated backend before writes. The normal dev proxy targets the live install.
- Preserve the completed review work. Do not reset, stash, overwrite it, rewrite history, or restore excluded online features.
- Source checks and viewport checks are not full cloud qualification. The isolated laptop checkout uses a source snapshot; its base HEAD alone does not identify that snapshot.
- A rebuilt frontend reaches the served workspace before Python reloads. Restart is required for the new backend routes/tables; no automatic production restart was performed.
- Test receipts and synthetic screenshots are ignored scratch artifacts under .superpowers/collections and frontend/.superpowers/collections. No private data is required to reproduce them.

## Verify

The user authorized these tests on the laptop only. Desktop tests still require explicit
authorization. Current receipts are in `.superpowers/curation-filter-scope/`.

```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_bank_collections.py -q
.venv/Scripts/python.exe -m pytest backend/tests/test_image_bank_curation.py backend/tests/test_bank_sort_exclude.py backend/tests/test_image_bank_text_search.py backend/tests/test_image_bank_text_exclude.py backend/tests/test_no_personal_data.py -q
.venv/Scripts/python.exe -m ruff check .
```

From frontend:

```powershell
node --import ./scripts/registerSdk.mjs --test src/components/bank/groupComparison.test.js tests/bank-group-comparison-render.test.mjs
npm test
npm run lint
npm run build
```

For future full qualification of the exact delivered commit:

```powershell
scripts/gates.ps1 -Phase Gates
```
