# HANDOFF

**Updated:** 2026-10-18 | **Branch:** validation/image-source-importer | **Base:** 5306f107f | **Tree:** dirty

## State
Image Sources implementation is on the task branch. Cloud qualification is pending; main and the original running checkout remain unchanged.

## Done this session
- Added manual gallery-dl acquisition, durable jobs, explicit restart recovery, public-only network transport and bounded ZIP intake.
- Shared Image Sources between Bank and Dataset. Preserved source tags separately from captions and kept new images pending review.
- Added optional Setup installation, write-only credentials, source attribution, regression tests and a five-size cloud browser probe.
- Updated Guide, fork policy and outbound inventory. Both linters, the frontend build and static privacy scan passed before final packaging.

## Open
1. Push the scrubbed source and separate bundle commits to this validation branch, then inspect Full Fork Gates on that exact head.
2. Repair any cloud failures and repeat qualification after changes. No local tests or probes are authorized.
3. Verify live provider access with operator-selected sources and credentials. Synthetic qualification does not prove live site availability.
4. Physical phone/PWA acceptance remains an operator check. No GPU or training job belongs in acquisition validation.

## Decisions
- Keep the retired scrape plugin excluded. The core image_sources route provides a narrow operator-started acquisition exception.
- Manual jobs only. Scheduled subscriptions and forum-thread boards remain outside this wave.
- Downloads and imports have separate receipts. Import retries preserve verified bytes, review decisions and edited captions.
- Rescan refreshes temporary URLs without clearing selections or cached originals. Remote listing changes can shift cursor windows.
- ZIP only for archive intake. RAR, 7z and animated images do not enter static image imports.

## Traps
- Use the isolated task worktree. Do not switch or rebuild the original running checkout.
- Do not call create_app against production state. Isolate all LDS runtime paths before any test import.
- Keep frontend source and frontend/dist in separate commits. A validation push does not authorize landing main or a release.
- Image Sources must never resume online work at boot or on a status/preview GET. Controlled restarts refuse active source jobs.

## Verify
Cloud only:
```powershell
./scripts/gates.ps1 -Phase Gates -ScratchRoot D:/lds-gates
node frontend/scripts/imageSourcesProbe.mjs
```
