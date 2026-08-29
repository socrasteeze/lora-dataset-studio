# HANDOFF

**Updated:** 2026-08-29 · **Branch:** claude/magical-tesla-73gb9f → main · **Base:** 1557ad1b · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `064482a7` — 0 behind. All gates green.

## Done this session
- Merged upstream `064482a7` — 7 commits, **zero source conflicts**, 0 rejected
  features. Every source file the window touched was byte-identical to the
  merge-base, so all four source commits auto-merged; the whole conflict set
  (82 paths, 18 markers) was `frontend/dist` churn over content-hashed names
- Adopted: the **unified generated-image viewer** (the lightbox owns ✦ Repair and
  📷 Camera itself, so a picture has the same verbs on the Gallery, the ◉ Canvas
  and a checkpoint gallery); the camera **distilled-build fix** (a Rapid/Turbo/AIO
  base skips the speed LoRA and keeps 4 steps — chaining it renders confetti-like
  patches while every job reports success); the **Trigger word edge fixes**
- Fork-authored: 15 keywords on `action-camera-model` for the distilled skip —
  the symptom is a rendering artifact, so users will search the artifact
- D1/D4/D10 all cost nothing: no cloud lane in the window, `helpRegistry.js` not
  in it. Topics stay **300**, tips **14**

## Open
1. **Delete 12 stale merged branches — attempted this session, blocked.** All of
   `git branch -r --merged main` (12, now including this session's own
   `claude/magical-tesla-73gb9f`) were tried one by one; every one returned
   `HTTP 403` on `send-pack`. Confirmed **GitHub's** refusal, not the egress
   proxy — the proxy's status endpoint logs no `github.com` denial — and the
   GitHub MCP server exposes `create_branch`/`list_branches` with **no delete
   counterpart**, so there is no route from a container like this one. Owed to a
   session whose credential can delete refs. The list re-derives with
   `git branch -r --merged main | grep -v 'origin/main$'`; do not work from a
   copied list, it moves every wave.
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
- **No What's-new entry for the two bugfixes**, deliberately:
  `.claude/rules/frontend-contracts.md` exempts bugfixes of unreleased work, and
  both `2026-08-28-camera-model-choice` and `2026-08-28-studio-trigger-toggle`
  post-date the last tag `v2026.08.27.1`. Upstream made the same call.
- `whatsNew.js` did **not** conflict this time — upstream prepended at the head
  while this fork's entries sit at lines 134/187. Do not read that as diagnostic
  24 retiring; the next window whose fork entry is newest will collide again.
- README earns no line: the wave is parity + bugfixes, no new capability, and
  nothing in it went stale.
- The new screenshot was **opened and looked at** (`gallery/lightbox-unified-verbs.png`)
  — local surfaces only, no key field, no cloud engine.

## Traps
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- A fresh container clones **shallow**: `git merge-base` fails and the
  ahead/behind counts are fiction. This session first read the working branch as
  153 commits ahead of `origin/main` when it was **level with it**. Run
  `git fetch --unshallow origin` before believing any count.
- On Linux the backend suite has an environment failure floor of **71**, plus a
  **rotating** 72nd from an xdist worker death, passing serially. Replay a named
  red alone; always diff a pre-merge baseline.
- `download.pytorch.org` is blocked in the container lane: install the Torch
  overlay from PyPI (`torch==2.13.0`, resolves to `+cu130`), or ~124 tests
  silently skip.
- A fresh container has no `.venv`/`node_modules` and **inherits a vendor git
  identity** — this one arrived pre-set to an AI vendor's name and noreply
  address, and a commit made before noticing publishes it. Set the project
  identity per the repo rules before committing, and confirm with
  `git config --list | grep '^user\.'`. (Do not paste the vendor address into a
  tracked file to illustrate this — `test_no_personal_data.py` catches emails
  everywhere, and it caught exactly that here.)
- Three rebuilt bundle files still match a cloud-phrase grep
  (`DiagnosticReport`, `ModelFilePicker`, `whatsNewArchive`). All three are the
  documented kept-as-is legacy: text saying the engines were REMOVED,
  `LEGACY_API_ENGINE_TAGS` presets, and the historical archive. Verified
  pre-existing at `221c03fd`, untouched by this window.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -n 8 --dist loadfile
```
