# HANDOFF

**Updated:** 2026-10-01 · **Branch:** wave/5-isolation · **Base:** f3815e82e · **Tree:** clean

## State
Wave 5 is on `wave/5-isolation`, ahead of `origin/wave/4-legacy` at `281df42b8`. `origin/main` is still `f3815e82e`. Gates have not run.

## Done this session
- Wave 4 is pushed at `281df42b8`.
- The autouse fixture redirects `LDS_PLUGINS_DIR` and `LDS_EXTENSIONS_DIR`. It does not set `LDS_PLUGIN_DISTRIBUTION` or `LDS_BUNDLED_DIR`.

## Open
1. Wave 6 type scale, then Wave 7 ellipsis. Scrub and push each before the next.
2. Waves 6 through 10 in that order, then Wave 11, then Wave 12. Wave 12 removes `bundled/civitai_publish` only. Keep the cloud/API shims and all 12 enabled plugins.
3. Run `scripts/gates.ps1 -Phase Gates` twice on a named host. On two matching green logs, fast-forward `origin/main`, push annotated tag `v2026.10.01`, and delete `fix/config-isolation`, `fix/settings-copy-restore`, `noble/bank-queue-stop`, and `integrate/2026-10-01`.
4. If that host cannot start, save the launcher error and leave main at `f3815e82e`.
5. Wave 11 is still open: JoyCaption ready TTL is 24h in `backend/app/capabilities.py`, `cancelQueued` in `BankPage.jsx` uses a polled snapshot, `.bank-tile__actions` blocks tap-select, and bank list `_report_steps` drops `counts`, `blocked`, and `superseded_at`.

## Decisions
- Kept `host.docker.internal` in the ComfyUI recovery hint and in `fork_outbound_scan.py`.
- Explicit `LDS_PLUGIN_DISTRIBUTION` values `store` and `development` stay as test profiles. A build marker must say `fork`.
- Wave 12 uses the recorded defaults. Do not remove the cloud shims or the enabled plugins.
- Main, the tag, and the four branch deletes stay blocked until two green gate logs exist.

## Traps
- Do not rewrite `150ff3f65`. Do not amend a commit to fix a message.
- A token replace of `host.docker.internal` also rewrites `host\.docker\.internal` in `fork_outbound_scan.py`.
- Pytest's default basetemp under the user temp directory returns Access denied. Pass `--basetemp` under a writable directory.
- Isolation timing, local `-n 8` only. `test_config_isolation.py` before the fixture change: 5 passed in 1.88s; slowest setup 0.17s. After: 8 passed in 1.68s; slowest setup 0.18s. With `LDS_PLUGINS_DIR` set for the whole run, that file plus the six direct `create_app` callers: 224 passed in 40.62s. Top 20: bank pass write lock 4.05s, forced recaption 3.65s, framing click 3.62s, legacy trash cleanup 3.46s, caption button count 3.09s, watermark click 3.07s, degraded ollama 2.70s, inpaint setup 2.46s, framing probe setup 2.43s, caption migration 2.34s, score setup 2.27s, framing setup 2.24s, mime type 2.23s, bank create 2.08s, trash preflight 2.05s, watermark clean 1.98s, framing silent setup 1.92s, watermark column 1.80s, watermark empty setup 1.75s, watermark file-error setup 1.64s. Full Gates durations are not recorded. The gate host has not run.
- Install `requirements-dev.txt` and `requirements-torch-tests.txt` in two commands.
- `scripts/gates.ps1` stops at the first red step. A local pytest run does not satisfy the landing gate.
- The image-upscale What's New id under `bundled/image_upscale` was rewritten. `frontend/src/whatsNewArchive.js` still has the original id.

## Verify
```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_fork_outbound_gate.py backend/tests/test_fork_plugin_profile.py scripts/tests/test_release_bundle.py -q --basetemp <writable>
cd frontend; node --import ./scripts/registerSdk.mjs --test src/pages/plugins/installedPlugins.test.js tests/public-mount-contract.test.mjs
pwsh -File scripts/gates.ps1 -Phase Gates
```
