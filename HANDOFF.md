# HANDOFF

**Updated:** 2026-08-26 · **Branch:** main · **Base:** 995f96a · **Tree:** clean

## State
Fork is level with `perfectgf/lora-dataset-studio` at `07ad2fd` — 0 behind. This
session merged a 4-commit window (Test Studio family plumbing). It started with
`main` 115 commits behind its own feature branch, because two earlier syncs were
pushed to the branch and never merged down; a concurrent session delivered that
backlog to `origin/main` mid-run, so this push is a clean 7-commit fast-forward
on top of it. All gates green; nothing is in flight.

## Done this session
- Merged upstream `07ad2fd` — 1 source conflict (`whatsNew.js` prepend-vs-prepend)
- Adopted GitHub #52/#53 whole (lunchingfriar): Klein/FLUX.1/Anima LoRAs are found
  where deployed, and FLUX.2 Klein gains a real generation lane
- Corrected two now-false Studio-family claims — `README.md`,
  `docs/guide/known-limitations.md`
- Recorded the wave — `FORK_NOTES.md`
- Rebuilt `frontend/dist` from this fork's `src` in its own `build(frontend):` commit

## Open
1. Fork-only controls still carry emoji while upstream's now use icons
   (`🔖 Tags`, `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`, and
   the `COVERAGE_PASSES` marks). De-emojifying `🔖 Tags` alone touches
   `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`, `pipelineSteps.js` and
   the tests asserting the literal — a wave of its own. See `FORK_NOTES.md`, D3.

## Decisions
- Kept upstream's two What's-new entries on top and re-closed the fork's own top
  entry by hand — the shared trailing brace sits outside both conflict markers as
  context, so keep-both alone leaves the fork entry unclosed (diagnostic 24)
- Fixed README/known-limitations over leaving them to upstream — both said Studio
  covers only Z-Image/SDXL/Krea 2, which the merged lane made false, and no gate
  reads prose
- Delivered by fast-forward over a squash — the window is two upstream merges plus
  a dist rebuild, and squashing would erase their merge ancestry

## Traps
- `main` can silently fall behind a pushed feature branch. Check
  `git rev-list --left-right --count main...<branch>` before reading "N behind
  upstream" off `main` — this session's window looked like 102 commits and was 4.
- `frontend/dist` is what Flask serves. Never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- On Linux the backend suite has a large path-separator failure floor (71 here,
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
