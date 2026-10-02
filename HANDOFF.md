# HANDOFF

**Updated:** 2026-10-01 | **Branch:** noble/refactor-review-handoff | **Base:** 8eb52792b | **Tree:** clean

## State
Source review of `f3815e82e..8eb52792b` found four P2 regressions. No fixes applied; no tests, probes, builds or application startup ran during this review or handoff.
At review start, `main` matched `origin/main` at `8eb52792b`. This branch carries only the review handoff; the commit is local and no push is authorized.

## Done this session
- Checked the refactor diff, affected callers and applicable repository rules. Confirmed all four findings against the previous implementation.
- Recorded the findings, proposed remedies and verification work below. The findings remain open.

## Open
1. **P2: Keep Bank groups intact across pages.** `frontend/src/pages/BankPage.jsx:383,846` paginates raw banks before calling `groupRows`.
   With 25 same-name banks, page one shows a 24-member group with partial counts, but promotion acts on all 25. `backend/app/services/bank_groups.py:72` resolves the complete server group; `frontend/src/components/bank/BankGroupPromoteDialog.jsx:58-59` quotes page-local counts.
   Build complete display groups before pagination or keep groups atomic. Preserve raw-bank selection behavior. Add behavioral coverage for groups crossing a page boundary and matching displayed action scope.
2. **P2: Restore plugin interface failure diagnostics.** `frontend/src/pages/plugins/InstalledPlugins.jsx:40-44` derives active state from the backend alone.
   A frontend script or stylesheet failure remains in `window.lds.loadProblems`, but `frontend/src/pages/PluginsPage.jsx` removed its failure alert and reload action. The plugin can appear as "Active now" without a working interface.
   Restore the alert and recovery action, or merge browser load failures into card state. Check `frontend/src/plugins/loadPlugins.js:134-187` and `frontend/src/pages/PluginSettingsPage.jsx:23-34`; cover script, stylesheet and descriptor failures.
3. **P2: Show ZIP compatibility failure details.** `frontend/src/pages/PluginsPage.jsx:156-158` retains `compatibility_issues`, but line 268 replaces the issue list with a generic refusal.
   A missing dependency or required API version disables Install without explaining the corrective action. Render the returned issue messages and retain fallback guidance when details are absent.
   The response originates in `backend/app/plugins/routes.py:246-250`; dependency guidance comes from `backend/app/plugins/compatibility.py:71-76`. Cover blocked inspection with and without issue details.
4. **P2: Finish updating the plugin installation guide.** `docs/guide/installation.md:7,19` still directs users to the removed Store and "Plugins -> Updates".
   Replace those instructions with the installed-plugin and trusted-ZIP workflow. The introduction at line 5 already describes that workflow. Applicable rule: `.claude/rules/readme-and-docs.md:17-19` requires correcting descriptions of behavior that is no longer true.
   Audit the remaining guide references to removed screens. Guide edits need a rebuilt bundle because the guide is served from `frontend/dist`.
5. **Carry forward the release boundary.** Do not restore `bundled/civitai_publish`. Keep the link tables, `CIVITAI_API_KEY`, cloud/API compatibility shims and twelve enabled plugins.

## Decisions
- Use `f3815e82e` as the refactor baseline recorded in PLAN.md, rather than the supplied current-HEAD base, whose diff is empty.
- Keep this handoff as a local documentation commit on a task branch. Fix implementation and validate it in a later authorized task.
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
