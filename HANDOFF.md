# HANDOFF

**Updated:** 2026-08-30 · **Branch:** main · **Base:** a56bcadd · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `db4ce6b8` — 0 behind, all gates green
on the tree pushed. The window was **59 commits** and carried two large waves at
once: a second local LLM provider, and the local half of a video-training push.

## Done this session
- Merged upstream `71a37552..db4ce6b8` — ten content-conflict regions, five
  `modify/delete`s, resolved per hunk — `50d02bc5`
- **Adopted: LM Studio beside Ollama** (provider seam `vision_llm`, driver
  `vision_lmstudio`, `lmstudio_control`, `local_llm` routes, fence adapter,
  `localLlm.js`). In scope by Divergence 1b — it answers on `127.0.0.1:1234`
  with no key and no call off the machine.
- **Adopted: the local video lane** — H3 Ref2V, first-frame i2v, H3 stills from
  an image dataset, video-dataset trigger word, 48+ fps promote counting.
- **Adopted: Setup stops gating on Ollama** — `ollamaGateReason` + skip panel.
- **Rejected (D4): the rented-pod video lane** — `cloud_video_training.py`, its
  two suites, `VideoDatasetCloudPanel.jsx` and its card slot, the GPU-tier
  picker and its What's-new entry.
- **Rejected (D10): `help/topics/settingsFields.js`** — its five new LM Studio
  rows hand-ported into the one registry (**308 topics / 14 tips**).
- Changelog row, a new D1b second-instance section, and a new D4 subsection for
  the retry-path recurrence — `FORK_NOTES.md`
- `build(frontend):` dist rebuild — `a56bcadd`

## Open
1. Fork-only controls still carry emoji while upstream's use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`) — a wave of its
   own (D3). Unchanged by this sync.
2. `no-unused-vars` is at `warn` (D9): **20 warnings, identical to the pre-merge
   baseline** — all pre-existing orphans of D1/D4 deletions. Restore to `error`
   when that orphan wave lands — `frontend/eslint.config.mjs` L64.
3. The responsive probe has still NOT been run. This sync changed
   `VideoDatasetsPanel.jsx` layout (a stills-from-dataset button was added to
   the header row), so it is owed and still unpaid — it needs a live instance
   holding a video dataset, which this container has not got.
4. `docs/screenshots/training/runs-hub.png` and `advanced-options.png` still
   photograph the rental lane (a live pod, `$0.457/h`, "vast.ai console"). Both
   are referenced by `docs/guide/workflow.md`, so deleting is not available —
   they need a re-shoot on a fork instance. Carried from the previous sync.

## Decisions
- **LM Studio is a local capability, so it is in scope.** The reading is the one
  that took Krea 2: D1 forbids CLOUD engines, not second engines. `LMSTUDIO_API_KEY`
  joining `SECRET_KEYS` is a privacy fix — upstream had it as a plain config
  field returned verbatim by `GET /api/settings`.
- **No LM Studio install action, deliberately.** Upstream documents why in
  `setup_installer.py`: no working progress endpoint on 0.4.23, so an action
  would be a multi-GB fetch with no progress and no cancel. Survives
  `test_every_capability_the_app_probes_can_be_installed_from_setup`. Do not
  "fix" this by inventing one.
- Kept the fork's `PROVEN_ON` wording ("trained end to end **elsewhere**") while
  adopting upstream's new `minimax_h3_ref2va: 'cloud'` map entry — resolved
  inside one hunk, not by taking a side.

## Traps
- **Three leftovers merged with ZERO conflict markers, and the phrase sweep found
  none of them.** The finder was grepping the identifiers of the files just
  deleted, plus `ruff`:
  1. `cloud_training._maybe_auto_retry` grew an `if crd.is_video(run):` branch
     doing `from . import cloud_video_training` — function-local, so `create_app()`
     never reaches it and `ruff` cannot resolve it. `ImportError` on the first
     video retry.
  2. `useSetupSteps.OLLAMA_SKIP_KEPT` listed a rented-GPU training lane and the
     three removed image engines in a column headed by what this build KEEPS.
  3. `from ..extensions import db` orphaned in `video_datasets.py` once the cloud
     routes were rejected (D19 shape; caught by `ruff`).
  **A dormant cloud module is not a safe one** — carrying upstream's shape stops
  at the line where it imports something this fork deletes.
- **Fresh containers arrive mis-identified.** This clone again inherited a vendor
  git identity (name and address both) and `commit.gpgsign=true` with a foreign
  key. Reset both to the `CLAUDE.md` identity BEFORE the first commit. Do not
  write the inherited address down anywhere tracked — `test_no_personal_data.py`
  catches an email in ANY tracked file, and it caught this very bullet once.
- **The `upstream` remote does not exist in a fresh clone.** Add it and disable
  its push URL (`git remote set-url --push upstream DISABLED_NO_PUSH`).
- **Local `main` can be unrelated history.** `origin/main` had been force-updated;
  `git merge-base main origin/main` returned EMPTY. Realign to `origin/main`
  before believing any ahead/behind count.
- **`.gitignore`'s `frontend/node_modules*/` has a trailing slash**, so it ignores
  the directory but NOT a symlink of that name — `git add -A` will stage one.
- Backend on Linux carries a **72-failure platform floor** (path separators;
  `test_krea_training_bases.py`, `test_bank_sort_exclude.py` et al). CI's backend
  job is `windows-latest`. Diff against a pre-merge baseline; never read the raw
  count as a verdict. This sync's delta was **zero** — same 72 tests, and passes
  went 8148 → 8265.

## Verify
```powershell
.venv\Scripts\python.exe -m pytest backend/tests -q -n 8 --dist loadfile
cd frontend; node --test
.venv\Scripts\python.exe -m ruff check .
cd frontend; npm run lint
```
