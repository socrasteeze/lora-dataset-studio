# HANDOFF

**Updated:** 2026-10-18 | **Branch:** validation/image-source-importer | **Base:** 5306f107f | **Validation:** frontend only

## State
Image Sources is implemented on the task branch. Coverage uses gallery-dl,
yt-dlp and a configured host folder for operator-owned GDLOPS extractors.
Frontend cloud qualification is pending on the final source and bundle.
Main and the running checkout remain unchanged.

## Done this session
- Added named/generic gallery-dl and yt-dlp resolution, nested media windows, local extractor loading, durable jobs and explicit restart recovery.
- Added source-native downloads, scoped source credentials, public HTTP(S) transport, bounded ZIP extraction and original-file downloads for other media.
- Shared Image Sources between Bank and Dataset. Preserved source tags separately from captions and kept new images pending review.
- Added optional Setup installation, write-only credentials, source attribution, regression tests and a five-size cloud browser probe.
- Fixed the first cloud findings: parsed API responses, Setup install reachability, secret inventory, core table counts and the synthetic gallery-dl message shape.
- Preserved extractor cookie domains and applied Pawchive original expansion to alternate source domains. Added unexecuted backend regression cases for later authorization.
- Repaired the second cloud findings: explicit select labels, the expanded Setup catalog fixture and the new reserved Guide anchor. Bank and curation browser checks passed in run 39181224076; source and Node repairs need a final cloud run.
- Updated Guide, fork policy and outbound inventory. Backend source lint and the frontend build pass. ESLint has no errors and 32 existing warnings.

## Open
1. Run frontend Node and rendered browser checks in cloud on the final head. No local test run is authorized.
2. Backend tests are disabled by direct operator order on 2026-10-18, until explicitly re-enabled. Do not run or dispatch them, including backend-bearing Quick/Gates phases. Static lint is permitted. Backend behavior is unverified; this branch is not qualified to land on main.
3. Verify live provider access with operator-selected sources and credentials. Synthetic qualification does not prove live site availability.
4. Physical phone/PWA acceptance remains an operator check. No GPU or training job belongs in acquisition validation.

## Decisions
- Keep the retired scrape plugin excluded. The core image_sources route provides a narrow operator-started acquisition exception.
- Manual jobs only. Named sites were examples, not a provider allowlist. Thread-board sources belong in the supported extractor catalog; schedules remain outside this wave.
- Downloads and imports have separate receipts. Import retries preserve verified bytes, review decisions and edited captions.
- Rescan refreshes temporary URLs without clearing selections or cached originals. Remote listing changes can shift cursor windows.
- GDLOPS grants no distribution license for its private extractor code. Add a configured local-directory loader; do not copy that code into this repository. Images remain the default media filter and only compatible images enter Bank or Dataset.
- CI and Fork Gates default backend tests off. The run_backend dispatch input must remain false until explicit authorization. Release qualification still requires the full backend gate before any landing or release.

## Traps
- Use the isolated task worktree. Do not switch or rebuild the original running checkout.
- Do not call create_app against production state. Isolate all LDS runtime paths before any test import.
- Keep frontend source and frontend/dist in separate commits. A validation push does not authorize landing main or a release.
- Image Sources must never resume online work at boot or on a status/preview GET. Controlled restarts refuse active source jobs.

## Verify
Use the Fork Gates validation-branch push workflow. It runs frontend lint,
build, Node tests and synthetic rendered probes. Backend suites stay skipped.
The earlier cloud run 39176378702 failed before the repairs above. Do not use
its partial results as qualification for this head.
