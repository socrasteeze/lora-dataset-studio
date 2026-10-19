# HANDOFF

**Updated:** 2026-10-19 | **Branch:** validation/image-source-importer | **Base:** 5306f107f

## State
The five Image Sources usability fixes are implemented on the isolated task branch.
This wave uses build, lint and source/privacy inspection only. Tests and rendered validation are not run or claimed.

## Done this session
- Separated New Scan from saved jobs and displayed the actual source and destination for each job.
- Preserved blank credential fields, added explicit confirmed clearing, and retained unsaved edits on failure.
- Bound preview requests to visible image IDs, retained that batch for Resume, and kept download selection independent.
- Reused the shared image viewer for zoom and page navigation, with cached originals and explicit thumbnail/error notices.
- Restored shared desktop/mobile control sizing, moved expert fields into Advanced, and highlighted the next job action.
- Updated help, guides, future probe navigation, and the branch's test policy to match the operator's replacement instructions.

## Open
1. Tests, browser probes and live-provider checks were not run for this wave. Run only a scope explicitly requested by the operator.
2. Main has advanced beyond this branch's base. Reconcile current main before landing if integration is requested; preserve the running checkout.
3. Backend behavior and provider access remain unverified. Use operator-selected sources and credentials for any later authorized live checks.
4. Physical phone/PWA acceptance remains unverified. Prior rendered qualification does not cover these changes.

## Decisions
- Keep saved job destinations fixed; New Scan settings create a separate job.
- Preview the visible page, up to 24 images, regardless of download selection; persist its IDs for restart recovery.
- Blank credential fields preserve stored values. Clear Credentials is a separate confirmed action.
- The viewer uses local cached images and supplies no library ID, so it exposes no generation or repair actions.
- Preserve all public gallery-dl/yt-dlp sources and the trusted local GDLOPS loader. Do not copy private extractor code.
- Keep manual actions, Pending imports, original bytes and source tags separate from captions. No automatic online resume or subscriptions.

## Traps
- Do not switch, rebuild or restart the original running checkout as part of this branch work.
- Never import create_app against production state. Isolate all five LDS runtime paths before an explicitly authorized test run.
- Never run or trigger tests without an explicit request. Every push must have [skip ci] on its tip unless CI tests are requested.
- Keep frontend source and the rebuilt frontend/dist in separate commits. A task-branch push does not land main.
- Only image assets may use inline cached-file responses. Other media remains an attachment.
- The browser probe was adjusted for New Scan and Advanced navigation and the shared 32px desktop/40px touch contract; it was not executed.

## Verify
Permitted static checks for this wave:
```powershell
.venv/Scripts/python.exe -m ruff check .
cd frontend
npm run lint
npm run build
```
Use the configured pinned interpreter when the task worktree has no .venv.
Review the diff and run the static scanner from scripts/scan-sensitive.sh before delivery.
Completed: Ruff passed; ESLint passed with 32 existing warnings and zero errors; the production frontend build passed.
The static privacy scan inspected 3044 tracked/untracked text files with zero findings. The final diff has no whitespace errors.
No backend tests, frontend tests, responsive probes, fixture server or real download ran in this wave.
