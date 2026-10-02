# HANDOFF

**Updated:** 2026-10-01 | **Branch:** noble/refactor-review-handoff | **Base:** 8eb52792b | **Tree:** task-branch commits

## State
The four P2 regressions from the `f3815e82e..8eb52792b` review are fixed on this task branch. `main` is unchanged.
Targeted node tests for those fixes, and `npm run build`, exited 0. `scripts/gates.ps1`, full `npm test`, lint, responsive probes, ruff, backend pytest, and the application were not run. Cloud Gates remain the landing gate.

## Done this session
- Checked the refactor diff, affected callers and applicable repository rules. Confirmed all four findings against the previous implementation.
- Bank browse groups the full filtered list, then pages those display rows. Selection mode still pages raw banks. A filtered singleton stays a single bank. The promote dialog quotes the complete member count and kept total. The client still does not send a member list.
- An installed plugin whose script, stylesheet, or descriptor failed to load shows that failure and Reload page. A plugin with no load problem still says Active now. Plugin settings keep their load-failure explanation and reload action.
- ZIP consent shows each compatibility issue message, including a missing dependency and a required API version, and Install stays disabled. The generic refusal remains only when install is blocked and no issue details are present.
- `docs/guide/installation.md` describes the installed-plugin and trusted-ZIP workflow. `docs/guide/getting-started.md` no longer describes All, Installed, and Updates filters on Plugins. History and specs were left unchanged.
- Four benefit-first What's New entries were prepended. `frontend/dist` was rebuilt in a separate `build(frontend):` commit.

## Open
1. **Carry forward the release boundary.** Do not restore `bundled/civitai_publish`. Keep the link tables, `CIVITAI_API_KEY`, cloud/API compatibility shims and twelve enabled plugins.
2. **Cloud landing gate.** Run the checks below in a separate cloud task against the exact fix commits before any landing push. Keep main unchanged until that gate passes.

## Decisions
- Use `f3815e82e` as the refactor baseline recorded in PLAN.md, rather than the supplied current-HEAD base, whose diff is empty.
- Keep the fixes on this task branch until a cloud landing gate passes. Do not publish main from source inspection alone.
- S remains compact tiles. Preserve `datasetLibraryPageSize` and `bankListPageSize`; video sets use the shared pager above 24 items.
- Preserve the large field size (`lg:h-9`); unknown control sizes still throw. A numbered jump reads "1 to 9"; a truncated name list reads "and N more".
- The staged-only attribution check predates this refactor. It was excluded from the four introduced regressions.

## Traps
- Do not rewrite `150ff3f65` or amend a commit to fix its message.
- A token replacement of `host.docker.internal` also rewrites its escaped scanner form. `fork_outbound_scan.py --write` rewrites the whole inventory; remove only reviewed entries.
- The default pytest basetemp under the user temp directory returns Access denied. Use distinct, short, writable scratch paths.
- Empty Bank/Dataset/Studio fixtures skip image or clip states. Cold Bank/Studio probes can miss an opener or report unmarked chrome. Use populated isolated fixtures, inspect skipped states and repeat a cold-start miss warm; never weaken probe limits.
- Keep the escaped U+2026 inside `doesNotMatch` regexes; removing it makes the check reject the new label.
- `scripts/gates.ps1` stops at the first failing step. A targeted pytest run does not satisfy the landing gate. Local tests and probes require explicit permission; a commit request does not grant it.

## Verify
This session ran the targeted node tests named in the fix and `npm run build`. Those are not the landing gate.
Run the documented checks in a separate cloud task against the exact fix commit. Do not execute them locally without permission. Isolate all five user-state roots before application imports, and point the frontend at an isolated backend before exercising writes.

Prior handoff evidence, not rerun here: two Gates runs on `281b713f8` exited 0, each reporting 10025 passed, 9 skipped, 390 warnings and 8 subtests. The logs did not identify the skips. Docker was not run.
Prior warm responsive evidence, not rerun here: Datasets with 30 datasets, 35 measurements; Bank with 30 empty banks, 24 measurements; Studio with an empty dataset, 25 measurements; Bank with one image per bank, 38 measurements including review at 360. Each exited 0 with no violations; empty fixtures skipped absent image/clip states.

```powershell
Set-Location frontend
node --import ./scripts/registerSdk.mjs --test src/components/bank/bankGroups.test.js src/pages/plugins/installedPlugins.test.js tests/pagination.test.mjs tests/plugin-framework-guide.test.mjs
npm test
npm run lint
npm run build
npm run probe:responsive -- --url http://127.0.0.1:5173/#/bank
Set-Location ..
.venv\Scripts\python.exe -m ruff check .
pwsh -File scripts/gates.ps1 -Phase Gates
```

After frontend or guide fixes, keep source changes and the consolidated `build(frontend):` bundle in separate commits. Obtain any required push authorization before publication; keep main unchanged until the required cloud gates pass.
