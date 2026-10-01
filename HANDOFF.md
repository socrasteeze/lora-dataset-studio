# HANDOFF

**Updated:** 2026-10-01 · **Branch:** wave/3-store · **Base:** f3815e82e · **Tree:** clean

## State
Wave 3 is on `wave/3-store`, ahead of `origin/wave/2-docker` at `64a572c4d`. `origin/main` is still `f3815e82e`. Gates have not run.

## Done this session
- Wave 2 is pushed at `64a572c4d`.
- The plugin catalog, purchases tab, and public-store tooling are gone. `GET /api/plugins/` lists installed plugins and reports `can_manage`.

## Open
1. Wave 4 legacy recovery removal, then Wave 5 isolation. Cut each branch from the previous pushed tip. Scrub and push before the next.
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
- Install `requirements-dev.txt` and `requirements-torch-tests.txt` in two commands.
- `scripts/gates.ps1` stops at the first red step. A local pytest run does not satisfy the landing gate.
- The image-upscale What's New id under `bundled/image_upscale` was rewritten. `frontend/src/whatsNewArchive.js` still has the original id.

## Verify
```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_fork_outbound_gate.py backend/tests/test_fork_plugin_profile.py scripts/tests/test_release_bundle.py -q --basetemp <writable>
cd frontend; node --import ./scripts/registerSdk.mjs --test src/pages/plugins/installedPlugins.test.js tests/public-mount-contract.test.mjs
pwsh -File scripts/gates.ps1 -Phase Gates
```
