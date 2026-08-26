# HANDOFF

**Updated:** 2026-08-26 · **Branch:** claude/magical-tesla-39qhpa · **Base:** 578c7bf · **Tree:** clean

## State
Fork is level with `perfectgf/lora-dataset-studio` at `aeebd45` — 0 behind. This
session merged a 10-commit window (📷 Camera angles reaching dataset images and
Setup). All gates green, nothing in flight; the delivery is a fast-forward over
`origin/main` at `578c7bf` (a concurrent session pushed the earlier branch
backlog to `main` mid-run — that base is this merge's own first parent).

## Done this session
- Merged upstream `aeebd45` — 3 source conflicts, 84 dist, 0 rejected features:
  camera angles on dataset images, its Setup install/repair/count card, ⬇ Files,
  the picker's 12-view cap deleted, a picker tap fix
- Resolved `models.py` per hunk: took `camera_pose`, refused `fail_kind` (D1)
- Recomputed both counted lists — capabilities 17→18, `installCatalog` 18→23 —
  and fixed a THIRD stale copy in `frontend/src/utils/kreaInstall.test.js`
- D10 ports into the one registry: 2 new topics + 1 reworded topic; 294→296
- Corrected three now-false camera claims — `README.md`,
  `docs/guide/settings-reference.md`; recorded the wave in `FORK_NOTES.md`

## Open
1. Fork-only controls still carry emoji while upstream's now use icons
   (`🔖 Tags`, `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`, and
   the `COVERAGE_PASSES` marks). De-emojifying `🔖 Tags` alone touches
   `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`, `pipelineSteps.js` and
   the tests asserting the literal — a wave of its own. See `FORK_NOTES.md`, D3.
2. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions. Restore to `error` when that orphan wave lands.

## Decisions
- Recomputed every counted list from `deriveCapabilitySummary` / the `deepEqual`
  list rather than taking upstream's literal — upstream's numbers moved for
  different arithmetic than the fork's, so "unchanged" would have been wrong
- Kept `kreaInstall.test.js`'s exact pin over relaxing it to upstream's `>= 12`
  floor — an exact count is what catches a dropped row; added a comment naming
  its sibling instead, since that line can never conflict
- Fixed README/settings-reference over leaving them — the 12-view cap and the
  "Setup ▸ ComfyUI installs it" path are both false now, and no gate reads prose

## Traps
- **A count that does not change across a sync is not evidence it was right.**
  Three files hold the capability number; upstream pins a FLOOR in one of them,
  so it never conflicts and goes stale silently. Only the full suite catches it.
- `frontend/dist` is what Flask serves. Never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- `docs/guide/**.md` compiles into the bundle: a doc edit needs a dist rebuild.
- On Linux the backend suite has a large path-separator failure floor (71 here);
  CI's backend job is `windows-latest` and green. Diff a pre-merge baseline.
- `download.pytorch.org` is blocked in the container lane, so the Torch overlay
  installs from PyPI as a CUDA build. Same version, no GPU, gate numbers hold.
  Installing it is not optional — without it ~124 tests silently skip.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -n 8 --dist loadfile
```
