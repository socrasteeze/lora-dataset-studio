# FORK_NOTES

Current rules for this fork of perfectgf/lora-dataset-studio.
`upstream` is a read-only remote for an occasional cherry-pick.
There is no sync loop. The wave log that used to live here is
`docs/history/FORK_CHANGELOG.md`, unchanged.

The landing gate is `scripts/gates.ps1 -Phase Gates`.

## Distribution

`fork-plugins.json` owns which plugins ship.
Packaged images, compose files, and their launchers are not part of this fork.
Install on the machine that runs the app. Remote ComfyUI stays.
Runtime APIs must use localhost, private LAN addresses or the operator's tailnet.
Hugging Face publishing and the web scraper are excluded. The ten remaining
plugins run locally; explicit Setup downloads are preparation, not a runtime API.
The Civitai publisher is not included. Saved link tables and the shared API key stay.
API image engines and rented-GPU training stay excluded.
Plugins that ship with the app are installed with it.
There is no plugin catalog.
`npm run build` writes the curated fork marker in
`frontend/dist/plugin-build.json`. The backend reads that marker
unless a test sets a distribution override.

## Divergence 1: local-only generation

Generation stays on local engines. ComfyUI Klein is the default.
A second local engine is allowed. A cloud API engine is not.
`API_ENGINES` stays an empty list. Never add an id to it.
`DEFAULT_ENGINE` stays `klein`. Engine rates stay 0, so the app
cannot quote a price.
Reference editing and other local ComfyUI features stay.
Do not restore Nano Banana, ChatGPT, Gemini, OpenAI, or OpenRouter
setup, keys, or help topics.

## Divergence 2: Klein model-file pins

Retired. Upstream took the pin feature. Do not keep a second copy
of `KLEIN_OVERRIDE_KEYS`, `_PINNED_SUBDIR`, or the Klein model card.
A duplicate definition can ship the old function with no test failure.

## Divergence 3: emoji

Retired. Keep upstream's emoji, including emoji used as buttons.
Do not strip pictographs on a cherry-pick.

## Divergence 4: local-only training

Settings, Training, and Runs do not offer a GPU rental.
Do not restore Vast keys, cloud-training cards, rental banners, or
a Train-in-cloud button.
Concept face masking stays. It is local training, not a rental feature.
The CPU fp8 quantize tool stays in the local Training panel.
Do not restore dense rental recipes, pod delivery, or Hub storage controls.
A new Continue host must stay behind `caps.cloud_training`.
Do not open a rental lane from a `configured` flag alone.

## Divergence 5: tests

These tests are the fork's. Upstream parity is not a goal.
Do not revert a fork patch on a test file to make it match upstream.
The patches are what keep the suite green on this tree.

## Divergence 6: remote ComfyUI backends

`worker_url` is live. Settings, Devices, Remote ComfyUI backends use
`backend/app/services/backend_worker.py` and `routes/cluster.py`.
`api:<hex>` worker ids are this fork's namespace.
Do not remove `worker_url` or `worker_id` as unused parameters.
If upstream adds callers, keep this fork's namespace and the rule
that a backend may fill any role.

## Divergence 7: fixes carried ahead

Two leftovers remain.

`_CLAIM_MAX_AGE_S` stays out. The upstream clause is unreachable
beside the existing slack check. If upstream makes that clause
reachable, take upstream's version.

`_PROBE_WORKERS` is 17, one worker per probe group. Upstream's bound
of 4 is not used. If upstream raises that bound, or gives a reason
that this grouping does not already answer, take upstream's number.

## Divergence 8: start.bat has two lanes

The default lane is `backend/supervise.py`. A native crash relaunches
the interpreter and stops after five rapid deaths. `LDS_SUPERVISE=0`
opts out.
The opt-out lane is `LDS_SUPERVISOR=1` and the `:run` loop. Update and
restart exits 3 and relaunches in the same console.
`updater.py` checks `LDS_RESTART_MODE` before `LDS_SUPERVISOR`, so the
two relaunchers do not race.
Do not set `LDS_OPEN_BROWSER=1`. That force-flag overrides the Settings
switch for the common double-click launch.
Keep the lanes as separate `goto` blocks. A label inside a parenthesised
block is invalid batch.

## Divergence 9: lint

Use `frontend/eslint.config.mjs`. Do not leave a second ESLint config
beside it. Flat config prefers `.js`, so an old file would win silently.
`no-unused-vars` is warn until the orphan backlog is cleared.
`no-undef` and `react/jsx-no-undef` stay at error.
`ruff.toml` is the backend lint, and CI runs `ruff check .` on every push.

## Divergence 10: one help registry

Help topics live in `frontend/src/help/helpRegistry.js`.
Do not restore upstream's `help/topics/` split as the registry.
Hand-port a new upstream topic into the one file.
A topic count does not prove the wording was kept. Diff the ids.

## Divergence 11: no nightly branch

This fork has no `nightly` branch and no reduced gate before `main`.
Do not land work by skipping the backend suite.
`scripts/gates.ps1 -Phase Gates` is the landing gate.

## Divergence 12: offline runtime

The app does not call online product APIs or publish the operator's data.
Localhost and operator-configured private-network tools and peers stay supported.
Downloads the operator starts in Setup are allowed. Runtime inference and
training use files already prepared locally; inference workers reject public
network connections. See `docs/OFFLINE_WORKFLOWS.md`.

What stays off:

- In-app online update checks and apply operations are unavailable. Maintain
  the checkout or replace the local release outside the app, then restart.
- Civitai browsing and online media imports are unavailable, even with a saved key.
- The "upstream is N commits ahead" check is deleted.
- There is no plugin catalog. Installed plugins are listed by
  `GET /api/plugins/`, which also reports `can_manage`.
- Fonts load from the bundled `@fontsource` packages.

`backend/tests/test_fork_outbound_gate.py` fails when the outbound
inventory changes, when the test app connects out during page-load
routes, when an automatic update check returns, or when shipped code
runs `git push`.
Refresh `fork_outbound_inventory.json` only after reading every new call
site. Remove any call that runs on its own.
`test_the_upstream_comparison_is_gone` stays. It guards this rule.

The gate does not see subprocesses or production-only boot threads.
The inventory is the cover there.
Offline update-route tests must verify that no git fetch or release API runs.

`create_app` does not resume rented-GPU work.
`run.py` calls `incompatible_pillow_plugins()` and prints a repair command.
It does not run pip.
`test_startup_neither_resumes_rentals_nor_runs_pip` fails if boot does either.

Still allowed: local file import/export, local generation and training,
operator-started model/node-pack downloads and Setup installs, and the private
network peers the operator entered. Stored credentials and historical link
tables remain; they do not enable online runtime features.

## Mobile workflow contract

Dataset folder imports use the shared in-app host-drive browser on every client.
Do not restore a native-dialog-first import path.
Phone uploads use a persistent per-file browser queue and transactional server receipts.
Caption draft recovery is shared by Bank and Dataset.
Import-first guidance covers all dataset kinds without requiring a character reference.
See AGENTS.md and the mobile workflow section of `docs/guide/using-the-app.md`.

Dataset requests use the live local-engine registry and still reject legacy
and registered API engines before dispatch. Keep plugin enablement and
preparation checks in that path. H3 weight discovery must retain explicit
relative-path matching while searching basename requests through model subfolders.
