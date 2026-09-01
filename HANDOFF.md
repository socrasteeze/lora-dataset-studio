# HANDOFF

**Updated:** 2026-09-01 · **Branch:** main · **Base:** 4749a83 · **Tree:** clean

## State
Synced with `perfectgf/lora-dataset-studio` at `d468980` — **0 behind, 62 ahead**
of `upstream/main`, which is a strict ancestor of `HEAD`. **12 behind
`upstream/nightly`**, intentionally (D11). Nothing is in flight.

## Done this session
A scheduled sync that found **nothing to merge** — and that is the whole result,
not a preamble to one. `upstream/main` was already fully contained in `HEAD`.

**The finding is diagnostic 32, new in `FORK_NOTES.md`: this container's
`origin/main` was 56 commits stale on arrival.** `git branch -a` showed
`origin/main` at `9538414` with the working branch 56 ahead, while the previous
`HANDOFF.md` said that work was already *"merged, gated and pushed to
`origin/main`"*. The wrong reading is the one that looks completely ordinary —
*a branch is ahead of main, so the handoff must have been optimistic* — and
acting on it means re-landing 56 commits that were already on the remote.
`git ls-remote --heads origin` settled it: `refs/heads/main` was `4749a83`, the
branch's own tip. `git fetch origin --prune` moved the ref forward, pruned a
local ref for a working branch that no longer exists on the remote, and the
contradiction disappeared. **Fetch both remotes before reading any count.**

The previous row had named this the "local-ref-stale variant" and recorded that
it had *not* fired. This is it firing.

**`upstream/nightly` previewed, not merged (D11) — 12 commits, and for the first
time since D11 was written, zero of them are rejected-lane.** Five source
commits, four dist, one feature-branch merge:

- `383d9f5` the video-bank pipeline tooltip stops promising measure and
  embeddings when `PIPELINE_STEPS` is (probe, detect, thumbs).
- `f8ab453` person grouping stops re-downloading the ~350 MB InsightFace pack on
  every Docker restart — `face_scoring.models_root` resolves like every other
  engine's. **Reported by nofaceman (Discord); that credit ships with it.**
- `e369b37` its adversarial follow-up: a pack counts as present only when all
  five `.onnx` are there, so a half-extracted carcass stops being preferred over
  a complete pack.
- `65f742d` a video re-cut spares every shot whose bounds did not move.
- `4aa839b` four video-bank simplifications; `8bc062d` fixes the one that
  shipped dead (`slice_long` never reached the encoder).
- `3c01163` a canvas lane gains a move grip and a reserved-height grip, with a
  new `canvas_lane_placement` table.

**Two to watch when that window lands:** `4aa839b`'s clip-length picker reasons
about "the price of a cloud training run" — read it against D4 rather than
adopting straight; and `3c01163` adds a settings-bearing surface, so it owes a
D10 help topic and a `whatsNew.js` entry.

## Verified 2026-09-01 (all green on `4749a83`, unchanged tree)
| Gate | Result |
|---|---|
| `ruff check .` | All checks passed |
| ESLint `npm run lint` | 0 errors / **20 warnings — D9 baseline exactly** |
| `npm run build` | clean, and **byte-identical to the committed `frontend/dist`** |
| local-only contract (frontend) | **8 / 8** |
| `create_app()` | OK |
| `node --test` | **4557 passed, 0 failed** |
| backend full suite | **8502 passed / 71 failed / 154 skipped**, 13m43s, `-n 4` |
| identity / attribution | project identity, no trailers, signing off |

**The 71 needs no baseline diff this time.** No code changed at all, so the pre-
and post-trees are the same tree and every failure is pre-existing by
construction. It is the documented Linux floor (Windows path expectations, the
`mimetypes` table difference); CI runs backend on `windows-latest`.

## Open
1. **No Torch overlay in this container**, so ~124 tests sit inside the 154
   skipped and the totals are not comparable to the previous row's
   **8658 / 71 / 122**. `download.pytorch.org` is 403 at CONNECT here; the PyPI
   fallback (`pip install torch==2.13.0` → `2.13.0+cu130`) works and costs
   ~10 min. Not spent, on a tree with no code change. **Spend it on any wave
   that touches backend code.**
2. **`main` IS RED ON CI and has been for several sessions** — CI run #160 on
   `8576753`, "Backend tests" (`windows-latest`), 1 failed / 8784 passed on
   `test_bank_scan_no_db_lock.py::test_the_duplicate_regrouping_lets_other_`
   `writers_through`, which missed a wall-clock budget at **0.2634 vs 0.25**.
   Not a regression — see the SUPERSEDED block under D5's sixth entry. Still
   deliberately not "fixed": the number is a real concurrency guard, widening it
   is the maintainer's call, and no local run reproduces it (Linux replays the
   file green; CI backend is Windows-only). Decide whether 0.25 moves, then push
   a commit *without* `[skip ci]`.
3. **This session's push carries `[skip ci]` by explicit request**, so CI has not
   run on it. Both suites were run locally on that exact tree (table above).
4. **FIVE stale remote branches still need deleting — ninth confirmation.**
   `claude/magical-tesla-ekn21b` / `juc4nk` / `tydc3z`,
   `claude/pensive-lovelace-l7yash` and `claude/pensive-lovelace-ue0g3o`. All
   five **0 unmerged commits** against `origin/main`. `git push origin --delete`
   returns `HTTP 403` on the ref; the egress proxy reported
   `recentRelayFailures: []` for the attempt, and an ordinary push to `main`
   succeeds in the same session — so the token can write refs but not delete
   them. The GitHub MCP server exposes `create_branch` with **no delete-ref
   counterpart**. **Owed from a checkout with full push rights; stop
   re-attempting it here.**
5. **Responsive probe not run, owed an eighth time** — needs a live instance.
6. `training/runs-hub.png` and `advanced-options.png` still photograph the
   rental lane; referenced by `docs/guide/workflow.md`, so a re-shoot.
7. Fork-only controls still carry emoji while upstream's use `lucide-react`.
8. `no-unused-vars` at `warn` (D9): **20 warnings, baseline-identical**.

## Traps
- **Fetch BOTH remotes before reading a single count off either.** This
  session's finding; diagnostic 32 has the long form. `git branch -a` reports a
  snapshot taken at clone time, and on `origin` the stale number looks like
  ordinary branch life rather than like the implausibly-large count that makes
  the `upstream` version of this trap announce itself.
- **When a count disagrees with `HANDOFF.md`, suspect the ref, not the
  handoff.** The handoff was written by a session that had just pushed; a
  container cloned before that push cannot know.
- **Read BOTH upstream windows.** Between upstream's waves `HEAD..upstream/main`
  is empty while `nightly` is not. The preview is worth the two minutes.
- **A fresh container authors commits as its agent vendor — fired again**, with
  `commit.gpgsign=true` pointing at a vendor SSH signing key. Reset identity
  *and* `git config commit.gpgsign false` before the first commit.
- **This container had no `.venv` and no `frontend/node_modules`.**
  `python3 -m venv .venv`, then
  `.venv/bin/python -m pip install -r backend/requirements-dev.txt`, and
  `npm install` in `frontend/`.
- **The Linux backend floor is 71 failures.** Diff the failure **list**, never
  the total — and the total moves on its own with the Torch overlay present or
  absent, which is exactly why.
- **This box has 4 cores.** Use `-n 4 --dist loadfile`. Running `npm run build`,
  ESLint and `node --test` alongside it stretched the suite from ~13.5 min of
  CPU time to ~26 min of wall clock; the run itself reports 13m43s.

## Verify
```bash
git fetch origin --prune && git fetch upstream
.venv/bin/python -m pytest backend/tests -q -rf -n 4 --dist loadfile
.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
