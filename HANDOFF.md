# HANDOFF

**Updated:** 2026-10-08 | **Branch:** main | **Base:** c54ad0a51

## State

The offline fork source and rebuilt frontend are in local `origin/main` through `ff9623f34`.
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
`3fe3d4f0e`. The review used fork commit `8eb52792b` and merge base
`d13337cc3`. Git counted 656 fork-only and 16 upstream-only commits. The
latter count is an ancestry difference, not 16 missing features.

| Upstream commits | Decision and evidence |
| --- | --- |
| `19f13edaa`, `fbeecb7f7`, `3658f9766` | Bank edit history and undo already ported as `91e508c0a`; feed ordering carried as `83326b3ea`; fork bundle already rebuilt. |
| `1e520ab1f`, `f73ba6dc9` | Persistent dataset comparison already ported as `be3ffd25f`, with the fork bundle rebuilt. |
| `16510a496`, `7df8eaf8b`, `ba403227b` | Model-download revision and H3 startup recovery already ported as `e5f831b0f`, with release note `5a49ca2b0`. The model fix is patch-equivalent. |
| `af799647d` | Worker test doubles and watermark polling assertions are already covered by fork-specific adaptations. Preserve those adaptations. |
| `4b902f150`, `fe4697e40` | Unlimited API batches do not apply. Keep the local queue limits. |
| `bd0c3c8b9`, `4bdddc855`, `95d8702a7`, `4bfbf7c48` | Skip the optional support banner and its Patreon wording. The banner is absent here. |
| `d61fa0af1` | Keep the fork version `2026.10.01+fork`. |

Decision: adopt nothing through `ba403227b`. That review was not repeated
for this push. A later review starts after `ba403227b`. Do not merge
`upstream/v1` or `upstream/v2`.

## Branches

The offline fork has landed on `main`; preserve the excluded-feature boundaries below.
Local branches already contained in `main` can be deleted after the push.
`noble/confident-hodgkin-8c729a` still contains the plugin store this fork
removed. Merging it would put that store back. Its useful intent, a catalog
that offers nothing and no usage statistics, is already stronger here.
`noble/elated-ramanujan-aa8fce` is an older Bank filter restoration. Current
`main` already has the tag filter, reject reasons and Clear all.
Leave `perf/joycaption-throughput` and `ux/bank-queue-fixes` alone. Both are
checked out in other worktrees.

## Open

1. The supplied audit reports CI 37475417406 green at `ff9623f34`. Preserve its exact-commit evidence; do not reopen delivered source/bundle work.
2. Reconcile exact-commit cloud Gates and responsive evidence. Green CI alone does not close missing optional coverage or physical acceptance. Local tests remain permission-gated.
3. Do not restore excluded online features to satisfy an old test or an
   upstream issue.
4. (2026-10-06): `frontend/src/index.css` forces 16px form controls on
   `(pointer: coarse)` as well as below 640px, so iOS stops zooming into the
   type-DELETE field on a phone held sideways or an iPad, and clips sideways
   overflow on `html`/`body` with `overflow-x: clip`. The mobile-input-zoom
   contract test follows. `frontend/dist` is rebuilt in a separate commit.
5. (2026-10-08): Bank progress, Curate, and Review cleanup is uncommitted on
   `main`. Next, when a local run is allowed: the Bank review, curation, and
   `uxBatchQ` source tests, then a browser pass of Bank and Review at phone
   and desktop widths. Do not commit, push, run Gates, or rebuild
   `frontend/dist` with this source. No browser pass was run.

## Traps

- Do not run tests, responsive probes or `scripts/gates.ps1` locally without
  explicit permission.
- Isolate `LDS_DATA_DIR`, `LDS_CONFIG`, `LDS_ENV`, `LDS_PLUGINS_DIR` and
  `LDS_EXTENSIONS_DIR` before importing the app.
- Keep `backend/app/scrape/netfetch.py`. Local video uploads use its size cap.
- Keep `cloud_training.py` for local run history, checkpoints and the gallery.
- Source and `frontend/dist` remain separate commits.

## Agent-ready follow-up - October 6, 2026 PDT

**Reviewed:** `main` at `ff9623f347`. This review used local source and the supplied audit.

1. Record the exact `ff9623f34` cloud Gates and responsive receipts before claiming complete qualification. The audit reports CI 37475417406 green for heavy tests/build/lint, with the CPU torch overlay skipped.
2. Preserve the shipped iOS input/overflow source and rebuilt frontend. Separate code delivery from physical-device proof.
3. Use `FORK_NOTES.md` and `docs/OFFLINE_WORKFLOWS.md` as current authority. Do not revive excluded features from the older `PLAN.md`.

**Evidence/source:** Local source/bundle commits `1324dceac` and `ff9623f34`; supplied CI snapshot; `AGENTS.md`, `scripts/gates.ps1`, and `frontend/scripts/responsiveProbe.mjs`.
**Operator gates:** Local tests, responsive probes, fixtures, and test-bearing Gates phases require explicit permission. Missing overlay coverage must remain visible.
**Runtime gates:** GPU quality, real data, physical phone/PWA, and live deployment remain separate. No tests, probes, build, or install ran here.
