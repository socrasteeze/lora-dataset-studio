# HANDOFF

**Updated:** 2026-08-27 · **Branch:** main · **Base:** 333014d · **Tree:** clean

## State
Fork is level with `perfectgf/lora-dataset-studio` at `2174063` — 0 behind. All
gates green, nothing in flight; the wave landed as a fast-forward of 2 commits
onto `origin/main` at `333014d`.

## Done this session
- Merged upstream `2174063` — 9 commits, 3 source conflicts, 74 dist orphans,
  0 rejected features: the outline-safe bubble filler (`services/text_fill.py`,
  `infer/text_fill_infer.py`) and the dataset 🔤 Find text launch window at full
  parity (`TextScanDialog.jsx`, `detect_text(limit=N)`)
- `image_bank_service.py` keep-BOTH: upstream's `text_ok` beside this fork's
  remote-aware `klein_ok` — taking either side alone loses the other
- `version.py` recomputed to `2026.08.27F`, fork marker last
- `README.md`: kept this fork's restructured tables, hand-ported upstream's four
  increments derived from `merge-base..upstream/main`; D4-stripped the roadmap's
  full-model-on-Krea-2 claim and its rented-pod training route
- `FORK_NOTES.md` changelog row for the window

## Open
1. Fork-only controls still carry emoji while upstream's now use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`, `COVERAGE_PASSES`).
   `🔖 Tags` alone touches `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`,
   `pipelineSteps.js` + the tests pinning the literal — a wave of its own (D3).
2. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions. Restore to `error` when that orphan wave lands.

## Decisions
- README resolved by DERIVING upstream's increment rather than reading the
  conflict: the fork's tables diverged structurally, so the region is two
  documents, and only the increment distinguishes a new edit from old divergence
- Roadmap prose is D4 surface: a bullet promising rented-pod training is the
  rejected feature arriving as documentation, with no code to grep for
- `docs/screenshots/setup/camera-install-card.png` opened and read before
  adoption — a Setup screenshot is where the cloud key fields would ride back in,
  and no grep or test can see inside a PNG
- `CHANGELOG.md` deliberately NOT updated — it says so itself since 2026-07-31

## Traps
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns. And
  `docs/guide/**.md` compiles into it, so a doc edit owes a rebuild too.
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
