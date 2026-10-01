# PLAN.md — detach, prune, tighten

Execution plan for the fork. Written 2026-10-01 from a read-only inventory of
the tree at `ca7364a51` (branch `integrate/2026-10-01`). It is complete on its
own: an executor needs this file, AGENTS.md and the repository, nothing else.

## How to work this plan

- Read AGENTS.md and the rules it links first. They apply to every wave.
- One wave = one branch named `wave/<id>` off `main`, one reviewable diff.
  Waves marked **sequential** share files with the previous wave and start
  only after it lands. Everything else may run in parallel.
- A wave is done when every item under its **Done when** holds. The reviewer
  checks the diff against that list, not against the executor's summary.
- Commits use the configured Git identity and carry no AI attribution lines.
- Source and `frontend/dist` are separate commits: source commits first, then
  one `build(frontend): ...` commit per wave when `frontend/src`, `bundled/*/frontend`
  or `docs/guide` changed (the guide is bundled into the app).
- Nothing lands on `main` until the gates (Wave 1 defines the script) are green
  for the exact HEAD, run in a cloud task, not on the user's machine, unless
  the user allows a local run for that wave. Docker is out of scope everywhere.
- Every user-visible change gets a What's New entry in
  `frontend/src/whatsNew.js` (shape documented at the top of that file: `id`
  `YYYY-MM-DD-slug`, `date`, benefit-first `title`, `blurb`, optional `to`).
  Never edit or reuse an existing `id`.
- Stable identifiers: config keys, catalog labels, What's New ids and
  localStorage keys stay or get an alias (`WITHDRAWN_ID_ALIASES` in
  `whatsNew.js` is the pattern for ids).
- UI waves need the responsive probe (`.claude/rules/frontend-contracts.md`
  describes it): `cd frontend && npm run probe:responsive -- --url http://127.0.0.1:5173/#/<route>`
  against an isolated, populated instance:
  `LDS_PORT=5051 LDS_DATA_DIR=<scratch> LDS_CONFIG=<scratch>/config.json LDS_ENV=<scratch>/.env LDS_PLUGINS_DIR=<scratch>/plugins LDS_EXTENSIONS_DIR=<scratch>/ext python backend/run.py`
  plus `LDS_DEV_API_TARGET=http://127.0.0.1:5051 npm run dev`. Seed it with
  `python scripts/seed_showcase.py --data-dir <scratch> --images <folder-per-identity> --init`
  (synthetic images are fine). Exit code 2 means the probe did not run; that
  is not a pass. Fix violations by changing the UI, never the thresholds.
- Record every unfinished item and every measured number in HANDOFF.md at the
  end of each wave.

## Decisions the user has made

- Detach from upstream. `upstream` stays a fetch-only remote for occasional
  cherry-picks. No sync obligation.
- Docker is never used: remove it entirely.
- Remove every ellipsis character from anything the user can read, including
  help pages and What's New text.
- Datasets library and Bank list get the same pagination control.
- The plugin store, `legacy_cloud_recovery`, the nightly-flow prose and the
  upstream-sync machinery go.

## Decisions still open (ask before the wave that touches them)

| Item | Default if no answer | Wave |
|---|---|---|
| `bundled/civitai_publish` (held, 2.8k LOC, never enabled) | remove | 12 |
| Cloud/API compatibility shims in `backend/lds_sdk` (`cloud_live.py`, `cloud_reference.py`, `cloud_video_training.py`, `cloud_host/`, `api_engines.py`) | keep | 12 |
| Any of the 12 enabled plugins | keep all | 12 |
| `docs/guide/runpod.md` (depends on `Dockerfile.gpu`) | remove with Docker | 2 |

## Facts the plan relies on

- Main is `f3815e82e`. `integrate/2026-10-01` holds three merged branches plus
  fixes; see HANDOFF.md for the gate history.
- The fork's own releases are `v2026.08.02.1` and `v2026.08.05F`. The
  `v2026.09.*` tags are upstream's. `backend/app/version.py` says
  `APP_VERSION = '2026.09.26+fork'`.
- `.github/workflows/ci.yml:12` runs push CI only for `v2`; the fork has no
  `v2` branch. `backend/tests/test_no_personal_data.py:148` scans unpushed
  commits over `origin/v2..HEAD`, so that check has always skipped here.
- GitHub Actions is currently blocked by billing. `release.yml` (tag push)
  cannot run until that is fixed; `packaging/build_release_zip.ps1` is the
  local equivalent of its build step.
- `scripts/upstream_sync.ps1 -Phase Gates` is today's landing gate
  (AGENTS.md). Its Quick/Gates phases are the only parts the fork still needs.
- `worker_url` (FORK_NOTES Divergence 6) is NOT dead: it is the live
  Settings → Devices → Remote ComfyUI backends feature
  (`backend/app/services/backend_worker.py`, `routes/cluster.py:213-270`).
  Do not remove it in any wave.
- Divergence 5 "patches on upstream test files" are what keep those tests
  green on this fork. After detaching they are simply the fork's tests. Only
  the documentation of them is removed; never revert the patches.
- `frontend/src/components/common/controls.js` already defines the control
  size scale (`controlHeight`: sm `min-h-10 lg:min-h-0 lg:h-7`, md `lg:h-8`,
  lg `lg:h-9`; `btnClass`, `fieldClass`). Only 5 files use it.
- `frontend/tailwind.config.js:37-44` defines `text-2xs` (11px) and documents
  the intended type scale: 2xs 11 · xs 12 · sm 14 · base 16 · xl 20 · 2xl 24.

---

## Wave 0 — land the integrate branch (sequential, first)

**Goal.** Main reflects the merged work so every later wave starts from it.

**Steps.**
1. Run the full gate set at the branch HEAD in a cloud task (see Wave 1 for
   the commands; until Wave 1 lands, run `scripts/upstream_sync.ps1 -Phase Gates`
   or the equivalent command list in HANDOFF.md). Install the two requirement
   files in two separate `pip install` commands; one combined command fails
   because the torch overlay's `--index-url` replaces PyPI.
2. If green: `git checkout main && git merge --ff-only integrate/2026-10-01 && git push origin main`.
3. Delete `fix/config-isolation`, `fix/settings-copy-restore`,
   `noble/bank-queue-stop`, `integrate/2026-10-01` on origin and locally.
4. Update HANDOFF.md.

**Done when.** `origin/main` == the gated HEAD; the four branches are gone;
HANDOFF.md records the gate results (counts, skips, and that Docker was not run).

---

## Wave 1 — detach from upstream

**Goal.** The repository stops assuming a sync loop, has a working landing
gate of its own, and is tagged as its own release line.

### 1a. Pick from the 16 unmerged upstream commits (`d13337cc3..upstream/v2`)

| Commit | Take? | Notes |
|---|---|---|
| `19f13edaa` feat(bank): edit history, undo, before/after | yes | `frontend/src/help/topics/actions.js` does not exist here (Divergence 10: one help registry file). Put the help topic into `frontend/src/help/helpRegistry.js` by hand. Fork versions of `BankEditPanel.jsx`, `BankReviewLightbox.jsx` differ slightly; resolve by hand. |
| `3658f9766` changelog ordering after bank history | yes, with the above | What's New ordering only. |
| `1e520ab1f` dataset comparison mode persists while navigating | yes | `DatasetLightbox.jsx` differs by ~22 lines from upstream here. |
| `16510a496` + `7df8eaf8b` plugins: accept superseded model download revisions (the "H3 startup fix") | yes | `backend/app/plugins/api.py` + test + What's New. |
| `af799647d` test doubles with progress callbacks | only if the fork's tests fail after the picks above | Test-only. |
| `4b902f150` remove API batch limit | no | The fork has no API engines. |
| `bd0c3c8b9`, `95d8702a7` Patreon support message / link | no | |
| `d61fa0af1` release prep, `fbeecb7f7` `f73ba6dc9` `ba403227b` `4bdddc855` `4bfbf7c48` `fe4697e40` build(frontend) | no | Bundles; rebuild locally instead. |

Cherry-pick with `git cherry-pick -x <sha>` so the origin is recorded. Each
pick gets its own What's New entry only if upstream's entry was not picked.

### 1b. CI and privacy test wiring

- `.github/workflows/ci.yml:12`: `branches: [v2]` → `branches: [main]`.
- `backend/tests/test_no_personal_data.py:148`: `origin/v2..HEAD` →
  `origin/main..HEAD`. Add a test that the range names a branch that exists.
- Remove the `docker-smoke` job from `ci.yml` (lines ~406-447) and the
  Docker comments at ~137-140, 210, 362; `release.yml:178` comment. (Wave 2
  removes the rest of Docker; doing the workflow here keeps `ci.yml` edits in
  one wave.)

### 1c. A landing gate that is not a sync script

Create `scripts/gates.ps1` with two phases, copied from
`scripts/upstream_sync.ps1` `Invoke-Quick` (lines ~368-384) and `Invoke-Gates`
(~386-408) including `Invoke-IsolatedValidation` (~95-114), which clears the
`LDS_*` variables and points `LDS_DATA_DIR`, `LDS_CONFIG`, `LDS_ENV`,
`LDS_PLUGINS_DIR`, `LDS_EXTENSIONS_DIR` at a scratch tree:

- `-Phase Quick`: `ruff check .`; `npm run lint`; `npm run build`;
  `python -X utf8 scripts/sync_smoke.py` (rename to `scripts/startup_smoke.py`,
  keep its `LDS_SYNC_SCRATCH` requirement under a new name `LDS_GATES_SCRATCH`);
  the 8-file pytest preflight; `npm test`.
- `-Phase Gates`: Quick, then one pytest process per `bundled/<plugin>/tests`
  with `-p no:flask --basetemp <scratch>/p-<plugin>`, then
  `python -X utf8 -m pytest backend/tests scripts/tests -q -rf -n 8 --dist loadfile --basetemp <scratch>/pt --durations=50`.
- Drop the attribution grep "Gate 7" only if `backend/tests/test_no_personal_data.py`
  already covers attribution; otherwise keep it as a plain check without the
  `-ReviewedAttribution` switch.
- Port the relevant cases of `scripts/tests/test_upstream_sync_driver.py` to
  `scripts/tests/test_gates_driver.py`; delete the rest with the old script.

### 1d. Delete the sync machinery

- `scripts/upstream_sync.ps1`, `docs/UPSTREAM_SYNC.md`,
  `docs/V2_INCOMING_COMMITS.md`, `docs/V2_MIGRATION_PREP.md`,
  `docs/V2_SOURCE_CONFLICTS.md`, `scripts/tests/test_upstream_sync_driver.py`.
- Fix the links: `docs/README.md:44`, `CONTRIBUTING.md:74-75,177`,
  `AGENTS.md:32`, FORK_NOTES references.
- AGENTS.md: rewrite "Upstream synchronization" (line 32), the Gates line
  (123) to name `scripts/gates.ps1`, line ~151 (`upstream` read-only stays as
  one sentence), and delete the "Explicit upstream contributions" section
  (166-170). Delete `.claude/rules/release-mechanics.md`'s now-wrong CI line if
  1b changed it.
- FORK_NOTES.md (3,838 lines, 747 KB): keep one short section per divergence
  stating the current rule; delete the merge routine, merge diagnostics
  (~734 lines), the nightly-flow section (2699-2843, 3532-3567), the Divergence
  6 merge cautions (1910-2132, keep a 5-line description of the live feature),
  the Divergence 5 patch-by-patch log (1202-1909; replace with one paragraph:
  "these tests are the fork's; upstream parity is not a goal"). Move the Fork
  changelog (3681-3824, 504 KB) to `docs/history/FORK_CHANGELOG.md` unchanged.
  Target size: under 400 lines.
- The user-level `sync-lds-fork` skill lives outside the repo; note in
  HANDOFF.md that it is obsolete.

### 1e. Tag the release line

- `backend/app/version.py`: `APP_VERSION = '2026.10.01+fork'` (keep the
  `+fork` local segment: the plugin host-requirement parser needs a PEP 440
  version, see the comment in that file).
- Annotated tag `v2026.10.01` on the landed main. `release.yml` will not run
  while Actions is blocked; build the ZIP with
  `packaging/build_release_zip.ps1` and attach it to a GitHub release by hand
  (that is a GitHub write: the user does it, or authorizes it explicitly).
- `frontend/scripts/releaseNotes.mjs` builds the body from What's New entries
  added since the previous tag; a tag that would announce nothing fails
  (`[no-notes]` in the tag message is the documented escape).

**Verify.** `scripts/gates.ps1 -Phase Gates` green in a cloud task;
`scripts/check_release_artifacts.py`; `node frontend/scripts/releaseNotes.mjs`
(or its documented invocation) produces a non-empty body.

**Done when.** The four cherry-picks are in with tests; `ci.yml` triggers on
`main` and has no Docker job; `test_no_personal_data` unpushed check targets
`origin/main`; `scripts/gates.ps1` exists, is documented in AGENTS.md and
HANDOFF.md, and `upstream_sync.ps1` is gone; FORK_NOTES.md < 400 lines with
the changelog moved; the tag exists locally and is pushed.

**Traps.** The cherry-picks touch `whatsNew.js`; keep ids. `git cherry-pick`
of a commit that includes `frontend/dist` files: use `-n`, unstage `dist`, then
commit; rebuild dist yourself. `test_fork_outbound_gate.py::test_the_upstream_comparison_is_gone`
stays; it guards a Divergence 12 rule, not the sync.

---

## Wave 2 — remove Docker (parallel with 1 after 1b lands; sequential with 1 on `ci.yml`)

**Remove outright.**
- Root: `Dockerfile`, `Dockerfile.gpu`, `.dockerignore`, `docker-compose.yml`,
  `docker-compose.gpu.yml`, `docker-compose.external-comfy.yml`,
  `docker-compose.ollama-gpu.yml`, `docker-compose.ollama-host.yml`,
  `docker-compose.ollama-sidecar.yml`, `configure-docker.bat`,
  `start-docker.bat`, `start-docker-gpu.bat`, `update-docker.bat`,
  `update-docker-gpu.bat`.
- `scripts/docker-launch.ps1`, `scripts/docker-launch-inspect.ps1`,
  `scripts/docker-ollama-mode.ps1`, `scripts/update-docker-gpu.ps1`,
  `scripts/configure-external-comfy.ps1`.
- `packaging/docker/` (4 files).
- `frontend/src/components/common/DockerUpdateInstructions.jsx`.
- Tests: `backend/tests/test_docker_config.py`,
  `test_docker_external_comfy_helper.py`, `test_docker_gpu_launcher_contract.py`,
  `test_docker_gpu_updater.py`, `test_docker_launch_inspect.py`,
  `test_docker_launcher_fake_e2e.py`, `test_docker_ollama_mode.py`,
  `test_docker_seed_config.py` (113 tests); `frontend/src/components/settings/dockerModeUi.test.js`.
- Docs: `docs/guide/docker.md`; `docs/guide/runpod.md` (default: remove, see
  open decisions); README.md sections 1024-1066 (Options 3/4), lines 541-544,
  926-927, 944-945, 1079, 1107; `docs/guide/installation.md:62-105,119,139-140`;
  Docker mentions in getting-started, troubleshooting, settings-reference,
  requirements, migrate-to-v2, extensions, getting-help, known-limitations,
  using-the-app, `docs/README.md`, `MOBILE_WORKFLOW.md`, `CONTRIBUTING.md`,
  `.claude/rules/readme-and-docs.md:12-15` (rewrite the example without Docker).

**Edit, keep the file.**
- `backend/app/capabilities.py`: `_DOCKER_OLLAMA_URLS` (~1442), the
  `LDS_RUNTIME`/`LDS_DOCKER_COMFY_MODE` branch (~1473-1572),
  `setup_is_docker_runtime` (~1482), `docker_runtime`/`docker_host_url` (~2770).
- `backend/app/routes/setup.py:40-62` (`PUT /ollama-deployment`, Docker-only)
  and lines 32, 95-98; `routes/setup_state.py:48-51`;
  `routes/settings.py:174,625-715`; `services/updater.py:36-66,97-99,729`;
  `plugins/routes.py:5,50-51`; `backend/supervise.py:14-39` (keep the exit-75
  restart contract, drop the Docker wording).
- Frontend: `App.jsx:19,465-515`, `pages/SetupPage.jsx` (35 hits),
  `hooks/useSetupSteps.js`, `hooks/setupHealth.js`,
  `components/setup/SetupHealthNotice.jsx`, `components/settings/MaintenanceSection.jsx`,
  `ServerSection.jsx`, `LocalToolsSection.jsx`, `updateStatus.js`,
  `utils/comfyRecovery.js`, `help/helpRegistry.js` (2 topics).
- Shared tests with Docker cases: `test_setup_routes.py` (4), `test_settings_api.py` (2),
  `test_updater.py` (1), `test_install_runtime_compatibility.py`,
  `test_supervise.py`, `test_setup_core_completion.py`,
  `test_dev_requirements_contract.py`, `test_local_llm_router.py`,
  `test_setup_installer.py`; frontend `setupManagedRuntime.test.js`,
  `setupHealth.test.js`, `SetupPage.contract.test.js`, `useSetupSteps.test.js`,
  `updateStatus.test.js`, `frontend/tests/local-llm-provider-contract.test.mjs`.
- Config key `ollama.deployment_mode` ('none'|'host'|'docker'): keep the key,
  drop the `docker` value; migrate stored `docker` → `host` on read. Update
  `docs/guide/settings-reference.md`.
- `backend/tests/fork_outbound_inventory.json:523` (`packaging/docker/healthcheck.py`):
  regenerate with `.venv/Scripts/python.exe backend/tests/fork_outbound_scan.py --write`
  after reviewing the diff. `fork_outbound_scan.py:49` (`host.docker.internal`
  as local) can stay or go.
- `packaging/release_bundle.py` / `scripts/check_release_artifacts.py`: remove
  Docker file references if any; run `scripts/tests/test_release_bundle.py`.
- `whatsNew.js` (4 mentions) stays as history; add one new entry: "Docker
  support removed; the app targets a direct install".

**Done when.** `rg -i docker` over tracked files (excluding `frontend/dist`,
`whatsNewArchive.js`, `whatsNew.js`, `docs/history/`) returns only the new
What's New entry and `host.docker.internal` if kept; gates green; probe at
`#/setup` clean at the five sizes.

---

## Wave 3 — remove the plugin store

**Switch.** `backend/app/plugins/store/client.py:55` `store_switched_off()`
returns `True`; the whole store is dead code behind it.

**Remove.**
- `backend/app/plugins/store/` (8 files, 1,362 LOC) and its mount at
  `backend/app/plugins/routes.py:330-331`.
- `frontend/src/pages/store/Administration.jsx`, `Catalog.jsx`, `Library.jsx`,
  `PluginAvatar.jsx`, `PluginCard.jsx`, `Presentation.jsx`, `catalogModel.js`,
  `catalogModel.test.js`. **Keep** `PluginPreparation.jsx` and `preparation.js`
  (used by `pages/pluginSettingsGroups.jsx:10` for plugin component
  preparation); move them to `frontend/src/pages/plugins/`.
- `store/` directory (`bootstrap.json`, `public-root.json`, `tools/`),
  `packaging/release_bundle.py:30-42` `PUBLIC_STORE_FILES` and the matching
  asserts in `scripts/tests/test_release_bundle.py:43,63`.
- Tests: `backend/tests/test_public_store_commerce.py`, `test_public_store_media.py`,
  `test_public_store_plans.py`, `test_public_store_service.py`,
  `test_public_store_transport.py`, `test_public_store_tuf.py`,
  `test_private_plugin_sources.py`, `test_store_catalog_extensions.py`,
  `public_store_fixtures.py`; `conftest.py:109-124` (`_STORE_MACHINERY_SUITES`
  and `_store_machinery_under_test`).
- `docs/plugins/private-catalogs.md`; "Plugins → Store" text in `README.md:68,1071`,
  `docs/guide/installation.md:5,7,111`, `requirements.md:28`, `migrate-to-v2.md:18`,
  `getting-started.md:193`, `settings-reference.md:44-48` (Purchases tab),
  `packaging/README.md:9`, `docs/plugins/README.md:57`, `packaging-guide.md:6,61`.
  Screenshots `docs/screenshots/plugins/public-store-*.png`.
- Upstream publishing tooling that only serves the store:
  `scripts/check_public_history.py`, `scripts/install_public_push_guard.py`,
  `scripts/private_plugin_pre_push.py`, `scripts/public_port_manifest.py`,
  `scripts/tests/test_public_history.py` (48 tests). Keep
  `scripts/private_plugin_policy.py` only if `frontend/scripts/privatePluginBuild.mjs`
  still needs it after the build-mode cleanup below.

**Edit.**
- `frontend/src/pages/PluginsPage.jsx` (408 LOC): remove the Catalog, Library,
  Administration and Purchases tab imports and the `/api/plugins/store/*`
  calls (lines 8-12, 34, 85, 116, 128, 270-331). It must still list installed
  plugins (today `<Catalog installed={plugins}>` at ~321 renders them) and
  still learn admin status (today `can_manage` comes from the catalog route).
  Add `can_manage` to an existing plugins route (`/api/plugins`) and render the
  installed list with a small local component.
- `frontend/src/components/setup/SetupStart.jsx:55` (`journeyProducts` calls
  the catalog): drop the "plugins" goal's store fetch.
- Build mode: `frontend/vite.config.js:58-111` (`storeBuild`),
  `frontend/scripts/privatePluginBuild.mjs` (store fallback),
  `backend/app/plugins/fork_profile.py:16,24,34,41`, tests
  `frontend/scripts/forkPluginBuild.test.mjs:33`, `backend/tests/test_fork_plugin_profile.py:86`.
  The `fork` distribution becomes the only one; `plugin-build.json` keeps
  `"distribution":"fork"` so existing installs read the same value.
- **Keep** `backend/app/plugins/official.py` receipts under `data/plugin-store/`
  (paths of existing user data) and `LDS_PLUGIN_ADMIN_TOKEN` (shared with ZIP
  install). Env vars `LDS_STORE_CONFIG`, `LDS_STORE_COMMERCE_CONFIG` go.
- `backend/tests/test_fork_outbound_gate.py`: remove the two store routes from
  `PAGE_LOAD_ROUTES` (118-119) and delete
  `test_the_plugin_store_switch_is_hardwired_off` (135-150). Regenerate the
  inventory (`fork_outbound_scan.py --write`) and review: the two store
  entries (lines 43-50) disappear, nothing else may change.
- FORK_NOTES Divergence 12 text about the store; `whatsNew.js` entries stay
  (history), one new entry announces the removal.

**Done when.** `rg -n "plugins/store|store_switched_off|STORE_OFF|LDS_STORE_"`
over backend, frontend/src, scripts, docs is empty (except history files);
`#/plugins` still lists installed plugins and the admin panel still appears for
an admin token; gates green; probe at `#/plugins` clean.

---

## Wave 4 — remove `legacy_cloud_recovery` and `ensure_pillow_consistent`

- Delete `backend/app/services/legacy_cloud_recovery.py` (57 LOC) and
  `backend/tests/test_legacy_cloud_recovery.py` (9 tests).
- `backend/app/services/cloud_training.py` lines ~2344, 3031, 3821, 4776: each
  `from .legacy_cloud_recovery import recovery_only` plus its 2-6 line guard
  goes; the guarded code runs unconditionally the way it already does
  (`recovery_only()` is always `False` because `start()` is never called).
- `backend/bootstrap_dependencies.py:119-146` `ensure_pillow_consistent`: delete.
  **Keep** `incompatible_pillow_plugins` (line 78; used by `backend/run.py:57,64`
  and `routes/settings.py:954-955`).
- `backend/tests/test_bootstrap_dependencies.py`: 7 of 10 tests call
  `ensure_pillow_consistent` and are the only coverage of the detector.
  Rewrite them to call `incompatible_pillow_plugins` directly; do not delete.
- `backend/tests/test_fork_outbound_gate.py::test_startup_neither_resumes_rentals_nor_runs_pip`
  (153-162): keep the `incompatible_pillow_plugins()` assertion, drop the
  `legacy_cloud_recovery.start` one. Comments: `backend/app/__init__.py:1065-1066`,
  `run.py:62`, `start.bat:93`.
- FORK_NOTES 2899-2905, HANDOFF.md.

**Done when.** `rg legacy_cloud_recovery|ensure_pillow_consistent` is empty
outside history; gates green.

---

## Wave 5 — test isolation and speed (sequential after 2-4)

**Isolation.**
- `backend/tests/conftest.py::_isolate_user_state` (278-315): also set
  `LDS_PLUGINS_DIR=<tmp>/isolated-plugins` and `LDS_EXTENSIONS_DIR=<tmp>/isolated-extensions`.
  Do **not** set `LDS_PLUGIN_DISTRIBUTION` or `LDS_BUNDLED_DIR` globally; that
  would change what the 9 direct `create_app()` callers boot.
- Add two cases to `backend/tests/test_config_isolation.py`: the external
  plugin dir and the extensions dir resolve under tmp, never under the repo.
  Restore `assert not path.exists()` in `test_every_test_reads_an_isolated_config`
  (HANDOFF item 10) and confirm it holds under `-n 8`.
- The six direct `create_app()` callers (`test_static_mime_types.py:74,98`,
  `test_bank_pass_write_lock.py:50`, `test_bank_infer_no_db_lock.py:50`,
  `test_caption_provenance.py:389`, `test_data_integrity_trash.py:53,98`,
  `test_watermarks.py:186`) then inherit isolation; add a one-line comment at
  each naming the fixture so nobody re-adds `LDS_PLUGINS_DIR` by hand.
- Document that these tests boot bundled plugins from the real `bundled/` tree
  when `frontend/dist/plugin-build.json` says `fork` (`loader.py:43-47`,
  `fork_profile.py:37-44`) and from none when dist is absent. Pin the
  expectation in a test or make them set `LDS_PLUGIN_DISTRIBUTION` explicitly.

**Speed.**
- Baseline first, in the cloud task: `--durations=50` from the Gates run, plus
  `node --import ./scripts/registerSdk.mjs --test` wall time. Record both in
  HANDOFF.md.
- Waves 2-4 already drop ~220 backend tests (Docker 113, store 81+48 in
  scripts/tests, legacy 9, sync driver 9).
- Known sleeps to shorten or replace with events: `test_gpu_window_close_race.py:83`
  (6 s), `:98` (7 s), `:190`; `test_vision_features.py:114`; `test_job_queue.py:71,84`;
  `test_training_service.py:1225`; `test_db_write_lock.py:217,250`. Child scripts
  that sleep 30 s / 120 s and rely on a watchdog (`test_image_bank_stop_honesty.py:130`,
  `test_face_mask_preview_survives_a_timeout.py:259`) are fine if the watchdog
  fires fast; measure them.
- Real child processes and sockets (list in HANDOFF.md from the inventory:
  `test_neural_render.py:377,408`, `test_single_instance.py`,
  `test_peer_training_over_http.py:372`, `test_segmented_model_download.py:60`,
  `test_port_utils.py`) stay unless the measurement shows one above 5 s.
- Frontend: 255 source-text tests are cheap; leave them. Duplicated canvas
  tests exist in both `frontend/src/components/canvas/` and `bundled/canvas/tests/`
  with differing content; decide one home and delete the other.

**Done when.** Isolation tests pass under `-n 8` with `LDS_PLUGINS_DIR` set
and unset for the whole run; HANDOFF.md has before/after wall times and the
top-20 durations; no threshold or probe limit was loosened.

---

## Wave 6 — type scale and control sizes (foundation for 7-10)

**Type scale.** Allowed classes in `frontend/src` and `bundled/*/frontend`:
`text-2xs` (11), `text-xs` (12), `text-sm` (14), `text-base` (16),
`text-xl` (20), `text-2xl` (24). Nothing else.
- Replace `text-lg` (28 uses, dialog titles) with `text-base font-semibold`
  or `text-xl` per site; `text-3xl` (3: `GuidePage`, `SetupPage`,
  `DatasetListPanel.jsx:167`) with `text-2xl`.
- Replace every arbitrary size in `src`: `text-[0.8125rem]` (27 sites, list in
  HANDOFF.md from the inventory: `Markdown.jsx:66`, `DatasetWorkspace.jsx` ×6,
  `EngineCard.jsx:41`, `GuidedChecklist.jsx:22`, `PreflightModal.jsx` ×3,
  `TrainingPanel.jsx` ×2, `studio/BlendWeightRow.jsx:21`,
  `studio/StudioGenerationSettings.jsx` ×4, `settings/DevicesSection.jsx:375`,
  `shared/CheckpointGalleryPanel.jsx:293`, `shared/GeneratedImageLightbox.jsx:446`,
  `shared/LockableSlider.jsx:49`, `shared/ZImageLoraConfig.jsx` ×2,
  `pages/GalleryPage.jsx` ×2) → `text-xs` or `text-sm`; `text-[0.5rem]` (9:
  `CheckpointActionsPopover.jsx:55`, `DatasetListPanel.jsx:280`,
  `RunLineageTree.jsx` ×2, `lineageNodes.jsx` ×5) → `text-2xs`;
  `text-[0.85rem]`, `text-[0.78rem]`, `text-[0.95rem]`, `text-[0.8rem]`,
  `text-[0.7rem]`, `text-[0.72rem]`, `text-[0.8125em]` → nearest step.
- Bundled plugins: `text-[0.6875rem]` ×255 → `text-2xs`; `text-[0.625rem]` ×88
  and `text-[0.5625rem]` ×6 → `text-2xs`; `text-[0.75rem]` ×38 → `text-xs`;
  `text-[11px]` ×5, `text-[10px]` ×1 → `text-2xs`. Two tests pin old values:
  `bundled/canvas/tests/canvasResponsive.test.js:324` (`text-[0.75rem]`) and
  `frontend/src/components/videobank/videoDatasetProbeMarkers.test.js:78`
  (`text-[0.625rem]`); update them to the new class.
- `index.css`: `.dataset-tile-badge { font-size: 10px }` (line ~421) → 11px
  via the `2xs` token; header stats `font-size: 11px` (line 63) → use the
  token; keep the `16px !important` iOS anti-zoom rule (line 285, pinned by
  `uxBatchQ.contract.test.js:12-20`).
- Add `frontend/tests/type-scale-contract.test.mjs`: scans `frontend/src` and
  `bundled/*/frontend` for `text-\[` and `text-(lg|3xl|4xl)` and fails on any
  hit, with an allowlist that starts empty.

**Control sizes.** Build on `common/controls.js`; add
`frontend/src/components/common/Controls.jsx` exporting `Button`, `IconButton`,
`Input`, `Select`, `Chip` as thin components over `btnClass`/`fieldClass`/
`controlHeight`. Rules:
- Toolbar and inline controls: size `md` (desktop `h-8`, touch `min-h-10`).
- Primary form rows (create forms, Save/Discard): size `lg` (desktop `h-9`).
- Dense rails and chips: size `sm` (desktop `h-7`).
- Every control on one row uses one size. No `py-*` height hacks on controls.
- Migrate the surfaces this plan touches (Waves 8-10 list them) plus
  `common/FolderPicker.jsx:204-209`, `bank/FolderCheckLine.jsx:29`,
  `shared/TileSizeControl.jsx:18`, `dataset/FullBackupControls.jsx:167`,
  `settings/primitives.jsx` (`INPUT_CLASS`, `SIDE_BUTTON_CLASS` → the new
  components). The remaining ~950 raw `<button>`s are migrated by later waves
  when their file is touched; add a contract test that the files named here
  contain no raw `rounded-md border ... px-` control classes.
- `common/controls.test.js` pins the size tables; extend, don't loosen.

**Done when.** The type-scale contract test passes with an empty allowlist;
`npm run build` warns of no unknown classes; probe clean on `#/bank`,
`#/datasets`, `#/setup`, `#/settings`; What's New entry "Consistent text and
control sizes".

---

## Wave 7 — remove every ellipsis (sequential after 6)

564 `…` (U+2026) in 215 non-test files under `frontend/src`; none use ASCII
`...` in UI strings. Categories from the inventory: ~330 loading/progress
strings, 116 code comments (leave), ~26 action labels, ~28 placeholders, 33
help/What's New prose, 9 toast strings, 5 aria/title, ~15 other.

**Rules.**
- Loading/progress: drop the character, keep the verb ("Loading", "Saving",
  "Checking folders"). Where a spinner component is already present, the verb
  alone is enough; do not add new spinners.
- Action labels that open a dialog ("Scan quality…", "Queue all N bank(s)…",
  "Promote the group…"): drop the character. Do not add "...".
- Placeholders ("Find a bank…", "Find a dataset…", "Choose a dataset…"):
  drop the character.
- Ranges and truncation (`'1 … 9'` in `dupCompare.js:63`, `', …'` in
  `bankUndo.js:66`, `· …and N more` in `ForgetMissingDialog.jsx:93`,
  `RelocateBankDialog.jsx:115`): write "1 to 9", "and N more".
- Prose in `whatsNew.js` (4), `whatsNewArchive.js` (29), `help/helpRegistry.js`,
  and the rendered docs `docs/guide/using-the-app.md` (22),
  `settings-reference.md` (7), `troubleshooting.md` (7), `features.md`,
  `getting-started.md`, `migrate-to-v2.md`, `requirements.md` (1 each): rewrite
  the sentence. What's New `id`s do not change. ASCII `...` inside code spans
  in the docs (`.../v1`, `rollup-<platform>-...`) stays.
- `frontend/src/components/bank/bankSurfaceInventory.js` is a frozen fixture
  with four `…` entries (L18, L30, L37, L583); update the fixture and the
  contract test together.
- ~81 test assertions in ~49 files pin the old strings (list in the inventory:
  `uxBatchQ.contract.test.js:69,79`, `bank-list-folder-freshness.test.mjs:44`,
  `library-backup-menu-contract.test.mjs:42`, `queue-split-ui.test.js:93`,
  `bankProbeMarkers.test.js:142`, `BankOverviewLayout.contract.test.js:167-170`,
  `FolderPicker.test.js:15`, `fullBackup.test.js`, `launchProgress.test.js`,
  `canvasResponsive.test.js:235,239`, `StopButtonWording.test.js:79`, and the
  rest). Update each to the new string; never delete the assertion.
- Add `frontend/tests/no-ellipsis-contract.test.mjs`: strips `//` and `/* */`
  comments, then fails on any U+2026 in `frontend/src`, `bundled/*/frontend`,
  `docs/guide/*.md`, `docs/DATASET_GUIDE.md`.

**Done when.** The contract test passes; `rg -F "…" frontend/src bundled docs/guide`
reports only comment lines; `npm test` green; one What's New entry.

---

## Wave 8 — Datasets library: columns and pagination (sequential after 6)

File: `frontend/src/components/dataset/DatasetListPanel.jsx`.

- **Columns.** S today renders `DatasetRow` list items in
  `grid grid-cols-1 gap-1.5 sm:grid-cols-2` (L707). Make S a compact tile:
  `grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`.
  M (L117): `grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4`.
  L (L118): `grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3`.
  At 1280 px (the probe's desktop) that is 5 / 4 / 3. Keep `DatasetRow` only if
  a list view is wanted elsewhere; otherwise delete it and its `h-7 w-7` icon
  buttons. `tests/dataset-library-contract.test.mjs:43-45,52` pins
  `tileSize === 'S' ? (`, `<DatasetRow `, `<DatasetTile ` and `lg:grid-cols-4`:
  update to the new structure.
- **Pagination.** New `frontend/src/components/common/Pagination.jsx`: page
  size select (24 / 48 / 96, persisted per surface under
  `datasetLibraryPageSize` / `bankListPageSize`), prev/next, "page N of M",
  item range text. Apply after `datasetMatches` filtering and before
  `groupDatasets`, so a page may span the Trained / Not trained sections. Reset
  to page 1 when the query, kind chip or tile size changes. Keep the control
  out of the fold budget on phones: it sits under the list, not in chrome.
  Use the Wave 6 `Select`/`Button` components.
- **Header row.** New dataset (L607), Backup `<summary>` (`FullBackupControls.jsx:167`),
  Find a dataset (L626), kind chips (L634), Show previews (L650) and S/M/L
  (`TileSizeControl.jsx:18`, 24 px today) all become size `md` controls on one
  row that wraps at `sm` and below. Show previews and S/M/L today never reach
  40 px on touch; `md` fixes that.
- Video training sets (`bundled/video/frontend/.../VideoDatasetsPanel.jsx`,
  slot `datasets.section`) keeps its own list; give it the same `Pagination`
  component when it exceeds one page.
- Tests to update: `dataset-library-contract.test.mjs`,
  `DatasetListPanel.previewToggle.test.js`, `library-backup-menu-contract.test.mjs:36`
  (its `/\+ New dataset/` match is satisfied only by a comment today; fix the
  test to match the rendered label), `uxBatchQ.contract.test.js:77-81`,
  `dataset-thumbnail-surfaces.test.mjs`, `datasetProbeMarkers.test.js:53`.
  Add render tests for `Pagination` (page math, reset on filter change).
- The probe primes with `[aria-label^="Open the dataset"]:visible`
  (`responsiveProbe.mjs:234`); keep that label on the tile opener.

**Done when.** Probe clean at the five sizes on `#/datasets` with ≥ 30 seeded
datasets; 5/4/3 columns at 1280 px; page resets on filter; What's New entry.

---

## Wave 9 — Bank list page (sequential after 6 and 8)

File: `frontend/src/pages/BankPage.jsx` and the inline card (L846-916).

- **Create form (L631-722).** Today: `<form class="space-y-3 rounded-lg border bg-surface p-4">`
  → row `flex flex-wrap items-end gap-3` → Name `<div class="grow min-w-40">`
  and Folder `<div class="grow-[3] min-w-64">` → `FolderPickerField` → inner
  `flex items-stretch gap-2` → input + Browse. Remove the inner boxes: one
  section, one row of Name / Folder / Browse / Create bank, all size `lg`
  (Name L639 and Folder `FolderPicker.jsx:207` are ~34 px, Browse L209 ~34 px,
  Create bank L648 ~36 px today). `FolderPicker.test.js:14-15,38-41` pins
  `> Browse` and the `FolderPickerField` usage; keep both true.
- **Toolbar (L760-790).** One full-width row: count · Find a bank (L772,
  `flex-1`, drop `sm:max-w-xs`) · Sort (L778) · Select Banks (L786) · help
  badge. All size `md`. Move `FolderCheckLine` (L750, "Rescan folders", 30 px)
  into the same row or directly above it at the same size; its yellow freshness
  line becomes a `title`/tooltip unless counts are actually stale.
  `Select Banks` and the bulk bar buttons (L799-810) use `min-h-10` with no
  `lg:min-h-0` today; the component fixes that.
- **Card.** Merge `BankListSummary` (L170-199: Kept/Undecided/Rejected `<ul>`
  L185-190 and Quality L191-196) into one row under the bar: `Kept 0 · Undecided
  206 · Rejected 53 · Quality 259/259`. Move Open → / Launch all (L903-915,
  ~26 px) onto the `PassCoverageRow` line (L899), right-aligned, size `sm`.
  Keep `PipelineVerdictNote` (L898) and `FolderSyncNote` (L900) as single lines.
  `BankGroupCard.jsx` (grouped banks) gets the same row layout.
- **Pagination.** Same `Pagination` component as Wave 8, applied to
  `visibleBanks` (L375, after `sortBanks` + `bankMatches`) before `groupRows`
  (L831). Reset on query, sort or filter change. In selection mode
  "Select Visible" (`bankBulk.js:7`, `BANK_BULK_LIMIT = 500`) selects the
  current page; add "Select all N matching" that selects every visible bank up
  to the limit and says so in the hidden-by-filter count (L795).
- **Queue all bar (L727-738)** and the scrape disclosure keep their place but
  take the `md` size and lose the ellipsis (Wave 7).
- Tests to update: `BankOverviewLayout.contract.test.js:21` (grid regex),
  `queue-split-ui.test.js` (strings), `bank-groups-contract.test.mjs:40-43`
  (`visibleBanks` pipeline; keep the names), `bankProbeMarkers.test.js:77`
  (keep ``aria-label={`Open the bank ${bank.name}`}``), `bankThumbAspect.test.js`,
  `bank-list-folder-freshness.test.mjs` (render test for Rescan folders),
  `bankSurfaceInventory.contract.test.js` (frozen label counts — update the
  fixture with the diff, never lower a count without a reason in the commit).
- Probe: `data-probe-chrome="bank-bulk-actions"` stays on the bulk bar; the
  prime needs at least one loose (ungrouped) bank in the seed.

**Done when.** Probe clean at the five sizes on `#/bank` with ≥ 30 seeded
banks; all toolbar controls share one height; card is two text rows + icons
row; What's New entry.

---

## Wave 10 — Bank workspace sidebar (sequential after 6)

Files: `frontend/src/components/bank/BankFilterRail.jsx`,
`BankThresholdsPanel.jsx`, `BankAtoms.jsx`, `DescribeFilterBar.jsx`.

- **Help text.** Remove from the rail: `{mediumNote}` (L500, text from
  `bankMedium.js` ~94-129) and `{angleState.note}` (L521, ~132-168); keep one
  short `title` on the MEDIUM "Unsure" and ANGLE chips with the same meaning.
  Remove the "Counts below follow the active filters…" paragraph (L319-323);
  put it in the Filters help topic. Keep the amber "Only N of M images are
  scanned" line (L349-361) because it carries an action.
  In `BankThresholdsPanel.jsx`: delete the scope paragraph (L341-345) and move
  its content to the thresholds help topic; collapse the three per-field hint
  lines (L384-389: `directionHint`, `t.hint`, `APPLIES`) into one line plus a
  `title`; `bankThresholds.test.js:166-168` requires `directionHint(t)` to be
  visible text, so the one line keeps it. Keep the `aria-live` effect line
  (L442-444; test pins exactly one `aria-live="polite"`).
- **Sizes.** Section labels: `GroupLabel` stays `text-2xs` uppercase. Chips:
  `Chip` is already `sm` (`lg:h-7`); status tiles L139 are `lg:h-9` → `md`.
  Search/Exclude inputs (L183/L202, ~34 px, no touch min) → `md`. Subfolder
  select (L218, ~26 px) → `md`. "More filters" / "Filter thresholds" accordions
  (L442, L584, no desktop height) → `md` with the chevron right-aligned.
  Measure button (L529, `text-2xs`, ~22 px) → `sm`. Sort select (L632) and
  Small tiles (L649) → both `sm`, same row. Thresholds panel: `INPUT` (L59,
  ~30 px) → `md`; `SMALL_BTN` (L62) → `sm`; Save (L431, ~32 px) and Discard
  (L436, ~34 px) → both `lg`; group accordions (L73) → `md`.
- Tests that pin classes: `bankRailTagsAndSizing.test.js:32-33`,
  `bankRailRestoredFilters.test.js:23-26`, `tests/grid-sort-contract.test.mjs:159`,
  `tests/mobile-rail-containing-block.test.mjs:84-93`, `bankLayout.test.js:144-155`
  (drawer must keep `bg-surface-overlay`), `bankProbeMarkers.test.js:57-58`
  (`data-probe-panel="rail"`, drawer chrome/layer markers stay),
  `bankThresholds.test.js` (see above). Update to the component output; keep
  every behavioral assertion.
- **Dataset workspace parity.** There is no dataset filter rail; filtering is
  `GridStatusFilter` (`DatasetWorkspace.jsx:156-175`, pills `text-2xs`) and
  `GridSortSelect` (L189-206, `text-2xs`) inside `data-probe-chrome="grid-toolbar"`.
  Give both the same `sm` chip/select components so the two surfaces read the
  same. No new filters on the dataset side.

**Done when.** Rail shows no always-on paragraphs except the scanned-count
action line; every control in the rail is `sm` or `md` by component; probe
clean on `#/bank` (workspace states) and `#/dataset/studio/<id>`; What's New
entry.

---

## Wave 11 — open review notes (parallel, small)

1. `backend/app/capabilities.py:54` `_POSITIVE_IMPORT_TTL = 24 * 3600` for
   JoyCaption: invalidate the cached positive verdict when the probe's
   interpreter path or the package's install receipt changes, or cut to 1 h.
   Test in `test_capabilities.py`.
2. `frontend/src/pages/BankPage.jsx:590` `cancelQueued`: the confirm reads a
   2 s-old queue snapshot. Refetch `/api/bank-queue` before deciding whether the
   row is running; if it is, ask the running-row question. Test in
   `queue-split-ui.test.js`.
3. `frontend/src/index.css:346-376` `.bank-tile__actions`: on touch the
   full-width 40 px strip blocks tap-to-select at the tile bottom. Make the
   strip appear on long-press/selection mode, or leave a tappable margin; probe
   `#/bank` workspace on 360×800.
4. `backend/app/services/image_bank_service.py:3052` `_report_steps` drops
   `counts`, `blocked` and `superseded_at`, so list tiles never show the
   caption note and judge "blocked" from prose. Include those three fields;
   extend `test_image_bank_pipeline.py` and `pipelineVerdict.test.js`.

---

## Wave 12 — ask-first removals (after the user answers)

- `bundled/civitai_publish` (held in `fork-plugins.json`): remove the directory,
  the id from `fork-plugins.json` and `backend/app/plugins/official.py:24`, the
  inventory entry (`fork_outbound_inventory.json:390-396`), and the references
  in `bundled/video/frontend/help/videoLane.js:12`,
  `bundled/video/tests/test_public_media_claims.py:35,138-161`,
  `frontend/tests/lightbox-owns-the-verbs.contract.test.mjs:24,47,160-165`,
  `public-sdk-contract.test.mjs:61`, `frontend/src/plugins/layerTracker.test.js:12,42`,
  `backend/tests/test_timeout_settings.py:44-54`. **Keep** the `civitai_link`
  / `video_civitai_link` tables (`lds_sdk/database.py:26`, existing data) and
  `CIVITAI_API_KEY` (shared with the scraper and the Civitai browser).
- Cloud/API shims: only if the user asks. `backend/lds_sdk/cloud_live.py`,
  `cloud_reference.py`, `cloud_video_training.py`, `video_host/cloud_video_training.py`,
  `_cloud_provider.py`, `cloud_host/` (13 files), `api_engines.py`,
  `config.py:1843-1855` product settings, `capabilities.py:2590`,
  `routes/settings.py:1154`, six gates in `routes/training.py`. Keep
  `lds_sdk/cloud_runs.py`, `cloud_history.py`, `run_history.py` (bundled/video
  uses them) and `services/cloud_training.py` (core history). Removing the
  config keys needs aliases. ~25 tests reference these names; each must be
  edited, not deleted.
- Enabled plugins: none by default. The inventory table (code LOC / tests):
  camera_angles 1.5k+1.4k / 34; canvas 0.8k+11.3k / 436; dlss5 1.7k+1.0k / 17;
  hf_publish 0.4k+0.4k / 9; image_upscale 0.1k+1.5k / 52; live 1.2k+0.6k / 65;
  model_tools 2.2k+1.4k / 96; qwen_dataset 0.4k+0.3k / 9; resource_monitor
  0.02k+0.6k / 28; scrape 4.2k+2.1k / 70; seedvr2 1.5k+0.9k / 34; video
  25.2k+19.9k / 450.

---

## Review protocol for every wave

The reviewer (a Claude model) reads the diff, not the executor's report, and
checks, in order:
1. Every path under the wave's **Remove**/**Edit** lists is touched and nothing
   outside the wave's scope is.
2. Each **Done when** item, with the command output pasted into the PR or
   HANDOFF.md.
3. `backend/tests/test_fork_outbound_gate.py` passes and the inventory diff
   contains only the expected removals.
4. Source and `build(frontend):` commits are separate; dist was rebuilt from the
   final source commit.
5. What's New entry present with a new id; no stable identifier renamed
   without an alias.
6. No test threshold, probe limit or assertion was loosened; a failing test was
   fixed at the source or the test was updated with a reason in the commit.
7. No AI attribution in any commit message.
