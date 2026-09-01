# HANDOFF

**Updated:** 2026-09-01 · **Branch:** main · **Base:** 8576753 · **Tree:** clean

## State
Synced with `perfectgf/lora-dataset-studio` at `7bb5f2e` (v2026.08.31.1) — **0
behind, 57 ahead**. The 27-commit window and its dist are **on `main`**; the
feature branch that carried them is gone from `origin`. Nothing is in flight.

## Done this session
A scheduled sync run that found **nothing to sync** — recorded because "no
window" is a result, and the previous handoff no longer described the remote.

- **No merge performed.** `upstream/main` was already an ancestor of the fork's
  own tip, so the incoming window was empty. The first `git log HEAD..upstream/main`
  looked like 27 incoming commits purely because local `main` was 31 behind
  `origin/main` — the skill's stale-ref trap, in its "local ref is stale" form.
- **The sync had already landed on `origin/main`** (`9538414..8576753`) between
  this container's clone and its first fetch. Local `main` fast-forwarded to it.
- **Re-verified the landed tree on Linux, with the Torch overlay present** —
  every gate below green. This is the first full-suite confirmation of that tree
  from a second machine.

## Verified 2026-09-01 (all green on `8576753`)
| Gate | Result |
|---|---|
| ESLint `npm run lint` | 0 errors / **20 warnings — D9 baseline exactly** |
| `npm run build` | committed `frontend/dist` is **byte-identical** to a fresh build |
| local-only engines, frontend | 8/8 |
| local-only engines, backend | 3/3 |
| `create_app()` | OK |
| personal-data + ASCII-scripts | 13 passed, 2 skipped (no `.privacy-names` list) |
| `ruff check .` | All checks passed |
| `node --test` | **4550 passed, 0 failed** |
| backend `-n 8 --dist loadfile` | **8605 passed, 71 failed, 122 skipped** (11m51s) |
| identity / attribution | one author across all 31 commits, no trailers |

## Open
1. **Three stale remote branches still need deleting** — `claude/magical-tesla-ekn21b`,
   `juc4nk`, `tydc3z`. All three confirmed **fully contained in `origin/main`, zero
   unmerged commits**, so they are safe to delete. **Sixth session blocked.**
   **Newly diagnosed this session:** the 403 is *not* the sandbox egress proxy —
   its status endpoint reported `recentRelayFailures: []` for the attempts, so the
   connection was allowed and **GitHub itself refused the ref delete**. The GitHub
   MCP server offers `create_branch` but no delete-branch/delete-ref tool, so there
   is no route around it from here. Owed from a checkout with full push rights;
   stop re-attempting it from a sandbox.
2. **Responsive probe not run, owed a fifth time** — surface still includes the
   Video Test Studio lane (`/studio?lane=video`). Needs a live instance with LoRAs.
3. `training/runs-hub.png` and `advanced-options.png` still photograph the rental
   lane; referenced by `docs/guide/workflow.md`, so a re-shoot, not a delete.
4. Fork-only controls still carry emoji while upstream's use `lucide-react` icons.
5. `no-unused-vars` at `warn` (D9): **20 warnings, baseline-identical**.

## Traps
- **The Linux backend floor is 71 failures and it reproduced exactly.** Sampled
  and classified: Windows-only path expectations (`venv/Scripts/python.exe`,
  `WindowsPath` instantiation), and a mimetype-registry difference on `.js`/`.mjs`
  (`text/javascript` vs `application/javascript`). CI runs backend on
  `windows-latest`, so none of these is CI-visible. Diff the failure **list**,
  never the total.
- **`test_peer_training_over_http.py` did NOT flake this run** — first clean run
  in six syncs. Do not pre-emptively treat it as expected-red.
- **The Torch overlay still cannot come from its pinned index** —
  `download.pytorch.org` is 403 at CONNECT here. PyPI works:
  `pip install torch==2.13.0` (resolved to `2.13.0+cu130`, ~1.6 GB of deps).
  Without it ~122 tests skip and one fails rather than skipping.
- **A fresh container authors commits as its agent vendor — fired again.** This
  one also arrived with `commit.gpgsign=true` pointing at a vendor SSH signing
  key, which the repo's own history does not use (every commit is unsigned).
  Reset identity *and* disable that signing before the first commit.
- **A local ref can be many commits behind `origin` at container start.** Fetch
  and compare against `origin/main`, not local `main`, before believing an
  incoming-commit count.

## Verify
```bash
.venv/bin/python -m pytest backend/tests -q -n 8 --dist loadfile
.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
