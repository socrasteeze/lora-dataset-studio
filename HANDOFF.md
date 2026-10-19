# HANDOFF

**Updated:** 2026-10-19 | **Branch:** validation/image-source-importer | **Base:** 5306f107f

## State
Full-subject Auto-Center is implemented in the shared Crop editor for Bank, Dataset and references.
Build and lint pass. No tests, model calls or rendered validation ran during implementation; delivery keeps CI off.

## Done this session
- Added Full Subject (default) and Face & Head suggestions to the shared crop editor.
- Added a bounded, metadata-free preview endpoint through the existing local vision provider and GPU ownership window.
- Kept the detected subject inside the crop; refused incompatible ratios and reported edge-limited centering.
- Retained the crop selection on failed saves and ignored stale or cancelled suggestion responses.
- Fitted the image and handles to the space left by the crop controls, including wrapped status text.
- Updated README, Guide, help and What's New; added parser/geometry regression cases without running them.

## Open
1. Tests, model detection accuracy and rendered behavior are unverified. Run only an explicitly requested scope; this delivery does not claim qualification.
2. Main has advanced beyond this branch's base. Reconcile current main before landing if integration is requested; preserve the running checkout.
3. The backend must restart after this branch is installed to register the new endpoint. The existing local vision model must be configured in Setup.
4. Physical phone/PWA acceptance remains unverified. Earlier source-panel screenshots do not cover Auto-Center.

## Decisions
- Full Subject keeps the visible body and trims unused surrounding space with roughly 10% padding per edge; the user reviews before pressing Crop.
- Bank, Dataset and reference editors analyze their exact loaded preview, with normalized coordinates mapped back to natural pixels.
- Auto-Center uses the configured local vision model only after a click. It adds no package, model download or external service.
- Cache detection per image URL and framing; ratio changes reuse it. A ratio that cuts the detected subject is refused.
- Apply preserves the existing crop contracts: Bank saves a derivative; Dataset crops its training image and caps its long side at 1024 without enlargement.
- Failures retain the current box. Cancel closes without applying; an in-flight model call may finish, but the endpoint never edits a file.
- Manual handles remain available when vision setup or detection fails.
- Preserve the accepted scraper layout and the Bank review portal/scrollable footer from the preceding delivery.

## Traps
- Do not switch, rebuild or restart the original running checkout as part of branch work.
- Never import create_app against production state. Isolate all five LDS runtime paths before an authorized runtime check.
- Never run or trigger tests without an explicit request. Every push must have [skip ci] unless CI tests are requested.
- Keep frontend source and the rebuilt frontend/dist in separate commits. Branch publication does not land main.
- Do not move Auto-Center inference into mount effects or passive requests; the explicit action may load the configured local model.
- Keep failed-save exceptions reaching CropModal so Bank and Dataset editors retain their selections.

## Verify
Permitted static/build commands:
```powershell
.venv/Scripts/python.exe -m ruff check .
cd frontend
npm run lint
npm run build
```
Use the configured pinned interpreter when the task worktree has no .venv.
Completed: Ruff passed; ESLint passed with 32 existing warnings and zero errors; production frontend build passed.
The static outbound inventory is unchanged. The new endpoint reuses reviewed local vision transports and writes no image files.
Privacy inspection covered 3048 tracked/untracked text files with zero findings; attribution inspection has no unresolved findings.
Regression files: backend/tests/test_auto_center.py and frontend/src/components/dataset/autoCenterCrop.test.js. Neither ran.
No backend/frontend tests, responsive probes, fixture captures or model/GPU inference ran for Auto-Center.
