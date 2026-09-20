# HANDOFF

**Updated:** 2026-09-20 · **Branch:** `main` · **Base:** `aff61ebb9` · **Tree:** clean

## State
**V2 is integrated on `origin/feat/v2-integration` (`891d61e33`), not on `main`.**
The merge is done and gated; what remains is the recompute pass (78 frontend
tests). `main` is untouched and releasable — merge the branch only once those
are green.

## Done this session
- V2 content-base merge, 226/226 conflicts resolved — `891d61e33`
- `bundled/api_engines` + `bundled/cloud_training` deleted; ids dropped from `OFFICIAL_IDS`
- 21 fork tests reverted from silent upstream overwrites (no conflict markers)

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
Work on `feat/v2-integration`; do not merge to `main` until 1-3 are green.
1. **Plugin-count fixtures (~15 tests)** — "`<plugin>` alone exposes each
   declared preparation action". The fork ships **11** plugins, not 13.
   `frontend/tests/support/publicPluginFixtures.mjs` is the list.
2. **Help-registry + capability counts (~40 tests)** — recompute from fork
   source, never copy upstream's numbers. `docs/UPSTREAM_SYNC.md` §5 has the
   commands.
3. **Route/wording assertions (~20 tests)** — upstream expects
   `/plugins/<id>/settings`; check what each bundled plugin's `index.js`
   actually declares (the fp8 door publishes `/settings/storage`).
4. **Run the full backend suite** on the branch — never yet run whole here:
   `python -m pytest backend/tests -q -n 8 --dist loadfile --basetemp=D:/t`
5. **Rebuild `frontend/dist`** from merged source, as its own `build(frontend):`
   commit. Never carry upstream's bundle.
6. **Then** merge to `main`, and delete `feat/v2-integration` once contained.
7. Rehearse on copied state + rollback before any cutover (unchanged).

## Decisions
- Content-base integration over ordinary merge — ordinary drops 995 paths and 12 of 13 plugins.
- Recorded the finding in-repo over reporting it in chat — the next agent must not rediscover it by doing it.
- Banner at the top of `UPSTREAM_SYNC.md` over rewriting 12 historical `upstream/main` call sites — churn risks misfiring; every reader starts at the top.
- Script reports, never merges/commits/pushes — resolution is a judgement call the page reserves for a human.
- No AI-attribution trailer despite the tooling asking for one — the repo rules forbid it in this public repo, and the tooling defers to repo instructions.
- Rejected lanes removed by DELETING `bundled/api_engines` and `bundled/cloud_training` (+ their `OFFICIAL_IDS` entries), not by shipping them disabled — `frontend/tests/local-only-engines-contract.test.mjs` was written on 2026-09-16 anticipating this merge and says exactly that. `civitai_publish` is NOT on its forbidden list and keeps its hold, so 11 plugins ship.
- Branch pushed, `main` held — `main` stays releasable until the recompute pass is green.

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
