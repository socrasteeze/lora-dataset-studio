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
