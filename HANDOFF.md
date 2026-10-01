# HANDOFF

**Updated:** 2026-10-01 · **Branch:** Wave 2 · **Base:** f3815e82e · **Tree:** clean

## State
Wave 2 is on its own branch, ahead of `origin/wave/1-detach` at `7aeebd0ff`. `origin/main` is still `f3815e82e`. Gates have not run.

## Done this session
- Wave 1 is pushed at `7aeebd0ff`.
- Packaged image launchers, compose files, and the RunPod guide are deleted. Install is direct. Remote ComfyUI stays.
- A retired Ollama deployment value other than `none` reads as `host` through `normalized_ollama_deployment_mode`.

## Open
1. Wave 3 store removal, then Wave 4 legacy recovery, then Wave 5 isolation. Cut each `wave/<id>` from the previous pushed tip. Scrub and push before the next.
2. Waves 6 through 10 in that order, then Wave 11, then Wave 12. Wave 12 removes `bundled/civitai_publish` only. Keep the cloud/API shims and all 12 enabled plugins.
3. Run `scripts/gates.ps1 -Phase Gates` twice on a named host. On two matching green logs, fast-forward `origin/main`, push annotated tag `v2026.10.01`, and delete `fix/config-isolation`, `fix/settings-copy-restore`, `noble/bank-queue-stop`, and `integrate/2026-10-01`.
4. If that host cannot start, save the launcher error and leave main at `f3815e82e`.
5. Wave 11 is still open: JoyCaption ready TTL is 24h in `backend/app/capabilities.py`, `cancelQueued` in `BankPage.jsx` uses a polled snapshot, `.bank-tile__actions` blocks tap-select, and bank list `_report_steps` drops `counts`, `blocked`, and `superseded_at`.

## Decisions
- Kept `host.docker.internal` in the ComfyUI recovery hint and in `fork_outbound_scan.py` — a ComfyUI on another machine still uses that name.
- Retired Ollama deployment values other than `none` read as `host`. The old deployment route is gone.
- Wave 12 uses the recorded defaults. Do not remove the cloud shims or the enabled plugins.
- Main, the tag, and the four branch deletes stay blocked until two green gate logs exist.

## Traps
- Do not rewrite `150ff3f65`. Do not amend a commit to fix a message.
- A token replace of `host.docker.internal` also rewrites `host\.docker\.internal` in `fork_outbound_scan.py` and breaks the local-host classifier.
- Pytest's default basetemp under the user temp directory returns Access denied. Pass `--basetemp` under a writable directory.
- Install `requirements-dev.txt` and `requirements-torch-tests.txt` in two commands. One command lets the torch index replace PyPI.
- `scripts/gates.ps1` stops at the first red step. A local pytest run does not satisfy the landing gate.
- The image-upscale What's New id under `bundled/image_upscale` was rewritten. `frontend/src/whatsNewArchive.js` still has the original id.

## Verify
```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_setup_routes.py backend/tests/test_updater.py backend/tests/test_fork_outbound_gate.py -q --basetemp <writable>
cd frontend; npm test
pwsh -File scripts/gates.ps1 -Phase Gates
```
