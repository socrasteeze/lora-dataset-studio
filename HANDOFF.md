# HANDOFF

**Updated:** 2026-09-28 | **Branch:** `main` | **Deployed build:** `efe277cc7`

## State
Mobile workflow and origin/main are integrated, published and running.
The full delivery gate passed. The idle-checked restart and data checks passed.

## Done this session
- Mobile source: e9a242de1; isolated frontend bundle: c6ef14f5f.
- Added in-app host-drive browsing, resumable imports, caption recovery and shared guidance.
- Related actions use equal-width rows; 30 rows passed at five viewport sizes.
- Preserved incoming Camera Studio, video picker, Python picker and release-contract fixes.
- Full gate: 10,343 backend/tooling passes, 106 subtests, 244 plugin Python passes and 6,283 frontend passes.
- Published source merge 430cf48e1 and separate frontend build efe277cc7 to origin/main.
- Final responsive probe: 15 measured states, zero findings and zero skipped states.
- Backed up the live database, configuration and previous frontend before activation.
- Restart confirmed a new healthy process serving the checked-out build; database integrity, unchanged row counts and recovery identities passed.

## Open
1. Physical-phone, real-model training and Docker runtime qualification remain separate.

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
