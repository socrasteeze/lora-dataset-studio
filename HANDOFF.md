# HANDOFF

**Updated:** 2026-09-20 · **Branch:** `main` · **Base:** `68e45bb18` · **Tree:** clean

## State
Sync tooling and the v1/v2 finding are committed and pushed; nothing is in
flight. **The V2 migration has not started** — the next session begins it, and
the whole middle of this file exists to stop it beginning wrongly.

## Done this session
- `scripts/upstream_sync.ps1` — executable half of `docs/UPSTREAM_SYNC.md`
- `docs/UPSTREAM_SYNC.md` — banner: `upstream/main` is gone, v1 frozen, v2 is a migration
- `docs/V2_MIGRATION_PREP.md` — measured what an ordinary v2 merge really delivers

No application source changed. No merge was committed anywhere.

## The upstream branch rename (2026-09-19)

Upstream renamed `main` → **`v1`** (frozen) and made **`v2`** the default.

- **`upstream/v1` is fully merged into this fork: 0 incoming, measured.** There
  is no v1 sync left to run, now or later.
- **`git fetch upstream --prune` DELETES your local `upstream/main`**, because
  it no longer exists on the remote. It happened this session. Afterwards
  `HEAD..upstream/main` fails outright, and a script that swallows the error
  reports "0 incoming" — indistinguishable from "already current". Re-fetch
  explicitly with the two refspecs, or just run the Orient phase, which derives
  the default branch from `git ls-remote --symref upstream HEAD`.

## V2 is NOT migrated

Stated plainly because it was believed otherwise this session, and the tree
disagrees: no `bundled/`, no `backend/app/plugins`, no `frontend/src/sdk`, no
`scripts/migrate_to_v2.py`, no `docs/plugins`. None of the three V2 foundation
commits (`b581af1b7`, `29c980f70`, `fdb2feb98`) are ancestors of `HEAD`.
Tree gap to `upstream/v2`: **1,990 files, +182k/−65k**.

Two things make it look finished. The Sept 16 `ours` merge (`af674726f`)
acknowledged 122 V2 commits with an **empty tree diff**, so the behind-count
reads a harmless **13**. And `b4ed0db12` added three thorough V2 docs while
touching **zero application source** — it says so itself: "preparation only".

### What an ordinary merge actually delivers — measured, not predicted

Executed this session in an isolated worktree, then aborted. `git merge
upstream/v2` does not produce a smaller V2. It produces a **broken partial**:

| Path | After ordinary merge |
|---|---|
| `backend/app/plugins` | PRESENT |
| `scripts/migrate_to_v2.py` | PRESENT |
| `bundled/` | PRESENT — **1 of 13** plugins |
| `frontend/src/sdk` | **ABSENT** |
| `frontend/src/plugins/bundled.js` | **ABSENT** |
| `docs/plugins` | **ABSENT** |

The one plugin it lands is **`cloud_training` — the plugin this fork rejects
under D4** — because it is the only bundle the fork's own tree ever touched, so
it is the only one the merge sees as changed. The twelve it drops are the ones
the fork needs: `video`, `canvas`, `model_tools`, `scrape`, `camera_angles`,
`image_upscale`, `seedvr2`, `live`, `resource_monitor`, `hf_publish`,
`civitai_publish`, `api_engines`.

**995 upstream paths absent** once the merge completes. Backend plugin machinery
with no SDK to load it and no plugins but the rejected one — a tree that can
plausibly build and import while delivering none of the feature set.

Conflict paths, same tree, same day: **ordinary 254, content-base 662**. The
lower number is not the cheaper path; it measures how much content the ordinary
merge never looks at.

## Open
1. **Integrate from the content base**, never an ordinary merge —
   `--merge-base=3f54addd34b0b3195a94e594013771631e34eaf3`, in a throwaway
   worktree, resolving per hunk. Expect ~662 conflicted paths.
2. **Port the five fork services absent from stock V2** — `cluster.py`,
   `cluster_remote.py`, `backend_worker.py`, `peer_worker.py`,
   `peer_training.py`. Dormant `worker_url` params and the `worker_id` column
   do **not** replace their behaviour.
3. **Audit all 13 plugin manifests** against the disposition table in
   `docs/V2_MIGRATION_PREP.md`. `video` declares cloud training and a rental
   credential permission; `canvas` needs a local-only continuation review.
   Excluding `cloud_training` and `api_engines` is not sufficient evidence.
4. **Preserve the seven fork schema columns absent from V2's `_SCHEMA_ADDITIONS`**
   — `bank_image.tags`, `.tags_state`, `.tags_text`, `image_bank.keep_separate`,
   `.root_only`, `peer_training_run.log_offset`, `.started_at`. Keep the models
   and additive migration paths, not just columns in an upgraded database.
5. **Preserve the recent model-path fixes** — cross-drive/linked pins, no staging
   copies, Video Studio subfolder weight discovery (`e85bae8d7`, `04472d4fb`).
6. **Rehearse on copied state, then rehearse rollback**, before any cutover.
7. **Rebuild `frontend/dist` from integrated source.** Never carry upstream's
   bundle as proof of the fork's source.

## Decisions
- Content-base integration over ordinary merge — ordinary drops 995 paths and 12 of 13 plugins.
- Recorded the finding in-repo over reporting it in chat — the next agent must not rediscover it by doing it.
- Banner at the top of `UPSTREAM_SYNC.md` over rewriting 12 historical `upstream/main` call sites — churn risks misfiring; every reader starts at the top.
- Script reports, never merges/commits/pushes — resolution is a judgement call the page reserves for a human.
- No AI-attribution trailer despite the tooling asking for one — the repo rules forbid it in this public repo, and the tooling defers to repo instructions.
- Deleted `feat/v2-integration` and `noble/lds-v2-prep` — both contained zero commits not in `main` (containment test, not name or age).

## Traps
- **`create_app()` runs schema migrations, cleanup and backfills at startup in V2.** A branch switch does not reverse them. Never point even an import sanity check at the production data folder; `-Phase Gates` sets `LDS_DATA_DIR` to scratch for this reason.
- **`scripts/migrate_to_v2.py` refuses forks by design** (checks `origin` is the official repo, line ~229). Do not repoint the remote to bypass it.
- **Existing `full_backup.py` exports are not a rollback image** — they deliberately omit the raw database, runtime envs and app state. Media are not covered by the prep snapshot either.
- **A parallel backend worker dies about once in five full runs**, a different test each time. Replay a named failure alone before believing it.
- **Backend CI runs on `windows-latest`** — a Windows backend failure is not "environment". On Linux the suite shows ~67 path-separator artifacts that CI does not have; diff against a baseline, never triage the floor.
- **Never push to `upstream`** (push URL is `DISABLED_NO_PUSH` — keep it) and never take upstream's `frontend/dist`.

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
