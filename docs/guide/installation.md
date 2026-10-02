# Installation

[Documentation](../README.md) · [Requirements](requirements.md) · [First launch](getting-started.md)

On first launch, **Setup** prepares the core. No plugin is needed to import and organise images. Afterwards, open **Plugins**. The features that ship with the app are already installed. A ZIP you trust can be added from that page, and one restart applies it. Each plugin has its own settings and preparation steps; required ComfyUI custom nodes are installed through that plugin's preparation flow.

## Windows

Download **`LoRA-Dataset-Studio-windows.zip`** from the [latest release](https://github.com/perfectgf/lora-dataset-studio/releases/latest). For a new installation, extract the entire archive into a new folder, then double-click:

```text
start.bat
```

`start.bat` uses Python 3.10–3.12 if available. If none is installed, it downloads a self-contained CPython 3.12 into `.python\`, creates `.venv`, installs the core requirements, opens `http://127.0.0.1:5050/`, and starts the server. It requires no admin rights and changes no system PATH.

On an existing ZIP installation, **Update & restart** downloads the next release and swaps the core in, keeping `data/`, `config.json`, `.env`, `.venv` and `.python` untouched. Features that ship with the app stay installed. Add a ZIP you trust from **Plugins**; one restart applies it. A git checkout follows its configured branch instead and needs `git` on your PATH, which an install made through a desktop Git client does not always provide.

The default `v2` branch carries the maintained version of LDS. Clone it to follow its commits with **Update & restart**:

```bash
git clone https://github.com/perfectgf/lora-dataset-studio.git
cd lora-dataset-studio
start.bat
```

The former `main` branch is now [`v1`](https://github.com/perfectgf/lora-dataset-studio/tree/v1). It is read-only and no longer maintained; updates and contributions go to `v2`.

**Want a guided migration?** [Download the V2 migration helper](https://github.com/perfectgf/lora-dataset-studio/releases/download/v2026.09.14.4/LDS-Migrate-to-V2.zip), extract it outside your installation and run `migrate-to-v2.bat`. It checks the Git installation, backs up the database/settings and switches branches while leaving media in place. [Instructions, backup scope and supported installations](migrate-to-v2.md).

For an existing git installation still on `main`, stop LDS and run these commands from its folder, then start LDS again:

```bash
git fetch origin
git switch v2
git branch --set-upstream-to=origin/v2 v2
```

## Manual installation

Clone the default branch as above or download its [source archive](https://github.com/perfectgf/lora-dataset-studio/archive/refs/heads/v2.zip), open a terminal in its root, then run:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
# optional local ML capabilities:
pip install -r backend/requirements-ml.txt
python backend/run.py
```

Only rebuild the frontend when changing `frontend/src`:

```bash
cd frontend
npm install
npm run build
```

## Pinokio

In [Pinokio](https://pinokio.computer), open **Discover → Download from URL** and paste `https://github.com/perfectgf/lora-dataset-studio.git`, then click **Install** and **Start**. Pinokio builds the Python environment, installs the core requirements and opens Studio; **Update** fast-forwards the same checkout the in-app updater uses.

Only the core app is installed this way. Complete **Setup**, then open **Plugins** for the features that ship with the app. Each plugin carries its own settings and preparation steps. Updates go through Pinokio's **Update** tab: because Pinokio starts and stops the server, the app detects this install shape and shows *Stop → Update → Start* instead of its own **Update & restart** button, which would relaunch the server outside Pinokio's control.

## External tools

| Tool | Unlocks | Connect it |
|---|---|---|
| [ai-toolkit](https://github.com/ostris/ai-toolkit) | Local LoRA training and JoyCaption | Set its directory and Python interpreter in **Settings → Local tools**; conda, uv, venv and portable Python installs are supported |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | Klein/Krea local generation, Studio, Canvas generation and deployment; SDXL base discovery | Keep its API reachable and set the install/models paths in **Settings → Local tools** |
| [Ollama](https://ollama.com) | Auto-captioning, framing, head-crop and watermark detection | Set its URL in **Settings**, then pull the model explicitly from LDS |
| [LM Studio](https://lmstudio.ai) | The same, if that is the local model server you already run | Pick it in **Settings ▸ Local tools**. It only serves a model you have loaded (no JIT by default), and LDS cannot start it for you — its Developer tab has the switch |

Which of the two serves those features is a single setting (**Settings ▸ Local tools ▸ Local LLM provider**); Ollama stays the default. The full path rules, model layouts and provider states are in the [settings reference](settings-reference.md#local-tools). If a tool remains unavailable, use the [troubleshooting guide](troubleshooting.md).

## API keys

| Service | Used for | Where to create it |
|---|---|---|
| Pexels | Optional official-API image search | [Pexels API key](https://www.pexels.com/api/key/) |
| Hugging Face | Gated weights and optional publishing | [Hugging Face tokens](https://huggingface.co/settings/tokens) |

Secrets saved in Settings live in the git-ignored `.env`, never in `config.json` or a commit. This build carries no referral or affiliate link of any kind, and no cloud generation or cloud training plugin ships or loads here — see [Known limitations](known-limitations.md).

> **Pexels authorization required:** An API key alone does not authorize dataset or machine-learning use. Configure this integration only if Pexels has explicitly authorized this use case, and keep the attribution LDS displays. Read the [official Pexels terms and conditions](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions/).

## Install on this machine

| Mode | Good for | What is optional or unavailable |
|---|---|---|
| **Full local** | Local engines, ML helpers, ai-toolkit training, Canvas generation and Test Studio | Install and connect only the tools you need; each capability degrades independently |
