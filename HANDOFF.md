# HANDOFF

**Updated:** 2026-08-31 · **Branch:** main · **Base:** 1cefafc · **Tree:** clean

## State
Synced with `perfectgf/lora-dataset-studio` at `7bb5f2e` (v2026.08.31.1) — 27
commits, an entirely local-lane window, 0 behind after this push. All gates green
on the exact tree pushed, full backend suite included.

## Done this session
- Merged `4d21222..7bb5f2e` — thirteen conflict regions across twelve files, four
  `modify/delete` — `d2c4fb5`; dist `a715e6a`
- **Adopted, all local:** 🎬 Video Test Studio (+ weights-only Setup installer),
  Klein cleaning the WHOLE photo after erasing zones, the three Klein-clean dials,
  whole-mark zones, the deep sweep reporting every zone, the vision-model picker,
  finger-sized Bank buttons, "a restart is not a ComfyUI error".
- **The one that mattered (D6):** upstream split `inpaint_watermark_klein` into two
  helpers. Git conflicted on the signature only; the new dispatch auto-merged below
  it calling helpers that take no `device_id` — reverting D6 on the clean lane
  silently, and leaving the repair lane calling `_run_klein_job(device_id=device_id)`
  inside a helper that never declared it (a `NameError` on every ✦ repair).
- **Divergence 11 added:** upstream's `nightly` doctrine auto-merged into `CLAUDE.md`
  with zero markers — removed there, in two stragglers, and in `.claude/rules/`.
- D5's `_video_extra` carrier retired (upstream added it). Counts recomputed:
  capabilities 18→**19**, installCatalog 23→**28**, plus `kreaInstall.test.js` (the
  count's second home, auto-merged stale). D10: 310 → **315 topics / 14 tips**.

## Open
1. **Three stale remote branches need deleting** — `claude/magical-tesla-ekn21b`,
   `juc4nk`, `tydc3z`, all contained in `main`. This sandbox has had **HTTP 403** on
   ref delete for five sessions (push works, delete does not; no delete-branch tool
   on the GitHub MCP server). Owed from a machine with full push rights.
2. **Responsive probe not run, owed a fourth time** — and the surface grew: the Video
   Test Studio is a new lane (`/studio?lane=video`). Needs a live instance with LoRAs.
3. `training/runs-hub.png` and `advanced-options.png` still photograph the rental
   lane; referenced by `docs/guide/workflow.md`, so a re-shoot, not a delete.
4. Fork-only controls still carry emoji while upstream's use `lucide-react` icons.
5. `no-unused-vars` at `warn` (D9): **20 warnings, baseline-identical**.

## Decisions
- **`CHANGELOG.md` deliberately NOT updated** — frozen since 2026-07-31; release
  notes generate from `whatsNew.js`, which carries all five entries.
- **README kept the fork's heading structure** over upstream's capability table.
- **`video_test_studio.py`'s `cloud_training` import is fine** — that module IS
  carried (dormant, D4 server/client split). Only `cloud_video_training` is not.

## Traps
- **`test_peer_training_over_http.py` flakes under xdist — FIFTH sync running.** Two
  reds post-merge; one passed alone, the whole file replays **20/20 green ×3**.
- Linux floor here is **71 backend failures**; CI runs backend on `windows-latest`.
  Diff the failure LIST against a baseline, never the total.
- **The Torch overlay cannot come from its pinned index** — `download.pytorch.org` is
  403 at CONNECT here. PyPI works: `pip install torch==2.13.0`; ~124 tests skip without it.
- A fresh container authors commits as its agent vendor — reset the git identity to
  the `CLAUDE.md` one before the first commit. Fired again this session.

## Verify
```bash
.venv/bin/python -m pytest backend/tests -q -n 8 --dist loadfile
.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
