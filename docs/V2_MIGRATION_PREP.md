# V2 migration preparation

Reviewed 2026-09-20. Preparation only; the live installation has not been switched.

## Decision

Migrate the existing fork to V2 while preserving its local-only policy and its
additional features. Do not replace the fork with the stock V2 checkout. Use an
isolated integration branch, then rehearse on copied state before cutover.

The official migration helper is not applicable: `scripts/migrate_to_v2.py`
requires the official repository as `origin` and explicitly refuses forks. Do
not change the fork's remote to bypass that check.

## Pinned inputs

| Input | Revision |
|---|---|
| Current fork | `e07552151c702cd6d8c3c5ba1c582f0dcf36b978` |
| Reviewed upstream V2 | `ce92e34993b246205b01a8dff2af4422199617c8` |
| Preparation branch | `noble/lds-v2-prep` |
| Last upstream content actually integrated before V2 | `3f54addd34b0b3195a94e594013771631e34eaf3` |
| Ancestry-only V2 merge | `af674726f19a237b85da9f22aae73b063047883f` |

Use the exact reviewed V2 revision for the first integration. Review any later
upstream changes separately. The fork can retain `main` as its delivery branch;
V2 is an application architecture, not a requirement to rename the fork's branch.
The upstream comparison target becomes `upstream/v2`.

### Ancestry trap: a normal merge is insufficient

On September 16 the fork used an `ours` strategy merge to acknowledge 122 V2
commits without adopting their content. This was confirmed by comparing
`af674726f` with its first parent: the tree diff is empty. Git now reports
`3fe3d4f0e29e28de583a6e22bce886c35e5ecd3f` as the merge base and only 13 incoming
commits. That excludes the missing V2 foundation from an ordinary merge.

The complete content window from `3f54addd` to the reviewed V2 revision is 135
commits and 1,650 changed files, with 141,736 added and 20,569 removed lines.
These counts include generated files. All 135 commit subjects were reviewed;
per-commit patch classification and per-hunk integration remain implementation
work. The inventory is in [V2_INCOMING_COMMITS.md](V2_INCOMING_COMMITS.md).

A `git merge-tree --write-tree --name-only --merge-base=<content-base>` preview
against the current fork finds **226 conflicted paths: 175 source/docs/config
paths and 51 generated frontend paths**. This is an object-only preview; no
working-tree merge was applied. The source conflict inventory is in
[V2_SOURCE_CONFLICTS.md](V2_SOURCE_CONFLICTS.md).

#### Measured 2026-09-20: what the ordinary merge actually delivers

The paragraph above was predictive. It has now been executed in an isolated
worktree and aborted, and the result is worse than "insufficient" — an ordinary
`git merge upstream/v2` produces a **broken partial V2**, not a smaller one:

| Path | After ordinary merge |
|---|---|
| `backend/app/plugins` | PRESENT |
| `scripts/migrate_to_v2.py` | PRESENT |
| `bundled/` | PRESENT — but **1 of 13** plugins |
| `frontend/src/sdk` | **ABSENT** (0 of V2's SDK files) |
| `frontend/src/plugins/bundled.js` | **ABSENT** |
| `docs/plugins` | **ABSENT** |

The single plugin it delivers is `cloud_training` — the one this fork **rejects
under D4** — because that is the only bundle the fork's own tree ever touched,
so it is the only one the merge sees as changed. The twelve it drops include
every plugin the fork needs to keep: `video`, `canvas`, `model_tools`, `scrape`,
`camera_angles`, `image_upscale`, `seedvr2`, `live`, `resource_monitor`,
`hf_publish`, `civitai_publish`, and `api_engines`.

**995 upstream/v2 paths are absent after the merge completes** (excluding
`frontend/dist`). The result is backend plugin machinery with no SDK to load it
and no plugins but the rejected one — a tree that can plausibly build and import
while delivering none of the feature set. That is the failure mode this document
exists to prevent, and it does not announce itself.

Conflict-path counts for the two strategies, same tree, same day: ordinary merge
**254**, content-base merge **662**. The lower number is not the cheaper path; it
is the measure of how much content the ordinary merge never considers.

Use an explicit content-base integration or an equivalent reviewed reconstruction
that restores the omitted V2 foundation while preserving the current fork tree.
Do not rewrite history, revert the zero-change merge expecting code to appear,
or trust the ordinary behind count. Preserve the post-acknowledgement fork fixes
for cross-drive/linked model pins, removal of staging copies, and Studio weights
inside model-family subfolders.

### Current-tree verification

| Check | Result |
|---|---|
| Backend, pinned `.venv`, CPU Torch overlay, 8 workers | 9,549 passed, 22 skipped, 398 warnings; 403.61 seconds |
| Frontend `npm test` | 4,966 passed, zero failed |
| `ruff check .` | Passed |
| `npm run lint` | Zero errors; 20 existing warnings |
| Origin parity after fetch | `origin/main` equals the pinned fork HEAD |
| Live working tree | Clean after verification |
| Preparation worktree privacy scan | 7 passed, 2 skipped; optional private-name checks have no configured name list in this worktree |

Backend tests used separate `LDS_DATA_DIR`, `LDS_CONFIG` and `LDS_ENV` locations.
Node was 25.6.1; CI declares Node 24. Match CI's Node version for final migration
qualification. These are current-fork baselines, not V2 acceptance results.
This document publishes preparation only. It does not deliver application source
changes, a V2 merge, a live schema migration or a release.

## Confirmed findings

1. **Feature code moved into plugins.** The source snapshot contains 13 public
   plugin manifests under `bundled/`. The normal frontend build is a Store build;
   `frontend/src/plugins/bundled.js` registers nothing. The backend also ignores
   `bundled/` unless explicitly put into development mode. Copying source alone
   therefore does not deliver the previous feature set.
2. **The machine-routing implementation is absent from stock V2.** The fork's
   `cluster.py`, `cluster_remote.py`, `backend_worker.py`, `peer_worker.py` and
   `peer_training.py` services need to be ported. Dormant `worker_url` parameters
   and the `worker_id` database column do not replace their behavior.
3. **Bank features need explicit preservation.** The fork's bank groups, durable
   queue, splitting and WD14 tagging services/tests are absent at their current
   paths in V2. Preserve their behavior and resolve any replacement individually.
4. **A locally useful plugin can contain rejected functionality.** The V2 video
   package declares cloud training and a rental credential permission. Canvas
   also needs a local-only continuation review. Excluding only `cloud_training`
   and `api_engines` is insufficient evidence that all rental paths are closed.
5. **Discovery is not a deny policy.** A discovered compatible plugin defaults to
   enabled when its configuration key is absent. Development mode must not scan
   an unrestricted collection of upstream bundles.
6. **Startup can change state.** V2 runs additive schema updates, cleanup and
   backfills from `create_app()`, before normal request handling. A branch switch
   does not reverse these changes. Do not point even an import sanity check at
   the production data folder.
7. **Existing backup exports are not a rollback image.** `full_backup.py` exports
   datasets and a secrets-free configuration. It deliberately omits the raw
   database, runtime environments and other application state.
8. **A rehearsal copy can still reach live storage.** Configuration can contain
   absolute dataset-media roots. Database records also reference bank sources.
   Override or replace all writable paths and service endpoints in the rehearsal;
   copying only `studio.db` and `config.json` is not isolation.

## Fork requirements

The current [FORK_NOTES](../FORK_NOTES.md) remain the policy authority. Their old
upstream file paths must be mapped to the new core, SDK and plugin locations.

| Area | Required outcome |
|---|---|
| D1: generation | Keep Klein and Krea local generation, local reference editing, zero-cost engine catalog, and the local LLM providers. Do not restore API generation, subscription authentication or publishing lanes already excluded by the fork. |
| D2, D3 | Retired. Do not restore old model pins or restart an emoji-removal sweep. |
| D4: training | Keep local and owned-machine training. Exclude rented GPUs, dense rental recipes, referral links and monetization surfaces. Keep valid local conversion tools. |
| D5: tests | Port the actual carrier fixtures to their new modules; do not delete failing contracts merely because files moved. |
| D6: machine routing | Keep peer and `api:` backend namespaces, device selection, artifacts and inference routing. Scope every local GPU busy/interrupt/recovery query with the fork's local-row rule. |
| D7: carried fixes | Check the redundant claim-age condition and the 17-worker capability probe pool against V2 before retaining or retiring either patch. |
| D8: launcher | Preserve normal crash supervision, the opt-out restart loop, and the persisted browser-opening preference. |
| D9: lint | Preserve correctness gates and compare the existing warning baseline. Do not silently weaken rules. |
| D10: help | Retain fork-specific help and the current single-registry requirement. Reconcile plugin contributions without importing rejected topics. Any incompatible design choice needs a concrete proposal. |
| D11: delivery | Keep fork-specific release and update routing. Do not import upstream-only branch instructions. |
| Bank extensions | Preserve tags and tag state, separate/root-only bank semantics, grouping, splitting, durable queues and device-aware queue lanes. |
| Recent model-path fixes | Preserve direct linked/cross-drive pins, no staging copies, and Video Studio subfolder weight discovery. |

## Plugin disposition

This is the default integration scope, not approval to download, enable or run a
plugin against production. Preserve available fork features even when the current
database has no records for them.

| Plugin | Disposition |
|---|---|
| `api_engines` | Exclude under D1. |
| `cloud_training` | Exclude under D4. |
| `civitai_publish` | Keep the existing hold; the fork carries browsing, not this publisher. |
| `hf_publish` | Preserve the existing user-triggered dataset export to Hugging Face. This is distinct from the excluded cloud checkpoint storage/rental lane. Do not publish during migration. |
| `video` | Adapt for local-only operation; inspect routes, retries, continuation, worker tasks and permissions. |
| `canvas` | Adapt continuation/generation and device selection; preserve local-only guards. |
| `model_tools` | Keep local utilities; inspect full-model, rental and publishing boundaries. |
| `camera_angles`, `image_upscale`, `seedvr2` | Carry local feature parity; verify ComfyUI node preparation and shared resource fencing. |
| `scrape` | Carry source import and credentials behavior; verify bank/dataset parity and fork queue integration. |
| `live`, `resource_monitor` | Carry owned-machine behavior; check routing, network scope and GPU contention. |

For initial integration, use only a curated set of reviewed development bundles,
with matching frontend/backend build modes and explicit enablement. This is a
rehearsal mechanism, not a settled production distribution choice. Before shipping,
choose and test a reproducible fork distribution that cannot be overwritten by a
stock plugin update. Respect package provenance; do not fabricate official Store
receipts. If packages need independent identities, update ownership, settings,
dependencies and data mappings together.

## Schema review

Static comparison of `_SCHEMA_ADDITIONS` found nine additions in reviewed V2:
`face_dataset_image.fail_kind`, `cloud_training_run.video_preview_key`,
`video_dataset.best_settings`, and six fields on `video_test_clip`:
`generation_settings`, `end_image`, `user_id`, `references_json`, `ref_base`,
`ref_image_size`.

Seven fork additions are absent from that V2 list: `bank_image.tags`,
`bank_image.tags_state`, `bank_image.tags_text`, `image_bank.keep_separate`,
`image_bank.root_only`, `peer_training_run.log_offset`, and
`peer_training_run.started_at`. Keep the models, additive migration paths and
callers, not just the old columns in an upgraded database.

This is a static comparison of one migration list, not a complete schema audit.
Core/legacy/video model registration, plugin-owned tables, index changes, backfills
and cleanup must also be checked during rehearsal.

## Prepared recovery material

Recovery material is kept locally outside tracked content. Its location,
manifest and installation inventory must not be committed or published.

- SQLite backup API snapshot of `studio.db`, including committed WAL content.
- `config.json`, `.env`, `data/secret_key` and `data/setup_state.json` copies with
  verified SHA-256 values in the private manifest.
- A separate restored database copy passed `PRAGMA integrity_check`; all
  table counts matched the snapshot.
- A verified `fork-before-v2.bundle` containing the complete history reachable
  from the current fork HEAD.

**Media are not backed up by this preparation snapshot.** It is neither a
verified off-device backup nor a final cutover
snapshot. Inventory and protect external media roots and refresh state after
shutdown before cutover.

## Execution sequence and gates

1. Current-tree baselines and both linters are recorded above. Refresh only if
   the source or test environment changes. Keep full logs outside tracked content.
2. The explicit V2 ref has been fetched without pruning old refs. Complete the
   patch review using the content window and preview above, not the ordinary
   13-commit window. Classify commits adopt/adapt/reject before applying source
   changes. Exclude upstream built frontend artifacts and rebuild from fork source.
3. Integrate only in the isolated worktree. Preserve ancestry. Resolve per hunk;
   do not accept whole sides, overwrite the live checkout, or carry upstream's
   built frontend as proof of the fork's source.
4. Port the fork requirements above and add outcome tests at the new core/plugin
   boundaries. Include refused API/rental paths, local GPU scoping, bank queue
   persistence, peer routing and startup behavior.
5. Create independent Python and frontend environments. Read dependency pins
   from the integrated tree. V2's frontend test command loads the SDK and runs
   bundled-plugin tests; the old bare `node --test` command is insufficient.
6. Prepare a disposable rehearsal root. Use copied data and a small copied media
   fixture. Sanitize absolute paths, secrets, endpoints, pending jobs and plugin
   state in that copy. Prevent worker dispatch and network side effects before
   the first boot. Do not use symlinks or junctions to live writable storage.
7. Exercise the migration twice. Compare schema, foreign keys, IDs, record counts,
   tags, decisions, paths, captions and history before/after. Document intentional
   backfill changes. Prove that a second boot adds no further migration damage.
8. Run the integrated backend and frontend suites, plugin tests, both linters,
   local-only contracts, privacy checks and a source-built frontend. Verify the
   live UI against copied state, including bank/dataset parity, plugin absence,
   local generation, queue ownership and restart behavior.
9. Rehearse rollback: stop the candidate, quarantine its changed state, restore
   the matching old database/configuration/code/environment, and ensure no newer
   WAL/SHM sidecar accompanies the restored database. Verify records and media
   references again. Do not run old code over the migrated database as a shortcut.
10. Before live cutover, stop admission and drain/cancel work deliberately. Stop
    the launcher, verify no writers remain, take a fresh complete state snapshot,
    confirm media recovery and disk capacity, and repeat the proven procedure.
11. Keep the recovery bundle and state until acceptance. Run the repository's
    clean-delivery checks before any commit/push. Publishing these preparation
    documents does not perform or authorize a release or live switch.

## Not yet demonstrated

- A resolved V2 integration with all fork features retained.
- A fork-safe plugin distribution and update path.
- A V2 boot on isolated copied state and a complete rollback rehearsal.
- Live generation/training on the intended machines.
- Full media backup and a fresh cutover snapshot.

References: [upstream migration guide](https://github.com/perfectgf/lora-dataset-studio/blob/ce92e34993b246205b01a8dff2af4422199617c8/docs/guide/migrate-to-v2.md),
[plugin packaging guide](https://github.com/perfectgf/lora-dataset-studio/blob/ce92e34993b246205b01a8dff2af4422199617c8/docs/plugins/packaging-guide.md),
[fork sync gates](UPSTREAM_SYNC.md).
