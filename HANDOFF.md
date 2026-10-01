# HANDOFF

**Updated:** 2026-10-01 · **Branch:** wave/11-review · **Base:** f3815e82e · **Tree:** clean

## State
Wave 11 review notes are on `wave/11-review`. `origin/main` is still `f3815e82e`. Gates have not run.

## Done this session
- A JoyCaption ready verdict lasts one hour, and a changed interpreter path or install receipt drops it immediately.
- Cancelling a queue row refetches the queue and asks the running-row question when that bank is already running.
- On a phone the tile action strip leaves the left of the tile foot free, so a tap there still selects the image.
- The bank list keeps caption counts, the blocked flag, and superseded_at on each pipeline step.
- What's New id `2026-10-01-zzzzzzz-honest-bank-cards`.

## Open
1. Push `wave/11-review` if this commit is still only local, then start Wave 12.
2. Wave 12 removes `bundled/civitai_publish` only.
3. Run `scripts/gates.ps1 -Phase Gates` twice on a named host. On two matching green logs, fast-forward `origin/main`, push annotated tag `v2026.10.01`, and delete `fix/config-isolation`, `fix/settings-copy-restore`, `noble/bank-queue-stop`, and `integrate/2026-10-01`.
4. If that host cannot start, save the launcher error and leave main at `f3815e82e`.
5. Wave 11's four notes are on `wave/11-review`. Do not reopen the 24-hour JoyCaption cache, the polled cancel confirm, the full-width tile strip, or a list report that drops counts, blocked, and superseded_at.

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
- The bank probe on 30 empty banks skips image states (review, improve, compare). That skip is not a layout failure. A cold first viewport can miss the opener and report unmarked chrome. The warm rerun is the result: exit 0, 24 measurements, no violations, rail included.
- The studio probe on an empty dataset skips clip states whose controls are absent. A cold first video state can report unmarked chrome. The warm rerun was exit 0, 25 measurements, no violations.
- A cold bank probe can miss the opener at 360 and report unmarked chrome. The warm rerun with one image per bank was exit 0, 38 measurements, no violations, and it included review at 360.
- Deleting U+2026 inside a `doesNotMatch` regex makes it reject the new label. Keep the escape.
- `scripts/gates.ps1` stops at the first red step. A local pytest run does not satisfy the landing gate.

## Verify
```powershell
cd frontend
node --import ./scripts/registerSdk.mjs --test src/components/bank/bankRailTagsAndSizing.test.js src/components/bank/bankThresholds.test.js tests/grid-sort-contract.test.mjs
npm run probe:responsive -- --url http://127.0.0.1:5173/#/bank
npm run probe:responsive -- --url http://127.0.0.1:5173/#/dataset/studio/<id>
pwsh -File scripts/gates.ps1 -Phase Gates
```
