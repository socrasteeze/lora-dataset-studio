# Remote GPU workers (Primary + peer)

**Date:** 2026-07-29  
**Status:** implemented (foundation, comfy/vision/infer kinds, docs/UI). The
`training` kind was removed on 2026-08-04 — see the job-kinds table below.

## Why

Open the Primary’s web UI from another machine (e.g. laptop on Tailscale) and still choose **which box’s GPU** runs a job. Datasets and SQLite stay on the **Primary**. The other install is a **compute peer** that “rents” its hardware; results write back to the Primary.

Either machine can be designated Primary — same product shape, not “laptop is always the weak worker.”

## Roles

| Role | Meaning |
|------|---------|
| `standalone` | Default; today’s single-machine behaviour. |
| `primary` | Owns `data/`, issues join tokens, schedules jobs, serves the UI browsers should bookmark. |
| `peer` | Joins a Primary with a one-time token; pulls jobs; runs Comfy / vision / infer locally; uploads artifacts. |

Config: `cluster.*` in [`config.py`](../../backend/app/config.py) / Settings → **Devices**.

## How it works

```
Browser (any machine) → Primary LDS (datasets + queue)
                              ↑ pull / heartbeat / artifacts
                         Peer LDS → local ComfyUI / Ollama / infer / ai-toolkit
```

- **Peer pull** (outbound to Primary) — better for sleeping laptops than Primary push.
- **No shared SMB mounts** — images travel as authenticated artifacts under `data/cluster_artifacts/<job_id>/`.
- **GPU exclusivity stays per-node** — Primary does not unload the peer’s ComfyUI.

## Job kinds

| Kind | Hub entry | Peer execution | Result path |
|------|-----------|----------------|-------------|
| `comfy` | `ImageGenerationQueue.worker_id` + `ClusterJob`; generate / improve paths pass `device_id` | Local ComfyUI; output uploaded | **Closed** — hub `_finish_comfy_bridge` → `_dispatch_completion` |
| `vision` | `POST /api/cluster/jobs/vision` | Ollama `describe_image_ollama` batch | **Live (2026-07-31)** — the bank's 📐 Framing, 🚩 Watermark and (Ollama-only peers) 🏷️ Caption passes, via `bank_remote.run_remote_vision` |
| `infer` | `POST /api/cluster/jobs/infer` | `backend/infer/<name>.py` (own install only) via `infer_stream` | **Live** — the bank's ✨ Score, 👥 Faces and (JoyCaption peers) 🏷️ Caption passes, via `bank_remote.run_remote_pass` |

`comfy`, `vision` and `infer` all bridge back into the app. `_VALID_KINDS` lists
exactly these three.

**`training` was removed on 2026-08-04.** It had been listed here as Open since
this document was written: `POST /api/dataset/<id>/train` read a `device_id`,
`prepare_peer_training_bundle` zipped the export folder, and
`peer_worker._run_training` shelled ai-toolkit on the peer against a config whose
`{{DATASET_DIR}}` / `{{OUTPUT_DIR}}` placeholders it rewrote. Three things were
wrong with keeping it:

- **Nothing ever called it.** No surface in `frontend/src` sent `device_id` to
  `/train`, so the whole lane was unreachable from the UI it was built for.
- **It could not be stopped.** `_run_training`'s progress callback discarded the
  heartbeat's `{'cancelled': …}` answer, so a hub-side Stop marked the row
  cancelled and the peer trained on for up to its 24-hour timeout.
- **It produced no run record and no progress**, which is what "Open" meant here.

Training on another machine is **ai-toolkit's own feature** now: it takes the
machine in its GPU picker, stages the dataset itself, and mirrors the log,
samples and checkpoints home. Doing it there rather than here keeps one
implementation instead of two, and it works from ai-toolkit's own UI as well as
from this app. See that repo's `FORK_NOTES.md` → "Remote execution".

## Key files

| Area | Path |
|------|------|
| Models | `backend/app/models.py` — `ClusterDevice`, `ClusterJoinToken`, `ClusterJob` |
| Hub logic | `backend/app/services/cluster.py`, `cluster_remote.py` |
| Peer loop | `backend/app/services/peer_worker.py` |
| HTTP | `backend/app/routes/cluster.py` |
| Queue | `backend/app/job_queue.py` — skips non-local `worker_id`; publishes remote Comfy jobs |
| Auth | `backend/app/netguard.py` — `PEER_ENDPOINTS` allowlist + `cluster.join` exemption |
| UI | Settings `DevicesSection`, `DevicePicker` on generate |
| Tests | `backend/tests/test_cluster.py` |

## User flow (Tailscale)

1. **Primary:** Settings → Devices → role Primary → Generate join token → copy once.  
2. **Peer:** same app install + local ComfyUI/Ollama/ai-toolkit as needed → role Peer → Primary URL + token → Join.  
3. Browse the **Primary** URL from either machine → Generate → **Run on** → pick peer or this machine.

## Limits (keep visible in review / README)

- **What a user can send to a peer, as of 2026-07-31:** generation, and the bank's
  ✨ Score, 👥 Faces, 📐 Framing, 🚩 Watermark **and 🏷️ Caption** passes — five of the
  eight pipeline steps. Captions route by the peer's OWN reported capability
  (`_peer_caption_kind`): a peer with JoyCaption runs its own
  `joycaption_infer.py` as an `infer` job in its own ai-toolkit venv; a peer with
  only Ollama gets a `vision` job. The hub never re-decides which engine — that
  rule lives in `caption_paths`, on whichever machine runs it. A peer that reports
  neither falls back to the hub and says so, rather than failing after staging.
  A bank's `scan`, `auto_reject` and `semantic_dedup` steps never travel: they read
  the database and the hub's cached embeddings, so sending them would be strictly
  slower.
- **The trust points one way: a peer runs what its Primary sends.** The peer will
  only run scripts from its own `backend/infer/` with its own configured Python —
  it refuses a path or interpreter the Primary names — but a Primary you do not
  control still gets to start GPU work on your machine. Join only your own.
- A peer's bearer is a **compute** credential. It opens the six machine-to-machine
  endpoints and nothing else: not join-token minting, not device revocation, not
  the `jobs/*` enqueue routes. Enforced by endpoint name in `netguard.py`, never
  by path prefix — `/api/cluster/peer/connect` is a browser route living under the
  `/peer/` prefix, so a prefix test is wrong twice over.
- Peer must be **awake and online** (heartbeat ~90s).
- Models / node packs for a job must exist on the **machine that runs it**. The
  Primary skips its own Klein/Krea preflight for a remote job, so a missing model
  fails the job instead of raising an up-front 409.
- Flipping which box is Primary does **not** migrate `data/` — move the folder or keep Primary fixed.
- Auto / default device = Primary local (`local`).
- A remote job cannot ride a `commit=False` fan-out — its row has to be committed
  before a peer can claim it, and committing the caller's session would flush
  whatever else it had pending. `add_job` refuses the combination.
- Artifacts under `data/cluster_artifacts/<job_id>/` are swept at **boot** once
  older than 48 h, sparing pending/claimed/running jobs — not deleted on
  completion, because for a moment the artifact is the only copy of the output
  (`_materialize_comfy_output`'s fallback) and the `vision`/`infer` result JSON is
  read back out of it later by `read_job_result_json`. Bounded disk beats a
  deletion that can destroy a user's image.

## The second model: remote ComfyUI API backends (added same day)

The SwarmUI shape, for when the far box is yours and a bare ComfyUI is enough:
`cluster.backends` config entries (`api:<hex>` ids) appear in the same Run-on
picker in **any role**. `services/backend_worker.py` runs one thread per
backend — upload inputs over `/upload/image`, queue over `/prompt` (via
upstream's dormant `worker_url` params, now live — FORK_NOTES divergence 6),
poll `/history`, download over `/view` into the LOCAL output folder under a
`backend_<jobid>_` name so the remote SaveImage counter can never overwrite a
local render. No ClusterJob, no artifacts, no sweep surface. Backend jobs are
NOT gated on `training_in_progress` — that gate protects the local GPU, which
a backend does not use.

The trade against a peer, stated where users choose (Devices card, README,
settings-reference): a backend has **no auth** (raw ComfyUI API — trusted
networks only, never port-forwarded), a peer is token-gated and revocable and
can someday run the non-comfy kinds.

## Bank passes on a peer (added same day, third wave)

✨ Score and 👥 Faces move to a peer as ONE `infer` ClusterJob each (chunking
would break the style/person clustering the scripts compute over everything
they see). `services/bank_remote.py` is the hub half: images staged as
`{image_id}__{basename}` artifacts (duplicate basenames across folders),
`peer_worker._run_infer` redirects the payload's `cache`/`cancel_file` into its
`out/` (uploaded home on completion), and the hub re-keys results AND the .npz
cache to hub paths with sigs recomputed from hub files — losing that cache
silently would have broken find-by-text/select-similar with no error anywhere.
Stop rides the heartbeat: `peer_job_heartbeat` now answers
`{'cancelled': bool}`, the peer writes the scripts' own cancel-file sentinel
(infer) or breaks between images (vision). `device_id` rides the Launch-all
dialog config through all four queue routes and the `bank_queue` entries; a
remote entry skips the local-GPU wait in the drain loop. Peers only —
`_remote_pass_device` refuses `api:` ids with the reason. Local runs stay
byte-identical (no device → the historical code path).

## Non-goals (this wave)

- Browser WebGPU compute  
- Shared filesystem as transport  
- Re-adding cloud generation engines (fork divergence 1)

## Review checklist

- [ ] Join + revoke on Primary; peer connects and shows worker status  
- [ ] Generate with **Run on** peer; image lands in Primary dataset  
- [ ] Local generate still works with no peers / standalone  
- [ ] Access-token gate still allows the peer bearer on the six peer endpoints — and refuses it everywhere else  
- [ ] `python -m pytest backend/tests/test_cluster.py`  
- [ ] Frontend help/whats-new/settings-reference anchors for Devices  
