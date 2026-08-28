# HANDOFF

**Updated:** 2026-08-28 · **Branch:** main · **Base:** 01e8ec5 · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `68f1d63` — 0 behind. All gates
green on this tree; the wave lands as a fast-forward.

## Done this session
- Merged upstream `68f1d63` — 7 commits, 7 conflict regions / 5 files, 0 rejected
- Adopted: 📊 machine-load readout on every page with GPU temperature; the 🧽
  repaint "What to clean" target split (by page, both surfaces); 🔤 Find text
  rendering flagged pages live inside its own launch window
- All 5 conflicts were one collision: upstream's new `target` parameter landed
  in exactly the signatures carrying D6's `device_id`. Every one keep-BOTH;
  `bankWatermarkScope.test.js` asserts that launch body as a literal string,
  so it was rewritten to the merged line
- D10: upstream's help edit lives in their `help/topics/videoLane.js`; re-deleted
  and hand-ported into `helpRegistry.js`. 298 topics / 14 tips / identical ids
- `README.md` watermark table gained a "What to clean" row; `FORK_NOTES.md` a
  changelog row + the rotating-flake correction

## Open
1. Fork-only controls still carry emoji while upstream's use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`). `🔖 Tags` alone
   touches `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js` and
   `pipelineSteps.js` + the tests pinning it — a wave of its own (D3).
2. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions. Restore to `error` when that orphan wave lands.
3. Three remote branches carry unmerged commits (4, 107, 111) — `git branch -r
   --no-merged main`. Two stalled mid-sync; the small one extracts a presets hook.

## Decisions
- `target`/`device_id` conflicts keep-BOTH, never either/or: taking upstream's
  side anywhere in that chain drops peer rendering off the repaint lane
  silently — the pass would just run locally
- `helpRegistry.js` kept whole over upstream's six-module split (D10): the
  split adds no topic, so adopting it can only preserve or lose
- `CHANGELOG.md` not updated — its own header froze it on 2026-07-31; release
  notes generate from `whatsNew.js`, where both sides' entries were kept

## Traps
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- On Linux the backend suite has an environment failure floor of **71**, plus a
  **rotating** 72nd from an xdist worker death — a different test each run, all
  passing serially. Replay a named red alone before believing it; CI's backend
  job is `windows-latest`. Always diff a pre-merge baseline.
- `download.pytorch.org` is blocked in the container lane: install the Torch
  overlay from PyPI. Without it ~124 tests silently skip.
- Give pytest a unique `--basetemp` per run; a shared one reads as flakes.
- A fresh container has no `.venv` and no `node_modules`, and inherits a vendor
  git identity — set the project identity per the repo rules before committing.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -n 8 --dist loadfile
```
