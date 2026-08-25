# HANDOFF

**Updated:** 2026-08-25 · **Branch:** main · **Base:** 98b4dc9 · **Tree:** clean

## State
Upstream sync landed: the fork is level with `perfectgf/lora-dataset-studio` at
`dcb3011` (22 commits, the Safelight theme + icon-set wave). All gates green;
nothing is in flight.

## Done this session
- Merged upstream `dcb3011` — 24 source conflicts resolved per hunk — merge commit
- Rejected upstream's provider-refusal panel (D1) — `frontend/src/components/dataset/DatasetWorkspace.jsx`
- Rejected upstream's full-model delivery blocks (D4) — `frontend/src/pages/CloudRunsPage.jsx`
- Re-deleted `CloudLaunchDialog.jsx` and the seven `frontend/src/help/topics/` modules
- Hand-ported upstream's Scrape-tip edit into the one registry (D10) — `frontend/src/help/helpRegistry.js`
- Kept the no-idle-ellipsis copy rule under the new icons — `frontend/src/components/bank/`
- Rebuilt `frontend/dist` from this fork's `src` in its own `build(frontend):` commit
- Recorded the wave, merge diagnostic 31, and the D3/D10 notes — `FORK_NOTES.md`
- Documented the Gallery page in the fork's own structure — `README.md`

## Open
1. Fork-only controls still carry emoji while upstream's now use icons
   (`🔖 Tags`, `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`).
   De-emojifying `🔖 Tags` alone touches `wd14Gate.js`, `bankPassCoverage.js`,
   `bankFacets.js`, `pipelineSteps.js` and four tests asserting the literal —
   a wave of its own. Reasoning: `FORK_NOTES.md`, Divergence 3.

## Decisions
- Kept the fork's copy rule (no trailing `…` on a control that opens a window) over
  upstream's re-added ellipses — the rule is fork-authored, reasoned and tested, and
  the guards failed on the *glyph* while the ellipsis half passed unnoticed
- Took upstream's emoji→icon sweep whole over any re-strip — Divergence 3 is retired,
  and this is upstream moving its own pictographs, not a strip
- Aligned `pipelineSteps.js` labels with upstream's `STEP_DEFS` over leaving them —
  the Launch-all dialog and the report must not speak two languages
- No `CHANGELOG.md` entry — the file states it is frozen; release notes are generated
  from `frontend/src/whatsNew.js`, which carries this wave's five entries

## Traps
- `frontend/dist` is what Flask serves. Never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- On Linux the backend suite has a large path-separator failure floor (71 here).
  CI's backend job is `windows-latest` and is green. Diff against a pre-merge
  baseline; never triage the floor.
- Two rejections each orphaned exactly one icon import. Only `npm run lint` sees that.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -n 8 --dist loadfile
```
