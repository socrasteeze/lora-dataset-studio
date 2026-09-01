# HANDOFF

**Updated:** 2026-09-01 · **Branch:** main · **Base:** acc45e7 · **Tree:** clean

## State
Synced with `perfectgf/lora-dataset-studio` at `d468980` — **0 behind, 54 ahead**
of `upstream/main`. **4 behind `upstream/nightly`**, intentionally (D11).
Merged, gated and **pushed to `origin/main`**. Nothing is in flight.

## Done this session
The scheduled sync found a real window this time: **18 commits**
(`7bb5f2e`..`d468980`), merged and landed. Full detail in the `FORK_NOTES.md`
changelog row; the short form:

- **Adopted, all local-lane.** Video captions now run on whatever engine the
  machine has — LDS's transformers worker, else Ollama *or* LM Studio through
  the same `vision_llm` waist (D1b's second instance earning its adoption); the
  transformers-5 repair that had been failing every shot of every pass in
  silence; a real umT5 token gauge plus a structured caption tail, so a sidecar
  that would overrun Wan's 512-token window is written short rather than cut;
  both caption prompts now forbid *replacing* the scene, not just euphemising
  it; the video bank wears the image bank's Encre shell; the header's utility
  cluster yields to the workspace links; and `claim_output_file` stops a locked
  ComfyUI output committing as a truncated-but-finished file.
- **Rejected:** `ada2e37` + its dist `7707e83` — the *Do not rent this machine
  again* tick on the dataset panel's cloud-stop dialog (D4 rental lane), exactly
  as the previous session previewed it a wave early.
- **The window's one real catch had no marker.** Rejecting all three
  `TrainingPanel.jsx` hunks (every one an empty HEAD side) still left the
  commit's `<CloudStopDialog>` `createPortal` block live at the bottom of the
  render tree and `isFullTransformerRun` added to an import list at the top —
  ~300 lines from the nearest marker, referencing a deleted module plus state
  and a handler that lived inside a rejected hunk. Diagnostics 18, 19 and 22 in
  a single edit. Stripped; the file is byte-identical to pre-merge HEAD.
- **Re-deleted** `pages/cloudStopDialog.test.js` and `help/topics/actions.js`.
  D10's correct port this window was to port **nothing** — `actions.js`'s only
  edit was that same rejected commit's five rental keywords.
- **`FORK_NOTES.md` updated in the merge commit**: a changelog row, a new D4
  subsection, a new D10 paragraph, and D11's closing note that the wave-early
  preview held exactly.

## Verified 2026-09-01 (all green on `acc45e7`)
| Gate | Result |
|---|---|
| `ruff check .` | All checks passed |
| ESLint `npm run lint` | 0 errors / **20 warnings — D9 baseline exactly** |
| `npm run build` | clean |
| local-only contract (both halves, vs REBUILT dist) | frontend **8/8**, backend **3/3** |
| `create_app()` | OK |
| `node --test` | **4557 passed, 0 failed** (was 4550 — new layout contract) |
| personal-data + ASCII-scripts + contract families | 100 passed, 2 skipped |
| backend full suite | **8658 passed / 71 failed / 122 skipped** |
| baseline diff | pre-merge **8605 / 71 / 122** → **the same 71 by name**, +53 passing, zero delta |
| identity / attribution | project identity, no trailers, signing off |

## Open
1. **`main` IS RED ON CI and has been for several sessions** — CI run #160 on
   `8576753`, "Backend tests" (`windows-latest`), 1 failed / 8784 passed on
   `test_bank_scan_no_db_lock.py::test_the_duplicate_regrouping_lets_other_
   writers_through`, which missed a wall-clock budget at **0.2634 vs 0.25**.
   Not a regression and not a dropped divergence — see the SUPERSEDED block
   under D5's sixth entry. Still deliberately not "fixed": the number is a real
   concurrency guard, widening it is the maintainer's call, and no local run
   reproduces it (Linux replays the file green; CI backend is Windows-only).
   Decide whether 0.25 moves, then push a commit *without* `[skip ci]`.
2. **This session's push carries `[skip ci]` by explicit request**, so CI has
   NOT run on `acc45e7`. Both suites were run locally on that exact tree (table
   above). The next push that wants a CI verdict must omit the marker.
3. **FOUR stale remote branches still need deleting** — `claude/magical-tesla-`
   `ekn21b` / `juc4nk` / `tydc3z`, and now `claude/pensive-lovelace-l7yash`.
   All four **0 unmerged commits** against `origin/main`.
   **Eighth session blocked; the diagnosis is now confirmed three times.** The
   delete fails on the ref while an ordinary push to `main` succeeds in the same
   session, and the egress proxy logged **no github.com failure** for those
   attempts (only unrelated `huggingface.co` / `console.vast.ai` denials from
   the test suite) — so it is GitHub refusing the delete, not the sandbox. The
   GitHub MCP server exposes `create_branch` with **no delete-ref counterpart**.
   **Owed from a checkout with full push rights; stop re-attempting it here.**
   `claude/pensive-lovelace-ue0g3o` (this session's branch) is also fully merged
   and can go with them.
4. **Responsive probe not run, owed a seventh time** — the surface now also
   includes the reworked `/video-bank` rail/passes states upstream added a spec
   for. Needs a live instance.
5. `training/runs-hub.png` and `advanced-options.png` still photograph the
   rental lane; referenced by `docs/guide/workflow.md`, so a re-shoot.
6. Fork-only controls still carry emoji while upstream's use `lucide-react`.
7. `no-unused-vars` at `warn` (D9): **20 warnings, baseline-identical**.

## Traps
- **A rejected commit is not rejected until the files it touched are ABSENT
  from `git diff --name-status HEAD`.** This session's catch. Resolving every
  marker and re-grepping the phrase list both said "done" while a portal block
  and an import still sat in the file. The changed-file list is the check that
  compares the WHOLE file against the fork's pre-merge content instead of the
  regions git chose to ask about.
- **Read BOTH upstream windows.** Between upstream's waves `HEAD..upstream/main`
  is empty while `nightly` is not. Reading nightly a wave early paid off here:
  the whole rejection was scoped before `git merge` ran.
- **A fresh container authors commits as its agent vendor — fired again**, and
  again with `commit.gpgsign=true` pointing at a vendor SSH signing key that is
  **an empty file**, so a signed commit would simply fail. Reset identity *and*
  `git config commit.gpgsign false` before the first commit.
- **This container had no `.venv` and no `frontend/node_modules`.**
  `python3 -m venv .venv`, then
  `.venv/bin/python -m pip install -r backend/requirements-dev.txt`, and
  `npm install` in `frontend/`.
- **The Torch overlay cannot be installed from its pinned index here.**
  `download.pytorch.org` is **403 at CONNECT** under this environment's egress
  policy (do not route around it). PyPI works: `pip install torch==2.13.0`
  lands `2.13.0+cu130` — same version, CUDA build, no GPU present, and it makes
  the ~122 otherwise-skipped tests run. Budget ~10 min for the download.
- **The Linux backend floor is 71 failures** (Windows-only path expectations,
  and a `.js`/`.mjs` mimetype-registry difference). CI runs backend on
  `windows-latest`, so none is CI-visible. Diff the failure **list**, never the
  total.
- **This box has 4 cores.** Use `-n 4 --dist loadfile` (CI's own pin), not
  `-n 8`; the full suite then takes ~13.5 min.

## Verify
```bash
.venv/bin/python -m pytest backend/tests -q -rf -n 4 --dist loadfile
.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
