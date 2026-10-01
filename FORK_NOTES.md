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
The Civitai publisher stays held.
API image engines and rented-GPU training stay excluded.
The plugin store is switched off.
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

## Divergence 12: nothing leaves the machine unless the operator asks

The app reaches another machine only after an explicit click, and it
does not send the operator's data or config anywhere new.
Downloads the operator starts are allowed.

What stays off:

- An update check runs only for `?force=1` (Check for updates). Any other
  call returns the last explicit answer, or `ok: false`.
- The "upstream is N commits ahead" check is deleted.
- The plugin store stays off. `store_switched_off()` returns `True`.
  No setting or environment variable changes that.
- Fonts load from the bundled `@fontsource` packages.

`backend/tests/test_fork_outbound_gate.py` fails when the outbound
inventory changes, when the test app connects out during page-load
routes, when the store switch is not a literal `True`, when an automatic
update check returns, or when shipped code runs `git push`.
Refresh `fork_outbound_inventory.json` only after reading every new call
site. Remove any call that runs on its own.
`test_the_upstream_comparison_is_gone` stays. It guards this rule.

The gate does not see subprocesses or production-only boot threads.
The inventory is the cover there.
Update-check tests must stub `is_git_checkout`, or `?force=1` runs a
real `git fetch`.

`create_app` does not call `legacy_cloud_recovery.start`.
`run.py` does not call `ensure_pillow_consistent`.
Both functions still exist because upstream tests import them.
`test_startup_neither_resumes_rentals_nor_runs_pip` fails if boot calls either.

Still allowed, and only after a click: Hugging Face dataset export,
the scraper, the Civitai browser, model and node-pack downloads,
Setup installs, local-network peers the operator entered, and Check
for updates.

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
