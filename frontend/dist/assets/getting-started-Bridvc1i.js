const n=`# Getting started\r
\r
LoRA Dataset Studio turns one reference photo into a trained, ranked LoRA —\r
curation, captioning, face-scoring and training behind a single browser tab, on\r
your own machine. The useful part of LoRA training isn't the training; it's\r
building a clean, balanced, well-captioned image set. This app puts that whole\r
pipeline behind one UI.\r
\r
> **In a hurry?** Launch the app, let the **Setup** wizard scan your machine,\r
> and create your first dataset from your own photos — no API key, no GPU, no\r
> external tool required for that first step.\r
\r
---\r
\r
## Two ways to run it\r
\r
| | Curation-only | Full local |\r
|---|---|---|\r
| **What works** | Create datasets, import/scrape, curate, caption manually, export ZIP | Everything — plus local (Klein) generation, JoyCaption, face scoring, masks, training, Test Studio |\r
| **Needs** | Python 3.10–3.12 | ComfyUI and/or ai-toolkit + an NVIDIA GPU (12 GB+ for local generation) |\r
| **Good for** | Laptops, a first try, curating away from your GPU box | The full pipeline on a training rig |\r
\r
You can start **curation-only** (import/scrape your own photos) and add the\r
local tools later — features light up automatically when their tool is\r
detected. This fork has no cloud API engines and no rented-GPU training: generation\r
and training both run on hardware you control.\r
\r
## First launch\r
\r
**Windows (one command):** download \`LoRA-Dataset-Studio-windows.zip\` from the\r
[latest release](https://github.com/perfectgf/lora-dataset-studio/releases/latest),\r
extract it, then double-click \`start.bat\`. Releases contain an archive/source, not\r
a prebuilt executable launcher. \`start.bat\` finds or downloads a compatible Python\r
(3.10–3.12), creates \`.venv\`, installs the requirements, starts the server, and\r
opens the app in your browser at the address it is actually serving on (default\r
\`http://127.0.0.1:5050/\`; a LAN/Tailscale \`server.host\` opens that address\r
instead, once the server is up — set \`LDS_NO_BROWSER=1\` to skip the auto-open).\r
\r
**Any OS (manual venv):**\r
\r
\`\`\`\r
python -m venv .venv\r
source .venv/bin/activate        # Windows: .venv\\Scripts\\activate\r
pip install -r backend/requirements.txt\r
python backend/run.py\r
\`\`\`\r
\r
**Pinokio (one click, any OS):** in [Pinokio](https://pinokio.computer), use\r
**Discover → Download from URL** with\r
\`https://github.com/socrasteeze/lora-dataset-studio.git\`, then **Install** and\r
**Start**. Pinokio creates the environment (\`env/\`), installs the core\r
requirements and opens Studio on the port it really bound. Two things to know:\r
the optional tools are still connected from **Setup**, and updates go through\r
Pinokio's **Update** tab — it runs the same \`git pull --ff-only\` as the in-app\r
updater. You do not have to remember that last part: the app recognises a\r
Pinokio launch and its Updates card shows *Stop → Update → Start* (with how many\r
commits behind you are) instead of the **Update & restart** button, which would\r
relaunch the server in a window Pinokio no longer tracks.\r
\r
**Docker (curation-only):** \`cp .env.example .env\`, then \`docker compose up --build\`.\r
Image *generation* on this fork always needs ComfyUI locally — there are no\r
Gemini/OpenAI generation keys.\r
\r
**Docker (GPU, with ComfyUI inside):** \`cp .env.example .env\`, then\r
\`mkdir -p run basedir data-docker-gpu bank-images\` — create those yourself, or Docker creates\r
them as \`root\` and the app cannot write to them — then\r
\`docker compose -f docker-compose.gpu.yml up --build\`. Needs an NVIDIA GPU and the\r
NVIDIA Container Toolkit; this is the only Docker option that can do Klein/Z-Image\r
generation and the Test Studio.\r
\r
The CUDA 12.x compatibility minimum is driver **525.60.13 on Linux** or **528.33\r
on Windows/WSL**; for the default CUDA 12.9 image, use at least **575.51.03 on\r
Linux** or **576.02 on Windows**. The optional CUDA 13 image needs **R580+**.\r
If you reuse an existing ComfyUI tree, \`LDS_COMFY_BASEDIR\` must name the parent\r
that directly contains \`models/\`, \`input/\`, \`output/\` and \`custom_nodes/\`, not\r
the \`models/\` folder itself. Compose actively defaults DNS to \`1.1.1.1\`; set\r
\`LDS_DNS\` to your router or Pi-hole when internal hostnames matter.\r
\r
Both ports are published on the host and remain reachable from the LAN. A\r
Settings restart is handled by the container supervisor and keeps the fixed\r
container bind. To update this Docker flavour, update and rebuild the image rather\r
than trying to replace \`/app\` in place:\r
\r
\`\`\`\r
git pull\r
docker compose -f docker-compose.gpu.yml up -d --build\r
\`\`\`\r
\r
If \`/data\` or existing contents beneath it are not writable, \`LDS_FORCE_CHOWN=true\`\r
is the last resort: it recursively changes ownership only for the \`LDS_DATA\` mount,\r
never the ComfyUI or bank mounts.\r
\r
The full install matrix (Windows release ZIP, GPU requirements, external tools)\r
lives in the README on GitHub.\r
\r
## What is running on your machine {#architecture}\r
\r
A full-local install is **three separate programs**, in **two folders**, on\r
**two ports**, with **two Python environments**. Nothing in the app used to say\r
so, and the cost of guessing is real: a user spent hours patching ai-toolkit's\r
own web UI — a component this app never talks to — while the actual problem was\r
one line of \`config.json\` (reported by strouder, GitHub #19).\r
\r
| Component | Where | What it does | Port |\r
|---|---|---|---|\r
| **LoRA Dataset Studio** (Flask) | the folder you extracted, **its own \`.venv\`** | The UI you are reading this in. Curation, captioning, and the thing that **starts and stops training**. | **5050** |\r
| **ai-toolkit** (\`run.py\`) | the folder you point at in Settings, **its own venv — the one with \`torch\`** | The training **engine**. It is run as a command-line process; it has no UI of its own. | — |\r
| ai-toolkit's Next.js UI (\`ui/\`) | inside the ai-toolkit folder | An **unrelated** web interface that ships with ai-toolkit. This app never launches it, never reads it, and never writes to it. | 8675 |\r
\r
Two consequences worth remembering:\r
\r
- **The Studio reads \`config.json\` and drives training.** That file belongs to\r
  this app (it sits in its data folder, and every key in it has a field in\r
  **Settings**). Editing anything inside ai-toolkit's \`ui/\` folder changes\r
  nothing here — if you ever find yourself editing \`ui/dist/…\`, you are in the\r
  wrong project.\r
- **The two Python environments are not interchangeable.** The Studio's \`.venv\`\r
  runs the web app; ai-toolkit's venv is the one that must have \`torch\` and the\r
  training dependencies. Settings ▸ Local tools ▸ **Python interpreter** is how\r
  you tell the app which interpreter is ai-toolkit's — and its **Test** button\r
  now checks that the interpreter can really \`import torch\`, not just that the\r
  file exists.\r
\r
There is no process stacking to worry about on our side: the Studio is a single\r
Flask process, and starting a second one on the same port fails loudly instead\r
of running invisibly alongside the first.\r
\r
### Supported Python versions {#python-versions}\r
\r
- **LoRA Dataset Studio: Python 3.10 – 3.12.** \`start.bat\` finds or downloads\r
  one for you; the optional ML extras (insightface, onnxruntime, \`numpy<2\`)\r
  only publish wheels for those versions.\r
- **ai-toolkit: Python 3.11 is the safe choice.** On **3.13** its pinned\r
  \`scipy==1.12.0\` has no wheel, pip falls back to building from source and dies\r
  on a missing Fortran compiler (measured and reported by strouder, GitHub #19).\r
  On Windows, install **3.11.9** — it is the last 3.11 with a binary installer;\r
  later 3.11.x are source-only security releases.\r
- The two do **not** have to match. They are separate environments on purpose.\r
\r
### If Hugging Face downloads fail {#hf-downloads}\r
\r
If a base-model download dies with something that reads like a network error,\r
check whether \`HF_HUB_ENABLE_HF_TRANSFER=1\` is set in your environment. That\r
turns on an optional fast-download accelerator which needs the \`hf_xet\` (or\r
\`hf_transfer\`) package installed **in the environment doing the downloading**;\r
without it, transfers abort with a misleading message. This app never sets that\r
variable — it comes from your shell, ai-toolkit's \`.env\`, or a ComfyUI launcher.\r
Either fix works: set \`HF_HUB_ENABLE_HF_TRANSFER=0\`, or \`pip install hf_xet\`.\r
The training failure panel now recognises this case and says so.\r
*(Reported by bobba84, GitHub #18.)*\r
\r
## The Setup wizard\r
\r
On first launch you land in **Setup**. It scans your machine automatically and\r
walks through four steps — each one unlocks a set of features:\r
\r
1. **ComfyUI** — unlocks local (Klein) image generation and the Test Studio.\r
2. **Ollama** — the local vision model behind auto-captioning, framing\r
   auto-classify and head-crop.\r
3. **Quality tools** — face-similarity scoring, person masks, watermark\r
   inpainting and bank scoring (a one-click \`pip install\`).\r
4. **ai-toolkit** — the training engine.\r
\r
Each optional helper says what it unlocks and what still works without it, and\r
installs on its own — or all at once, which is usually what you want on a fresh\r
machine.\r
\r
<p align="center">\r
  <img src="../screenshots/setup/install-everything.png" alt="Setup step 4 listing each ML helper with its own Install button and an Install all option" width="760">\r
</p>\r
\r
Nothing is mandatory: **Skip setup** is always available, and every step can be\r
revisited later from **Settings**, where each tool has a Test button that tells\r
you immediately whether the app can see it.\r
\r
**Setup is a first run, not a toll gate.** Once the app has seen your install\r
working — configured, with at least one image engine answering — it stops\r
sending you to the wizard. Coming back later (a new tab, a new browser, another\r
machine on your network, or a restarted server) drops you straight into the app,\r
and the same checks the wizard runs happen in the background while you work. A\r
short line in the corner says so and then fades.\r
\r
You are only interrupted when something that *used to* work has stopped —\r
an API key that no longer answers, an ML helper that no longer imports. The\r
warning names what broke and links to Setup. It does **not** fire because\r
ComfyUI or Ollama simply isn't running (you start those on demand), and it does\r
not fire because something was never installed in the first place. If you\r
removed a component deliberately, **That was on purpose** stops the app\r
mentioning it again.\r
\r
## Around the app\r
\r
- **Datasets** — the home tab and your **library**: photo tiles of every\r
  dataset, grouped by model family, with a search box and a badge for each\r
  family you've already trained. Create one and work it through the guided\r
  flow (source → curate → caption → train).\r
- **Runs** — every local training in one place: live progress, the settings\r
  each launch used, retry a failed run (↻), continue a finished one (▶), and\r
  download the LoRA (appears once ai-toolkit is set).\r
- **Test Studio** — grid-test a trained LoRA across checkpoints and strengths,\r
  vote, and rank (appears once ComfyUI is reachable).\r
- **Guide** — this manual.\r
- **Setup** — the guided wizard, re-runnable anytime.\r
- **Settings** — everything the wizard configures, plus server, updates,\r
  maintenance and the diagnostic report.\r
\r
Next chapter: **Using the app** — the full walkthrough, dataset type by dataset\r
type.\r
`;export{n as default};
