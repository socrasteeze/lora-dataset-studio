# HANDOFF

**Updated:** 2026-08-28 · **Branch:** main · **Base:** 4d0097b · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `1a2f4aa` — 0 behind. All gates green.

## Done this session
- Merged upstream `1a2f4aa` — 5 commits, 6 conflict regions / 3 files, 0 rejected
- Adopted: the 🚩 watermark scan's 🔤-style launch window (sample dial, threshold
  edited where judged, a new `/watermark/preview` twin) on both surfaces; the
  ✨ improve **chain** on gallery, dataset lightbox and ◉ Canvas board
- Every conflict was one collision: upstream's new `limit` landed in exactly the
  three watermark-scan signatures carrying D6's `device_id`. All keep-BOTH
- Wrote `2026-08-28-improve-passes-chain` in `whatsNew.js` — upstream shipped no
  entry for it, so the feature and its release notes were silent
- `FORK_NOTES.md`: a changelog row and D5's twelfth carrier

## Open
1. Fork-only controls still carry emoji while upstream's use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`). `🔖 Tags` alone
   touches `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`,
   `pipelineSteps.js` + their tests — a wave of its own (D3).
2. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions. Restore to `error` when that orphan wave lands.
3. Three remote branches carry unmerged commits, left in place:
   `beautiful-ride-rllujy` (4, extracts a presets hook), `serene-ptolemy-vxtcxg`
   (107) and `gracious-planck-nykeey` (111), both stalled mid-sync.

## Decisions
- `limit`/`device_id` conflicts keep-BOTH, never either/or: taking upstream's
  side drops peer rendering off the watermark scan silently
- Kept the fork's `items` over upstream's renamed `rows` in `_watermark_job`:
  upstream renamed inside its hunk only, and the ~160 lines below it are this
  fork's — their side builds, lints, and raises `NameError` on the first scan
- `TestWatermarkScanSample` now derives its expected pair from the ids actually
  assigned: ids come from the ingest walk and `os.walk` is filesystem-ordered,
  so upstream's literal is red on ext4 for a correct pass — and fails
  identically on pristine `upstream/main` (D5, 12th carrier)
- `CHANGELOG.md`/`README.md` untouched — the changelog froze itself 2026-07-31
  (notes generate from `whatsNew.js`); no setting changed, no new capability

## Traps
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- On Linux the backend suite has an environment failure floor of **71**, plus a
  **rotating** 72nd from an xdist worker death — a different test each run, all
  passing serially. Replay a named red alone; always diff a pre-merge baseline.
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
