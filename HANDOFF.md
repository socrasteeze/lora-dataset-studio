# HANDOFF

## Bank caption sidecar sync (2026-10-29)

Bank captions still live in `bank_image.caption`. A non-empty write now also
publishes `<stem>.txt` next to the source image when
`captioning.bank_sidecar_sync` is on (the default). The hook sits after the
database commit on hand edit (`set_image_caption`), the caption pass
(`_on_caption`), shared-result fill (caption lane), and the dataset-to-bank
and bank-to-bank copy constructors. `_pixai_tags_job` and WD14 do not write
captions. Sidecar failures are skipped and logged; they do not roll back the
row. Clearing a caption does not delete the sidecar.

Targeted tests in `backend/tests/test_caption_sidecar_writer.py` plus related
Bank caption tests were run locally. Full qualification, both linters as a
gate, and rendered validation were not completed. Delivery uses `[skip ci]`
on the tip commit.

## Cached Bank caption fill (2026-10-27)

Operator authorized filling missing captions across all Banks from cached PixAI
results. Checked all 327 Banks and filled 145,581 empty captions in 315 Banks.
No inference ran. Validation and writes used current source SHA-256, matching
model/cache identity, normal non-rejected processing scope and folder exclusions.
Writes rechecked row and Bank state and atomically required an empty caption.
Captions use the existing Anima category formatter with general visual content
and subject counts, without character-name or attribution categories. Existing
visual traits remain because Bank captions have no Dataset-specific identity rules.

The fill finished in 250.17 seconds with zero skipped writes. A database backup
comparison found zero changes to existing nonempty captions, all other Bank image
fields, all Dataset image fields, cache records or row membership. The live Bank
API confirms the 984-image example now has complete caption coverage. There are
55,007 in-scope images without reusable cache receipts, so those remain uncaptioned.
Private backup, plan, finite operation script and receipts remain in ignored
data/cache-caption-fill-20261027-01. No source images or sidecars were written.
No tests ran. No new application code, build, commit or push was needed.

## Bank coverage display correction (2026-10-27)

Committed to main and pushed to origin on 2026-10-27, together with the PixAI
hash-once and CPU-fallback fix (58368e772) and a rebuilt bundle. The operator asked
why Bank card Tags/Caption counts remained after PixAI pre-tagging. Those badges
represented WD14 and written captions; PixAI receipts were missing from the row.
The card now includes an explicit PixAI cache badge, labels WD14 separately and
provides accessible status labels. Caption and WD14 completion are not inferred
from PixAI. No caption/tag pass ran as part of this correction.

Coverage also failed to exclude each Bank's explicit hidden folders. A correlated
SQLite JSON array filter now respects those prefixes in the existing grouped
aggregate, without per-Bank count queries or wildcard interpretation of folder
names. Global excluded-folder-name filtering remains. The 984-image example now
reports 984 PixAI receipts and scores, zero WD14 results and zero captions.
Live in-scope Score pending count is eight, rather than counting excluded rows.

Readonly current-data query and post-restart API readback confirm these values.
Normal activation followed an idle-work check and SQLite backup. Saved Bank
caption/WD14/PixAI receipt fields and Dataset captions match the pre-activation
hashes. Served entry matches the rebuilt bundle. Receipts and the prior bundle
remain under ignored data/coverage-display-20261027-01.

Ruff passes; ESLint has zero errors and 32 existing warnings. Staged build passed
in 8.87s. Frontend/backend regressions were added but not run. No rendered probe
ran. The operator later asked for it to be merged and pushed; the coverage
regressions still have not been run.

## Clean delivery checkpoint (2026-10-26)

Operator authorized clean delivery to origin/main. Preserve the seven existing
local training-preset commits as well as this session's GPU, caption-policy,
Bank cache and shared-pass changes. Source and generated bundle are separate
commits. Earlier local/uncommitted/no-push notes below are historical snapshots
and are superseded by this delivery checkpoint. Check Git remote parity for
the final publication state rather than inferring it from an earlier note.

Tests and rendered probes remain unrun under the operator's repository rules.
The delivery tip uses [skip ci]; full qualification is incomplete. Both linters,
the production build and attribution/privacy inspections are required for this
delivery. Runtime data, image/model files, credentials, private batch plans and
receipts stay ignored. Preserve the running PixAI and Score queues; do not
restart the backend or replay jobs as part of Git delivery.

## Shared local-pass optimization audit (2026-10-26)

Operator authorized extending the speedups across local passes. The coverage
inventory and measured limits are in docs/PASS_BENCHMARKS.md, shared-pass extension.
Quality, Score/Medium, WD14/PixAI, Faces/Angles, semantic indexing, watermark/text,
mask/identity, inpaint/crop, framing/caption, ComfyUI operations and shared Video
workers were inspected. Existing bounded preparation, GPU preference, caches,
native exceptions and backend-owned model lifetimes remain in place. No new
production watermark, mask, crop, inpaint, caption or Video job was queued.

New resident families: SigLIP2 semantic indexing and watermark detection. The
resident stdout adapter now supports streaming as well as read(), and watermark
scans return complete workers to the pool while partial/stopped scans retire
them. SigLIP2 model/processor reuse includes its validated contract and device.
Watermark ranker reuse and successful lazy locator reuse keep the old threshold,
label, source fingerprint and localization thread behavior. Cold one-shot calls
remain available. Existing idle, drain, cancel and GPU-contention cleanup applies.

Face grouping and both host/bundled Video grouping now avoid the dense matched
edge array, preserving traversal/ownership/numbering and exact full-matrix
arithmetic. Existing real face-cache ABBA timing on 4,096 vectors at 0.45 gave
median 1.485s before, 0.364s after (4.08x), identical 488 groups. Host and bundled
Video group_clips ASTs match. No real Video cache exists here; Video throughput
was not measured. The old OCR module description was corrected to match the
already-implemented prepared-CUDA/CPU-fallback behavior.

Read-only isolated CPU model comparisons on four existing image copies:
SigLIP2 9.490s cold, 8.588s initial resident, 0.960s warm; embeddings exactly
equal. Watermark ranking (localization off) 7.544s cold, 6.272s initial resident,
0.978s warm; scores/states/fingerprints exactly equal. These forced computation
with fresh outputs/caches; no saved-result shortcut. They do not establish
whole-pass GPU rates or localization gains. Receipts are in ignored
data/pass-optimization-20261026-01. No regression suite or rendered probe ran.
Three relevant synthetic regressions are written but unrun.

The finite helpers were paused, 324 jobs checkpointed (314 Score and 10 PixAI),
the active pass stopped cooperatively, and metadata backed up. A normal restart
activated the new pool; all 324 jobs were restored with normal cache reuse.
The Score coordinator and PixAI receipt collector were restarted. Score staging remains active. Protected caption/WD14 fingerprints
still match the original backup. Latest recorded state: one PixAI running, nine
PixAI pending, 314 Score pending, zero failures; 23,585 cached image receipts.
These are snapshots. Use the live queue and coordinator plan for current state.

Ruff passed; ESLint has zero errors and 32 existing warnings. Staged build passed
in 8.42s, previous bundle retained, and served entry matches the build. Privacy
scan and final review are recorded in the activation receipt. Source and bundle
remain local and uncommitted. No push or release. Leave LDS running.

## Score scheduling and exact grouping optimization (2026-10-26)

Operator authorized Score alongside PixAI and optimization of those passes.
Score already uses resident models, prepared CUDA, parallel preparation and
adaptive batches. The configured scoring runtime confirms CUDA on the RTX 5090.
Initial metadata had 31,739 missing score/style rows across 286 Banks. Normal
resume/cache verification is planned for all 327 Banks; rescore remains false.

LDS permits one queue entry per Bank. A finite coordinator submits Score when
that Bank is free, preserving pending/running PixAI. At the recorded check,
three Score passes finished, 288 were queued, and 36 remained staged behind
PixAI, totaling 327. The existing queue had no failures. The plan is persisted
under ignored data/score-queue-20261026-01/plan.json. The hidden coordinator was
started from dispatch.py there; it writes progress and a
final caption/WD14 preservation receipt, does not force rescore or retry failed
jobs, and stops after the batch or its 48-hour limit. Restarting Studio alone
does not destroy the plan; the helper tolerates temporary server outages. After
a host reboot, inspect for an existing helper before resuming dispatch.py with
the pinned interpreter. Staged jobs enter LDS only when a Bank slot frees.

Style grouping now visits the original upper-triangle edges row by row instead
of allocating a dense two-column edge array for a whole similarity block.
The matrix arithmetic, threshold, union order and numbering remain exact.
An all-connected partition can end early; Stop still returns no partial groups.
Matched CPU-only ABBA timing on 4,096 existing 768-dimensional cached embeddings
at threshold 0.7: median 3.316s before and 0.833s after, 3.98x faster, identical
55 groups. This is the grouping phase, not an end-to-end Score speed claim.

First Score initialization could clear a valid PixAI receipt while rebinding
the shared analysis fingerprint. The invalidation path now retains only a
receipt whose independent cached SHA proves the same current bytes. Changed
images still lose that receipt. Three real authorized pilot Banks (48 images)
finished with both score heads and style groups, identical PixAI receipt rows,
and unchanged global caption/WD14 fingerprints. The 52 remaining PixAI jobs at
activation were checkpointed and restored; completed tags stayed cached.

Ruff passes. ESLint has zero errors and 32 existing warnings. The staged build
passed in 9.30s, was promoted with the previous bundle retained, and served
entry bytes match. The privacy scan covered 3,130 files with zero findings.
The sandbox initially refused esbuild process creation; the authorized build
succeeded with escalation. Three new regressions are written but unrun; no
regression suite or rendered probe ran. Work remains local and uncommitted.

## PixAI residency and preparation lanes (2026-10-26)

Implemented, benchmarked and active. A 90-second pre-change sample showed 6.02%
mean GPU utilization despite 100% bursts. Each small Bank was starting another
worker and model. The unchanged 15-minute window produced 426 new committed raw
results: 28.4/minute, 0.473/second. The matched older PixAI benchmark is a different
workload; do not call its difference a controlled model-speed result.

PixAI now joins the existing resident infer pool. A dedicated resident adapter
retains one pipeline, invalidates it on model/device changes, and overlaps up to
four CPU preparation threads with the GPU batches. Prefetch is bounded to eight
images. One outer Pillow guard protects the process-global threshold while the
unchanged per-image checks run in parallel. Input order, Stop, native thread caps,
GPU lease, FP32 and thresholds are preserved. The original PixAI worker file and
cache identity are unchanged, so completed tag results remain reusable. Resolving
Transformers.pipeline replaces its lazy module; patch the resolved module. The
first isolated attempt exposed this, and the repeated comparison verified one
model load and model_reused true on later requests.

Matched eight-image inference: cold 21.360s, resident repeats 1.196s and 1.192s
(median 1.194s, 17.89x faster once warm). These runs forced actual inference.
All 128 full-set raw result maps matched the pre-optimization results exactly;
warm resident inference for 128 images took 16.124s. The initial resident request
still pays startup. Private comparison receipts are retained under ignored
data/pixai-residency-benchmark-20261026-01.

The remaining 271 Bank jobs were checkpointed, stopped cooperatively and restored
through the normal API after the isolated comparison. No completed tags were
discarded. The same real resident worker PID served successive Banks after
activation. A post-change 90-second sample averaged 78.5% GPU, peaking at 100%.
Its saved cache-count snapshots measured 562 new results over 85 seconds:
396.71/minute, 6.612/second, about 13.97x the earlier live rate. Bank sizes and
sample durations differ; this live ratio is not a matched-workload guarantee.
At the final recorded check, one Bank was running, 216 were pending and none
were failed. Captions and WD14 fingerprints still match the original backup.
The read-only completion collector was restarted. Live and final receipts remain
under ignored data/pixai-bank-run-20261026-01; the original scheduled rate follow-up
was completed and deleted. Leave LDS running.

Ruff passes. ESLint has zero errors and 32 existing warnings. Build passed in
7.51s. The privacy scan covered 3,130 text files with zero findings. Four synthetic
resident regressions are written but unrun. No regression suite or rendered
probe ran. Work remains local and uncommitted; no push or release.

## All-Bank PixAI run (2026-10-26)

The operator confirmed all 327 Banks are booru and authorized GPU pre-tagging
without caption replacement. PixAI is set to cuda (GPU-only). All Banks are
covered: two earlier passes completed, and 325 further passes were accepted by
the durable local queue without submission errors. Scope is kept/pending images
with existing folder exclusions preserved, rescan false, and valid cache reuse.
There are 207,960 candidate rows before exclusions. At the recorded check, three
Banks had completed, one was running, 323 were pending, and 601 image receipts
were cached. These counts are a snapshot, not completion evidence.

The complete metadata backup, protected caption/WD14 fingerprints, submission
manifest and live receipts are in ignored data/pixai-bank-run-20261026-01.
Both protected-field fingerprints still match after submission. No caption or
WD14 pass was queued. Leave Studio running. Inspect the existing Bank queue for
progress, failures, Retry and Stop. Do not automatically retry a failed Bank or
claim that all images were tagged merely because the queue is empty.

## PixAI Bank pre-tags (2026-10-26)

Implemented and locally activated. Bank > Passes > PixAI Pre-Tags queues a local
pass for the selection, or kept/pending images by default. Raw category scores
and source facts live in a profile-local cache. Image SHA-256, weights, model
configuration, processor code and inference-worker code identify reusable results.
Dataset PixAI, Caption Lab and hybrid tags reuse them before dataset-specific
formatting and omission rules. WD14 remains the Bank filtering pass. The pre-tag
pass never writes captions or caption sidecars. Byte-changing promotion requires
new inference. The Bank counter is a receipt; reuse validates current bytes again.

The authorized isolated GPU benchmark used 128 byte-identical Bank image copies.
Pre-tagging took 47.200s, including 7.186s loading and 36.780s tagging on CUDA,
FP32, batches of four, with no retries or image errors. Three cached dataset
formatting/output runs took 0.868s, 0.421s and 0.420s, with 128 cache hits and
zero model invocations each. A fresh process reused all scores in 1.772s. A
repeat Bank pass reused all scores in 2.075s. These are avoided inference costs,
not faster GPU computation. Existing benchmark Bank captions and WD14 fields,
all production table fingerprints, production settings, sources and sidecars
stayed unchanged. Receipts and separate caption outputs remain under ignored
data/pixai-bank-benchmark-20261026-01.

The first attempt hit Windows denial while deleting the temporary cancellation
directory. Cancellation now uses a unique single file in the app data directory,
with best-effort cleanup. The repeated real GPU run succeeded. Six synthetic
cache regressions are written but unrun. No regression suite or rendered probe
was authorized. Ruff passes; ESLint has zero errors and 32 existing warnings.
The production build passed in 7.27s. The publishable scan covered 3,128 text
files with zero findings.

Normal launcher activation followed a SQLite backup and empty-queue check.
Health and Bank statistics return 200. Served entry bytes match the build; the
cache table, Bank receipt column and new Bank count are present. All preexisting
fields in the four checked Dataset/Bank metadata tables and three saved-setting
hashes stayed unchanged. Production cache is empty; no production pre-tagging or
captioning job ran. Backup and activation receipt remain under ignored
data/pixai-bank-activation-20261026-01. Refresh the browser to load the control.
Changes remain local and uncommitted. No push or release.

## Active goal: optimize the Anima booru captioner (2026-10-26)

The goal remains active. Implementation and local activation are complete;
controlled timing and policy evidence is now recorded below. Three known visual
tagging errors remain, and full qualification is incomplete. Do not infer
qualification from lint, a build, capability readiness or unrun regression cases.

Anima caption writers now filter structured PixAI categories before formatting.
Character keeps general content; Style may also name depicted characters.
Copyright, artist, style, provenance and rating categories stay out. Visible
medium tags in general content remain. Batch, Caption Lab, hybrid tags and
external caption exports share the same policy. The generic tag formatter and
non-Anima hybrid behavior remain compatible.

Anima Character now resolves the appearance defaults shown in Options without
saving implicit overrides. Hair and Facial Hair omit; Makeup and Glasses describe.
Explicit choices win. Batch, preview, hybrid, external exports and leak badges
share this effective policy; legacy families keep their prior defaults.
Skin aliases cover the installed model vocabulary. Body-mark matching preserves
scarves, scarlet clothing and scared expressions. Anima booru short captions keep
available long-caption count tags and reject stale results after a long edit.

Empty Anima cleanup cannot restore the rejected draft. Source transparency removes
false transparency tags, EXIF orientation is retained, and completed Dataset
captions recheck source SHA-256 before saving. Stored captions remain unchanged.

The worker uses CPU batches of one and CUDA batches of up to four, with memory
backoff and per-image failure isolation. It keeps the installed model processor,
weights, FP32 precision and confidence thresholds. Stop is cooperative between
batches; cancelled Dataset jobs write no further captions. Device, batch size,
retries and load/tag timing are logged for the next actual run.

Ruff passed. ESLint passed with zero errors and 32 existing warnings. The frontend
build passed in 7.26 seconds. The publishable scan checked 3,126 text files with
zero findings. New policy/batching/source-fact regressions are written but unrun.
No regression suite or training ran. Later operator-authorized local comparisons
and the Bank cache benchmark are recorded above and under Verify.

A healthy new backend boot serves the rebuilt entry. All eight checked
Dataset/Bank/identity metadata tables and saved config/environment hashes stayed
unchanged across the latest restart. The stored caption-options API response is
also unchanged. Private rollback copies and receipts are retained in ignored
runtime storage. PixAI readiness is confirmed. Separate optimized-worker and
cache-reuse receipts now exist; neither proves exhaustive visual accuracy.

Next: address remaining visual classification errors before claiming exhaustive
accuracy. GPU batching showed no speed gain; cache reuse avoids repeated model
work. Tests require an
explicit operator request; local tests also require explicit local permission.
Current edits remain local and uncommitted on `noble/gpu-preferred-inference`.
No commit, push, merge or release. Preserve the earlier GPU changes and open
items below. A later delivery must keep source and the bundle in separate commits.

## GPU-preferred inference (2026-10-26)

Branch `noble/gpu-preferred-inference` has local source and rebuilt frontend changes.
A healthy controlled restart activated them. No commit, push, merge or release.
Existing open work below remains in place.

Prepared CUDA runtimes now serve PixAI, LaMa and shot detection. The existing
CUDA scoring and face/mask runtimes remain selected; OCR uses the prepared
CUDA face/mask runtime with RapidOCR dependencies. Device preferences remain
Auto/GPU. Setup keeps CPU defaults and preserves operator-installed CUDA builds.

Identity extraction, character suggestions, person/face masks, OCR, uncached
CLIP/SigLIP2 text queries and video aesthetic scoring prefer CUDA under the
shared exclusive GPU window. Missing or occupied CUDA uses CPU fallback.
CUDA text workers exit before GPU release; CPU workers retain idle caching.
The active bundled Video implementation and compatibility copies both carry
this policy. No model, threshold, image, caption or identity decision was changed.

Ruff passed. ESLint passed with 32 existing warnings and zero errors. The
production frontend build passed in 7.67 seconds. The publishable scan checked
3,045 text files with zero findings. Runtime probes detected CUDA and sm_120 in
all three converted torch runtimes, and CUDA ONNX plus OCR imports in the selected
OCR runtime. These are capability checks, not inference or performance results.

The backend has a new healthy boot and serves the matching frontend entry.
All eight checked dataset/Bank/identity metadata tables and both saved settings
file hashes stayed unchanged across restart. Private rollback copies, package
inventories and receipts are retained in ignored runtime storage.

Open: nine new GPU-ownership/fallback regression cases and updated source
contracts are written but unrun. No tests, rendered probes, production inference,
captioning, generation, training or performance benchmarks ran for this change.
Run tests only on an explicit operator request. Any later delivery must keep
source and the consolidated frontend bundle in separate commits.

## Web polish audit fixes (2026-10-26)

Branch `fix/web-polish-audit` holds the ten applicable audit fixes as local
working-tree changes. No commit, push, merge, release or backend restart.
The frontend bundle is rebuilt from this source for the fork distribution.

Changes cover deletion-dialog keyboard containment, pending settings edits,
Bank validation/load recovery, readable controls, mobile settings search,
guide search, credential visibility, Git revision dates, guide print layout
and reading progress. README, Guide, help registry and What's New describe them.
Guide dates include active bundled contributors; uncommitted content shows
Local Edits, and absent Git history reports revision unavailable.

Ruff passed. ESLint passed with 32 existing warnings and no errors. The source
privacy scan reported zero findings. Tests, responsive probes, print rendering,
physical-device checks and full qualification were not requested and did not run.
Reload the app to load the rebuilt frontend. Run no tests without authorization.

## Anima booru captions and signature traits (2026-10-25)

Task branch `feat/anima-booru-signature-tags` source `f912bcfb1` and bundle `ea52609bc`
are committed locally only. Nothing is pushed, merged to main or activated; the
running app still serves the previous build. This supersedes the "retain prose as
default" line in the 2026-10-20 Anima section below.

Anima datasets now default to booru captions (one rule in
`pixai_tagger.resolved_mode`, used by the recipe, short captions, PixAI and the
workspace selector). Anima Auto uses PixAI when installed, else the configured
vision model. Character tag lines lead with count tags, add `solo` to a lone
`1girl`/`1boy` and drop quality/score/meta/rating tags. New
`caption_options.signature_tags` is stripped from all caption forms and added to
the prompt omit rules; Suggest counts traits in 60% of kept booru captions. New
`POST /api/captions/external-recaption` writes `.txt` files to a separate output
folder only.

The operator authorized the caption-related test scope locally: 274 passed and
2 skipped (the optional privacy name list is not configured), plus 60 frontend
tests for What's New and caption options. Ruff and ESLint passed. Full
qualification, responsive probes and rendered validation were not run.

A 30-image character acceptance set was recaptioned into a separate output folder
with the local vision model. With the explicit list `armor, earring`, all 30 lines
are trigger-led single lines with no hair, eye, mark, armor, earring or quality
terms. Auto-suggest alone found `armor` in two of three runs (17-18 of 30 against
an 18-image threshold) and never found earrings (3 of 30, close-ups only).

Unfinished:
- The external recaption route has no UI button. A separate session holds that
  task and stopped because this branch was uncommitted; restart it from this branch.
- PixAI installation is resolved by the GPU-preferred inference work above.
  Real-model inference accuracy remains unmeasured for that wave.
- Auto-suggest is a starting list. View-dependent traits fall below 60%, so the
  operator must confirm or edit the list before captioning.
- Suggest on a dataset reads stored captions, which no longer contain applied
  traits; a second Suggest after recaptioning finds only new ones.
- Push, merge to main and activation need separate authorization.

## Worktree cleanup guard (2026-10-21)

`scripts/worktree_cleanup_guard.py` provides read-only preflight and Codex
PreToolUse handling. It rejects a primary checkout, filesystem links/reparse
points in the root, ancestors or tree, mounted directories, unknown Git metadata,
unreadable paths and incomplete inspections. It scans ignored directories too.
Shell worktree removal/pruning, raw deletion inside worktrees and common link
creation commands are blocked. The program performs no filesystem writes.

An identical installed copy, a PowerShell launcher and a system-Python reference
are under the user Codex hooks directory. The launcher converts missing files,
process errors and its own 12-second watchdog expiry into a blocking exit code.
The hook definition is in the user `hooks.json`, outside disposable worktrees and
the live environment. Repo and global AGENTS guidance require independent
dependencies and successful preflight immediately before managed archival.

Trust confirmed through the Codex CLI `/hooks` screen on operator order.
PreToolUse shows one installed and one active hook. The selected worktree cleanup
entry is enabled (`[x]`) and reports `Trust: Trusted`. Its displayed matcher,
launcher command, synchronous mode and 20-second timeout match the reviewed
definition. A matching trust record already existed, so no trust setting needed
changing. No hook-trust bypass was used. Hooks do not cover manual UI or OS
cleanup; keep disposable worktrees link-free regardless.

Ruff and Python/PowerShell syntax and JSON checks passed. The installed source
hash matches the repository copy. The one remaining linked worktree passed an
actual read-only inspection of 3,420 entries with zero file changes. The
implementation left Studio healthy. No worktree cleanup, restart, test or fixture
probe was part of implementation. Publication is authorized with tests off.
The deny branches remain untested under the operator's no-tests instruction.
The host UI confirms enabled/trusted registration; no worktree cleanup or test
probe was used to exercise blocking. This source-and-documentation delivery uses
`[skip ci]`. No frontend changes or bundle rebuild are required. Machine-specific
hook settings stay in user config.

## Profile LAN defaults (2026-10-21)

Prepared for `origin/main` from `c4a03f4d8` on `noble/profile-lan-publish`.
LAN access defaults on for new profiles from the popup or recovery launcher.
Switching an older local-only profile enables LAN automatically, with its own
required credential. Explicit local-only host environment overrides still win.
Busy-source and target guards precede settings writes. Failed restart scheduling
restores target settings and releases the admission gate. No extra checkbox is required.

The Guide, help search and What's New describe the defaults. Regression cases
cover defaults, isolation, local/remote legacy switches, rollback and host overrides.
Tests, responsive probes and CI tests are not run by operator order. Full
qualification is incomplete. Source and bundle delivery commits use `[skip ci]`.
Ruff passed. ESLint passed with zero errors and 32 existing warnings. The
delivery build passed in 7.55 seconds on current main, including the newer caption
and Dataset-folder work. Attribution and privacy scans have no unresolved findings.

The profile fix was activated on separate operator authorization. Its matching
activation build retained existing local storage behavior rather than loading the
newer Dataset-folder wave. The separate Dataset-folder activation below is still
pending. Recovery and data-preservation evidence are in AAR.md. Studio was already
offline at the cleanup-guard delivery precheck; this delivery does not restart it.

## Dataset folder categories (2026-10-21)

Task branch: `fix/dataset-folder-categories-20261021`. New creation uses a private
installation root plus the app subfolder and category/description/app-ID name.
The category and final location persist independently of display-name changes.
Legacy paths, append targets, Bank sources, and unrelated exports remain unchanged.
No production data, schema, allocation ledger, or service was changed by this work.

Source `9334de22137d394a8639375b34b290598d03f0bf` passed full Ruff 0.16.4 and
frontend ESLint in the cloud (zero errors, 32 existing warnings). The fork frontend
build passed with Node 24.19.0, npm 11.9.0 and Vite 6.4.3: 2,735 modules in 12.55s.
The transferred bundle has 157 verified files and the expected ten-plugin marker;
its dist tree is `cfc39df0745135d7ee18d12c29355792a97d56af`. Package and lockfile
hashes match the source. Keep the bundle in its own `build(frontend):` commit.

Regression cases are prepared but unrun. No tests or rendered validation ran;
full qualification is incomplete. Delivery is authorized with `[skip ci]`.
Runtime activation remains pending separate authorization. Local tests, builds,
installs and restarts remain prohibited. Existing Bank folder behavior and
cross-app editing ownership are unchanged. Preserve earlier state and other worktrees.


## ATK recipe controls (2026-10-20)

Image LoRA settings retain Automagic3 LR limits, layer exclusions, caption dropout, RAM latent caching, encoder/guidance flags and preview overrides through validated presets and run snapshots. Training trigger punctuation is preserved separately from safe filesystem identifiers.
The ATK Recipe editor saves related fields together and keeps failed/local drafts. The importable Character example is `docs/examples/training-presets/anima-character-automagic3.json`; it contains no dataset identity, private paths or prompts.
Ruff, ESLint and the production build passed during implementation. Tests, responsive probes and training were not run. Exact-run parity remains unverified. Keep source and the delivery bundle in separate commits, with CI skipped under the current test hold.
The local activation was separately authorized and verified. Publication does not restart the app or change dataset settings. Match the original base, images, captions and sample prompts before using the preset.
## Anima character captions (2026-10-20)

Source `1ad4b4bf3` and reconciled bundle `834df0aa7` are published to main and active after the operator-authorized restart. Preserve the separate uncommitted storage work in the primary checkout. The published bundle matches committed source; the local activation bundle also retains the pending storage controls.
Anima Character batch and Caption Lab share visible-detail guidance for JoyCaption/local vision, retain prose as default, and preserve existing appearance/body omission controls. Tag mode requests lowercase words with spaces. Stored captions remain content-only; training/TXT/ZIP add the saved trigger. ZIP export normalizes repeated leading prefixes, and previews match whole triggers instead of substrings.
Ruff and diff checks passed. ESLint passed with zero errors and 32 existing warnings. The final publication build passed in 8.60 seconds; the activation build passed in 6.53 seconds. The publishable scan checked 3,089 text files with no privacy findings. No tests, responsive probes, inference, caption jobs or training ran. Prompt instructions do not establish caption accuracy.
The new backend boot is healthy on the same profile. All 45 checked metadata tables and four settings files are unchanged; pending source hashes and served entry/four assets match the activation receipt. Rollback material and receipts remain in ignored Git storage under `anima-caption-activation-20261020`. Existing captions and images were not rewritten. Reload the client. The earlier open items below remain pending.

**Updated:** 2026-10-20 | **Branch:** fix/pwa-bank-toolbar-spacing | **Base:** 8af39502f

## State
The PWA Bank spacing correction replaces the portrait action scroller with three columns, gives large result counts two columns above the selection row, and aligns the progress track with Stop below its label. Desktop and short landscape keep compact scrolling actions. Existing labels, callbacks, scope, job polling and cancellation remain intact. Dataset's separate status/sort toolbar already wraps. Source c153a4ca2 and bundle f590ed720 are published and served by the live app, with the same backend boot. Source contracts were updated without running them. Ruff, ESLint (zero errors, 32 existing warnings) and the production build (6.94s) passed. Responsive probes and physical PWA validation are not run. Reload the PWA for the new frontend.
The CPU regression correction restores native library defaults and inherited thread limits for all LaMa launch paths and watermark localization. Ranking-only watermark jobs retain the shared cap. Score's worker, batch pipeline, shared resource policy and Bank service are byte-for-byte unchanged from the measured revision. Worker isolation, offline mode and hidden Windows launches remain intact. Source c586fe0df and bundle 45b0227a4 are active after a healthy controlled restart. No new benchmark, model inference, test execution, dependency install or saved-setting change belongs to this correction.
Local synthetic pass benchmarks compare 26ca2c116 to 8352960b0. Score total time fell from 26.237s to 14.688s on 512 inputs (44.0% less elapsed time); all heads completed, style groups matched and stored scores differed by at most one rounding unit. Face-mask startup/detection took 21.2% less total time, but no actual mask was generated. CPU LaMa regressed from 18.854s to 27.607s (46.4% more elapsed time) with identical pixels. Untiled CPU watermark localization regressed from 12.766s to 14.820s (16.1% more time) with identical results and no window failures. Clean face, WD14, watermark ranking, identity, SigLIP2, Quality-core and dedup-core pairs show no clear throughput gain. See docs/PASS_BENCHMARKS.md and ignored Git storage pass-benchmarks-20261019-1. No runtime/config/source-data change or full test run is part of this measurement work.
Final source review covered Score batching/backoff and publication, native-thread budgets, face/semantic checkpoint writes, retained face/pose heads, Framing request ownership/cancellation/source checks, and the controlled benchmark receipts. It found one Score failure-boundary defect: an optional head OOM at minimum batch discarded a successful CLIP embedding and other scores. The fix keeps those completed values and reports a head-specific error, while multi-image memory pressure still backs off. Added three regression cases without running them. Ruff and source review were the checks for that fix; the later authorized pass benchmarks are separate evidence.
Framing tuning is implemented: Dataset warms its provider once, then uses the shared bounded request pool; database operations stay on the owner thread and results recheck source bytes and scope. Stop joins submitted requests before model release and saves no further Dataset results after cancellation. The shared image gate copies only the resized raster while preserving JPEG pixels and stripping metadata. Capability import probes now use CREATE_NO_WINDOW to address Windows console flashes.
Ollama 0.40.5 forces qwen3vl to one execution slot in server/sched.go. Increasing LDS or OLLAMA_NUM_PARALLEL does not remove that guard. No vendor binary, model, prompt, output budget, precision, crop threshold or live configuration was changed.
The operator authorized a local synthetic benchmark. Eight 6-megapixel fixtures produced identical prepared JPEG bytes; preparation median fell from 0.6411s to 0.5937s (7.4% less time). The final controlled benchmark used a fixed seed, per-path warm-ups and ABBA order with two measured passes per path. ComfyUI was ignored only in the isolated benchmark config to remove periodic failed-connection overhead. Dataset median was 9.9089s before and 9.2283s after (6.9% less time). Bank median was 9.9952s before and 9.9344s after (0.6%, within observed variation, so no Bank end-to-end gain is established). Every timed pass classified 8/8, with identical framing buckets and angle/expression labels. Earlier 14-15% figures included startup or retry noise and are superseded. The first harness attempt rejected workers because its isolated queue-manager app was not registered; the corrected harness retains the production GPU fence. No speed result is taken from that failed attempt.
New regressions are written but unrun. The local benchmark is the only newly authorized test scope. Earlier cloud qualification below applies to the base, not this tuning wave. Source 971c1b0a9 and bundle 106ce1328 are now active after the operator requested the live flicker repair. The supervisor restart was healthy, kept the same profile, and preserved all 46 metadata-table fingerprints and four settings-file hashes. Served entry and JavaScript bytes match the built bundle. Capability helpers now launch with CREATE_NO_WINDOW; terminal rendering itself still needs operator observation.
Cloud repair passed full qualification in run 39367594617 on source/bundle 2d74f60e9: backend 10,218 passed / 15 skipped plus 8 subtests, frontend 6,322 passed / 4 skipped, bundled Python 229 passed and Linux startup 13 passed. All browser steps passed, including all 10 Image Sources cases and 13 header checks with no skips. Backend runtime was 22m16s. Two optional privacy name checks lacked an external name list. No local tests ran. The launch-only workflow commit stays on the validation branch and must not reach main.
All Bank/Dataset pass families have been reviewed. Source 8eb711979 and bundle be92d4fa2 are active after an idle, backed-up restart: hardware-scaled worker budgets, adaptive CUDA Score batches, bounded ONNX sessions, unused face-head removal and rate-limited embedding checkpoints. Models used for scores/identity/pose, precision, thresholds, image validation and provenance stay intact. Local Framing and completed pass measurements are recorded above; remaining speed claims are unmeasured.
Dataset Auto-Crop now shares Bank's status and grid-selection controls. The default is kept and undecided; a selection narrows that pool. Rejected images require an explicit bin/all scope. Empty selections cannot widen the run. Choices remain after a failed request. Source 66125fce8 and bundle 5b0f11dac are active after a controlled restart.
Confidence-gated Auto-Crop is implemented in the image editor and as an opt-in Bank/Dataset Framing option. The shared server gate defaults to 90%; missing/invalid/lower confidence skips pixel writes. Confidence is an uncalibrated model estimate.
The earlier cloud tests and rendered checks are complete. No production inference job was started for this activation. A new healthy backend boot serves the matching built bundle. Dataset metadata and four saved configuration files are unchanged. Bank inventory and Forget Missing requests occurred during activation; the Bank image table changed while surviving rows stayed identical. Cloud qualification passed on the earlier repair commit; the new Framing wave has local benchmark and static evidence only.

## Done this session
- Corrected portrait Bank action, count and progress layout. Preserved the existing probe markers and limits. Added the What's New entry and a dated mobile-workflow note that separates this unqualified layout change from older browser evidence.
- Added a native-thread opt-out to the shared worker environment and streamer. Applied it to single-image, bulk and progress-streamed LaMa jobs, and to watermark jobs with localization. Added ten parameterized regression cases without running them. Updated Guide, settings reference, What's New and the benchmark report; preserved historical timings as pre-correction evidence.
- Recorded local pass timings, numerical/pixel comparisons and resource usage. Discarded trials that overlapped another queue's work and repeated the affected comparisons. Used synthetic inputs only; all private logs and paths remain in ignored Git storage.
- Corrected minimum-batch Score head OOM handling after final source review. Preserved larger-batch OOM backoff, including a single NSFW input competing with a larger CLIP batch.
- Added bounded Dataset Framing overlap, first-request provider warm-up, source/scope rechecks and explicit changed-image results. Bank already used the request pool; its new shared change is bounded image-copy overhead only.
- Added concurrency, cancellation, source-replacement, image-byte equivalence and no-window probe regressions without running them. Removed unqualified speed claims from the concurrency controls and documented the server-slot limit.
- Fixed the Image Sources status layout and added verification that its selected ffmpeg binary runs. Added broken/unconfirmed binary and failed-install regressions.
- Updated the Score Stop test to select database write-back separately from inference batching. Reconciled the video schema inventory, lightbox hosts, queue layout contracts and Guide anchors without relaxing browser thresholds.
- Added shared native thread budgets to inference worker environments, preserving stricter inherited limits and the parent environment. Quality scan and Score preparation use the same CPU-capacity policy.
- Score batches CLIP and NSFW together, sizes batches from free CUDA memory, backs off on OOM and isolates other failures per image. Stop saves the current batch; runtime output reports its budget.
- Face/angle and Dataset face sessions bound ONNX threads and disable idle spinning. Face/identity analysis keeps identity and 3D pose inputs while skipping unused heads; face masking uses detection only.
- Face and SigLIP2 caches share Score's checkpoint interval. Normal Stop/completion flush all finished work; abrupt process termination can require more recomputation. Face cancellation also reaches the error path.
- Wrote CPU-budget, ONNX-pool, batch-equivalence, OOM-backoff, isolated-head-failure, batch-Stop/resume, replaced-source and checkpoint-durability regressions without running them.
- Extracted the shared Bank/Dataset status and selection controls without changing stored scope IDs. Dataset shows eligible counts, blocks empty scopes and clears stale grid selections on navigation. Framing waits for bulk curation to finish.
- Dataset validates status/ID options before reserving the GPU, intersects them with dataset ownership, excludes rejected images by default and rechecks status after inference before saving.
- Added scope, selection, foreign-ID, invalid-input and status-change regressions without running them. Updated Guide, help keywords and What's New.
- Published source 66125fce8 and bundle 5b0f11dac on the task branch with CI skipped. Activated both from a clean main checkout after an idle-work check and local metadata/settings backup. No crop or inference was used for deployment readback.
- Added shared confidence validation, full-subject crop geometry and source-byte checks in auto_crop.py. Framing requests crop evidence in the same model call, including on compute peers.
- Bank preserves pass status/selection scope, queue options, existing edit history and its active mutation reservation. Reports crops/skips/failures; no source file is overwritten.
- Dataset Auto-Crop includes already-classified image files, uses an exclusive activity reservation and atomic crop publication, and provides Stop Framing. Changed previews receive fresh versions.
- The image editor's Auto-Crop saves after a qualifying detection. Manual crop remains available. Failed saves retain the detected box; aspect ratios cannot cut the detected subject.
- Updated Guide, help anchors, README and What's New. Wrote confidence/bounds/source-change, stop-isolation and Bank/Dataset regression cases without running them.
- Activated source 46926f85b and bundle d1ca52fd0 after an idle-work check and local metadata/settings backup. Served entry and JavaScript bytes match the built bundle; no jobs or inference were started.

## Open
0. When explicitly requested, check the corrected Bank header/count/progress layout on portrait phones, short landscape, tablet and desktop. Include large counts, long labels and running/stopping/stale jobs. Physical iPhone/PWA acceptance remains open; source classes and the build do not prove geometry.
0. Post-correction LaMa and DINO throughput is unmeasured. Run another benchmark only on an explicit request. Use the updated launch policies: the historical direct-worker harness does not pass the new native-thread opt-out. The implementation restores pre-tuning library defaults rather than choosing an unmeasured replacement count. Real-face recognition/pose and large-bank checkpoint gains remain unmeasured.
1. The broad regression suite remains unrun for this wave; run only an explicitly requested scope. Real-image accuracy and a Bank end-to-end speed gain are unmeasured. If terminal tabs still flash with the updated server, identify the launching process before changing another helper.
2. Auto-Crop confidence calibration, crop accuracy and live providers remain unverified; the cloud suite and existing browser checks passed. Run only an explicitly requested scope. Fixture speedup qualification against aeb09dae9 also remains unrun.
3. The operator chose a local identity accuracy set. Await its location/labels and explicit evaluation authorization; keep images local. Report wrong names, misses, abstentions and provenance. Similarity thresholds remain unmeasured heuristics.
4. Physical phone/PWA acceptance, installed-source trainer compatibility and real GPU/training comparisons remain operator gates. Opt-in live encoder/Ollama checks were not run.
5. If the Bank tab error recurs, collect the first browser ErrorBoundary line. The original live tab error and earlier desktop tag timeout have unconfirmed causes.

## Decisions
- Dataset Auto-Crop uses Bank's kept/undecided default, explicit kept/undecided/bin/all choices and selection priority. A selection excludes rejected images; choosing a status scope replaces the selection. Legacy classification without Auto-Crop keeps its existing pool.
- Image Sources uses manual Scan, Load Previews, Download and Import Images actions. Opening a panel does not start network work.
- Keep two aligned columns of text/controls above the full-width normal Bank thumbnail grid. Stack controls on mobile.
- Auto-Crop uses full subjects with roughly 10% padding and a 90% default minimum. The editor saves in one click; Framing cropping is opt-in. Model confidence is not measured accuracy.
- Preserve Bank derivative saves and Dataset training-image crop limits. Retain the selection after failed saves; refuse ratios that cut the detected subject.
- Keep main's aligned queue columns and its shared human-confirmed identity records, correction/Undo behavior, subject regions and content/model provenance.
- Every test run needs an explicit request. Delivery without tests uses [skip ci] and does not claim full qualification.
- Reuse immutable fixture inputs only. Keep per-test writable files and Git metadata, fresh app/database/config/plugin state, and real integration transports.
- Keep worker counts, loadfile scheduling, request budgets and test parameter sets. Optimize setup and teardown instead of reducing coverage.

## Traps
- Build away from the running checkout. Backend activation needs a metadata backup and a controlled restart with the normal CSRF session; do not import create_app against production as a check.
- Only the requested local synthetic pass benchmarks are authorized. Full tests and responsive probes remain off. Static lint/build/privacy inspection is permitted. A competing local job invalidates a timing pair.
- Keep frontend source and generated dist in separate commits. Preserve unrelated worktrees and the original scraper branch.
- Keep real data names, images, settings and credentials private. Checkpoint metadata under ignored Git storage only.
- Do not move Auto-Crop inference into passive requests/effects. Keep old route/help/What's New identifiers. Failed-save exceptions must reach CropModal.
- Do not merge upstream branches. The upstream review below is carried forward unchanged.

## Pass review
| Pass family | Result |
| --- | --- |
| Quality | Existing single decode supplies metrics/provenance/hash/thumbnail. Preparation workers now use the shared CPU policy. |
| Score | Bounded preparation/native threads; adaptive CLIP and NSFW batches; per-image failure isolation and batch Stop. |
| Semantic index | CLIP inherits Score changes. SigLIP2 keeps its existing model/processor and limits full-cache rewrites. |
| Faces/person groups | Bounded ONNX pools without idle spinning; identity/pose heads retained; unused heads skipped; checkpoint I/O limited. |
| Angles | Shares the face worker and keeps its 3D pose estimator and yaw gates. |
| Watermark detection | Shared worker budget; existing streaming detector chunks and memory-bounded tile sweep retained. Vision concurrency stays configured. |
| Text scan | Existing vision/OCR route and persistence retained; native worker budget applies where an inference worker is used. |
| Watermark crop | Existing lossless image-edit and mutation guards retained. |
| Watermark inpaint | Native worker budget; LaMa keeps one model for bulk work. External Klein/ComfyUI scheduling stays unchanged. |
| Improve/upscale | Native helper budget; external ComfyUI workflows and GPU ownership stay unchanged. |
| Framing/Auto-Crop | Existing vision concurrency, confidence gate, source fence and serial crop publication retained. |
| Medium | Existing cached Score embeddings and prototype classifier retained. |
| Semantic dedup | Existing cached embeddings, bounded comparisons and threshold semantics retained. |
| Caption | Native worker budget; WD14 adds ONNX limits and retains eight-image batches. Existing VLM concurrency and bulk caption workers retained. |
| Identity/masking | Identity retains detection/recognition/3D pose. Face masking skips unused face heads. |

## Verify
Local PixAI comparison (2026-10-26): operator authorized separate outputs only. The committed worker and current worker each processed the same 31 byte-identical local image snapshots on CUDA with FP32 and unchanged model thresholds. Four measured passes used before/after/after/before order after warm-up. Median worker wall time was 27.419s before and 27.424s after; no speed gain was demonstrated. Both repetitions returned identical raw maps within each version, with no image errors. All 31 baseline captions matched the stored captions. Category-policy violations affected 25 captions before and zero after; omitted identity tags affected three before and zero after; false transparency tags affected five opaque images before and zero after. These counts overlap. Three previously reviewed visual tagging errors remain, so exhaustive caption accuracy is not established. All production database table fingerprints, settings, source images and caption sidecars stayed unchanged. Each version has 31 separate text outputs under ignored data/pixai-comparison-20261026-01, with metrics in report.json. Studio was offline and its normal profile launch lock was held; the GPU window used an isolated database. Configured-address probes did not reach the local services, so direct loopback checks monitored idle ComfyUI/Ollama during measurement and local ComfyUI acknowledged release. The private harness now pins loopback addresses for future comparisons. No regression suite, cloud tests, commit or push ran. Performance improvement and the remaining visual errors are open.

PWA spacing: privacy inspection covered 3087 text files with zero findings; added attribution and whitespace reviews were clear. The compiled CSS contains the new grid/wrapping rules. HTTP readback matched the delivered HTML, entry JavaScript, CSS and Bank chunk; the backend boot was unchanged. No API writes, model work, tests, responsive probes or screenshots were used for this frontend-only delivery. Publication receipt stays in ignored Git storage, pwa-spacing-delivery-20261020.json.
Native-default activation: new healthy boot, same profile, served entry and JavaScript identical to the built bundle, all 46 metadata-table fingerprints and four saved-setting hashes unchanged. Work stayed idle. Backup and receipts remain under ignored Git storage, lds-auto-crop-activation-20261019-fec84f07. Source and bundle are separate commits with CI skipped. No model job or test was used for activation readback.
Native-default correction: Ruff passed; ESLint has zero errors and 32 existing warnings. Five changed Python files parsed without imports or execution. The final production build passed in 7.00s after normalizing the two changed Guide sources to their committed LF form. Source inspection confirmed that only LaMa and localization bypass the default cap, including LaMa's shared streamer. The four Score/resource/Bank source files match the prior revision byte for byte. Privacy inspection covered 3087 text files with zero findings. Tests, new benchmarks, inference and rendered probes were not run; full qualification remains incomplete.
Local synthetic benchmarks: every accepted compute run completed its full requested input set with prepared models. Score/SigLIP2 vectors were numerically close, Score style groups matched, and other measured outputs/pixels matched. All 512 main fixture hashes stayed identical. Both linters passed (ESLint: zero errors, 32 existing warnings); privacy inspection covered 3087 text files with zero findings. Only the requested benchmark scope ran; the broad regression suite and cloud CI were not run. This delivery changes documentation only.
Pass tuning activation: source 8eb711979 and bundle be92d4fa2 are active in a new healthy boot on the same profile. Served entry and JavaScript bytes match the build. All 46 metadata-table fingerprints and all four saved-setting hashes match the pre-activation checkpoint. Work remained idle; no tests, inference or benchmarking were used for this deployment readback. Backup and receipts are under ignored Git storage, lds-auto-crop-activation-20261019-1f7da945. Both task-branch commits use [skip ci].
Pass tuning: Ruff and ESLint passed; ESLint has zero errors and 32 existing warnings. AST parsing covered 20 changed Python files without imports or execution. Production build passed in 6.74s. Privacy inspection covered 3084 text files with zero findings; added-source attribution inspection and whitespace review had zero findings. The pure-text outbound inventory has zero differences. Tests, fixtures, inference, benchmarks and rendered checks were not run. No workflow, dependency or saved-setting changes were made. Full qualification and throughput/equivalence measurement remain incomplete.
Dataset scope source inspection: Ruff passed; ESLint reported zero errors and 32 existing warnings. Three changed Python files parsed without imports or execution. Production build passed in 6.76s. Privacy inspection covered 3079 text files with zero findings; whitespace review passed. No tests, fixtures, browser checks, model inference or rendered probes ran. New regression cases remain unrun. Full qualification is incomplete.
Dataset scope activation: new healthy boot, same profile, matching served entry and bundle bytes, idle work state and unchanged hashes for four configuration files. Of 46 metadata tables, 45 were identical. The Bank image delta was 3427 added pending rows and 1267 removed pending rows, with zero field changes in surviving rows. Timestamped logs show successful Bank create/inventory and Forget Missing requests during that interval. No live data was restored or overwritten. Backup and filtered metadata/request receipts remain under ignored Git storage, lds-auto-crop-activation-20261019-899e4e9e.
Auto-Crop source inspection: Ruff passed; ESLint passed with zero errors and 32 existing warnings. AST parsing covered nine Python files without imports or test collection. Final production build passed in 7.04s. Privacy inspection covered 3075 text files with zero findings; new attribution scan had zero findings. The pure-text outbound inventory has zero differences. No tests, fixtures, model inference or rendered probes ran. Bank and Dataset confidence policy uses the same server helper; options are validated before queued admission or the Dataset GPU window. Bank framing is rebound to the saved crop's fingerprint. No workflow or dependency changes were made. Accuracy and full qualification remain unverified.
Previous confidence-wave activation readback confirmed an idle app, a new healthy boot on the same profile, matching served entry/bundle, identical fingerprints for all 46 metadata tables and unchanged hashes for all four saved configuration files. Checkpoint and receipts remain under ignored Git storage, lds-auto-crop-activation-20261019-8d5cbaf4. No real image crop or model call was used for verification.
Historical fixture optimization: source comparison against aeb09dae9 retained all 75 existing test function bodies/decorators in its five changed files, with one new isolation regression. Both linters/privacy inspection passed. Tests and benchmarks did not run.
Prior application baseline aeb09dae9 records the merged scraper/Auto-Center activation and its metadata checkpoint. Those operational results are historical and do not qualify this wave.
Prior identity/upstream qualification: 2673a79faf05a5d01d1c85585585620be51a2bbf, Fork Gates 39183822421 and post-push CI 39185814233. Queue run 39189043465 was cancelled before full Gates finished; no further tests were authorized.
Scraper tip c053c7d72 had successful lint/build/privacy inspection, with 32 existing ESLint warnings. Auto-Center regression files were written but never run; no live model call or rendered check was made.
Permitted commands (use the existing pinned interpreter from the primary checkout when this worktree has no .venv):
```powershell
.venv/Scripts/python.exe -m ruff check .
cd frontend
npm run lint
```

### Carried-forward upstream review
On 2026-10-23, upstream's default branch was v2 at 153c4d86539b7196a29bc36e2cedca4cc3d946f9. v1 remained 3fe3d4f0e29e28de583a6e22bce886c35e5ecd3f. The review started after the previous reviewed SHA a300b0b23 (an ancestor of the new head) on fork branch `upstream-review/2026-10-22` at 08c2688ae. The window has 4 commits, all part of upstream's opt-in usage statistics release 2026.10.23. No new upstream branches. Nothing touches studio.db or the schema.

| Upstream commits | Class and evidence |
| --- | --- |
| 143134ff6 | PARTIAL PORT, ported as `7002f55ca` (bundle `95ffd555a`). Taken: the Train button single-flight launch guard (`utils/singleFlight.js` + test, `launchPending`/`aria-busy` in `TrainingPanel.jsx`, errors toast instead of an unhandled rejection) and its What's New entry; busy label has no ellipsis (fork contract). Skipped: typed refusal classes (`operation_errors.py`, `usage_error_*` attributes), `training_usage.py` and every `usage_statistics` hook. They only feed the collector this fork does not ship (FORK_NOTES: no usage-statistics collector). |
| d73ecbcb9 | SKIP-BUILD. Fork bundle rebuilt from source. |
| ae87a2ed5 | SKIP. Usage lifecycle observer (`usage_lifecycle.py`, SQLAlchemy commit listeners), expanded PostHog categories and fresh opt-in UI, guide text about PostHog Cloud EU, `APP_VERSION` 2026.10.23. All collector-only; the fork keeps no collector and its own version. |
| 153c4d865 | SKIP-BUILD. |
| 64ae2ce57 (from 2026-10-21) | PORT, still open. Port on its own task branch (conflicts and Divergence 5 test patch as noted on 2026-10-21). |

Decision: the port is local commits on `upstream-review/2026-10-23` (based on `upstream-review/2026-10-22`, whose 2026-10-22 ports are still not on main), not pushed. Gates (`-Phase Gates -ScratchRoot D:\tmp`) ran on 7002f55ca: lint, build, startup, plugins and the frontend suite passed (frontend 5255/5255 and bundled 1073 pass, 0 fail); backend 1 failed / 10339 passed, the one failure being the known `test_video_bank_service::test_a_stills_set_reuses...`. Fork bundle `95ffd555a` is the gates build. The next review (2026-10-24, below) started after `153c4d865`. Do not merge upstream/v1 or upstream/v2.

On 2026-10-24, upstream's default branch was v2 at 54f5bbe53ff0949245cbd12dcc164eec6c4412b0. v1 remained 3fe3d4f0e29e28de583a6e22bce886c35e5ecd3f. The review started after 153c4d865 (an ancestor of the new head) on fork `main` at 361dc9768; merge base with upstream/v2 is d13337cc3. The window has 2 commits, both about the plugin store's free/member feature comparison. No new upstream branches.

| Upstream commits | Class and evidence |
| --- | --- |
| 5b764fccd | REJECT. Divergence 12 (offline runtime, no plugin catalog) and the support/Patreon-wording skip. Seven of its eight files (`plugins/store/catalog.py`, `routes.py`, `services/patreon_core.py`, `tests/test_patreon_access.py`, `pages/store/Catalog.jsx`, `PluginCard.jsx`, `tests/patreon-access-render.test.mjs`) do not exist in the fork. The eighth, `whatsNew.js`, only gains an entry for the rejected /plugins comparison feature. |
| 54f5bbe53 | SKIP-BUILD. Only `frontend/dist`; the fork rebuilds its own bundle. |

Decision: nothing ported, so no ports, branch, or FORK_CHANGELOG row. A later review starts after `54f5bbe53`. Do not merge upstream/v1 or upstream/v2.
