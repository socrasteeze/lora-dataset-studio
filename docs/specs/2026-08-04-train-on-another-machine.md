# Train on another machine

**Date:** 2026-08-04
**Branch:** `claude/hub-peer-architecture-review-0ud684`
**Status:** implemented; **not yet exercised on two real machines** (see
[Verification debt](#verification-debt)).

## Why

Two boxes, one usually idle, and a training run that ties up the one you are
working on for hours. Everything a run needs is already a folder of images and a
job config; the only thing binding it to this machine was the `subprocess` call.

There was already a `training` job kind in the peer protocol. It was deleted on
this same branch rather than fixed: nothing in the UI could reach it, it kept no
run record, and its stop flag was read and discarded. See
[remote-gpu-workers](2026-07-29-remote-gpu-workers.md).

## The shape

**This app does not talk to the far machine.** It submits to the ai-toolkit at
`aitoolkit.url` and hands it a `gpu_ids` string; that ai-toolkit owns the hop.

```
LDS ──HTTP──> ai-toolkit (this machine) ──stages dataset──> ai-toolkit (other machine)
 ^                    │                                            │
 └── mirrors log, samples, checkpoints ───────────────────────────┘
```

One implementation of the remote hop, not two. The alternative — LDS staging
directly to the far box — would have meant a second copy of dataset staging,
resumable download and stop-forwarding, in a second language, against machines
ai-toolkit already knows about.

| Piece | Where it lives |
|---|---|
| Picking the machine | LDS (`TrainingMachinePicker.jsx`) |
| Exporting the dataset, building the job config | LDS (`lora_training`, unchanged) |
| Staging it to the far machine, running the job | ai-toolkit (`cron/actions/startRemoteJob.ts`) |
| Base model weights | The machine that trains, downloaded with its own HF token |
| Watching, mirroring, stopping | Both, at their own layer |

## Its own lane, and why that is not optional

Local training is single-flight through the machine-wide `training_in_progress`
flag, and **that flag means "this machine's GPU is busy"**: `gpu_window`, the
bank's GPU passes and image generation all gate on it.

A run happening on another box must not set it. Doing so would idle this machine
for hours over work it is not doing — the exact failure the bank queue's
per-machine lanes were introduced to fix
([bank-queue-lanes](2026-07-31-bank-queue-lanes.md)).

That single fact decides the whole design:

- a peer run cannot live in `lora_training.training_status()`, which reports only
  the one run that flag stands for. It gets a `PeerTrainingRun` row and its own
  `/api/training/peer-runs`, the same shape the retired cloud lane used;
- the picker **never offers this machine's own GPUs**, and `peer_training.launch`
  refuses a bare GPU index. A bare index is the ai-toolkit host's own card, which
  is this machine; a run sent there through this lane would train on the local
  GPU while generation believed it was free, and both would start on top of each
  other;
- `test_peer_training.py` asserts the module never calls `_set_system_state`.
  Asserted on the write API rather than on the flag name, because the first
  version failed on the module's own docstring.

## Mirroring, not proxying

Everything a run produces is written into the path a **local** run would have
used, so the rest of the app works against a peer run without knowing it is one:

| Artefact | Local path it is written to | Read by |
|---|---|---|
| Log | `lt._run_log_path` — `<run root>/training.log` | Training panel, crash reader, Runs page |
| Samples | `lt._samples_dir` — `<run root>/lora_<trigger>/samples` | Training panel's live previews |
| Checkpoints | `lt._run_dir` — `<run root>/lora_<trigger>/` | Checkpoint browser, Test Studio, lineage |

The three do **not** share a folder, which is where two of the bugs below came
from. The launch is also registered through the same `checkpoint_registry` with
`source='peer'`, so a remote run appears in the Runs page and its lineage beside
everything else.

This is the same trick ai-toolkit's own remote runs use to reuse its whole UI
unchanged, and it is why this lane needed no new viewers.

Samples and checkpoints come across ai-toolkit's HTTP file routes even though
the files are, by the precondition above, already on this disk. A `copy2` fast
path was considered and rejected: it would be an optimisation carrying a
correctness assumption, on a hop that costs milliseconds over loopback, and the
HTTP route keeps working if that assumption ever loosens. The dataset going the
other way is the opposite call — it is uploaded not at all, because there it was
gigabytes and the copy was to the same folder it came from.

## Durability

The supervisor is a thread, and a restart is exactly what destroys it.

| State | Where | Why not in memory |
|---|---|---|
| The run | `peer_training_run` row | A restart must be able to find a job still running elsewhere |
| A stop request | `stop_requested_at` column | An in-memory event is only enforceable by the thread a restart killed. Same lesson as the cloud lane's column, and dataset-manager's `cancel_requested` |

`resume_supervisors(app)` runs at boot. A row with a `remote_job_id` is
re-attached; a row without one never got as far as creating the remote job, so
nothing is running over there and it is failed rather than left `running` for
ever.

## What ended the run

`REMOTE_TERMINAL_STATUS` maps ai-toolkit's endings onto this lane's:

| ai-toolkit | here | weights fetched |
|---|---|---|
| `completed` | `done` | yes |
| `stopped` | `stopped` | yes — Stop promises the saved checkpoints are kept |
| `error` | `failed` | no; they stay on the machine that made them |

`queued`, `running` and `stopping` are transient.

**`completed` was missing from the first version of this set, in both repos.**
The list was written from ai-toolkit's `JobStatus` union, where `stopped` sits
next to `completed` and reads like the same thing. The authority is the trainer:
`UITrainer.py:246` writes `update_status("completed", "Training completed")` on a
clean exit. Both failure endings worked, which is why it looked right — the one
ending that did not work was success, which would have polled a finished job for
ever and never brought the weights home. It is pinned against the real status
strings rather than against this module's own set, since a test written from the
same list would have inherited the same hole.

## Six more things found while wiring the picker

None of these were visible from the design; each came from reading the code on
the other side of a boundary. Most would have worked exactly once, or in every
case except the one that matters, which is why none of them read as wrong.

**Samples needed one more hop than it looked.** ai-toolkit mirrors a remote
run's samples into `<TRAINING_FOLDER>/<job>/samples` — this run's TOP folder.
The panel reads `_samples_dir`, which is `<top>/lora_<trigger>/samples`. The
same one-level confusion as the checkpoints, on the other side of the boundary,
and it meant the picker's tooltip could not honestly promise samples came back.
`_mirror_samples` now copies each new one across on the same poll as the log,
skipping what it already has. Worth the hop rather than dropped: live samples
are how a run that is going wrong shows it early, and without them a remote run
is a step counter.

**The second run of any dataset would have 409'd.** The remote job's name is
derived from the run, so re-running a dataset submits the same name — and
`Job.name` is unique on ai-toolkit, whose `POST /api/jobs` answers
`409 {"error":"Job name already exists"}`. `_submit` called plain `create_job`.
The route's own update branch is keyed on an `id` in the body, which is exactly
what ai-toolkit's own remote watcher sends after looking the name up; the client
gained a matching `upsert_job`. `id` is **omitted** rather than sent as `None`
on a first run, because the route tests that key's truthiness.

**The checkpoints were landing where nothing looks.** `_fetch_checkpoints`
derived its destination from `os.path.dirname(run.log_path)`. But
`_run_log_path` is the run's **top** folder, and ai-toolkit saves into
`<top>/lora_<trigger>` beneath it — that save_root is what the checkpoint
browser, Test Studio and the lineage scan. Every mirrored checkpoint would have
gone one level too high, and the run would have read as "finished, no
checkpoints". `lora_training` already carries a comment about this exact
confusion: two different folders were both being called "the run folder" at nine
call sites. The save_root is now resolved at launch and stored on the run,
because it depends on the base/family/variant **that** run started with, and a
later dataset edit would resolve to a different folder.

**Nothing is uploaded.** The first `_submit` POSTed the export to
`/api/datasets/upload` and then sent a config naming the dataset by its bare job
name. Both halves were wrong. The ai-toolkit being submitted to is on this
machine, and `export_dataset_to_aitoolkit` already writes into its own datasets
folder — so the upload copied a folder to the machine it was already on, file by
file over HTTP. And a bare name is not a path: the staging step resolves
`folder_path` on disk, so it would have looked relative to the ai-toolkit
process's working directory and found nothing. The config now carries the real
path, and `_assert_reachable_dataset` refuses the launch up front if the
ai-toolkit reports a different datasets folder — naming both, since the fix is
always to change one of them.

**The launch guards were being skipped.** `lt.launch_training` runs
`assert_trainable` — caption/family mismatch, uncaptioned images, trigger-only
captions, the image floor — and this lane called none of it. "Train on another
machine" was therefore a way around every one of them, because the client's
pre-flight is advisory and this is where the enforcement lives. It now runs the
same call with the same override flags, and the panel's confirm-and-retry loop
is shared by both lanes rather than copied.

**A failure vanished with its reason.** `status_summary` returned active runs
only, so a run that died on the other machine disappeared from the panel the
instant it failed. Nothing else covers this lane. It now also returns failures
from the last hour (`FAILED_NOTICE_SECONDS`), dismissible in the browser, and
`any_active` stays computed from active runs alone — a failure being shown must
not keep the Train button disabled, since showing it exists so the user
relaunches.

## Limits, stated rather than discovered

| Limit | Why |
|---|---|
| A remote run always starts **fresh** | Previous checkpoints are not sent over, so there is no Resume/Fresh question the lane could honour. The launch skips that dialog rather than offering a choice it would ignore |
| **One run per dataset** at a time | Two would write the same run folder and the same log |
| No optimizer state comes back | So a run cannot be moved between machines mid-flight |
| The picker offers other machines only | See "its own lane" above |
| An offline machine is listed **disabled**, with its reason | Hiding it reads exactly like never having configured it — dataset-manager's rule, and the Run-on picker's |
| `aitoolkit.url` must be **this machine's** ai-toolkit | LDS exports the dataset to a folder on this disk and hands over that path. An address on another box would name a folder it cannot see — refused at launch, naming both folders |
| A failure notice ages out after an hour | It has been read by then; an older one would just nag |

The run card polls every five seconds only when an address is actually
configured. It still checks once on mount either way, so a run that outlived the
setting being cleared is not invisible — but an install that never configured
any of this does not spend 720 requests an hour being told "no". Same pacing
lesson as the peer heartbeat.

## Verification debt

Everything here is verified by tests, a typecheck and a build. **None of it has
been run against two real machines** — this container has no GPU and no second
host. What that leaves unproven, in the order it would break:

1. a run actually starting on the far GPU, and its step count advancing here;
2. the log tail, samples and `.safetensors` arriving in the local run folder;
3. Stop reaching the far process, and the checkpoints coming back after it;
4. a hub restart mid-run re-attaching instead of orphaning the job.

The six bugs above are a fair sample of what that debt looks like: every one was
found by reading the code on the other side of a boundary, not by running
anything. Most would have worked on the first run and failed on the second, or
worked in every case except success. Expect the on-hardware pass to find more of
the same kind.
