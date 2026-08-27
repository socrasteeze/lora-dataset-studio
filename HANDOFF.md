# HANDOFF

**Updated:** 2026-08-27 · **Branch:** claude/magical-tesla-zz2qjk · **Base:** 567ead2 · **Tree:** clean

## State
Fork is level with `perfectgf/lora-dataset-studio` at `f7279f8` — 0 behind. All
gates green, nothing in flight; the delivery is a fast-forward of 15 commits over
`origin/main` at `567ead2` (a concurrent session pushed the earlier backlog there
mid-run — that base is this merge's own first parent).

## Done this session
- Merged upstream `f7279f8` — 3 source conflicts, 92 dist, 0 rejected features:
  🔤 Find text (bank + dataset OCR feeding the watermark clean funnel) with its
  sample/Sensitivity dials and unreadable-file fix, the 0.03→0.04 region merge
  window, a per-scene ✏️ prompt, the 🌐 Civitai top-prompt browser
- `image_bank_service.py` per hunk: kept the fork's staged `pending` writes, took
  upstream's 🔤 guard, reading `text_state`/`_clean_regions` off the live row
- `video_text_infer.py` keep-BOTH (`_emit` + `_read_bgr`); `test_video_safe_zone.py`
  kept the `infer_io` subtraction with upstream's widened probe set
- Re-stated `tags-ui.test.js`'s `onLaunch` guard as its invariant — it went red on
  Find text's third dispatch branch, not on what it guards
- D10 ports: 2 topics + 1 reworded (296→298); `civitaiBrowser.contract.test.js` re-pointed at the one registry
- Docs: `text_scan.score_min`, `CIVITAI_API_KEY` in `.env.example`, 3 README rows, `FORK_NOTES.md`

## Open
1. Fork-only controls still carry emoji while upstream's now use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`, `COVERAGE_PASSES`).
   `🔖 Tags` alone touches `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`,
   `pipelineSteps.js` + the tests pinning the literal — a wave of its own (D3).
2. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions. Restore to `error` when that orphan wave lands.

## Decisions
- Civitai browser ADOPTED: D1 forbids cloud generation *engines*, and this
  browses a source on the Civitai credential the scraper already stores
- Read `row.text_state` off the live ORM row rather than re-plumbing the guard
  through `pending` — the staged-write rule governs what the loop writes
- Re-stated the `onLaunch` assertion rather than extending its regex: a chain
  that grows a branch per dialog-carrying pass breaks on the next one too
- `CHANGELOG.md` deliberately NOT updated — it says so itself since 2026-07-31

## Traps
- **A guard can fail on an ADDITION, not on its own property** — read what the
  test is FOR before widening its regex (diagnostic 31, third occurrence).
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns. And
  `docs/guide/**.md` compiles into it, so a doc edit owes a rebuild too.
- On Linux the backend suite has a path-separator failure floor (72 here);
  CI's backend job is `windows-latest` and green. Diff a pre-merge baseline.
- `download.pytorch.org` is blocked in the container lane: install the mandatory
  Torch overlay from PyPI (`torch==2.13.0`, CUDA build, same pinned version).
  Without it ~124 tests silently skip.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -n 8 --dist loadfile
```
