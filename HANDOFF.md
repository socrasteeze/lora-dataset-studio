# HANDOFF

**Updated:** 2026-09-02 · **Branch:** main · **Base:** 861f823 · **Tree:** clean

## State
Synced with `perfectgf/lora-dataset-studio` at `d468980` — **0 behind, 61 ahead**
of `upstream/main`, which is a strict ancestor of `HEAD`. **38 behind
`upstream/nightly`**, intentionally (D11). Nothing is in flight.

## Done this session
A scheduled sync that found **nothing to merge**, for the third run running —
and again that is the whole result, not a preamble to one. `upstream/main` has
not moved since `d468980` (2026-09-01) and is already fully contained in `HEAD`.

**The finding is diagnostic 33, new in `FORK_NOTES.md`: the nightly backlog did
not drain behind the empty window — it tripled.** `upstream/nightly` went
**12 ahead → 38 ahead in a single day**, and `git merge-base --is-ancestor`
confirms **none of the seven source commits previewed last session reached
`main`**. That is the counter-observation to the optimistic half of D11's
second-cost entry, which closed on the preview "paying off on the very next
window". Both outcomes are now recorded, and D11 points at 33.

**What it changes in practice: preview cumulatively, keyed by SHA, and classify
only the delta.** A from-scratch preview costs more every run while the window
grows (4 → 12 → 38). This session carried last session's seven forward by
reference and classified the **26 that are new**.

**`upstream/nightly` previewed, not merged (D11) — 26 new commits, and for the
second window running, zero are rejected-lane.** The Video Test Studio takes
most of it: the Gallery becomes a fourth start-frame source (`8cbc17a`, its
picker fixed by `83c229c`), sampling steps get a dial (`26baa0d`), clips reach
15 s on a snapping slider (`10b2782`), Reuse gives the start frame back
(`efcb12e`), the ✨ Motion field writes itself and now obeys an instruction
rather than decorating it (`15f95bb`, `97d77d1`, `57cd4c5`), and `2160294` adds
**↗ Smooth** — RIFE interpolation on a finished clip. Elsewhere: LoRA sliders in
the lightbox with a zoomable result (`cc8f124`); the Bank's ✨ improve window
gains the same dials **"like the dataset one"** (`f15184c` — upstream closing a
Bank/Dataset parity gap itself, so it adopts straight); saved prompts get a
picture and a search (`155b842`); `f2ea219` claims the video a
`VideoHelperSuite` node writes.

**Four things to have ready before that window lands** — all derived now so none
of it is derived under merge pressure:

1. **D10, the documented trap firing exactly as written.** Upstream's help edits
   land in `help/topics/pages.js` and `videoLane.js`, which this fork does not
   have. They are **one new topic plus one reword**: `studio-saved-prompts` is
   genuinely new and hand-ports into the single `helpRegistry.js` (last recorded
   **315 / 14**, so 316); `canvas-arrange` is **reworded** — new title
   (`Move run cards & lanes · resize a lane · ✦ Tidy up`) and ~15 lane-grip
   keywords aimed at the collision people actually report. **The reword moves no
   count and no id**, so only reading upstream's diff to the deleted module
   finds it.
2. **`2160294` needs the `RIFE VFI` ComfyUI custom node and `rife49.pth`** —
   neither is a pip package. CLAUDE.md item 10 is answered by the weights lane
   plus an honest probe, never by writing into `custom_nodes` (`7f03044`).
3. **One new setting: `video_caption.motion_model`** (empty = the provider's
   own), deliberately separate from the image passes' vision model so tuning the
   writer cannot re-point the captioner. Owes a settings-reference row. Upstream
   already wrote the `whatsNew.js` entries (+220 lines — expect the usual
   prepend-vs-prepend resolution).
4. **The sweep grep will hit `openai` on a legitimate line.**
   `video_motion_prompt.py` comments that `top_p`/`temperature` are
   "OpenAI-standard, so they travel to whatever LM Studio is fronting". That is
   D1b's local provider, **not** a cloud engine. Do not strip it.

Carried forward unchanged: `4aa839b`'s clip-length picker still prices lengths
against "the price of a cloud training run" (D4 read on wording), and `3c01163`'s
canvas lane still owes its `whatsNew.js` entry.

## Verified 2026-09-02 (all green on the shipped tree)
| Gate | Result |
|---|---|
| `ruff check .` | All checks passed |
| ESLint `npm run lint` | 0 errors / **20 warnings — D9 baseline exactly** |
| `npm run build` | clean, and **byte-identical to the committed `frontend/dist`** |
| local-only contract (frontend) | **8 / 8** |
| local-only + hygiene (backend) | **16 passed / 2 skipped** |
| `create_app()` | OK |
| `node --test` | **4557 passed, 0 failed** |
| backend full suite | **8658 passed / 71 failed / 122 skipped**, 17m56s, `-n 4` |
| identity / attribution | project identity, no trailers, signing off |

**The Torch gap the previous session left open is closed.**
`download.pytorch.org` is still `403` at CONNECT here, but
`pip install torch==2.13.0` from PyPI resolves to `2.13.0+cu130` — same pinned
version, different build variant, imported and run on CPU. It restored exactly
what the bare run drops: **+156 passes and 32 fewer skips** against last
session's `8502 / 71 / 154`, reproducing the documented **with-Torch** baseline
`8658 / 71 / 122` precisely. Cost ~10 min. **Worth it; do it again.**

**The 71 needs no baseline diff.** No code changed at all this session, so the
pre- and post-trees are the same tree and every failure is pre-existing by
construction. It is the documented Linux floor (Windows path expectations, the
`mimetypes` table difference); CI runs backend on `windows-latest`.

## Open
1. **`main` IS RED ON CI and has been for several sessions** — CI run #160 on
   `8576753`, "Backend tests" (`windows-latest`), 1 failed / 8784 passed on
   `test_bank_scan_no_db_lock.py::test_the_duplicate_regrouping_lets_other_`
   `writers_through`, which missed a wall-clock budget at **0.2634 vs 0.25**.
   Not a regression — see the SUPERSEDED block under D5's sixth entry. Still
   deliberately not "fixed": the number is a real concurrency guard, widening it
   is the maintainer's call, and no local run reproduces it (Linux replays the
   file green; CI backend is Windows-only). Decide whether 0.25 moves, then push
   a commit *without* `[skip ci]`.
2. **This session's push carries `[skip ci]` by explicit request**, so CI has not
   run on it. Both suites were run locally on that exact tree (table above).
3. **FIVE stale remote branches still need deleting — tenth confirmation.**
   `claude/magical-tesla-ekn21b` / `juc4nk` / `tydc3z`,
   `claude/pensive-lovelace-l7yash` and `claude/pensive-lovelace-ue0g3o`. All
   five **0 unmerged commits** against `origin/main`. `git push origin --delete`
   returns `HTTP 403` on the ref while an ordinary push to `main` succeeds in the
   same session — the token can write refs but not delete them. The GitHub MCP
   server exposes `create_branch` with **no delete-ref counterpart**. **Owed from
   a checkout with full push rights; stop re-attempting it here.**
4. **Responsive probe not run, owed a ninth time** — needs a live instance.
5. `training/runs-hub.png` and `advanced-options.png` still photograph the
   rental lane; referenced by `docs/guide/workflow.md`, so a re-shoot.
6. Fork-only controls still carry emoji while upstream's use `lucide-react`.
7. `no-unused-vars` at `warn` (D9): **20 warnings, baseline-identical**.

## Traps
- **Preview `nightly` cumulatively, by SHA.** Diagnostic 33. The window does not
  reliably drain per wave, so a from-scratch preview gets more expensive every
  run. Classify the delta against the previous changelog row.
- **A 38-commit window is the size that hurts.** The 64-commit sync of
  2026-08-24 needed 27 conflict regions and produced three silent-damage
  regressions with no conflict markers. The mitigation is **not** merging
  `nightly` (D11 still forbids it) — it is keeping the classification current.
- **Fetch BOTH remotes before reading a single count off either** (diagnostic
  32). `git branch -a` reports a snapshot taken at clone time.
- **Read BOTH upstream windows.** Between upstream's waves `HEAD..upstream/main`
  is empty while `nightly` is not.
- **A fresh container authors commits as its agent vendor — fired again.** Global
  config carried the vendor's own name and noreply address, plus
  `commit.gpgsign=true` pointing at a vendor SSH signing key. Set the project
  identity *and* `git config commit.gpgsign false` before the first commit, and
  confirm with `git config --list | grep -E '^user\.|gpgsign'` — the local values
  must be the ones that win.
- **`upstream` was not configured in this container at all.** Add it, then
  `git remote set-url --push upstream DISABLED_NO_PUSH`.
- **This container had no `.venv` and no `frontend/node_modules`.**
  `python3 -m venv .venv`, then
  `.venv/bin/python -m pip install -r backend/requirements-dev.txt`, then
  `pip install torch==2.13.0` (PyPI — the pytorch CPU index is blocked), and
  `npm install` in `frontend/`.
- **The Linux backend floor is 71 failures.** Diff the failure **list**, never
  the total — the total moves on its own with the Torch overlay present or
  absent.
- **This box has 4 cores.** Use `-n 4 --dist loadfile`.

## Verify
```bash
git fetch origin --prune && git fetch upstream
git rev-list --left-right --count HEAD...upstream/main
git rev-list --left-right --count HEAD...upstream/nightly
.venv/bin/python -m pytest backend/tests -q -rf -n 4 --dist loadfile
.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
