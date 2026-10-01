# HANDOFF

**Updated:** 2026-10-01 · **Branch:** wave/8-datasets · **Base:** f3815e82e · **Tree:** clean

## State
Wave 8 dataset pages are on `wave/8-datasets`. `origin/main` is still `f3815e82e`. Gates have not run.

## Done this session
- Dataset tiles use S/M/L grids that are 5, 4, and 3 columns at the xl breakpoint.
- `Pagination` pages the filtered list before Trained / Not trained grouping. Search, kind, and tile size return to page 1.
- What's New id `2026-10-01-zzzz-dataset-pages`.

## Open
1. Push `wave/8-datasets` if this commit is still only local, then start Wave 9.
2. Waves 9, 10, 11, and 12. Wave 12 removes `bundled/civitai_publish` only.
3. Run `scripts/gates.ps1 -Phase Gates` twice on a named host. On two matching green logs, fast-forward `origin/main`, push annotated tag `v2026.10.01`, and delete `fix/config-isolation`, `fix/settings-copy-restore`, `noble/bank-queue-stop`, and `integrate/2026-10-01`.
4. If that host cannot start, save the launcher error and leave main at `f3815e82e`.
5. Wave 11 is still open: JoyCaption ready TTL is 24h in `backend/app/capabilities.py`, `cancelQueued` in `BankPage.jsx` uses a polled snapshot, `.bank-tile__actions` blocks tap-select, and bank list `_report_steps` drops `counts`, `blocked`, and `superseded_at`.

## Decisions
- S is compact tiles, not a separate row component. `DatasetRow` is gone.
- Page size keys are `datasetLibraryPageSize` for the library. Video sets use the same pager when there are more than 24.
- A numbered jump reads "1 to 9". A truncated name list says "and N more".

## Traps
- Do not rewrite `150ff3f65`. Do not amend a commit to fix a message.
- A token replace of `host.docker.internal` also rewrites the escaped form in `fork_outbound_scan.py`.
- Pytest's default basetemp under the user temp directory returns Access denied. Pass `--basetemp` under a writable directory.
- The datasets probe on an empty dataset skips image states (caption editor, crop, lightbox). That skip is not a layout failure. The run with 30 datasets was exit 0, 35 measurements, no violations.
- Deleting U+2026 inside a `doesNotMatch` regex makes it reject the new label. Keep the escape.
- `scripts/gates.ps1` stops at the first red step. A local pytest run does not satisfy the landing gate.

## Verify
```powershell
cd frontend
node --import ./scripts/registerSdk.mjs --test tests/pagination.test.mjs tests/dataset-library-contract.test.mjs src/utils/datasetLibrary.test.js
npm run probe:responsive -- --url http://127.0.0.1:5173/#/datasets
pwsh -File scripts/gates.ps1 -Phase Gates
```
