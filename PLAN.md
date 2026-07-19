# PLAN.md — Local LoRA stack integration

How the four forks fit together into one local pipeline, with **LoRA Dataset
Studio (LDS) as the hub**. Companion to `FORK_NOTES.md` (which tracks *where
this fork diverges from upstream*; this file tracks *where the stack is going*).

The four repos:

| Repo | Role in the stack |
|---|---|
| **lora-dataset-studio** (this repo) | Hub: dataset build → curate → caption → train → test, orchestrating the tools below |
| **ComfyUI** (unforked, standalone install) | The actual image-generation runtime: Klein generation, Test Studio, refinement & batch jobs |
| **SwarmUI** (fork, `MobileEnhancements`) | Day-to-day/easy generation UI on top of ComfyUI; mobile/PWA lane |
| **ai-toolkit** (fork: presets + advisor + dataset QoL tools) | The training engine LDS drives; also usable directly |
| **TagGUI** (fork: bucket calculator, perf) | Hands-on tag/caption editing for dataset prep |

## Guiding principles

1. **No cross-repo code.** Every integration lives at the config / filesystem /
   HTTP-API level. All forks periodically merge upstream; wiring repos into each
   other's internals would wreck that.
2. **Two shared contracts carry everything:**
   - **Model contract** — ComfyUI's `models/` tree (plus folders registered in
     `extra_model_paths.yaml`). LDS already reads it exactly like ComfyUI does;
     SwarmUI's model folders are configurable to point at it.
   - **Caption contract** — kohya-style `.txt` sidecars next to images.
     TagGUI edits them, ai-toolkit trains from them, LDS imports/exports them.
3. **One GPU, one ComfyUI.** Avoid two resident ComfyUI processes fighting for
   VRAM with training.

## Target architecture

```
                       ┌────────────────────────────┐
                       │        ComfyUI (8188)      │  ← single instance,
                       │  models/  = shared tree    │    single models/ tree
                       └──────┬──────────────┬──────┘
              HTTP API        │              │        backend (self-start off /
        ┌─────────────────────┘              └──────────────┐  API-by-URL)
        │                                                   │
┌───────┴────────────┐                             ┌────────┴────────┐
│ LoRA Dataset Studio│                             │     SwarmUI     │
│ (hub, 5050)        │                             │ (easy gen, 7801)│
│ generate·curate·   │                             │  Output/ ───────┼──┐
│ caption·train·test │                             └─────────────────┘  │
└───┬────────────┬───┘                                                  │
    │ spawns     │ exports/imports datasets                             │
    │            │ (.txt sidecars)                     scrape pile /    │
┌───┴────────┐  ┌┴──────────────────────┐              gen sessions     │
│ ai-toolkit │  │  dataset folders       │◄──── LDS Image Bank triage ◄─┘
│ (training) │  │  (datasets root)       │
│ output/ ───┼─►│  ◄─ TagGUI edits tags  │
└────────────┘  └───────────────────────┘
      └── trained LoRAs → ComfyUI models/loras/<family> → visible everywhere
```

## Phases

### Phase 0 — LDS goes local-only ✅ (shipped 2026-07-19)

- Nano Banana (Gemini) and ChatGPT (`gpt-image-2`) engines removed end to end;
  Klein (ComfyUI) is the sole generation engine. See `FORK_NOTES.md`.
- **Klein model-file pins** ✅: `klein.unet` / `klein.text_encoder` /
  `klein.vae` in Settings → Image engine name the exact loader files (including
  files outside `klein`-named folders and `extra_model_paths.yaml` roots), with
  honest ⚠ badges when a pin isn't on disk.

### Phase 1 — one model tree (config only)

Goal: a LoRA finishes training once and is instantly loadable in ComfyUI,
SwarmUI, LDS Test Studio and the LoRA-preset pickers.

- [ ] Treat the standalone ComfyUI's `models/` as the single source of truth.
      Models living elsewhere get folders registered in ComfyUI's
      `extra_model_paths.yaml` (LDS parses it identically — nothing to do on
      the LDS side).
- [ ] SwarmUI server settings: point `SDLoraFolder` at ComfyUI's
      `models/loras` and `SDModelFolder` at `models/checkpoints`
      (`;`-separated multi-paths are supported if a transition period needs
      both trees visible).
- [ ] Verify: train any small LoRA in LDS → it lands in
      `models/loras/<family>` → confirm it lists in SwarmUI's LoRA picker and
      in LDS Test Studio without copying anything.

### Phase 2 — one ComfyUI instance

Goal: stop paying double VRAM/model-load overhead.

Two viable shapes — pick one and note it here:

- **(a) SwarmUI-managed**: let SwarmUI self-start its ComfyUI, and point LDS
  `comfyui.api_url` at that instance's port. SwarmUI also proxies raw Comfy at
  `/ComfyBackendDirect/*` for node-graph work.
- **(b) Standalone-managed** *(preferred — matches "ComfyUI is my technical
  stack")*: keep the standalone ComfyUI on `127.0.0.1:8188`; add it to SwarmUI
  as an **API-By-URL backend**. Requires Phase 1's shared model paths (SwarmUI
  and Comfy must agree on relative model names) — which is done anyway.

- [ ] Configure the chosen shape.
- [ ] Verify: generate in SwarmUI and run an LDS Klein batch back-to-back —
      only one ComfyUI process resident, no model double-loading.

### Phase 3 — dataset flow (filesystem only)

Goal: lossless generate → triage → tag → train loop.

- [ ] Point TagGUI at ai-toolkit's datasets root (the `DATASETS_FOLDER` the
      ai-toolkit UI uses / LDS's `aitoolkit.datasets_dir`). Its `.txt` edits are
      exactly what the trainer reads. ⚠ TagGUI's bucket **processor** rewrites
      images in place (originals moved to `original_images/`) — run it before
      ai-toolkit ever caches the folder, or use it as a calculator only
      (ai-toolkit's trainer already buckets at load time).
- [ ] Route SwarmUI generation sessions (its `Output/` folder) and scrape piles
      into LDS's **Image Bank** for triage → promote keepers into datasets.
- [ ] Batch prep: ai-toolkit fork's `scripts/auto_caption.py` (WD14) for tag
      passes, TagGUI for interactive review, LDS captioning (JoyCaption /
      abliterated Ollama) for prose + NSFW datasets.

### Phase 4 — one Hugging Face cache

Goal: stop storing multi-GB models two or three times.

- [ ] Pick one `HF_HOME` directory. Set it in: TagGUI's `run.bat`, ai-toolkit's
      `hf_home` setting, and LDS's `aitoolkit.hf_home`.
- [ ] Verify with a fresh JoyCaption/WD-tagger run that nothing re-downloads.

### Phase 5 — later / optional

- [ ] Cross-check LDS's built-in training presets against the ai-toolkit fork's
      `stepSuggestion.ts` advisor for the families actually trained (keep the
      advisor's flagged-uncertain values flagged).
- [ ] Add a `FORK_NOTES.md` to the TagGUI fork (it's the only fork without a
      merge map; `Plan.md` there is roadmap, not divergence tracking).
- [ ] Decide whether the SwarmUI fork's mobile/PWA lane needs anything from
      LDS's QR/LAN access story (probably not — they serve different pages).

## Day-to-day runbook (once Phases 1–4 are done)

- **Always running**: ComfyUI (the one instance) + whichever UI you're using.
- **Easy generation**: SwarmUI → outputs to `Output/` → Bank-triage anything
  dataset-worthy.
- **Refinement / batch jobs**: raw ComfyUI graphs (directly or via
  `/ComfyBackendDirect`).
- **Dataset building**: LDS end to end (generate via Klein, scrape, Bank,
  curate, caption); TagGUI open on the dataset folder for hand-editing tags.
- **Training**: LDS → ai-toolkit (or ai-toolkit UI directly for experimental
  configs); trained LoRA lands in the shared `models/loras/<family>` and is
  immediately testable in LDS Test Studio and usable in SwarmUI/ComfyUI.

## Upstream-merge posture (all forks)

- lora-dataset-studio: merge map in `FORK_NOTES.md` (this repo).
- ai-toolkit: `FORK_NOTES.md` + `PLAN.md` (fork-owned files, tiny upstream
  touchpoints — keep it that way).
- SwarmUI: `CLAUDE.md` Fork Delta + builtin-extension-only rule (zero core
  edits so far — keep it that way).
- TagGUI: no merge map yet (Phase 5 item).
