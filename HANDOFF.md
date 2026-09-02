# HANDOFF

**Updated:** 2026-09-02 · **Branch:** main · **Base:** `0043f73` · **Tree:** clean

## State
Synced with `perfectgf/lora-dataset-studio` at `53ca495` — **0 behind, 61 ahead**
of `upstream/main`. **62 behind `upstream/nightly`**, intentionally (D11).
Nothing is in flight.

## Done this session
**A one-commit sync that still needed divergence work.** `upstream/main` moved
for the first time in three scheduled runs (`d468980` → `53ca495`): a single
README-only commit, `+17` lines, putting the Ko-fi funding ask above the fold.
Merged as `0043f73`. Two findings, and the commit's headline is neither of them.

**1. The conflict region was 344 lines for a one-line change.** Upstream appends
one sentence closing the Roadmap; this fork inserts a 343-line
`### Table of contents` block at exactly that point, so git aligned upstream's
single added line against the fork's whole block (README lines 516–862).
Resolved **keep-both**, upstream's closer first. Worth remembering because at
that size a "prefer the fork" reflex reads as obviously correct and would have
silently dropped the one line actually being adopted.

**2. The half with no conflict marker is the one that mattered — new diagnostic
34.** The intro block auto-merged clean and asserted *"this is what funds the
work: the API credits and rented GPUs every release is tested on"* — eight lines
under this fork's own *"No account, paid tier, API key or telemetry … there is
no rented-GPU lane."* Two contradictory claims, both above the fold. The fork had
**already solved that exact sentence** 600 lines below, in "Support the project"
(*"upstream's own API credits and rented GPUs, which is how the lanes this fork
keeps are verified…"*), so the resolution reuses that wording rather than
inventing a third variant. **The standing D1/D4 sweep cannot catch this**: it
greps for rejected *feature* vocabulary (`chatgpt`, `nanobanana`, `openrouter`,
`VAST_API_KEY`) and a funding sentence names no engine, provider or key. Sweep
merge-added lines for the *marketing* words too — `rented`, `rental`, `cloud`,
`API credits`.

**`frontend/dist` rebuilt byte-identical**, so this wave ships **no
`build(frontend):` commit** — the first sync where that is true. Funding and
sponsorship links stay upstream's, per the 2026-08-02 precedent.

**`upstream/nightly` previewed, not merged (D11) — 62 ahead (was 38), 24 new,
and the rejected lane is BACK after two clean windows.**
- **Reject (D4):** `bc96c4f` "the cloud launch at parity" puts the video
  dataset's cloud-training launch window, preflight and confirm on the same
  footing as the local one — the D4 surface, arriving as a *parity* commit,
  which is the framing most likely to be waved through. Its dist is `cb3cd28`.
- **Needs a maintainer decision, not a divergence lookup:** `48b473c` publishes
  a checkpoint to **Civitai** as a model page and posts its images (`4e0a7d2` is
  its probe test, `a8d8160` its dist). This is neither a D1 generation engine nor
  a D4 rental — it is a third-party account and API token in an app whose README
  opens with "no account, paid tier, API key or telemetry". **Do not pre-decide
  it; ask.**
- **Adoptable, local-lane:** `92481ad` (Krea hi-res second pass, app-side
  finishing pass, rebalance/enhancer retired), `a239719` (the crop encodes the
  box once, not the whole image twice), `8b70ed6`, `f8bd519`, `db67bc3`/`ce1c653`.
- `81383a2` is the nightly original of the `53ca495` merged here — confirmation
  that the preview keys correctly by content.
- Carried forward unchanged: `4aa839b`'s clip-length picker still prices lengths
  against "the price of a cloud training run" (D4 read on wording); `3c01163`'s
  canvas lane still owes its `whatsNew.js` entry; D10's `studio-saved-prompts`
  (new topic, → 316) and the `canvas-arrange` **reword** that moves no count and
  no id; `2160294`'s RIFE node/weights lane; `video_caption.motion_model` owes a
  settings-reference row; and `video_motion_prompt.py`'s legitimate `openai`
  comment (D1b local provider — do not strip).

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
| backend full suite | **8658 passed / 71 failed / 122 skipped**, 18m06s, `-n 4` |
| identity / attribution | project identity, no trailers, signing off |

**One run served as both baseline and result, and here is why that is sound
rather than a shortcut.** The merge changed exactly one file (`README.md`);
`git diff --name-only <pre-merge> HEAD -- backend/ frontend/src frontend/tests
frontend/dist` is **empty**. So the pre- and post-merge trees are byte-identical
for every test in both suites, and a separate pre-merge run would have executed
the same bytes. The tree-scanning tests (`test_no_personal_data.py`, the
contract pair) were additionally **re-run after** the `FORK_NOTES.md` edits, on
the final tree.

**The 71-failure Linux floor now has its LIST recorded — do not diff totals.**
The total moves on its own with the Torch overlay present or absent; the names do
not. A failure in a file **not** on this list is a regression:

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
version, different build variant, imported and run on CPU. Reproduces the
documented with-Torch baseline exactly. Cost ~12 min of the run. **Worth it.**

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
3. **Civitai (`48b473c`) needs a yes/no before the next real window** — see
   above. It is the first upstream feature in months that no existing divergence
   answers.
4. **FIVE stale remote branches still need deleting — eleventh confirmation.**
   `claude/magical-tesla-ekn21b` / `juc4nk` / `tydc3z`,
   `claude/pensive-lovelace-l7yash` and `claude/pensive-lovelace-ue0g3o`. All
   five **0 unmerged commits** against `origin/main`, re-verified this session.
   `git push origin --delete` fails while an ordinary push to `main` succeeds in
   the same session — the token can write refs but not delete them. **The symptom
   changed shape this run and the diagnosis did not:** instead of a clean
   `HTTP 403` on the ref it now reports `send-pack: unexpected disconnect while
   reading sideband packet` / `the remote end hung up unexpectedly`, then
   `Everything up-to-date`, on all five. That wording invites a "network flake,
   retry it" reading, so rule that out the cheap way — `curl -sS
   "$HTTPS_PROXY/__agentproxy/status"` listed **zero github.com entries** in
   `recentRelayFailures` (only unrelated `huggingface.co` and `console.vast.ai`
   403s from the suite), and the push to `main` had just succeeded over the same
   connection. The GitHub MCP server exposes `create_branch` with **no delete-ref
   counterpart**. **Owed from a checkout with full push rights; stop
   re-attempting it here.**
5. **Responsive probe not run, owed a tenth time** — needs a live instance.
6. `training/runs-hub.png` and `advanced-options.png` still photograph the
   rental lane; referenced by `docs/guide/workflow.md`, so a re-shoot.
7. Fork-only controls still carry emoji while upstream's use `lucide-react`.
8. `no-unused-vars` at `warn` (D9): **20 warnings, baseline-identical**.

## Traps
- **A docs-only window is not a safe window.** Diagnostic 34. One README commit
  carried a factual divergence with zero conflict markers, and no gate in the
  repo can see a false sentence.
- **Reuse the fork's existing rewording of a claim; do not write a second one.**
  The "API credits and rented GPUs" sentence now exists twice in `README.md`,
  600 lines apart. They must stay consistent.
- **Preview `nightly` cumulatively, by SHA.** Diagnostic 33. The window does not
  reliably drain per wave (4 → 12 → 38 → 62), so a from-scratch preview gets
  more expensive every run. Classify the delta against the top changelog row,
  which is where the live classification lives.
- **A 62-commit window is past the size that hurts.** The 64-commit sync of
  2026-08-24 needed 27 conflict regions and produced three silent-damage
  regressions with no conflict markers. The mitigation is **not** merging
  `nightly` (D11 still forbids it) — it is keeping the classification current.
- **Fetch BOTH remotes before reading a single count off either** (diagnostic
  32). `git branch -a` reports a snapshot taken at clone time.
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
  `npm install` in `frontend/`. Budget ~15 min; the venv lands at ~4 GB.
- **Call `.venv/bin/python` by ABSOLUTE path.** A `cd` into `frontend/` persists
  across tool calls in some harnesses and turns the relative form into "no such
  file", which reads as a broken venv and is not one.
- **The Linux backend floor is 71 failures.** Diff the failure **list** (table
  above), never the total — the total moves on its own with the Torch overlay
  present or absent.
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
