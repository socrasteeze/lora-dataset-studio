# HANDOFF

**Updated:** 2026-08-25 · **Branch:** main · **Base:** 081e519 · **Tree:** clean

## State
Second upstream sync of the day landed: the fork is level with
`perfectgf/lora-dataset-studio` at `87365f5` (3 commits — the icon sweep finished
on the Bank/Canvas surface, plus eleven retaken documentation screenshots). All
gates green; nothing is in flight.

## Done this session
- Merged upstream `87365f5` — 7 source conflicts, all one shape, resolved per hunk
- Ported the label sweep into the fork's extracted copy — `frontend/src/components/bank/pipelineSteps.js`
- Refreshed a stale hand-copied label mirror — `frontend/src/components/bank/bankRejectReasons.test.js`
- Re-pointed the tag-glyph guard after upstream freed `🏷️` — `frontend/src/components/bank/tags-ui.test.js`
- Fixed a caption promising a badge the retaken screenshot no longer shows — `README.md`
- Deleted three screenshots of the removed cloud engine cards — `docs/screenshots/generate/`
- Added the wave's entry — `frontend/src/whatsNew.js`
- Recorded the wave and the screenshot class — `FORK_NOTES.md`
- Rebuilt `frontend/dist` from this fork's `src` in its own `build(frontend):` commit

## Open
1. Fork-only controls still carry emoji while upstream's now use icons
   (`🔖 Tags`, `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`, and
   the `COVERAGE_PASSES` marks). De-emojifying `🔖 Tags` alone touches
   `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`, `pipelineSteps.js` and
   the tests asserting the literal — a wave of its own. See `FORK_NOTES.md`, D3.

## Decisions
- Kept `🔖 Tags` over sweeping it with upstream's labels — it is fork-authored, has
  no icon assigned, and stripping it in one file alone would leave the button and
  the progress readout naming the same pass differently
- Deleted `docs/screenshots/generate/` over keeping the fork's older copies — all
  three picture Nano Banana Pro / ChatGPT / OpenRouter cards, nothing references
  them, and the README states twice that those engines do not exist here
- Rewrote the tag-glyph test's premise over deleting it — the collision it guarded
  (`🏷️` owned by Caption) is gone, but "🔖 belongs to the tag pass alone" still holds

## Traps
- `frontend/dist` is what Flask serves. Never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- A screenshot is a binary: no sweep, grep or test reads one. When a sync touches
  `docs/screenshots/**`, open the picture — that is how the three above surfaced.
- On Linux the backend suite has a large path-separator failure floor (71–72 here,
  and it moves by one between runs). CI's backend job is `windows-latest` and is
  green. Diff against a pre-merge baseline; never triage the floor.
- `download.pytorch.org` is blocked in the container lane, so the Torch overlay
  installs from PyPI as a CUDA build. Same version, no GPU, gate numbers hold.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -n 8 --dist loadfile
```
