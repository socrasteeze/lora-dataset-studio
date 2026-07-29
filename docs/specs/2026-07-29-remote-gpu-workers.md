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

| Kind | Hub entry | Peer execution |
|------|-----------|----------------|
| `comfy` | `ImageGenerationQueue.worker_id` + `ClusterJob`; generate / improve paths pass `device_id` | Local ComfyUI; output uploaded; hub `_dispatch_completion` |
| `vision` | `POST /api/cluster/jobs/vision` | Ollama `describe_image_ollama` batch |
| `infer` | `POST /api/cluster/jobs/infer` | `backend/infer/*.py` via `infer_stream` |
| `training` | `POST /api/dataset/<id>/train` with remote `device_id`, or `/api/cluster/jobs/training` | Zip + config with `{{DATASET_DIR}}` / `{{OUTPUT_DIR}}`; `run_peer_training` |

## Key files

| Area | Path |
|------|------|
| Models | `backend/app/models.py` — `ClusterDevice`, `ClusterJoinToken`, `ClusterJob` |
| Hub logic | `backend/app/services/cluster.py`, `cluster_remote.py` |
| Peer loop | `backend/app/services/peer_worker.py` |
| HTTP | `backend/app/routes/cluster.py` |
| Queue | `backend/app/job_queue.py` — skips non-local `worker_id`; publishes remote Comfy jobs |
| Auth | `backend/app/netguard.py` — peer bearer + `/api/cluster/join` exemption |
| UI | Settings `DevicesSection`, `DevicePicker` on generate |
| Tests | `backend/tests/test_cluster.py` |

## User flow (Tailscale)

1. **Primary:** Settings → Devices → role Primary → Generate join token → copy once.  
2. **Peer:** same app install + local ComfyUI/Ollama/ai-toolkit as needed → role Peer → Primary URL + token → Join.  
3. Browse the **Primary** URL from either machine → Generate → **Run on** → pick peer or this machine.

## Limits (keep visible in review / README)

- Peer must be **awake and online** (heartbeat ~90s).
- Models / node packs for a job must exist on the **machine that runs it**.
- Flipping which box is Primary does **not** migrate `data/` — move the folder or keep Primary fixed.
- Auto / default device = Primary local (`local`).

## Non-goals (this wave)

- Browser WebGPU compute  
- Shared filesystem as transport  
- Re-adding cloud generation engines (fork divergence 1)

## Review checklist

- [ ] Join + revoke on Primary; peer connects and shows worker status  
- [ ] Generate with **Run on** peer; image lands in Primary dataset  
- [ ] Local generate still works with no peers / standalone  
- [ ] Access-token gate still allows peer bearer on `/api/cluster/*`  
- [ ] `python -m pytest backend/tests/test_cluster.py`  
- [ ] Frontend help/whats-new/settings-reference anchors for Devices  
