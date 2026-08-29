# HANDOFF

**Updated:** 2026-08-29 · **Branch:** main · **Base:** 849d3bc · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `221c03f` — 0 behind. All gates green.

## Done this session
- Merged upstream `221c03f` — 13 commits, 2 conflict regions + 2 `modify/delete`,
  0 rejected features. The window carried no cloud lane at all, so D1/D4 cost nothing
- Adopted: the Studio **Trigger word** checkbox (send a prompt verbatim); a ⚙️ beside
  ✨ Enhance picking which pulled Ollama model runs it; the 📷 picker's **Model row**
  pinning `camera.unet`; the `GlobalModelPicker` silent-no-op save fix
- D10 cost twice: upstream's two new topics live in `help/topics/{actions,pages}.js`,
  which this fork does not carry → re-deleted, three edits hand-ported into
  `helpRegistry.js`. 298 → **300 topics**, 14 tips, verified by id-list diff

## Open
1. Delete the 11 stale branches from `git branch -r --merged main` — this
   container's credential returns HTTP 403 on `git push origin --delete`.
2. Fork-only controls still carry emoji while upstream's use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`). `🔖 Tags` alone
   touches `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`,
   `pipelineSteps.js` + their tests — a wave of its own (D3).
3. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions. Restore to `error` when that orphan wave lands.
4. Three remote branches keep unmerged commits, left in place:
   `beautiful-ride-rllujy` (2), `gracious-planck-nykeey` (2),
   `magical-tesla-1c639u` (3, a duplicate sync of an older window).

## Decisions
- `whatsNew.js` was diagnostic 24 exactly: the closing `},` sat OUTSIDE both
  sides as context, so the fork's own entry was re-opened explicitly — a naive
  keep-both leaves it unterminated and only the build catches it
- `settings-reference.md` took upstream's camera-cap line: they have now landed
  the 12-view removal this fork shipped ahead of them (D7 shape — prefer theirs)
- Screenshots were opened and looked at, not counted: all four are local surfaces
- `CHANGELOG.md`/`README.md` untouched — the changelog froze itself 2026-07-31
  (notes generate from `whatsNew.js`); no README claim went stale this wave

## Traps
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- A fresh container clones **shallow**: `git merge-base` fails and the
  ahead/behind counts are fiction (this one first read 7/95; the truth was
  440/13). Run `git fetch --unshallow origin` before believing any count.
- On Linux the backend suite has an environment failure floor of **71**, plus a
  **rotating** 72nd from an xdist worker death, passing serially. Replay a named
  red alone; always diff a pre-merge baseline.
- `download.pytorch.org` is blocked in the container lane: install the Torch
  overlay from PyPI, or ~124 tests silently skip.
- A fresh container has no `.venv`/`node_modules` and inherits a vendor git
  identity — set the project identity per the repo rules before committing.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -n 8 --dist loadfile
```
