# HANDOFF

**Updated:** 2026-08-30 · **Branch:** main · **Base:** c6cf6cc · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `261f60ae` — 0 behind, all gates green
on the tree pushed. The window was **12 commits**: a small, almost entirely local
one, where the only thing that could have shipped broken carried no conflict
marker and no grep hit.

## Done this session
- Merged upstream `bdea2e4..261f60a` — five content-conflict regions (four in
  `VideoDatasetsPanel.jsx`, one in `whatsNew.js`), no `modify/delete` at all — `0dc6bb4`
- **Adopted: the C12 caption calibration** — 16 frames (was 8), 400 tokens in
  both the worker and the infer fallback, one-paragraph prompts, and the camera
  taken away from the caption model entirely: the 🎥 pass's homography classifier
  writes `Camera: <phrase>.` at export and stays silent when it measured nothing.
- **Adopted: the 🗣 Describe launch window + its Model section**, the always-visible
  ⓘ on every pass button (`GuideSectionModal` + `guideSection.js`, one text for
  guide and modal), and the three phone-triage dead ends (↩ To triage, sticky
  player header, dropdown retired into the window).
- **Adopted: LM Studio model downloads from LDS** (`lmstudio_download.py`,
  provider-routed through `/api/local-llm/pull`), and ✨ Enhance's gate now
  loading the model instead of refusing it.
- **Adopted with the D4 cut: `VideoTrainingBlock.jsx`** — upstream's name and
  structure, minus the ☁ button, GPU-tier picker, cost line, cloud retry/continue
  and harvested-checkpoint groups. So it imports no `videoCloudStatus`, which
  stays deleted.
- **A divergence RETIRED:** upstream replaced `PROVEN_ON` with a plain
  `PROVEN_TARGETS` set and deleted the sentence naming where a target was proven
  — so the fork's carried "elsewhere" reword is gone rather than re-applied.
- Changelog row, a new D5 subsection, the D4 and D1b edits — `FORK_NOTES.md`
- README's LM Studio row corrected (it still said "LDS cannot start it for you")
- `build(frontend):` dist rebuild — `c6cf6cc`

## Open
1. Fork-only controls still carry emoji while upstream's use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`) — a wave of its
   own (D3). Unchanged by this sync.
2. `no-unused-vars` is at `warn` (D9): **20 warnings, identical to the pre-merge
   baseline** — all pre-existing orphans of D1/D4 deletions. Restore to `error`
   when that orphan wave lands — `frontend/eslint.config.mjs` L64.
3. The responsive probe has still NOT been run, and this sync owes it again:
   `VideoTrainingBlock.jsx` is a new layout on the video dataset card, and
   `VideoClipLightbox.jsx` gained a sticky header. It needs a live instance
   holding a video dataset, which this container has not got.
4. `docs/screenshots/training/runs-hub.png` and `advanced-options.png` still
   photograph the rental lane (a live pod, `$0.457/h`, "vast.ai console"). Both
   are referenced by `docs/guide/workflow.md`, so deleting is not available —
   they need a re-shoot on a fork instance. Carried from two syncs back.

## Decisions
- **`VideoTrainingBlock` is MAINTAINED local-only, not rejected.** The
  restructuring's whole point (the run's dials belong above the button that
  spends them) is local, so the file is carried in upstream's shape the way
  `engineSelection.js` is, rather than the fork keeping its own
  `VideoTrainingSection`. Next sync's surface is smaller for it.
- **Two sub-decisions inside that file, resolved apart from each other:**
  upstream's ternary opening the clip list from a SECOND button is not taken
  (this card has its own ⌄ toggle and would have grown a duplicate), and the
  button keeps *"▶ Train this dataset"* rather than *"▶ Train on this PC"*,
  which only reads correctly beside a second destination.
- **The LM Studio "no install action" call still stands, but half its reasoning
  expired.** A download is not an install — the probed capability is reachability
  of a server the user installs themselves. But models CAN now be fetched from
  LDS, so the note in D1b that said otherwise was corrected rather than kept.

## Traps
- **The one marker-less leftover was found by `ruff`, not by any sweep.**
  `cloud_training._run_payload` gained `video_targets.get(...)` in a hunk that
  did not conflict, and this fork has no `video_targets` import in that file —
  upstream added theirs at line 44, elsewhere. A `NameError` on every video run's
  payload build, invisible to `create_app()` (the name sits inside a function)
  and to both phrase sweeps (it carries no rejected vocabulary at all). **Run
  `ruff check .` immediately after resolving, before believing anything.**
- **A merged route test that 503s is usually the `_video_extra` fixture, not a
  missing extra.** Upstream's new `test_video_caption_model.py` route test
  arrived without `from _video_extra import video_extra_ready`, which the sibling
  its own docstring names has always carried. `av` is in `requirements-ml.txt`
  and `ci.yml` installs only dev + the torch overlay, so it is red on CI too —
  **read `ci.yml` before calling any 503 "environment"**. Carried under D5.
- **Fresh containers arrive mis-identified.** This clone again inherited a vendor
  git identity (name and address both) and `commit.gpgsign=true` with a foreign
  key. Reset all three to the `CLAUDE.md` identity BEFORE the first commit. Do not
  write the inherited address down anywhere tracked — `test_no_personal_data.py`
  catches an email in ANY tracked file, and it caught that very bullet once.
- **The `upstream` remote does not exist in a fresh clone.** Add it and disable
  its push URL (`git remote set-url --push upstream DISABLED_NO_PUSH`).
- **Local `main` can be stale by a whole week.** It sat on `3db8b72`, reading
  404 ahead / 214 behind, while `git ls-remote` named the real head at `d743f5c`
  — one fetch force-updated the tracking ref. Read `ls-remote`, never the
  tracking ref, before believing any count in a fresh container.
- **`download.pytorch.org` is 403 on CONNECT** under this environment's egress
  policy, so the mandatory Torch overlay came from PyPI as `2.13.0+cu130` rather
  than the pinned `2.13.0+cpu` — same version, CUDA build, no GPU present. It is
  not optional: without it ~124 tests silently skip.
- Backend on Linux carries a **71-failure platform floor** (path separators;
  `test_krea_training_bases.py`, `test_comfyui_utils.py` et al). CI's backend job
  is `windows-latest`. Diff against a pre-merge baseline; never read the raw count
  as a verdict. This sync's delta was **zero new**, with two `test_peer_training_
  over_http.py` reds clearing — the xdist flake named in three syncs running.

## Verify
```powershell
.venv\Scripts\python.exe -m pytest backend/tests -q -n 8 --dist loadfile
cd frontend; node --test
.venv\Scripts\python.exe -m ruff check .
cd frontend; npm run lint
```
