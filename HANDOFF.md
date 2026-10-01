# HANDOFF

**Updated:** 2026-10-01 · **Branch:** wave/6-type-scale · **Base:** f3815e82e · **Tree:** clean

## State
Wave 6 type scale is on `wave/6-type-scale`. `origin/main` is still `f3815e82e`. Gates have not run.

## Done this session
- Allowed text classes are `text-2xs`, `text-xs`, `text-sm`, `text-base`, `text-xl`, `text-2xl`. Contract allowlist is empty.
- `Controls.jsx` wraps `controls.js`. Folder picker field, folder rescan, tile-size chips, backup summary, and settings `INPUT_CLASS` use it.
- What's New id `2026-10-01-consistent-type-and-controls`.

## Open
1. Push `wave/6-type-scale` if this commit is still only local, then start Wave 7.
2. Wave 7 ellipsis, then Waves 8, 9, 10, 11, and 12. Wave 12 removes `bundled/civitai_publish` only.
3. Run `scripts/gates.ps1 -Phase Gates` twice on a named host. On two matching green logs, fast-forward `origin/main`, push annotated tag `v2026.10.01`, and delete `fix/config-isolation`, `fix/settings-copy-restore`, `noble/bank-queue-stop`, and `integrate/2026-10-01`.
4. If that host cannot start, save the launcher error and leave main at `f3815e82e`.
5. Wave 11 is still open: JoyCaption ready TTL is 24h in `backend/app/capabilities.py`, `cancelQueued` in `BankPage.jsx` uses a polled snapshot, `.bank-tile__actions` blocks tap-select, and bank list `_report_steps` drops `counts`, `blocked`, and `superseded_at`.

## Decisions
- `text-lg` (18px) maps to `text-xl`. Equidistant sizes take the smaller step, except dialog titles, which use `text-xl`.
- `Controls.jsx` re-exports the helpers. On a case-insensitive volume the test loader tries `.jsx` before `.js` and would otherwise bind `controls` to the component file. Component imports use the `.jsx` suffix so Vite, which tries `.js` first, does not open `controls.js`.
- The folder browser modal stays on raw buttons. The contract covers the five named sites, not the other raw buttons.

## Traps
- Do not rewrite `150ff3f65`. Do not amend a commit to fix a message.
- A token replace of `host.docker.internal` also rewrites `host\.docker\.internal` in `fork_outbound_scan.py`.
- Pytest's default basetemp under the user temp directory returns Access denied. Pass `--basetemp` under a writable directory.
- The first Bank probe on a cold server missed the list at 360x800 (exit 1, unmarked chrome). The warm rerun was exit 0: 39 measurements, no violations. Datasets exit 0 (58 measurements). Setup and Settings exit 0 with no chrome surfaces. Do not treat a cold unmarked result as a layout failure, and do not loosen a limit.
- `scripts/gates.ps1` stops at the first red step. A local pytest run does not satisfy the landing gate.
- The image-upscale What's New id under `bundled/image_upscale` was rewritten. `frontend/src/whatsNewArchive.js` still has the original id.

## Verify
```powershell
cd frontend
node --import ./scripts/registerSdk.mjs --test tests/type-scale-contract.test.mjs tests/control-size-contract.test.mjs src/components/common/controls.test.js
npm run build
npm run probe:responsive -- --url http://127.0.0.1:5173/#/bank
pwsh -File scripts/gates.ps1 -Phase Gates
```
