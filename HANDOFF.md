# HANDOFF

**Updated:** 2026-08-28 · **Branch:** main · **Base:** a5b8f2b · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `e678d71` — 0 behind, 149 ahead.
All gates green, nothing in flight; the wave lands as a fast-forward.

## Done this session
- Merged upstream `e678d71` — 6 commits, 12 conflict regions across 11 files,
  74 dist orphans, 0 rejected features
- `backend/infer/*.py` ×9: upstream's `._pth` bootstrap adopted in front, the
  fork's D5 import list kept behind it — never `_harness._emit`, whose plain
  `print` would bypass the claimed result stream
- `text_fill_infer.py` now claims the stream and defines its own `_emit`; it
  had been importing `_harness._emit` since it shipped, hidden by its absence
  from `FACTORED` — the gap upstream's new coverage test exposed
- `test_text_fill.py`: `infer_io` subtracted from the probe-parity set (D5,
  same call `test_video_safe_zone.py` already makes)
- `version.py` recomputed to `2026.08.27.1F`, fork marker last
- `whatsNew.js` entry for the review plan line (upstream shipped none);
  8 curation keywords in `helpRegistry.js` for the new Add-more block
- `FORK_NOTES.md`: changelog row + D5 seventh-entry addendum

## Open
1. Fork-only controls still carry emoji while upstream's use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`). `🔖 Tags` alone
   touches `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`,
   `pipelineSteps.js` + the tests pinning the literal — a wave of its own (D3).
2. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions. Restore to `error` when that orphan wave lands.

## Decisions
- Nine identical infer conflicts resolved keep-BOTH, not take-theirs: each of
  those files defines its own `_emit` below, so upstream's import would have
  been silently shadowed and the divergence lost without anything failing
- `text_fill_infer.py` fixed rather than exempted from the D5 rule — a curated
  list is only as good as the test that says it is complete
- The fork's `sys.path.insert` left in place in all 18 sites; removing the two
  that sat inside a conflict would have made the tree inconsistent for nothing
- `CHANGELOG.md` not updated (it says so itself since 2026-07-31); README
  untouched — nothing this window invalidates a line of it

## Traps
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- On Linux the backend suite has a path-separator failure floor (71 here);
  CI's backend job is `windows-latest` and green. Diff a pre-merge baseline.
- `download.pytorch.org` is blocked in the container lane: install the mandatory
  Torch overlay from PyPI (`torch==2.13.0`, CUDA build, same pinned version).
  Without it ~124 tests silently skip.
- Give pytest a unique `--basetemp` per run: a second run sharing one deletes the
  first's temp files, and both failures read as flakes.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -n 8 --dist loadfile
```
