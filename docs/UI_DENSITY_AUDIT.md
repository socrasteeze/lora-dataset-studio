# UI Stability Audit — LoRA Dataset Studio
Scope: Bank, Dataset, Studio, Settings, Setup, Plugins, Guide, Gallery, Runs and enabled plugin surfaces | Viewports: NOT RUN | Runtime: static-only

## Verdict
BLOCKED: the source pass is implemented; tests and rendered checks are deferred by the user's explicit no-tests instruction. Task-branch publication does not establish layout qualification.

## Findings
| # | Check | Status | Severity | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | Bank creation and workspace nesting | WARN | POLISH | `frontend/src/pages/BankPage.jsx`, `frontend/src/components/bank/BankWorkspace.jsx` | Removed repeated outer boxes; render creation, split preview and workspace states. |
| 2 | Lane widths and control alignment | WARN | SHIFT | `frontend/src/components/bank/BankLaneTabs.jsx`, `bundled/video/frontend/pages/VideoBankPage.jsx` | Use equal-width single-row lane choices and common field/action heights; measure all viewport sizes. |
| 3 | Host and SDK field heights | WARN | SHIFT | `frontend/src/components/common/controls.js`, `sdk/frontend/ui.js` | Fix phone heights at 40px and preserve desktop sizes; verify textareas remain multiline. |
| 4 | Nested disclosures/options | WARN | POLISH | `frontend/src/components/bank/BankPassesPanel.jsx`, `frontend/src/components/bank/BankOverview.jsx`, `frontend/src/components/bank/BankWorkspace.jsx` | Keep one overview disclosure and dividers within pass dialogs; verify opening and live refresh. |
| 5 | Dataset and Studio density | WARN | POLISH | `frontend/src/components/dataset/DatasetListPanel.jsx`, `CaptionToolsBar.jsx`, `TrainingPanel.jsx`, `studio/` | Cut repeated primers and excess gaps; align primary and advanced training fields/actions and dialog controls; render populated workflows. |
| 6 | Remaining routes and plugins | WARN | POLISH | `frontend/src/pages/SettingsPage.jsx`, `SetupPage.jsx`, `PluginsPage.jsx`, `GuidePage.jsx`, `bundled/*/frontend/` | Tighten repeated spacing and labels while retaining independent tool cards and setup guidance. |
| 7 | Interaction movement, overlap, truncation and touch targets | NOT RUN | SHIFT | AGENTS.md local-test permission gate | Run the existing responsive probe with populated isolated fixtures, inspect skipped states and visually review screenshots. |
| 8 | Cross-route geometry and text stress | NOT RUN | SHIFT | No rendered run | Measure shared landmarks and same-row fields/buttons; exercise toggles, dialogs and long names. |
| 9 | Source and bundle compilation | PASS | POLISH | `npm run build` exited 0 | Consolidated `frontend/dist` rebuilt with the final source and guide edits. |
| 10 | Static hygiene | PASS | POLISH | Frontend lint: zero errors, 32 warnings; Ruff: exit 0; diff whitespace check: exit 0 | Review remaining warnings separately; no unrelated cleanup in this pass. |
| 11 | Source census and deeper toolbars | WARN | SHIFT | Read-only JSX inventory: 357 source files; manual review of flagged sibling groups | Normalize Runs, Repair, timeline, model-picker, Canvas and Video controls. Source classes require rendered confirmation. |

## Coverage and retained boundaries
Bank coverage includes creation, filtering, grouped browse, passes, captions, overview and queue controls. Dataset coverage includes library, creation, curation, caption tools, import/export and primary training rows. Studio includes selection, prompts, axes and results spacing.

Settings, Setup, Plugins and Guide shells use denser spacing. The plugin pass covers Video Bank/Dataset, Canvas layout and undeploy actions, Camera Angles, DLSS, Qwen, Live and SeedVR2 preparation, and image/video scraping. Gallery selection actions and the Runs hub use consistent control sizing. Shared Repair, improve, watermark, model-picker and timeline controls use the same sizing system. Specialized merge/publishing tools retain independent operation boundaries.

Destructive confirmations, conflict alerts, model/install guidance, unsaved-work recovery, measured results and functional help icons remain. Stored identifiers, probe limits and catalog labels remain. Updated contracts were not run. No claim of measured space savings, complete height parity or runtime qualification is made.

## Flat sections, 2026-10-03

Scope: the host application and enabled plugin interfaces. The source census covered 357 JSX files. The pass replaces 159 structural frames in 96 JSX files with the shared `lds-section` style in `frontend/src/index.css`. The public SDK's Card delegates to the host Card, so plugin settings inherit the same layout.

| Check | Status | Evidence | Remaining verification |
|---|---|---|---|
| Repeated structural framing | WARN | Flat groups replace rounded backgrounds, outer outlines and horizontal inset padding in Bank, Dataset, Studio, training, Runs, Settings, Setup, Guide and plugin tools. | Inspect populated pages, expanded sections and dialogs at the supported viewports. |
| UI behavior preservation | PASS, source only | Comparing parsed source before and after, while excluding className attributes, found no other changes in the 96 edited JSX files. | Exercise actions, drafts, disabled states and recovery when validation is authorized. |
| Meaningful boundaries | PASS, source only | Dialog shells, alert colors, record cards, media surfaces, output viewers and segmented controls retain their own boundaries. Setup opt-out confirmation frames remain. | Confirm focus visibility, contrast and reachable touch targets in rendered views. |
| Shared section alignment | WARN | Shared Card, SettingsGroup, StudioSection and Bank folds use flat sections; Settings and Bank headers align with their content. | Measure open/close states and cross-route geometry. |
| Frontend compilation and lint | PASS | `npm run build` exited 0; `npm run lint` reported zero errors and 32 warnings. `frontend/dist` was rebuilt from the current working tree, including the pre-existing caption UI work. | No runtime claim follows from compilation. |
| Diff and privacy checks | PASS | `git diff --check` exited 0. `scripts/scan-sensitive.sh` scanned 3049 tracked and untracked text files and reported zero findings. | These checks do not qualify rendered layout. |
| Runtime, responsive coverage and Gates | NOT RUN | The existing instruction defers tests and probes. No app instance or fixture was started for this pass. | Use isolated, populated fixtures and the existing responsive probe after permission; keep its thresholds and skipped-state reporting. |

The new What's New entry is `2026-10-03-flat-workspace-sections`. This pass changes framing and spacing. It does not change catalog labels, config keys, routes, event handlers or data ownership. The unfinished caption backend remains separate work. No commit, push or landing on main was performed for this pass.

## Offline Policy Follow-Up

The user's offline-only constraint removes Hugging Face publishing and web scraping from the curated distribution. Civitai and online media imports are refused at their entry points; the updater's online APIs are also unavailable. Local API validation and offline inference/training environments support the remaining local workflows. Details and the preparation exception are in `docs/OFFLINE_WORKFLOWS.md`.

The ten-plugin build was compiled separately and then activated with the user's approval. LDS started with browser opening disabled and completed a guarded restart after the final source changes. Health was ready; all ten local plugins loaded on API 1.24 with zero lifecycle errors. Ruff, frontend lint, syntax compilation and the privacy scan passed. Offline regression coverage was updated but remains NOT RUN. This changes runtime admission in addition to the preceding class-only layout pass. Startup status does not qualify rendered layout or runtime network behavior.
