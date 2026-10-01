# Plan brief

Input for the planning session (Claude Fable 5.1). The planner turns this brief
into `PLAN.md`. Another model (Grok 4.7) then executes the plan, and a Claude
model reviews each wave's diff against it. Write `PLAN.md` so an executor can
work from the repository alone, with no access to the conversation that
produced this brief.

Read AGENTS.md and the rules it links before planning. They still apply.

## How the plan must be written

- One wave = one concern, one branch, one reviewable diff. Waves that touch
  the same files run in sequence, not in parallel.
- Each wave states:
  - what changes or is removed (files, tests, docs);
  - what must keep working;
  - the exact verification commands;
  - when it is done (gates green, required docs updated, bundle rebuilt).
- Write the non-obvious traps into the wave itself. Do not rely on the
  executor to find them. Known traps: the Bank/Dataset shared contract, the
  outbound-traffic inventory (`backend/tests/test_fork_outbound_gate.py`),
  `fork-plugins.json`, setup probes for optional packages, the Divergence 5
  test patches, CRLF files, and keeping source and `frontend/dist` in
  separate commits.
- Commits use the configured Git identity and carry no AI attribution.
- Nothing lands on main until the wave's gates pass.
- UI waves need the responsive probe on populated isolated fixtures, at
  portrait, landscape, tablet and desktop sizes (AGENTS.md "Validation"),
  then a `frontend/dist` rebuild committed as `build(frontend): ...`.
- Each user-visible change gets a What's New entry. Keep existing What's New
  IDs, config keys and catalog labels.

## Starting point

- Main is `f3815e82e`. Branch `integrate/2026-10-01` (`15aa9858b`) holds three
  merged branches, the superseded caption-note fix and three test fixes. It
  needs one gate run at its HEAD, then a fast-forward of main, then the
  deletion of `fix/config-isolation`, `fix/settings-copy-restore`,
  `noble/bank-queue-stop` and `integrate/2026-10-01`. See HANDOFF.md.
- The plan starts after that landing.

## 1. Detach from upstream

- Decide on the 16 upstream/v2 commits after `d13337cc3` one by one:
  cherry-pick or skip. Candidates to take: Bank edit history with undo and
  before/after (`19f13edaa`), persistent dataset comparison (`1e520ab1f`), H3
  plugin startup recovery and superseded model download revisions
  (`16510a496`). Likely skips: the monthly support message, the API batch
  limit change (the fork has no API engines).
- Tag the result as the fork's own first release, through the release
  workflow.
- Keep `upstream` as a fetch-only remote for occasional cherry-picks. There is
  no sync obligation after this.
- Rewrite the sync-centred guidance: AGENTS.md upstream sections,
  `docs/UPSTREAM_SYNC.md`, the `sync-lds-fork` skill, and FORK_NOTES.md (reduce
  it to a short history).
- Open from HANDOFF.md: `.github/workflows/ci.yml` triggers push CI on `v2`
  only. Point it at `main` or make CI dispatch-only on purpose. GitHub Actions
  is currently blocked by billing.

## 2. Cut unused code, then make the tests faster

### Remove
- Code kept only so that syncs stay conflict-free: the switched-off store,
  `legacy_cloud_recovery`, the excluded `api_engines` and `cloud_training`
  plugins, the held `civitai_publish`, the dormant `worker_url` plumbing (D6),
  upstream's nightly-branch flow (D11), the Divergence 5 patches on upstream
  test files.
- Docker. The user will never use it: Dockerfiles, compose files, the
  `update-docker*` launchers, their tests, the `docker-smoke` CI job, Docker
  paths in Setup and the docs.

### Ask first
- Enabled plugins and providers stay until the user confirms which ones they
  use: camera_angles, canvas, dlss5, hf_publish, image_upscale, live,
  model_tools, qwen_dataset, resource_monitor, scrape, seedvr2, video, the
  local LLM providers, the two-lane `start.bat`. The phone workflow stays (it is
  a supported workflow in AGENTS.md).

### Test speed
- Measure before optimising: `pytest --durations=50` and per-file timings for
  the host suite, the bundled-plugin suites and `npm test`.
- Removing a feature removes its tests. Tests of kept features stay; target the
  slowest files (full `create_app()` per test, subprocess waits, timeouts).
- Fix the parallel-run isolation gap: `test_static_mime_types.py` and
  `test_bank_pass_write_lock.py` call `create_app()` without their own
  `LDS_PLUGINS_DIR`, so xdist workers collide on the plugin admission lock when
  that variable is set for the run. Redirect `LDS_PLUGINS_DIR` and
  `LDS_EXTENSIONS_DIR` in the autouse isolation fixture (HANDOFF item 11).
- Record before/after timings in HANDOFF.md.

## 3. UI consistency

Source: user screenshots, 2026-10-01.

### Global: one type scale, one control size
- Too many font sizes. JSX alone uses 16 distinct sizes, 9 of them arbitrary
  (`text-[0.8125rem]`, `text-[0.5rem]`, `text-[0.78rem]`, ...). Define a type
  scale of 4 or 5 steps and migrate the whole app to it.
- Controls that share a row share a height: inputs, buttons, selects. Define
  one desktop control height and one touch height (AGENTS.md: finger-sized
  targets). Use shared Button/Input/Select styles instead of per-site classes.
- Known mismatches: Bank Browse vs Create bank; the bank Name vs Folder
  inputs; the small "Find a bank" search vs Rescan folders vs Select Banks; the
  sidebar Sort select vs the "Small tiles" button.

### Ellipses: remove every one
- No ellipsis characters anywhere the user can read them: button labels
  ("Queue all N bank(s)…"), placeholders ("Find a bank…", "Find a
  dataset…"), loading states ("Retrying catalog…"), menu triggers ("Backup
  ···"), help topics, guides and What's New text.
- 547 lines in 214 frontend source files contain "…" (many are code comments;
  comments may stay). Also check `docs/` guides that the app renders.
- A loading state keeps a visible signal without the ellipsis: a spinner or a
  plain verb ("Retrying").
- Update source-regex tests that pin the old strings.

### Datasets library (`frontend/src/components/dataset/DatasetListPanel.jsx`)
- Columns at full desktop width: S = 5, M = 4, L = 3. Today S = 1/2 (list
  rows), M = 2/3/4, L = 1/2 (around lines 117 and 706).
- Narrower viewports step down. No horizontal scroll, no clipped actions.
- Pagination, aligned with the Bank list below (same control, same page-size
  behaviour, same wording).

### Bank page (`frontend/src/pages/BankPage.jsx`)
- Create form: remove the nested container (a box inside a box) around Name and
  Folder. Lay the fields directly in one section.
- List toolbar: search, sort and Select Banks share one full-width row with
  equal control heights; search takes the remaining width (around lines
  770-787).
- Bank card:
  - Merge the Kept/Undecided/Rejected line and the Quality line into one row.
  - Put Open and Launch all on the same row as the pass icons.
- Pagination instead of endless scroll (today one
  `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` list, around line 824). Reset to
  page 1 when search, sort or filters change. Selection mode must still work
  across pages (say what "select all" covers).

### Bank workspace sidebar (`frontend/src/components/bank/BankFilterRail.jsx`, `BankThresholdsPanel.jsx`)
- Too much going on. Remove help text that is always on screen, for example the
  paragraph under MEDIUM about "unsure" results and the note under Filter
  thresholds. Move anything still needed into a tooltip or the help topic.
- Apply the global type scale and control sizes: section labels, filter chips,
  the "Measure N missing angles" button, the threshold accordions, Save, and
  the VIEW row (Sort select vs "Small tiles").
- Check the Dataset workspace's equivalent rail for the same changes (AGENTS.md
  Bank/Dataset parity).

## Open review notes to schedule (low severity, from HANDOFF.md)

- `backend/app/capabilities.py:54`: a JoyCaption "ready" verdict is cached for
  24 h.
- `frontend/src/pages/BankPage.jsx:590`: ✕ on a stale 2 s queue snapshot can
  cancel a just-started run without the running-row confirm.
- `frontend/src/index.css:346`: on touch, the 40 px tile action strip blocks
  tap-to-select.
- `backend/app/services/image_bank_service.py:3052`: the bank list payload
  drops `counts`, `blocked` and `superseded_at`, so list tiles never show the
  caption note and judge "blocked" from prose.
