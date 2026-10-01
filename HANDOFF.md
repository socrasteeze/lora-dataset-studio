# HANDOFF

**Updated:** 2026-10-01 · **Branch:** wave/7-ellipsis · **Base:** f3815e82e · **Tree:** clean

## State
Wave 7 ellipsis removal is on `wave/7-ellipsis`. `origin/main` is still `f3815e82e`. Gates have not run.

## Done this session
- U+2026 is gone from visible text in `frontend/src`, `bundled`, and `docs/guide`. Comments still use it.
- `frontend/tests/no-ellipsis-contract.test.mjs` strips comments, then fails on that character.
- What's New id `2026-10-01-zzz-status-without-ellipsis`.

## Open
1. Push `wave/7-ellipsis` if this commit is still only local, then start Wave 8.
2. Waves 8, 9, 10, 11, and 12. Wave 12 removes `bundled/civitai_publish` only.
3. Run `scripts/gates.ps1 -Phase Gates` twice on a named host. On two matching green logs, fast-forward `origin/main`, push annotated tag `v2026.10.01`, and delete `fix/config-isolation`, `fix/settings-copy-restore`, `noble/bank-queue-stop`, and `integrate/2026-10-01`.
4. If that host cannot start, save the launcher error and leave main at `f3815e82e`.
5. Wave 11 is still open: JoyCaption ready TTL is 24h in `backend/app/capabilities.py`, `cancelQueued` in `BankPage.jsx` uses a polled snapshot, `.bank-tile__actions` blocks tap-select, and bank list `_report_steps` drops `counts`, `blocked`, and `superseded_at`.

## Decisions
- A numbered jump reads "1 to 9". A truncated name list says "and N more".
- Tests that forbid the old label use a unicode escape, so the contract does not see the character and the assertion still rejects it.
- `Controls.jsx` re-exports the helpers so the test loader on a case-insensitive volume does not bind `controls` to the component file.

## Traps
- Do not rewrite `150ff3f65`. Do not amend a commit to fix a message.
- A token replace of `host.docker.internal` also rewrites the escaped form in `fork_outbound_scan.py`.
- Pytest's default basetemp under the user temp directory returns Access denied. Pass `--basetemp` under a writable directory.
- Deleting U+2026 inside a `doesNotMatch` regex makes it reject the new label. Keep the escape.
- The first Bank probe on a cold server missed the list at 360x800. A warm rerun was clean. Do not loosen a probe limit.
- `scripts/gates.ps1` stops at the first red step. A local pytest run does not satisfy the landing gate.

## Verify
```powershell
cd frontend
node --import ./scripts/registerSdk.mjs --test tests/no-ellipsis-contract.test.mjs tests/bank-list-folder-freshness.test.mjs src/uxBatchQ.contract.test.js src/components/bank/bankUndo.test.js
npm test
pwsh -File scripts/gates.ps1 -Phase Gates
```
