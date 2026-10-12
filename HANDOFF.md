# HANDOFF

**Updated:** 2026-10-11 | **Delivery:** main | **Base:** c3e4b3187

## State

Main delivery includes group comparison, saved collections, and the earlier Keep / Reject changes.
The user explicitly authorized clean, merge, push and stale-branch removal without tests.
Source and bundle have separate delivery commits. The live backend was not restarted.

## Done this session

- Bank comparison opens from style/duplicate groups, similarity/manual selections, and collections; previews page at 24 and full detail opens on demand.
- Persistent collections support create, rename, membership edits, merge, split, delete, undo, grid scope, and kept-only promotion through existing destinations.
- Membership stores image IDs plus instance guards. Restart/reclustering, missing sources, stale revisions, and source-byte preservation passed isolated checks.
- The prior review edits remain: nearby preloads, confirmed-save advance, phone decisions, held-key guards, and late-response protection.
- Latest targeted backend run: 40 passed, 2 private-name checks skipped; earlier broader regression run: 170 passed, 2 skipped. New collection suite contains 24 tests.
- Browser workflows and five-size dialog probes passed; Bank workspace resting checks also had zero findings (Bank-list priming skipped on the direct workspace fixture). Build, Ruff and ESLint passed; ESLint retains 32 existing warnings. Guide, help ownership and What's New are updated.

## Open

1. Full frontend qualification remains incomplete: the previous core run had 5149 passed / 17 failed. Fifteen failures reproduce on unchanged c3e4b3187; two local failures come from leftover excluded-plugin directories. The clean tracked baseline had 16 failures; this work corrected its shortcut-hint failure. Do not restore excluded plugins.
2. Bundled frontend suites passed 1073 tests with 4 skips. The npm test chain remains failed because core fails; report these separately.
3. The user waived new test runs and authorized main delivery. No tests, responsive probes or cloud Gates run during delivery. Delivery commits carry [skip ci] so the push does not start test jobs. Earlier receipts do not qualify the exact final commit.
4. The operator must restart Studio to register collection routes and create the two additive tables. Production data and the live runtime were not exercised.
5. Physical phone/PWA acceptance remains open. Browser validation used synthetic component fixtures and the actual Bank workspace against an isolated test backend.
6. Source and the consolidated build(frontend) bundle remain separate commits. Remove only task branches whose tips are contained in main and which have no other worktree.
7. (2026-10-11): Upstream ports sit on `upstream-review/2026-10-11`, unpushed. No tests ran. Land on `main` only after cloud Gates pass on the exact commit.

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
- Full frontend failures are unresolved gates. Source checks and viewport checks are not full cloud qualification.
- A rebuilt frontend reaches the served workspace before Python reloads. Restart is required for the new backend routes/tables; no automatic production restart was performed.
- Test receipts and synthetic screenshots are ignored scratch artifacts under .superpowers/collections and frontend/.superpowers/collections. No private data is required to reproduce them.

## Verify

Do not run these commands under the current no-tests instruction. Future validation requires
new authorization. Implementation receipts are in the ignored scratch logs.

```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_bank_collections.py -q
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
