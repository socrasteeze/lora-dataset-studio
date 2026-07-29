# Remote GPU workers (Primary + peer)

**Date:** 2026-07-29  
**Branch:** `cursor/remote-gpu-workers`  
**Status:** implemented in this branch (foundation through training kind + docs/UI)

## Why

Open the Primary’s web UI from another machine (e.g. laptop on Tailscale) and still choose **which box’s GPU** runs a job. Datasets and SQLite stay on the **Primary**. The other install is a **compute peer** that “rents” its hardware; results write back to the Primary.

Either machine can be designated Primary — same product shape, not “laptop is always the weak worker.”

## Roles

| Role | Meaning |
|------|---------|
| `standalone` | Default; today’s single-machine behaviour. |
| `primary` | Owns `data/`, issues join tokens, schedules jobs, serves the UI browsers should bookmark. |
| `peer` | Joins a Primary with a one-time token; pulls jobs; runs Comfy / vision / infer / training locally; uploads artifacts. |

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
| `vision` | `POST /api/cluster/jobs/vision` | Ollama `describe_image_ollama` batch | **Open** — no in-app caller; result JSON sits on the ClusterJob |
| `infer` | `POST /api/cluster/jobs/infer` | `backend/infer/<name>.py` (own install only) via `infer_stream` | **Open** — no in-app caller |
| `training` | `POST /api/dataset/<id>/train` with remote `device_id`, or `/api/cluster/jobs/training` | Zip + config with `{{DATASET_DIR}}` / `{{OUTPUT_DIR}}`; `run_peer_training` | **Open** — checkpoints upload as artifacts; no `TrainingRunRecord`, no Training-page progress |

Only `comfy` is a finished user-facing feature. `complete_cluster_job` bridges back
into the app for that kind alone; the other three land their output in
`data/cluster_artifacts/<job_id>/` and stop there. Say so wherever the feature is
described — a picker that silently does nothing is worse than one that isn't offered.

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

- **Generation is the only kind a user can actually send to a peer.** See the job-kind table.
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
