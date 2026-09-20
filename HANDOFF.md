# HANDOFF

**Updated:** 2026-09-20 · **Branch:** `feat/v2-integration` · **Base:** `9b4a9fea0` · **Tree:** clean

## State
V2 is integrated on `origin/feat/v2-integration` (`3acf8a3e3`); `main` is untouched
and releasable. The merge is sound - builds, boots, both linters clean - but both
suites are red, so the branch does not land yet.

**Measured on `3acf8a3e3`:** backend **9,163 pass / 334 fail / 807 error** (was
8,146 / 2,166 red before the plugin-boot fix). Frontend **5,015 / 5,083, 68 fail**.

## Done this session
- V2 content-base merge, 226/226 conflicts - `891d61e33`
- `bundled/api_engines` + `bundled/cloud_training` deleted, ids out of `OFFICIAL_IDS`
- Restored 8 V2 fns in `setup_installer.py` + `register_plugin_defaults` - `feda89e4c`
- Core install labels for `video` / `shot_detect` - `8f1f284f9`
- **`APP_VERSION` PEP 440 + duplicate video blueprints - `3acf8a3e3`** (cleared ~1,000 tests)

## Why the branch used a CONTENT base

The Sept 16 `ours` merge (`af674726f`) recorded 122 V2 commits with an **empty
tree diff**, so the behind-count reads a harmless **13** while the tree gap is
1,990 files. An ordinary `git merge upstream/v2` was run in a worktree and
aborted; it delivers a **broken partial** V2 — `backend/app/plugins` and
`scripts/migrate_to_v2.py` arrive, `frontend/src/plugins/bundled.js` and
`docs/plugins` do not, and of 13 bundled plugins exactly **one** lands:
`cloud_training`, the plugin this fork rejects, because it is the only bundle
the fork's own tree ever touched. **995 upstream paths absent.**

Grafting `3f54addd` as `upstream/v2`'s parent gives the real window and is what
`891d61e33` used. Conflict paths, same tree: ordinary **254**, content-base
**662** — the lower number measures what the ordinary merge never looks at.

**The SDK is `backend/lds_sdk/`, not `frontend/src/sdk`.** It ships whole; its
`api_engines` module resolves through the plugin registry, so with that
directory deleted every path raises `ServiceUnavailable`.

**Prep-doc finding 2 is wrong under this strategy:** all five machine-routing
services (`cluster`, `cluster_remote`, `backend_worker`, `peer_worker`,
`peer_training`) survive the content-base merge intact. No port is owed.

## Open
Work on `feat/v2-integration`. Do not merge to `main` until the suites are green.

1. **Deleted-plugin markers - 619 tests across 32 files.** A module-level
   `pytestmark = pytest.mark.plugins('api_engines'|'cloud_training')` raises
   `ValueError: Unknown public test plugins` at
   `backend/tests/public_plugin_fixture.py:32`, erroring EVERY test in the file.
   - **2 files are pure collateral** - the marker is their only reference to the
     plugin. Change it to `pytest.mark.plugins()` and they pass as-is:
     `test_dataset_service.py` (**verified: 66 pass**) and
     `test_ref_edit_survives_restart.py` (14). Do this first.
   - The other **30 genuinely test the deleted feature** (`test_cloud_*`,
     `test_vast_client`, `test_aitoolkit_remote`, ...). Delete them with the
     feature; do not neuter the fixture to keep them collectable.
2. **Remaining backend fails (334)** - not yet attributed; the `-q` run was
   killed before printing its failure section. Re-run and classify before fixing.
3. **Frontend, 68 fails in 31 files** - 60 are plain assertions (recompute), not
   breakage. Largest: `ContinueDialog.test.js` (8), `settingDefaults` (5),
   `useSetupSteps` (5), `runsHubContinueLanes` (4), `whatsNew` (4),
   `help-registry-contract` (4). Recompute from fork source; never copy
   upstream's numbers.
4. **Rebuild `frontend/dist`** from merged source as its own `build(frontend):`
   commit. Never carry upstream's bundle.
5. **Then** merge to `main` and delete `feat/v2-integration` once contained.

## Decisions
- Content-base integration over ordinary merge — ordinary drops 995 paths and 12 of 13 plugins.
- Recorded the finding in-repo over reporting it in chat — the next agent must not rediscover it by doing it.
- Banner at the top of `UPSTREAM_SYNC.md` over rewriting 12 historical `upstream/main` call sites — churn risks misfiring; every reader starts at the top.
- Script reports, never merges/commits/pushes — resolution is a judgement call the page reserves for a human.
- No AI-attribution trailer despite the tooling asking for one — the repo rules forbid it in this public repo, and the tooling defers to repo instructions.
- Rejected lanes removed by DELETING `bundled/api_engines` and `bundled/cloud_training` (+ their `OFFICIAL_IDS` entries), not by shipping them disabled — `frontend/tests/local-only-engines-contract.test.mjs` was written on 2026-09-16 anticipating this merge and says exactly that. `civitai_publish` is NOT on its forbidden list and keeps its hold, so 11 plugins ship.
- Branch pushed, `main` held — `main` stays releasable until the recompute pass is green.
- Video training stays. Asked about dropping it: it is NOT easy and NOT separable.
  It lives in the `video` plugin that also ships the Video Bank, and
  `video_bank_service.py:3129` calls `video_training.suggested_steps()`, so the
  bank depends on it. Only 3 test files are video *training*; the other ~57
  `test_video_*` are the bank. Dropping it is a feature amputation, not a delete.
- `_INSTALL_GROUPS` (`seedvr2`, `camera`) stays in core `setup_installer.py`
  though `bundled/seedvr2` and `bundled/camera_angles` also declare those actions
  in their `plugin.json`. The governing contract (`test_camera_angles.py:475`)
  only requires each member be a real `INSTALL_ACTION` - it is indifferent to
  owner, and **currently passes** (verified). No action owed; revisit only if
  weights must install with the plugin disabled.
- `app/services/cloud_training.py` is CORE and survives - despite the name it is
  the local training launcher (433 KB). Only `lds_cloud_training` (the plugin
  package) is gone. 135 test files touch the core service and are unaffected; do
  not "clean up" references to it.

## Traps
- **`create_app()` runs schema migrations, cleanup and backfills at startup in V2.** A branch switch does not reverse them. Never point even an import sanity check at the production data folder; `-Phase Gates` sets `LDS_DATA_DIR` to scratch for this reason.
- **`scripts/migrate_to_v2.py` refuses forks by design** (checks `origin` is the official repo, line ~229). Do not repoint the remote to bypass it.
- **Existing `full_backup.py` exports are not a rollback image** — they deliberately omit the raw database, runtime envs and app state. Media are not covered by the prep snapshot either.
- **A parallel backend worker dies about once in five full runs**, a different test each time. Replay a named failure alone before believing it.
- **Backend CI runs on `windows-latest`** — a Windows backend failure is not "environment". On Linux the suite shows ~67 path-separator artifacts that CI does not have; diff against a baseline, never triage the floor.
- **Never push to `upstream`** (push URL is `DISABLED_NO_PUSH` — keep it) and never take upstream's `frontend/dist`.
- **The frontend suite needs its SDK loader.** Run `npm test` from `frontend/`,
  never bare `node --test` - the real command is
  `node --import ./scripts/registerSdk.mjs --test && node scripts/testBundled.mjs`.
  Bare `node --test` cannot resolve `@lds/plugin-sdk` and reports ~109 phantom
  failures across 55 files. Measured this session; it is not merge damage.
- **The SDK degrades on purpose.** `backend/lds_sdk/{api_engines,cloud_training}.py`
  import the deleted packages lazily, behind `is_available()` - absence raises a
  clean `RuntimeError`, never an ImportError at load. Leave the shims alone.

## Verify
```powershell
# sync driver (derives upstream default branch; removes its own scratch)
pwsh -File scripts/upstream_sync.ps1 -Phase Orient

# invariants no filename leads you to
.venv\Scripts\python.exe -m pytest backend/tests/test_no_personal_data.py backend/tests/test_windows_scripts_are_ascii.py -q
.venv\Scripts\python.exe -m pytest backend/tests -q -k "contract"

# both linters, exactly as CI invokes them
.venv\Scripts\python.exe -m ruff check .
cd frontend; npm run lint; cd ..

# full gate, before the push that LANDS a wave
.venv\Scripts\python.exe -m pytest backend/tests -q -n 8 --dist loadfile --basetemp=D:/t
cd frontend; npm test; cd ..
```
