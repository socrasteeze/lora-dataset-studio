# HANDOFF

**Updated:** 2026-10-18 | **Branch:** validation/image-source-importer | **Base:** 5306f107f | **Validation:** frontend only

## State
Image Sources is implemented on the task branch. Coverage uses gallery-dl,
yt-dlp and a configured host folder for operator-owned GDLOPS extractors.
Frontend cloud qualification passed on source and bundle commit
`d037bba2b5a0f9ff7758810d98420cd6c59f14f0`. The following handoff update changes
documentation only. Backend behavior and live provider access remain unverified.
Main and the running checkout remain unchanged. The follow-up mobile header
spacing fix is implemented but awaits its own cloud frontend qualification.

## Done this session
- Added named/generic gallery-dl and yt-dlp resolution, nested media windows, local extractor loading, durable jobs and explicit restart recovery.
- Added source-native downloads, scoped source credentials, public HTTP(S) transport, bounded ZIP extraction and original-file downloads for other media.
- Shared Image Sources between Bank and Dataset. Preserved source tags separately from captions and kept new images pending review.
- Added optional Setup installation, write-only credentials, source attribution, regression tests and a five-size cloud browser probe.
- Fixed the first cloud findings: parsed API responses, Setup install reachability, secret inventory, core table counts and the synthetic gallery-dl message shape.
- Preserved extractor cookie domains and applied Pawchive original expansion to alternate source domains. Added unexecuted backend regression cases for later authorization.
- Added explicit select labels, the expanded Setup catalog fixture and the new reserved Guide anchor. Kept checkbox changes visible until server acceptance, with rollback on failure.
- Kept action positions fixed during active jobs. The source probe holds synthetic downloads open to measure busy layouts and requires an accepted import response.
- Completed cloud run 39184077483 on the exact source and bundle above. All source, Bank and curation browser checks passed. Frontend Node suites reported 6306 passed, 4 skipped and zero failures.
- Updated Guide, fork policy and outbound inventory. Backend source lint and the frontend build pass. ESLint has no errors and 32 existing warnings.
- Follow-up: stacked the active profile below the app title, grouped dataset identity and actions, gave phone actions equal widths, and bounded long trigger words. Added cloud checks for header spacing, long text and More-menu stability. New rendered results are pending.

## Open
1. Backend tests are disabled by direct operator order on 2026-10-18, until explicitly re-enabled. Do not run or dispatch them, including backend-bearing Quick/Gates phases. Static lint is permitted. This branch is not qualified to land on main.
2. Live provider access needs operator-selected sources and credentials. Synthetic qualification does not prove live site availability.
3. Physical phone/PWA acceptance remains an operator check. No local test run, real download or GPU job was used for this qualification.

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
Evidence: https://github.com/socrasteeze/lora-dataset-studio/actions/runs/39184077483

- Source receipt: 10/10 Bank/Dataset viewport states, zero skips, ten busy-layout checks and one download-only video check. No overflow, clipped controls, small targets or overlaps were reported.
- Bank imports, Settings and curation rendered checks passed.
- ESLint, build, frontend Node suites and backend source lint passed. ESLint retained 32 existing warnings; four existing frontend tests skipped.
- Static privacy scan inspected 3042 tracked/untracked text files with zero findings. The backend privacy and outbound behavioral suites were not run after the operator disabled backend tests.
- Full Fork Gates was skipped deliberately. No backend suite, live-provider, physical-device, main publication or release qualification is claimed.
