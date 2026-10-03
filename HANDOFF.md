# HANDOFF

**Updated:** 2026-10-03 | **Branch:** docs/upstream-review-2026-10-03 | **Base:** c60852194

## Upstream review: no adoptions

The first upstream fetch after the refactor was completed on 2026-10-03.
`git fetch upstream` found no new branch commits. The default branch is `v2`;
its tip remains `ba403227b9247bfd323dea2b27dd44153c83562e`
(`build(frontend): include H3 plugin startup fix`, 2026-09-29).
`git ls-remote --symref upstream` independently confirmed that tip.
`v1` remains at `3fe3d4f0e`.

**Decision: adopt nothing through upstream tip `ba403227b`.** No merge,
cherry-pick, application change or bundle rebuild was performed in this review.
Continue treating upstream as a read-only source for occasional cherry-picks.

The review used fork commit `8eb52792b` and merge base `d13337cc3`.
Git counted 656 fork-only and 16 upstream-only commits. The latter count is
an ancestry difference, not 16 missing features: useful changes already have
fork commits or fork-specific equivalents.

| Upstream commits | Decision and evidence |
| --- | --- |
| `19f13edaa`, `fbeecb7f7`, `3658f9766` | Bank edit history and undo already ported as `91e508c0a`; feed ordering carried as `83326b3ea`; fork bundle already rebuilt. |
| `1e520ab1f`, `f73ba6dc9` | Persistent dataset comparison already ported as `be3ffd25f`, with the fork bundle rebuilt. |
| `16510a496`, `7df8eaf8b`, `ba403227b` | Model-download revision / H3 startup recovery already ported as `e5f831b0f`, with release note `5a49ca2b0` and the fork bundle rebuilt. The model fix is patch-equivalent. |
| `af799647d` | Worker test doubles and watermark polling assertions are already covered by fork-specific adaptations. Preserve those adaptations. |
| `4b902f150`, `fe4697e40` | Unlimited API batches are inapplicable to the local-only generation policy. Keep configured local queue limits. |
| `bd0c3c8b9`, `4bdddc855`, `95d8702a7`, `4bfbf7c48` | Skip the optional support banner and associated Patreon guide wording, link fix and bundles. The banner is absent here, and the guide has no corresponding broken Patreon link. |
| `d61fa0af1` | Keep the fork version `2026.10.01+fork`; do not adopt upstream's release identity. |

Only this handoff is changed for publication. It is based on the newer fork tip
`c60852194`, preserving the three fork commits published after the review base.
No tests, probes, application imports or Gates were run for this documentation
update. The prior validation evidence below is historical, not a fresh result.
Publish this documentation branch only; main landing still requires the cloud
gate specified in AGENTS.md. A later review should start with commits after
`ba403227b` and check fork equivalents before proposing an adoption.

## Previous refactor handoff (carried forward)

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
