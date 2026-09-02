# HANDOFF

**Updated:** 2026-09-02 · **Branch:** main · **Base:** `fe6a58c` · **Tree:** clean

## State
`upstream/main` is `53ca495` and a **strict ancestor of `HEAD`** — fork **100
ahead / 0 behind**. **74 behind `upstream/nightly`**, intentionally (D11).
Nothing is in flight.

## Done this session
**A scheduled sync that found an empty window for the fourth run running, and
one open question eight times bigger than it was yesterday.** Nothing merged,
deliberately. Two findings.

**1. Diagnostic 32 fired again, and it was worth 62 commits this time.** The
container's `origin/main` arrived at `9538414` with the working branch reading
**62 ahead** of it. That divergence does not exist: one `git fetch origin
--prune` moved the tracking ref to `fe6a58c` — the branch's own tip — and the
62 became 0. The 2026-09-01 row recorded the same trap at 56, so the size is
not the lesson. **No count in this repo is readable before a fetch of both
remotes**, and acting on the unfetched one would have re-landed 62 commits'
worth of work to close a gap that was a stale ref.

**2. The Civitai lane is now threaded through Setup — new diagnostic 35.**
Yesterday's row flagged `48b473c` (publish a checkpoint to Civitai as a model
page) as the first upstream feature in months **no divergence answers**, and
refused to pre-decide it. Correct call; this is what deferring it cost. One
commit is now **eight** (`44c661f`, `eaadb72`, `b868a7c`, `35d546c` + three
dist/merge), with a `feat/civitai-prompt-batch` branch (`d47c0a1`) stacked on
top. **Verified against both trees, not read off a commit message:** `eaadb72`
appends the Civitai key to `SetupPage.jsx`'s **`KEY_FIELDS`** — whose other
three entries are `nanobanana`, `chatgpt`, `openrouter` — extends
`KEY_TEST_TARGET` beside them, and maps its capability row with
`CAPABILITY_STEP_ID['📤 Civitai publishing'] = 'image'`. **This fork has none of
the three**: D1 deleted both arrays and `SETUP_STEP_IDS` is `comfyui → ollama →
quality → training`, no `'image'`. Adopting the hunk either rebuilds the cloud
key screen or leaves a row pointing at a Setup step that does not exist.
`35d546c` also records the lane has been holding upstream's **own** full backend
suite red since the publisher landed.

**A third catch, per-hunk rather than whole-commit:** `779aee6` (video
Checkpoints & LoRAs, **+2118 lines**, the delta's largest) reads as pure
local-lane parity and is **mixed** — 162 cloud/pod references, `videoCloudStatus.js`
touched, and two of its six verbs are D4 (▶ Continue **on a fresh pod**,
ⓘ Details of a **cloud run** with GPU and **price**). The ⬇ / 📦 / ⏏ / 🗑 halves
are wanted. Carries `help/topics/videoLane.js` + `whatsNew.js`.

**Adoptable and screened clean:** `aa7ba58` (free-memory broom beside the
machine-load numbers) and `4590827` (watermark auto-crop cuts the band in one
encode, not the frame twice — **reported by nofaceman on Discord**; that credit
ships with the commit).

**`frontend/dist` rebuilt byte-identical**, so no `build(frontend):` commit.

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
| backend full suite | **8658 passed / 71 failed / 122 skipped**, 17m54s, `-n 4`, Torch overlay — **floor list matches by name and count** |
| identity / attribution | project identity, no trailers, `commit.gpgsign` off |

**No code changed this session** — the diff is `FORK_NOTES.md` + `HANDOFF.md`,
zero backend files — so pre- and post-trees are the same tree and every backend
failure is pre-existing by construction. Per CLAUDE.md's measure-first rule the
full suite was not owed; it was run because the scheduled task asked for it.

**The Linux floor has its LIST recorded — do not diff totals.** The total moves
on its own with the Torch overlay present or absent; the names do not. A failure
in a file **not** on this list is a regression:

| Count | File |
|---|---|
| 12 | `test_comfyui_utils.py` |
| 10 | `test_krea_training_bases.py` |
| 6 | `test_studio_service.py` |
| 6 | `test_capabilities.py` |
| 4 | `test_canvas_external_loras.py` |
| 4 | `test_bank_sort_exclude.py` |
| 3 | `test_image_bank.py` |
| 2 | `test_train_base_family_scope.py`, `test_image_bank_text_search.py`, `test_docker_launcher_fake_e2e.py`, `test_data_integrity_trash.py`, `test_comfy_folder_overrides.py`, `test_cloud_custom_base.py` |
| 1 | `test_studio_routes.py`, `test_studio_guest_checkpoints.py`, `test_static_mime_types.py`, `test_score_stop_over_the_sql_variable_ceiling.py`, `test_scene_caption_parity.py`, `test_run_folder_log.py`, `test_infer_env.py`, `test_image_bank_curation.py`, `test_dataset_routes.py`, `test_cloud_hf_gate_preflight.py`, `test_bank_remote_pass.py`, `test_bank_promote_performance.py`, `test_bank_medium_angle.py`, `test_anima_family.py` |

27 files, 71 tests — Windows path expectations, the `mimetypes` table
difference, ComfyUI path parsing and the Docker launcher. CI runs backend on
`windows-latest`, where these pass.

**Torch, again:** `download.pytorch.org` is still `403` at CONNECT here, but
`pip install torch==2.13.0` from PyPI resolves to `2.13.0+cu130` — same pinned
version, different build variant, imported and run on CPU. ~10 min, venv lands
at **5.0 GB**. **Install it before starting the suite, not alongside**: a torch
that lands mid-run changes what later workers can collect, and that run has to
be discarded (it was, this session).

## Open
1. **Civitai needs a yes/no NOW, not next window.** It is no longer a commit to
   drop — see diagnostic 35. Deciding it after the wave reaches `upstream/main`
   means deciding it under merge pressure, against Setup, the capability count
   and a contract test.
2. **`main` IS RED ON CI and has been for several sessions** — CI run #160 on
   `8576753`, "Backend tests" (`windows-latest`), 1 failed / 8784 passed on
   `test_bank_scan_no_db_lock.py::test_the_duplicate_regrouping_lets_other_`
   `writers_through`, at **0.2634 vs 0.25**. Not a regression (SUPERSEDED block
   under D5's sixth entry). Deliberately not "fixed": the number is a real
   concurrency guard, widening it is the maintainer's call, and no local run
   reproduces it (Linux replays the file green; CI backend is Windows-only).
3. **This session's push carries `[skip ci]` by explicit request**, so CI has
   not run on it. Both suites were run locally on that exact tree (table above).
4. **FIVE stale remote branches still need deleting — twelfth confirmation.**
   `claude/magical-tesla-ekn21b` / `juc4nk` / `tydc3z`,
   `claude/pensive-lovelace-l7yash` and `claude/pensive-lovelace-ue0g3o`. All
   five **0 unmerged commits** against `origin/main`, re-verified this session.
   `git push origin --delete` returns `error: RPC failed; HTTP 403` on the ref,
   then the sideband disconnect, then `Everything up-to-date`. The 403 is back
   in the first line, which settles the "network flake" reading the previous run
   had to rule out via the proxy status page. **This run also settles it the
   other way, and that is new evidence rather than a twelfth repeat:** the
   working branch `claude/pensive-lovelace-rqqiyh`, **created and pushed by this
   very token seconds earlier**, returns the identical 403 on delete. So it is
   not staleness, not ownership, and not any property of those five branches —
   the token can create and update refs and cannot delete any ref at all. The
   GitHub MCP server exposes `create_branch` with no delete-ref counterpart.
   **Owed from a checkout with full push rights; stop re-attempting it here.**
   That working branch is therefore also left behind, fully merged into `main`.
5. **Responsive probe not run, owed an eleventh time** — needs a live instance.
6. `training/runs-hub.png` and `advanced-options.png` still photograph the
   rental lane; referenced by `docs/guide/workflow.md`, so a re-shoot.
7. Fork-only controls still carry emoji while upstream's use `lucide-react`.
8. `no-unused-vars` at `warn` (D9): **20 warnings, baseline-identical**.

## Traps
- **A deferred divergence question gets more expensive every run.** Diagnostic
  35, measured at one day: one droppable commit became a lane through
  `KEY_FIELDS`, the capability count and a contract test.
- **A "parity" framing is the one most likely to be waved through.** `bc96c4f`
  and `779aee6` both arrive as "the video lane gets what the image lane has",
  and both carry D4 inside. Screen every commit for `pod`, `price`, `rented`,
  `cloud` before classifying it adoptable — `779aee6` was misread as local-lane
  on its commit message alone this session, and the file list corrected it.
- **Fetch BOTH remotes before reading a single count off either** (diagnostic
  32). Fired twice now: 56 commits, then 62.
- **Preview `nightly` cumulatively, by SHA** (diagnostic 33). The window does
  not drain per wave (4 → 12 → 38 → 62 → 74).
- **A fresh container authors commits as its agent vendor.** Global config
  carried the vendor name, a `noreply@` vendor address, and
  `commit.gpgsign=true` on a vendor SSH key. Set the project identity *and*
  `git config commit.gpgsign false` first, then confirm with
  `git config --list | grep -E '^user\.|gpgsign'` — the local values must win.
- **`upstream` was not configured in this container.** Add it, then
  `git remote set-url --push upstream DISABLED_NO_PUSH`.
- **No `.venv`, no `frontend/node_modules`.** `python3 -m venv .venv`, then
  `.venv/bin/python -m pip install -r backend/requirements-dev.txt`, then
  `pip install torch==2.13.0`, and `npm install` in `frontend/`. ~15 min.
- **Call `.venv/bin/python` by ABSOLUTE path, and never run two commands in
  parallel when one of them `cd`s.** The working directory persists across tool
  calls, so a parallel `cd` silently relocates the other command: a `node --test`
  raced this way reported **4538 tests / 5 failed** where the same suite from
  `frontend/` reports **4557 / 0**. That looks exactly like a regression and is
  not one.
- **This box has 4 cores.** Use `-n 4 --dist loadfile`.

## Verify
```bash
git fetch origin --prune && git fetch upstream
git rev-list --left-right --count HEAD...upstream/main
git rev-list --left-right --count HEAD...upstream/nightly
/abs/path/.venv/bin/python -m pytest backend/tests -q -rf -n 4 --dist loadfile
/abs/path/.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
