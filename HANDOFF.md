# HANDOFF

**Updated:** 2026-10-05 | **Branch:** noble/drop-external-plugins, landing on main | **Base:** fe6a7822d

## State

The offline fork is the tree being committed and pushed to `origin/main`.
Source and `frontend/dist` stay in separate commits. Local Gates were not run.
GitHub CI on the pushed `main` is the check for this delivery.

## Where this fork differs

The current rules are [FORK_NOTES.md](FORK_NOTES.md) and
[docs/OFFLINE_WORKFLOWS.md](docs/OFFLINE_WORKFLOWS.md).

What stays: the ten bundled plugins, local generation and training, the HTTP
API, localhost and operator-entered private peers, and Setup downloads the
operator starts.

What is refused: public product APIs, rented GPUs, Civitai browsing and
publishing, Hugging Face publishing, external plugin archives, online media
import, in-app update checks, the plugin catalog, and usage statistics.
Saving `HF_CLOUD_TOKEN` is refused and the token is not stored. Flask does
not load the repository `.env` on startup.

## Upstream review carried forward

On 2026-10-03, `upstream` `v2` was still `ba403227b`
(`build(frontend): include H3 plugin startup fix`, 2026-09-29). `v1` was
`3fe3d4f0e`. Decision recorded then: adopt nothing through `ba403227b`.
That review was not repeated for this push. A later review starts after
`ba403227b` and checks fork equivalents before proposing an adoption.
Do not merge `upstream/v1` or `upstream/v2`.

## Branches

`noble/drop-external-plugins` is the line that lands on `main`.
Local branches already contained in `main` can be deleted after the push.
`noble/confident-hodgkin-8c729a` still contains the plugin store this fork
removed. Merging it would put that store back. Its useful intent, a catalog
that offers nothing and no usage statistics, is already stronger here.
`noble/elated-ramanujan-aa8fce` is an older Bank filter restoration. Current
`main` already has the tag filter, reject reasons and Clear all.
Leave `perf/joycaption-throughput` and `ux/bank-queue-fixes` alone. Both are
checked out in other worktrees.

## Open

1. GitHub CI on the pushed `main` must pass. Fix failures with new commits.
2. Cloud Gates, responsive probes and the full local suite were not run.
3. Do not restore excluded online features to satisfy an old test or an
   upstream issue.

## Traps

- Do not run tests, responsive probes or `scripts/gates.ps1` locally without
  explicit permission.
- Isolate `LDS_DATA_DIR`, `LDS_CONFIG`, `LDS_ENV`, `LDS_PLUGINS_DIR` and
  `LDS_EXTENSIONS_DIR` before importing the app.
- Keep `backend/app/scrape/netfetch.py`. Local video uploads use its size cap.
- Keep `cloud_training.py` for local run history, checkpoints and the gallery.
- Source and `frontend/dist` remain separate commits.
