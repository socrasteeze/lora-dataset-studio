# HANDOFF

**Updated:** 2026-09-28 | **Branch:** `noble/mobile-dataset-build` | **Integration base:** `422b8085e`

## State
Mobile workflow and origin/main are integrated; the full delivery gate passed.
Clean push and an idle-checked restart are authorized and ready to execute.

## Done this session
- Mobile source: e9a242de1; isolated frontend bundle: c6ef14f5f.
- Added in-app host-drive browsing, resumable imports, caption recovery and shared guidance.
- Related actions use equal-width rows; 30 rows passed at five viewport sizes.
- Preserved incoming Camera Studio, video picker, Python picker and release-contract fixes.
- Full gate: 10,343 backend/tooling passes, 106 subtests, 244 plugin Python passes and 6,283 frontend passes.

## Open
1. Commit the qualified source merge and the separately rebuilt frontend.
2. Recheck origin/main and both clean passes, then publish without force.
3. Verify idle state, protect the live database/configuration, update the primary checkout and restart.
4. Verify remote parity, served frontend and backend recovery identities after restart.
5. Physical-phone, real-model training and Docker runtime qualification remain separate.

## Decisions
- Browser folder selection works against drives visible to the host account.
- Pending upload originals stay in the browser until completion or cancellation.
- Persistent identities prevent stale browser data attaching to reused numeric IDs.
- HEIC/HEIF gets conversion guidance; no new decoder is claimed.
- AGENTS.md is canonical; CLAUDE.md is a compatibility entry point.
- Keep rejected rental/API-engine release entries out of the fork; retain legitimate public-plugin news.

## Traps
- Preserve the pre-existing untracked upscale-tests.md in the primary checkout.
- Tests must isolate data/config/env/plugin/extension state before create_app.
- postForm returns parsed JSON, not Response.
- Responsive probes need a populated --dataset-id fixture.
- Do not copy an older generated bundle over the integrated source; rebuild it.
- Upstream remains read-only. Only origin/main is authorized for this delivery.

## Verify
```powershell
pwsh -File scripts/upstream_sync.ps1 -Phase Gates -KeepScratch
& 'C:/Program Files/Git/bin/bash.exe' scripts/scan-sensitive.sh
```
