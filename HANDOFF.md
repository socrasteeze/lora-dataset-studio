# HANDOFF

**Updated:** 2026-10-01 · **Branch:** wave/9-bank-list · **Base:** f3815e82e · **Tree:** clean

## State
Wave 9 bank list pages are on `wave/9-bank-list`. `origin/main` is still `f3815e82e`. Gates have not run.

## Done this session
- The bank list pages the filtered banks before grouping. Search and sort return to page 1. The page size key is `bankListPageSize`.
- Select Visible selects the current page. Select all matching selects the filtered list, up to 500, and the count names what the limit leaves out.
- Create uses one row at the large control height. The toolbar is one medium row. A fresh folder check stays on the button title. Card counts are one line, and Open and Launch all sit on the coverage row.
- What's New id `2026-10-01-zzzzz-bank-pages`.

## Open
1. Push `wave/9-bank-list` if this commit is still only local, then start Wave 10.
2. Waves 10, 11, and 12. Wave 12 removes `bundled/civitai_publish` only.
3. Run `scripts/gates.ps1 -Phase Gates` twice on a named host. On two matching green logs, fast-forward `origin/main`, push annotated tag `v2026.10.01`, and delete `fix/config-isolation`, `fix/settings-copy-restore`, `noble/bank-queue-stop`, and `integrate/2026-10-01`.
4. If that host cannot start, save the launcher error and leave main at `f3815e82e`.
5. Wave 11 is still open: JoyCaption ready TTL is 24h in `backend/app/capabilities.py`, `cancelQueued` in `BankPage.jsx` uses a polled snapshot, `.bank-tile__actions` blocks tap-select, and bank list `_report_steps` drops `counts`, `blocked`, and `superseded_at`.

## Decisions
- S is compact tiles, not a separate row component. `DatasetRow` is gone.
- Page size keys are `datasetLibraryPageSize` for the library and `bankListPageSize` for the bank list. Video sets use the same pager when there are more than 24.
- A large field is a real size in the control table (`lg:h-9`). Unknown sizes still throw.
- A numbered jump reads "1 to 9". A truncated name list says "and N more".

## Traps
- Do not rewrite `150ff3f65`. Do not amend a commit to fix a message.
- A token replace of `host.docker.internal` also rewrites the escaped form in `fork_outbound_scan.py`.
- Pytest's default basetemp under the user temp directory returns Access denied. Pass `--basetemp` under a writable directory.
- The datasets probe on an empty dataset skips image states (caption editor, crop, lightbox). That skip is not a layout failure. The run with 30 datasets was exit 0, 35 measurements, no violations.
- The bank probe on 30 empty banks skips image states (review, improve, compare). That skip is not a layout failure. The run was exit 0, 24 measurements, no violations. The opener was present, so the workspace states ran.
- Deleting U+2026 inside a `doesNotMatch` regex makes it reject the new label. Keep the escape.
- `scripts/gates.ps1` stops at the first red step. A local pytest run does not satisfy the landing gate.

## Verify
```powershell
cd frontend
node --import ./scripts/registerSdk.mjs --test tests/bank-groups-contract.test.mjs tests/bank-list-folder-freshness.test.mjs src/components/bank/bankSurfaceInventory.contract.test.js src/components/bank/bankBulk.test.js
npm run probe:responsive -- --url http://127.0.0.1:5173/#/bank
pwsh -File scripts/gates.ps1 -Phase Gates
```
