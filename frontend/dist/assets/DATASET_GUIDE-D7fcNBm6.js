const e=`# Building a good LoRA dataset\r
\r
This guide condenses what actually moves the needle when training a character LoRA\r
with this app (ai-toolkit under the hood). Every number here matches what the app\r
enforces or defaults to — when in doubt, the app's warnings are this guide applied.\r
\r
> **The one principle behind everything:** a LoRA learns whatever is **constant\r
> across your images and NOT described in the captions**. Keep the subject constant,\r
> vary everything else, and never describe the subject — that's the trigger word's job.\r
\r
---\r
\r
## 1. Pick your model family first\r
\r
The family changes the caption style, the image count, and the settings — so decide\r
before you caption anything.\r
\r
| | Z-Image | SDXL | Krea 2 | FLUX.1 | FLUX.2 Klein |\r
|---|---|---|---|---|---|\r
| **Caption style** | Prose sentences | Booru tags | Prose sentences | Prose sentences | Prose sentences |\r
| **Images (min → good)** | 12 → 20+ | 20 → 30+ | 15 → 20+ | 15 → 20+ | 15 → 20+ |\r
| **Training base** | Z-Image-Turbo (or a converted custom merge) | Your ComfyUI checkpoint (e.g. bigLove) | Krea-2-Raw (default), Turbo, or a Krea 2 checkpoint on your disk | FLUX.1-dev (gated HF) | FLUX.2-klein-base 4B (default) or 9B (gated HF) |\r
| **Preview quality** | Fast, distilled | Depends on checkpoint | Raw: slow but faithful | High, ~20 steps | Non-distilled, real CFG (~25 steps) |\r
| **Best for** | Fast iteration, prose-driven prompting | Booru-native checkpoints, NSFW ecosystems | Highest realism ceiling | The largest LoRA ecosystem, strong prompt fidelity | Modern FLUX.2 stack; 4B trains on mid-range GPUs |\r
\r
**Krea note:** the default trains on **Krea-2-Raw** — the official recommendation is\r
*"train on Raw, validate on Turbo"*. Raw runs are long (hours); that's normal, not stuck.\r
The **Base** selector also lists every Krea 2 checkpoint sitting in your ComfyUI\r
\`unet\` / \`diffusion_models\` folders — a model one of your own full-model runs\r
delivered, or a community Krea 2 build — so you can keep training on top of one\r
instead of starting from the official weights every time. Entries carry a tag when\r
the file is quantized: \`· fp8 cast\` trains but starts from degraded weights,\r
\`· packed export\` cannot be loaded at all (see *Which quantized checkpoints can be\r
trained on* in section 10). Local runs use the file directly; a cloud run first\r
pushes it to your private Hugging Face repo, which the panel offers to do.\r
\r
**FLUX.1 note:** trains on **FLUX.1-dev**, a *gated* Hugging Face model — accept its\r
license and set a HF token before the first run (the initial download is ~24 GB). It's\r
a 12B model like Krea 2, so **~24 GB VRAM** is the comfort zone (drop the resolution to\r
**768** to fit smaller cards). **Local training only for now**; in-app testing (Test\r
Studio) is coming — until then, test your Flux LoRA in your own ComfyUI.\r
\r
**FLUX.2 Klein note:** two model sizes, picked next to the base selector — **4B**\r
(default) trains on a **16–24 GB** local GPU; **9B** needs **32–48 GB VRAM**.\r
Both bases are *gated* on Hugging Face: accept the license of\r
\`FLUX.2-klein-base-4B\` / \`-9B\` and set a HF token before the first run. In-app\r
testing (Test Studio) is coming — until then, test your Klein LoRA in your own\r
ComfyUI.\r
\r
**Anima note (the one family that takes BOTH caption styles):** Anima is an anime\r
model with **hybrid prompting** — its model card documents *booru tags* and *natural\r
language* as equally supported, which its LLM text encoder is what makes possible. So\r
this is the family where the "match the style" rule below does **not** apply: caption\r
in prose, caption in booru tags, or keep an existing dataset as it is — the app will\r
not flag either as a mismatch, and you never have to force the launch. Prose is only\r
the preselected default. It trains on the open \`Anima-Base-v1.0-Diffusers\` (no gated\r
download) and is **local-only** for now.\r
\r
---\r
\r
## 2. How many images, and which ones\r
\r
- **Target ~25 images** for a balanced character LoRA. More isn't automatically\r
  better — 25 varied images beat 60 near-duplicates every time.\r
- **Balance the framing.** The app tracks four buckets: **face / bust / body / back**.\r
  A dataset that is 100% face close-ups produces a LoRA that falls apart on\r
  full-body prompts — it has never seen the body.\r
- **Imported images may have no shot type yet.** Only images imported with the\r
  head-crop option on are tagged automatically; a plain drag-and-drop import (the\r
  default on body-fidelity datasets) leaves the shot type unknown, and unknown\r
  images count for nothing in the Composition bar — a whole import can leave it\r
  at 0. **📐 Classify framing (N)**, right under that bar in 📸 Add images, reads\r
  those images with the local vision model (Ollama) and sorts each into face /\r
  bust / body / back. It needs Ollama running with a vision model pulled\r
  (Settings ▸ Local tools); it uses the GPU and waits rather than competing with\r
  a training run. Nothing is deleted and images it cannot read stay unknown, so\r
  running it again only retries those.\r
- **A crop forgets the old shot type.** Cropping a body shot into a face (or a\r
  bust into a close-up) clears the stored framing, the same way a Bank crop\r
  does. Composition drops that image from its bucket until you run **📐 Classify\r
  framing** again — and the button only counts the ones that actually changed,\r
  not the whole set. Same vision model, same GPU wait.\r
- **Vary everything except the person:** location, lighting, outfit, pose,\r
  expression, camera angle. Whatever repeats across images gets baked into the\r
  LoRA — a repeated background wall becomes part of "the person".\r
- **Reject near-duplicates.** Two frames of the same shot teach nothing and\r
  overweight that look. The pre-flight check flags them; reject one of each pair.\r
- **Quality floor:** no motion blur, no heavy compression, the face readable.\r
  One bad image does more harm than one good image does good.\r
\r
**Body fidelity mode** (Datasets → ⋯ More): use it when the body shape and body\r
marks (tattoos, scars) should bind to the trigger too. It shifts the composition\r
targets toward bust/body shots, imports full-frame by default, and extends the\r
caption rules below to body marks.\r
\r
---\r
\r
## 3. Captions — the make-or-break step\r
\r
The model reads your captions during training and learns to attribute **whatever\r
the caption does NOT explain** to the trigger word.\r
\r
**The golden rule: never describe what the person IS — describe everything else.**\r
\r
- ❌ \`myTrigger, a woman with long blonde hair and blue eyes, smiling\` —\r
  the LoRA learns almost nothing: the caption already "explains" the appearance.\r
- ✅ \`myTrigger, sitting at a café table, warm afternoon light, denim jacket,\r
  looking at the camera\` — hair, face and skin are unexplained → they bind\r
  to \`myTrigger\`.\r
\r
Concretely:\r
\r
1. **Start every caption with the trigger word.** The app injects it on export.\r
2. **Never mention face, eyes or skin** — and, by default, hair. Those bind\r
   to the trigger. ⚙️ *Options* on the Captions panel has **Appearance in\r
   captions**: flip Hair, Makeup, Facial hair or Glasses to **Describe** when\r
   you want that look prompt-controllable (different hairstyles, no mascara in\r
   every gen). **Omit** keeps it bound to the trigger. Face, eye colour, skin,\r
   age, gender and ethnicity stay omitted. Extra instructions cannot reintroduce\r
   an omitted family — flip the row instead. The *identity-leak* check watches\r
   whatever is currently omitted.\r
3. **Describe scene, outfit, pose, lighting, framing** — and any appearance\r
   family you set to Describe. Those stay promptable *independently* of the\r
   identity.\r
4. **Vary the captions.** Identical captions across images teach nothing;\r
   captions under ~8 words are too weak to isolate the identity.\r
5. **Match the style to the family.** Prose for Z-Image and Krea; booru tags for\r
   SDXL booru-native checkpoints. The app blocks a mismatch for a reason —\r
   a prose-captioned SDXL LoRA produces disjointed images. **Anima is the\r
   exception:** it reads both forms natively, so neither is ever blocked there\r
   (see the Anima note above).\r
\r
   ⚠️ **Concept datasets cannot be captioned in booru tags at all** (the concept\r
   captioner only writes prose). A Concept dataset on a booru-native SDXL\r
   checkpoint will therefore always be stopped by the caption-style check: train\r
   the concept on a prose family instead, or force the launch knowing the cost.\r
\r
**Caption length.** ⚙️ *Options* on the Captions panel carries a **Caption length**\r
preset — *Standard* (the prompt untouched), *Concise* (aims for one short sentence,\r
~20–30 words) or *Detailed* (several sentences). It is a **target the vision model\r
follows loosely**, not a hard cap: expect a spread around it, not a word count. Pick\r
*Concise* when detailed captions keep describing the identity you want bound to the\r
trigger, *Detailed* when you want scene, outfit and lighting to stay independently\r
promptable.\r
\r
What that looked like when measured — 18 real portrait photos, the shipped default\r
vision model (\`huihui_ai/qwen3-vl-abliterated:8b-instruct\`), the plain descriptive\r
prompt, one pass per preset:\r
\r
| Preset | Median | Range |\r
|---|---|---|\r
| Concise | 24.5 words | 18–30 |\r
| Standard | 87.5 words | 65–112 |\r
| Detailed | 126 words | 106–152 |\r
\r
Your numbers will differ — another vision model, JoyCaption, or a different kind of\r
image all move them. Treat the presets as *shorter / as-is / longer*, not as a\r
contract on a word count.\r
\r
Two more things worth knowing:\r
\r
- **Order.** The prompt is built as: the base prompt with its omission rules, then the\r
  vocabulary register, then the length preset, then your free **Extra instructions**\r
  last — so a hand-written steer that contradicts a preset is what the model reads\r
  most recently and wins. The identity/concept leak cleaners run after all of it\r
  regardless, so Extra instructions cannot reintroduce an omitted identity term.\r
  Flip **Appearance in captions** (Hair / Makeup / Facial hair / Glasses) when\r
  you *want* that look in the caption so it stays prompt-controllable.\r
- **Concise is not the "short" of long + short captions.** Dual captions derive a\r
  short variant *from* the stored long caption into its own field; the length preset\r
  changes the long caption itself. They are separate axes and compose freely.\r
- Concise stays **prose** on purpose (never a comma-separated tag list), so a Concise\r
  dataset still passes the caption-style check for prose-native families instead of\r
  being mistaken for booru tags at launch.\r
\r
**Concept datasets** (training a *thing/style/act*, not a person) invert the rule:\r
describe everything **except the concept** — the concept is what must bind to the\r
trigger. Keep *person* masking **off** for concepts — a person mask would erase the\r
very thing you're training. Masking **faces** is the opposite polarity and is\r
available on purpose: see §8.\r
\r
**Trying before you commit.** 🧪 **Caption Lab** in the **Captions** section runs up\r
to four caption configurations — engine, vision model, vocabulary register and length —\r
on one image you pick, and lays the results side by side with the caption already\r
stored. Nothing is written until you keep one, so an engine or a register can be\r
settled on a single image instead of on a pass over the whole set. The same bench is\r
a tab of the per-image caption editor in **Images**, on whichever tile you opened — and\r
of an image bank's 🏷️ Caption window, so a captioner can be settled on the bank before\r
anything is promoted.\r
\r
**Stopping a run.** Started a big caption pass and realized it's captioning badly,\r
or an option was mis-set? A **⏹ Stop** button sits in the captioning progress\r
banner. It finishes the image being written (an inference is never cut off\r
mid-way), then stops cleanly: every caption written so far is kept, the rest is\r
left untouched, and you get a *"stopped — X captioned"* summary. Nothing is killed\r
and nothing already done is lost — just fix the option and run again on what's left.\r
\r
---\r
\r
## 4. Settings cheat-sheet\r
\r
The defaults below are the app's defaults (post-research). Change them from\r
⚙️ Advanced options on the training panel — each knob has its own why/how there.\r
That panel also has a **Presets** row: apply a shipped ★ recipe (*Krea\r
character*, *Concept*, *Style*), or save your tuned settings as a named preset to\r
reuse across datasets and share (import/export as JSON).\r
\r
| Setting | Z-Image | SDXL | Krea 2 | FLUX.1 | FLUX.2 Klein | Why |\r
|---|---|---|---|---|---|---|\r
| **LoRA rank / alpha** | 16 / 16 | 32 / 16 | 32 / 32 | 16 / 16 | 16 / 16 | Capacity to memorize the identity. SDXL's alpha = rank ÷ 2 is that family's half-strength convention. |\r
| **Resolution** | 768 + 1024 | 768 + 1024 | 768 + 1024 | 768 + 1024 | 768 + 1024 | Multi-scale: holds up from close-up to full-body. |\r
| **Save checkpoint** | every 250 | every 250 | every 250 | every 250 | every 250 | More snapshots → better odds one is at the sweet spot. |\r
| **Steps** | auto | auto | auto | auto | auto | ~120 × images, clamped 1500–3500. A fixed 3000 overcooks small sets. |\r
| **Masked training** | ON | ON | ON | ON | ON | Background weighs only 10% of the loss → identity binds to the person, not the room. OFF for concepts — they have their own face masking instead (§8). |\r
\r
Rules of thumb:\r
\r
- **Raise rank (48–64)** only for a hard identity (distinctive features the\r
  default misses) *and* a bigger dataset — high rank on 15 images just memorizes them.\r
- **Don't chase steps.** More steps past the sweet spot = overfitting (plastic\r
  skin, same face angle everywhere, prompt deafness). Train with checkpoints\r
  every 250 and pick the best one instead.\r
- **Turbo variant (Krea)** is the VRAM/time-friendly fallback — fine for drafts,\r
  Raw for the final run.\r
- **GPU under 24 GB?** Resolution is the #1 memory lever: set it to **768 only**\r
  (Krea 2 especially — 1024 saturates a 24 GB card). You trade some fine detail\r
  for a run that actually fits and trains far faster.\r
\r
### Steps — how many, and where "good results" start\r
\r
The app sets the step count **automatically** for a character LoRA:\r
**≈ 120 × kept images, clamped to 1500–3500.** The *target is the same* for\r
Z-Image, SDXL, Krea 2, FLUX.1 and FLUX.2 Klein — the model family changes how *fast*\r
that target converges, not the number. (Concept/style datasets scale differently:\r
**475 · √n, clamped 2000–12000**, because they train on hundreds of images.)\r
\r
So the character step count just follows your dataset size:\r
\r
| Kept images | Auto steps |\r
|---|---|\r
| 12–15 | 1500 – 1800 |\r
| 20 | 2400 |\r
| 25 | 3000 |\r
| 30 and up | 3500 (capped) |\r
\r
**"Good results" is a checkpoint you pick, not the finish line.** A snapshot is\r
saved every 250 steps, and the best one is almost never the last — later\r
checkpoints know the face better but obey prompts worse. *Where* the first\r
usable checkpoint appears depends on how fast the model converges:\r
\r
| Model | Converges | Where the sweet spot tends to land |\r
|---|---|---|\r
| **Z-Image** | Fast (distilled) | Around the **middle** of the run; watch for overfit in the last ~20% (waxy skin, frozen expression) |\r
| **Krea 2 – Turbo** | Fast (distilled) | Like Z-Image — check early-to-middle checkpoints first |\r
| **SDXL** | Medium (base-dependent) | Middle of the run; booru-native checkpoints lock an identity quickly |\r
| **Krea 2 – Raw** | Slow (12B, non-distilled) | The **last third** — the run is long by design, let it finish the full count rather than stopping early |\r
| **FLUX.1-dev** | Medium (12B, guidance-distilled) | Middle of the run; a strong prompt-follower, so watch for waxy skin / frozen expression if you overshoot into the last ~20% |\r
| **FLUX.2 Klein (4B/9B)** | Medium (non-distilled base) | Middle of the run; previews run with real CFG so overfit shows honestly — pick the earliest checkpoint that holds the identity |\r
\r
**Takeaway:** don't hand-tune the step number. Train the auto count, then use the\r
**Test Studio** to pick the *earliest* checkpoint that nails the identity — that's\r
the one with the most prompt flexibility left.\r
\r
---\r
\r
## 5. Pre-flight checklist\r
\r
The app runs these checks when you hit Train — here's the list to self-check earlier:\r
\r
- [ ] At least the family minimum kept (12 Z-Image / 20 SDXL / 15 Krea / 15 FLUX.1 / 15 FLUX.2 Klein) — 20–30 is the comfort zone\r
- [ ] Framing balanced — not 100% face shots (some bust/body/back)\r
- [ ] Every kept image captioned *(strongly recommended — a blank caption won't block the launch, it just asks you to confirm "train anyway")*\r
- [ ] **Zero identity leaks** (the leak badge shows 0 for whatever is currently omitted — face/eyes/skin, and by default hair)\r
- [ ] Captions varied, ≥ 8 words, style matches the family (prose vs booru — Anima takes either)\r
- [ ] Near-duplicate pairs resolved (keep one of each)\r
- [ ] Body fidelity: if ON, actual full-body shots exist\r
\r
**Continue anyway.** When the readiness panel turns red over a *quality* blocker —\r
most often too few images for the family — a **Continue anyway** checkbox appears\r
under the list. Tick it and the Train button unlocks; the launch is recorded as\r
"acknowledged not-ready" in its saved config. It's meant for deliberate\r
experiments (you'll usually get an overfit LoRA), not for skipping the work. The\r
checkbox only ever covers quality guard-rails: genuine impossibilities that would\r
just crash the trainer — **zero kept images**, or a **slider with no prompt pair**\r
— are never offered the option, and the box un-ticks itself the moment the\r
blockers change.\r
\r
**Train on.** With an ai-toolkit web address set (Settings → Training), a **Train\r
on** picker sits beside the Train button. **This machine** is the default and\r
behaves exactly as it always has. Pick another machine and the dataset is staged\r
over to it; its log, preview samples and checkpoints all arrive back here while\r
it runs — into the same folders a local run writes — so the panel, the checkpoint\r
browser and the Runs page read normally and the run gets its own **⏹ Stop**. Base\r
models are not copied — the machine that trains downloads its own. The readiness\r
checks above run either way. A remote run **always starts fresh** (previous\r
checkpoints are not sent over), so there is no Resume/Fresh question for one, and\r
only **one run per dataset** can be out at a time. The picker never offers this machine's own\r
GPUs: a run in that lane does not hold the local GPU-busy flag, so image\r
generation would start on top of it. Full details, including why an offline\r
machine is greyed out rather than hidden:\r
[Settings → Training](guide/settings-reference.md#train-on-another-machine).\r
\r
**When the link to that machine breaks.** Losing contact is not the same as\r
losing the run, and the panel says which happened. If this app cannot reach the\r
other machine for about a minute, the run is **not** written off — the job is\r
most likely still training over there. The card says contact was lost, the run\r
stays open, and it is picked back up when this app restarts. Press **⏹ Stop** if\r
you would rather give up on it; that ends it here and says plainly that the job\r
may still be running on the other machine. A run whose training **finished** but\r
whose files could not be copied back is reported as finished, with the reason —\r
the checkpoints exist, they are just still over there, and training again brings\r
them home. A run that reached the other machine but was never actually started\r
(this app closing at exactly the wrong moment) says that too, rather than\r
appearing to have stopped for no reason; training again picks the same job up.\r
\r
**Stopping a training run.** The red **⏹ Stop training** button next to Train\r
ends the run in progress — it is not a housekeeping button. It kills the training\r
process, clears the pending local training queue, and hands the GPU back to\r
ComfyUI. What you keep: **every checkpoint already saved**, which stays testable\r
in the Studio and can be continued later with ▶ Continue. Because a run can be\r
hours long, the button asks for confirmation first. The same run can also be\r
stopped from the **Runs** hub ("Stop run"), which does exactly the same thing.\r
\r
---\r
\r
## 6. After training: pick the right checkpoint\r
\r
Training produces a checkpoint every 250 steps — **the last one is often NOT the\r
best one**. Later checkpoints know the identity better but obey prompts worse.\r
\r
1. Open the **Test Studio** from the dataset (the LoRA comes pre-selected).\r
2. Generate the same prompt grid across several checkpoints and strengths.\r
3. Pick the **earliest checkpoint that nails the identity** — it keeps the most\r
   prompt flexibility. Signs you've gone too far: waxy skin, identical\r
   expression/angle regardless of prompt, outfits from the dataset bleeding in.\r
4. Save the winning settings (★) — they're reused as the dataset's defaults.\r
\r
### Test several prompts in one launch\r
\r
Under the prompt box is the history of the prompts you have saved, with a\r
thumbnail of the image you liked best for each. Clicking a card loads it into the\r
field, as before. **Ticking its box adds it to a batch**: the panel counts what is\r
selected, the button says how many prompts it is about to run, and one launch\r
renders them all — same checkpoints, same settings, **same seed**, which is what\r
makes two prompts comparable rather than two unrelated pictures.\r
\r
It is one run, not several: the images queue up and the GPU works through them by\r
itself. Tick nothing and the screen behaves exactly as it always has, running the\r
prompt in the field.\r
\r
**There is no limit on how many you tick.** What there is instead is the price,\r
shown before you click: the panel counts every generation the run will queue and\r
estimates how long it takes **at the pace your machine has actually been running\r
at** — measured from your own recent test generations, not assumed. Past about an\r
hour it asks once whether you meant it. The queue is serial, so you can stop it at\r
any point and everything already generated is kept.\r
\r
The same tick boxes are in **🎨 Generate from the board** on the ◉ LoRA Canvas,\r
because both screens show the same prompt history. The **🌐 Civitai** browser\r
feeds the same batch (a ☐ Batch box on every prompt-bearing card), so a run can\r
mix your own saved prompts with prompts borrowed from Civitai's top images.\r
\r
### Compare LoRAs — or blend them\r
\r
Check two or more LoRAs and Studio asks what you want to do with them:\r
\r
- **⚖ Compare** (the default) tests each LoRA **on its own**, one column per LoRA,\r
  swept across the strengths you picked. This is what you want to answer "which of\r
  these is better".\r
- **🧬 Blend** loads them **together in the same image**, each at its own weight,\r
  and — while the **Trigger word** box next to the prompt is ticked — injects\r
  **every trigger word** into the prompt for you. This is what you want to answer\r
  "do these two work together" — a character plus a style, or a character plus a\r
  concept.\r
\r
> This mode was called **🧬 Combine** until August 2026. Only the name changed;\r
> the ◉ LoRA Canvas offers the very same thing from the board, and calling it two\r
> different things was a needless thing to learn twice.\r
\r
**What blending two characters actually gives you** is a *hybrid* — one person who\r
is neither of the two, not both of them side by side in one shot. That is a real\r
and deliberate use, but if you expected "my two characters together", this is not\r
it. The reliable pairings are **character + style** and **character + concept**.\r
\r
In Blend mode the strength sweep disappears: each LoRA already carries its own\r
weight, so the run is one configuration instead of a grid. Start both around\r
0.7-0.9 — two LoRAs at 1.0 usually fight each other, and the one you care about\r
most should be the heavier of the two. Result tiles from a stack carry a **🧬**\r
badge naming the exact weights that made them.\r
\r
**Steps and CFG are set in the same panel, in both modes.** They are render\r
settings, not LoRA settings, so they stay available when the strength sweep\r
disappears in Blend — and like every other axis, ticking two values renders both\r
(the cell counter shows what that costs before you launch). SDXL also exposes its\r
second pass there.\r
\r
**Trying several weights at once.** Under each LoRA's slider is a row of weight\r
boxes. Tick two on one LoRA and two on the other, and the launch renders **all\r
four combinations** in a single run — the search you would otherwise do by\r
launching, looking, moving a slider and launching again. Each image is labelled\r
with its own pair, and the stack view lines the combinations up side by side so\r
you can pick the one that works and save its weights with ★.\r
\r
Tick nothing and the slider governs, exactly as before the boxes existed; the\r
slider is also how you use a weight that is not on the grid. Tick one box and you\r
get one configuration — one image — like any other blend.\r
\r
The count is spelled out before you launch ("4 weight combinations → 4 images,\r
about 1 min"), and past 24 images it turns amber and says so. It never refuses:\r
the queue is serial and it is your machine. Two LoRAs at four weights each is 16\r
images — the multiplication is quick, which is exactly why the panel does it for\r
you.\r
\r
**One family per run, always.** A Krea LoRA and an SDXL LoRA cannot be blended:\r
they need different base models and different workflows. The picker greys out the\r
other families as soon as you check one, and a run that somehow mixes them is\r
refused with both family names in the message.\r
\r
### Enhance a short prompt\r
\r
**✨ Enhance** rewrites what you typed into a fuller prompt using your local Ollama\r
model — it adds framing, pose, lighting, background and mood, and deliberately\r
leaves identity and trigger words alone (the LoRA supplies the identity, and Studio\r
injects the trigger itself at generation time — while the **Trigger word** box is\r
ticked, see below).\r
\r
By default it runs the same model your captions use. The **⚙️ next to the button**\r
picks any other pulled Ollama model instead — the choice applies immediately, is\r
remembered on that browser, and drives the same button on the Canvas run panel. A\r
vanilla model can refuse NSFW prompts; the abliterated captioning default is the\r
safe choice there.\r
\r
It is a local feature: without Ollama installed, running, and with its model pulled,\r
the button is **greyed out and says which of the three is missing** rather than\r
failing when you press it. Install or start it from **Settings › Local tools**.\r
(With a ⚙️ model picked, the last check moves server-side: the refusal names the\r
picked model instead of greying the button on the default one.)\r
\r
### Send the prompt as written — the Trigger word box\r
\r
Studio normally prefixes the dataset's trigger word to whatever you type, at\r
generation time — that is what activates the LoRA, and it is why you never have\r
to type the trigger yourself. The **Trigger word** box next to the prompt (on\r
the Test Studio, the Compare page and the Canvas run panel — one shared,\r
remembered preference) makes that explicit and optional:\r
\r
- **Ticked** (the default) — the historical behaviour, unchanged.\r
- **Unticked** — the prompt is sent **exactly as written**. Useful when a render\r
  keeps typing the trigger back into the image (a speech bubble or a sign asked\r
  to "say" something will happily spell out the first token it finds), or for\r
  pure style and scene tests where the token only adds noise.\r
\r
Images generated with the box unticked say **"no trigger"** in their details, so\r
two runs of the same prompt never look inexplicably different later. One honest\r
limit: with the box unticked and an **empty** prompt, the default test prompt is\r
used without the trigger — which usually means the LoRA's subject will not\r
appear; type a prompt when testing without the trigger.\r
\r
### Reuse a dataset caption in Studio\r
\r
Press **🎲 Caption** for a realistic test prompt from work you already curated.\r
The first use asks which dataset to draw from; after that, each main-button click\r
inserts a random **nonblank caption from a kept image** in that dataset. Studio\r
remembers the chosen source in this browser's localStorage. Use **▾** beside the\r
button to change the source dataset.\r
\r
The source needs at least one kept image with a nonblank caption. If you have\r
typed a prompt, Studio asks before replacing it.\r
\r
### Borrow a prompt from Civitai's top images\r
\r
**🌐 Civitai** (next to the prompt field, on every generation surface) browses\r
the most-reacted Civitai images of the day, week, month, year or all time —\r
each image shown side by side with the generation prompt it was posted with.\r
**⤵ Use prompt** drops it into your prompt field (asking first if you typed\r
something), **📋 Copy** puts it on the clipboard, and clicking the picture\r
opens it on Civitai.\r
\r
**☐ Batch** on a card adds its prompt to the batch instead — one more pass of\r
the next run, the field untouched — and the browser stays open so you can tick\r
several before pressing **Done**. The count shows under the prompt field (and\r
on the 🌐 button); the next **Run test** replays every ticked Civitai prompt\r
alongside the saved prompts you ticked, one image set per prompt, same\r
checkpoints, same settings, same seed. A prompt ticked in both places counts\r
once. After the run the Civitai prompts are in your saved prompts like any\r
other.\r
\r
Two honest limits:\r
\r
- **Not every image publishes its prompt.** The browser keeps only the ones\r
  that do by default; untick *Only images with a prompt* to see the full top.\r
- **Reading prompts needs a Civitai API key** (free account) — the same key\r
  the scraper uses, stored once in **Settings › Scraping & sources**. Without\r
  it the top images still show, but Civitai refuses the prompt data.\r
\r
The content-level select is a ceiling (*Safe* by default, up to *Everything*);\r
your filters are remembered in this browser's localStorage.\r
\r
### Continue a run instead of starting over\r
\r
If the best checkpoint is *almost* there — the identity nearly locked but a touch\r
undercooked — you don't have to retrain from scratch. The **▶ Continue training**\r
button (on the dataset's Checkpoints panel and on the **Runs** hub) opens a small\r
dialog:\r
\r
- **Resume from** — which checkpoint to restart from. The default is the latest,\r
  but the whole point is that you can pick an **earlier, less-cooked epoch**: the\r
  classic case where step 750 held up better than the over-cooked 1000. Choosing\r
  an earlier step never destroys the run's later saves — they're set aside intact\r
  on disk, and the continuation writes\r
  its own.\r
- **Extra steps** — how many *more* steps to train; the dialog shows the target\r
  step you'll land on.\r
- **Adjust settings (optional)** — a resume can only safely change a handful of\r
  things: the **checkpoint/preview cadence**, the **preview prompts** and the\r
  **preview steps and CFG** (test images only — never the weights), and the\r
  **timestep weighting**. Everything structural\r
  (rank, base model, optimizer) is locked to the checkpoint you're continuing.\r
  The timestep knob enables a known **two-phase recipe**: train balanced first,\r
  then continue with a low-noise-leaning emphasis to polish fine texture.\r
\r
- **Run it** — on this machine's GPU. A checkpoint is just a file, so one trained\r
  elsewhere can be continued here just the same. This fork has **no rented-GPU\r
  lane** — upstream's ☁ Cloud choice is removed, and a continuation always runs\r
  on the Primary's own card. When it can't run at all — no ai-toolkit, a training\r
  already going here — the button is disabled **with the reason**, never hidden.\r
  The **Runs** page's ▶ Continue behaves identically, counting that reason\r
  against *that run's* dataset, since the page lists runs from all of them.\r
\r
You can also click a checkpoint pill in the **◉ Graph** and pick *▶ Continue from\r
here*: the dialog opens already set on that step.\r
\r
Continue also works from the Runs hub, for any run listed there.\r
\r
## 7. Dual captions (long + short)\r
\r
An optional, **off-by-default** training technique, toggled under **⚙️ Advanced\r
options → Dual captions** on the training panel. When on, the run uses\r
ai-toolkit's native \`short_and_long_captions\`: **every image trains with both its\r
full caption and a short one.** It's a *text-side augmentation* — showing the\r
model two phrasings of the same image so the LoRA leans less on any single\r
wording and generalizes to prompts that don't match your caption style.\r
\r
How the short caption is produced:\r
\r
- It's **derived from the long caption**, automatically, the next time you\r
  (re-)caption — text-only, via the local vision model. Turning the toggle on\r
  doesn't rewrite anything by itself; **re-caption** to generate the shorts.\r
- It follows the **same kind rules** as the long one: no trigger word, and the\r
  identity / concept / aesthetic stays omitted (that's still the trigger's job).\r
- You can **edit it per image** in the **⛶** caption editor, next to the long one.\r
\r
**Not carried by every lane.** A dataset staged for a machine that has no copy of the\r
JSON file the short caption is read from trains on the long caption alone; on this\r
fork every run is local, so the toggle applies to all of them.\r
\r
**Not on Krea 2 or Anima.** Those two families pre-cache their text embeddings and\r
unload the text encoder to fit their DiT in VRAM. ai-toolkit caches exactly one\r
embedding per image — the long caption — and once the encoder is gone the training\r
loop reads those cached embeddings instead of the caption text, so a second caption\r
has nowhere to be encoded. Asking for both used to crash the run at the first step,\r
*after* the weights download and the whole caching pass (reported by **1Tomber**,\r
GitHub #22). The app now refuses the combination when it builds the training config:\r
the toggle says so, the pre-launch check warns, and the run trains on the long\r
caption alone — trigger word included, exactly like a normal run.\r
\r
---\r
\r
## 8. Concept LoRAs: keeping faces out\r
\r
A Concept LoRA learns the one thing every image shares. If those images all show\r
people, it quietly learns **their faces too** — and when you later stack it with a\r
Character LoRA, the two pull against each other over whose face to render. This was\r
reported by **shivdbz2010 (GitHub)**.\r
\r
Turn on **Mask faces** in *Advanced options* on a Concept dataset. Faces are\r
detected and **weighed down in the training loss**, so the concept binds to the act\r
instead of to the people in your photos.\r
\r
**Your images are not touched.** Nothing is blurred, pixelated or painted over.\r
That distinction matters: a blurred face would *be* what the model is trained to\r
reproduce, and the LoRA would learn to render blurry faces. A loss mask says\r
"don't correct me here" instead, so nothing at all is learned in that area.\r
\r
Before you rely on it:\r
\r
- **Variety beats masking.** The people who maintain these trainers say dataset\r
  diversity matters more here. A concept demonstrated by ten different people\r
  already dilutes identity; with two, the faces are as constant as the concept and\r
  no mask fully compensates.\r
- **Preview it.** The training panel draws the mask on your own shots and shows how\r
  many images got no face at all. A *partly* masked set is the bad case: the faces\r
  left unmasked become the only ones the LoRA still learns faces from, so they end\r
  up over-represented.\r
- **You can stop the preview, and it resumes.** On a large set the pass takes a\r
  while, so **Stop** is next to it — and what it already found is kept. Start it\r
  again and it continues from where it stopped rather than from image 1. The\r
  button says what stopping costs at the moment you press it, because that\r
  changes: the face detector is loaded before the first image and that load is\r
  paid again on every start, so stopping *during* the load gives up only the\r
  load, while stopping *during* the analysis keeps every face found so far.\r
  Change your kept images and the saved work is dropped instead of reused —\r
  boxes detected on photos that left the set would describe a run that no longer\r
  exists.\r
- **If your concept lives on the face** — an expression, a mouth, a gaze — masking\r
  the head can erase what you're teaching. The app warns when your description says\r
  so; it doesn't stop you, because only you know your dataset.\r
- **Nobody has measured this.** There's no published before/after of a concept LoRA\r
  trained with and without face masking. This gives you the lever, not a promise.\r
\r
Two knobs live in **Settings ▸ Training**: how far the detected face box is grown\r
into a head, and how much the masked area still counts. Neither is zero, on\r
purpose — see the settings reference.\r
\r
---\r
\r
## 9. Coverage — what your set never showed\r
\r
Section 2 says "vary everything except the person". The Composition bar cannot\r
check that: it counts face / bust / body / back against a target, so a set of\r
twenty-five front-on studio portraits in one outfit reaches a **fully green\r
target** while having no profile, no daylight and no second outfit. The LoRA that\r
comes out reproduces that one look and nothing else.\r
\r
**🔍 Coverage**, the collapsible panel right under the Composition bar, is that\r
second check. Open it and it reports, per axis, what your captions describe and\r
what they never mention:\r
\r
| Axis | What a gap means |\r
|---|---|\r
| Camera view | frontal / three-quarter / profile — a character with no profile has a side nobody ever saw |\r
| Camera height | eye level / low / high / overhead — eye-level-only is the default trap |\r
| Lighting | daylight, indoor, golden hour, studio, night, backlit, overcast |\r
| Setting | indoor, outdoor, urban, plain backdrop, water, vehicle |\r
| Outfit | counts how many **distinct** outfit types appear — one outfit gets learned as part of the person |\r
| Expression | counts how many distinct expressions appear |\r
\r
Which axes apply depends on the dataset kind. A **style** dataset is judged on\r
lighting, setting and view only — "one outfit" is not a defect when the outfit is\r
not what you are teaching. A **concept** dataset drops the expression axis.\r
\r
### What it can and cannot see\r
\r
This is deliberately a cheap check, not a second model. It reads **the words in\r
the captions you already generated** — nothing new runs, there is no GPU cost,\r
and the numbers appear instantly. That comes with real limits, and the panel\r
repeats them on screen rather than hiding them:\r
\r
- **No captions, no reading.** With an uncaptioned dataset the panel says so\r
  instead of drawing empty bars. Run the caption pass first.\r
- **It sees descriptions, not pixels.** A profile shot the captioner described\r
  without the word "profile" is invisible here. An absence is strong evidence,\r
  not proof.\r
- **Negation is not parsed.** "not smiling" counts as a smile.\r
- **Under five captions it refuses to judge** — at that size everything looks\r
  missing for the wrong reason.\r
- **It never selects, keeps, rejects or changes anything.** It is advice.\r
\r
### Clicking a chip shows you those images\r
\r
A number tells you *profile 3*; it does not tell you **which** three, and hunting\r
for them by eye in a grid of two hundred is the part that made the panel easy to\r
read and hard to act on. **Click any chip that has a count** and the grid opens\r
filtered to exactly the images that chip counted, with \`🔍 profile — camera view\`\r
in the filter bar and the usual *clear all* next to it.\r
\r
It stays advice: filtering changes which images you are *looking at*, never what\r
they are. Nothing is kept, rejected, recaptioned or reordered by the click, and\r
removing the chip brings the whole grid back.\r
\r
Two things follow from the panel reading captions rather than pixels, and they\r
are worth knowing before you trust a filter:\r
\r
- **The filter shows what the chip counted, no more.** Rejected and failed images\r
  are outside the panel's pool, so they stay outside its filter — the number and\r
  the images you get can never disagree.\r
- **A chip with a zero is not clickable**, because there is nothing to show. That\r
  is the gap the panel is pointing at, and the answer to it is generating or\r
  importing, not filtering.\r
\r
Pair it with **Sort ▸ Shot type** on the grid and the two compose: filter to the\r
profiles, group what is left by shot type, and decide what to keep with like\r
sitting next to like.\r
\r
The panel reads the same pool the Composition bar counts: everything that is not\r
rejected and not failed. It also tells you how many images have **no shot type\r
yet**, which is the one thing the bar above silently drops.\r
\r
## 10. Local fp8 model conversion\r
\r
The Training panel includes **Quantize an existing model to fp8** for full-precision\r
\`.safetensors\` checkpoints already on this machine. It runs on the CPU and writes\r
\`<name>_fp8.safetensors\` beside the source; the source is never modified and an\r
existing output is never silently overwritten.\r
\r
- It runs on the **CPU**, not the GPU: the work is an elementwise cast plus one\r
  reduction per tensor (measured ~1.2 GB/s here, so a 26 GB file is bound by your\r
  disk, not by arithmetic). Nothing competes with ComfyUI or a training run.\r
- It runs in a **separate Python** — the one that has \`torch\` (the app installs\r
  without it; torch is gigabytes). Whether that environment can actually do the\r
  work is checked *while the plan is drawn*: one that cannot disables the button\r
  and names what to install, rather than failing after the click or, worse,\r
  after the download.\r
- **The size of the model has no bearing on whether it opens.** It is read one\r
  tensor at a time. Mapping the whole file used to reserve its entire size\r
  up front, which is why a big checkpoint could fail with "the paging file is\r
  too small" on a machine with plenty of free memory and disk.\r
- One at a time, app-wide, and it checks free space before it reads a byte.\r
- It **refuses a file that is already quantized** — quantizing twice only loses\r
  more precision — and refuses a LoRA or adapter, which has nothing large enough\r
  to shrink.\r
- When it finishes it **re-opens the file it just wrote** and checks the marker,\r
  the per-tensor scales and the payload dtype, so a bad conversion is reported\r
  now rather than at generation time.\r
\r
> **This is not ai-toolkit's \`quantize\`.** The \`quantize\` / memory options in\r
> Advanced training shrink the model *in memory while it loads*, so a smaller\r
> card can train something that would not otherwise fit. They write nothing: the\r
> saved checkpoint is still full precision. This feature produces the **file**.\r
\r
### Testing a full model: it is a RAW checkpoint\r
\r
The artifact is **undistilled**. Krea 2 Turbo-style settings — CFG 1 and a\r
handful of steps — produce a blurry sketch on it, which reads as "the training\r
failed" when nothing failed at all. Use the same settings the run previewed\r
with: **CFG ~4 (3.5-5) and 20-30 steps**. The Test Studio now pre-fills those\r
automatically when the selected base looks like a Raw / full / fp8 checkpoint.\r
\r
### Which quantized checkpoints can be trained on, and which cannot\r
\r
**The format decides, not the number of bits.** "Quantized" covers two different\r
files, and only one of them is a wall:\r
\r
- a **packed export** — ComfyUI's scaled fp8 and its newer \`comfy_quant\` form,\r
  every int8 repack, and the fp8 twin this app itself writes — stores its\r
  decompression tables as *extra tensors* (\`scaled_fp8\`, \`<layer>.scale_weight\`,\r
  \`<layer>.comfy_quant\`). A trainer loads a base strictly: those tensors are keys\r
  it does not know, so **the load fails immediately** — not mid-run, not at the\r
  first optimizer step. This one is refused, and the message names both the\r
  obstacle and the way out;\r
- a **plain fp8 cast** stores the weights in fp8 under the tensor names the\r
  full-precision file already had, adding nothing. There is no unknown key for the\r
  strict load to trip on: the trainer up-casts it to bf16 as it loads. This one is\r
  **allowed**. Several widely used Krea 2 checkpoints — including the Turbo file\r
  most people already have — are of this kind, and refusing them closed a path\r
  that works.\r
\r
Allowed is not recommended. Picking a cast base shows a warning with the actual\r
numbers (how many of the file's tensors are stored in fp8, and how many\r
significand bits that leaves against bf16's 8): the precision the cast dropped\r
does not come back, so the run starts from an already-degraded base and the LoRA\r
it produces is worse than the same run on the full-precision file, for the same\r
GPU time. Train on it if that is the file you have — the point is that you know\r
what it costs, not that you should not.\r
\r
**What this check does not answer.** It reads how the file is *packed*, not\r
whether the model family can accept its tensors. A checkpoint can pass here and\r
still be refused at load for carrying a tensor the architecture does not declare.\r
Real case, found while building this: a widely circulated fp8 conversion of Krea 2\r
Turbo carries two extra 6144×6144 tensors under weight-shaped names — its own\r
metadata describes them as an embedded image, not weights — and a strict load\r
rejects them. That failure also happens in the first seconds, before any GPU time\r
is spent, and it comes with the trainer's own message naming the keys.\r
\r
**The way out of a refusal is a click, not a download.** A full-model run keeps\r
its bf16 master next to the fp8 twin, and the Checkpoints panel lists that master\r
by name — pick it there. If the only copy you have is a packed export, the\r
full-precision version has to come from wherever the model was published; there\r
is no way back from a packed file, which is why *Keep the bf16 master* is on by\r
default.\r
\r
The check reads a few kilobytes of file header — the quantization markers and the\r
tensor dtypes — so it costs nothing and fires the moment you pick the file, not\r
an hour into a paid run. A file whose header cannot be read is let through: the\r
app refuses what it can prove, never what it merely suspects.\r
\r
## 11. Preview quality — steps and CFG\r
\r
The preview images a run writes every few hundred steps are the only thing you\r
can judge it by while it is still running, so they have to be *readable*. How\r
they are rendered is two numbers — how many **steps** each preview gets, and at\r
what **guidance (CFG)** — and both live in ⚙️ **Advanced options** under\r
*Preview quality*, next to the cadence and the prompts.\r
\r
**Leave them empty and nothing changes.** The boxes show, as a placeholder, the\r
default your base resolves to; that default follows the model you picked, because\r
the right answer is a property of the base and not a preference:\r
\r
| Base | Preview default | Why |\r
| --- | --- | --- |\r
| A **distilled** one (Krea 2 Turbo, Z-Image Turbo) | 8 steps, CFG 1 | Distillation is what buys the few-step sampling. Asking for 25 steps at CFG 4 wastes minutes per preview and does not look better. |\r
| An **undistilled** one (Krea 2 Raw, Z-Image, FLUX, SDXL) | 20-35 steps, CFG 4-6 | At a distilled model's 8 steps these come back as unfinished sketches — muddy, half-formed — and you cannot tell a bad run from a bad preview. |\r
\r
You need the boxes when you train on a base the studio does not ship — a merge of\r
your own, a converted checkpoint — because then the default is a guess about a\r
model nobody measured. Symptoms worth acting on: previews that look like\r
sketches (raise the steps), or a preview that visibly costs more time than the\r
training it interrupts (lower them).\r
\r
These are **preview settings only**: they change the picture, never the weights.\r
That is also why a **▶ Continue** can change them even in *full training state*\r
mode, where the cadence and the learning rate are locked — a resume is exactly\r
when you have already seen the previews and know they are unreadable.\r
\r
*Suggested by charlesangus (GitHub #46).*\r
\r
---\r
\r
*Everything above is enforced or surfaced by the app itself (pre-flight checks,\r
leak badge, composition bar, coverage panel, advanced options). This page just\r
explains why.*\r
`;export{e as default};
