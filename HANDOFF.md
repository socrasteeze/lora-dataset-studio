# HANDOFF

## Delivery Preparation (2026-10-14)

- The operator authorized clean delivery to main if the changes are qualified, then explicitly authorized resuming the required cloud checks. That supersedes the earlier request to keep PR #3 open once the required cloud checks pass. Local tests remain pending.
- Delivery scope: Other Tags OR selection, wider two-column Settings forms, persistent single-bank import exclusions, and Bank loading/query improvements. The caption review required no code change: the inspected saved run did not request Caption, which stays optional in Launch All.
- Source and generated frontend bundle are prepared separately on `noble/other-bank-tags`. Origin/main is unchanged at `d20878b90`; fetching found no new main commits. Build, Ruff and ESLint passed, with 32 existing ESLint warnings. The privacy scan covered 2,982 tracked/untracked text files with zero findings. Attribution matches are technical references, caption provenance and regression fixtures; no attribution removal or credential rotation is needed.
- Keep main unchanged until exact-head cloud Gates and rendered checks cover the new Settings and import behavior. The cloud browser check covers one-bank exclusions and all core Settings routes at five sizes, plus the existing responsive probe. Historical status notes below describe earlier points in the work.
- First resumed cloud head passed all 241 focused Bank regressions and cloud lint. Frontend qualification found two stale sequential-refresh assertions, feed ordering and a loading-text ellipsis; corrections retain the awaiting-both-refreshes contract and existing feed IDs. The new browser fixture returned to its initial bank on reload, so import checks now use the real Banks navigation. Qualify the repaired source and bundle on a new exact head; earlier results do not qualify it.
- The next browser run passed Bank opening/import checks at all five sizes and all 50 core Settings route/viewport checks. The existing responsive probe then measured a 4 px mobile Settings-tab overflow at 360 and 412 px. The tab strip now matches the shell's 12 px phone padding and 16 px larger-screen padding. Probe thresholds stay unchanged; requalify the corrected source and bundle.
- Markerless Settings routes now wait for the rendered settings section directly. The existing probe otherwise spent 15 seconds per viewport waiting for absent chrome markers before its page fallback. The 15-second readiness timeout and all measurement limits/coverage remain intact.

## Bank Opening Performance Pending (2026-10-14)

- Opening a Bank now reads saved inventory and the first image page before a separate source-folder check. The new folder-sync endpoint reuses additive refresh and its mutation lease; the existing workspace endpoint keeps its old behavior for older clients. New files trigger a grid/statistics refresh. Source-check failure keeps saved inventory usable.
- Headline counters use one conditional aggregate plus the existing promotion read. Flag totals and pending subsets use one aggregate. Person covers use one ranked query for all displayed clusters; style covers ride along as minimum image IDs. The list's four per-card counters use one grouped query. Group definitions, cluster IDs, cover ranking, hidden-folder scope, vetoes and stored decisions retain their existing meaning.
- Grid changes abort superseded image requests. Dashboard responses reject stale requests/bank IDs. Periodic statistics reads do not start while one is pending; the initial successful load starts the refresh clock. Activity polling avoids overlapping requests across effect restarts. Late tag/subfolder reads cannot replace another bank's choices. After accepted actions, grid and dashboard refreshes run in parallel; confirmed-save review behavior is preserved.
- Added unrun regression cases for source-check separation, additive refresh, counter equality/query budgets, cover ranking and ownership. The existing cloud browser probe now holds folder-sync open and requires the saved first page and name to render before release at all five sizes. No timing benchmark, fixture test, rendered check, live data access, runtime restart or cloud run was performed. Tests remain stopped.
- Frontend build, Ruff and ESLint passed; ESLint retains 32 warnings in unchanged files. No speedup is claimed from those static checks. Changes remain local and uncommitted alongside the Settings and import work. Keep PR #3 open and main unchanged.

## Single-Bank Import Exclusions Pending (2026-10-14)

- Subfolders now opens an inclusion preview independently of Separate Banks. The default keeps one named parent bank; checked subfolders stay within it. Separate Banks retains the old split import. Source folders are never moved or changed.
- Single-bank exclusions persist through the existing hidden-folder scope. Rows stay indexed for recovery through Exclude Folder, while grid/counts/passes/curation exclude them across rescans. Re-import adds exclusions and preserves earlier exclusions and decisions; busy banks reject the scope write through the mutation lease.
- An older running backend cannot silently ignore the new exclusions: the preview advertises support, and the form requires a Studio restart when support is absent. The existing inventory limit still applies to all indexed images.
- Regression cases cover one-bank counts, persistent exclusions and recovery, unchanged source bytes, preserved decisions, malformed/empty scopes and busy-bank protection. Tests and rendered checks remain stopped and unrun. Frontend build, Ruff and ESLint passed; ESLint retains 32 warnings in unchanged files. These changes and the Settings layout remain local and uncommitted; keep PR #3 open and main unchanged.

## Settings Layout Pending (2026-10-14)

- Settings and plugin Settings use the existing wide page shell. Shared Settings cards arrange fields in two columns from 640 px and one column on phones. Descriptions, tables, compound preset panels and diagnostics keep full-width rows. Captioning's three-column grid is now two columns; settings values and save handlers are unchanged.
- Tests remain stopped under the user's standing instruction. No local tests, rendered checks or cloud runs are authorized by this layout request. Local build, Ruff and ESLint passed; ESLint retains 32 warnings in unchanged files. Rendered layout acceptance remains pending.
- The layout changes are local and uncommitted on the existing task branch. Keep PR #3 open and main unchanged. Do not push or restart tests without a new instruction.

## Other Tags Delivery Hold (2026-10-14)

- Branch `noble/other-bank-tags` adds a full-width Other Tags menu to the Bank filter rail, using the existing controls and theme. Search accepts spaces/underscores. Select All is the first option for a typed search and selects all matches, including hidden rows, in one update. Other Tags share one OR group; categories still combine with AND. Show More reveals 100 matches at a time, and long labels wrap.
- The tag-facets endpoint now returns the full vocabulary by default; explicit service limits still report truncation. Added regression cases cover more than 400 tags, search and preserved selections. Guide, help, README and What's New describe the action.
- Latest user instruction: stop the cloud tests, finish delivery preparation, and keep [PR #3](https://github.com/socrasteeze/lora-dataset-studio/pull/3) open. Do not merge to main or restart tests without a new instruction. Local tests remain pending. Production data and restart remain outside scope.
- On source commit `20a293636`, cloud checks passed 181 focused backend tests, the Bank browser checks at all five required sizes, the existing responsive probe, frontend tests/build and lint. Full backend CI and Full Fork Gates were cancelled before qualification completed. The delivery is not qualified for main.
- Cancelled cloud runs `38673580521` (Fork Gates) and `38673580522` (CI) are confirmed complete with cancellation results. The user allowed personally authenticated `gh` only to cancel those two runs. That exception does not authorize other GitHub writes.
- Local build, Ruff and ESLint passed; ESLint retains 32 warnings in unchanged files. The final privacy scan covered 2,982 tracked/untracked text files with zero findings. Technical references and synthetic fixtures were retained. Source and generated bundle commits stay separate; main remains at `d20878b90`.
- Source comparison for the grouping review found 403 unchanged Bank service functions; only tag parsing/counting and grid/curation tag predicates differ. People/face detection and IDs, folder-person rules, style/duplicate grouping, collections, category definitions and independent group filters are unchanged. No existing group data was changed.
- The Guide reserved-anchor omission and stale ComfyUI HTTP mock are repaired. The browser fixture now completes core Setup, shuts down gracefully and disposes SQLite; its runner preserves primary error diagnostics. Focused checks and browser checks precede full Gates in the workflow. No local tests ran.
- Ghost policy additions in AGENTS.md and CLAUDE.md are committed. This documentation-only hold update uses `[skip ci]` to avoid restarting tests. Earlier delivery notes below are historical; their authorizations do not expand this task.

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
