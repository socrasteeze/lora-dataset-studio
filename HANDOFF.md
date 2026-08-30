# HANDOFF

**Updated:** 2026-08-30 · **Branch:** main · **Base:** d0eae27 · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `bbd5ad3` — 0 behind, all gates green
on the tree pushed. The window was ONE commit: upstream's `v2026.08.30` bump, one
line of `backend/app/version.py` — no feature, no bundle.

## Done this session
- Merged upstream `bbd5ad3` — one conflict region, three markers, 0 rejected
  features. `APP_VERSION` recomputed to `2026.08.30F` (marker last) — `backend/app/version.py`
- Changelog row for the wave — `FORK_NOTES.md`
- Removed three capability rows duplicated verbatim by an earlier merge
  (🌐 Civitai top prompts, 📷 Camera angles, 🔤 Find text) — `README.md` ~L890

## Open
1. Fork-only controls still carry emoji while upstream's use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`). `🔖 Tags` alone
   touches `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`,
   `pipelineSteps.js` + their tests — a wave of its own (D3).
2. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions, unchanged by this wave. Restore to `error` when that orphan
   wave lands — `frontend/eslint.config.mjs` L64.
3. The responsive probe has still NOT been run — `.claude/rules/frontend-contracts.md`
   says a layout change stays unverified until it has. Needs a live instance
   holding a bank and a dataset, which this container has not got.

## Decisions
- Adopted upstream's bump by **recomputing** the fork marker (`2026.08.30F`)
  rather than copying their literal — `test_the_fork_marker_is_last_so_it_cannot_disturb_ordering`
  is the guard, and copying is what it caught on 2026-08-10.
- No `build(frontend):` commit: `npm run build` was run as a gate and the bundle
  came back byte-identical, so none is owed. No What's-new entry either — nothing
  user-visible was adopted.

## Traps
- **Fresh containers arrive mis-identified.** This clone inherited a vendor git
  identity and `commit.gpgsign=true` with a foreign key. Reset both to the
  `CLAUDE.md` identity BEFORE the first commit — six wrong-authored commits got
  into this history that way once.
- **Local `main` can be unrelated history.** `origin/main` had been force-updated;
  `git merge-base main HEAD` returned EMPTY and every ahead/behind count read as
  nonsense until the ref was realigned to `origin/main`. Check before believing a count.
- `download.pytorch.org` is 403 under this environment's egress policy. The
  mandatory Torch overlay must come from PyPI as `2.13.0` (resolves to `+cu130`);
  without it ~124 tests silently skip.
- Backend on Linux carries a **71-failure platform floor** (path separators;
  `mimetypes` answering `text/javascript`). CI's backend job is `windows-latest`,
  so diff against a pre-merge baseline — never read the raw count as a verdict.
- A parallel run flakes. `test_peer_training_over_http.py` went red in the
  baseline and replayed 20/20 green. Replay a named red before believing it.

## Verify
```powershell
.venv\Scripts\python.exe -m pytest backend/tests -q -n 8 --dist loadfile
cd frontend; node --test
.venv\Scripts\python.exe -m ruff check .
cd frontend; npm run lint
```
