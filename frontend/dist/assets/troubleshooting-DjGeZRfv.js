const e=`# Troubleshooting\r
\r
Symptom-first, most-reported first. If your problem isn't here, the next\r
chapter (**Getting help**) shows how to report it with one click.\r
\r
---\r
\r
## The page is completely blank on Windows, in every browser\r
\r
**Symptom:** the server log looks healthy, but the page is white and no browser\r
loads the interface.\r
\r
**Why:** Windows stores a content type for each extension in\r
\`HKEY_CLASSES_ROOT\\<ext>\\Content Type\`. Another program can overwrite the\r
\`.js\` value with \`text/plain\`; older LDS builds then served the bundle with\r
that registry MIME type and browsers refused to execute it.\r
\r
**Fix:** update LoRA Dataset Studio and restart it. Current builds set the MIME\r
type of served assets themselves and do not trust the Windows registry. If an\r
old build must be used temporarily, repair the \`.js\` Content Type to a\r
JavaScript MIME type, then restart the browser. Updating is safer than making a\r
registry edit by hand.\r
\r
*(Reported and diagnosed in [GitHub #12](https://github.com/perfectgf/lora-dataset-studio/issues/12).)*\r
\r
## "No Z-Image model available" in the Test Studio or training panel\r
\r
**Why:** the Test Studio generates through ComfyUI, so the Z-Image *base model*\r
must physically live in your ComfyUI install — and the scanner only accepts it\r
inside a sub-folder whose name contains \`z image\` (or \`zimage\`). A file dropped\r
loose in \`models/unet\` is **not** detected.\r
\r
**Fix:** lay the stack out like this inside your ComfyUI folder, then re-test:\r
\r
\`\`\`\r
models/unet/z image/<your Z-Image checkpoint>.safetensors\r
models/text_encoders/Z image/qwen_3_4b.safetensors\r
models/vae/z ae.safetensors\r
\`\`\`\r
\r
**The text encoder and the VAE are flexible** — only the base model needs that\r
sub-folder. The app resolves those two itself: any capitalisation, any separator\r
and any sub-folder work, so \`models/vae/z_ae.safetensors\`, \`models/vae/ae.safetensors\`\r
(the name ComfyUI's own Z-Image page uses), \`text_encoders/Z Image/qwen_3_4b.safetensors\`\r
and a bare \`text_encoders/qwen_3_4b.safetensors\` are all found, including under an\r
\`extra_model_paths.yaml\` root. **Do not rename your files to match the layout above.**\r
If the app still says one is missing, the message lists what it accepted and where it\r
looked; you can also pin either file by hand with the \`zimage.vae\` /\r
\`zimage.text_encoder\` settings (see *Settings reference → Config-file-only settings*).\r
\r
A Z-Image LoRA only works on a Z-Image base — a regular SD/SDXL graph\r
(20–30 steps, CFG 7) renders garbage. The two Z-Image builds then want opposite\r
sampler settings, and the Test Studio proposes the right pair per base model:\r
**Z-Image-Turbo** is guidance-distilled and wants euler / simple / **8 steps /\r
CFG 1.0**, while the non-distilled **Z-Image Base** needs roughly **30–50 steps at\r
CFG 3–5** (ComfyUI's own recommendation) — run Base at CFG 1 and it renders mush.\r
Those are starting points on a sweepable axis, not measured optima: the Studio grid\r
exists to let you find yours.\r
\r
## "No SDXL checkpoint found" on a fresh install\r
\r
**Why:** the app derives the models folder from **Settings → Local tools →\r
ComfyUI install directory**. If only the API URL is set, there's nothing to scan.\r
\r
**Fix:** point the install directory at the folder that contains \`models/\` and\r
\`main.py\` (the Setup wizard detects it for you), then hit **Test**. SDXL\r
checkpoints are scanned from \`models/checkpoints\`.\r
\r
## The Krea 2 Turbo Test Studio says a custom node is missing\r
\r
**Why:** the Krea grid rebalances the Qwen3-VL conditioning through a small\r
community node (class \`ConditioningKrea2Rebalance\`). It isn't a stock ComfyUI\r
node, so a ComfyUI that doesn't have it can't run the Krea pipeline and the\r
Studio stops before wasting a run — the same up-front check used for missing\r
model files.\r
\r
**Fix:** install the **ComfyUI-Conditioning-Rebalance** pack (in ComfyUI-Manager,\r
search **"Krea 2 Conditioning"** — repo\r
\`https://github.com/nova452/ComfyUI-Conditioning-Rebalance\`), then restart\r
ComfyUI and relaunch the test. The Studio's error banner names this pack and\r
links it directly. Either that original pack or its \`comfyui-krea2-conditioning\`\r
fork works — the app pins the node so your rebalance-strength setting is applied\r
the same way on both.\r
\r
## The reference crop isn't centered on the face\r
\r
**Why:** on a fresh clone the configured Ollama vision model isn't pulled yet,\r
so head detection silently falls back to a centered square crop. The app now\r
shows a warning toast naming the missing model when this happens.\r
\r
**Fix:** **Setup → Ollama** — pull the vision model (use the **Instruct**\r
variant, not *Thinking*), or click the tile's crop button and frame it by hand.\r
**↺ Reset to auto** re-runs the auto-crop after the model is installed.\r
\r
## Ollama isn't detected (or is installed but stopped)\r
\r
In Docker, host binary detection is not the deployment selector. Open **Setup → Ollama** and choose:\r
\r
| Docker choice | Expected state | Fix |\r
|---|---|---|\r
| **No Ollama** | Disabled by choice | Choose another card only if you want the Ollama features |\r
| **Existing host Ollama** | API at \`http://host.docker.internal:11434\` | Start Ollama on the host, bind it so Docker can reach it, and restrict port 11434 to Docker/private networks |\r
| **Docker Ollama** | Companion API at \`http://ollama:11434\` | If the companion is absent, rerun the same LDS Docker launcher |\r
\r
On a native install, LDS still distinguishes **not installed**, **installed but stopped**, and **running**. The **▶ Start Ollama** button applies only to a detected native binary.\r
\r
**You do not have to install Ollama to finish Setup.** If JoyCaption is installed, captioning already works without it and the step is only a recommendation. With neither installed, the step offers **Continue without Ollama**, which lists what turns off (auto-classify framing, auto head-crop, Test Studio Describe & Enhance, the bank's "Describe filter", the vision route of watermark detection, short captions) before you commit, and then stops asking. Starting Ollama later cancels the skip on its own — nothing to undo.\r
\r
No launcher or **Install everything** action pulls the large vision model. Once the selected service is reachable, use the explicit **Pull** button in LDS Setup; it shows progress and supports cancellation/resume. Keep the **Instruct** tag. The Thinking variant reasons instead of returning the compact captions these workflows expect.\r
\r
## LM Studio is running but LDS says nothing is loaded\r
\r
That is usually correct, not a bug. LM Studio ships with **JIT loading off**, so the server answers every request that lists models and refuses every request that generates one. Load a model in its **Developer** tab (a vision model if you want captioning, framing or head-crop) and the status turns green.\r
\r
Three more things worth knowing when the two disagree:\r
\r
| Symptom | Cause | Fix |\r
|---|---|---|\r
| Every call fails, and the message talks about Ollama holding the GPU | The URL carries a path — LM Studio's Developer tab shows \`http://localhost:1234/v1\` and that is what gets pasted | Nothing to do on recent builds: the \`/v1\` is stripped automatically. If you typed something else after the port, remove it. |\r
| **"No usable model is loaded"** | LM Studio ships with just-in-time loading OFF, and older LDS builds left the loading to you — then unloaded your own copy when their keep-warm expired, which read as "load it, again and again" | Update LDS: it now loads the model itself — automatically when a pass needs it, or from the **⏬ Load the vision model** button in Setup and Settings ▸ Local tools. A missing model can be **downloaded from Settings ▸ Local tools** as well — model id or huggingface.co URL; the job runs inside LM Studio, so it survives an LDS restart. |\r
| The card says the server answers but cannot tell what is loaded | Only the OpenAI-compatible API is answering; it reports neither model type nor residency | Name a model explicitly in **Settings ▸ Local tools ▸ LM Studio model**, or update LM Studio so its native API answers |\r
| Captioning works but framing/head-crop do not | The loaded model is a text model, not a vision one | Load a VLM (a model LM Studio lists with vision support) |\r
\r
**In Docker, \`127.0.0.1\` is the container, not your machine.** LM Studio runs on the host, so a containerised LDS must be pointed at **\`http://host.docker.internal:1234\`** — the Settings card shows that address as the placeholder when it detects a container. LM Studio's server also has to be reachable from Docker (it listens on localhost only by default; enable serving on the local network in its Developer tab).\r
\r
**▶ Start LM Studio** appears on the Local tools card and the Setup step when the server is down and LM Studio's command-line tool is present — it is installed the first time you open LM Studio, so an install that has never been launched gets the Developer-tab sentence instead of a button that could not work. Pressing it leaves a model alone if only the server had stopped; if LM Studio itself was closed, the server comes back empty and you load a model in its Developer tab. Either way it starts the server on the port your settings name. In Docker the button is not offered: the container cannot start an application on your desktop, whatever the URL says.\r
\r
## Training log looks frozen for several minutes\r
\r
**Why:** ai-toolkit's output is block-buffered during model load and latent\r
caching — nothing prints even though it's working. A "warming up" phase before\r
the first logged step is expected, and Krea-2-Raw runs are *hours* long by\r
design.\r
\r
**Fix:** nothing to fix — check GPU utilization or watch the ai-toolkit output\r
folder for new files if you want proof of life. Open **Runs** to watch live\r
progress for the current local training.\r
\r
## Training dies immediately on an RTX 50-series card ("no kernel image is available")\r
\r
**Why:** an RTX 50-series/Blackwell GPU reports compute capability \`sm_120\`.\r
An older torch build can still report \`torch.cuda.is_available() == True\` and\r
name the card correctly while carrying no kernel for that architecture. The run\r
then fails on its first real CUDA operation.\r
\r
**Fix:** install a CUDA 12.8 torch build **inside ai-toolkit's own Python\r
environment**, not only in the LDS venv:\r
\r
\`\`\`bash\r
python -m pip install torch --index-url https://download.pytorch.org/whl/cu128\r
\`\`\`\r
\r
Run that command with the exact Python configured under **Settings → Local\r
tools → ai-toolkit Python interpreter**. The preflight/failure panel recognizes\r
this specific \`sm_120\` mismatch. For another architecture mismatch, use the\r
torch build appropriate to that card instead of copying this command blindly.\r
\r
## Local training crawls: GPU near idle, RAM climbing, ETA in the hundreds of hours\r
\r
The run started, the training panel shows a step counter, but the ETA reads\r
like \`ETA 300:12:45\`, the GPU sits at a few percent and the only number that\r
moved is system RAM. Nothing failed, and that is the problem.\r
\r
**What it is.** The run no longer fits in the card's memory. On Windows the\r
NVIDIA driver, by default (Control Panel → *CUDA - Sysmem Fallback Policy*),\r
does not answer that with an out-of-memory error: it pages the overflow into\r
system RAM and keeps going, tens of times slower. Measured here: Krea 2 at 1024\r
on a saturated 24 GB card, about 180 s per step and an ETA of seven days; the\r
same run at 768, 3.5 s per step. Linux, or Windows with *Prefer No Sysmem\r
Fallback* set, fails loudly instead (\`CUDA out of memory\`), which is the kinder\r
failure.\r
\r
**Why it happens on a card that should fit.** The Krea 2 and FLUX.1 recipes are\r
calibrated to fit a 24 GB card that is *empty*, and they do: measured with the\r
shipped Krea 2 recipe on an otherwise idle 24 GB card, the run peaks at about\r
21.6 GB, so a little under 3 GB is all the room there is. Anything else holding\r
that much tips them over, and the usual culprit on a machine that also runs ComfyUI is\r
ComfyUI itself: it keeps the models it last used resident (in VRAM while it\r
has the room, in system RAM once they leave the card) and does not let go on\r
its own. A\r
browser with many tabs, a second monitor and a game launcher add up too.\r
\r
**Two readings settle it.** Task Manager → Performance → GPU: *Dedicated GPU\r
memory* pinned near the top with *Shared GPU memory* at several GB means the\r
driver is paging. The GPU % in the app's 📊 readout comes straight from\r
\`nvidia-smi\` and is the figure to trust.\r
\r
**Fix.** ⏹ Stop the run, unfold the 📊 readout in the top bar and press\r
🧹 **Free memory** (ComfyUI unloads its cached models and the vision model is\r
released; the VRAM figure should fall to a couple of GB), or simply close\r
ComfyUI, then launch again. A healthy run shows the GPU at 90-100 % and a few\r
seconds per step once the first minutes are over. If it still crawls with an\r
empty card, ⚙️ Advanced options → **Resolution** → *768 only (low VRAM)*, and\r
leave Expert → **Memory saving** on: that trio of switches is what makes a 12B\r
model fit at all.\r
\r
The app also asks ComfyUI to unload before every local run (the same request\r
the 🧹 button and the vision passes make), so with a reachable ComfyUI this\r
trap closes by itself; the app log's launch line says what the card held\r
before the request and at spawn.\r
\r
**Not this.** The first minutes of an image run legitimately show a low GPU and\r
a high RAM: the weights are read into RAM and quantised, the text embeddings and\r
latents are cached, and the step-0 preview images are rendered before step 1 (a\r
video run skips the previews). Read the ETA after five minutes of steps, not\r
before.\r
\r
## ai-toolkit isn't detected (conda / uv / no venv)\r
\r
**Why:** the app auto-detects ai-toolkit's Python from a \`venv/\` or \`.venv/\`\r
folder next to its \`run.py\`. Installs that use conda, uv or the system Python\r
have no such folder, so the Test button can't find an interpreter — training\r
and JoyCaption stay hidden.\r
\r
**Fix:** in **Settings → Local tools → ai-toolkit**, keep the directory pointing\r
at the ai-toolkit folder and fill the optional **Python interpreter** field with\r
the full path to the python that has ai-toolkit's dependencies (e.g.\r
\`C:\\miniconda3\\envs\\aitk\\python.exe\`), then hit **Test**. ComfyUI Desktop installs\r
are recognized automatically — no extra step.\r
\r
## Reddit scan says "rate limiting requests, retry in Ns" (429)\r
\r
**Why:** out of the box, Reddit scans authenticate with a **public client id\r
shared by many people** (the gallery-dl one). Reddit's quota — about 1000\r
requests per 10-minute window — is attached to that id, so other users can\r
exhaust it before your very first scan of the day. The "retry in Ns" number is\r
just the time left in the current 10-minute window.\r
\r
**Fix:** get your own free client ID (one minute, no app secret involved):\r
**Settings → Scraping & sources** has the field plus a built-in step-by-step\r
guide. The one trap: on reddit.com/prefs/apps, pick the app type\r
**installed app** — a *web app* or *script* id comes with a client secret and\r
Reddit then rejects the anonymous login this app uses (every scan fails\r
with 401). Takes effect immediately, no restart needed.\r
\r
## ComfyUI shows as unreachable\r
\r
Check **Settings → Local tools → ComfyUI API URL** (default\r
\`http://127.0.0.1:8188\`), confirm ComfyUI is running, and check that a firewall\r
or a different bind interface is not blocking the connection.\r
\r
The test has two different failure paths:\r
\r
- **Connection refused/unreachable** returns quickly and tells you to start\r
  ComfyUI or correct the URL.\r
- **ComfyUI answered but its node/model inventory timed out** means the process\r
  may simply be slow. Large custom-node and model collections make\r
  \`/object_info\` expensive. LDS waits **45 seconds** by default; raise\r
  \`comfyui.object_info_timeout_s\` under **Settings → Local tools → ComfyUI**\r
  and test again.\r
\r
Do not keep increasing the timeout for a refused connection: a genuinely stopped\r
ComfyUI is detected in seconds. If the URL test succeeds but generation still\r
fails, continue with the shared-filesystem case below.\r
\r
## ComfyUI runs in another container (or WSL, or another machine) and generation fails\r
\r
**Symptom:** setup goes green — the ComfyUI URL answers, the install directory is\r
accepted — and then every generation fails.\r
\r
**Why:** the app talks to ComfyUI through **two** channels, and only one of them is\r
the network.\r
\r
1. **The HTTP API** (\`Settings → Local tools → ComfyUI API URL\`). This is what the\r
   *Test* button and the Setup wizard check.\r
2. **The filesystem.** Every local engine (Klein, Krea 2 Edit, Klein watermark\r
   cleaning) hands ComfyUI its source image by **copying the file into ComfyUI's\r
   \`input/\` folder**, and the result comes back from its \`output/\` folder. There is\r
   no upload over the API on that path.\r
\r
A ComfyUI in a separate container, in WSL, or on another host does not share those\r
folders with the app by default. The URL answers, so everything looks configured —\r
and then the copy writes into a folder ComfyUI cannot see, or fails outright.\r
\r
**What it takes to work:**\r
\r
- \`input/\` and \`output/\` must be visible **to both sides at the same path**. Not\r
  "an equivalent folder": the app writes \`<input>/edit_source_….png\` and then tells\r
  ComfyUI to load \`edit_source_….png\` from *its own* input folder — the two must be\r
  the same directory.\r
- The app's process must be able to **write** into \`input/\` (a read-only bind mount\r
  is not enough), and ComfyUI must be able to read it.\r
- If ComfyUI was started with \`--input-directory\` / \`--output-directory\`, set the\r
  matching paths in **Settings → Local tools → Advanced: ComfyUI folder overrides**.\r
  Those fields take the path **as seen by the app**.\r
\r
**How you will know.** The app checks this itself, at the moment it stages a source\r
image and again in Settings and the Setup wizard: it asks the running ComfyUI, over\r
ComfyUI's own \`/view\`, whether it can see the file that was just written. When the\r
answer is no, the generation is refused with a message naming **the folder the app\r
used** and **what ComfyUI reported about its own** — quoted from the command line\r
ComfyUI echoes in \`/system_stats\`, so a second install or a \`--base-directory\` is\r
named rather than guessed. When ComfyUI also says where it reads (an absolute\r
\`--input-directory\` in that command line), the Setup wizard's ComfyUI card offers\r
that folder in one click. This replaced the failure that started it: ComfyUI\r
answering \`Invalid image file: krea_source_….png\` to its own console while the app\r
showed a tile that stopped instantly with no error at all (GitHub #64). If ComfyUI\r
cannot be asked — stopped, behind a proxy that refuses \`HEAD\`, too old — nothing is\r
refused and staging behaves exactly as before.\r
\r
With Docker, that means bind-mounting the same host folders into both containers at\r
identical paths, e.g.:\r
\r
\`\`\`yaml\r
# both services\r
volumes:\r
  - /srv/comfyui/input:/srv/comfyui/input\r
  - /srv/comfyui/output:/srv/comfyui/output\r
\`\`\`\r
\r
and then pointing the two override fields at \`/srv/comfyui/input\` and\r
\`/srv/comfyui/output\`. The shipped \`docker-compose.yml\` deliberately does **not**\r
do this: it runs the app in curation-only mode, where ComfyUI is out of scope.\r
\r
**How you'll know:** the failure now says so. Settings flags an override folder it\r
cannot write into, the Setup wizard warns while you configure (a warning, never a\r
blocker — mounting volumes afterwards is fine), and a generation that cannot reach\r
the folder answers with the folder path and the reason instead of a bare \`500\`.\r
Those messages are path-redacted, so they are safe to paste in a help thread.\r
\r
**Everything else keeps working without shared folders**: scraping, curation,\r
captioning through Ollama, training, and Hugging Face publishing. Only the\r
ComfyUI engines need the filesystem.\r
\r
*(Reported by nofaceman on Discord.)*\r
\r
## "Value not in list" on every model, on Linux (fixed)\r
\r
**Symptom:** on a Linux install, nothing generated at all. ComfyUI's console showed,\r
for every workflow:\r
\r
\`\`\`\r
Failed to validate prompt for output 28:\r
* UNETLoader 20:\r
  - Value not in list: unet_name: 'Krea\\krea2_turbo_fp8.safetensors'\r
    not in ['Krea/krea2_turbo_fp8.safetensors']\r
\`\`\`\r
\r
**Why:** ComfyUI builds its model lists with the separator of **its own** host —\r
backslash on Windows, forward slash on Linux — and validates a model widget by\r
exact string match. The app spelled those names with a Windows backslash whatever\r
the platform, and it keeps every model in a subfolder (\`Krea\`, \`klein\`,\r
\`z image\`, and every LoRA you train), so on Linux the answer was "nothing works"\r
rather than "one model is missing".\r
\r
**Fixed:** the app now reads the spelling from the ComfyUI it is actually talking\r
to and matches it. This also covers the reverse case — the app on Windows driving\r
a ComfyUI in WSL, Docker or on another machine, which needs forward slashes — so\r
there is nothing to configure either way.\r
\r
*(Found and diagnosed by 1Tomber, [GitHub #21](https://github.com/perfectgf/lora-dataset-studio/issues/21).)*\r
\r
## Klein engine stays greyed out\r
\r
Klein needs a reachable ComfyUI **and** the Klein model files (~16 GB VRAM\r
class). **Setup → ComfyUI** offers the download; the license-gated fp8 model\r
needs a Hugging Face token (Settings → Local tools).\r
\r
Whatever the cause, the greyed-out engine now **names it**, and the Setup wizard\r
shows the same sentence — the two screens read one verdict, so they cannot send\r
you to fix different things. The causes, and what each one means:\r
\r
| What it says | What it means | What to do |\r
| --- | --- | --- |\r
| \`Configure ComfyUI in Settings\` | ComfyUI is not answering | Start it, or fix the API URL |\r
| \`Klein <file(s)> missing\` | that weight is not on disk | Download it in Setup ▸ Install components |\r
| \`… is on disk but cannot be loaded\` | the file is there but unreadable | See below |\r
| \`Your ComfyUI doesn't have <value>\` | the graph pins a widget value your ComfyUI doesn't offer | Install the named node pack, restart ComfyUI |\r
| \`disabled in Settings (engines)\` | you turned the engine off | Re-enable it in Settings ▸ Engines |\r
\r
### Where the Klein model may live — you do **not** need \`models/unet/klein/\`\r
\r
\`models/unet/klein/\` is only where the Setup button *downloads* to. It has never\r
been a requirement, and nothing needs to be copied, moved or symlinked to satisfy\r
it. The app resolves the Klein UNET exactly where a running ComfyUI would, in\r
this order:\r
\r
| Layout | Example |\r
| --- | --- |\r
| a \`klein\`-named sub-folder of \`models/unet\` | \`models/unet/klein/flux-2-klein-9b-kv-fp8.safetensors\` |\r
| **any** sub-folder whose name contains \`klein\`, any capitalisation or spacing | \`models/unet/Flux2 Klein/…safetensors\` |\r
| the **top level** of \`models/unet\` | \`models/unet/flux-2-klein-9b-kv-fp8.safetensors\` |\r
| the same three, under \`models/diffusion_models\` | \`models/diffusion_models/flux2-klein-9b/…safetensors\` |\r
| any root declared in your \`extra_model_paths.yaml\` | a Stability Matrix / portable / A1111-shared tree |\r
| a relocated models folder | **Settings → Local tools → ComfyUI models folder** |\r
\r
**The one limit:** the model has to be *nameable* as Klein — either the **file\r
name** or its **sub-folder name** must contain \`klein\`. A file called\r
\`model.safetensors\` sitting loose in \`diffusion_models/\` is invisible; put it in\r
a \`klein/\` folder (any file name then works) or rename the file. That rule is\r
what stops another family's checkpoint being wired into the Klein graph.\r
\r
Every row of that table is covered by\r
\`backend/tests/test_klein_model_locations_documented.py\`, so it cannot quietly\r
stop being true.\r
\r
*(Reported by CyberTod on Reddit, who duplicated the weights and built a symlink\r
to reclaim the disk space — neither was necessary.)*\r
\r
### "On disk but cannot be loaded"\r
\r
A \`.safetensors\` file declares the length of its JSON header in its first eight\r
bytes. A download that was **cut short or corrupted** leaves a file that is\r
shorter than it claims — plausible size, right name, right folder, and no loader\r
can open it. A licence or login page saved as \`.safetensors\` fails the same way.\r
\r
Setup used to tick these as **✓ Installed** (the file existed) while the\r
generation page refused the engine. It now shows **⚠ On disk, unreadable** with\r
the file name and the reason, and **↻ Download again** replaces the bad file\r
instead of reporting "already present" and doing nothing.\r
\r
If you placed the file by hand somewhere other than the folder Setup downloads\r
into, delete it yourself first — the app only replaces files at its own path.\r
\r
*(Reported by zigzag4794 on Discord.)*\r
\r
### "Not checked" is not "ready"\r
\r
With ComfyUI stopped, the checks that need it cannot run, and the app reports no\r
gap rather than inventing one. Your files being on disk is therefore **not** a\r
clean bill of health, and Setup says so instead of showing a tick it did not\r
earn. Start ComfyUI and re-check.\r
\r
## "Upscale & improve" makes my anime look realistic\r
\r
**Why:** the improve pass sends Klein a fixed instruction, and the shipped one is\r
a *photographic* recipe — \`add detailed texture, add sharp details, add candid\r
shot, add soft focus effect\`. It is applied to every dataset, drawn ones\r
included, so on anime or illustration it does exactly what it says: it adds skin\r
texture and photo micro-detail your line art never had.\r
\r
**Fix — two levers, both in Settings → Image engines → *Identity, Klein & Krea 2\r
prompts (advanced)*:**\r
\r
1. **Rewrite the instruction.** The *Klein upscale & improve prompt* box holds\r
   the text in use; edit it to something that suits drawn art (e.g. "keep the\r
   drawn anime rendering, clean line art, flat cel shading, sharpen the lines").\r
   Clearing the box restores the shipped default — nothing is frozen.\r
2. **Or send no instruction at all.** The checkbox above the box — *Apply an\r
   improvement prompt on "Klein upscale & improve"* — turns it off, and the pass\r
   becomes a pure upscale.\r
\r
Separately, **Settings → Image engines → *Upscale & improve — strength*** decides\r
how far the pass may move the image at all (output megapixels, sampler steps, the\r
enhancement LoRA, the consistency LoRA). Lower the *Enhancement LoRA* and raise\r
the *Consistency LoRA* if you want the pass to change less.\r
\r
Both are now quoted and linked **from the ✨ Upscale & improve button itself** —\r
in the lightbox and in the grid's bulk toolbar — so the instruction currently in\r
force is readable where the action happens, and anime datasets get an explicit\r
warning there.\r
\r
*(Reported by Qeeyana on Reddit.)*\r
## The browser opens "cannot connect" at startup\r
\r
Fixed as of 2026-07-22 — update & restart if you still see it. The launcher\r
used to open a hardcoded \`http://127.0.0.1:<port>/\` *before* the server had\r
started, so any setup serving on a LAN or Tailscale \`server.host\` was greeted\r
with a dead tab every launch. It now opens the address the server is actually\r
bound to, only once the server accepts connections (with the access token\r
attached when the token gate is on). Don't want a tab at all — for example when\r
you only ever open the app from another device? Set \`LDS_NO_BROWSER=1\` before\r
launching.\r
\r
## A Stop button doesn't seem to stop anything\r
\r
As of 2026-07-22 every Stop in the app reports honestly instead of assuming:\r
\r
- **Stop training** kills the training process and then *verifies it died*\r
  before saying so. If the process can't be confirmed dead within a few\r
  seconds you get an explicit error — retry the Stop, or check Task Manager\r
  for a wedged \`python\` process.\r
- **Stop generation** removes the queued renders immediately and asks ComfyUI\r
  to abort the one in flight. If ComfyUI is unreachable and can't confirm the\r
  abort, the app says the render *may still be running* rather than claiming\r
  success — the running render finishes on the GPU but its output is discarded.\r
- **Stop captioning** finishes the image currently being written, keeps\r
  everything captioned so far, and frees the GPU. The button reads\r
  "Stopping…" until that image completes (bounded by the per-image timeout).\r
\r
If a Stop button is greyed out, another batch on the same dataset (for\r
example a caption pass) is holding the activity slot; it re-enables the\r
moment that batch ends.\r
\r
## Stopping LoRA Dataset Studio\r
\r
Closing the browser tab **never** stops the server — there is no\r
\`beforeunload\`, no keepalive, and no shutdown endpoint. The tab is just a\r
client. To stop the server on Windows:\r
\r
1. **Ctrl+C** in the \`start.bat\` console — works on a fresh launch, and now\r
   also **after Settings ▸ Restart / Update & restart**. Those used to spawn\r
   the relaunched server in a *new* console window, leaving the original\r
   \`start.bat\` window holding a dead process; Ctrl+C there did nothing useful.\r
   \`start.bat\` is now a supervisor: a restart exits with code 3 and the same\r
   window relaunches the server, so Ctrl+C keeps working.\r
2. **\`stop.bat\`** (shipped next to \`start.bat\`) — the reliable stop when you\r
   are not at that console, or when an older restart left the server orphaned\r
   in another window. It:\r
   - resolves the port (\`LDS_PORT\` → \`config.json\` → \`5050\`);\r
   - asks the app to cancel its work (\`POST /api/system/stop-everything\`);\r
   - kills the listener's **process tree** (so infer children go with it);\r
   - sweeps leftovers whose executable path lives under this install\r
     (\`.venv\\\`, \`.python\\\`, \`data\\envs\\*\`) plus a recorded \`training_pid\` —\r
     never a blanket \`taskkill /IM python.exe\`, which would take out ComfyUI\r
     and anything else named \`python.exe\` on the machine;\r
   - **stops Ollama** (\`ollama.exe\` / \`ollama app.exe\`). State plainly: this\r
     stops **any** Ollama on the machine, including one you started by hand\r
     or share with another tool — the script cannot tell whose it is;\r
   - **leaves ComfyUI alone** (LDS never launches it) and reports if port\r
     8188 still answers;\r
   - confirms \`/api/health\` has gone silent, or says what is still alive.\r
\r
Already down → \`stop.bat\` says so and exits cleanly.\r
\r
The start.bat console also narrates the same events as the Activity panel\r
(see below) — pass start/finish, captions, queue, training — so you can watch\r
a long overnight run without opening the browser. Level is\r
\`console.level\` in \`config.json\` (default \`events\`; \`off\` / \`heartbeat\` /\r
\`all\` available); \`LDS_CONSOLE\` overrides it for a one-off launch.\r
\r
## Is it stuck? — the Activity panel\r
\r
Every long job in LDS has a progress bar, and every bar lives on the page that\r
owns it: a bank pass on that bank, a caption batch on that dataset, training on\r
Runs. So "is anything actually moving?" used to cost a tour of the app — and a\r
percentage cannot answer it anyway, because **a bar frozen at 34% and a bar that\r
will move again in two seconds are drawn identically**.\r
\r
**📋 in the top bar** opens one panel that answers it, from any page:\r
\r
- **Running now** — every live job across banks and datasets, with the **age of\r
  its last update**. That age is the whole point: a pass that reported two\r
  seconds ago is fine at 3%, and a pass that reported twelve minutes ago is\r
  stuck whatever its bar says. Past a minute of silence the row is flagged; past\r
  five it says *probably stuck*. Those thresholds are deliberately generous — a\r
  cold model load or a big folder walk can legitimately say nothing for a while,\r
  and a warning that cries wolf is one you stop reading.\r
- **The log** — a timestamped feed of passes starting, finishing, stopping and\r
  failing, plus the GPU being taken and released, caption batches, the bank\r
  queue and training. It appends as it arrives and never redraws, so scrolling\r
  up to read something does not yank you back down. The same events also print\r
  in the \`start.bat\` terminal (see [Stopping LoRA Dataset Studio](#stopping-lora-dataset-studio)).\r
\r
The GPU lines are worth knowing about: taking the exclusive window unloads\r
ComfyUI and blocks training, and until now it did all of that with no visible\r
trace anywhere. If the panel says the GPU was taken and never released, that is\r
the *"GPU busy" when nothing is running* case below.\r
\r
Two things this panel is **not**. It is not the server log — Settings ▸\r
Maintenance still tails that, and it is a developer artefact (Flask lines,\r
tracebacks, request noise); this one is the app's own account of its work, in\r
the words the UI uses. And it is **not kept across a restart**, because it\r
describes work that does not survive one either; a log full of jobs that are no\r
longer running would be a lie.\r
\r
## "GPU busy" when nothing is running\r
\r
Every GPU pass, every queued bank and every training start is gated on two\r
flags the app keeps: *training in progress* and *a vision/GPU pass in\r
progress*. They are set when work takes the card and cleared when it lets go.\r
If a process dies without letting go — ComfyUI gone, a borrowed Python that\r
never returned, a helper wedged on CUDA start-up — the flag stays set and\r
**everything afterwards refuses with a "GPU busy" that is not true**. The flag\r
has a timer, but it does not save you: an alive-but-stuck process keeps\r
refreshing it, so this used to mean restarting the app.\r
\r
Two ways out, and the first is almost always the right one:\r
\r
- **Clear the leftover flag.** Where the refusal appears — the bank workspace,\r
  the banks page, and Settings ▸ Maintenance — a warning shows up *only when\r
  the server has checked and found nothing behind the flag*, with a **Clear\r
  it — nothing is using the GPU** button. It stops nothing; it just corrects\r
  the app's belief. If something really is running you will not see it, and\r
  pressing it anyway is refused rather than allowed to break your own job.\r
- **⏹ Stop everything** (Settings ▸ Maintenance) when work *is* wedged. It\r
  cancels queued and running bank passes, dataset batches and in-flight\r
  generations, asks ComfyUI to unload, stops training, then clears the flags.\r
  It confirms first — it is destructive to in-flight work by design. Passes\r
  that cache their progress (✨ Score, 👥 Group by person) resume where they\r
  stopped; anything mid-flight is lost.\r
\r
**It reports per target, and it does not round up.** An unreachable ComfyUI is\r
reported as *not confirmed*, not as stopped. A training process that cannot be\r
confirmed dead is a **failure**, and its flag is deliberately *not* cleared —\r
saying the GPU is free while a trainer still holds it is how two runs end up on\r
one card. So a result listing one failure alongside four successes is the report\r
working, not the button half-failing.\r
\r
**The most common cause of this on a working install** is pointing ✨ Score at a\r
CUDA interpreter (see *Using the app → Make Score use a GPU Python you already\r
have*). That makes Score take the GPU exclusively, which is correct — but a\r
borrowed interpreter that stalls on CUDA start-up used to hold the flag\r
indefinitely. A helper that produces no output for 15 minutes is now stopped\r
automatically and the GPU released.\r
\r
## Port 5000 conflict on macOS\r
\r
macOS reserves port 5000 for AirPlay Receiver. Change the port in\r
**Settings → Server & access** (e.g. 5050) and restart.\r
\r
## Garbled characters in the Windows console\r
\r
Cosmetic only — some UTF-8 text renders wrong on the legacy console codepage.\r
The app itself is unaffected.\r
\r
## \`npm install\` fails with \`Cannot find module @rollup/rollup-<platform>-...\`\r
\r
Only relevant if you rebuild the frontend yourself (the repo ships \`dist/\`\r
prebuilt). It's a known npm bug: delete \`frontend/node_modules\` +\r
\`frontend/package-lock.json\` and run \`npm install\` again on this machine.\r
`;export{e as default};
