# HANDOFF

**Updated:** 2026-09-07 · **Branch:** `main` · **Base:** `9f7ea61` · **Tree:** clean

## State
The **8-commit sync is merged, gated and pushed**. `upstream/main` is `6bdd2434`
and is now an ancestor of `HEAD`. Three commits landed: the main merge
(`a652a69`), a second merge for the README commit upstream shipped mid-run
(`26e22f1`), and the bundle (`913ef14`). Nothing is in flight.

## Done this session
**A small, clean window whose one real trap was a BRAND-NEW function arriving
unscoped — the other half of Divergence 6a's shape.**

**Adopted:** a cancel now asks ComfyUI to **stop the render it is already
running** (targeted `/interrupt`, sent only when the running prompt is exactly
LDS's by prompt id *and* client id), and **🧹 Free memory answers a refusal with
a second press instead of a wall** — when the obstacle is a render of LDS's own
it says so, and the same button pressed again within a minute interrupts that
render and frees. A training, the local Live channel and a foreign prompt keep
refusing. Also: the video studio's **Motion field survives a page reload**, and
**the still is read as it is, without reasoning** (`think=False` through both
local drivers, so a hybrid vision model stops burning its budget reasoning
inside the answer the motion writer reads). Plus upstream's **Roadmap
correction**, adapted.

**Net-zero:** upstream's *"Update & restart refuses while work is in flight"*
arrived and was **reverted by upstream inside the same window** (maintainer's
call — the app re-attaches to a surviving ComfyUI prompt by id). Neither
`settings.py` nor `settings-reference.md` moves.

### The D6a catch — read this first if `own_running_job` comes up again
Everything D6a warned about was an upstream **rewrite** of a function already
scoped here. This window produced the other half: `own_running_job()` is a
function this fork had **never seen**, so there was nothing for it to conflict
with, and it merged with **zero markers** carrying two unscoped
`ImageGenerationQueue` queries. `running_prompt_identity()` reads *this
machine's* ComfyUI while the table is shared with every `api:` backend — and
unlike the earlier instances this one feeds a **destructive** button: on a
prompt-id collision the 🧹 second press would have dropped a render on a machine
the user is not sitting at. Both reads now go through `local_rows_only`, pinned
by two tests **verified to fail without the scoping** plus a mirror.

**The tell worth remembering:** its `live` status tuple was character-identical
to the busy-check tuple 300 lines above that *is* scoped. A new query whose
status tuple already appears in a scoped query is almost certainly owed the same
filter. FORK_NOTES D6a now carries the derive command for next time:
`git diff <pre-merge-HEAD> -- backend/app | grep 'ImageGenerationQueue.query'`.

## Verified 2026-09-07 (all on the exact pushed tree)
| Gate | Result |
|---|---|
| `ruff check .` | All checks passed |
| ESLint `npm run lint` | **0 errors / 20 warnings — D9 baseline exactly** |
| `npm run build` | clean; bundle committed separately |
| local-only contract | **8/8** frontend · **16 passed / 2 skipped** backend (the 2 are the documented name-list skip) |
| `create_app()` | OK |
| `node --test` | **4949 passed / 0 failed** (baseline 4935 — 14 adopted tests) |
| backend full suite | **71 failed / 9296 passed / 123 skipped**, 12m09s, `-n 4 --dist loadfile`, Torch — the failure set is a strict **subset** of the 72-failure pre-merge baseline: **zero new failures**, the neural-render race gone, and one `test_peer_training_over_http` name that passed this run |
| identity / attribution | project identity on all three commits, no trailers |

**The Linux floor is unchanged and the names match test-for-test.** A failure in
a file not on this list is a regression.

## Open
1. **CI has not run on this push** (per the standing request for this run). Both
   suites and both linters were run locally on this exact tree.
2. **Civitai publisher: still the maintainer's yes/no** (unchanged; FORK_NOTES
   carries the recipe for a yes).
3. **Responsive probe not run** — needs a live instance.
4. `training/runs-hub.png` and `advanced-options.png` still photograph the rental
   lane; referenced by `docs/guide/workflow.md`, so they need a re-shoot.
5. Fork-only controls still carry emoji while upstream's use `lucide-react`.

## Traps (carried forward, all confirmed again this run)
- **A fresh container has no `upstream` remote, no `.venv`, no `node_modules`.**
  Re-add upstream with `git remote set-url --push upstream DISABLED_NO_PUSH`.
- **`origin/main` in a fresh clone can be badly stale, and the session branch is
  just another name for it.** This container opened on
  `claude/pensive-lovelace-9m1qbt` with `origin/main` 207 commits behind the real
  remote `main`; the branch tip and the true `origin/main` were the same commit.
  **`git fetch origin --prune` before reading any count** — the pre-fetch numbers
  are fiction, and the previous handoff made the same observation about a
  differently-named branch.
- **`requirements-torch-tests.txt` pins `torch==2.13.0+cpu`, which this session
  cannot fetch** (`download.pytorch.org` is 403 at CONNECT — an egress-policy
  denial, not a network fault; do not retry or route around it). `pip install
  torch==2.13.0` from PyPI resolves to `2.13.0+cu130` — same pinned version,
  different build, runs on CPU. Install it BEFORE starting the suite, or ~124
  tests silently skip and one FAILS rather than skipping.
- **Commit signing must be turned off per clone.** The container ships
  `commit.gpgsign=true` with an **empty** signing key; every existing fork commit
  is unsigned. `git config commit.gpgsign false` before the first commit.
- **The container's global git identity is not the project's.** Set
  `user.name`/`user.email` per CLAUDE.md before committing — a fresh checkout
  inherits whatever is global.
- **Call `.venv/bin/python` by ABSOLUTE path, and never run two commands in
  parallel when one `cd`s.** The working directory persists across tool calls.
- **This box has 4 cores.** `-n 8` completes (12m25s) but `-n 4 --dist loadfile`
  is the documented setting.
- **`upstream/nightly` no longer exists** (D11) — do not put it in a verify
  script; it fails with `couldn't find remote ref`.
- **Upstream can ship mid-sync.** It added a README commit while this wave's
  gates were running. Re-check `git ls-remote --heads upstream` before the push
  and decide deliberately: take it (and re-gate) or record it as the next window.

## Verify
```bash
git fetch origin --prune && git fetch upstream
git rev-list --left-right --count HEAD...upstream/main
/abs/path/.venv/bin/python -m pytest backend/tests -q -rf -n 4 --dist loadfile
/abs/path/.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
