# HANDOFF

**Updated:** 2026-09-01 · **Branch:** main · **Base:** 526004b · **Tree:** clean

## State
Synced with `perfectgf/lora-dataset-studio` at `7bb5f2e` (v2026.08.31.1) — **0
behind, 53 ahead** of `upstream/main`. **4 behind `upstream/nightly`**, and that
gap is intentional (see below). Nothing is in flight.

## Done this session
A scheduled sync run that again found **nothing to merge on the sync source** —
but this time upstream was not idle, and the difference is the session's whole
finding.

- **No merge performed.** `upstream/main` is empty at `7bb5f2e`, confirmed on a
  fresh fetch and re-counted. Neither stale-ref trap fired: this container's
  local `main` matched `origin/main` at **0/0** from the start.
- **`upstream/nightly` is 4 commits ahead**, all dated 2026-08-31. Left
  unmerged on purpose — nightly is pre-gate by upstream's own description and
  this fork's `main` must stay releasable; cherry-picking would re-deliver each
  change when its wave reaches `upstream/main`. New subsection under **D11** in
  `FORK_NOTES.md` records the reasoning and makes reading *both* windows part of
  every sync.
- **Classified that window a wave early** — see the D11 subsection and the
  changelog row. Two adoptable local-lane fixes, one rejected-lane D4 commit
  plus its dist.
- **Re-verified the tree on Linux from a second container** — every gate below
  green and identical to the previous session's numbers.

## Verified 2026-09-01 (all green on `526004b`)
| Gate | Result |
|---|---|
| `ruff check .` | All checks passed |
| ESLint `npm run lint` | 0 errors / **20 warnings — D9 baseline exactly** |
| `node --test` | **4550 passed, 0 failed** |
| personal-data + ASCII-scripts + local-only engines | 16 passed, 2 skipped |
| contract families (`-k contract`) | 102 passed, 16 skipped |
| backend full suite | **not run — not owed.** Diff is docs-only, zero backend files |
| identity / attribution | project identity, no trailers, signing off |

## Open
0. **The next real merge is already scoped.** When upstream merges its wave to
   `main`, expect `64549fa` + `4967639` (adopt — a `claim_output_file` helper
   appended to `comfy_fs.py`, and `video_test_studio._bring_clip_home` routed
   through it; both are pure appends against this fork's copies) and `ada2e37` +
   `7707e83` (**reject** — the cloud-stop *Do not rent this machine again* tick
   on the dataset panel is D4 rental lane, and it ships with a `whatsNew.js`
   entry and a `help/topics/actions.js` line, the usual carriers).
1. **`main` IS RED ON CI and has been since before the previous session** — CI
   run #160 on `8576753`, "Backend tests" (`windows-latest`), 1 failed / 8784
   passed on `test_bank_scan_no_db_lock.py::test_the_duplicate_regrouping_lets_
   other_writers_through`, which missed a wall-clock budget at **0.2634 vs
   0.25**. Not a regression and not a dropped divergence — see the SUPERSEDED
   block under D5's sixth entry. **Still deliberately not "fixed":** the number
   is a real concurrency guard, widening it is the maintainer's call, and no
   local run reproduces it (Linux replays the file green; CI backend is
   Windows-only). Decide whether 0.25 moves, then push a commit *without*
   `[skip ci]` to prove it green.
2. **Three stale remote branches still need deleting** — `claude/magical-tesla-ekn21b`,
   `juc4nk`, `tydc3z`. All three **0 unmerged commits** against `origin/main`.
   **Seventh session blocked, and the diagnosis is now confirmed twice.** The
   delete returns `HTTP 403` on the ref; the egress proxy reported
   `recentRelayFailures: []` for those exact attempts, and an ordinary
   `git push --dry-run` to `main` succeeded in the same session — so the token
   can *write* refs but not *delete* them, and the GitHub MCP server exposes
   `create_branch` with no delete-ref counterpart. **Owed from a checkout with
   full push rights; stop spending sessions re-attempting it from a sandbox.**
3. **Responsive probe not run, owed a sixth time** — surface still includes the
   Video Test Studio lane (`/studio?lane=video`). Needs a live instance with LoRAs.
4. `training/runs-hub.png` and `advanced-options.png` still photograph the rental
   lane; referenced by `docs/guide/workflow.md`, so a re-shoot, not a delete.
5. Fork-only controls still carry emoji while upstream's use `lucide-react` icons.
6. `no-unused-vars` at `warn` (D9): **20 warnings, baseline-identical**.

## Traps
- **Read BOTH upstream windows.** `git log HEAD..upstream/main` is what the merge
  routine names, and between upstream's waves it is empty while `nightly` is not.
  Reporting only the first makes the ledger say "upstream did nothing" on a day
  upstream shipped four commits.
- **A fresh container authors commits as its agent vendor — fired again**, and
  again with `commit.gpgsign=true` pointing at a vendor SSH signing key the
  repo's history does not use. Reset identity *and* `git config commit.gpgsign
  false` before the first commit. This container arrived with both.
- **This container had no `.venv` and no `frontend/node_modules`.** Provisioning
  cost ~2 min: `python3 -m venv .venv` then
  `.venv/bin/python -m pip install -r backend/requirements-dev.txt` (lands
  pytest 9.1.1, matching the pin), and `npm install` in `frontend/`.
- **The Torch overlay was not installed this session and was not needed** — the
  diff touched zero backend files, so the backend suite was not owed. If a
  future session does owe it: `download.pytorch.org` is 403 at CONNECT here, but
  PyPI works (`pip install torch==2.13.0`, ~1.6 GB). Without it ~122 tests skip
  and one fails rather than skipping.
- **The Linux backend floor is 71 failures** (Windows-only path expectations,
  and a `.js`/`.mjs` mimetype-registry difference). CI runs backend on
  `windows-latest`, so none is CI-visible. Diff the failure **list**, never the
  total.

## Verify
```bash
.venv/bin/python -m pytest backend/tests -q -n 8 --dist loadfile
.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
