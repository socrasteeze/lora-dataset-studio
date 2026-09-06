const e=`# Using the app\r
\r
The workspace is a **guided flow**: each stage stays folded until the one\r
before it is done, and the progress rail on the left tells you where you are\r
and what's blocking the next step. You never have to guess what comes next —\r
this chapter just explains what each stage does and where the useful buttons\r
hide.\r
\r
The walkthrough below follows a **character** dataset end to end because it\r
exercises the most stages; **concept**, **style** and the **image bank** each\r
get their own section after it. The flow is the same for all of them — only the\r
captioning rules and a few guards change with the dataset kind.\r
\r
---\r
\r
## The character walkthrough (reference photo → trained LoRA)\r
\r
1. **Create the dataset** — Datasets → New. Pick **Character**, name it, set a\r
   **trigger word** (the token your prompts will use), and choose the **target\r
   model** (Z-Image / SDXL / Krea 2 / FLUX.1 / FLUX.2 Klein — changes the caption\r
   style; you can change it later).\r
2. **Upload the reference photo.** The app head-crops it automatically; use the\r
   crop editor (or *Reset to auto*) if the framing is off. Up to 3 extra angles\r
   can be added for multi-view consistency. **✦ Edit** retouches the reference\r
   itself from a prompt ("plain studio-grey background", "add glasses") and shows\r
   you a Before/After to Keep or Discard. It runs on **Klein** or **Krea 2 Edit**,\r
   on your own ComfyUI: free, private, and safe to repeat until it looks right.\r
   The two engines read different photos, and the dialog says which before you\r
   press Generate — Klein takes the dataset's extra angles to lock identity;\r
   Krea instead takes one image added in the edit dialog, trained as a different\r
   subject (another person, or a scene to place yours in). Do not use Krea's slot\r
   for another angle of the same face: that can duplicate the subject. An engine\r
   appears only when your ComfyUI can actually run it, and names the one missing\r
   thing when it nearly can. The edit runs on the server, so you can close the tab\r
   and come back to the Before/After.\r
3. **Generate variations** — fire the **variation catalog** on the local Klein\r
   engine: 53 shots across expression,\r
   angle, lighting, framing, outfit and background, each wrapped in an identity\r
   guard so the face stays the same person.\r
4. **Import** your own photos too (drag & drop) — each is auto-cropped to the\r
   face on the way in.\r
5. **Auto-classify framing.** A local vision model tags every image\r
   **face / bust / body / back**; the badges feed the composition meter.\r
6. **Curate** — keep / reject / crop, guided by the live meter targeting\r
   **12 face · 6 bust · 6 body · 1 back**. Watch the face-similarity badges\r
   (green = strong match, orange = review) to drop off-identity shots before\r
   they poison training.\r
7. **Caption** — one click captions the kept set (prose or booru tags,\r
   matched to the target model). The **identity-leak check** flags any caption\r
   that describes a trait currently set to Omit (face/eyes/skin, and by default\r
   hair). ⚙️ Options lets you Describe hair, makeup, facial hair or glasses so\r
   they stay prompt-controllable. Fix every flagged caption. A find/replace +\r
   tag-frequency panel sweeps the whole set at once; its **💾 Write .txt\r
   files** button drops a kohya-style \`<image>.txt\` next to each kept image\r
   in the dataset folder (same format as the export ZIP) for external tools.\r
8. **Fix individual shots** — every generated tile has a ✏ button: edit the\r
   exact prompt that made it and regenerate in place, without losing the rest.\r
9. **Train** — the pre-flight check runs the full checklist (count, balance,\r
   captions, leaks, duplicates). It no longer *blocks*: leaking captions and\r
   near-duplicates are editable right inside the confirm, and missing captions\r
   just ask you to **Start anyway** (captions stay strongly recommended). Steps\r
   are computed automatically; ⚙️ Advanced options exposes every knob (each with\r
   its own why/how) and a **Presets** row — apply a shipped ★ recipe (*Krea\r
   character*, *Concept*, *Style*) or save/import/export your own as a JSON.\r
   Training runs on your local GPU via ai-toolkit. Watch this run — and every\r
   other — from the **Runs** tab, where you can retry a failed run (↻),\r
   continue a finished run for more steps (▶), and download the LoRA.\r
10. **Pick the best checkpoint** — open the **Test Studio** from the dataset:\r
    grid-test checkpoint × strength, vote, rank by face similarity, and star ★\r
    the winning settings. The last checkpoint is almost never the best one.\r
11. **Export** — at any point, **Export ZIP** gives you the curated, captioned\r
    set as a standard ai-toolkit dataset. Nothing is locked in.\r
\r
## Retry a reference edit\r
\r
After an **✦ Edit** candidate appears, **Retry** repeats the exact prompt, selected\r
engine and temporary reference files used for that candidate. Use **Try another\r
prompt** only when you want to change the instruction. The candidate also names the\r
engine/API that actually returned it, so you can see which service produced the\r
image before you Keep or Discard it.\r
\r
## Test a run straight from Runs\r
\r
The **🏋️ Runs** hub is also a shortcut back to the right **Test Studio**. Every\r
active or recent run that still has a dataset shows **🧪 Test in Studio** beside\r
its actions. Click it to open Studio with that run’s dataset already selected —\r
there is no need to return to the library and find the dataset first. The button\r
is also available on a folded Recent dataset group, so you can start comparing\r
checkpoints without expanding its run history.\r
\r
## Using a full model you trained\r
\r
Training the **whole model** (rather than a LoRA adapter) produces something\r
different from a checkpoint, and **📦 Checkpoints & LoRAs** lists it in its own\r
**🧱 Full models** block for exactly that reason.\r
\r
A delivered run leaves up to two files, and they are not interchangeable:\r
\r
- the **full-precision master** (~26 GB). This is the only file you can train\r
  again or resume from. It is **never** sent to ComfyUI — 26 GB of a model folder\r
  to do a job the smaller file does better;\r
- the **fp8 twin** (~13 GB). This is the inference format: the file ComfyUI loads\r
  with **Load Diffusion Model**.\r
\r
If the run has a master but no twin, **✨ Quantize to fp8** makes one. It works\r
whether the master is on this computer or only in the run's private Hugging Face\r
repository — in the second case it is downloaded first, with progress, and the\r
transfer can be stopped and resumed. Once the twin exists, **→ Send to ComfyUI**\r
puts it where ComfyUI looks. On the same drive that is a hard link: instant, and\r
it costs no extra disk space.\r
\r
**🗑 Trash** moves one of those files to the app trash, so a mis-click on a file\r
that cost hours of GPU is recoverable.\r
\r
**A run whose model is only on Hugging Face is not a lost run.** It shows\r
**☁ on Hugging Face** on the board and in its card, and the app refuses to remove\r
it: doing so would discard the only record of where that model is.\r
\r
### Testing a full model\r
\r
Once the fp8 twin is in ComfyUI, the **Test Studio** lists it as a base and\r
**🧪 Test in Studio** opens straight onto it, with its own sample settings filled\r
in. That matters: a full model trained here is **undistilled**, so it wants a\r
real CFG and a real step count (CFG 4 / 25 steps for Krea 2). The family's\r
few-step Turbo defaults render a blurry sketch on it that reads as a failed\r
training.\r
\r
One limit worth knowing before you go looking for a button that is not there:\r
**the Test Studio is entered through a LoRA of the dataset.** A dataset trained\r
only as a full model has none, so it cannot open the Studio at all. If you have\r
any LoRA of that dataset deployed, pick it and set its **strength to 0** — no\r
LoRA node is added at 0, so you generate with the bare model.\r
\r
## Merge a LoRA into a base checkpoint\r
\r
This is the step between *"I trained a LoRA"* and *"I have a model to publish"*,\r
and it is how most of the community checkpoints you can download were actually\r
made. Of the Krea 2 checkpoints whose authors describe their method, the ones\r
that explain themselves describe a **merge**, not a training run: train a LoRA on\r
Raw, fold it into a base, quantize, upload.\r
\r
You will find it in **📦 Checkpoints & LoRAs**, as **🧬 Merge a LoRA into a base\r
checkpoint**. Inside a full model's card the same tool appears with that model\r
already filled in as the base.\r
\r
**Say what you are merging.** Pick a full-precision base, then add one or more\r
LoRAs, each with a weight. \`1.0\` applies a LoRA exactly as it was trained;\r
lower blends it in more gently; a negative weight subtracts it. Several LoRAs\r
stack — that is what "baked in LoRAs with balanced weights" means when you read\r
it on a model page.\r
\r
**Nothing starts on the first click.** The plan is computed from the file headers\r
alone — no weight is read — and it tells you how many tensors change, exactly how\r
big the output is, which drive it lands on, roughly how long it takes, and what\r
happens if it fails. On a 26 GB Krea 2 base, a measured merge took **about two\r
minutes** and rewrote 256 of 430 tensors.\r
\r
**Nothing is ever overwritten.** The result is written next to the base under a\r
new timestamped name, through a temporary file that is only renamed once the\r
merge finishes. A merge that fails, or that you stop, leaves the base, the LoRAs\r
and any earlier merge exactly as they were.\r
\r
### It is a merged model, and it says so\r
\r
The file's own metadata records that it came from a merge, which base it used,\r
which LoRAs at which weights, and when. That matters because **file names lie**,\r
and because on the model sites "finetune" is routinely used for exactly this\r
object — by authors who describe the merge themselves a sentence later. LDS does\r
not copy that vocabulary: what comes out of here is a base with LoRAs folded into\r
its weights, not a model that was trained as a whole, and the header keeps saying\r
so after the file is renamed or re-uploaded.\r
\r
### Getting the speed back (the Turbo transplant)\r
\r
A full-model run in this app targets **Raw**, which is undistilled and therefore\r
slow. Krea publishes a re-distillation LoRA for Turbo; merging it at **0.8-1.0**\r
into a model trained on Raw is the published route people use to get few-step\r
behaviour back, and it is how the same model ends up on the model sites in both a\r
Raw and a Turbo flavour.\r
\r
**We have not tested this ourselves.** It is an approximation, not an identity —\r
generate a few comparisons before you publish anything on the strength of it.\r
\r
### Merge first, quantize after\r
\r
Merging into an **already quantized** file is refused, on purpose. It would\r
dequantize every weight, modify it and re-quantize it: lossy on the way in and\r
again on the way out, and the loss compounds each time somebody does it. Merge\r
into the full-precision (bf16) model, then quantize the merged result with the\r
fp8 tool — which is the order the refusal points you at.\r
\r
### Two things it will tell you about, rather than hide\r
\r
- **A LoRA that does not belong to the base** is refused before anything is\r
  written, naming the weights it expected to find. A LoRA trained for another\r
  model has nothing to merge into.\r
- **Tensors that are not part of the model** are reported, not dropped. Not every\r
  \`.safetensors\` contains only a model: one community Krea 2 file circulating\r
  today carries about 75 MB of an image in two tensors hiding under a legitimate\r
  name. Nothing we do not understand is modified — it is copied through, and the\r
  plan names it so you know it is there.\r
\r
**What the merge needs:** the same Python that quantization uses — one with\r
\`torch\` available. If it is missing, the plan says so with the command to fix it,\r
before you click anything.\r
\r
## The generation queue\r
\r
Everything that renders locally goes through one queue: your ComfyUI runs a\r
single job at a time, whether it was asked for from a dataset, the Test Studio,\r
the Canvas or the Bank. So you do not have to wait for one thing to finish\r
before starting the next — launch an **✨ Upscale & improve** batch, then a\r
**⚡ Generate**, then a retry on a tile, and they line up and run in turn.\r
\r
The dock in the bottom-left corner is that queue. It appears only when there is\r
something in it, and shows, top to bottom: what the GPU is working on right now,\r
then what is waiting behind it, in the order it will be taken. Each line names\r
where the job came from and which dataset it belongs to, so two datasets feeding\r
the same queue are never confused for one another.\r
\r
Two buttons per line:\r
\r
- **↑** sends a waiting job to the front. Only the wait can be re-ordered — a\r
  job already on the GPU has nothing left to re-order, and says so.\r
- **✕** cancels that one job. This is not **⏹ Stop generation**, which ends a\r
  whole batch: cancelling here drops a single job and leaves its tile marked\r
  failed, and **Retry** on that tile queues it again.\r
\r
Some jobs cannot be cancelled from the dock, and say who owns them instead: a\r
watermark inpaint belongs to the 🧽 Clean watermarks pass, and a reference edit\r
to the ✦ Edit reference panel. Both are being waited on by the pass that started\r
them, and each has its own Stop where it lives. A **paused** line means ComfyUI\r
stopped answering — that one is resolved from the recovery banner at the top of\r
the screen, not from here.\r
\r
Two things still take the GPU exclusively and are not queued behind anything:\r
a training run, and a vision pass (captioning, framing, face analysis). While\r
one of those is running, new generations wait for it and the app says so.\r
\r
### When the queue waits for something that is not LDS\r
\r
Ollama shares your graphics card with ComfyUI, and only one of them can have it.\r
So before every generation LDS checks that the local Ollama is not holding a\r
model — and if one is loaded that LDS did not load itself, it waits rather than\r
evict somebody else's work. The dock says exactly what is in the way and, once\r
the wait passes a minute, how long it has been standing there.\r
\r
That wait usually ends on its own: Ollama drops an idle model after a few\r
minutes and the queue resumes with nobody touching anything. When it does not —\r
another app is captioning, a second LDS instance is running a batch, or the\r
runner in the Ollama slot never unloads at all — you have two answers, and\r
neither is "quit and come back":\r
\r
- **Unload it and continue** evicts the other model. Right when you know what it\r
  is and that it is idle; it is never done automatically, because LDS cannot\r
  tell your live work from a leftover.\r
- **Run anyway** shares the card instead: LDS starts generating next to the other\r
  model. Nothing of yours is unloaded. The cost is real — two loaded models on\r
  one card do not crash on Windows, they page, and generation can get much\r
  slower — so it asks once, in those words, and the guard comes back on its own\r
  after fifteen minutes.\r
\r
An Ollama URL the app cannot use at all (a typo, or an address with a path on the\r
end) is not treated as a busy card: captioning will tell you it cannot reach its\r
model, and image generation keeps running.\r
\r
## The Gallery (every image you generated)\r
\r
**🖼 Gallery** in the top bar is one feed of everything the app ever rendered —\r
Test Studio cells, Canvas previews, comparison runs and ✨ Upscale & improve\r
results — across every dataset at once, newest first. The per-checkpoint\r
galleries answer "what did this training produce"; this page answers "what did\r
I make".\r
\r
Narrow it from the row above the grid: one dataset, **Renders** or\r
**✨ Improved** only, or **👍 Liked** — the images you rated up in the Test\r
Studio. The count always names what the grid is actually showing. The feed\r
loads itself as you scroll towards its end; the **Load more** button at the\r
bottom states how many are left and still works as a plain button.\r
\r
Tap any image to open the viewer — the same one the Canvas uses, with\r
everything the picture was made from: seed (copyable), checkpoint, base model,\r
sampler, CFG, the always-on LoRAs it was generated with, and the full prompt.\r
The **‹ ›** buttons (or the ← → keys) walk the feed without closing it; tap\r
the picture to put the details away, double-tap to magnify.\r
\r
From the viewer you can also:\r
\r
- **⬇ Download** — the file lands under a name that still says which dataset,\r
  run, step and seed made it.\r
- **✨ Upscale & improve** — Klein (re-renders detail; sharper, but skin can\r
  shift) or SeedVR2 (upscales and keeps the look). **Klein opens a small\r
  window first**: the exact instruction it is about to send (editable in\r
  place, or switched off), the Klein model, a **LoRA preset** to chain and\r
  the **output size (MP)** — all app-wide, the same values Settings shows —\r
  then **✨ Generate** starts the pass and the finished picture appears right\r
  in that window. Close it early and nothing is lost: the result arrives at\r
  the top of this gallery as its own ✨ image. SeedVR2 has no dials, so it\r
  runs straight away. Either way the original is untouched.\r
- **↩ Use these improve settings** — on a ✨ result you like: the\r
  instruction, LoRA preset, strength, steps, output size and model that made\r
  THIS image become the app-wide improve settings again, so the next\r
  improves run the same way. Every new improvement records what it ran\r
  with; older images restore what they carry, and the toast names exactly\r
  which parts were applied.\r
\r
**Select** at the bottom turns on selection mode: tap the misses, then\r
**🗑 Delete** (files go to the recycle bin or the app Trash — and the rows\r
leave the Test Studio too, which the confirmation says before anything is\r
armed), or **⬇ ZIP** to download the picked images as one archive under their\r
lineage names.\r
\r
## Recover a paused Test Studio batch\r
\r
If ComfyUI drops while Test Studio is processing a batch, the affected tile says\r
**paused** and shows its paste-safe reason. The queue deliberately stops there:\r
it does **not** submit or start a later job, so nothing else runs against a\r
recovered or different ComfyUI state.\r
\r
First recover or restart ComfyUI. For a valid local portable install,\r
**Setup → ComfyUI → ▶ Start ComfyUI** uses the app's fixed local-safe profile.\r
It does not read, change or execute any \`.bat\` file; your existing launcher and\r
its settings stay untouched. Once ComfyUI is responding, **Cancel** the paused\r
batch and resume it from Studio. That makes the next prompt an explicit choice,\r
never an automatic continuation.\r
\r
## Concept datasets (an object or action, not a person)\r
\r
Pick **Concept** at creation and describe the concept in the required field —\r
the captioner needs to know exactly *what to omit*. What changes vs character:\r
\r
- **No reference photo.** Images come from **import** or the built-in\r
  **scraper** (paste a gallery URL or run a Reddit keyword search, tick the\r
  frames you want, they land straight in the dataset — deduplicated and\r
  quality-filtered). Already have a kohya-style dataset on disk (images +\r
  same-name \`.txt\` captions)? **⋯ More → 📂 Import from folder…** merges it in\r
  from a pasted folder path — captions attach, duplicates are skipped (a ZIP\r
  works too, via **📦 Import dataset**). On gallery sites (PornPics), a category/tag/search scan\r
  shows **the same previews the listing page does** — one per gallery, the shot\r
  that actually matches your keyword. Tick **Scan full albums** to pull every\r
  photo of each matched gallery instead, or paste a single \`/galleries/…\` URL\r
  to get that whole album. Sex.com works the same way for keyword searches\r
  (\`sex.com/en/pics?search=…\`) — every pin **is** a single matching image, so\r
  there is no album option to worry about. Civitai searches return **SFW\r
  results only** unless you add a Civitai API key in **Settings → Scraping &\r
  sources**.\r
\r
  > **Reddit says "wait N seconds" (429)?** By default Reddit scans share a\r
  > public client id (and its ~1000 requests / 10 min quota) with many other\r
  > people, so it can be exhausted before your first scan. Add your own free\r
  > client ID in **Settings → Scraping & sources** — a one-minute, step-by-step\r
  > guide is built into that page.\r
- **Captions invert**: they describe everything *except* the concept, so the\r
  concept is what binds to the trigger. The leak check watches for stray\r
  descriptions of it.\r
- **Person masking is off** (a person mask would erase the very thing you're\r
  teaching), and imports keep the full frame instead of head-cropping.\r
- **You can mask the faces instead** — the opposite polarity. *Advanced training\r
  options ▸ Mask faces* weighs the detected faces down in the loss so the concept\r
  learns the act, not the people demonstrating it, and you can preview exactly what\r
  it would cover before training. Off by default. See the dataset guide, §8.\r
\r
## Style datasets (a global aesthetic)\r
\r
Pick **Style** at creation. What changes:\r
\r
- **No trigger word** — the style tints every image once the LoRA is loaded.\r
- **Captions describe content only** (never the rendering), and they're\r
  optional; caption dropout rises so the style generalizes.\r
- **Step count switches to a sublinear √n scale** built for the large sets\r
  (hundreds of images) style LoRAs want.\r
\r
## Caption your images in another tool\r
\r
You are not locked into the captioners shipped here. The round trip is:\r
\r
1. **⬇ Export ZIP** from *Import & export*. The archive is a plain kohya layout —\r
   one folder of \`image.png\` + same-name \`image.txt\` pairs. If some kept images\r
   have no caption yet, the app asks before exporting instead of refusing:\r
   confirm and their \`.txt\` files come out empty, ready to be filled.\r
2. **Caption them wherever you like.** Any tool that writes a \`<image>.txt\`\r
   sidecar next to each image works — that is the convention this app reads,\r
   whatever the file names are and whatever folder depth you use.\r
3. **📦 Import dataset (ZIP)** (or **📂 Import from folder…**) with the same\r
   images and their new \`.txt\` files. Images already in the dataset are **not\r
   duplicated**: their caption lands on the row that already holds them, and the\r
   toast says how many were applied.\r
\r
Two things worth knowing before you start:\r
\r
- **A caption you already wrote here is never overwritten.** Re-importing only\r
  fills the empty ones; the toast reports the rest as *"kept the caption written\r
  here"*. Clear a caption in the app first if you want the external one to win.\r
- **Only the caption travels back.** Statuses, scores and framing stay as they\r
  are here — the returning archive is read as captions for images you already\r
  have, not as a replacement dataset.\r
\r
**A Style dataset asks louder, on purpose.** A Style LoRA learns everything its\r
captions do *not* name, so an empty \`.txt\` teaches it nothing; the export\r
confirmation says so before letting you through. Cancelling takes you straight\r
to the captions instead.\r
\r
*Requested by Qeeyana (Reddit).*\r
\r
## Krea and the shape of your reference photo\r
\r
**Krea 2 Edit now follows the framing of the selected shot card** during dataset\r
generation. The reference photo still anchors identity, but Krea's v1.2 Fit path\r
adapts it to the requested output: **1:1** for face cards and **3:4** for bust,\r
body and back cards. A square reference therefore no longer forces a full-body or\r
sitting card into a tight bust crop.\r
\r
This is deliberately limited to Krea dataset variations. The separate **Edit\r
reference** action keeps the source layout for a free-form edit, while Klein and\r
the API engines keep their existing, separate generation paths.\r
\r
You can still crop a reference when you want a different identity anchor or\r
composition, but you no longer need to crop it merely to give a selected body\r
card enough vertical room. Reference quality still matters for likeness; the\r
selected card now owns the output frame.\r
\r
## Your own shot catalog (JSON import)\r
\r
The workspace ships a built-in shot catalog per subject type (53 shots for a\r
human, ~59 for an animal, 55 for an anime character, and so on). If you want shots nobody wrote for you —\r
40 breed-specific poses for a dog, a product line's signature angles — you don't\r
have to type them one at a time. Open **📥 Shot catalog (JSON)** under the shot\r
grid.\r
\r
**Export first.** The exported file is the format, and the example an LLM needs:\r
\r
\`\`\`json\r
{\r
  "format": "lds-shots/1",\r
  "subject_type": "animal",\r
  "shots": [\r
    {\r
      "label": "Dog, zoomies on the lawn",\r
      "framing": "body",\r
      "prompt": "full body photo of the animal running fast across a lawn, side view, sunny day"\r
    }\r
  ],\r
  "examples": []\r
}\r
\`\`\`\r
\r
Then ask a chat assistant for more shots *in that exact shape*, and import the\r
file it gives you.\r
\r
Each shot needs three things:\r
\r
- **\`label\`** — a short name, max 80 characters, shown on the card. It must be\r
  unique: not a built-in label (of *any* subject type), and not one of your\r
  existing shots. The app refuses a collision and tells you which label is at\r
  fault — two shots sharing a label would make it resolve the wrong prompt the\r
  day you regenerate one.\r
- **\`framing\`** — exactly one of \`face\`, \`bust\`, \`body\`, \`back\`. Anything else is\r
  refused; it is never quietly remapped.\r
- **\`prompt\`** — the text sent to the image engine, max 500 characters.\r
\r
\`nsfw: true\` is optional and only has an effect when Klein is the only engine\r
checked. Everything under **\`examples\`** is ignored on import — that's how the\r
export can show you samples without them coming back as duplicates. Any other\r
field (including \`aspect\`) is ignored too, and the import summary says so: an\r
imported shot uses its framing's default aspect ratio.\r
\r
**Nothing is written until you confirm.** The app reads the file, lists what\r
would land and what it refuses (naming the entry and the reason), and waits. A\r
40-shot file whose 37th entry is broken never leaves 36 shots half-imported.\r
\r
Imported shots appear in their own **📥 Imported** group after the built-ins, one\r
set per subject type. They never replace a built-in, you can delete them one by\r
one or all at once, and they're stored with the app — not in the browser — so\r
they survive a cache wipe, show up on your phone and ride along in the backup.\r
\r
### Keeping a shot you wrote by hand\r
\r
The **✨ Custom shot** box below the grid is the quick way to add one shot: type a\r
prompt, pick a framing, Add. Those cards are stored **in your browser**, so\r
clearing its data takes them with it.\r
\r
Any card you want to keep, press **Keep** on it. It moves into the 📥 Imported\r
group and is saved with the app, exactly like an imported shot — surviving a\r
cache wipe, following you to another device, included in the backup. The card\r
keeps its identity, so a shot preset that had it selected still works. If its\r
label happens to clash with a built-in shot or with one you already imported, the\r
app says which label and refuses rather than creating a duplicate; rename the\r
card (remove it and add it again) and press **Keep** once more.\r
\r
*Feature requested by ashish.sinha (Discord).*\r
\r
## Back up everything\r
\r
The **💾 Back up everything** button on the Datasets library packs your whole\r
setup into a single file so you can move to a new machine — or recover from one\r
— without losing anything.\r
\r
- **What's inside**: every dataset (all images, captions, statuses, face and\r
  watermark states, references), its **training history** (which runs produced\r
  which version, the settings each used), plus your **settings** — engine\r
  choices, training defaults, watermark preferences. It's a\r
  *logical* backup, one entry per dataset, not a raw disk dump.\r
- **Include trained LoRAs** (checkbox next to the button): also bundle the\r
  trained \`.safetensors\` files themselves. These are large — hundreds of MB per\r
  checkpoint — so it's **off by default**; the light training history above is\r
  always included, so a dataset comes back under **Trained** either way. Tick it\r
  when you want the finished LoRAs to travel too.\r
- **What's never inside**: your **API keys, Hugging Face token and scraping\r
  credentials**. They are deliberately left out so the file is safe to copy\r
  around; re-enter them once on the new install.\r
- **How it runs**: in the background. A library can be gigabytes, so you get a\r
  live "X / N datasets" progress bar and can keep working. When it's done, use\r
  **⬇ Download** to save the archive, or **📂 Open folder** to find it on disk.\r
- **Restoring**: hand the master archive to the same **📦 Import backup** button.\r
  It restores your settings (without overwriting keys you've already entered),\r
  rebuilds each dataset **and its training history** — so it lands back under\r
  **Trained** instead of "Not trained yet", with its runs in the Runs hub.\r
  Bundled LoRA files are re-deployed to ComfyUI when it's configured on the new\r
  machine; if it isn't, they're reported as skipped and the **Trained** status\r
  still stands (the run is what marks it trained, not the file on disk). Nothing\r
  is ever overwritten — a dataset whose name already exists comes back with a\r
  \`(restored)\` suffix — and you get an honest final report of what was restored,\r
  renamed or skipped.\r
\r
## The image bank (triage a big folder)\r
\r
You exported 9 000 unsorted images from Telegram (or a scraper dumped a\r
mountain of files) and a dataset only needs the best 30–150 of them. The\r
**🗃️ Bank** tab is the triage funnel that gets you there — without ever\r
touching the folder itself.\r
\r
**Where things are on that screen.** A bank you open is laid out in three\r
parts, and knowing which is which saves reading the rest of this section twice:\r
\r
- a **top bar** with the bank's name, its counters, and the four actions that\r
  change what leaves the bank — **⚙ Passes**, **🚀 Launch all**, **⬆ Promote**\r
  and **🗑 Delete rejected from disk**;\r
- a **filter rail** down the left: the search, the exclude box, the subfolder\r
  picker, the person and style strips, and the chips. The six measured axes\r
  (Score, Framing, Medium, Angle, Resolution, Origin) sit behind **🎛 More\r
  filters** so the everyday ones stay on one screen. On a narrow window the rail\r
  becomes a drawer you open with **☰ Filters**, and it remembers whether you\r
  keep it open. On a wide window the rail stays put as you scroll the grid, so\r
  the chips are still there ten thousand images down;\r
- the **grid** filling the rest, with the selection actions directly above it.\r
\r
The analysis passes live **inside ⚙ Passes** rather than across the top of the\r
page: they are the step you run once per bank and then leave alone for days, and\r
they were taking up the third of the screen the images now use. All eight are\r
still there, and each still opens its own window with its own scope and counts —\r
only the door changed. On a bank with nothing scanned yet the panel opens by\r
itself, because there is nothing else to do first — **on a desktop-width window\r
only**. Measured at 360 px it is about 1 500 px tall, so opening itself there put\r
the first image two screens down; below that width ⚙ Passes stays a button you\r
press. Below it, the panel also folds everything that is not a pass button — the\r
semantic engine, watermarks, edits and the overview each sit behind their own\r
named fold, one tap away — because the pass buttons are what you came for.\r
\r
The funnel itself:\r
\r
1. **Create a bank** — give it a name and paste the folder path. The app\r
   inventories every image in place (subfolders included). Nothing is copied,\r
   nothing is modified; rejecting an image is a reversible status, never a file\r
   deletion. If your folder is really a *folder of folders* (a Telegram export\r
   with one subfolder per chat, say), tick **One bank per subfolder** and each\r
   top-level subfolder becomes its own bank — so you can curate, queue and\r
   promote each one separately. A preview shows exactly which banks will be made\r
   and how many images each holds; loose images sitting directly in the parent\r
   get their own bank too, so nothing is dropped. **Untick any subfolder in that\r
   preview to leave it out of this import** — a rendered-output folder, a backup,\r
   the 40 000-file archive you do not want triaged. Excluded folders stay on the\r
   list struck through (so you can see what you skipped rather than wonder what\r
   the walk missed), and they are not read at all rather than read and then\r
   discarded. The exclusion applies to *that import*: each bank created is rooted\r
   at its own subfolder, so nothing you excluded can reappear later. If you tick\r
   off **every** subfolder the app says so before you press the button — it will\r
   make the loose-files bank if there is one, and refuse outright if there is\r
   not, rather than quietly importing the whole parent folder instead. The folder\r
   stays LIVE: keep dropping images into it and they are picked up as undecided\r
   images ready for the next scan — your existing keep/reject decisions, scores\r
   and captions are never touched. The bank LIST does not re-check the folders by\r
   itself any more: on a big library that was a full inventory of every image on\r
   disk each time you walked past the page. It tells you how fresh its counts\r
   are, and **🔄 Rescan folders** checks them all on demand ("42 new image(s)\r
   found in the folder"). Opening one bank still walks that bank's own folder, so\r
   its own count is always current the moment you look at it. A folder that went\r
   missing (unplugged drive, renamed folder) is still flagged from the list\r
   without any rescan. Files you removed from the folder are reported at the top\r
   of the bank, never deleted from it, so an unplugged drive can't wipe your\r
   triage. One bank holds up to **200,000 images**; past that the refresh adds as\r
   many as fit and tells you how many it left out, so nothing you already\r
   triaged stops working. That ceiling counts what is in the folder now — files\r
   you deleted from it don't count against it.\r
1bis. **🕸 Scrape the web into a bank** — you don't need a folder you prepared\r
   by hand. Unfold **🕸 Scrape the web into a bank** on the bank list, choose a\r
   destination (a **new bank**, or **add to an existing one**), then scan a\r
   gallery URL and pick images exactly as you would for a dataset. They are\r
   downloaded into that bank's own folder and inventoried on the spot.\r
\r
   Two things are worth knowing, because they are the whole point:\r
\r
   - **Nothing is filtered on the way in.** Scraping straight into a *dataset*\r
     applies training-grade gates (short side ≥ 768 px, ratio ≤ 3:1, perceptual\r
     de-duplication) *before* anything is stored. A bank is the step **before**\r
     that judgement: "too small", "near-duplicate" and "wrong framing" are\r
     verdicts its own passes produce, with thresholds you move. So the bank\r
     stores what it downloaded and lets you decide. If you already know what you\r
     are collecting, scraping straight into a dataset is still the shorter road.\r
   - **A second scrape resumes the same bank.** Pick *Add to an existing bank*\r
     and the new images join the pile — nothing is replaced, and no triage\r
     decision you already made is reset. Re-downloading the exact same file\r
     lands on the same name instead of piling up copies; that is file identity,\r
     not a duplicate verdict (the bank's own passes own that word).\r
\r
   The rest of the funnel is unchanged: scan, cull, promote into a dataset.\r
2. **🔎 Scan quality** — a background pass (CPU only, a few minutes even on\r
   thousands of images) scores every file: sharpness, noise, flat/empty\r
   frames, resolution — and groups **near-duplicates**. The flags follow the\r
   thresholds in *Settings → Captioning & quality*; because the raw scores are\r
   stored, tuning a threshold re-sorts the bank instantly, no rescan. The same\r
   pass also answers two questions the file itself lies about — see\r
   *Is this image really what it says it is?* below.\r
3. **Cull** — use the filter chips (Blurry, Noisy, ⬜ Flat, Small,\r
   🧇 Soft detail, 🎞 Black bars, ≈ Duplicates) to review the worst\r
   offenders first. **🧹 Auto-reject\r
   flagged…** clears whole categories in one click (your manual ✓/✕ are never\r
   flipped). The number beside each checkbox is what *that click* would reject —\r
   still-undecided images only, which is why it is usually smaller than the\r
   count on the matching filter chip: the chip shows every image carrying the\r
   flag, including the ones a previous auto-reject already threw away — and it\r
   counts them **inside whatever else you have filtered**, so it always states\r
   the size of the page it opens. (Each chip is measured with your other filters\r
   applied and its own value lifted, so picking one never blanks its\r
   neighbours, and a chip stays on offer even when it holds nothing under the\r
   current filter. The auto-reject number stays whole-bank on purpose: that pass\r
   runs over the bank, not over the view.) Run it\r
   twice and the second run legitimately says **0 to reject**: there is nothing\r
   left it is allowed to touch. A flag also warns when its pass never ran, and\r
   the panel says how many images have **never been scanned** — those are\r
   invisible to every quality flag until 🔎 Scan measures them, which is not the\r
   same thing as being clean. In the Duplicates view, resolve every group at\r
   once with **keep best** (highest resolution, then sharpest) or **keep\r
   first**, or pick the keeper by eye.\r
4. **👥 Group by person** — the face pass (needs the Quality tools from Setup)\r
   detects the dominant face of every remaining image and clusters the bank by\r
   person, *no reference photo needed*. Click a person card to see only them,\r
   select all, keep or reject. Embeddings are cached, so re-running after a\r
   cull is much faster.\r
5. **🔖 Tags** — the cheap way to slice the pile. A small local model (WD14,\r
   ~400 MB, installed from *Setup ▸ Quality tools*) labels every non-rejected\r
   image with **booru tags** — \`blonde_hair\`, \`red_dress\`, \`outdoors\` — and the\r
   filter bar gains tidy dropdowns for hair, clothing, headwear, setting, pose\r
   and how many people, plus an **All other tags** list so nothing the model\r
   found is hidden. They compose with every other filter, and the **search box\r
   matches them too**, so \`red dress\` works before you have captioned anything.\r
   The point is the order of operations: captioning a 9 000-image dump costs\r
   hours of GPU time, and you would be paying it *before* knowing which images\r
   you want. Tag first, throw most of it away, caption the survivors. It runs\r
   fine on the **CPU**, so it works on a machine that cannot host a captioning\r
   model, and it **never writes a caption** — the tags live in their own place\r
   and the captioner below is untouched. **Limits, plainly:** it is a\r
   *classifier*, not a describer — it names things it was trained on and will\r
   miss the rest; the facet dropdowns are curated shortcuts over a partial list\r
   of known tags, which is why All other tags exists; it is available in the\r
   **bank only**, not in the dataset workspace; and unlike the other heavy\r
   passes it **cannot run on a compute peer** — Launch all will refuse it there\r
   rather than fail an hour in.\r
6. **🏷️ Caption & 🔍 search** — caption the bank with the same engines your\r
   datasets use (JoyCaption / Ollama vision, your *Settings*). Hit **🏷️ Caption\r
   all** to describe every not-yet-captioned image, or select some first to\r
   caption just those. It runs in the background, frees the GPU like the other\r
   passes, and is Stop-able mid-run. The captions are plain descriptions (no\r
   trigger word, nothing omitted) whose real job is **search**: type into the\r
   search box — \`red dress\`, \`sunset\`, a file name — and the grid filters to\r
   matching images, combinable with every other filter. It's the fast way to\r
   find shots in a 9 000-image dump.\r
   → **🧪 Caption Lab**, in the same 🏷️ Caption window, benches up to four\r
   configurations — engine, vision model, vocabulary register and length — on ONE\r
   image you pick, side by side, before you spend a pass on thousands. Nothing is\r
   written until you keep a result; **⚙️ Use for the next run** loads the winning\r
   configuration into the dials above (a bank picks its caption method per run rather\r
   than storing one, which is what that button means here). A bank caption can also be\r
   edited by hand from that window — what you write is stamped as yours, so a forced\r
   🔄 Re-caption spares it unless you tick the opt-out.\r
7. **⬆ Promote** — the kept images are **copied** into the dataset you choose —\r
   or into one **created on the spot**, so the last step of the funnel no longer\r
   sends you to the Datasets page and back — through the normal import path: normalized to webp, near-duplicates already\r
   in the dataset skipped. Any bank caption **rides along**, so a captioned\r
   selection starts already captioned in the dataset. From there they get\r
   everything datasets have — captions, watermark cleaning, face scoring against\r
   a reference, training.\r
\r
Work the funnel in that order: quality first (cheap, catches the trash), then\r
subject, then selection. A promoted image keeps its ⬆ badge in the bank so you\r
always know what's been used where.\r
\r
**Keeping the list readable.** A bank is named once, at creation — and *One bank\r
per subfolder* names them after the folders — so the list gets unwieldy fast.\r
Click the **✎** next to a bank's name to rename it: only the label changes, the\r
source folder, the images and every ✓/✕ stay exactly where they are. The **Sort**\r
menu above the cards reorders the list (newest or oldest first, name A→Z or Z→A,\r
most images, least triaged) and remembers your choice between visits.\r
\r
**You can curate while a pass is running.** Opening another bank and accepting or\r
rejecting images while a scan — or the whole Launch-all queue — is working is\r
supported and safe. If a save happens to land at the exact moment a pass is\r
writing, the app waits and replays it for you; in the rare case it still can't\r
get through you'll see "the database is busy… try again in a moment", and\r
clicking again is all it takes. Your decision is never partially applied.\r
\r
**🎨 Curate down to the right subset.** Culling removes the bad shots; curation\r
picks the *good* subset — and it's most of what makes a LoRA good. Once **✨\r
Score** has run (the default CLIP semantic index), or the Bank's optional\r
**SigLIP 2 semantic index** is ready, the **Curate** row under the selection bar\r
offers two selectors that cost no extra inference:\r
\r
- **🎨 Pick diverse** — enter a number and it selects the images that best\r
  *cover the variety* of what you're looking at (varied angles, outfits, scenes),\r
  instead of that many near-identical frames. It's the antidote to a dump of\r
  4 000 shots of the same pose: ask for 60 and you get 60 that actually differ.\r
  **Skip the odd ones out** (the slider under the number) is why they are the\r
  *right* 60. "Most varied" is computed as "farthest from everything already\r
  picked", and the image that is farthest from everything in a collected bank is\r
  usually not a nice unusual shot of your subject — it's the meme, the screenshot,\r
  the botched frame, the one photo of somebody else. The slider discounts an image\r
  for being *alone in the bank*: at the default **50%** an image that resembles\r
  nothing else has to be far more interesting than a normal one to earn a slot,\r
  and at **100%** it is all but excluded. It never works the other way round —\r
  anything as typical as the median of the bank is left completely alone, so this\r
  cannot turn your 60 into 60 look-alikes. Set it to **0** for the pure-coverage\r
  behaviour the button had before this setting existed. On a very large bank the\r
  first click takes a few seconds (it reads every image's neighbourhood once);\r
  the button says *Sampling…* while it does.\r
- **⚖ Balanced pick** — see [Pick a balanced set](#pick-a-balanced-set) below: the\r
  same sampling, but spread evenly over your **framings** instead of taken off\r
  the top of one ranking.\r
- **🎯 Similar to selected** — select **one** image as a reference, and it ranks\r
  everything by how much it looks like that image and selects the closest N — the\r
  fast way to pull one person or one look out of a mixed export.\r
\r
Both honour whatever filter and 🔍 search are active ("the 60 most diverse of\r
*this* subfolder"), and both just **select** — the images light up and you review\r
them with the same ✓ Keep / ✕ Reject / ⬆ Promote bar. Nothing is auto-kept or\r
deleted, so a selection you don't like costs one click to clear.\r
\r
**📐 Classify framing** tags every non-rejected image by *shot type* — face\r
close-up, bust, full body or back view — using the same detector the datasets\r
use. The result becomes a row of **📐 Framing** filter chips (compose with every\r
other filter and search), so balancing a character set's angles is a couple of\r
clicks. It's a GPU vision pass; add it to **🚀 Launch all** to have it run\r
overnight with the rest.\r
\r
**📊 Coverage advice** (idea by [@antonp](https://github.com/perfectgf/lora-dataset-studio))\r
is a read-only panel next to the Curate row. From what you've **kept** (or every\r
non-rejected image before you've kept anything), it says in plain sentences what\r
leans and what's thin for a good LoRA — *"70% face shots, add body/back"*,\r
*"person #1 is 60% of the set — one subject or a mix?"*, *"only 8 kept, most\r
families want 20+"*. It's **advice only** — nothing is kept or rejected — and\r
pure maths on data the passes already computed, so it costs no GPU. The\r
framing-balance line needs the 📐 Framing pass to have run; without it the panel\r
still covers person mix, style spread and resolution and hints to run framing.\r
\r
Those are all **labels**, and labels have a blind spot: they cannot tell two\r
hundred near-identical shots from two hundred different ones, and they say\r
nothing about outfits, lighting or camera angle. Two things you may already have\r
on disk can, so the panel also reads them when they exist:\r
\r
- **Visual spread**, from the Bank's selected semantic index. It reports\r
  the average similarity across the pool — *"91% average similarity — a set this\r
  repetitive teaches one look"*. The bands were calibrated by measuring real\r
  banks: an ordinary one sits near 65%, an image plus its nearest neighbours\r
  lands around 79-90% with CLIP. SigLIP 2 has its own score distribution, so LDS\r
  shows its measured similarity but deliberately gives it no *varied/alike* band\r
  until that engine has been calibrated on real Banks. Without the selected index\r
  it says **Not measured** — never "varied", because nothing looked.\r
- **Caption variety**, from the captions the 🏷️ pass wrote, read by the same\r
  lexicon the dataset Coverage panel uses. It reports which camera views,\r
  lightings, settings, outfits and expressions your captions mention and which\r
  they never do.\r
\r
Both limits are on the panel, not just here. The caption read looks at **words,\r
not pixels**: a profile shot the captioner never called a profile is invisible,\r
and *"not smiling"* still counts as a smile. A bank has no character/concept/style\r
kind the way a dataset does, so it is judged as a **character source** — the same\r
assumption the framing target and the person-mix advice already make.\r
\r
The advice becomes a gesture with **⚖️ Pick a balanced set** at the bottom of\r
the panel — see [Pick a balanced set](#pick-a-balanced-set).\r
\r
**🗑 Delete rejected from disk** (next to Promote) is the one exception to the\r
"your source folder is never modified" rule, and it's opt-in. Once you're happy\r
with your triage, it removes every image you marked ✕ rejected from its source\r
folder — the actual files, not just the status. It asks you to type **DELETE**\r
first, and tells you where the files will go before you confirm: your OS trash\r
when [\`send2trash\`](https://pypi.org/project/Send2Trash/) is installed, the\r
app's own Trash otherwise (recoverable until you empty it from Settings), and a\r
permanent delete only when neither can take the file. Kept and undecided images\r
are never touched, and a file it can't remove (locked, read-only) is reported\r
and left alone rather than aborting the batch.\r
\r
It runs as a normal bank pass: the confirmation closes straight away and the\r
progress bar at the top of the bank counts the files as they go, with a **Stop**\r
that takes effect between files. Stopping is safe — whatever already left the\r
disk has left the bank too, and the rest are still marked ✕ for a second run.\r
\r
⚠️ A bank doesn't own its folder, so two banks can point at nested folders and\r
list the **same files**. That's harmless while you triage — decisions live on\r
the bank — but deleting from disk in one bank removes those files from the other\r
too, along with every decision you made on them there. The app says so when you\r
create such a bank, and the confirmation names the other bank and how many of\r
its files are about to disappear.\r
\r
**🚀 Launch all** does the whole funnel for you in one go. Tick which passes\r
run and how auto-reject behaves, hit Go, and walk away — it chains *scan →\r
auto-reject → score → find watermarks → group by person → classify framing →\r
(optional) caption* in that exact order. Auto-reject starts with only\r
**≈ Duplicates** on (keep the best, reject the rest); Blurry / Noisy / Flat /\r
Small are there, off, so an overnight run does not bin soft or plain shots\r
unless you tick them. Two things make it safe to run overnight: a pass whose\r
tool isn't installed, or a moment when the GPU is busy with a training run, is\r
**skipped with a reason** instead of failing the whole run; and because\r
auto-reject runs *before* the heavy passes, scoring/watermarks/person only ever\r
process the survivors, never the images you just rejected. Captioning is the one\r
pass left **off by default** (it's the slowest GPU pass and a clean-up run\r
rarely needs a description on every shot). Stop it any time — and when you come\r
back, a saved report at the top of the bank tells you exactly what ran, what was\r
skipped and why, with the headline counts.\r
\r
**Running it on another machine.** The **Run on** picker at the bottom of the\r
dialog sends the heavy passes to a joined compute peer: ✨ Score, 👥 Group by\r
person, 🚩 Find watermarks, 📐 Classify framing and 🏷️ Caption can all travel.\r
🔎 Scan, 🧹 Auto-reject and ✂ Find crops & variants never do — they read this\r
machine's database and embeddings cache, so sending them would be slower.\r
\r
**Each bank card says what has been done to it.** A row of pass badges shows a\r
muted glyph for a finished pass and an amber one with a count for what is left —\r
so "has this bank ever had a face pass" is answerable without queueing one to\r
find out. **Queue all banks** now uses the same answer twice: a bank is eligible\r
when a *selected* pass still has work (a fully triaged bank that was never\r
face-passed used to be invisible to it), and each bank is queued only with the\r
passes it actually needs. A bank with nothing left is skipped by name, with the\r
reason. Two passes are never treated as done — 🧹 Auto-reject is cheap and just\r
re-applies the current flags, and ✂ Find crops & variants is bank-global with no\r
cheap per-image answer, so both always run rather than guess.\r
\r
**Work already done is not done twice.** ✨ Score and 👥 Group by person keep an\r
embeddings cache per bank, and that cache now travels: the other machine is sent\r
what this one already has, so it only computes the rest — and the images it\r
already covers are not uploaded at all. An image edited since it was scored is\r
sent again, because its signature no longer matches. Pressing **Stop** on a\r
remote pass now waits a couple of minutes for the other machine to hand back\r
what it finished, and the bank says how much was kept; relaunching carries on\r
from there rather than starting over. If it has already gone offline, the pass\r
stops with nothing kept and says so.\r
\r
The **Analysis passes** row inside a bank has its own **Run on** picker, so\r
clicking ✨ Score, 👥 Group by person, 📐 Classify framing or 🏷️ Caption on its\r
own goes to the same machine Launch all would use. It remembers its choice\r
separately from the watermark panel further down the page. That panel carries\r
**two** pickers, because it asks two different questions: **Level 1 scan** picks\r
the machine that looks for watermarks (a vision pass, like the others), while\r
**Level 3 engine** picks the machine that *renders* the Klein repaint — which\r
can be a bare ComfyUI backend that could not run a vision pass at all. Level 2,\r
the crop, is local file work and never travels.\r
\r
Each of the five travels **only if that machine reports the stack for it**. Pick\r
a peer and the passes it cannot run are greyed out, unticked and unclickable,\r
each saying what is missing — a peer with Ollama but no scoring extra offers\r
framing, watermarks and captions but not Score. Pick **this machine** again and\r
they become selectable. Captions follow the same rule: with a peer selected they\r
run there or not at all, on whichever captioner that machine has (JoyCaption if\r
it has it, otherwise Ollama). Queueing refuses the same combination, so a screen\r
left open since before the peer changed gets a message rather than a run that\r
fails an hour in. A peer that has joined but not checked in yet is still\r
offered — it only gets a note saying it hasn't reported what it can run.\r
\r
Got several banks to clean? Instead of babysitting them one at a time, open a\r
bank's Launch-all dialog from the Banks page and choose **Add to queue**. The\r
**Launch-all queue** works through the banks one at a time **on each machine**,\r
each one waiting its turn for the GPU rather than failing when another bank — or\r
a training run — is using it. A panel on the Banks page shows what's running and\r
what's lined up, names the machine each bank will run on, and lets you cancel a\r
bank or clear the whole queue. Queue three exports before bed and they'll be\r
triaged by morning.\r
\r
**One lane per machine.** Everything aimed at this computer runs strictly in\r
order — two banks never share the graphics card. A bank you sent to a compute\r
peer gets its own lane and runs *alongside* local work instead of behind it,\r
which is the whole reason to have a second machine. One lane per peer, no more:\r
a peer takes one job at a time, so a second lane would just queue over there\r
where this panel cannot see it.\r
\r
Two banks that share a name are **one card**, and the queue keeps them one: however\r
they are spread across machines, only one of them ever runs at a time. A single\r
card cannot honestly show two different states at once.\r
\r
**⏳ Queue all N bank(s)…** does the whole library in one gesture. It picks every\r
bank with work left for a pass you ticked, asks which passes to run, and adds one\r
queue entry per bank — carrying only the passes that bank actually needs. A bank\r
with nothing left is skipped by name, with the reason. The old rule was "has\r
undecided images", which hid a fully triaged bank that had never been\r
face-passed — exactly the bank worth re-targeting. Untick **skip passes a bank\r
has already had** for a deliberate re-run; that also widens the selection back to\r
every bank. It **queues**; twelve banks never become twelve runs — at most one\r
per machine is going at a time.\r
The confirmation says so with the count, and every bank is still cancellable\r
from the queue panel. A bank already in the queue is skipped by name rather than\r
counted twice.\r
\r
**And you will be told if the night was wasted.** A queued run that could not\r
take the GPU skips its passes and finishes anyway — which used to look exactly\r
like a clean run from the bank list. Each card now carries the verdict of its\r
last 🚀 Launch all when there is one worth carrying: *"2 passes skipped"* or\r
*"1 step failed"*, with the reason on hover. A clean run shows **nothing** — a\r
tick on every card only makes the one card that needs attention harder to find.\r
The distinction is deliberate: a pass that declined itself for a stated\r
prerequisite (semantic de-dup wanting ✨ Score first) is the pipeline working as\r
designed and is not flagged; a pass the machine refused ("GPU busy", never\r
reached) is. When the queue empties, one line says how many finished and how\r
many had problems.\r
\r
## Choosing where a bank pass runs\r
\r
Every pass button in the bank ends in \`…\` and opens a **launch window** before\r
anything runs. The window is not a settings panel — it says three separate\r
things, and keeping them apart is the point.\r
\r
**This run — where it applies, and how big that is.** Five lines, and each one\r
quotes the number of images *that pass* would actually walk:\r
\r
| Line | What it means |\r
|---|---|\r
| Kept + undecided | What every pass has always run on. The default; picking it sends exactly the request the app sent before this window existed. |\r
| ✓ Kept only | The images you already decided to keep. |\r
| Undecided only | The ones you have not ruled on. |\r
| ✕ Unkept only (the bin) | Images you rejected. Nothing is deleted or un-rejected — but the run spends its time on shots you set aside, and the window says what that costs for this particular pass. |\r
| All three, the bin included | Everything. |\r
\r
If you have images **selected**, that becomes the first line and wins by\r
default — the pass runs on your selection, narrowed by what it still has to do.\r
It says *"up to N"*, never a bare N, because the server intersects your selection\r
with the pass's own pool and the run can only ever be shorter.\r
\r
Under those lines sits the **"do it again"** tick: *also re-measure images that\r
were already scanned*, *throw the cached embeddings away*, and so on. This is\r
where the old **Rescan all** and **Rescore all** buttons went. They were never\r
separate passes — they were this scope, wearing a button's clothes — so they now\r
sit next to the pool they re-run, unticked, with their price written next to\r
them.\r
\r
**Settings this pass reads.** Only what the *calculation* consumes, with where\r
each value lives. 🔎 Scan quality, for instance, reads exactly one of the twelve\r
🎚 filter thresholds (\`dup_distance\`), and it reads it for the duplicate grouping\r
at the end — not for the measuring.\r
\r
**Not decided here.** The knobs that only change how the grid is **sorted and\r
flagged**. Those re-apply the moment you save them, with no pass at all. The\r
sharpness, noise and aesthetic thresholds live here: nudging one costs you\r
nothing.\r
\r
Three passes **refuse a partial scope**, and the window shows the option greyed\r
out with the reason rather than hiding it: **✨ Score**, **👥 Group by person**\r
and **✂ Find crops & variants** each produce one numbering of the *whole* bank,\r
recomputed from scratch on every run. Handed a slice, they would number that\r
slice from 1 and land those ids on top of unrelated groups already saved.\r
\r
Two things the scope does **not** cover, stated in the windows that need it:\r
🔎 Scan's duplicate grouping always covers the whole bank (it works from stored\r
hashes and renumbers them together), and 🎨 Classify medium also runs chained\r
inside ✨ Score with the default scope.\r
\r
A run with **nothing to do** is refused before it starts, with the reason and a\r
suggestion — not launched and then reported as a success.\r
\r
**The two watermark cleaning levels take the same scope**, and they are the two\r
where it matters most: ✂ **Auto-crop** and 🧽 **Repaint** are the only actions on\r
this page that produce a new image file. Their windows list the same five lines,\r
with one difference — their pool is not a pile but *the flagged images carrying a\r
usable mark*, so a scope narrows that set and can never widen it. The count on\r
each line is the pool the level **walks**; ✂ then crops only the marks that sit\r
in a border band, which is the narrower number written on the button itself.\r
Both windows state what is reversible before you start: your own files are never\r
written to, the cleaned pixels live in the bank's own copy, and ↩ **Undo\r
cleaning** deletes those copies and re-flags the images. Undo is bank-wide rather\r
than per run, and two things are out of its reach — an image you already promoted\r
(that copy was written into the dataset) and an image whose source file changed\r
on disk since the clean.\r
\r
## When a folder is already one person\r
\r
Scraped material usually arrives sorted: one folder per person. **👤 Group by\r
person** does not know that, so it pays one face embedding per image to\r
rediscover what the folder name already said — thousands of inferences for an\r
answer you had before you started.\r
\r
Scope the grid to a folder with the **Subfolder** picker and the panel under it\r
offers **👤 Single person here**. One click groups every image of that folder as\r
one person, instantly, with no pass at all — and the next 👤 Group by person run\r
**skips those images entirely**. That skip is the saving: on a bank of 9 000\r
images where 8 000 sit in asserted folders, the pass embeds 1 000.\r
\r
It is a rule, not a stamp. It survives re-scans, and an image you drop into the\r
folder tomorrow joins the group the moment the bank sees it. It is also\r
reversible at any time — **↩ Not one person after all** dissolves the group and\r
puts the folder back in the way of normal clustering. Nothing is deleted either\r
way.\r
\r
**Check a sample (15 images)** is the honest counterweight. It picks about\r
fifteen images spread across the whole folder (not the first fifteen — those are\r
usually one shoot), embeds *only those*, and compares them at the same\r
similarity threshold the clustering uses. You get either *sample consistent\r
(14/15 same person)* or *2 different faces in the sample — check this folder*.\r
Two limits, stated plainly: fifteen images cannot prove a folder is clean, only\r
that the sample looked one way; and whatever it finds, **your assertion stands**\r
until you revoke it. It informs, it never overrules you.\r
\r
Images in the folder that the face machinery could not read — no face in frame,\r
a face too small or too turned — are listed as *worth a look*. They stay in the\r
group: "I could not see a face here" is not "this is someone else".\r
\r
### The app asks the question for you\r
\r
You should not have to guess which of your forty folders are worth declaring, so\r
the same sampling runs by itself and **suggests**. A folder it sampled and found\r
consistent gets a **👤?** next to its name in the Subfolder picker, and scoping\r
to it says *Looks like one person (15/15 of the 15 sampled) — assert?* next to\r
the button. A folder holding several people says so too, which is just as useful.\r
\r
**It suggests. It never asserts.** Confirming is always the same single click it\r
always was. This is deliberate: a wrong assertion made silently would corrupt\r
your person grouping with something you never said, and you would have no reason\r
to go looking for it.\r
\r
It runs in three places, and the difference is when you are asked:\r
\r
- **as the preflight of 👤 Group by person** — the default path, described in the\r
  next section. You are asked at launch time, before the expensive pass runs.\r
- **automatically at the end of 👤 Group by person** — free. That pass has just\r
  cached an embedding for every image, so sampling every folder adds no\r
  inference at all and no GPU time. The pass's line then ends with *N folder(s)\r
  look like a single person*.\r
- **on demand, with 🔎 Scan folders** — a secondary path now, for asking well\r
  before you launch anything. This one pays about fifteen embeddings per folder,\r
  so it says how many folders it will cover before you click, and covers the\r
  twenty biggest first when there are more. It tells you what it did not reach\r
  rather than leaving you to assume the rest are not one person.\r
\r
A suggestion expires when the folder changes. If images arrive or leave, the\r
verdict no longer describes what is in front of you, so it is dropped and the\r
folder goes back into the queue instead of advising you from stale evidence.\r
\r
## Checking your folders before the person pass\r
\r
Everything above used to be reachable only from the Subfolder panel — and the\r
first thing anyone does with a fresh bank is press **🚀 Launch all**, so they\r
never opened it and paid the full face pass over forty folders that each held\r
one person. A saving the default path walks past is not a saving.\r
\r
So the sampling now runs **as the preamble of the pass itself**. Press **👥 Group\r
by person**, or **🚀 Launch all** with the person pass ticked, and before\r
anything expensive starts the bank samples about fifteen images in each\r
subfolder it has not been told about, then asks you once:\r
\r
> **12 folders look like a single person** — treat each as one person and skip\r
> their full analysis.\r
\r
Those twelve are **already ticked**. One click on **👤 Group 12 folders & analyze\r
the rest** confirms them and starts the pass you asked for; untick any you\r
disagree with; **👥 Analyze everything anyway** is right there and states its own\r
cost. It is still an offer, never a decision — a wrong grouping made silently is\r
one you would have no reason to go looking for.\r
\r
Four things the dialog always tells you:\r
\r
- **what the check costs, against what it saves** — *Checking 12 folders (~15\r
  images each — 180 in all, up to 720 where faces are hard to find), against the\r
  7 316 this pass would embed.*\r
- **what ticking the boxes spares** — *3 412 images are grouped instantly and\r
  skipped by the pass.*\r
- **why a folder is not offered** — *3 different faces in the sample — analyzed\r
  in full*. A doubtful folder is never quietly ticked.\r
- **what it did not reach.** The preflight covers up to 200 folders in one go.\r
  Beyond that it says *N folders were not checked (biggest first) — they get the\r
  full analysis*, because silence there would read as "the rest are not one\r
  person".\r
\r
### When the sampled images have no face in them\r
\r
Scraped folders are full of crops, backs, distant shots and blur. A sample of\r
fifteen can land entirely on those, and until recently that ended the folder's\r
story: *only 0 of 15 sampled images had a usable face — analyzed in full*. On a\r
3 546-image folder that meant fifteen embeddings spent for no answer at all, and\r
then the whole pass anyway — exactly the cost the check exists to avoid.\r
\r
A draw that cannot be read is now **replaced**. The check keeps drawing new\r
images — never one it has already tried, still spread across the whole folder —\r
until it has about fifteen images with a usable face, or until it runs out of\r
**budget**. That budget is the point, because "keep drawing" without one is the\r
full pass by the back door. It is the smaller of two numbers, per folder:\r
\r
- **at most 60 images** — fifteen usable faces at a hit rate of one in four,\r
  which is the worst rate still worth chasing;\r
- **at most a quarter of the folder** — so a small folder is never nearly\r
  analysed in full just to be described. Folders of 60 images or fewer keep the\r
  single draw they have always had.\r
\r
That cap is also why the check can never quietly become expensive: a quarter of\r
a folder is a quarter of what analysing it would cost, and the dialog prints the\r
ceiling next to the typical cost before you start.\r
\r
Three ways it can end, and each says which one it is:\r
\r
- **enough usable faces** — the verdict you already know: *15/15 of 30 sampled\r
  images look like the same person.*\r
- **the budget ran out with a few** — *looks like one person, on thin evidence —\r
  only 6 usable faces in 60 images tried.* It is still offered and still\r
  pre-ticked, because the bar for an offer has always been two agreeing faces and\r
  six is more evidence than two, not less — but the row says what it rests on so\r
  you can weigh it.\r
- **almost nothing readable** — *no readable face in 60 images tried across the\r
  folder — crops, backs or blur.* This is not the check failing; it is what the\r
  folder is. **The full pass will not do better on those images**: the preflight,\r
  the folder check and the pass all drive the same detector at the same\r
  thresholds, and the check writes its answers into the pass's own embedding\r
  cache, so the pass reads them straight back rather than looking again. Grouping\r
  by face simply has little to grip in that folder, and much of it will stay\r
  ungrouped whatever you run.\r
\r
If there is nothing to ask — a bank with no subfolders, or one whose folders you\r
have already declared — no dialog appears at all and the pass starts straight\r
away. And whatever you accept here is an **ordinary assertion**: it survives\r
re-scans, adopts images that land in the folder later, and **↩ Not one person\r
after all** undoes it exactly as if you had clicked it by hand.\r
\r
While the check is running you can stop it with **👥 Analyze everything anyway**;\r
it lets the sampling go and launches the full pass.\r
\r
## Pick a balanced set\r
\r
Advice is only half the gesture, so **📊 Coverage advice** ends with **⚖️ Pick a\r
balanced set** (the same button sits in the **Curate** row). It answers a\r
question no per-image score can ask: *does my set cover what I want to be able to\r
generate?*\r
\r
Ask **🎨 Pick diverse** for 20 images out of a bank that is 47% full body, 35%\r
bust, 12% face and 6% back views, and you get roughly those proportions — on a\r
synthetic reproduction of exactly that shape it returned **0 face shots and 0\r
back views**. The LoRA then renders one shot type well and the rest badly, and\r
nothing ever said so. **⚖️ Balanced pick** returns **5 face, 5 bust, 5 body, 5\r
back** out of the same pool, each bucket filled with the *same* most-varied\r
sampling — and the same **Skip the odd ones out** guard — that 🎨 Pick diverse\r
uses.\r
\r
- **Balance on** — **Framing** by default. It is the axis that carries real\r
  information: on a one-subject bank, person groups are sparse and split into\r
  many small, arbitrary clusters, so balancing on them spreads a selection over\r
  noise. **Framing × person** is there for a dump that genuinely holds several\r
  subjects.\r
- **When an axis can't be satisfied**, it says so instead of quietly filling the\r
  gap: *"Only 3 back images exist in this filter — an even split wanted 15"*. The\r
  freed picks go to the buckets that have room, so asking for 60 still gives you\r
  60 — the deficit is reported as a number, never hidden. If even that isn't\r
  enough, it says how many you actually got and why.\r
- **The result is always stated** — *"Selected 60 of 60 requested, spread over\r
  framing: 15 face, 15 bust, 15 body, 15 back"* — as text, per bucket, next to\r
  what each bucket had available. There is no chart you have to read.\r
- **An unlabelled bank is the normal state**, not an error. Nothing has a framing\r
  until the 📐 Framing pass has run, so the button says which pass is missing and\r
  how many images it would bring in, rather than returning an empty or misleading\r
  selection. 🎨 Pick diverse keeps working without it.\r
\r
Like the other selectors it honours the current filter and search, and it only\r
**selects** — nothing is kept, rejected or deleted.\r
\r
## Is this image really what it says it is?\r
\r
Two things a file will happily lie about, both measured by the ordinary\r
**🔎 Scan quality** pass — plain CPU work, no extra install, no GPU.\r
\r
**Its size.** An image enlarged from 512 px to 2048 px still *reports* 2048, so\r
it walks into a dataset as a high-resolution shot and the LoRA learns\r
interpolated mush. The scan measures how far real detail actually goes and says\r
it in pixels on the image's details line: *"2048 px stored · ~512 px of real\r
detail"*. The worst offenders sit behind the **🧇 Soft detail** filter chip,\r
and *Settings → Captioning & quality → Real-detail minimum* moves the bar.\r
\r
Treat it exactly like the sharpness score: **a shortlist, not a verdict.** A\r
photo with motion blur, a portrait with the background thrown out of focus, and\r
a heavily denoised phone shot all genuinely lack fine detail and all read the\r
same way as an enlargement — which is fine for choosing training images (a LoRA\r
learns as little from either), but it is not proof the image was ever resized.\r
Look before you mass-reject. Two honest limits: a *nearest-neighbour* enlargement\r
is invisible to it (blocky pixels are real high-frequency detail), and large\r
enlargements are under-stated, so the pixel figure ranks images rather than\r
recovering the original file's size.\r
\r
**Where it came from.** The scan reads the file's own metadata and sorts the\r
bank with the **🔎 Origin** chips:\r
\r
- **🤖 AI** — the file still carries generation metadata: a ComfyUI workflow\r
  in the PNG, A1111-style \`parameters\`, or the C2PA/XMP "generated" marker the\r
  commercial generators write. Certain when present.\r
- **📷 Camera** — the file still carries camera EXIF (make, model, exposure).\r
  Strong evidence it was actually photographed.\r
- **❔ Unknown** — nothing left to read. **This is the normal answer**, not a\r
  failure: scrapers, chat apps and social networks strip metadata on sight (on a\r
  36 000-image Telegram export, *every single file* landed here). It is not\r
  evidence the image is a real photo, and it is not evidence it is AI — it is\r
  the absence of evidence, which is why it is its own answer instead of being\r
  quietly folded into "not AI".\r
\r
On an image whose metadata is gone, the details line may add a *hint* when the\r
dimensions are a standard generator size (1024×1024, 832×1216, 896×1152…) and\r
there is no camera EXIF. It says it is a hint; plenty of crops and downloads\r
land on round numbers too.\r
\r
Two smaller facts come free with the same pass: **🎞 Black bars** flags flat\r
letterbox/pillarbox padding (video screenshots, stills padded into a square,\r
which survive a training crop), and the **JPEG quality** of the last save is\r
shown as-is — a low figure means the file has been through a re-encoding\r
pipeline, but it is far too common to be worth a filter.\r
\r
A bank you already scanned picks all of this up on its next **🔎 Scan** — the\r
pass re-visits the images that predate these measurements on its own. You do not\r
need a full rescan.\r
\r
## Sort a bank by medium and by head angle\r
\r
Two more ways to slice a big dump, both built on passes you have already paid\r
for.\r
\r
### 🎨 Medium — what the picture is *made of*\r
\r
**🎨 Classify medium** sorts every scored image into **📷 Photo**, **🅰 Anime**,\r
**🧊 3D render**, **🖌 Illustration** — or **❔ Unsure**. It reads the CLIP\r
embedding the **✨ Score** pass already computed, so it looks at no image twice,\r
downloads nothing, and never touches the GPU. On a 23 000-image bank it finishes\r
in seconds. An image ✨ Score has not reached has no embedding and stays\r
unclassified; the row says how many.\r
\r
**You no longer have to ask for it.** Because it costs nothing beyond what\r
✨ Score already paid, it now runs **automatically at the end of every ✨ Score\r
pass**, and the pass's own line reports it (\`· 🎨 Medium: 812 classified\`). If\r
the CLIP text encoder is missing, the line says *skipped* and names the reason\r
rather than staying quiet. The **🎨 Classify medium** button is still there: it\r
is how you re-run the pass on its own, and how you re-classify images that\r
already carry a verdict — something the automatic run never does, so a verdict\r
you are looking at is never rewritten behind your back.\r
\r
This is **not** the same question as **🔎 Origin** above. Origin reads the\r
*file's metadata* and answers "who made this file". Medium reads *the picture*\r
and answers "what does it look like". A photorealistic AI portrait is 🤖 AI and\r
📷 Photo at the same time; a scanned manga page is ❔ Unknown and 🅰 Anime.\r
Neither is evidence for the other.\r
\r
**What it is worth, measured.** On a real 23 532-image bank, against 167 images\r
labelled by hand:\r
\r
- photograph verdicts were right **90 out of 90** times;\r
- both real anime drawings in the sample were found;\r
- every 3D render and illustration in the sample came back **Unsure**.\r
\r
That last line is the honest shape of this feature. The bar for a non-photo\r
verdict is deliberately six times higher than for a photograph, because the\r
model reads a picture's *subject* as much as its medium: a photo of somebody\r
**cosplaying** an anime character scores as anime. At a lower bar the "anime"\r
pile filled with cosplay photographs and the "3D render" pile with advertising\r
banners. So the pass answers **Unsure** rather than guessing, and the row prints\r
how big that pile is instead of hiding it. Sort by **🎨 Medium confidence ↑** to\r
put the images it nearly could not call in front of you.\r
\r
### ⤢ Angle — where the head is pointing\r
\r
The **🎭 Person groups** pass estimates a head pose while it works. The **⤢**\r
chips turn that into **😐 Frontal** (turned less than 20°), **◑ Three-quarter**\r
(20–60°), **👤 Profile** (more than 60°) and **🔙 From behind**.\r
\r
Two limits worth knowing before you trust a count:\r
\r
- **Profile is under-counted.** A head turned far enough that one eye disappears\r
  often defeats the face detector outright, and an image with no detected face\r
  has no angle at all. The profiles you see are the ones that were still\r
  detectable.\r
- **From behind needs two passes.** It is the crossing of "no face found" with\r
  "the **📐 Framing** pass called it a back view" — because *no face* on its own\r
  is also what a landscape with nobody in it looks like. Without the framing\r
  pass this bucket stays empty rather than claiming a person is there.\r
\r
**If your bank was scanned before this shipped**, its faces have no angle: older\r
builds measured the pose, used it once and threw it away, and the number is not\r
recoverable from what was stored. The ⤢ row then offers to measure them, tells\r
you how many there are and roughly how long it will take on your machine, and\r
does nothing until you click. It re-runs the face detector on those images only,\r
writes nothing but the angle, and leaves your person groups exactly as they are.\r
\r
## Set the bank filters from a sentence\r
\r
At the top of **Triage**, **🗣 Describe the set you want** takes a plain request —\r
\`an amateur photo set, least polished first\` — and moves the bank's own controls:\r
medium, quality flags, resolution tier, sort. The chip counters below then say,\r
measured, how many images that lands on.\r
\r
The model never looks at your images and never chooses any. It reads the sentence\r
and nothing else, so a wrong reading costs you one glance at chips you can edit,\r
not a silent selection you would have to trust. Everything it proposes lands in the\r
same filters a click would set, and clearing them is the same gesture as always.\r
\r
It answers over what your bank has actually measured. The real per-value counts go\r
to the model with the request, so it cannot reach for a bucket that holds nothing.\r
\r
**It says when it cannot.** Asking for what is *in* the pictures — \`women\r
outdoors\` — has nowhere to land while captions cover a small fraction of a bank\r
and framing almost none of it. That part of the request comes back as *not\r
expressible here* rather than as a filter that would return a few thousand\r
convincing, unrelated images.\r
\r
**It will not turn an exclusion into a search.** The ranker returns *more* of a\r
negated thing, not less (\`a woman without a bikini\` measured 60% bikinis against a\r
10.1% baseline), so \`without a watermark\` is reported back to you instead of being\r
quietly sent. To guarantee an absence, use the word-exclude box.\r
\r
## Choose CLIP or SigLIP 2 for Bank semantics\r
\r
Each Bank has its own **Semantic engine** choice in **① Analyze**:\r
\r
- **CLIP** is the compatible default. Its index is the embedding cache already\r
  produced by **✨ Score**, so every existing Bank behaves exactly as before.\r
- **SigLIP 2** is optional. Install the pinned model once in **Setup ▸ Quality\r
  tools**, select it on the Bank, then explicitly build that Bank's semantic\r
  index. Selecting it never starts a scan or downloads a model by itself.\r
\r
The selected engine powers **Find by text**, **Similar to selected**, **Pick\r
diverse**, **Balanced pick**, visual spread/coverage and **Find crops &\r
variants**. The calibrated aesthetic head, NSFW score, visual-style groups and\r
**🎨 Medium** remain on CLIP regardless of this choice.\r
\r
CLIP and SigLIP 2 use separate, model-versioned caches and separate **same-shot\r
group partitions**. Switching swaps the visible partition but keeps both, so\r
returning to an engine restores its grouping instead of erasing completed work.\r
Both partitions and their exact cache entries travel with the existing analysis\r
snapshot on Bank → Dataset, Dataset → Bank and Bank → Bank copies; a changed\r
image fails the fingerprint check and is re-indexed instead of receiving stale\r
analysis.\r
\r
The SigLIP 2 index is resumable and stoppable like Score: completed entries are\r
written atomically, and a later launch pays only for missing, failed or changed\r
images. **Reindex SigLIP 2** rebuilds that cache only; it never touches Score.\r
\r
## Find bank images by describing them\r
\r
Under **Curate**, **🔤 Find by text** ranks images by how close they are to a\r
phrase you type — \`brunette outdoors, wide shot\`, \`red dress against a white\r
wall\`, \`close-up, harsh flash\`. It reads the Bank's selected semantic index:\r
the existing **✨ Score** cache for CLIP, or the separate index you explicitly\r
built for SigLIP 2. A search itself performs no image inference; searching while\r
a LoRA trains is fine.\r
\r
**It is a ranking, not a filter.** Every image scores *something* against every\r
phrase, so a result list always comes back full. The panel therefore reports the\r
similarity of the best and of the last result, and tells you how far apart they\r
are — *"all about equally close"*, *"the last ones are noticeably looser"*, or\r
*"the tail is much weaker than the top"*. That spread is the useful signal: it\r
says whether you can trust the bottom of the list.\r
\r
**Do not read those numbers as percentages, and do not compare engines by their\r
raw values.** The following measurements are specifically for the default CLIP\r
ViT-L/14 \`openai\` space, on a real bank (48 images from 8 unrelated datasets):\r
\r
| | Range |\r
|---|---|\r
| Top-1 results verified correct by eye | **0.177 – 0.233** |\r
| Guaranteed-unrelated image/phrase pairs | median **0.112**, up to **0.197** |\r
\r
So 0.22 is not "22% of a match" — it is roughly as good as this model ever gets.\r
\r
**And this is why there is no similarity slider.** Look at the two rows again:\r
the unrelated *ceiling* (0.197) is **higher** than two genuinely correct answers\r
(0.177 and 0.178). The distributions overlap, so no cut-off separates "relevant"\r
from "unrelated" — anything below ~0.20 lets false positives through, anything\r
above ~0.18 throws away true matches. A threshold control would be a knob on a\r
boundary that does not exist, so the app gives you a result *count* instead and\r
shows the ranking honestly.\r
\r
The app never compares your scores against those figures either. It measures\r
what a *typical* image of **your** bank scores for **your** phrase, and describes\r
the results relative to that — which is the only version of the question that\r
survives a different bank.\r
\r
**On a bank that is mostly one subject** — the normal case here — expect the\r
ranking to flatten. Images of the same person score 0.60–0.89 against *each\r
other*, far above any text score, and a query's ability to discriminate\r
compresses by 30–70%. The summary will say *"barely above what any image here\r
scores — the order is a hint at best"* when that happens. Believe it: at that\r
point the first result is not meaningfully better than the tenth.\r
\r
It searches **inside the current filter**, exactly like Pick diverse and\r
Similar to selected. So "wide shots, in this subfolder, among the undecided" is\r
just a filter plus a phrase; nothing needs a second search grammar. Results land\r
as a normal selection you review with ✓ Keep / ✕ Reject / ⬆ Promote — nothing is\r
kept or deleted for you. **Clear search** returns to the full grid.\r
\r
**Images missing from the selected index cannot be found by any phrase.** Rather\r
than letting them vanish, the summary counts them. Run **✨ Score** for CLIP, or\r
complete the explicit **SigLIP 2 index**, to include them.\r
\r
### What it is good at, and what it is not\r
\r
The default CLIP engine reads a picture as a whole. It is reliable for **subjects, styles, framing,\r
setting, materials and colour**, and unreliable for three things in particular:\r
\r
| Ask for | What you actually get | Measured |\r
|---|---|---|\r
| **Counting** — "two people" | Photos of people, any number. | On a two-person image, "two people" beat "one person" by **0.001** — pure noise. It separates "one" from "several" at best. |\r
| **Negation** — "without glasses" | *More* glasses, not fewer. | On a photo of an astronaut **wearing** a helmet: "with a helmet" **0.212**, "without a helmet" **0.217**, plain "an astronaut" **0.219**. The negation scored **higher** than the affirmation. |\r
| **Spatial relations** — "to the left of" | Both objects, in any arrangement. | — |\r
\r
The negation case is the one to remember, because it fails *silently and\r
backwards*: CLIP does not penalise "without", it simply ignores the word. Someone\r
searching \`woman without glasses\` gets women **wearing** glasses and has no way\r
to tell the search misfired. The same measurement on a 7,316-image bank: \`a\r
photo of a woman without a bikini\` returned **60% bikinis**, against a 10%\r
base rate — the query did not miss, it inverted. See **Push down** below.\r
\r
These are properties of the model, not bugs to report. Describe what *is* in the\r
frame rather than what is absent, check counting and left/right by eye — and for\r
the negation case, use the **Push down** field described next, because typing\r
"without" will never work.\r
\r
### Push down what you do not want\r
\r
The panel has a second field, **Push down**, for the trait you are trying to get\r
away from: \`hat\`, \`sunglasses\`, \`blonde hair\`. You can also write it inline in\r
the query with a leading dash — \`a woman in a car -hat\` means the same thing.\r
Typing a query that starts negating something ("a woman without a hat") offers\r
you the field instead, rather than letting the search fail quietly.\r
\r
It does **not** filter. The excluded phrase is encoded exactly like the positive\r
one and *subtracted* from each image's score, so images carrying that trait sink\r
in the ranking. They are still in the pool and one can still surface if it is\r
otherwise the best answer. If you need a guaranteed absence, that is a tag\r
filter's job, not this one.\r
\r
**How hard** offers Gentle / Normal / Strong. The default, Normal, was measured\r
over 7,316 real bank images that carry both a CLIP embedding and a written\r
description, across 19 query/exclusion pairs, counting the top 60:\r
\r
| How hard | Top 60 still carrying the unwanted trait | Top 60 still on-topic |\r
|---|---|---|\r
| off | 23.0% | 89.7% |\r
| Gentle | 11.9% | 89.5% |\r
| **Normal** | **7.6%** | **87.7%** |\r
| Strong | 3.8% | 79.8% |\r
\r
Pushing harder always removes more of the trait — what you pay for it is\r
relevance, and that stays essentially flat up to Normal (2 points) then drops\r
off a cliff (10 points at Strong, 25 past it). That is why Normal is the default\r
and why Strong is described as a trade rather than as "better".\r
\r
**Some pairs cannot be separated at all,** and the app says so instead of\r
pretending. Excluding \`a bikini\` from \`a woman at the beach\` barely moved: at\r
every usable strength two thirds of the results still had a bikini, because in\r
this model's eyes a beach photo largely *is* a bikini photo — and by the strength\r
that finally bit, the beach was gone too. After each search the summary reports\r
what actually happened on *your* bank: how many results the push-down brought in\r
that would not have been there, and how strongly the returned set still matches\r
the unwanted phrase compared with a typical image of the bank. When it changed\r
nothing, it says that too.\r
\r
One last caveat, seen in the same measurement: a result can be right on the broad\r
trait and wrong on the detail. A generic indoor query returned a genuinely indoor\r
shot that was not the *kind* of indoor scene the wording implied. Text search\r
brings the likeliest images to the front; the final call stays yours.\r
\r
### Why the first search takes a moment\r
\r
The text encoder is the other half of the selected image/text model. Loading the\r
default CLIP encoder costs about **ten seconds** on the CPU; SigLIP 2 also has a\r
one-time model load. The app keeps the chosen encoder warm after the first\r
search, then releases it when you close the panel or after the idle window.\r
Every phrase is cached under that engine's model key, so CLIP and SigLIP 2 text\r
vectors can never be mixed and re-typing one is free even after a restart.\r
\r
On a memory-tight machine you can set \`bank_scoring.text_search_idle_minutes\` to\r
\`0\`: nothing is ever kept warm, and each new phrase pays the ten seconds instead.\r
\r
## Choose who captions a bank, and which pile\r
\r
The 🏷️ **Caption** pass in ① Analyze has its own **Caption options** row, and\r
every control on it applies to **that run only** — your Settings stay the\r
default and are never rewritten from here.\r
\r
**Which pile gets captioned.** Three choices, and rejected images are in none of\r
them:\r
\r
- **Kept + undecided** — the default, and exactly what the pass always did.\r
- **✓ Kept only** — caption what you have already chosen, and nothing else. This\r
  is the cheap one: on a 20 000-image dump where you kept 300, it is 300 vision\r
  calls instead of 20 000.\r
- **Undecided only** — the opposite errand. Captions feed the 🔍 search and the\r
  🏷️ tag chips, so captioning the undecided pile is how you get *tools* to\r
  triage it with.\r
\r
Each option carries its own count, and the button quotes the number it is really\r
about to write. That number is **not** the size of the pile: images that already\r
have a caption are skipped, so a bank of 4 000 kept images can honestly offer\r
"Caption 12 kept". When everything in a pile already has a caption the button\r
says so and goes inert.\r
\r
**A selection wins.** Select images first and the scope select greys out: the\r
pass captions your selection, and the button switches to counting it. The server\r
would otherwise *intersect* the two, and "Caption 12 selected" could quietly\r
write 4.\r
\r
**Which engine, and which model.** Two more selects on the same row:\r
\r
- **Caption engine** — *Auto* is a chain, not a coin flip: JoyCaption drafts and\r
  Ollama covers whatever it missed. Forcing *JoyCaption only* removes the Ollama\r
  half rather than picking one of two.\r
- **Caption vision model** — any Ollama model you have pulled. It is only used\r
  when the engine can reach Ollama, and it is greyed out otherwise. A model\r
  configured elsewhere stays selectable even if it is not in the live list.\r
\r
This last one matters more than it looks. A captioner that describes plainly\r
visible things in evasive terms produces captions that are about something\r
slightly *other* than your images — and a LoRA trained on those learns to look\r
away too, with nothing in the output to reveal it. The captions read perfectly\r
well. That is the problem. If you caption NSFW material, pair the **Explicit**\r
register with an uncensored (abliterated) model; the app warns you when the\r
model it is about to use does not look like one.\r
\r
You can change the model between runs on the same bank. 🏷️ **Caption** never\r
rewrites anything: it only fills images that have no caption yet, so a second run\r
with a different model captions the rest, not the ones already done. To redo the\r
ones already done, see the next section.\r
\r
## Redo the captions of a bank with a different model\r
\r
🏷️ **Caption** skips images that already have a caption — which is what you want\r
until the day it isn't. Once a bank is fully captioned that button reaches zero\r
images and goes inert, and on a bank you captioned with a model you have since\r
decided was a poor one, "nothing left to caption" is the wrong answer.\r
\r
🔄 **Re-caption**, at the end of the **Caption options** row, is that answer. It\r
runs the same pass with the same engine, model, register and length you picked on\r
that row, on the pile the scope select names — and it **overwrites** the captions\r
that are already there.\r
\r
**It keeps the captions you wrote yourself.** Every caption now records who wrote\r
it — JoyCaption, Ollama, or you. "You" means: typed or corrected in a dataset's\r
caption box, changed by a find/replace across a dataset, or brought back as \`.txt\`\r
sidecars from another tool. That record travels with the text through\r
**Import to bank**, bank-to-bank copies, promotion back to a dataset, and backup\r
restores, so a caption you wrote in a dataset three steps ago is still recognised\r
as yours here. Re-caption skips those rows, exactly as the person pass skips a\r
subfolder you declared to hold one person.\r
\r
**It tells you three numbers before you click, and never merges two of them.**\r
The button quotes what it will rewrite (the pile, minus what it spares). The amber\r
line under the row breaks the rest apart: how many captions it *keeps* because you\r
wrote them, how many it overwrites **whose author was never recorded**, and how\r
many a model wrote. The confirmation repeats them. None is an estimate; they all\r
come from the same count the pass itself uses, so the figure on the button is the\r
number of images that change.\r
\r
**"Origin never recorded" is the one to read carefully.** Captions written before\r
the app started keeping track carry no author, and there is no way to work one out\r
after the fact. Those are re-captioned — sparing them would make this button do\r
nothing at all on any bank that already exists — so if you hand-wrote captions in\r
an older version, they are in that count. It is stated separately from the\r
machine-written ones for exactly that reason.\r
\r
**If you do want your own captions redone**, tick **"Also rewrite the N caption(s)\r
I wrote"** next to the button. It only appears when there is something to protect,\r
it is never pre-ticked, and the confirmation names it again.\r
\r
**There is still no undo.** The bank's ↩ Undo covers keep/reject decisions only;\r
it has never covered captions, and this change does not add one.\r
\r
**It works by pile, never on a selection.** With images selected the button goes\r
inert and says why: a selection can cover pages that were never loaded, so the\r
app cannot count how many of them already have a caption — and it will not run a\r
destructive pass on a number it cannot state. Clear the selection to re-caption a\r
pile. 🏷️ **Caption** still honours selections as it always did.\r
\r
## Review a bank one image at a time\r
\r
Filter chips and bulk actions clear the obvious trash, but the last call —\r
*is this shot good enough for the LoRA?* — is made one image at a time, and\r
squinting at a 140-pixel thumbnail is not how you make it. **▶ Review** (above\r
the grid) opens the images of the **current filter** full size, one\r
after the other:\r
\r
- **✓ Keep**, **✕ Reject**, **⏭ Skip** — each one saves and jumps straight to the\r
  next image. The keyboard is the point: **K** keep, **R** reject, **S** skip,\r
  **←/→** move without deciding, **Esc** to leave. A few hundred images go by in\r
  minutes.\r
- **⏭ Skip** decides nothing (the image stays undecided) but is not shown again\r
  in that run — it's "not now", not "no".\r
- **🎲 Random order** walks what's left in shuffled order instead of folder\r
  order. On a scraped dump of 3 000 photos, sequential order means 200\r
  near-identical frames in a row; random gives you a representative sample from\r
  the first click. Ticking or unticking it mid-run only re-orders what you have\r
  **not** seen yet — nothing you already judged comes back.\r
- Under the image, the facts the passes already computed (resolution, sharpness,\r
  aesthetic score, NSFW, quality flags, person and duplicate groups) so you can\r
  call it without leaving the lightbox.\r
- The counter is honest — *12 / 340* over the snapshot taken when you opened the\r
  review, so a decision that drops the image out of the filter can't make the\r
  run skip images or loop. Each decision is saved on the spot: close after fifty\r
  of them and all fifty are there.\r
\r
The ▶ button on a tile starts the same review **at that image**. A plain click\r
on a tile still selects it for the bulk ✓/✕/⬆ bar, so both ways of working stay.\r
\r
## Compare the copies of a duplicate group\r
\r
The **≈ Duplicates** and **✂ Same shot** filters replace the grid with one card\r
per unresolved group, and those cards used to offer three ways to settle a\r
group: *Resolve ALL — keep best*, *keep first*, or clicking one of the\r
thumbnails. The first two are verdicts you take on trust; the third asks you to\r
tell two copies of the same shot apart in a 96-pixel stamp. **⤢ Compare** — on\r
the group's card, or *⤢ Compare & pick* at the top for the whole list — opens\r
those same copies at a size where the choice can actually be made.\r
\r
- **Side by side** puts every copy of the group on screen at once, each as big\r
  as the screen allows. This is the view that settles *framing* — which one is\r
  cropped, which one has the shoulder in it.\r
- **⛶ Full screen** (**F**) shows one copy filling the frame, and **← →** flips\r
  between them *in the same frame*. That is the view that settles *detail*: the\r
  difference lands on the same pixels instead of asking your eye to carry it\r
  across a gap.\r
- **Under each copy, the numbers that separate them** — resolution, sharpness,\r
  aesthetic score, file weight — with the group's best value **lit**. The copy\r
  with nothing lit is the one that loses on everything. When two copies have the\r
  same dimensions *and* the same weight they are marked **≡ same file as 2**:\r
  they are the identical file, so keeping either keeps the same pixels.\r
- The cursor **opens on the copy the app elected** (the BEST badge), so **K**\r
  is "yes, that one" and moving off it is a deliberate disagreement. The badge's\r
  tooltip says what it wins on — or admits that nothing measured separates the\r
  copies and the tie-break was import order.\r
\r
The keyboard is the same grammar as ▶ Review, at the level this screen decides\r
at: **K** keeps the copy under the cursor and rejects the rest of its group,\r
**R** rejects only that copy and moves to the next (which is how a group of five\r
is worked down one obvious loser at a time), **S** skips the group without\r
deciding, **Esc** leaves. What is this screen's own: **← →** move between the\r
copies of a group, **1**-**9** jump straight to one, **⇧← ⇧→** move between\r
groups, **B** puts the cursor back on the app's pick, **F** switches the layout.\r
\r
A skipped group stays unresolved and is not shown again *in that run* — it is\r
"not now", not "no". When the walk runs out, the run refills itself from what is\r
still unresolved, so a bank with 300 duplicate groups is worked through without\r
going back to the list. Every verdict is saved on the spot, and the losers are\r
**rejected**, never deleted: the ✕ Rejected filter brings any of them back.\r
\r
## Say "these are not duplicates"\r
\r
Both grouping passes answer a question about pixels, and both are sometimes\r
wrong in the one direction you could not correct: a burst of frames, a series\r
shot on a tripod, two crops that a threshold called one picture. Every verdict\r
on offer ended in a rejection — *keep best*, *keep first*, a manual pick — and\r
**⏭ Skip** writes nothing at all, so the group came back on the next run, and the\r
one after that. The only ways out were to reject a photo you wanted, or to keep\r
saying "not now" forever.\r
\r
**≠ Not duplicates** (on the group's card, or **N** in ⤢ Compare) is the missing\r
answer. It keeps **every** copy, rejects nothing, and the group stops being\r
proposed.\r
\r
- **It decides nothing about the images.** They keep whatever status they had,\r
  kept or undecided, and they stay in every other filter. The claim is about the\r
  *relation* between two pictures, not about either one of them.\r
- **It survives a re-group**, which is the whole reason it works. Both passes\r
  renumber the entire bank from scratch on every run, so a verdict remembered as\r
  "group #7" would quietly apply to a different set of images next time. What is\r
  stored is the **pairs**: *this photo and that photo are not the same shot*.\r
  That sentence means the same thing before and after any renumbering.\r
- So a re-group that **splits** the group leaves it answered, and one that\r
  **adds a copy** asks you again — with the new copy on screen. A new member is\r
  a new question, and you were never asked about it.\r
- One answer covers **both stages**: ≠ on a ≈ Duplicates group also settles the\r
  ✂ Same shot group holding the same images. It is a fact about the pictures,\r
  not about which algorithm found them.\r
- **The way back is a line above the list** — *≠ N groups marked not duplicates\r
  — Put them back* — and it stays visible when marking the last group has\r
  emptied the panel, because an undo that vanishes with the thing it undoes is\r
  not an undo. Re-running *Keep best* on a group by name also overrides it: naming\r
  a group is ruling on it again, and you are allowed to change your mind.\r
\r
**One limit, stated plainly:** ≠ records a decision about every *pair* in the\r
group, so a group of 80 copies costs 3 160 of them. Above 80 it is refused, with\r
the reason — a group that size means the duplicate distance is too loose, and the\r
fix is the 🎚 threshold, not 3 000 stored verdicts.\r
\r
## Promote a shortlist out of a bank\r
\r
**⬆ Promote** has three destinations, and picking the right one saves you a mess.\r
\r
- **📁 An existing dataset** — the end of the funnel. The images are normalized\r
  to webp, deduplicated against what the dataset already holds, and become\r
  training material.\r
- **🆕 A new dataset** — the same door, for a dataset that does not exist yet.\r
  Give it a name and a trigger word and it is created on the spot, then filled.\r
  It is a **character** dataset with the usual defaults; concept or style, the\r
  target model and the fidelity all live in the dataset's own settings\r
  afterwards, so nothing is locked in by creating it here. If the trigger word\r
  is already used by another dataset you are told, but not stopped — two\r
  datasets may share one, and the app only refuses when both would train on the\r
  same base model. It is worth knowing early: that refusal arrives when you\r
  queue training, and renaming a trigger by then also renames its deployed LoRA\r
  and run folder.\r
- **🗃 A new image bank** — for when you are not there yet. A 9 000-image dump,\r
  200 candidates isolated out of it, and you want to keep working on those 200\r
  apart: give the new bank a name and the selection lands in it, **un-triaged**,\r
  with every bank tool available again (scan, dedup, framing, captions, review).\r
  Nothing is committed to training.\r
\r
With images selected in the grid, those are the ones that go; with nothing\r
selected, every **kept** image does.\r
\r
Whichever door you pick, the promotion runs as a background job **on the bank**,\r
so the progress bar stays on the page you clicked from — and if the bank turns\r
out to be busy with another pass, nothing is created at all: a dataset or bank\r
that was about to receive the copies is discarded rather than left behind empty.\r
\r
Either way this is a **copy**. Banks never share their files, deliberately: the\r
app rewrites images in place (a re-crop, a watermark clean), so two banks reading\r
one file would stop being two banks at the first edit. The dialog therefore\r
states, before you click, **how many megabytes** the copy costs — a measured\r
figure for that exact selection, not an average. For photographs it is usually a\r
footnote; the line is there for the day a bank holds something heavier.\r
\r
Your source bank is untouched by all this. It keeps every image, now marked ⬆\r
promoted, and your original folder is never written to — the copies live in the\r
app's own data folder, and deleting the new bank takes them with it.\r
\r
If the copy cannot be written — a full disk, a drive pulled out — the new bank is\r
**discarded** rather than left holding half the shortlist and looking finished.\r
You are told what happened and nothing has changed.\r
## Undo the last bulk decision\r
\r
A bank lets you mark hundreds of images with one click: select the whole filter\r
and press ✕, apply an auto-reject at a threshold, collapse every duplicate group,\r
or run 🚀 Launch all. That is the point of a bank — and it is also the click you\r
most want back when the threshold was wrong or the filter was not the one you\r
thought.\r
\r
After any of those, an **↩ Undo** bar appears above the grid saying what\r
happened and how many images it moved. Press it and every one of those images\r
goes back to exactly what it was: its previous ✓/✕/undecided state *and* the\r
reason it carried. Images the action never touched are not touched here either —\r
if you had already kept a photo by hand and the bulk reject flipped it, undo puts\r
it back to **kept**, not to undecided.\r
\r
The bar does not disappear on a timer, and it survives a page reload: the\r
decision it takes back lives in the app's database, not in your browser tab. It\r
stays until you use it, dismiss it, or run another bulk action.\r
\r
**Its limits, stated plainly.**\r
\r
- **One step.** Only the most recent bulk action is remembered. Run a second one\r
  and it replaces the first — this is a net under the click you just made, not a\r
  history of your session.\r
- **Until the app restarts.** The memory is in the running app. Restart it and\r
  the offer is gone; the decisions themselves are safely saved, as always.\r
- **It never over-claims.** If some of the images have left the bank since (a\r
  re-scan noticed the files were gone), or if you changed some of them yourself\r
  in the meantime — in ▶ Review, or in another tab — those are *not* overwritten.\r
  The result tells you exactly how many it restored out of how many, how many\r
  are gone, and names the ones a newer decision now owns.\r
\r
**What is deliberately NOT offered.** Two bank actions have no undo, because a\r
half-working one would be worse than none:\r
\r
- **🗑 Delete rejected** sends your source files to the recycle bin and drops\r
  their rows with everything the passes had computed about them. Files in the\r
  recycle bin are yours to restore, from your file manager — the app cannot do\r
  it for you, and it will not pretend otherwise. This action also withdraws any\r
  pending ↩ offer, since the images it pointed at are the ones just removed.\r
- **⬆ Promote** copies images into a dataset (or a new bank) through the normal\r
  import path. Un-promoting would mean deleting images in a dataset you may have\r
  already captioned, cropped or trained on. Delete them there if you want them\r
  gone.\r
\r
The 🔄 rotate button needs no undo entry: turn the other way and the image is\r
byte-for-byte the original again.\r
\r
## See why each image was rejected\r
\r
Pick **✕ Rejected** and a second row of chips appears under it — **✕ Why** —\r
with one chip per reason and its count: ≈ Duplicate, ✂ Same shot, ✋ By hand,\r
Blurry, ⬜ Flat, 🔞 NSFW, and so on. Click one and the grid shows only that pile.\r
\r
This is what you want before **🗑 Delete rejected**: that action is the one with\r
no undo, so being able to look at exactly what a pass took — and nothing else —\r
is the last check before the files go to the recycle bin.\r
\r
**Where this matters most: duplicates.** Auto-reject and "Resolve ALL — keep\r
best" both close every duplicate group in one click. After that the **≈\r
Duplicates** chip reads **0**, and it is right to: it counts groups that are\r
still waiting on a decision from you, and there are none left. But the images it\r
just rejected are still in the bank, and until this row existed nothing could\r
select them. If you have ever auto-rejected duplicates and then wondered where\r
they went, ✕ Rejected → ✕ Why → **≈ Duplicate** is the answer. Crops and\r
variants found by the ✂ pass are under **✂ Same shot**, which goes quiet on\r
resolution for the same reason.\r
\r
**Its limits, stated plainly.**\r
\r
- **This selects, it never repairs.** These chips are a filter. Nothing here\r
  un-rejects an image or changes which copy of a duplicate group was kept. To\r
  put something back, select it and press ✓ Keep like anywhere else in the grid.\r
- **❔ Not recorded is a real answer, not an error.** Images rejected by an older\r
  build — before the app wrote down why — land here. Nothing is wrong with them\r
  beyond the decision itself; the chip exists so that pile is reachable instead\r
  of invisible. On a bank you triaged a long time ago it may hold everything.\r
- **The counts follow your other filters**, like every chip row: with a\r
  subfolder or a search active, ≈ Duplicate shows how many are in *that* view,\r
  not in the whole bank.\r
- **A reason is not a re-check.** It says what the app decided at the time, at\r
  the thresholds in force then. Re-tuning 🎚 thresholds does not rewrite it.\r
\r
## Find more images like this one — by attribute, not by look\r
\r
**Select an image** in a captioned bank and its tags are already there: beside\r
the gallery on desktop, or in the filter bar on a phone. Tick \`woman\`, \`red\`,\r
\`dress\` or \`balcony\` and the grid narrows to the images whose captions mention\r
them. No extra click, no badge to find.\r
\r
**Select several and the row counts.** Each chip carries how many of your\r
selected images cite it — \`red dress 7 / 12\` means 7 of the 12 captioned images\r
you picked mention it. That is deliberately *not* an intersection: keeping only\r
the tags every single image shares would print 12 next to each survivor (a number\r
that says nothing) and usually leave you with one word. What you want to know is\r
that a tag describes over half of what you selected.\r
\r
The row is honest about what it did **not** count, on its own lines:\r
\r
- images in your selection with **no caption yet** — named, not folded into the\r
  denominator, so \`7 / 12\` always means 7 of 12 images that had something to say;\r
- images whose caption held **no word worth filtering on** (\`a photo of her\`) —\r
  a different problem with a different fix;\r
- a selection **too large to read in one request**, which says how many images it\r
  left out rather than quietly shrinking the total.\r
\r
Tick a chip and the row **holds still** while the filter runs, even though\r
filtering clears the selection — it keeps showing the tags of the selection you\r
filtered *from*.\r
\r
The 🏷️ **badge on a tile** is still there, in the bottom-right corner next to ▶\r
and ⛶ where the tile's actions live. It reads one image's tags *without*\r
selecting it. On an image with no caption — or a caption with no word worth\r
filtering on — the badge stays visible and greyed, and its tooltip says which of\r
the two it is: a feature that silently disappears is indistinguishable from one\r
that was never built.\r
\r
This is the readable cousin of **🎯 Similar to selected**, and the difference is\r
worth knowing because they fail differently:\r
\r
| | 🎯 Similar to selected | 🏷️ Tags of this image |\r
|---|---|---|\r
| Matches on | the whole look (the selected CLIP or SigLIP 2 index) | words *you* ticked |\r
| Works without captions | yes | no |\r
| Tells you *why* it matched | no | yes — the chips you ticked |\r
\r
Details that decide what you get:\r
\r
- **Several chips mean AND.** Ticking \`red\` and \`dress\` shows images mentioning\r
  both, so every extra chip narrows further. The line under the chips says so\r
  while the filter is active.\r
- **Chips are matched as whole words**, in captions *and* file names. \`car\` will\r
  not bring back \`scarf\`. (The 🚫 exclude box below is looser — it matches\r
  anywhere — because a word you type by hand is often a fragment on purpose.)\r
- **Booru captions keep their tags whole** (\`red dress\` stays one chip); prose\r
  captions are cut into words, so \`golden hour\` becomes two chips and ticking\r
  both means "captions with both words", not "captions about golden hour".\r
- **It only sees what a captioner wrote.** An attribute nobody put in words is\r
  invisible here, however plain it is in the picture. Caption more of the bank\r
  (🏷️ Caption all) and the chips get better.\r
- It composes with every other filter, and it travels with them — **Select all**,\r
  **▶ Review** and the curation picks all work on what you can see.\r
\r
## Hide images you have already handled\r
\r
The bank's 🔍 search box narrows the grid *to* a word. Next to it, the 🚫\r
**Exclude words** box does the opposite: it hides every image whose **caption or\r
file name** contains what you type. That turns a captioned bank into a checklist\r
— *what have I not tagged yet?* — instead of a list you have to keep re-reading.\r
\r
- **Several words at once**, comma-separated: \`logo, watermark, screenshot\` hides\r
  anything mentioning any of them.\r
- **It composes with everything else** — the search box included. Searching\r
  \`dress\` while excluding \`red\` gives you the dresses that are not red, and the\r
  filter chips, subfolder, resolution tier and framing all still apply.\r
- **It travels with the filter**: **Select all**, **▶ Review** and the\r
  curation picks (🎨 diverse, ⚖️ balanced, similar) all work on the\r
  visible set, so an image you hid is never handed back to you by a pick.\r
\r
Two limits worth knowing:\r
\r
- **It matches anywhere in the text**, like the search box — so \`car\` also hides\r
  \`scarf\`. Type the longer word when that matters.\r
- **Images with no caption are never hidden.** They have nothing to match, and\r
  hiding them would remove exactly the images a checklist is looking for.\r
\r
Unlike the sort, the exclude box is **not remembered** between visits: an order\r
you can see in a menu is a habit, but images missing from a grid for a reason you\r
set last week reads as data loss.\r
\r
## Filter a bank on a small screen\r
\r
The bank's filter panel — the search boxes, every chip row, the 🔖 tag facets and\r
the 🎚 thresholds — is a lot of controls on a phone: roughly fifteen wrapped rows\r
before the first thumbnail. It now opens **folded** on a small screen (and\r
**expanded** on a desktop), behind one line that names every filter currently\r
narrowing the grid, e.g. *"✓ Kept · 🌫 Blurry · 1–2 MP +2 more"*. Tap the header to\r
open or close it — the choice is remembered for next time, across every bank.\r
\r
A folded panel never hides *what* it is doing: the summary line is built from\r
the same list of active facets as the "N shown of M" count above the grid, so\r
the two can never disagree, and the full list is always available in the\r
header's tooltip. **✕ Clear all** appears next to it whenever something is\r
active, and turns every filter off in one tap — search, exclude, status,\r
quality/score/group flags, resolution, origin, framing and both kinds of tag\r
filter. It leaves the **sort order** alone: a ranking is not a filter, and\r
resetting it on every "start over" would be a second, unrelated surprise.\r
\r
Selecting thumbnails and deciding on them used to mean opposite ends of the\r
page — tap tiles at the bottom, then scroll all the way back up past the filter\r
panel to reach ✓ Keep / ✕ Reject. Those buttons — plus Skip (back to\r
undecided), the two rotate buttons and CLR (clear the ticks) — now live in a\r
bar **pinned to the bottom of the screen** the moment anything is selected.\r
Keep and Reject share one even row; Skip and CLR share the next. It takes up real space at the end of\r
the page rather than floating over it: the page grows to make room for it, so\r
scrolling all the way down still shows you the last row of thumbnails and the\r
pagination controls with nothing hidden behind the bar. The ↩ Undo offer after\r
a bulk decision appears in the same bar, right where the buttons that made the\r
decision are.\r
\r
## Sort a grid to review faster\r
\r
Filters answer *which images*; sorting answers *which one first*. Both grids\r
have a **Sort** control, and it changes nothing but the order — the same images\r
match, the counts stay put, and every bulk action keeps operating on exactly\r
what the filters left.\r
\r
In a **bank** (View ▸ Sort, next to the tile size) you can order by *anything the\r
passes measured*, either way. The menu is grouped by the pass that produces the\r
figure, so a greyed-out section also tells you which pass to run:\r
\r
- **📁 File** — **Resolution ↓ / ↑** (megapixels, so a 900×900 outranks a wider\r
  1200×300) and **File size ↓ / ↑** (bytes on disk — the one figure no filter\r
  chip exposes).\r
- **✨ Score** — **Aesthetic ↓ / ↑** (the 1–10 rating; ↓ puts your keepers on the\r
  first page, ↑ puts the duds there, which is usually the faster way to prune)\r
  and **NSFW likelihood ↓ / ↑**.\r
- **🔎 Scan quality** — **Sharpness** (↑ brings the blurry misses to you),\r
  **Noise**, **Contrast** (↑ = the flattest, near-empty frames first), **Detail**\r
  (↑ = the enlargements pretending to be big images), **Letterbox bars** and\r
  **JPEG quality**.\r
- **🎭 Faces** — **Face confidence ↓ / ↑**, the detection score: ↑ surfaces the\r
  tiny, turned or half-hidden faces.\r
\r
A chip and a sort answer different questions. A chip only ranks the images that\r
*cross* its threshold, so "the noisiest of the ones I am keeping" — all of them\r
below the threshold — is a question only the sort can answer, and no chip ranks\r
the other way round at all.\r
\r
**The bank remembers the order you chose, per bank.** Reopen it tomorrow and it\r
opens the way you were reviewing it; other banks keep their own. Pick **Default**\r
to forget the preference.\r
\r
In a **dataset** (above the grid, next to the decision chips) there are two\r
kinds of entry, and they answer different questions:\r
\r
- **Face similarity ↓ / ↑** — the ArcFace cosine against your reference photo\r
  computed by **🎭 Analyze faces**. ↓ is "who looks most like my subject", ↑ is\r
  the shortlist to cut. This *ranks* the whole grid.\r
- **Shot type** — face, then bust, then body, then back, in the order the\r
  composition bar counts them. This *groups*: it ranks nothing, it puts every\r
  shot of one kind in a single run so you can compare like with like. A grid in\r
  arrival order interleaves the four kinds, which is the wrong arrangement for\r
  the question you are actually asking — *do I have too many of these, not\r
  enough of those, and which of these near-identical ones do I keep?* The shot\r
  type is the one the **📐 Classify framing** pass wrote (and the one the shot\r
  card carried, for a generated image).\r
- **Shot type, then face similarity ↓** — the same grouping, with the closest to\r
  your reference at the head of each kind. This is the order for curating: walk\r
  down a run and the ones to cut are at its end.\r
\r
Two things worth knowing:\r
\r
- **Images a pass never reached always go last**, in both directions. An\r
  un-analysed image has no score — putting it first would bury the very images\r
  you asked to see.\r
- **A sort you have no data for is greyed out** and says which pass to run,\r
  rather than pretending to reorder. Run the pass, and it lights up.\r
\r
In a bank the ordering is done by the database over the *whole* filter, not just\r
the page you can see — so **Select all** and **▶ Review** walk the same\r
order you are looking at.\r
\r
## Move through a dataset without closing the image\r
\r
Open any dataset image full screen (the 🔍 on its tile) and you can walk the\r
whole grid from there: **⟨** and **⟩** on the left and right edges of the picture,\r
or the **←** and **→** keys. **Esc** closes, as before.\r
\r
The badge next to the image's name — **12 / 340** — is the part worth reading. It\r
counts *the images the grid is showing you*, so:\r
\r
- **The arrows follow your filters and your sort.** Chip the grid down to "34\r
  awaiting ✓/✕", sort by face similarity, and ⟩ walks those 34 in that order.\r
  Change a filter and the badge changes with it. They never step onto an image\r
  the grid is currently hiding — if they did, you would have no way to notice.\r
- **They cross pages.** A dataset over 500 images is paged, and ⟩ turns the page\r
  under the overlay: close the lightbox and you are on the page holding the\r
  image you were just looking at, not where you started.\r
- **They stop at the ends.** There is no wrap-around: on the first image ⟨ goes\r
  grey and says *"You are on the first of the 340 images shown here"*, and the\r
  same at the other end. On a wall of near-identical shots, a loop that silently\r
  restarts makes "have I seen everything?" unanswerable.\r
\r
What does **not** travel with you: the 100 % zoom, an open **⧉ Compare with\r
original** pane, and an improvement running on the image you left. Each image is\r
inspected from a clean slate — a pane captioned *original* is always the parent\r
of the picture in front of you, never of the previous one.\r
\r
Navigating is a *read*, so it keeps working while a generation, a captioning\r
pass or a watermark scan holds the dataset — the same rule as opening an image\r
and ticking a selection. Only the edits in the bar (crop, mirror, rotate,\r
improve) wait for the pass.\r
\r
The rescue pairs in **Curation** are the one place with no arrows: there you are\r
judging one pair, not walking a list.\r
\r
## Keep or reject a dataset image without leaving the picture\r
\r
The full-screen view is where you can actually *see* whether a hand is right or\r
an eye is mush — so that is where the verdict belongs. The bar under the image\r
carries the same three buttons as the Bank's **▶ Review**, on the same keys:\r
\r
- **✓ Keep** — \`K\`\r
- **✕ Reject** — \`R\`\r
- **⏭ Skip** — \`S\` (or **→**)\r
\r
**Keep and Reject move you on** as soon as the verdict is saved, so a folder of\r
300 pictures is worked through with one hand on the keyboard and never a return\r
trip to the grid. **Skip is nothing but "next"**: the image keeps whatever it\r
already had, undecided included. **←** goes back the same way — navigation only,\r
it decides nothing.\r
\r
It is the *same* verdict as the ✓ / ✕ on the tile behind the overlay, not a\r
second one: only kept images are captioned, exported and trained on, and the\r
grid, the counters and the ⬇ Export all read that one status. The chip beside\r
the image's name says which one it is carrying right now — **✓ kept**,\r
**✕ rejected** or **· undecided** — so you can tell a landed decision from a\r
missed keystroke.\r
\r
Two things it deliberately does not do. **Nothing is deleted**: a reject is a\r
status, the file stays on disk and ✓ takes it back. And **the verdict is sent\r
before you move** — on a slow disk the buttons grey out for a moment rather than\r
walking on with a decision still in flight.\r
\r
At the end of the list there is nowhere to advance to, so the picture stays in\r
front of you wearing its new chip; the ⟩ arrow already says which end that is.\r
\r
## Inspect an image on a phone\r
\r
Below a phone-sized window the lightbox changes shape, and it is the same\r
picture, the same actions and the same keys — only their arrangement moves.\r
\r
- **The image takes the screen.** In a side-by-side comparison, both panes do.\r
- **Every action moves behind one button**, the **☰ Actions** pill floating at\r
  the bottom of the picture: compare with the original, compare with the\r
  reference, crop, mirror, rotate left and right, improve, upscale, the Klein\r
  instruction with its editor and its model, and the links to Settings. Nothing\r
  is dropped and nothing is renamed — it is the same list, in the same order,\r
  in a panel instead of a strip.\r
- **The panel is a drawer, not a new screen.** It covers the bottom of the\r
  picture and leaves the top of it visible, so you can see what you are about to\r
  rotate. **Esc** peels one layer: it closes the panel first, and the lightbox\r
  only once the panel is closed. **Done** and the pill itself close it too.\r
- **Asking to compare closes the drawer**, because a comparison is a request to\r
  *look* at something. The edits (rotate, mirror, improve) leave it open — those\r
  get chained.\r
- **⟨ / ⟩ and the ← → keys still walk the grid**, and moving to another image\r
  closes the panel with the picture it belonged to.\r
\r
Why it changed: at 400 px the old bar was not a bar. Crop, Mirror, two Rotates,\r
two Improve buttons and the Klein note each took a full-width row, and with the\r
Klein instruction editor unfolded the photo itself was left **96 px tall** —\r
about 11 % of the screen. Side-by-side comparison, where size is the entire\r
point, gave each pane **144 px**. Measured again after the change, on the same\r
screen: **538 px** for a single image whatever the editor is doing, and **354 px\r
per pane** in comparison.\r
\r
On a desktop none of this applies: the actions stay in the bottom bar, or in the\r
side rail beside a portrait photo, which already spends width the image cannot\r
use.\r
\r
## Compare an improved image with the original\r
\r
Two things in the app never overwrite an image — they add a **candidate** next\r
to it, and leave the choice to you:\r
\r
- **✨ Upscale & improve** in the dataset lightbox (a manual Klein pass, 2 MP by\r
  default);\r
- the automatic **small-image rescue** of scraped images under 768 px.\r
\r
Open that candidate full screen and it now carries **⧉ Compare with original**.\r
The view splits in two named panes — *Original* and *Improved* (or *Klein\r
rescue*) — **side by side on a wide screen, stacked on a phone**, where width is\r
the scarce axis and two half-width thumbnails would prove nothing.\r
\r
Both panes are the same size and both images are fitted inside them, so they are\r
shown at **the same scale and the same framing** even though the candidate has\r
more pixels. That matters: an improve pass rescales to a megapixel budget, and\r
two images displayed at different scales cannot be compared honestly.\r
\r
**Zoom is off inside the comparison**, and the hint under the image says so. At\r
100 % a 2 MP result and a 0.5 MP original cover different parts of the subject —\r
that is not a comparison. Leave the comparison (⊟) and the usual click-for-100 %\r
inspection is back, on whichever image you are looking at.\r
\r
When you **✓ Keep** a completed **✨ Upscale & improve** candidate, LDS keeps\r
both files but returns its original to **Undecided** automatically — so the\r
improved image is the one selected for training. This happens in the lightbox\r
and with bulk **✓ Keep**, even if you selected both tiles. Nothing is deleted:\r
you can still compare them, and can mark the original **Keep** again later if\r
you deliberately want to train on both.\r
\r
If the original was deleted, rejected and purged, or simply never recorded (very\r
old rows), there is no button — a short amber note says why instead, so a\r
missing control can't be mistaken for a bug. Everything else in the lightbox —\r
✂ Crop, ⇄ Mirror, ✨ Upscale & improve — is unchanged and still acts on the\r
image you opened.\r
\r
## Compare an image with the dataset reference photo\r
\r
⧉ *Compare with original* only exists on the two kinds of candidate above. The\r
question you actually ask of an ordinary generated variation is a different one\r
— **is this still the same person?** — and its answer is the reference photo,\r
which lives in another panel and is therefore never on screen beside the image\r
you are judging.\r
\r
Open any image in the dataset full screen and it now carries\r
**◐ Compare with reference**. Same split view, same named panes — *Reference*\r
and *This image* — side by side on a wide screen, stacked on a phone. It works\r
on **every** image, generated or imported, not only on improve candidates.\r
\r
**Each pane fits its own image**, and that is the honest thing to do here: the\r
reference is a square head crop and the image beside it may be a full-body plan,\r
so there is no shared scale to promise. The hint under the panes says\r
*different framings* rather than *same scale* — that promise belongs to the\r
comparison against the original, where both images really are two renderings of\r
one shot.\r
\r
The two comparisons are **exclusive**: pressing one leaves the other, because\r
two pairs of panes at once are four thumbnails and prove nothing. On an improved\r
image both buttons are there and you can flip between the two questions; on a\r
plain variation only ◐ *Compare with reference* is.\r
\r
A dataset with **no reference photo yet** shows no button and no warning — the\r
reference panel already asks you for one, and a second nudge here would be noise\r
on a screen that cannot act on it. Zoom is off inside this comparison too; leave\r
it (⊟) for the usual click-for-100 % inspection.\r
\r
## Tune the Bank filter thresholds\r
\r
The filter chips (🌫 Blurry, 📐 Small, ≈ Duplicates…) are verdicts, and every\r
verdict comes from a number. Those numbers used to live only in\r
*Settings ▸ Captioning & quality*, three screens away from the bank you were\r
triaging. They are now also under the chips themselves: open **🎚 Filter\r
thresholds** above the grid.\r
\r
It is the **same setting in both places** — one value, seen twice — so anything\r
you change here applies to **every bank**, and the panel says so at the top.\r
\r
The twelve knobs are grouped by the question they answer: **Image quality**,\r
**Duplicates**, **Size & framing**, **Content**, **Style**. The first two are\r
open by default; the rest fold away, and a folded group tells you how many of\r
its values you have moved off the default.\r
\r
Three things each control tells you that a bare number cannot:\r
\r
- **Which way catches more.** "Stricter" is not a direction. *Duplicate\r
  distance* is a distance in hash bits — **raise** it to catch more\r
  near-duplicates. *Semantic duplicate similarity* is a similarity — **lower**\r
  it to catch more. They sit side by side and they move opposite ways, so each\r
  field spells its own direction out in a sentence next to the input.\r
- **When it takes effect.** Eight of them re-sort the bank the moment you save,\r
  because the scan stores raw measurements and the verdicts are recomputed on\r
  every read — no rescan, ever. The other four are baked into stored groups by a\r
  pass, so they carry a button that re-runs that pass on the spot. Re-grouping\r
  duplicates is cheap: it walks the stored hashes and decodes nothing.\r
- **How many images it would touch.** As you change a read-time value, the panel\r
  asks the server how many images that number *would* flag and shows\r
  \`1 240 → 3 019 images flagged\` before you save anything. Nothing is written\r
  until you press **Save**.\r
\r
Every field has **↺ Reset to default** (it only appears when the value is not\r
the default), and the header carries **↺ Reset all to defaults**. The defaults\r
come from the server, so they are always the real shipped values.\r
\r
### What editing an image costs it\r
\r
Crop, ✂ Mirror, ↺ Rotate and the watermark cleaners **overwrite** the file the\r
trainer will later copy verbatim, so whatever they discard is discarded for good.\r
They all follow one rule: **keep the file's format and re-encode it without losing\r
pixels.** A PNG stays a PNG, a WebP is rewritten losslessly (crop it ten times and the tenth\r
is identical to the first), and the file keeps a name that matches what is inside\r
it. JPEG is the exception nobody can fix — it has no lossless mode — so a JPEG is\r
re-saved at the highest practical quality with no chroma subsampling rather than\r
converted to something heavier to protect pixels that were already lossy.\r
\r
Two honest caveats:\r
\r
- **A large crop still resamples.** A box longer than 1024 px is normalised *down*\r
  to a 1024 px long side, and only the *encoding* is lossless — that downscale\r
  never can be. A box at or under 1024 px is a pure cut, so it is lossless end to\r
  end, as is the watermark **✂ auto-crop**, which only cuts and never resizes.\r
- **Files get bigger.** A cropped photo that used to weigh ~200 KB now weighs\r
  ~950 KB. That is the price of not throwing pixels away. Thumbnails and the\r
  copies uploaded to a generation API are unaffected: they stay small on purpose.\r
\r
### A crop is never enlarged\r
\r
A crop used to be stretched *up* to a 1024 px long side as well: select 240×180\r
and the file stored was 1024×768. That enlargement invented no detail — shrinking\r
such a file back recovers the real crop almost exactly — and since the encoder\r
went lossless it cost roughly **6× the bytes** for nothing. A crop now keeps its\r
own size, and only comes *down* to 1024 px.\r
\r
Two consequences worth stating plainly:\r
\r
- **Your dataset can end up mixing image sizes.** That is fine — training buckets\r
  images by size — but a tile cropped out of a small area really does carry less\r
  detail than a native shot of the same framing, and it always did; it just used\r
  to look like 1024 px.\r
- **The composition meter says so.** The old ⚠ *Upscaled* line is now\r
  ⚠ *Under training resolution*. It fires on the same measurement and means the\r
  same thing it always meant: this framing bucket is filled by cropping far into\r
  photos rather than by native shots — add native shots for it. (Images imported\r
  with the automatic head-crop *are* still enlarged to 1024, so both shapes land\r
  under the same warning.)\r
\r
Images cropped **before** this change keep the enlarged pixels they have.\r
\r
Images you cropped **before** this changed keep the pixels they have — nothing is\r
re-processed retroactively, and re-cropping an already-degraded file cannot bring\r
back what the old encoder removed.\r
\r
## Why a ↻ re-run button is greyed out\r
\r
A bank runs **one pass at a time**. While a ✨ Score, a Quality scan or a\r
Launch all is walking it, the ↻ buttons in this panel are disabled — and each\r
one says which pass is holding the bank and how far it has got, for example\r
*✨ Score pass is running on this bank — 137 / 412*. Wait for it to land, or\r
press **Stop** in the ⏳ progress bar at the top of the bank; the buttons come\r
back by themselves the moment the bank is free.\r
\r
When a re-run does start, the button reports what the pass produced right where\r
you pressed it: **\`Done — 12 duplicate groups · 34 images (was 9 · 26)\`**. If\r
your new value groups exactly the same images it says so — *unchanged* — rather\r
than leaving you unable to tell a no-op from a pass that never ran.\r
\r
## Rotate a sideways image\r
\r
Scraped folders and phone exports are full of shots lying on their side. Both\r
places you meet an image can turn it a quarter turn, and neither charges you for\r
it. (Asked for by 1Tomber, GitHub issue #17.)\r
\r
**In a dataset**, open the image (click its tile) and use **↺ Rotate left** /\r
**↻ Rotate right** in the bar under the picture, next to ⇄ Mirror. The file\r
keeps its name, its caption, its status and its format — a PNG stays a PNG, a\r
WEBP stays a WEBP. Four turns bring you back to exactly where you started:\r
measured on the shipped encoder, a PNG and a WEBP come back **byte-identical**\r
after going all the way round, so a mis-click costs nothing. The one exception\r
is a JPEG, which the format itself forces to be re-encoded on every save: at the\r
quality LDS writes (95, no chroma subsampling) that is around 46 dB PSNR — far\r
below anything visible, and it barely grows with more turns — but it is not\r
free, so it is worth knowing. Datasets normally hold WEBP, so this mostly\r
concerns files restored from an old backup.\r
\r
Rotation is deliberately **not** part of ✂ Crop, even though that is where you\r
might look for it first. Cropping **resamples** the image — it rescales the box\r
you drew to a 1024 px long side — and resampling costs detail no matter how\r
carefully the result is then saved. A quarter turn resamples nothing at all: it\r
just moves existing pixels to new coordinates. Sending it through the crop lane\r
would make it pay a price it does not owe.\r
\r
**In a bank**, your own folder is never written to — so a bank rotation does not\r
touch your files at all. The turn is remembered against the image and applied to\r
what the app shows you and to what it copies when you **⬆ Promote**; your\r
original keeps its exact bytes, whatever you do. Select the images and use\r
**↺ Rotate left** / **↻ Rotate right** in the selection bar — pinned to the\r
bottom of the screen once anything is selected — to fix a whole sideways batch\r
at once, or turn one image without leaving **▶ Review** with the\r
↺ / ↻ buttons (keyboard: \`[\` and \`]\`). Rotating in Review never decides\r
anything — the image stays under your cursor so you can judge it once it is the\r
right way up.\r
\r
One caveat worth stating: the analysis passes (Subject, ✨ Score, Framing)\r
still read the original file, so turning an image does **not** re-run them. Turn\r
first, then run the passes if you want them to see it upright.\r
\r
## Crop and upscale inside a bank\r
\r
A bank is where the filtering and the curation happen, but reframing or\r
upscaling a shot used to mean leaving it: promote into a dataset, edit there,\r
export into a **new** bank, and start curating again. Both edits now happen in\r
the bank itself, so the loop is *curate → edit → re-analyse → promote*, in one\r
place. (Asked for by nofaceman on Discord, backed by mr.arrow.)\r
\r
**✂ Crop** is per image, in **▶ Review** — the only place a bank shows a picture\r
big enough to draw a box on. Open Review (or press ▶ on a tile), then click\r
**✂ Crop** or press \`C\`. Drag the box, or snap it to a ratio, and confirm.\r
Cropping decides nothing: the image stays under your cursor so you can judge it\r
once it is framed properly.\r
\r
**Nothing is resampled here**, and that is the one real difference from the crop\r
inside a dataset. A dataset crop rescales the box you drew to a 1024 px long\r
side, because a dataset image is training material and that is its size. A bank\r
sits *upstream* of that choice — shrinking here would pick your training\r
resolution before you have even picked a dataset, and would do it silently. So a\r
bank crop is a pure cut: it keeps the pixels inside the box, and the dataset\r
still decides the size when it imports.\r
\r
**✨ Upscale & improve** is a pass, on the **✂ Edits** panel (⚙ Passes). It takes\r
the same kept / undecided / unkept / selection scope as everything else, which\r
matters more here than anywhere: this one spends GPU-minutes **per image**. Pick\r
the engine on the panel — **Klein** re-renders detail from a prompt (sharper, and\r
skin and colour can shift) or **SeedVR2** resolves detail and leaves the original\r
look alone — then launch. It runs in the background with a progress bar, and ⏹\r
Stop ends it between two images, keeping everything already done. Unlike the\r
dataset version, there is no candidate to validate: a bank *is* the review, so\r
the result replaces what the bank shows.\r
\r
**Your own files are never written to.** Both edits land in a copy the app keeps\r
next to the bank, exactly like the watermark cleaning. **↩ Revert** on the ✂\r
Edits panel throws those copies away — for the selection, or for the whole bank —\r
and gives you back the image it started from, including any rotation the edit had\r
absorbed. In ▶ Review, **↩ Revert edit** does it for the image on screen.\r
\r
Two consequences worth knowing. First, an edit **clears every measurement taken\r
from the old pixels**, so ✨ Score, 📐 Framing and the rest pass over those images\r
again — which is the point: a sharpness score read off the shot before you cropped\r
it describes an image the bank no longer holds. Second, ✨ Upscale & improve does\r
not re-run on an image it has already improved; ↩ Revert is how you ask for a\r
second attempt, and it is one click.\r
\r
## Repaint one detail without regenerating the image\r
\r
Two people asked for this from opposite directions on the same week: one wanted\r
the watermark remover pointed at a necklace and some skin blemishes, the other\r
wanted to fix a small glitch in a fresh picture without regenerating the whole\r
thing. Same hole.\r
\r
The app already had the hard part. **🧽 Clean** repaints exactly the box you draw\r
and leaves every pixel outside it **byte-identical** — but its instruction was\r
frozen on "reconstruct a clean, natural image", so it could only ever be aimed at\r
a watermark. **✦ Edit**, the other lane, takes any instruction but re-renders the\r
**whole** image, which drifts outside the area you cared about.\r
\r
**✦ Repair** is the first lane with both. Open the image (click its tile) and press\r
**✦ Repair** in the action bar. Draw the zone, type what should be there —\r
*"remove the necklace"* — and press **✦ Repair** again. Only that zone is\r
repainted. Everything outside it comes back exactly as it was, to the byte.\r
\r
**Two shapes, one button.** Inside that dialog you choose how to point at the\r
area:\r
\r
- **▭ Box** — drag a rectangle. The app crops a square around it and works on\r
  that crop, so it is quick and its memory use does not depend on how large the\r
  photo is. Right for a mark in a corner.\r
- **🖌 Brush** — paint over the thing itself, with a size slider, an eraser and\r
  Clear. The model sees your paint plus a generous ring of context around it —\r
  a localized touch-up travels as a native-resolution crop, and only a paint\r
  job that spans most of the frame sends the whole (size-capped) picture.\r
  Right for jewelry, glasses, straps — anything a rectangle would only enclose\r
  by taking a lot of its surroundings with it. Pixels you did not paint are\r
  copied from your file either way.\r
\r
Both work under a finger, so this is usable from a phone. The brush was\r
contributed by OneCodingDude on GitHub.\r
\r
**The brush needs one small install.** The masked pass runs on **LanPaint**, a\r
training-free inpainting sampler (a ~1 MB ComfyUI node pack, no Python\r
dependencies): Klein is an edit model, not an inpaint-trained one, and\r
conditioning it like one is what used to hand back a smeary patch — reported by\r
charlesangus on GitHub, and exactly what LanPaint exists to fix. Setup ▸ the\r
**LanPaint sampler** row installs it; restart ComfyUI afterwards so it loads.\r
Your paint is also grown by a few pixels before the model sees it, so the\r
edges of the removed thing get rebuilt instead of leaving a halo — and the\r
best prompts describe **what should be behind** (*"bare skin"*, *"plain\r
wall"*) rather than naming what to remove.\r
\r
The 🚩 button next to it opens the same editor from the other intention — you\r
spotted a watermark the scan missed. Same screen, same zones; what differs is\r
whether you press 🧽 Clean or ✦ Repair once you are there.\r
\r
A few things worth knowing:\r
\r
- **It says nothing about watermarks.** A repair does not flag, clear or stamp\r
  anything: the image keeps whatever watermark state it had. It is an edit you\r
  asked for, not a verdict.\r
- **Your original is preserved first.** The master is copied aside *before*\r
  anything is written, so a repair that fails costs you nothing — the file is\r
  left exactly as it was.\r
- **An empty description is refused**, on purpose. Falling back to the watermark\r
  sentence would repaint your zone with an intention you never expressed.\r
- **↩ Undo puts the previous image back**, one step deep, so trying another\r
  description costs nothing — which is the normal way to use this: look, not\r
  right, change the sentence, go again. The dialog stays open after a repair for\r
  exactly that. The undo is consumed once used, and it never reaches the\r
  write-once original kept for ↩ Undo cleaning — undoing a repair must not throw\r
  away a watermark clean you made earlier and still want.\r
- It runs on Klein through ComfyUI, one round-trip per repair.\r
\r
**On a picture you just generated, too.** Open a generated image full size — on\r
the Canvas, or from a checkpoint gallery — and press **✦ Repair** next to ⬇ and\r
✨. Same gesture, same guarantee: a stray finger or an unwanted object no longer\r
means throwing away the render you liked and rolling the dice again.\r
\r
## Clean the watermarks a bank found\r
\r
**🚩 Find watermarks** flags the images carrying an overlaid logo, URL or\r
@username. Removing them used to mean promoting the watermark into a dataset\r
first and cleaning it there; the bank now does it itself, in **two steps you\r
launch by hand** — cheapest and safest first:\r
\r
1. **✂ Auto-crop** cuts off the marks sitting in a border strip. No model, no\r
   GPU, no invented pixel: it simply trims the band up to the mark, and only\r
   when the image stays big enough to train on. Anything it can't crop that way\r
   is left flagged, on purpose.\r
2. **🧽 Inpaint** repaints what's left. **LaMa** (fast, non-generative) repaints\r
   the marked zones and leaves marks *on the subject* flagged. **Klein** (slower,\r
   via ComfyUI) works in two steps: the zones the scan found are **erased** on the\r
   photo, and then the **whole photo** is re-rendered with the instruction to\r
   remove the watermarks. The erasing is what stops the model handing the mark\r
   back; the whole-photo pass is what also clears the marks the scan *missed* — a\r
   mark tiled across the picture, one on the subject, one the detector boxed in\r
   the wrong place. The price is an image whose every pixel is regenerated. Each\r
   engine says what to install when it isn't ready, and the button stays off\r
   rather than failing mid-pass.\r
\r
   **It is a generative pass, not a mask, so read the result.** Measured on the\r
   shipped settings: a photo tiled wall-to-wall with a mark came back with all\r
   twelve zones gone and looking clean — the case that was hopeless before,\r
   because there was no unmarked area to copy from. A photo carrying seven\r
   distinct logos came back with all seven gone. What can still survive is a mark\r
   **nobody found**: nothing erased that one, so the model is free to keep it.\r
\r
   **Why the erasing matters, in one measured example.** Run without it, the same\r
   photo came back with a round logo *redrawn* as a plausible **moon in the sky**\r
   — the model reinterpreting a mark it could still see rather than deleting it.\r
   A re-run of 🚩 Find watermarks sees nothing wrong with an image like that (a\r
   moon is not a watermark), so it would stay marked *cleaned* and no later step\r
   would catch it. Erasing the zones first removed every trace of that. It is\r
   still worth a look at the picture.\r
\r
   **Three dials, right there under the engine.** Picking Klein reveals the\r
   **prompt it is actually sent** (\`remove watermark\` by default, editable, with\r
   *Reset to default* to get it back), the **processing size** the photo travels\r
   at (1 – 4 MP, default 2 — higher means finer regenerated detail and more VRAM\r
   and time, and a photo already smaller than the setting is never enlarged), and\r
   **what size the cleaned file is written at**: back at your file's own\r
   dimensions, as before, or at the render's size — in which case **the file\r
   changes dimensions**. The dataset's Clean bar offers exactly the same three,\r
   and they are one stored choice, so setting them on either side arms both.\r
   Every clean also writes the prompt, size and write-back mode it used to\r
   🪵 Server log, so you can tell afterwards what actually ran.\r
\r
Each step shows how many images it still has to work on and how many it has\r
already handled, so you can see where the funnel stands. **Your source files are\r
never modified** — a cleaned image is a copy the app keeps beside the bank's\r
thumbnails. That copy is what the grid shows, and what **⬆ Promote** sends to\r
the dataset, so a cleaned bank produces a clean dataset. **↩ Undo cleaning**\r
just deletes those copies and flags the images again, and **👁 Before / after**\r
flips a sample between the cleaned version and your untouched original.\r
\r
If a bank was scanned by an older version, its flagged images carry no recorded\r
mark position; the panel says so and one more **🚩 Find watermarks** run makes\r
them cleanable.\r
\r
### The 🚩 launch window: sample, threshold, and the result in place\r
\r
**🚩 Find watermarks opens the same kind of window as 🔤 Find text now, on\r
both surfaces** — the dataset button used to fire straight from the click.\r
*Try on a sample first* judges only the first N images of the scope\r
(deterministic — a re-run re-judges the same ones), so on a huge bank you can\r
check the flags before paying for the whole scan. When the dedicated detector\r
is installed, the *Detector threshold* slider edits the stored score an image\r
needs to be flagged — lower flags fainter marks at the cost of false flags —\r
one value, both surfaces (the vision route carries no score, and the window\r
says so instead of showing a dead slider). And the flagged pages appear below\r
the dials with their boxes drawn on them, filling in live while the scan\r
runs. The strip shows the **watermark-family** pages; pages flagged by 🔤\r
Find text live in that pass's own window — the same page-level split **What\r
to clean** repaints by.\r
\r
### Who decided an image is watermarked\r
\r
**🚩 Find watermarks** can run two ways, and the panel says which one produced\r
the verdicts you are looking at ("Judged 1 240 by the detector, 300 by the vision\r
model") and which one a new run would use.\r
\r
- **The vision model** — the way that has always worked. It asks the local vision\r
  model, in words, whether the picture carries a mark, once per image. About\r
  1.7 seconds each, so about fifteen hours on a 30 000-image bank.\r
- **The watermark detector** — an optional extra (Setup ▸ Quality tools). A small\r
  classifier scores each image in about **0.14 second**, and a second model marks\r
  where the logo sits so the two cleaning steps still have a box to work on. It\r
  needs no Ollama at all.\r
\r
Install nothing and nothing changes. Install the extra and it takes over on its\r
own; there is no switch to flip. What it costs is ~0.9 GB of weights, downloaded\r
once into the same Python the **✨ Score** pass already uses.\r
\r
**How good is it, measured.** On 110 images pulled from a real bank and labelled\r
by eye — half of them hard on purpose: faint corner logos, semi-transparent\r
handles across the subject, an \`OnlyFans.com/…\` line barely a few pixels tall, and\r
clean photos containing legitimate signage — the detector at its default setting\r
flagged **none of the 55 clean images** and **54 of the 55 marked ones**. The\r
vision model, on the exact same 110, flagged one clean image and missed one marked\r
one. So the detector is not a downgrade in judgement; the gain you actually buy is\r
the ten-fold speed-up. Neither is a verdict: both are a review flag, and both leave\r
your source files untouched.\r
\r
The one image the detector missed was a \`MET-ART.com\` line in a bottom corner\r
scoring 0.929, just under the 0.94 cut — and the highest-scoring clean image sat\r
at 0.939. The two overlap by about a hundredth, which is why the cut is a\r
**setting** (Settings ▸ Captioning & quality ▸ *Watermark detector sensitivity*)\r
and not a constant.\r
\r
Images flagged **without** a position — the detector was sure there is a mark but\r
could not place it — stay flagged and are counted separately in the pass's report.\r
Draw a zone on them with **🚩 Edit mask** below, or leave them as a filter.\r
\r
\r
## Erase burned-in text — bubbles, subtitles, captions\r
\r
A comic page carries its dialogue, a screencap its subtitle, a meme its\r
caption — and a LoRA trained on them learns the lettering along with the\r
subject. **🔤 Find text** reads that text and feeds the exact same cleaning\r
funnel as the watermarks: every block of text becomes a zone in the image's\r
mask, the image is flagged, and **🧽 Inpaint** repaints the zones. One funnel,\r
one ↩ Undo, one mask editor — a text zone behaves exactly like a zone you drew\r
by hand. **✂ Auto-crop never touches them**, on purpose: cropping a speech\r
bubble out of the middle of a page is not a thing.\r
\r
The reading is done by the same OCR engine as the Video bank's **🔳 Safe\r
zone** pass (one Setup install serves both — *Burned-in text*, a small\r
Apache-2.0 package that works offline). It runs on the **CPU only**, never the\r
GPU, so it can scan a bank while a training run owns the card. Regular\r
lettering is found whatever the script — Latin, Korean, Japanese, Chinese\r
dialogue, subtitles and captions are all boxes to it. **Heavily stylised\r
lettering can escape it**: a calligraphic sound-effect with thick outlines is\r
drawn more than written, and the detector can miss it entirely (measured on a\r
real page — no threshold recovers it). Those get the hand mask in **🚩 Edit\r
mask**, like any zone the machine missed.\r
\r
**How the repaint treats these zones.** A text zone is not handed to the\r
repaint model as a rectangle any more — that is what used to eat balloon\r
outlines. The clean now runs an outline-safe filler first: every letter is a\r
small closed ink shape *inside* the zone, so anything drawn **across** the\r
zone's edge (the balloon outline, the art) is preserved by construction; the\r
letters are then erased with the bubble's own background colour —\r
including the faint JPEG haze around them — or rebuilt by a local\r
inpaint when the background is graded. Only lettering sitting on busy art\r
still goes to the repaint model, and it gets letter-sized boxes, never the\r
whole rectangle. Pages cleaned before this shipped can be upgraded:\r
**↩ Undo cleaning**, then Clean again.\r
\r
What it does *not* do, said plainly:\r
\r
- it reads **positions, not words** — no transcript of your images is stored\r
  anywhere, the boxes are all that is kept;\r
- the mask holds at most **32 zones per image**; a text-heavy page that\r
  produces more keeps the 32 biggest blocks and the pass's report says how\r
  many were left out (draw those in **🚩 Edit mask** if they matter);\r
- images you **dismissed** stay dismissed — this pass never re-flags a row you\r
  already ruled on, exactly like a watermark re-scan;\r
- a **🚩 Find watermarks** run afterwards will not undo it: text zones survive\r
  the scan, and a watermark box found on the same image joins them.\r
\r
**Try it on a sample before paying for the whole bank.** The launch window\r
carries two dials. *Try on a sample first* reads only the first N images of\r
the scope (deterministic — a re-read hits the same pages), so on a 9 000-page\r
bank you can judge the result on twenty before committing to the rest.\r
*Sensitivity* is the OCR confidence a line needs to become a zone — lower\r
catches fainter or more stylised lettering at the cost of false zones. It is\r
stored (one value, both surfaces), and the zones are always yours to edit\r
afterwards in **🚩 Edit mask**.\r
\r
**The result shows up in the same window.** Launching does not close it: the\r
flagged pages appear below the dials with every zone drawn on them, filling\r
in live while the scan runs — on both surfaces (the strip shows the first\r
pages and says how many are flagged in total, and each tile opens the\r
full-size page).\r
Judge the zones, adjust the two dials, re-run — all without leaving the\r
window; a zone that landed wrong is fixed by hand in **▶ Review** /\r
**🚩 Edit mask** as before. Close it whenever you are done looking.\r
\r
**Clean text and watermarks separately.** Once Find text has flagged\r
something, the repaint level grows a **What to clean** switch — *Both*,\r
*🔤 Text*, *🚩 Marks* — next to the LaMa/Klein engine toggle (the bank's\r
Watermarks panel and the dataset's Clean row both carry it, and the Clean\r
button's count follows the choice). The split is **by page**: a page carrying\r
both a watermark and text counts as text and is repainted whole — its zones\r
live in one mask, so one page is never split between two runs. With no\r
text-flagged page the switch stays hidden, because all three choices would\r
mean the same thing.\r
\r
It works on both surfaces, at full parity — a bank's Watermarks panel\r
carries the **🔤 Find text** card next to 🚩 Find, and a dataset's curation\r
row carries the same button next to its watermark scan. Both open the same\r
launch window: the sample dial, the Sensitivity slider (one stored value,\r
whichever side you move it from), the measured count of what the run will\r
actually read, and the flagged-pages strip.\r
\r
\r
## Fix a watermark mask — or mark one the scan missed\r
\r
The detector draws **one** box, and it is a guess: it can miss a second logo,\r
swallow half the face, or land beside the mark. Open **▶ Review**, walk to the\r
image and press **🚩 Edit mask** (shortcut \`M\`) — the same zone editor the\r
datasets use, on the bank image, right there.\r
\r
It also opens on an image the scan flagged **nothing** on, where the button reads\r
**🚩 Mark a watermark** instead. This is the answer to a miss: the detector is a\r
classifier, and a mark tiled across a whole stock photo can score under any\r
sensitivity you set. **The zones you draw become the flag**, so the cleaning\r
steps below can act on an image the scan cleared. It works the same way in a\r
dataset, from the image viewer.\r
\r
Drawing on an image you had **dismissed** as a false positive takes that ruling\r
back. The one image that refuses is one already **cleaned** — its pixels have\r
been replaced, so a zone drawn now would describe a picture that no longer\r
exists; use **↩ Undo cleaning** first.\r
\r
- **+ Add zone**, then drag on the photo to draw a rectangle over the mark. Up\r
  to 32 zones; drag a zone to move it, its corners to resize.\r
- **Delete zone** removes the selected one, **Reset to detected** throws your\r
  zones away and puts the detector's box back.\r
- Every edit saves as you draw. If a save fails it says so and offers a retry —\r
  the zones on screen are never silently unsaved.\r
\r
What the two cleaning steps then do with your mask:\r
\r
- **🧽 Inpaint acts on the zones you drew** — all of them, including a zone\r
  sitting on the subject, which is precisely what a hand mask is for. **On\r
  LaMa** they are exactly what gets repainted, and nothing else is touched. **On\r
  Klein** they are erased from the photo first and then the whole picture is\r
  re-rendered, so your zones decide what is guaranteed to go, while the pass also\r
  clears marks you did not draw — and everything else is re-rendered with them.\r
  Drawing zones therefore buys precision on LaMa, and on Klein it buys certainty\r
  about the marks you pointed at.\r
- **✂ Auto-crop skips a hand-masked image.** A crop can only cut one border\r
  band; it cannot express several zones or a mark on the subject, so cropping\r
  the old box would remove pixels you did not point at.\r
- **An empty mask cleans nothing.** Delete every zone and you have said "there\r
  is nothing to repaint here": neither step touches that image, and the panel\r
  says how many are in that state instead of leaving them looking unhandled.\r
\r
A flagged image an older scan left *without* a box becomes cleanable as soon as\r
you draw the zones yourself — that drawing is the missing information. And as\r
everywhere else in a bank, **your own file is never modified**: cleaning writes\r
a separate copy. A rotated image is shown unrotated here, because the whole\r
watermark lane works on your original file, which the ↻ turn never changed.\r
\r
\r
## Reject every flagged image at once\r
\r
In a dataset, **🧽 Find watermarks** flags the kept images that carry an overlaid\r
mark. The recommended way through the pile is **🔍 Review flagged**, one image at\r
a time — the detector is a review flag, not a verdict, and it *does* flag clean\r
images sometimes. When you would rather drop the whole pile and move on,\r
**✕ Reject all flagged (N)** does exactly that.\r
\r
Four things worth knowing before you click it:\r
\r
- **The number is the number.** \`N\` is what the button will really reject, not\r
  how many are flagged. Small-image rescue pairs are excluded (the server refuses\r
  a batch containing one, so including them would reject *nothing*) and failed\r
  rows are excluded (the server skips them). If the two differ, the row says so\r
  in plain text rather than showing you the bigger figure.\r
- **Nothing is deleted.** Rejected images stay on disk and simply leave the\r
  training set. To bring any of them back: **Show ▸ Rejected** in the grid,\r
  select, then **✓ Keep**.\r
- **It clears the watermark flags.** That is the one thing rejecting destroys:\r
  after the click, 🔍 Review flagged is empty and nothing records which images\r
  had been flagged. Re-run 🧽 Find watermarks to flag them again.\r
- **Stop is available while a scan runs.** The ⏹ Stop button in the progress\r
  banner ends the scan at the next image; everything already judged is kept, and\r
  running 🧽 Find watermarks again finishes the rest.\r
\r
Which engine does the flagging is a setting — **Settings ▸ Captioning & quality ▸\r
Watermark detection** — and it applies to datasets and banks alike. *Auto* uses\r
the optional watermark detector when it is installed and the vision model\r
otherwise, which is what the app has always done. Pin *Watermark detector*\r
without the extra installed and the scan still runs, on the vision model, and\r
says so with the link to install it. Only the detector can flag an image\r
**without a position**; those are counted apart, 🧽 Clean leaves them alone, and\r
you can draw the zone in 🔍 Review flagged. Images you dismissed as false\r
positives are skipped by every later scan — **⟲ Rescan incl. dismissed** is the\r
only way to have them judged again, which is what you want after changing engine.\r
\r
\r
## A bank and a dataset never share files\r
\r
A dataset and an image bank can hand images to each other in both directions,\r
and both directions **copy**. That is not an implementation detail — it is the\r
rule the whole flow rests on:\r
\r
The files generated for **ai-toolkit are not LDS's dataset registry**. At launch,\r
LDS freezes a disposable training export (kept images, captions and a freshly\r
generated job config) from its own Dataset rows. Bank/Dataset identity, analysis\r
history and comparisons stay in LDS's database plus its SHA-bound snapshot/cache\r
sidecars; they are not reconstructed from an old ai-toolkit config file.\r
\r
- **Bank → dataset** (**⬆ Promote**) writes new files into the dataset.\r
- **Dataset → bank** (**🗃 Import to bank**, on the dataset) copies the dataset's\r
  kept images into a folder of the bank's own. Both choices retain the\r
  Dataset-owned captions, keep/reject curation, framing, watermark and\r
  provenance. Its dialog defaults to **Reuse compatible final-file analysis**;\r
  **Start fresh analysis** skips only reuse of prior analysis, not that metadata.\r
  The AI **Face**, **Score** and **SigLIP 2 semantic** results are not reused after\r
  normalization or another transformation because they are no longer proved.\r
\r
Neither ever *points* at the other's files. The reason is that the two containers\r
have opposite contracts. A dataset **owns** its images; a bank merely **points**\r
at a live folder it does not own — which is exactly why 🗑 **Delete rejected** is\r
allowed to remove files from it. Put a bank on a dataset's folder and that button\r
stops deleting your rejects and starts deleting the dataset's training images.\r
\r
So the app refuses it. If you paste a dataset's image folder into **➕ Create\r
bank** — or into **📦 Move folder** for an existing bank — you get a refusal\r
that names the dataset and points you at **🗃 Import to bank** instead. The check\r
looks through the disguises: a subfolder of the dataset, the folder *containing*\r
all datasets, a different letter case, forward slashes instead of backslashes,\r
and symlinks or Windows junctions that resolve to the same place.\r
\r
**If you already have such a bank** (it was possible before this check existed),\r
nothing is repaired or deleted behind your back. Opening it shows a red banner\r
naming the dataset, and 🗑 Delete rejected is refused on that bank — everything\r
else keeps working, so you can finish triaging. When you are ready, either\r
**📦 Move folder** to point the bank at a folder of its own, or remove the bank\r
(removing a bank never touches files).\r
\r
The dataset's own folder is shown at the top of the dataset, with a **⧉ Copy**\r
button, so you never have to go hunting for it in a file manager — which is how\r
this trap was found in the first place.\r
\r
\r
## Two banks, one card (banks that share a name)\r
\r
Sometimes one collection lives in two folders — an export split across disks, a\r
scrape that grew a second destination, a phone dump and a laptop dump of the same\r
shoot. You want them curated as one thing while the files stay exactly where they\r
are.\r
\r
**Give the two banks the same name and they become one card.** Nothing is merged\r
and nothing is copied: every image still belongs to exactly one bank, on its own\r
disk, in its own folder. The card is a view — combined counts, one **⏳ Queue the\r
group…**, one **⬆ Promote the group…** — with all the members one click away\r
under **▸ N banks**, each keeping its own rename, 📦 move, ✕ delete and preview.\r
\r
The rule is deliberately small enough to keep in your head:\r
\r
- names must match **exactly**, ignoring only surrounding spaces. **Case\r
  matters**: "Telegram" and "telegram" stay apart. Merging them silently would be\r
  a surprise you cannot undo by looking at the screen; not merging them is fixed\r
  by an obvious rename.\r
- it takes **two**. A single bank with a name is just a bank.\r
- **Keep separate**, on any member, takes that bank out of the grouping. It is a\r
  property of the *bank*: rename it away and back and it is still separate,\r
  because clearing it for you would silently re-group something you deliberately\r
  split.\r
\r
**Renaming is the whole mechanism.** Rename a bank into the group's name and it\r
joins; rename it away and it leaves. Delete a member and the group shrinks — at\r
one member it stops being a group and the last bank is a bank again. The\r
confirmation for a delete says what it always said: only triage data goes, the\r
source folder is untouched, and the *other* banks are not affected.\r
\r
**Promoting the group** sends every kept image across its members into one\r
dataset, one bank after another. There is no image picker — a group card has no\r
grid, so it is "everything kept here that is not already in the dataset". Two\r
members holding the same photo cost **one** dataset image; the import collapses\r
duplicates. It is refused outright if any member has a pass running, before\r
anything is created.\r
\r
**Queueing the group** adds one entry **per bank**, exactly like queueing them by\r
hand. They still run one at a time — and unlike unrelated banks, that holds even\r
across machines: the group is one card, so only one of its members is ever\r
running, whichever machine each was sent to.\r
\r
One honest limit: if two members point at **overlapping folders on disk**, the\r
card's combined counts add the same images more than once. The card says so.\r
Promotion is still correct — the duplicates are collapsed on the way in — but the\r
number above it is a sum of what each bank believes it holds.\r
\r
## Move a bank folder to another disk\r
\r
A bank points at a folder *in place*, but nothing it computes lives in that\r
folder: the quality scores, duplicate groups, face clusters, captions and every\r
keep/reject decision are stored against the image row, and each row remembers\r
its file *relative* to the bank's folder. So moving a 30 000-image bank to\r
another drive costs nothing — you just have to tell the app where it went.\r
\r
You can do this in either order. **📦 Move folder** sits in the bank's header\r
next to its path (and **📦** on the bank's card in the list), so you can open it\r
before touching anything to see what the app will ask for; it also appears inside\r
the warning shown once the app notices the folder is gone, if you moved first.\r
Paste or browse to the new folder\r
and press **🔍 Check folder**. Nothing is written yet: the app walks the\r
candidate folder and tells you how many of *this bank's* images are in there and\r
how many are not. Paste it however you like — Windows' *Copy as path* wraps the\r
path in quotes, and a trailing \`\\\` or forward slashes are equally fine; the field\r
then shows the folder the app actually resolved, so what you confirm is what it\r
will use.\r
\r
- **All of them found** → confirm, and the bank is repointed with every score\r
  and decision intact.\r
- **Some found, some missing** → you can still confirm. Nothing is deleted:\r
  rows whose file didn't come along keep their analysis and simply read as\r
  missing until the file comes back.\r
- **None found** → refused. That folder is a *different* folder, not a moved\r
  one — the usual cause is picking the parent of the folder you moved.\r
\r
The app never deletes a row on its own, and an analysis pass run while the files\r
are away no longer degrades them either: a file that is *absent* is not a file\r
that is *broken*, so the pass stops and tells you the folder appears to have\r
moved instead of marking thousands of images unusable.\r
\r
## Images you deleted from the folder yourself\r
\r
The bank's folder walk is deliberately **additive**: it registers files that\r
appeared and it *never* removes a row. That rule is what makes an unplugged\r
drive survivable — otherwise one walk with the disk missing would erase a triage\r
built over hours.\r
\r
The cost is that a file you really did delete by hand is counted as *missing*\r
forever, and the count never comes down. The bank's warning line now carries the\r
way out: **Accept — remove N from this bank**, next to **📦 Move folder**. It\r
is on the bank's card in the list and in the workspace header, wherever the\r
warning appears.\r
\r
- It removes **rows only**. Nothing on disk is touched — those files are already\r
  gone.\r
- What you lose with each row is that image's keep/reject decision and its\r
  scores. The confirmation says so before you commit.\r
- It is **never automatic**, and it never runs on the app's initiative. That is\r
  the same principle as everywhere else in the bank: the app reports, you decide.\r
- It is **not offered while the folder is unreachable**, and refused by the\r
  server if asked anyway. With the drive unplugged every row looks missing, so\r
  accepting would delete the whole bank. If the folder simply *moved*, use\r
  **📦 Move folder** instead — that keeps everything.\r
\r
\r
## Make Score use a GPU Python you already have\r
\r
The **✨ Score** pass (aesthetic · NSFW · style) runs in its own small Python\r
environment, and that environment deliberately carries **CPU-only PyTorch**: a\r
first install stays a few hundred megabytes instead of pulling ~2.5 GB of CUDA\r
wheels onto machines that may have no card at all.\r
\r
On a machine that *does* have one, that default is expensive — CLIP measures\r
about **336 ms per image on the CPU against ~15 ms on a recent card**, so a\r
30 000-image bank is the difference between a coffee break and most of an\r
afternoon. The bank says so: when Score is about to run on the CPU on a machine\r
with an NVIDIA card, an amber note gives you the estimate and a button, **⚡ Use\r
a GPU Python I already have**.\r
\r
That button is the point. If you train LoRAs or run ComfyUI, this machine\r
*already* has a PyTorch with working CUDA. Score can simply borrow it — no\r
download, no third environment to maintain.\r
\r
The dialog lists the interpreters the app knows about (the environment it built\r
for scoring, ai-toolkit's, ComfyUI's, its own) and reports each one **package by\r
package**:\r
\r
- **GPU ready** — everything the pass imports is there *and* PyTorch sees the\r
  card. Pick it and the next Score run is minutes instead of hours.\r
- **Missing packages** — the reason is named. The common one is an interpreter\r
  with a perfect CUDA PyTorch but no **OpenCLIP**: Score needs \`open_clip\` and\r
  \`transformers\`/\`timm\` too, so CUDA alone is not enough. Such an interpreter is\r
  **refused**, on purpose — accepting it would trade slow-but-working scoring for\r
  an import error an hour into the pass.\r
- **CPU only** — it can run the pass, it just has no usable CUDA.\r
- **No answer** — the path is not a working interpreter (moved venv, unplugged\r
  drive). Nothing changes.\r
\r
**The app never installs anything into an environment it did not create.** Your\r
ai-toolkit venv runs your training and ComfyUI's runs your generation; a silent\r
\`pip install\` into either is not something a dataset tool gets to do. When a\r
package is missing the dialog shows you the exact command and leaves the choice\r
to you — run it in a terminal, then hit **↻ Check again** and the row updates.\r
\r
**Not listed? That field is not a fallback.** Most machines have neither\r
ai-toolkit nor ComfyUI where the app looks — or at all — so entering a path\r
yourself is a first-class route, checked exactly the same way. Paste an\r
interpreter *or* the environment folder that contains it: a venv, a conda or\r
miniconda env, a uv venv, a portable bundle, the system Python, something on a\r
second disk. Spaces, accents and quotes around the path are fine ("Copy as path"\r
on Windows wraps it in quotes; that is handled). The layout is never assumed —\r
the app knocks on the shapes an environment can have and keeps whichever one\r
actually answers.\r
\r
No version of PyTorch or CUDA is required. The only question asked is the one\r
that matters: do the packages import, and does PyTorch see a card. An old card\r
on cu118, a 50-series that only works on cu128, a nightly build — all fine.\r
\r
**No NVIDIA card?** Then there is nothing to fix, and the app says so plainly\r
instead of suggesting a CUDA install you could not use. Borrowing an interpreter\r
is still offered, for one honest reason: if another Python here already has the\r
packages, you can skip installing them a second time. It will not be faster.\r
\r
**What borrowing a GPU interpreter changes besides speed.** This is the one part\r
that is not a free win, and it is worth reading before you pick. A Score pass\r
that runs **on the GPU takes the card exclusively** for its whole duration:\r
ComfyUI's VRAM is freed before the pass starts, a training run cannot begin until\r
it finishes, and every other GPU pass — including banks waiting in the queue —\r
answers *"GPU busy"* meanwhile. On the CPU-only default, Score holds nothing and\r
happily runs alongside your generation. So a fast pass costs you the card while\r
it runs; a slow one costs you time but nothing else. The dialog states this on\r
every CUDA row, and once a GPU interpreter is in use the bank panel keeps saying\r
it.\r
\r
**If you borrow ComfyUI's own Python**, one extra thing to know: Score frees\r
ComfyUI's VRAM, but it does not close ComfyUI, and CUDA start-up in the borrowed\r
interpreter can stall against a process still holding the card. If a first pass\r
sits at zero and never moves, close ComfyUI and start it again. You are not stuck\r
either way — a pass that produces no output at all for **15 minutes** is stopped\r
for you, the GPU is released, and the bank says what happened instead of leaving\r
everything refusing "GPU busy".\r
\r
**Back to the app default** puts everything back exactly as it was. The choice is\r
reversible at any time, and the note under the passes always says which\r
interpreter is in use. If you never open this dialog, nothing changes: an install\r
that works today keeps working, untouched.\r
\r
\r
## Build the SigLIP 2 index on a GPU Python you already have\r
\r
The **SigLIP 2** semantic engine is the same story with a different dependency\r
list. Its index is built by a worker that lives in the app's own environment —\r
the CPU-only one — so on a machine with a card the index crawls for the same\r
reason Score used to.\r
\r
SigLIP 2 is the lighter of the two: **92.9 M parameters against 303 M for the\r
CLIP ViT-L/14 Score runs**, measured at about **105 ms per image on the CPU**\r
rather than 336. Lighter is not free: a 30 000-image bank is still the better\r
part of an hour.\r
\r
The **Semantic engine** panel now tells you which device the index will actually\r
use, and when a card is sitting idle it offers the same button, **⚡ Use a GPU\r
Python I already have**. It is the same detector, the same dialog and the same\r
promise — with one difference that matters:\r
\r
**The dependency list is SigLIP 2's, not Score's.** The semantic worker never\r
imports \`open_clip\` or \`timm\`. An interpreter Score refuses for a missing\r
OpenCLIP — the most common shape of a ComfyUI venv — can be perfectly good here,\r
and refusing it would be a lie about a worker that does not need it. What it\r
*does* need is a **Transformers recent enough to carry \`Siglip2Model\`** (4.49 or\r
newer). That one is checked by really looking for the class, not just for the\r
package: an older \`transformers\` imports fine and then dies at model load, an\r
hour into an index. Such an interpreter is refused, and the repair line the\r
dialog hands you carries the version floor.\r
\r
**Borrowing an interpreter downloads nothing here.** The pinned SigLIP 2\r
checkpoint lives in the app's own data folder, not inside the interpreter, so a\r
borrowed Python needs no copy of it.\r
\r
**Where the index runs is not where anything is installed.** Setup ▸ Quality\r
tools always installs SigLIP 2 into the environment the app built, whatever you\r
picked in this dialog — including when you later hit Install/repair, which now\r
*keeps* your choice instead of quietly putting the index back on the CPU.\r
\r
\r
## Run the watermark detector on a GPU Python you already have\r
\r
The **🚩 Find** scan is the third pass with the same story. Installing the\r
watermark detector (Setup ▸ Quality tools) builds it a small environment with\r
**CPU-only PyTorch** — the same deliberate default as Score — and *pins* that\r
environment as the detector's interpreter. On a machine with a card the scan\r
therefore ran on the CPU, silently, however good the GPU sitting idle next to\r
it was.\r
\r
Two things changed:\r
\r
- **The Bank's 🚩 Watermarks panel now says it.** When the fast detector is\r
  installed but its Python cannot reach CUDA on a machine that has a card, an\r
  amber note names the situation and offers the same button as Score and\r
  SigLIP 2: **⚡ Use a GPU Python I already have**. The pass summary also\r
  reports which device the scan *actually* ran on — "(detector on GPU, …)" or\r
  "(detector on CPU, …)" — read back from the scan itself, not from a guess.\r
- **The picker speaks the detector's own dependency list.** It never imports\r
  \`open_clip\`, \`timm\` or even NumPy, so the ComfyUI interpreter Score refuses\r
  is usually perfect here. What it *does* need is a **Transformers carrying\r
  both halves of the cascade** — the SigLIP classifier and the Grounding-DINO\r
  locator (4.40 or newer). Both classes are really looked for, not assumed\r
  from the package name, and an interpreter missing either is refused with the\r
  exact repair command.\r
\r
**Borrowing an interpreter downloads nothing.** The detector's pinned weights\r
live under the app's models folder, not inside the interpreter. And as\r
everywhere in this dialog family, nothing is ever installed into an\r
environment the app did not build — **Back to the app default** reverts the\r
choice at any time, after which the scan falls back to Score's interpreter and\r
then the app's own, exactly as before.\r
\r
Score and the semantic index are chosen separately. Pointing one at an\r
interpreter never moves the other, and **Back to the app default** undoes either\r
on its own.\r
\r
## The video bank (turn a folder of rushes into shots)\r
\r
Videos are a different kind of material and they get their own bank. On the\r
**🗃️ Bank** page the switch at the top right says which kind you are making —\r
**🖼 Images** or **🎬 Video**. This matters more than it looks: an image bank\r
skips every \`.mp4\` you drop into its folder **without a word**, so a folder of\r
video used to look like an empty bank.\r
\r
A video bank triages **shots**, not files. One two-hour rush is not something you\r
can judge; the three hundred shots inside it are.\r
\r
1. **Create it** — name it, point it at the folder. Every \`.mp4\`, \`.mov\`, \`.mkv\`,\r
   \`.webm\` and \`.avi\` under it (subfolders included) is inventoried in place.\r
   Nothing is copied, and **no pass ever modifies your files** — scanning,\r
   cutting and building all write elsewhere. The one thing that adds to that\r
   folder is a scrape you send to this bank yourself (next step).\r
1bis. **🕸 Scrape the web into a video bank** — you don't need a folder of rushes\r
   you assembled by hand. Unfold **🕸 Scrape the web into a video bank** on the\r
   video bank list, choose a destination, then scan a URL and pick clips exactly\r
   as you would pick images. The scanner has always listed videos — RedGifs,\r
   Erome, Picazor, TikTok, X, Civitai and the gallery sources all return them —\r
   and the picker now shows them, with a ▶ badge and their length. They are\r
   downloaded, inventoried on the spot, and cut into shots when you run the\r
   passes above.\r
\r
   Two things are worth knowing:\r
\r
   - **Nothing is judged on the way in**, exactly like the image bank. Length,\r
     motion, sharpness and near-duplicates are verdicts the **📊 Measure\r
     quality** pass produces, with thresholds you move. A clip refused at\r
     download time is one you could never have reviewed.\r
   - **Any bank can receive them, and the picker says where they will land.**\r
     A **new bank** gets a folder of its own under the app's own storage. **Add\r
     to an existing bank** offers every bank you have, including one you pointed\r
     at your own footage — the clips are simply added to the folder that bank\r
     follows, and the picker prints that folder's path before you start.\r
     Choosing the bank is the whole confirmation; there is no second checkbox.\r
     The one destination that is refused is a bank sitting on a *dataset's* own\r
     folder, where new files would end up inside training material.\r
2. **▶ Run everything** chains the three passes in the only order that works:\r
   **scan** reads what each file is (length, size, frame rate), **find shots**\r
   cuts it at its shot boundaries, and **make thumbnails** grabs one frame from\r
   the middle of each shot. Each pass is also available on its own, and the box\r
   above the buttons always names the one step to take next — run them out of\r
   order and each simply finds nothing to do and reports success.\r
3. **Triage** — the grid is thumbnails, and only thumbnails. Click one to watch\r
   exactly that shot, \`←\`/\`→\` to move, \`K\` to keep, \`R\` to reject. Filter by\r
   status, or click a file in the **Files** list to see only its shots. For a\r
   whole bank at speed, **⌨ Burst mode** judges shots straight from the grid,\r
   one keystroke each — see *Triage a video bank from the keyboard* below.\r
4. **🎬 Build the dataset** encodes what you kept. This is the only step that\r
   writes video.\r
\r
**Nothing is encoded while you triage.** A bank stores where each shot starts and\r
ends — no clip file exists until you promote — which is why a bank of hundreds of\r
shots costs no disk space, and why the player streams the original file rather\r
than a preview.\r
\r
**A missing piece never disables the whole lane.** The video extra is three\r
independent things: reading files, finding shots, and encoding clips. The app\r
says which one is missing and what still works — with no ffmpeg, for example, you\r
can scan, cut, watch and triage an entire bank, and only the final build waits.\r
\r
## Triage a video bank from the keyboard\r
\r
A rush of two hours becomes three hundred shots, and judging them by clicking a\r
tile, clicking ✓ or ✕, then coming back to the grid is three gestures each. **⌨\r
Burst mode**, above the gallery, makes it one keystroke.\r
\r
Turn it on and one tile carries the cursor — an amber ring and a **▸ next**\r
marker under the thumbnail. From there:\r
\r
| Key | What it does |\r
| --- | --- |\r
| \`K\` | Keep this shot |\r
| \`R\` | Reject this shot |\r
| \`P\` | Put it back to untriaged |\r
| \`S\` or \`→\` | Move on without deciding |\r
| \`←\` | Move back one shot |\r
| \`U\` | Undo the last decision, and go to that shot |\r
| \`Home\` | Jump to the first untriaged shot |\r
| \`?\` | Show or hide the shortcut panel |\r
| \`Esc\` | Leave burst mode |\r
\r
They are the same keys as the image bank's **▶ Review** — \`K\` keep, \`R\` reject,\r
\`S\` skip, \`←\` back, \`Esc\` out — because a reflex that is right on one screen and\r
wrong on the next is worse than no reflex. \`P\`, \`U\` and \`Home\` are this lane's\r
own: a video bank has three verdicts where the image review has two.\r
\r
Four things are worth knowing before you lean on it:\r
\r
- **The cursor jumps to the next shot you have not judged yet**, not simply the\r
  next tile. On a half-triaged bank that is most of the speed. Untick\r
  **Auto-advance** and the cursor stays put instead, so \`K\` then \`R\` corrects\r
  the same shot — useful when you are being careful rather than fast.\r
- **It never wraps.** When nothing untriaged is left ahead of the cursor, the\r
  bar says so — and says how many are still sitting *behind* it, with \`Home\` to\r
  go back to the first. A run that silently looped back to the top would put\r
  your next keystroke on a shot you did not expect.\r
- **Undo goes back one step at a time, and shows you what it fixed.** The bar\r
  always names the decision it would take back (*"↩ U undoes ✕ Reject on 0:12 –\r
  0:15"*) and how many steps are left in the net — ten. Each \`U\` restores what\r
  the shot actually was before, so undoing a reject on a shot you had already\r
  kept puts the **keep** back, not a blank. The offer sits in the bar rather\r
  than in a toast on purpose: at one keystroke a second a toast is replaced\r
  before it can be read.\r
- **Your keystrokes never wait for the network.** The tile flips and the cursor\r
  moves at once; the decisions are sent behind you, one request at a time, and a\r
  run of identical verdicts goes out as a single batch. The bar shows *saving\r
  N…* while anything is still unacknowledged — a run that has ended is not the\r
  same thing as a run that is saved. If a save does fail, nothing is guessed:\r
  the grid is reloaded from the bank and the message says how many decisions did\r
  not land.\r
\r
Shortcuts never fire while you are typing in the search box or a threshold\r
field, and the mode and the auto-advance setting are remembered for next time.\r
\r
## Measure your shots, and choose your own cuts\r
\r
**📊 Measure quality** reads every frame of every shot in one pass and scores the\r
four things that quietly ruin a video dataset: shots that barely move, shots that\r
are all blur, black moments, and frozen stretches. The pass stores raw numbers,\r
never verdicts — so changing a threshold later re-sorts the bank instantly, with\r
no rescan. Stopping is safe; a re-run picks up where it left off.\r
\r
Flagged shots get an **amber ⚑ mark** in the grid. Amber, not red, because a flag\r
is a reason to *look* — nothing is ever rejected for you. Hover the mark to see\r
which cuts a shot tripped.\r
\r
**There are deliberately no default thresholds.** The same number that flags 2 %\r
of one bank flags 12 % of another — a cut only means something against *your*\r
bank's own distribution. Open **🎚 Quality cuts**, type a value (leave a field\r
empty to disable that cut), and press **👁 Preview**: it answers with how many\r
shots each rule would flag, per rule, before anything is applied. If a draft\r
would flag most of the bank, the preview says so in as many words instead of\r
letting you apply it by accident.\r
\r
**One cut needs no measuring at all: Minimum length.** Shot detection keeps very\r
short cuts on purpose — a real flash cut is a real shot, and a detector that\r
refuses to emit one also hides genuine boundaries. The cost is a grid peppered\r
with half-second shots you scroll past a hundred times. Type a value in seconds\r
and every shorter shot wears the flag, immediately after detection, with no\r
measuring pass — this cut reads the shot's own bounds rather than its pixels.\r
\r
Do not confuse it with the *too short* refusal you may see at promotion. That one\r
is your target profile's arithmetic — so many frames at so many fps — and no\r
setting on this panel moves it: those shots were never going to land. **Minimum\r
length** only decides what gets flagged for your eyes, so you can see and sort\r
them *before* spending triage time on them.\r
\r
Two touches you get for free once shots are measured: thumbnails move from the\r
middle-of-shot guess to the **sharpest measured frame**, and the freeze detector\r
catches the failure the averages never can — a shot that plays fine and then\r
hangs on a still image for a second. On a real 4.5-hour test bank that turned\r
out to be the most common defect of all.\r
\r
**The sound is measured too, for the targets that keep it.** LTX and MiniMax H3\r
mux the source's audio into every clip; Wan has no audio at all and forces the\r
track off. So the pass also reports, per shot, **how much of it is silence** and\r
**its overall level in dBFS** — because a dataset of silent clips teaches the\r
model to be silent, and nothing about the file on disk reveals it: it is the\r
right length, the right sample rate, and mute. Two cuts go with them, **Silent\r
share** and **Loudness floor**, and they raise two different flags on purpose —\r
a quiet clip can be normalised, a silent one cannot be rescued.\r
\r
Three states are kept apart here, and it matters:\r
\r
- **no sound track** — a property of the file. Never flagged; a Wan dataset is\r
  supposed to look like this.\r
- **silent** — a track that is there and carries nothing. That is the defect.\r
- **not measured** — nobody has listened yet. Shots measured before this shipped\r
  carry no sound reading at all, and an audio cut will never flag them. **Run\r
  Measure again with re-measure** to fill them in; the pass otherwise skips\r
  everything it has already done.\r
\r
### 🔳 Safe zone — the bands and the text you cannot see at thumbnail size\r
\r
Two things eat a frame without ever showing up in a 90 px grid, and both are\r
perfectly consistent across every clip that came out of the same file — which is\r
exactly what a LoRA learns first:\r
\r
- **Bands.** Letterbox, pillarbox, a vertical video somebody padded into 16:9, a\r
  4:3 broadcast scanned into a wide container. They survive a training crop.\r
- **Burned-in text.** Subtitles, chyrons, lower thirds, a text watermark. A model\r
  trained on subtitled footage does not learn the words — it learns that the\r
  bottom sixth of a picture is a place where letters live, and then it draws\r
  letter-shaped gibberish there forever.\r
\r
**🔳 Safe zone** decodes three frames of each shot and measures both, then\r
works out the rectangle that excludes them — the *safe zone* — and how much of\r
the frame that rectangle keeps. Three cuts read those numbers: **Letterbox\r
share**, **Burned-in text share** and **Usable frame floor**. Like every cut in\r
this panel they are empty by default and applied at read time, so moving one\r
re-sorts the bank with nothing rescanned.\r
\r
**Only what holds still across the three frames counts.** That is the whole\r
discrimination and it goes both ways: a band has to be on all three frames to be\r
called structural, so a fade-out never invents one; and a text zone needs a\r
partner in another frame, so a subtitle, a chyron and a station logo are caught\r
while a shop sign in a pan and a newspaper someone holds up for a second are left\r
alone as scene content.\r
\r
**Text in the MIDDLE of a frame is the case worth understanding.** It is small,\r
so the text share barely moves — but there is no crop that removes it, so the\r
usable frame collapses. That is what the third cut is for, and its answer to "can\r
I save this clip by cropping" is an honest no.\r
\r
**Reading text needs one small extra**, *Burned-in text* in Setup (RapidOCR, CPU\r
only, no GPU, and its weights ride inside the package so it works offline).\r
Without it the pass still runs and still measures the bands — it reports **bands\r
only** and stores no text reading at all, so the two text cuts flag nothing\r
rather than quietly clearing every shot. This is the only pass in the app that\r
works at half strength instead of refusing; the button stays enabled and says so\r
in its tooltip.\r
\r
It is its own button rather than part of another pass, because unlike ✂ Duplicates\r
and 🎨 Look it consumes nothing: a shot can be measured the moment its file has\r
been scanned. It decodes three frames per shot and reads them on the CPU, so a\r
big bank takes real time — and it never touches the GPU, so it can run while a\r
training is going.\r
\r
### 🩻 Defects — what a re-encode left behind\r
\r
The passes above measure your *footage*: how it moves, how it is lit, how sharp\r
it is. This one measures the *file* — what happened to it between the camera and\r
your disk. Material that was uploaded, transcoded and re-uploaded a few times\r
carries damage that no thumbnail shows and that sits identically on every frame\r
of every shot from that file, which is precisely the kind of thing a LoRA learns\r
first and fastest.\r
\r
**🩻 Defects** hands each source file to ffmpeg once and reads three things back:\r
\r
- **Duplicated frames.** Frames that are near-copies of the one before them. This\r
  is what 24 fps material uploaded as 30 fps looks like — one frame in five is a\r
  repeat — and it is *not* the frozen-stretch flag: that one says nothing moved,\r
  this one says the same picture was delivered twice. A shot can be full of\r
  movement and full of duplicates at the same time.\r
- **Compression blocks.** The 8×8 macroblock grid showing through a hard squeeze.\r
  Nothing legitimate produces one: no camera, no lens, no lighting.\r
- **Blurred edges, at full size.** Edges that stay wide even in the shot's\r
  sharpest moments.\r
\r
**That last one is the reason this pass exists**, because it is the one thing\r
nothing else in the app can see. The **Sharpness floor** above reads a Laplacian\r
computed on a 160-pixel-wide analysis copy — deliberately, since that measurement\r
over a full frame costs more than decoding it — and at 160 pixels, footage\r
upscaled from 480p and the genuine 1080p **are the same picture**. Measured on\r
three files carrying identical footage, the sharpness score read 354.35, 353.69\r
and 353.72 for native, 480p-upscaled and 320p-upscaled. Indistinguishable. This\r
pass reads the edges at full resolution instead and separates them.\r
\r
It reads the *sharpest* tenth of each shot rather than the blurriest, and that is\r
on purpose: softness is sometimes a choice — a fast pan, a shallow depth of\r
field, a deliberate rack focus — so asking "is it soft even at its sharpest" is\r
the only form of the question that does not flag exactly the shots with the most\r
interesting movement.\r
\r
Three cuts read the numbers: **Duplicated frames**, **Compression blocks** and\r
**Blurred edges**. Empty by default like everything else here, and applied at\r
read time, so moving one re-sorts the bank with nothing rescanned. **The block\r
score deserves one warning the others do not:** its absolute value depends on\r
what is in the frame nearly as much as on the damage — measured here, one scene\r
from a good encode to a ruined one moved from 13 to 43, while four *different*\r
scenes at one fixed quality spanned 1 to 25 000. Preview a value, look at what it\r
caught, move it. Do not carry a number over from somebody else's bank.\r
\r
**Each file card now also shows how hard the file was squeezed** — its codec\r
profile, its bitrate, and *bits per pixel per frame*, which is the comparable one\r
(5 Mb/s is generous at 480p and starving at 4K). Roughly, under 0.05 is visibly\r
damaged and over 0.15 is comfortable. It is shown and never cut on, because it\r
only *predicts* the damage that the block score actually *measures* — and some\r
containers, MKV and WebM in particular, carry no bitrate at all, in which case\r
the line simply says less rather than inventing a number.\r
\r
It is its own button, like 🔳 Safe zone and for the same reason: it consumes\r
nothing, so there is no order to protect. Two things are worth knowing before you\r
press it. It is the only reading pass that needs **ffmpeg** rather than the\r
decode extra — the video extra installs it, and without it this one button is\r
greyed with the reason in its tooltip while everything else keeps working. And it\r
costs real time: roughly **nine seconds per minute of 1080p source**, on the CPU,\r
never touching the GPU. A four-hour bank is a little over half an hour. Stopping\r
is safe and a re-run picks up at the first file it had not reached.\r
\r
### 🤖 AI check — shots that may have been generated rather than filmed\r
\r
Every pass above measures something the camera did. This one asks whether there\r
was a camera. A scrape in 2026 brings back generated clips mixed in with real\r
footage, and they are invisible at thumbnail size — a clean, well-lit,\r
well-framed synthetic clip passes the quality scan, the safe zone, the defect\r
sweep and the look score without a mark on it. It is worth finding: the published\r
curation work behind several open video models reports that even a small\r
minority of synthetic material in a corpus — under a tenth of it — measurably\r
degrades what a model trained on that corpus learns.\r
\r
**🤖 AI check** decodes two contiguous seconds from the middle of each shot and\r
measures **how erratically the motion changes**. Not how much a shot moves — how\r
much the *rate* of movement varies from instant to instant. Real footage is full\r
of small irregularities: a hand shakes, a subject accelerates unevenly, light\r
flickers, the sensor is noisy. Generated footage, on the evidence the method was\r
built on, tends to be smoother than the world.\r
\r
The number is stored per shot and read by one cut in **🎚 Quality cuts**,\r
**Motion irregularity floor** — the one threshold in the panel that works the\r
other way round from the rest. **A LOW score is the suspicious one**, so this is\r
a floor and raising it flags *more* shots; a shot below it wears a **May be\r
AI-generated** chip in the grid like any other flag. Set it as a \`_max\` in your\r
head and you will flag every handheld shot in the bank and clear every generated\r
one.\r
\r
#### How much to trust it — read this before you use it\r
\r
Not much, and the pass is built around saying so.\r
\r
- **About three shots in four**, on material like yours. The SAFE Challenge\r
  evaluated AI-video detectors *blind*, on footage the entrants had never seen:\r
  the best system in the field scored **0.86** balanced accuracy on untouched\r
  video and **0.74** once that video had been post-processed. Re-compression\r
  alone moved AUC from 0.88 to 0.77. Anything scraped has been re-compressed by\r
  definition, so 0.74–0.75 is the honest figure — not the high nineties a\r
  detector's own paper reports on its own benchmark.\r
- **It has never been measured against a 2025-or-later generator.** The method\r
  was evaluated across forty subsets of 2023–24 output — ModelScope, Gen2, Pika,\r
  LaVie, Sora, CogVideoX, OpenSora and a dozen more. Its whole thesis is that\r
  *the generators of that moment* could not render second-order motion. That is\r
  exactly the kind of claim that decays, and nothing here says anything about\r
  Sora 2, Veo 3, Kling or Wan 2.5.\r
- **It is worst on the cheapest fakes.** On one generator whose output is\r
  incoherent and flickery, the reference implementation scores *below chance* —\r
  chaotic generation reads as *more* real than clean generation. Heavily\r
  stylised material and a hard cut inside the two-second window do the same\r
  thing.\r
\r
So this is an **advisory** flag with a hedge built into its name. It ships with\r
no default, nothing in the app rejects or deletes a shot because of it, and the\r
chip says *may be*. Use it to decide what to look at, not what to throw away.\r
\r
#### The mechanics\r
\r
- Shots shorter than about **2.4 seconds** are not measured at all — the window\r
  needs sixteen frames at 8 fps plus a margin at each end so a dissolve never\r
  lands inside it. Those shots carry "too short" and no score, and they are\r
  never flagged. Re-running will not change that; re-cutting them would.\r
- **There is no value to type.** The method reports only rank metrics and its\r
  reference implementation contains no threshold anywhere, so no published\r
  number exists and nobody else's would transfer — the score's scale moves with\r
  the encoder and with the frame count. Use **Preview** against your own bank,\r
  look at what a value caught, move it.\r
- It runs on the **CPU**, deliberately, at roughly **0.8 seconds per shot** —\r
  about forty minutes for a three-thousand-shot bank. That is slower than the\r
  card would be, and it is the trade that lets you check a bank *while a\r
  training owns your GPU*. Stopping is safe; a re-run picks up where it left off.\r
- It needs the same **✨ Score interpreter** the look score uses, and downloads\r
  its encoder once on the first run.\r
\r
#### It is not the same claim the image bank makes\r
\r
The 🗃️ Bank already tells you whether a still is AI, and the two answers are\r
**different in kind**, which is why they are worded differently. The image\r
lane's \`AI\` verdict reads **metadata** — a generator's own prompt block inside\r
the PNG, an A1111 parameter string, a C2PA mark — and that is *proof* when it is\r
present. It is also absent from almost everything scraped, and its silence means\r
"unknown", never "not AI". This pass reads **the pixels** and infers, so it is\r
never proof and it is never silent. The image lane says *AI*; this one says *may\r
be*. Neither is evidence for the other.\r
\r
### 🎥 Camera — what the camera did, as a label rather than a verdict\r
\r
Every other pass on this page measures whether a shot is **good**. This one\r
measures what it **is**, and it never rejects anything. That is not politeness:\r
a video LoRA learns camera language along with the subject, and the two people\r
training on the same bank want opposite halves of it. One is building a\r
locked-off product shot and every wobble is contamination; the other is training\r
a handheld look, and the wobble *is* the target. So **🎥 Camera** labels, and you\r
decide which half you wanted.\r
\r
Press it after the shots are cut. It tracks every frame of every shot — about\r
fifteen times real time on the CPU, so it can run while a training owns your card\r
— and stores the raw rates on each clip. The labels are worked out from those\r
rates when the gallery is drawn, so nothing is ever rescanned.\r
\r
#### The labels\r
\r
Eight of them are **the video trainer's own words**, not this app's. They come\r
from the vocabulary Hunyuan's camera classifier uses, which matters for one\r
practical reason: a label here will mean the same thing to the model you train\r
as it does to you.\r
\r
| Label | What it means |\r
| --- | --- |\r
| **Pan left / right / up / down** | The frame moves across the scene in that direction. |\r
| **Zoom in / out** | The framing tightens or widens. |\r
| **Static shot** | Nothing moved enough to name — a tripod, a clamp, or very steady hands. |\r
| **Handheld** | The movement has a high-frequency part nobody is steering. |\r
\r
Three more are **this app's own**, and the gallery marks them with a small \`ᐩ\` so\r
you never carry one into a caption expecting the trainer to recognise it:\r
\r
| Label | What it means |\r
| --- | --- |\r
| **Rolling** \`ᐩ\` | The horizon turns — the camera rotates about its own axis. Absent from the trainer's fourteen, and measured here because it is the one movement a language model reading the footage reliably gets wrong. |\r
| **Slideshow** \`ᐩ\` | The whole frame moved as one rigid picture, which is what a photograph panned across does — a Ken Burns move, not a camera. |\r
| **Subject moves** \`ᐩ\` | Something in the shot moved more than the camera did, so no direction could be read at all. |\r
\r
A shot carries **several** labels where several apply: a handheld pan that also\r
zooms is all three, and the filter row lets you pick any one of them.\r
\r
#### Why there is no "tilt", and no orbit\r
\r
You will look for **tilt up** and **tilt down**, because the trainer's vocabulary\r
has them and this app never shows them. They are missing on purpose. A camera\r
that **pivots** and a camera that **slides** put exactly the same movement on the\r
sensor — the difference between them is depth, and depth is not in a flat\r
picture. Rather than guess at a coin flip, everything in that family is reported\r
as **pan**, which is the honest superset.\r
\r
**Around left / around right** are missing for the same reason, harder. An orbit\r
is a movement along an arc, and recovering it means reconstructing the scene in\r
three dimensions. The published benchmark for this (CameraBench, 2025) puts the\r
best geometric system at roughly **half** the answers correct, at *minutes* per\r
clip. So the choice is not between cheap and accurate — it is between fast and\r
expensive-but-still-a-coin-flip. Not offered.\r
\r
#### When the reading cannot be trusted\r
\r
The measurement finds the **dominant** motion in the frame. When a subject fills\r
enough of it, the dominant motion *is* the subject, and the result is a confident\r
description of a camera move that never happened — measured on a test clip whose\r
camera was a tripod and whose subject crossed a third of the frame, the raw fit\r
reported a brisk pan *and* a zoom.\r
\r
So the pass checks how much of the frame its answer actually explains, and when\r
that falls too low it reports **Subject moves** and **no direction at all**. A\r
shot labelled that way is not a failure; it means the camera reading would have\r
been fiction, and the app would rather say nothing.\r
\r
**One more honest limit.** *Slideshow* is detected by the frame moving as one\r
perfectly rigid picture, which is what a photograph does. A real pan across a\r
scene with **no depth** — a flat wall, a horizon, a distant skyline — has no\r
parallax either, and can land in the same bucket. If a shot you filmed yourself\r
is labelled a slideshow, that is why.\r
\r
#### Filtering, and the one cut\r
\r
The labels appear on each thumbnail (slate, bottom right — never amber, because\r
amber in this gallery means *a cut flagged this* and a pan is not a fault) and as\r
a **🎥 Camera** row of filters above the grid. It composes with the ⚑ flag chips,\r
so *"shaky shots that also pan right"* is one click each.\r
\r
If you do want to **cut** on camera movement, 🎚 Quality cuts gains\r
**\`camera_shake_max\`**. It is empty by default like every other cut, and it is\r
deliberately **not** the same threshold as the *Handheld* label: the label fires\r
at a fixed internal floor and describes, the cut fires wherever you put it and\r
rejects. A shot can be labelled handheld without being flagged, or the reverse,\r
and both are correct.\r
\r
### 🔗 Does each shot hold one scene — the cut the detector missed\r
\r
Shot detection cuts on a change big enough to see. The ones it misses are the\r
soft changes — a dissolve, a match cut, a new angle inside the same room — and\r
what they leave behind is a "shot" that is really two. That clip is the worst\r
kind of training example: it teaches the model a transition nobody asked for, and\r
you cannot spot it by scrolling, because its thumbnail is one of its two halves\r
and looks perfectly fine.\r
\r
**It runs by itself, at the end of 🔎 Find scenes, and costs nothing.** That pass\r
already embedded three frames of every shot. Comparing a shot's first frame to\r
its last is a handful of multiplications over numbers that are already on disk —\r
no decoding, no model, no button. A bank you embedded before this existed gets\r
its reading by clicking **🔎 Find scenes** again, and that click costs nothing for\r
the shots already embedded.\r
\r
Each shot gains a **scene coherence** number: **1.00** means its first and last\r
frames are the same picture, and lower means the picture changed across the shot.\r
🎚 Quality cuts gains a **Scene coherence floor**, empty by default, that flags\r
anything below it as **Cut inside the shot**. The remedy is the next section:\r
open the shot and **✂ Split here**.\r
\r
**How much to trust it — read this before you set the cut.** This is a *ranking*,\r
not a verdict. Measured on real footage, against shots of the same length, a cut\r
at **0.80** catches about a third of the genuinely double shots while flagging\r
about one honest shot in seven; **0.75** catches a fifth for one in ten. Use it to\r
decide which shots to *look* at first, and expect to keep some of what it flags.\r
\r
**Why a long shot scores lower.** The number falls with elapsed time whether or\r
not anything was cut — a twenty-second locked-off take can read 0.84 with no cut\r
in it at all, simply because the light moved and people walked about. Short shots\r
score high for the opposite non-reason. If your bank is mostly long takes, set\r
the floor lower than the figures above suggest.\r
\r
**What it is not.** A shot whose reading is near 1.00 is *not* flagged as still,\r
and this pass deliberately says nothing about stillness. The obvious other half\r
of the idea — "nothing changed, so nothing moved" — was measured against this\r
app's own motion readings and does not hold: the number tracks how *long* a shot\r
is far more than whether anything moves in it, and genuinely motionless shots\r
read no higher than ordinary ones. Stillness stays with **Barely moves**, which\r
reads the codec's own motion vectors, and with the **Slideshow** camera label,\r
which reads how rigidly the frame moves. Two measurements that look at the real\r
thing.\r
\r
Shots with no vectors (you have not run 🔎 Find scenes) and shots **under a\r
second** — too short for the embed pass to take more than one frame — carry no\r
reading at all and are never flagged.\r
\r
## Retouch a cut: trim, split, or draw a shot by hand\r
\r
Shot detection is good and it is not right. It cuts a slow dissolve a second\r
early, and it happily hands back a shot whose last second is a frozen frame.\r
Before this panel existed the only gesture available on either was **✕ Reject** —\r
throwing away eight good seconds to be rid of one bad one.\r
\r
Open any shot and unfold **✂ Trim & split this shot**, under the player:\r
\r
- **Nudge either bound** by 1 s or by one frame. One frame means one frame *of\r
  your source file*, at its own rate — a 25 fps rush steps by 0.040 s, a 59.94 fps\r
  one by 0.017 s. The frame counts your target model wants are a different thing\r
  entirely, decided at build time.\r
- **⇤ playhead** snaps a bound to wherever the video is paused. Scrub to the frame\r
  you want, click, save.\r
- **✂ Split here** cuts the shot in two at the playhead. The half you were looking\r
  at keeps its triage decision, and so does the new one: split a *kept* shot and\r
  both halves stay kept, so you never have to find them again among hundreds.\r
- **＋ New shot from here** draws a shot the detector missed entirely. The player\r
  is pointed at the whole rush, so you can scrub anywhere in the file — not only\r
  inside the shot you opened — and mark a boundary that was never found.\r
\r
**For image-to-video targets, the first frame is the conditioning image.** The\r
trainer conditions an i2v sample on the clip's *first* frame, so moving a start is\r
not trimming: it is choosing the exact picture the model learns to animate from.\r
If the first second of a shot is a dissolve, an i2v LoRA trained on it learns to\r
animate dissolves. The panel repeats this line where the buttons are.\r
\r
**A re-cut shot loses its thumbnail and its quality scores, on purpose.** They\r
were measurements *of the old bounds* — a thumbnail showing a frame the shot no\r
longer contains is not stale, it is wrong. The tile goes blank and the bank's\r
next-step line offers **🖼 Make thumbnails** again; run it once when you are done\r
cutting rather than after every edit.\r
\r
**Limits worth knowing.** A shot must last at least 0.5 s, and both halves of a\r
split must too — the buttons say so rather than silently clamping. Retouching is\r
refused while a pass is running on the bank (a thumbnail pass mid-edit would\r
produce a picture of the old span marked as current), so stop the pass first.\r
Re-detecting a file deletes the shots the detector drew and **never** the ones you\r
cut by hand; those stay, and may overlap the fresh ones. And editing a shot that\r
is already in a built dataset is allowed: the dataset stored its own copy of the\r
bounds when it was encoded, so nothing already on disk changes.\r
\r
## Change how often a rush gets cut\r
\r
Shot detection does not find cuts. It scores every frame — *how likely is a\r
transition here* — and the shot list is a **threshold** applied to that score\r
afterwards. The number that was applied for you is 0.5, which comes from the\r
detector's own paper, where it is never justified. It is a convention.\r
\r
That mattered because disagreeing with it used to cost a full pass over the\r
file. It no longer does: the scores are kept next to the bank, so changing the\r
threshold and re-cutting an entire folder happens with no decoding and no GPU at\r
all. Unfold **🎬 Find shots — cut sensitivity** above the gallery.\r
\r
- **👁 Preview** counts what each threshold would actually leave you — on *your*\r
  files, floor included — and says how each one differs from the value in force.\r
  "4 shots" means nothing on its own; "8 fewer than now" is a decision.\r
- **Save** stores the number and cuts nothing. **Save & re-cut this bank** does\r
  both, in seconds.\r
- **Leave the field empty to inherit** the app default. Empty is not zero — zero\r
  is a threshold that fires on every single frame and shatters a rush into\r
  hundreds of fragments.\r
\r
**Which way to move it.** Higher cuts less often: fewer, longer shots, and far\r
fewer cuts invented inside footage that never had any. Lower catches the\r
boundaries a slow dissolve hides, and finds more of them everywhere else too. If\r
your folder is mostly single takes, 0.6–0.7 is the direction; if it is edited\r
material, stay at 0.5 or go under it. Nobody has measured the right answer for\r
amateur footage — that is exactly why the preview exists.\r
\r
**One folder is rarely one kind of footage**, so a single file can carry its own\r
threshold and be re-cut on its own: **↻ Re-detect this file**, on the file's card\r
under **Files**.\r
\r
### This file is one single take\r
\r
Some rushes have no cuts at all, and the failure there is not a missed\r
boundary — it is a file quietly chopped into six fragments that each train on a\r
third of a gesture. **▣ Single shot**, on the file's card, replaces every shot of\r
that file with one covering the whole thing.\r
\r
It sticks. The bank-wide re-cut and the detection pass both walk past a file\r
marked this way, and the card says **Single shot** so you can see why it never\r
changes. The way back is **↻ Re-detect this file** on that same card.\r
\r
**↻ on a single file replaces hand-made cuts, and the bank-wide re-cut never\r
does.** That asymmetry is deliberate — it is what makes ↻ the way back from ▣ —\r
and both gestures ask before they act. Shots already promoted into a dataset are\r
kept in every case; the dataset stored its own copy of the bounds when it was\r
built.\r
\r
### Cut, or dissolve\r
\r
The detector produces a second output describing how *wide* each transition is,\r
which the app used to compute and discard. It is now read, and a shot whose\r
first or last frames are a cross-fade of its neighbour carries an amber\r
**dissolve 18f** chip on its tile — the frame count is the width of the fade.\r
\r
No other tool in this space shows this, and it is worth knowing before you train\r
on a clip: a shot that opens on a cross-fade of another shot teaches a model to\r
open on a cross-fade. The chip is advisory, exactly like the quality flags — it\r
changes nothing about the cut, and the width-to-kind rule is a reading of how the\r
network was trained, not something anyone has measured on amateur footage.\r
\r
**🎬 Find shots again is instant too, now.** Re-running the pass over a bank it\r
has already been through re-cuts from the stored scores instead of decoding\r
again, and the progress line says how many files it reused. It falls back to a\r
real pass for any file whose size on disk no longer matches what the scan\r
recorded — you re-exported it, so its old boundaries describe footage that is not\r
there any more.\r
\r
**Two limits worth saying out loud.** A file detected before this shipped has no\r
stored scores, so it cannot be re-cut instantly — the panel says so and offers\r
🎬 Find shots, which fills them in on the way past. And a re-cut replaces shots,\r
so the replaced ones lose their thumbnails and quality scores: those measured\r
bounds that no longer exist. Run 🖼 Make thumbnails once when you are done\r
cutting, not after every change.\r
\r
## Find scenes in a video bank by typing a word\r
\r
A folder of rushes is a haystack whose needles have no names. The quality cuts\r
tell you which shots are sharp and which move; they cannot tell you which one has\r
the red car in it. **🔎 Find scenes** does: type *a woman walking on a beach* and\r
the gallery is replaced by the shots that look most like it, best first.\r
\r
**Run the pass once, search as often as you like.** The 🔎 Find scenes button\r
looks at a few frames of every shot and remembers what they look like. It is the\r
slow part — it needs the same environment as the image bank's ✨ Score (Setup ▸\r
Quality tools, or a Python you already have with torch and open_clip), and on a\r
CPU it is minutes rather than seconds. Every search afterwards is instant and\r
costs nothing.\r
\r
**Several frames per shot, not one.** A shot is a span of time, and a thumbnail is\r
one instant of it. If a car only drives into view in the last second, a search\r
that had looked at the opening frame would never find that shot — and would give\r
you no hint that it had missed it. So each shot contributes a frame near its\r
start, its sharpest frame, and one near its end, and a shot's score is the best of\r
the three. Every result tells you **which second matched**, and opening it starts\r
the player right there.\r
\r
**It is a ranking, not a filter.** Every shot scores something against every\r
phrase, so the results always come back full, however wrong the query. The line\r
above the gallery says how strong the top and bottom of the ranking are, and how\r
many shots could not be searched at all — a shot the pass has not reached cannot\r
be found by any phrase, and it would be easy to conclude the scene simply is not\r
in the bank.\r
\r
**What it cannot do**, measured on the model this app uses:\r
\r
- **“Without” is ignored, not honoured.** Ask for *a street without cars* and you\r
  get cars. Type \`-cars\` instead: that subtracts the unwanted thing from the score\r
  and pushes those shots down the ranking. It cannot promise their absence, and\r
  the panel says so rather than pretending otherwise.\r
- **It cannot count.** *Two people* barely outranks a picture of one.\r
- **It cannot hear, and it cannot see motion.** Only still frames are looked at,\r
  so *a door slamming* or *panning left* describe nothing it can use.\r
- **Left and right carry almost no meaning.**\r
\r
Searching respects the triage filter you are on, so *keep only* plus a phrase\r
ranks what you already decided to keep. Changing the filter clears the search: a\r
ranking computed over one bucket has nothing to say about another.\r
\r
## Describe your shots, and search what happens in them\r
\r
🔎 Find scenes ranks by what a moment **looks like**. It cannot find an action —\r
"turns and walks away" is a fact about *time*, and no single frame carries it. The\r
**🗣 Describe shots** pass closes that gap: it watches sixteen frames spread\r
across each shot and writes a full paragraph — the action as it unfolds, the\r
subject, the setting and the mood, in the 150-200 words the published\r
measurements converge on. The camera is deliberately not the model's job: no\r
VLM describes it reliably, so the 🎥 Camera pass's own classifier writes that\r
line into the exported prompt instead, in words it measured.\r
\r
That line does two jobs, and the second is the one nobody sees coming:\r
\r
- **It is what the clip trains on.** At promotion each clip gets a \`.txt\` sidecar\r
  next to it, and that file *is* the prompt. Before this pass existed every\r
  promoted clip shipped with an **empty** one — which the trainer accepts in\r
  silence, training the clip on no prompt at all. The build dialog now tells you\r
  how many clips are about to go out uncaptioned, before it encodes anything.\r
- **It makes the search read words as well as pixels.** Once captions exist,\r
  typing a phrase ranks on both, and the panel says which halves are running so\r
  that "nothing found" can be read correctly.\r
\r
**Captions are drafts.** Open any shot and edit the caption under the player; a\r
bulk re-run will never overwrite one you wrote. Clearing it puts the shot back in\r
the queue. Regenerating over your own words is possible, but you have to ask for\r
it by name.\r
\r
**You can change how plainly they are written.** Next to the button there is a\r
**Caption wording** choice: *Standard* (the shipped wording) or *Plain*, which\r
gives the model explicit permission to name what is on screen instead of\r
describing around it. On adult footage that difference is not cosmetic — a\r
captioner asked the standard way produces captions that are *about something\r
other than the shot*, and a LoRA trained on those learns the evasion. It was\r
measured rather than assumed: the wording turned out to matter **more than the\r
model**, and the stock model asked plainly beat an uncensored one asked the old\r
way. Every caption records which wording produced it, and the choice is\r
remembered as \`video_caption.style\` if you set it in your config.\r
\r
**You can change which model writes them.** The pass ships with one checkpoint\r
and uses it unless you say otherwise (\`video_caption.model\` — see *Settings\r
reference*). It is worth changing when the default **talks around** what your\r
footage shows: a caption that names things evasively is not a style choice, it\r
teaches the trained model to look away too, and the captions read perfectly well\r
while being about something slightly other than the shot. Any checkpoint of the\r
same architecture is a drop-in. If it is not on your machine, the first run\r
downloads it — and the pass says so in its progress line before captioning\r
anything, rather than sitting at 0 % while gigabytes arrive. Every caption\r
records which model wrote it, so a bank captioned across a change stays readable.\r
\r
**It needs the same environment as ✨ Score** (torch + transformers) and it uses\r
the GPU when there is one — a 4B vision model on a CPU is minutes per shot. It\r
will not start while a training run owns the card, and stopping is safe: what is\r
captioned stays captioned and the next run picks up where it left off.\r
\r
## Video training sets (and the two things to check before you cut one)\r
\r
Promoting a video bank builds a flat folder of clips with a \`.txt\` caption next\r
to each one, and lists it in your library under **🎬 Video training sets**.\r
\r
**You can cap how many clips one source contributes.** A 50-clip set that is\r
three videos over-represented looks exactly like a diverse one on disk, and that\r
imbalance is the kind that quietly overfits a source. **Max clips per source**\r
caps it; leave it empty for no cap. The cap trims dominance without punishing\r
scarcity — a file with fewer clips than the cap keeps all of them — and it is\r
**not a random sample**: each source keeps its earliest clips, so promoting the\r
same bank twice gives you the same dataset. When a finished set leans on one file\r
anyway, the result tells you the real share.\r
\r
**You can trim the edges of every clip.** A shot boundary is where a cut just\r
happened, so the first and last frames of a shot are disproportionately\r
dissolves, fades and leftovers of a transition — and a dataset whose clips all\r
open on half a dissolve teaches the model to open on half a dissolve. **Trim each\r
end** takes a number of seconds off *both* bounds; 0.25 is the common figure, and\r
the default is 0 so an existing recipe exports exactly what it exported before.\r
\r
The trim never shortens a clip. Frame counts are a property of the target's VAE,\r
so a clip that no longer supplies the count is **dropped, not exported short** —\r
ffmpeg would write the short file and exit 0, and ai-toolkit would train it as\r
repeated stills without a word. The dialog says how many clips the trim will cost\r
*before* you press the button, and those are counted separately from clips that\r
were never long enough: only the first kind is fixed by lowering the trim.\r
\r
**The clip length is chosen in FRAMES, from a menu.** That is not pedantry: the\r
legal frame counts are a property of each model's VAE, not of video. 29 frames is\r
legal for Wan and illegal for LTX; MiniMax H3 wants counts of the form 17n+5. No\r
trainer refuses an illegal count — they round it down in latent space and say\r
nothing. So the menu offers only counts the target can actually ingest, with the\r
duration shown next to each at that model's own frame rate.\r
\r
Two labels sit next to every target, and both are there to save a wasted week:\r
\r
- **Not trainable yet** — the app knows the model's geometry perfectly and no\r
  LoRA trainer for it is known to exist. Exactly one target of the four currently\r
  clears that bar (Wan 2.1 / 2.2 14B). You can still cut a dataset for the\r
  others; just know that today nothing is known to train on it.\r
- **Licence limits** — MiniMax H3's Community Licence grants rights **only**\r
  inside an "Applicable Territory" that excludes the EU, the UK, South Korea and\r
  the USA. The restriction covers the **outputs**, not just the model, so keeping\r
  your training private is not a way around it. Check your territory before you\r
  build the set, not after.\r
\r
Deleting a video dataset deletes the encoded clips and nothing else: the bank\r
keeps every shot and every decision, so you can re-cut at another length or for\r
another target without triaging again.\r
\r
## Work on a video training set\r
\r
Opening a set from **🎬 Video training sets** takes you to its own workspace —\r
the same relationship an image dataset has with the library, and the same rail\r
down the side. Everything below happens on the clips that were actually encoded,\r
not on the bank's shots.\r
\r
**Clips.** A grid of every clip, with the source rush and the timecode it was cut\r
from behind each tile. The grid holds thumbnails and no video players at all: a\r
browser stops loading new players after about sixty of them, silently, so a\r
128-clip set would fail halfway down the page with nothing in the console.\r
Clicking a tile opens the one player the page ever mounts — \`←\` and \`→\` step\r
through the set, \`Esc\` closes it.\r
\r
Filter by *All / Captioned / No caption*, type in the box to narrow by file name,\r
caption or source rush (terms are ANDed; \`-word\` excludes), and sort by file\r
order, length, or "uncaptioned first" — which is the working list when you are\r
finishing a set. **File order is the default and it is the order the trainer\r
reads the folder in.**\r
\r
**Removing a clip** moves its \`.mp4\` and its \`.txt\` into the app's own Trash\r
(Settings ▸ Storage, recoverable until you empty it) — the same place a deleted\r
image of an image dataset goes — and touches nothing else: the bank keeps the\r
shot, its bounds and every decision, so you can re-cut and promote it again with\r
no triage to redo. The confirmation names that destination before you click,\r
from the same wording every other delete in the app uses. It is the exit the\r
promote dialog never had: you find the three-frame clip *after* the encode, in\r
the set, not while triaging. (A stills set built from an image dataset has no\r
bank behind it, and the confirmation says so rather than promising one.)\r
\r
If the database refuses the change after the files have moved, they are put\r
back where they were before the error is reported — "could not remove" is true\r
of the folder as well as of the app.\r
\r
If a clip's file is **held open** — an antivirus scan, a player, or a training\r
run reading this very folder — it is not removed at all, and the app says so\r
instead of claiming success. That matters more than it sounds: the folder *is*\r
the dataset, so a clip taken out of the app while its file stayed on disk would\r
still be trained on.\r
\r
**Captions.** Every clip's caption is a \`.txt\` file sitting next to its \`.mp4\`,\r
and that file is what the trainer opens — never the app's database. So every save\r
here rewrites the file, and if the write fails the app says so out loud instead\r
of showing you text the training will not use. A clip with no caption is not\r
skipped: its sidecar is written with the trigger word alone, or empty if the set\r
has no trigger. The coverage line under the grid says which of the two you are\r
getting.\r
\r
The caption tools apply to your selection, or to the whole set when nothing is\r
selected: find & replace (whole-word by default; an empty replacement removes the\r
term and tidies the commas), add a prefix — which reaches the silent clips too —\r
or add a suffix, which never invents a caption out of an empty one. Nothing is\r
written until you have seen how many captions actually change; a prefix already\r
present is not added twice. The most repeated words are listed underneath, because\r
a term in every caption is a term the LoRA binds to your trigger whether you meant\r
it or not. They are there from the start, on a set that has no caption at all —\r
that is exactly when a prefix is worth running.\r
\r
Pressing \`Esc\` in the player **saves** what you typed before closing; it is a way\r
of clicking away, not a way of throwing the text out. And if a caption reaches\r
the database but its \`.txt\` cannot be written, the report says so in those words\r
rather than calling it a failure — the app would be showing you text the training\r
will not read.\r
\r
**References** appears only for a target that trains on control images (MiniMax\r
H3 ref2va). Without them the trainer runs unconditioned and says nothing, so the\r
server refuses the launch — attaching 1 to 4 images here is what satisfies it,\r
and replacing is whole-set: they are one identity, not an album.\r
\r
**Training** holds one set of dials and one destination — this PC — and\r
**Checkpoints** appears in the rail once a run has really brought files\r
back. Above the dials sits the same readiness card an image dataset has — what\r
still stands in the way (no clips, a target nobody can train yet, missing\r
references, an ai-toolkit too old for this model, weights not yet downloaded),\r
each with a Fix → that jumps to where it is fixed.\r
\r
**Checkpoints & LoRAs** lists every save the local run brought back, grouped by\r
*step*, never by file: a Wan 2.2 checkpoint is two files (\`_high_noise\` /\r
\`_low_noise\`) and the section refuses to offer half of one. Each step carries the\r
verbs an image dataset's checkpoints have. **⬇** downloads a file (both of a\r
pair, side by side, is what every loader expects). **📦 Deploy** copies the step\r
into ComfyUI's loras folder under \`h3/lds/\` — the same folder and name the Video\r
Test Studio uses, so the Studio's picker lists it as deployed at once; **⏏\r
Undeploy** moves that copy to the app's Trash and keeps the training save. **🗑\r
Delete** moves every file of the step to the app's Trash (Settings ▸ Storage) —\r
refused while a local training is still writing them. A run cannot pick a step to\r
resume from: it continues from its newest save on the next launch, because its\r
folder *is* the resume state, and the row says so instead of offering a button\r
that would do something else. A LoRA you dropped into \`h3/\` by hand shows as\r
deployed but is never undeployed from here.\r
\r
**The run graph** at the top of that section is the image workspace's, drawing\r
the same thing: one card per run (this PC or a pod), a pill per save, and a\r
curve from the exact step a continuation resumed from — three continuations\r
read as one lineage rather than three unrelated runs. A pill's thumbnail is the\r
*training sample* ai-toolkit rendered at that step (one per prompt, every save);\r
click it to play the clip, \`←\`/\`→\` step through the step's prompts. Clicking a\r
pill offers the same verbs as its row in the list; clicking a run card opens\r
its details. There is no *Generate previews* bar here: the image graph renders\r
those with the image Test Studio's engine, and a fresh render of a video LoRA\r
is the Video Studio's job. A run with no samples simply shows plain pills — add\r
sample prompts to a launch to get them.\r
\r
**Studio** opens the Video tab of the Test Studio, where a deployed LoRA is\r
judged on the clip it renders rather than on its loss curve.\r
\r
What is *not* here yet, and deliberately: the quality passes (duplicates,\r
watermarks, safe zone, defects) run on the bank's shots and on the source files,\r
before any encode exists; trimming a clip means re-encoding it, so the honest\r
gesture is to re-cut in the bank — which is why the player names the source rush\r
and the timecode. And there is no export button because there is nothing to\r
export to: the dataset **is** its folder, flat, \`.mp4\` plus homonym \`.txt\`, which\r
is exactly what every trainer reads.\r
\r
## Neural render for video clips\r
\r
NVIDIA's **DLSS 5 Neural Rendering** model re-renders a frame's materials and\r
lighting: skin, hair and fabric gain structure the source only implied. It was\r
built for games, but a plain video is a valid input, and the app runs it over a\r
finished clip in two places:\r
\r
- **A video dataset, Clips section** — select clips, then **✨ Neural render**.\r
  The render **replaces the clip in place** (the folder IS the dataset, so the\r
  file the trainer reads must be the render) and the **original is kept** outside\r
  the dataset. **🩹 Restore** brings it back at any time, for the selection or\r
  for every rendered clip. A clip rendered twice is rendered from its original\r
  both times — renders never stack.\r
- **The Video Test Studio, clip history** — **✨ Neural** on a finished clip\r
  makes a **new clip** in the list, tagged \`neural render\`; the original stays,\r
  so the pair can be compared.\r
\r
**Compare.** A rendered dataset clip's lightbox and a rendered studio clip's card\r
carry **⇔ Compare**: the original and the render play side by side, in step —\r
the left player leads (play, pause, seek there), the right one follows, muted;\r
**Swap sides** puts the render first. On a phone the two stack.\r
\r
**⬇ Export** turns that comparison into a file: one mp4 holding both clips side\r
by side, each captioned, in step by construction — a single timeline instead of\r
two players, so it plays correctly anywhere. The app encodes it when you press\r
the button (a ten-second pair takes a couple of seconds), then your browser saves\r
it. Two things about that file are deliberate: it carries **no metadata**, because\r
a clip that came out of the Test Studio holds the entire generation workflow —\r
every prompt and every folder path on your machine — in a comment tag nothing on\r
screen displays, and this file is the one built to be sent to other people; and\r
the captions need a font, so on a machine with none of the usual ones the two\r
panes come out unlabelled rather than the export failing.\r
\r
**The dials.** *Tone* is how much the model relights (0 keeps the clip's own\r
tones — the setting for flat art and anime, where the default greys pure whites).\r
*Structure* is how much micro-detail is added. *Automatic mask* lets the model\r
decide where it acts (marginal). The other controls the model exposes do nothing\r
through this bridge and are not offered.\r
\r
**Making it visible.** The model's own answer is subtle on video (about 7 % more\r
fine detail on a photoreal frame, measured). Three levers push past it, and all\r
three are in the dialog: **Strength** above 1 carries the render beyond the\r
model's answer (2 roughly doubles the added detail, 3 triples it — the same\r
control the game mod calls Detail strength); **Passes** feed the render back\r
through the model (extra passes run in still mode); **Render at 2×** works on\r
four times the pixels and delivers the clip at its own size. The Render button\r
says how much longer than a plain pass the combination takes. And in the\r
comparison, press **1:1**: fitted to the pane, the pixels the render changed\r
vanish; at their real size they show.\r
\r
**Frames.** *Temporal* keeps the model's history across frames with motion the\r
driver estimates; it needs a clip **at least 704 px wide** (measured: 700 fails,\r
704 passes, whatever the height). *Auto* picks it when the clip allows and falls\r
back to *Still* otherwise, and says so. A scene cut resets the history.\r
\r
**What it needs.** Windows and an NVIDIA GPU with a recent driver — the model is a\r
Direct3D 12 library, so there is no Linux or Docker path. Setup installs the\r
small open-source **bridge**; the **model file** (\`nvngx_dlssnr.dll\`) is NVIDIA's\r
and yours to place in the folder Setup names — the app does not download it and\r
offers no link. NVIDIA ships it for the RTX 50 series; the model itself decides\r
on which GPU it runs, and a refusal is shown in its own words on the first clip\r
you render. On an RTX 4090 a 1080p frame takes about 30 ms (the model alone),\r
about 130 ms end to end with decoding and encoding.\r
\r
## Test a video LoRA before you trust it\r
\r
Training a video LoRA gives you a \`.safetensors\` and a loss curve. Neither of\r
them tells you whether it learned the thing you wanted, so the **Video** tab of\r
the Test Studio renders a clip with it — the same MiniMax H3 pipeline the app\r
uses everywhere else, driven from one panel.\r
\r
**What it needs, once.** The engine is MiniMax H3 and its four required files\r
are about **39.5 GB** — Setup ▸ **🎬 Video Test Studio** downloads them into\r
ComfyUI's own folders. A plain clip needs *nothing else*: no custom node, no\r
add-on, deliberately, so that a fresh install can render something the moment\r
the weights land. The optional 6-step **turbo LoRA** is downloaded there too\r
(0.7 GB, and it is the difference between a clip in minutes and one in tens of\r
minutes).\r
\r
The three accelerator options — turbo, sparse attention and the latent upscale —\r
need ComfyUI **custom node packs**, and the app does not install those: it names\r
each pack, links it and gives you its ComfyUI-Manager search term, and you add\r
it on the ComfyUI side. A weight is an inert file in a folder; a custom node is\r
code your ComfyUI imports at startup, and one bad import takes the whole server\r
down for every other thing you use it for. That is not a risk this app takes on\r
your behalf. An option whose pack is absent is shown greyed out with the pack\r
named, never as a button that fails. Two more files — the latent upscaler's\r
model and the third-party 10Eros base — are yours to place by hand if you want\r
them; the Setup card says where.\r
\r
**Pick the LoRA, then say what moves.** A checkpoint that came out of a training\r
run is not visible to ComfyUI until it is copied into its \`loras\` folder; the\r
picker does that for you the first time you select one (a 300 MB copy, once).\r
LoRAs you dropped into \`models/loras/h3\` yourself are listed too. **No LoRA** is\r
the first choice on the list on purpose: the only way to know what yours changed\r
is to have seen the same seed without it.\r
\r
**A start frame, or none.** Image-to-video animates a picture — uploaded, taken\r
from a bank, picked from the Gallery (every picture the app has rendered,\r
Canvas previews included), or lifted from the first frame of a clip in a\r
training set (that last one is the honest baseline, since it is material the\r
LoRA actually saw). The bank, Gallery and Dataset clip tabs show their pictures\r
as a grid of tiles — a clip's tile is the poster its training set shows for it\r
— and the 🔍 **Preview size** slider above the grid enlarges them, more than\r
three times over, when a face is too small to judge at the default; the size is\r
remembered by the browser. Pick **several** and each goes into a strip under\r
the tabs — several files at once from the upload tab, or tile after tile from\r
a bank, the Gallery or a training set; a tile already in the strip shows as\r
pressed and a second click takes it out again, and each frame in the strip has\r
its ✕ (the strip knows a frame by where it came from, so the same picture\r
picked from two tabs is two frames; a picture the server refuses is skipped\r
and said so, the others still go in). Generate then queues **one clip per\r
frame, on one seed and one prompt**: a random seed — or a negative one, which\r
counts as random — is drawn once, for the first clip, and re-used for the\r
rest, and ✨ Enrich at launch rewrites the prompt once, for that first clip,\r
the rest running the rewrite it got (the vision model shares the GPU with\r
ComfyUI and is not asked again once a clip sits in its queue), so the clips\r
differ by their picture and nothing else — the button says how\r
many clips a click will queue, and ✨ Auto reads the first frame — or each one, in the *Written per picture* mode described below. That is the\r
**Same for all** choice of the *Prompt for the pictures* pair that appears\r
under the Motion field once the strip holds two frames; **✨ Written per\r
picture** asks the vision model for one prompt per picture BEFORE anything is\r
queued — your motion enriched with that picture, or a proposal from the\r
picture alone when the field is empty — the button counting *Writing prompt 2\r
of 3…*; a picture the writer could not answer for launches with the prompt as\r
typed, and the notice says which.\r
\r
All of that writing happens in **one pass**, and the reason is worth knowing\r
because it is the difference between a batch that takes a minute and one that\r
takes twenty. Looking at a picture needs the GPU, and taking it means asking\r
ComfyUI to let go of its models — so the next clip reloads the video model,\r
tens of gigabytes for MiniMax H3. Asking picture by picture would pay that\r
reload once per picture. Every prompt is therefore written before the first\r
clip is queued, in a single hold of the GPU, and the video model comes back\r
once.\r
Text-only skips the picture entirely and composes the shot from the prompt.\r
Either way,\r
describe the *movement*: the start frame already says what the scene looks\r
like.\r
\r
**Quick prompts, if you would rather pick than write.** Under the field, a ⚡ row\r
of chips carries the MiniMax H3 preset set — Scenarios, Multi-Shot, Timeline,\r
Camera, Audio, Voice and Visual Style. They **stack**: a chip appends on its own\r
line instead of replacing what is there, so a shot is built by taking a scenario\r
or a style first and layering a camera move and an audio bed on top, exactly the\r
way H3's own template is ordered. The wording follows that template, which is why\r
the scenarios name the start frame as \`<Picture 1>\` — in a text-only clip that\r
reference is dropped from the preset before it lands in the field, since there is\r
no picture for it to point at. The chips are only text: what they write is yours\r
to edit, and ✨ Enrich will happily rewrite it afterwards.\r
\r
**Or let a local model write the movement.** ✨ **Auto** looks at the start frame\r
and proposes a motion for it; anything already in the field is read as the\r
movement you are after and steers the proposal rather than being ignored — the\r
answer still takes the field, as ✨ Enrich's does. ✨ **Enrich** rewrites what\r
you typed with more detail, anchored on the frame that will actually be\r
animated — a text-only clip enriches from the words alone, so nothing is\r
invented about a picture the encoder is never given. Both answer in H3's own\r
three-field prompt (\`integrated_multimodal_description\`, \`overall_soundscape\`,\r
\`non_diegetic_music\`), paced to the clip length you set: three seconds hold one\r
gesture carried to its end, ten seconds get a sequence of beats. With a start\r
frame the subject is named \`<Picture 1>\`, the tag H3 binds to the picture it is\r
handed, and the reference line the encoder expects is put in front — at launch\r
too, for a prompt you typed yourself, and never twice; a text-only prompt\r
carries neither, even one written for a frame and then launched without it. The ⚙ button chooses **the model that writes the\r
motion** from whatever your local server lists — Ollama or LM Studio, whichever\r
the app is set to — and it is its own choice: tuning the writer never re-points\r
the captioner, and leaving it empty uses the provider's vision model. The\r
writer takes the GPU the way every vision pass does: it refuses while ComfyUI\r
has work queued or rendering — a clip, an image — and says so, and on its way\r
in it asks ComfyUI to let go of its models, so the next clip loads H3 again: a\r
few seconds, paid once per click. When the writer's model is busy for something\r
that is not LDS, the panel says so where you clicked: it waits, watches, and\r
replays the click by itself the moment the model is free — or you **Unload it\r
and continue**. It is the same hold the queue reports (see *When the queue\r
waits for something that is not LDS*), answered here with the panel's own two\r
offers. **✨ Enrich at launch** does the rewrite when you press Generate\r
instead, so the clip records the prompt that really ran while your field stays\r
as you typed it — and if the writer cannot run at that moment, the clip still\r
launches with your words and the panel says so.\r
\r
**The four options are not free, and the panel says what each one costs.**\r
⚡ **Acceleration** swaps in a 6-step distillation LoRA — minutes instead of\r
tens of minutes, and a different model rather than merely a faster one; one is\r
on by default because an undistilled first clip is long enough to look like a\r
hang. The choice is the top three of the multimodalart MiniMax-H3 acceleration\r
arena (human preference, ~7 400 votes per task, and the three are statistical\r
ties): larryvrh's Turbo v4 through its own sampler, Plaguekind's Parasyte\r
Turbo, and silveroxides' DARE-TIES merge — the last two on the stock sampler\r
at the sigma shift they were tuned for, with the strengths the arena verified.\r
Setup downloads whichever is missing; a choice this machine cannot run is\r
greyed and says why. 🔬 Latent upscale enlarges before anything is decoded, so\r
the audio track survives untouched — and it is where most of the time goes.\r
Sparse attention buys speed by attending to less, which costs prompt adherence;\r
with the upscale on, the first pass deliberately stays dense so the prompt keeps\r
its grip on the composition, and only **Max** accelerates both passes. 🔥 The\r
10Eros base replaces the official model with a third-party finetune that brings\r
its own faces — which is exactly what you do not want while testing whether\r
*your* LoRA reproduces an identity.\r
\r
**One clip at a time, and a history.** A clip is minutes, so there is no grid\r
here. Every clip keeps the settings that made it, and **Reuse** loads them back —\r
seed included. Changing one dial on the same seed is the only comparison that\r
says anything about that dial.\r
\r
If the panel refuses to launch, it is telling you the graph cannot run on this\r
install: the message names the missing weights and the ComfyUI node packs to\r
install, rather than letting the job fail silently a minute later.\r
\r
## Continue a clip from its last frame\r
\r
**⏭ Continue** on a finished clip stages its **last frame** as the next start\r
frame — the strip shows it, the mode switches to image-to-video, and the\r
Motion field is yours to write again: the next thing that happens, from\r
exactly where that clip ended. Generate then renders the new motion from that\r
frame and, when it lands, **joins it behind the clip it continues**: the card\r
plays one video, that clip followed by the new one, and says so. The first\r
frame of the new part is dropped in the join (it is the parent's last frame,\r
the picture the part was conditioned on; kept, it would freeze the cut for one\r
frame) and the sound is trimmed by the same one frame so the two stay in\r
step; the part is scaled to the parent's size if the dials changed in between.\r
The parent stays as it is, so a chain can branch: continue the same clip\r
twice with two different motions and compare. Continue the joined clip again\r
and the chain grows — each link re-encodes the whole chain once (x264,\r
near-lossless, so a very long chain softens slightly). A smoothed clip can be\r
continued too: it has no sound of its own, so its side is padded with silence\r
while the new part keeps its own. A join that fails — ffmpeg gone, a file missing — leaves\r
the new part as its own clip and tags it *not joined*, never a lost render.\r
\r
## Smooth: pick the rate before it runs\r
\r
**↗ Smooth** on a finished clip opens a small window before anything is\r
queued: the rate the new clip will play at — **48, 72 or 96 fps** for a clip\r
authored at 24. The interpolator (RIFE) works by whole factors, ×2, ×3 or\r
×4, which is why the choices are multiples of the source and not any\r
number: a 30 or 60 fps target would mean throwing frames away unevenly\r
after the pass, and that reads as judder. The clip keeps its length —\r
frames are added between the existing ones, nothing is slowed down — and\r
the work grows with the frames written: ×3 costs about twice the ×2 pass,\r
×4 about three times. The result is a NEW clip in the list, tagged with its\r
rate; the original stays as it is.\r
\r
## A live channel from your video LoRA\r
\r
The **Live** tab of the Test Studio (experimental) is the video engine as a\r
channel that never stops: it draws a scene from a list, renders a clip with the\r
LoRA you picked, keeps the next scene already in the queue, and appends every\r
finished clip to a stream you watch in the tab — or in **VLC** on any machine\r
of your network (*Media ▸ Open Network Stream*, paste the address the panel\r
shows; if the app requires an access token from other machines, add\r
\`?token=…\` to it and the segments inherit it). The stream follows its most\r
advanced player: a second one joining later starts at the live edge rather\r
than replaying what the first has watched. The shape comes from FastH3\r
Live, an open-source endless AI channel\r
built on the same MiniMax H3 engine; this lane keeps its two good ideas and\r
uses your own installed pipeline for the rest — nothing new to download.\r
\r
**Why the picture plays slower than life.** H3 authors motion at 24 fps, and no\r
consumer card renders 24 frames of video per second of clock. A channel that\r
keeps up therefore plays the frames at a **lower rate** — 18 fps is motion at\r
75 % speed, 12 fps is half — with the sound stretched by the same factor and its\r
pitch preserved. Fast subjects read as deliberate slow motion; a person walking\r
is where you notice. **Playback rate ▸ auto** measures your card on the first\r
two clips and picks a tenth under what it sustains; pick a number yourself when\r
you would rather have the speed and accept that the player waits between clips.\r
\r
**The rail tells you the truth per clip**: how many seconds a clip plays for at\r
the chosen rate, how many seconds it took to render (model loading included —\r
the first clip after a start is always slow), what rate the card sustains, and\r
whether the stream is *keeping up* or *behind* and by how much. A channel that\r
is behind is not broken; it is a card asked for more than it has. Lower the\r
rate, **lengthen** the clips or drop the resolution — a clip pays a fixed cost\r
(the model call, the decode, the encode) whatever its length, so more frames\r
per clip buy more seconds of playback per second of render; shorter clips\r
never help. When nobody is reading the stream the channel stops rendering\r
after a few clips and the rail says so: nothing is spent on clips nobody\r
watches.\r
\r
**Scenes** are written in H3's own grammar — what is shown, then the soundscape\r
— one per block separated by a line holding \`---\`; \`{NAME}\` in a scene becomes\r
the **Subject** (the trigger word of your LoRA, typically). They play in a\r
shuffled order and do not repeat until all have played; edit the list and\r
restart the channel to change it. The clips of a channel are not kept: a\r
channel that ran for an hour must not leave two hundred cards in the history.\r
The one thing it needs beyond the Video lane's weights is \`ffmpeg\`, which the\r
app already ships for its other video work.\r
\r
## Stopping Score, and what a relaunch costs\r
\r
**✨ Score** always covers the whole bank — but it only *computes* what it does\r
not already have. Every image it scores is written to a cache next to the bank\r
(the CLIP embedding plus the aesthetic and NSFW numbers), and a relaunch reads\r
that cache and pays only for the rest. On a bank that is fully scored, the pass\r
does not even load the model: it goes straight to the grouping.\r
\r
So **Stop is safe**, and it is now safe in the database too. When you stop a run,\r
the scores it had already computed are written to your images before the pass\r
ends — that work was paid for, and it used to reach the cache and never reach a\r
single row. The line at the end of the pass says exactly what happened: how many\r
images were scored, how many remain, and how many were reused instead of\r
recomputed.\r
\r
One thing does *not* survive a stop: the **🎨 style groups**. Those ids are not a\r
per-image measurement, they are a single numbering of the whole bank, computed\r
from every embedding at once and renumbered on each pass. Half of one is not\r
partial progress — it would put a new group 1 next to an old group 1 and mix two\r
unrelated styles under the same chip. So a stopped pass leaves the previous\r
grouping alone and says so. Relaunch and it finishes: the scoring part is already\r
cached, and only the grouping is left. That grouping is the slow tail of the pass\r
— about **8 seconds over 5 000 images and 3 minutes over 23 000** — so on a big\r
bank it is worth letting it finish.\r
\r
**Rescore all** is the last line of ✨ Score's launch window, unticked. It is the\r
opposite intent: throw the cache away and recompute everything, for a bank you\r
scored with a different setup or whose results you no longer trust. It costs a\r
full pass, which is why it is a deliberate tick and never a default — ✨ Score\r
itself has always meant "cover the whole bank", and it still does.\r
\r
One more thing a relaunch fixes on its own: if the aesthetic head or the NSFW\r
model could not be downloaded during an earlier run, the images scored in that\r
window carry a hole. They are picked up again the next time you run Score, once\r
the missing piece is available — an image is never left permanently half-scored\r
because a download failed once.\r
\r
## The LoRA Canvas (every run on one board)\r
\r
**Canvas** in the top bar opens a single board holding the training history of\r
every dataset you have. Each dataset gets a lane; inside a lane, each run is a\r
card and each save it wrote is a small pill underneath it. When a run continued\r
from an earlier one, the line between them starts at the *exact* checkpoint it\r
resumed from — so "where did this LoRA come from" is a thing you read, not a\r
thing you reconstruct.\r
\r
**Choosing what is on the board.** Everything is on it by default. Above the\r
board sits a single row of filter chips, about 40 px tall — it used to be a\r
fold-out panel, and unfolded on a library of fourteen datasets it stood 389 px\r
on a 720-px screen, more than half the window, directly above the thing you came\r
to look at.\r
\r
- **Datasets** opens a menu with a search box, **Select all** / **Clear**, and\r
  one checkbox per dataset with its run count. The search matches the name *and*\r
  the model family, so typing \`krea\` brings up every Krea lane.\r
- **Models** and **Status** are the same idea for the model family and the run\r
  state (Active, Completed, Errors, Unknown).\r
- **Pinned** toggles the pinned images on and off. Turned off it goes amber:\r
  pinned pictures missing from the board with no visible cause is a bug report\r
  waiting to happen.\r
- The **search box** stays at full size in the row — it filters the *runs* on the\r
  board (dataset, run ID, model, variant), which is a different question from\r
  "find me a lane to tick".\r
- **Reset** puts everything back, and goes dim when there is nothing to reset.\r
\r
Every chip carries its own count and lights up while it is narrowing something,\r
and the row ends with **N runs shown** — so a filter you set and forgot can never\r
empty your board without saying why. Your choices are remembered between visits.\r
\r
**Saving an arrangement.** **💾 Layouts** in the board toolbar keeps where every\r
run card and every pinned picture sits, under a name, and puts it back later —\r
closed pictures included. Until this existed, the only way out of an arrangement\r
was **✦ Tidy up**, which throws it away. A run deleted since the layout was saved\r
simply is not restored, and the app tells you how many were missing rather than\r
leaving you to hunt for the card that did not come back.\r
\r
**Exporting the board.** **📷 PNG** writes the whole canvas to one image file:\r
every pinned picture at full size, every run card with its checkpoints, and the\r
lines that join them. It is a redraw rather than a screenshot, so the buttons,\r
badges and hover highlights are not in it — and a picture whose file has been\r
cleaned off the disk comes out as a labelled placeholder rather than silently\r
missing.\r
\r
**Machine load.** The right-hand end of the board toolbar carries five small\r
numbers for the machine *running LDS* — **CPU**, **GPU**, **VRAM**, **RAM** and\r
the GPU **temperature** — refreshed every five seconds while the tab is in\r
front. It answers the one question the board could not: whether a run that\r
shows no new pictures is working or wedged. Every number carries a colour:\r
green below 50 % of its resource, amber 50-80 %, red past 80 % (for the\r
temperature: amber from 70°, red from 85°, the band where a GPU starts\r
throttling); **▾** folds the readout away and stops the polling with it, and\r
the choice is remembered. It is a glance, not a monitor: there is no history,\r
no graph and no per-process breakdown. On a machine with no NVIDIA card (or\r
with \`nvidia-smi\` unavailable, as in some containers) the GPU, VRAM and\r
temperature numbers are simply absent rather than shown as zeros. On a phone\r
the readout rides in the board's **⋯** shelf rather than the toolbar.\r
\r
The same readout is available on *every* page: the **📊** button at the right\r
of the top bar (in the menu panel, on a phone) unfolds an identical line next\r
to the navigation, so you can watch a training or a generation work from the\r
Test Studio, the Bank or a dataset without keeping Task Manager — or a ComfyUI\r
resource monitor — open. It starts folded, polls only while it is unfolded and\r
the tab is visible, and remembers your choice separately from the board's.\r
\r
**🧹 Free memory.** Beside the unfolded numbers sits a broom, for the case the\r
readout keeps showing: RAM full and not coming down while nothing runs. Two\r
things hold it. ComfyUI keeps every model it loaded in the session cached in\r
system RAM once it leaves the card (measured: 34 GB on an idle ComfyUI after\r
a day of Krea, Klein and video models) and never lets go on its own; the\r
vision model LDS loaded for captioning stays warm so a batch does not reload\r
it per image. **🧹** asks ComfyUI to unload and free (\`/free\`, the same lever\r
LDS pulls before a training) and releases the vision model LDS itself loaded,\r
then reads the machine again and says what actually came back — "Freed 32 GB\r
of RAM · RAM now 12/48 GB · VRAM 16 → 0.9 GB". The models reload on the next\r
job (a minute at most), nothing else changes. It is refused, with the reason,\r
while ComfyUI's queue is not empty or a training runs — unloading under a job\r
would only make that job reload everything — and a model another tool loaded\r
into Ollama or LM Studio is never touched (that is the fence's rule; the\r
Ollama-fence dialog is where a consented eviction lives).\r
\r
**Deleting a picture from the board.** A pinned image carries **✕** and **🗑**,\r
and they are not the same thing. **✕** takes it off the board and remembers where\r
it was, so re-pinning it from its gallery puts it back at the same spot and size.\r
**🗑** deletes the image itself, through the same route (and the same\r
recoverable-or-not setting) the gallery's own delete uses; it arms on the first\r
press and deletes on the second, because a delete one tap away from ✕ on a small\r
control is a delete that happens by accident.\r
\r
**Zoomed out.** Below 55 % zoom each run card carries its run number at a\r
constant, readable size, and below 30 % the dataset name comes with it. A board\r
of a dozen lanes is read at 30-40 %, where a card's own title is about four\r
pixels tall.\r
\r
**Moving around.** Drag the background to pan, use the wheel (or two fingers) to\r
zoom, and **Fit** puts the whole board back in view. The board only fits itself\r
automatically until you first touch it — after that a dataset finishing its load\r
never yanks your view away.\r
\r
**Moving something counts as touching it.** Zooming and panning are not the only\r
way to take the view over: the first time you drag a picture or a run card to a\r
new place, the board stops re-framing itself for good. Placing a render far from\r
its lane makes the board bigger, and an automatic fit at that moment zoomed the\r
whole plateau out the instant you let go — your framing thrown away by the very\r
act of tidying. **✦ Fit** is still one click away whenever you *do* want the\r
whole board back; it simply is not decided for you any more. A board you have\r
never arranged still opens fitted, as it always did.\r
\r
**The reference face.** A character dataset's lane opens with its reference\r
image, next to the dataset name — the person the renders on that lane are meant\r
to be. Click it to open it full size against them. It is part of the lane label,\r
not a pinned picture: it cannot be moved, closed, grouped or exported. Concept\r
and style datasets show nothing there, because they are not built around a\r
reference face.\r
\r
**Reading a run.** Click a run card to open **everything that run produced**:\r
its images grouped by the checkpoint that made them, most-trained step first, so\r
you can see where the LoRA stopped getting better without opening one pill at a\r
time. Underneath the images are the run's note, its per-checkpoint notes, and the\r
settings it trained with. **ⓘ Full details** opens the drawer where those notes\r
can be edited.\r
\r
A run with many checkpoints opens with its three most-trained steps expanded and\r
the rest folded behind their image counts — tap a step to unfold it. When a run\r
holds more images than one panel should carry, the panel says so rather than\r
looking complete; the missing ones are still reachable from each checkpoint's own\r
pill and in the Test Studio.\r
\r
Sometimes a step reads **Step unknown**. Those are older test images whose file\r
name identifies the run but not the checkpoint inside it, so they belong to the\r
run and to no pill. Images that identify nothing at all are still counted in the\r
footnote at the bottom of the panel — they live in the Test Studio.\r
\r
**Shift-click two** run cards to compare their settings side by side, with the\r
differences highlighted — and because every dataset is on the same board, those\r
two runs no longer have to belong to the same dataset. Dragging a card to\r
rearrange the board never opens the panel.\r
\r
**Arranging the board.** Drag a run card and it stays where you put it, across\r
reloads. On a phone, moving a card and scrolling the board are the same gesture,\r
so a card is picked up with a **long press** — rest your finger on it for a\r
moment and it lifts; a finger that slides straight away scrolls as usual.\r
\r
Once you have moved anything in a lane, that whole lane stops rearranging itself:\r
a training run that finishes later lands in free space next to your layout\r
instead of pushing everything sideways, which is what would otherwise happen —\r
the automatic tree centres each run over its continuations, so one new branch\r
re-flows the lane around it. Lanes you have never touched keep following the\r
automatic tree, because there is no arrangement to protect there.\r
\r
**Moving a whole dataset's block, and giving it room.** A lane — the dataset's\r
title strip and everything under it — has two grips of its own:\r
\r
- **its title strip** moves the whole block. Drag \`● name  N runs\` and the lane\r
  goes where you put it, with its cards and its pictures. Every other lane stays\r
  exactly where it was; moving one lane moves one lane.\r
- **its bottom edge** sets how much **room** the lane keeps, and the datasets\r
  below move with it. That edge exists because of one thing: 📌 Pin all hangs a\r
  contact sheet *below* the tree, and the board only ever counted the tree — so\r
  on a lane with a few dozen pinned pictures the sheet landed on top of the next\r
  dataset's cards. The edge turns **amber** when a lane draws past its own room,\r
  which is exactly that collision, named where it happens. **Double-click** it\r
  to fit the lane to what it actually draws.\r
\r
A lane you have never dragged keeps following the automatic stack, and pictures\r
still hang freely below and beside their lane — a picture you drag somewhere is\r
never what decides how much room a dataset takes; you are.\r
\r
**✦ Tidy up** is the way back: it forgets every card you have moved on the lanes\r
currently shown, hands every lane back to the automatic stack, rebuilds the\r
automatic tree, and brings every pinned picture back beside the run that made\r
it — including one you dragged clean off its lane. Positions are only ever a\r
display preference — moving a card, a lane or a picture never changes which run\r
continued which or which checkpoint made which image, and Tidy up never deletes\r
a run, a checkpoint, a note or a picture.\r
\r
**Generating from the board.** Every checkpoint pill carries a small **✓** box.\r
Tick one and the run settings open beside the board: the prompt, the seed, the\r
format, the steps, the engine settings — the Test Studio's own panel, not a\r
lookalike, so anything the Test Studio can do the board can do too.\r
\r
What the board adds is that your picks do not have to belong to the same\r
dataset. Tick a checkpoint in one lane and two in another and they run together\r
on one shared prompt and one shared seed, which is the only honest way to\r
compare LoRAs against each other.\r
\r
Two things it will tell you rather than fail at:\r
\r
- **A checkpoint that is not in ComfyUI yet** is still pickable. The button then\r
  says what it is about to do — *"Deploy 2 checkpoints, then generate"* — and\r
  waits for you. Nothing is copied into your ComfyUI folder by a button that did\r
  not announce it, and if a copy fails, nothing generates: half a comparison\r
  answers a different question than the one you asked.\r
- **Two different families in one selection** (say Krea and Z-Image) is refused,\r
  and it says which two. This is not a restriction we chose: those families do\r
  not share a base model or a workflow, so there is no single run that can render\r
  both. Unpick one family and the button comes back.\r
\r
**⚖ Compare or 🧬 Blend.** From the second pick onwards the panel offers a\r
choice, and it defaults to what it always did:\r
\r
- **⚖ Compare** — one pass per checkpoint, swept across the strengths. This is\r
  how you find out which LoRA, or which step, is better.\r
- **🧬 Blend** — *one* generation loads them **all**, each at its own weight, and\r
  every dataset's trigger word is added to the front of your prompt. The panel\r
  lists those words before you launch; nothing is injected silently. It is the\r
  Test Studio's Blend mode, driven from the board — the same toggle, the same\r
  engine. (The Test Studio called it **🧬 Combine** until August 2026; only the\r
  name changed.)\r
\r
A blend is one configuration, not one per pick, so the strength sweep disappears\r
(each LoRA carries its own weight instead) and the image counter drops to one\r
picture per seed.\r
\r
**Trying several weights at once.** Each picked checkpoint has a row of weight\r
boxes under its slider. Tick two on one and two on another, and the launch\r
renders **all four combinations** in a single run instead of making you launch,\r
look, move a slider and launch again. Every image is labelled with the pair that\r
produced it. Tick nothing and the slider governs, exactly as before; the slider\r
is also how you use a weight that is not on the grid.\r
\r
The panel counts the cost before you commit — "4 weight combinations → 4 images,\r
about 1 min" — and turns amber past 24 images. It does not refuse: the queue is\r
serial and the machine is yours. Two checkpoints at four weights each is 16\r
images, which is exactly why the panel does the multiplication for you.\r
\r
What blending actually does is worth saying plainly: **two identity LoRAs give\r
you a hybrid person** — someone who is neither of the two. That is a real use, on\r
purpose, but it is not "both people in one shot". The combination that usually\r
pays off is **identity + style**, or **identity + concept**. Weights are the dial:\r
below 1 the LoRA contributes less, above 1 it dominates (0 to 2, 1 by default),\r
and a weight you set survives un-ticking another pick or reloading the page.\r
\r
Blend needs **at least two checkpoints of one family**; with a mixed selection\r
the toggle is greyed out with the reason, because the run underneath it could not\r
exist either. Picks that are not deployed yet are deployed first, all of them,\r
before anything is generated — a blend never loads a subset of what it announced.\r
\r
**▶ Continue training from a checkpoint.** Clicking a pill's body opens its\r
actions — Download, Deploy, Details, Delete — and **▶ Continue from here**. It\r
opens the *same* launch dialog the Checkpoints panel and the Runs page open, on\r
*that exact save*: how many\r
extra steps, and — folded under *Adjust settings* — the checkpoint cadence, the\r
preview prompts, the preview steps and CFG, the timestep weighting and the\r
learning rate. Rank, base and\r
optimizer are locked to the checkpoint being continued; they are not things a\r
resume can change.\r
\r
The dialog also names **what “resume” means**; it never silently guesses:\r
\r
- **Full training state** is offered only for a local checkpoint carrying a\r
  complete, hash-verified state bundle. It restores the raw adapter parameters,\r
  optimizer, scheduler, scaler, EMA, Python/NumPy/Torch/CUDA random generators,\r
  dataloader order and cursor, bucket/crop geometry, the exact latent/text-cache\r
  bytes, and the exact next step. Exported image, caption and mask contents,\r
  dataset topology, base, network shape, training recipe, ai-toolkit revision,\r
  GPU identity and the complete installed Python-package map must still match.\r
  In this mode only the preview settings can change — the prompts, and the\r
  preview **steps and CFG**: those decide how a test image is rendered once the\r
  sampler is already running, and touch neither the loop nor the weights.\r
  Save/preview cadence, learning rate and timestep weighting stay locked because\r
  changing any of them would change the trajectory the state belongs to.\r
- **LoRA weights only** is the explicit fallback and is available for legacy\r
  checkpoints. The chosen \`.safetensors\` is copied into a clean run folder;\r
  optimizer, scheduler, scaler, RNG and dataloader progress restart. The source\r
  run is renamed aside, not deleted, so all its saves remain recoverable.\r
\r
Each checkpoint says why full state is unavailable when its bundle is missing,\r
incomplete, corrupt or incompatible. State bundles are published atomically and the newest two are retained alongside\r
the public checkpoints, so a crash during capture cannot masquerade as a usable\r
exact save.\r
\r
One deliberately conservative boundary remains: low-level Torch/CUDA backend\r
flags changed externally after LDS performs its runtime preflight are not yet\r
part of the compatibility fingerprint. Do not change deterministic/TF32/cuDNN\r
flags between the original process and an exact continuation.\r
\r
Read the step field as **extra** steps, not a total: the line beside it spells\r
out where you land ("→ target step 3500") and so does the button. Resuming step\r
2500 of a run that ended at 3500 is the whole point of opening this from a pill\r
— a later epoch can be over-cooked, and the earlier one is often the better\r
LoRA.\r
\r
What is *not* possible is stated rather than hidden — a lane you cannot use\r
stays visible, greyed, with its reason:\r
\r
- *"Local training needs ai-toolkit"* / *"A training is already running on this\r
  machine"* — local training is single-flight for the whole machine.\r
- *"Cloud training needs a rental key set up in Settings"* — **this build trains\r
  locally only**, so the cloud lane is always closed here, on this board exactly\r
  as in the dataset's own Continue dialog. It is shown rather than removed so the\r
  two screens never disagree about why an option is unavailable.\r
- *"This save is no longer on this machine"* — there is no copy anywhere, so the\r
  lane that needs the file says so instead of failing at launch.\r
\r
If the save vanished between the board being drawn and the click, the launch is\r
refused with the steps that *are* available, named — never a silent failure.\r
\r
**The gallery under a checkpoint.** Images pile up. A checkpoint that has\r
produced more than one shows a small **× N** badge; clicking it opens everything\r
that checkpoint ever made, newest first — from the board, from the Test Studio,\r
from a comparison run, it does not matter. Regenerating no longer replaces what\r
was there.\r
\r
Which image belongs to which checkpoint is recorded when the image is generated.\r
Images made before that was recorded are matched back where the evidence allows\r
it (the run tag the deploy stamps into the LoRA's name); those that cannot be\r
traced are **counted and left out** rather than shown under a checkpoint they\r
might not belong to. The gallery says how many those are — they are still in the\r
Test Studio, they simply have no node to sit under.\r
\r
**What a generated image was made with.** Open any image from a gallery and the\r
full-screen view lays its record out beside it: the three facts you look for\r
first (**step**, **seed**, **LoRA strength**) as chips, then the settings that\r
actually decided the picture — sampler, scheduler, CFG, sampling steps, the base\r
model, the LoRA file, any always-on LoRAs, the format, the face-similarity score\r
— and the prompt last. The prompt folds when it is long instead of pushing\r
everything else off the screen, and both the **seed** and the **prompt** copy in\r
one click. A run that predates a given setting simply shows no row for it: an\r
absent line is honest, a dash is not.\r
\r
**📌 Pinning an image onto the board.** Comparing two checkpoints means looking\r
at their pictures *at the same time*, which a full-screen viewer cannot do. From\r
that viewer, **Pin to canvas** drops the image onto the board as a node of its\r
own, joined to the checkpoint that produced it by the same connector the board\r
uses for "this run continued from that checkpoint".\r
**📌 Pinning an image onto the board.** Comparing two checkpoints means looking\r
at their pictures *at the same time*, which a full-screen viewer cannot do. So\r
**📌** drops an image onto the board as a node of its own, joined to the\r
checkpoint that produced it by the same connector the board uses for "this run\r
continued from that checkpoint".\r
\r
There are two ways in, and the first one is the one to remember: **every\r
thumbnail in a run or checkpoint gallery carries a 📌 in its bottom-right\r
corner** — one tap, no need to open the image at all. It is hidden while you are\r
in **Select** mode (that mode is for arming a delete, and a second target there\r
is a mis-tap waiting to happen). The same action is also in the full-screen\r
viewer, spelled out as **📌 Pin to canvas**, for when you have already opened a\r
picture and decide it belongs on the board.\r
\r
- **Move it** by dragging (on a phone: a long press picks it up, exactly like a\r
  run card). **Resize it** from the corner handle. **Close it** with **✕**.\r
- **It goes wherever you want on the board — its lane is not a box.** Drag it\r
  above its own lane, into the margin to the left of everything, or across to sit\r
  beside another dataset's runs: nothing stops at the lane's corner any more, and\r
  the arrow keys reach the same places. **✦ Fit** grows to include it, so a\r
  picture parked well outside its lane is always one click from being back on\r
  screen. Two things stay true wherever you put it: the line to the checkpoint\r
  that made it follows it (that link is read off the image, never off its\r
  position, so a picture can never end up claiming a run it did not come from),\r
  and the picture still belongs to its own dataset — moving it over another\r
  lane's runs changes nothing but where it is drawn.\r
- The one thing to know before parking one far away: a lane's own position on the\r
  board depends on which datasets are ticked and how tall the lanes above it are.\r
  A picture is measured from **its own lane**, so it travels with the run it is\r
  evidence about — put it next to *another* dataset's lane and it will keep that\r
  spot relative to its own lane, not relative to its neighbour. **✦ Tidy up**\r
  brings everything home if a board gets away from you.\r
- Closing forgets nothing. Pin the same image again and it comes back **exactly\r
  where you left it, at exactly the size you left it** — that is the point of the\r
  feature, not a side effect. The geometry lives with your card positions, on\r
  your machine's LoRA Dataset Studio rather than in one browser, so it follows\r
  the dataset.\r
- **Keyboard:** focus a pinned image (Tab), then the arrow keys move it,\r
  Shift+arrows move it faster, **+** / **−** resize it and **Esc** closes it.\r
- If the image is later **deleted**, its node quietly leaves the board — a node\r
  showing a picture that no longer exists would be worse than no node. If the\r
  *checkpoint* is gone but the image is not, the picture stays and simply loses\r
  its connecting line.\r
- Unticking a dataset takes its lane off the board, pinned images included; they\r
  come back with the lane, untouched.\r
- **✦ Tidy up** does not throw pinned images away — it brings them **home**. Every\r
  picture on the visible board comes back beside the run that made it, into the\r
  same tidy band **📌 Pin all** uses, wherever you had dragged it to. That is the\r
  guaranteed way back from a picture parked far outside its lane, and it is why\r
  free placement is safe to play with. Pictures you have **closed** are not\r
  touched: their remembered spot is a promise, and Tidy up is not the place to\r
  break it.\r
- The **✕**, the **🔍** and the resize corner keep a finger-sized target **at\r
  every zoom level**: they are drawn at a constant size on screen rather than at\r
  the board's, so a board fitted to twenty runs is still one you can tap.\r
\r
**🖼🖼 Fuse pinned images side by side.** Comparing two renders across a gap and\r
two frames is comparing two frames. **Drop one pinned image onto another and\r
they become a single node**, pictures edge to edge with nothing drawn between\r
them. There is **no limit**: drop a third, a tenth, they all join the strip.\r
\r
- **Where it lands.** While you drag, the picture you are about to join lights up\r
  with a dashed outline, a bar marks the exact slot yours would take, and a label\r
  says how many pictures the group would then hold. Let go anywhere else and it\r
  is an ordinary move — nothing fuses by surprise.\r
- **Which side.** Drop on the left half of a picture to land before it, on the\r
  right half to land after it. The same gesture **re-orders** a group: drag a\r
  member out and back onto the slot you want.\r
- **Move the whole group** by its **title bar** (\`⠿ N images\`), which is also\r
  where its **✕** lives. That bar is the only thing that moves a group, on\r
  purpose: dragging a *picture* inside a group means something else entirely.\r
- **Take one back out** by dragging it **off the group**. That is the whole rule\r
  — while it is still over the strip nothing has happened, and letting go there\r
  puts it back. Once it is clear of the strip it becomes a node of its own again,\r
  **at the size it had before it joined**, wherever you dropped it. Joining a\r
  group never rewrites a picture's own size; the strip only borrows it.\r
- **The pictures that stay do not move.** Take the first one out and the strip\r
  keeps its place and its height; the rest simply close the gap. A group left\r
  with a single picture stops being a group.\r
- **Which ✕ am I about to press?** At rest a group is nothing but photographs.\r
  Hover (or Tab to) one and *that* picture lights up and shows its own step\r
  label, its and its ✕ — the group's own ✕ is the one on the title bar, and it\r
  carries the count (\`✕3\`) precisely so the two can never be confused. Closing a\r
  group closes all of its pictures, undoes the group, and each one keeps its own\r
  remembered size; re-pinning one from its gallery brings back **that one**, not\r
  the strip.\r
- **Every picture in a strip is the same height**, each scaled to keep its own\r
  shape — that is what makes the band continuous instead of a row of letterboxed\r
  tiles. Resize the group from its corner and the whole strip scales.\r
- **A strip gets ONE link back to each checkpoint it came from**, not one per\r
  picture, and they all leave the band at the same point. A strip is one object\r
  to the eye and to every gesture, so eight connectors fanning out of it was\r
  eight times the ink for one fact — and now that a picture can be parked far\r
  from its run, those links are long. A strip whose pictures all come from the\r
  same checkpoint therefore draws a single line; one built from three epochs\r
  draws three, because collapsing them would quietly credit one epoch with the\r
  other two.\r
- **A strip has no width limit, and that is the honest consequence of "no\r
  limit".** Ten pictures side by side is ten times as wide as one; the board\r
  zooms and pans, so **✦ Fit** is the answer. It deliberately does *not* wrap\r
  onto a second row — a strip that quietly stopped being a strip at some\r
  invisible threshold would be worse than a wide one. On a phone, expect to zoom.\r
- **✦ Tidy up moves a strip, and never takes one apart.** It brings the whole\r
  band back beside the run that made its first picture, in one piece and in the\r
  same order — a strip is something you assembled on purpose, so tidying it means\r
  putting it away, not dismantling it. (It used to leave strips exactly where\r
  they were, which was fine while a strip could not leave its lane; now that one\r
  can be parked anywhere on the board, "leave it alone" would have meant leaving\r
  it lost.) The way *out* of a group is still the group's ✕, or dragging its\r
  pictures back off it.\r
\r
**📌 Pin all — the whole lot in one gesture.** When a generation launched from\r
the board finishes, the green bar says how many images are ready and names the\r
checkpoints they joined. **📌 Pin all N to the board** puts every one of them on\r
the board without opening a single gallery.\r
\r
- **Where they land.** In a band under the lane, **one column per checkpoint**,\r
  each column under the checkpoint that produced it — so a lot spanning four runs\r
  reads as four groups, and each picture still draws its own line back to its\r
  pill. The band starts below everything already on the lane, which is what makes\r
  the guarantee a real one: **nothing is ever placed on top of a run card, a\r
  checkpoint pill or a picture you positioned yourself.**\r
- **One strip per generation, always in training order.** The pictures of one\r
  run fuse into a single strip that reads left to right by step — 500, 1000,\r
  1500 — so the strip is an epoch axis. A **second** generation, even fired at\r
  the same checkpoint, gets its **own** strip: two runs stay two runs on the\r
  board, which is the only way to compare them. Pinning one picture at a time\r
  from a gallery follows the same rule — it joins the strip of the generation it\r
  came from, in its place in the order, never the end. Images generated before\r
  LDS recorded which launch made them fall back to grouping by checkpoint.\r
- **Big lots become a contact sheet.** A pair of renders lands full size; twenty\r
  or thirty land as thumbnails, which is the size you actually compare that many\r
  pictures at. Each one is still resizable afterwards like any other node.\r
- **What is already on the board is left alone.** An image you have already\r
  pinned is neither moved nor duplicated, and the button counts only what is\r
  left — once everything is up, the button is simply not there any more. An\r
  image you *closed* is offered again, and comes back where you closed it when\r
  that spot is free.\r
- **Nothing is stacked in silence.** One click places at most 40 pictures; if the\r
  run made more, the bar says how many were left out and where to get them\r
  (their checkpoint gallery). The count of what was actually pinned is announced\r
  for screen readers too.\r
- **↩ Undo** takes exactly the images that click added straight back off the\r
  board, and nothing else.\r
\r
**Which checkpoints you can generate from, at a glance.** Every checkpoint pill\r
carries its deployment state on its **left edge**: a **solid sky bar** means the\r
checkpoint is deployed to ComfyUI and can be generated from right now; a **dashed\r
grey bar** means the file is on your disk but not deployed yet. Not deployed does\r
*not* mean missing — the save is there, it simply has no copy in ComfyUI, and\r
ticking it before **🎨 Generate** makes the launch deploy it for you. The shape\r
(solid versus dashed) carries as much of the message as the colour does, a legend\r
sits above the board, and hovering a pill spells it out in words.\r
\r
The graph embedded in a dataset's *Checkpoints & LoRAs* panel is unchanged and\r
still holds the per-checkpoint actions (download, deploy, continue from here,\r
inline previews). The canvas is a second way in, not a replacement.\r
\r
## Undeploy several LoRAs at once\r
\r
Deploying a checkpoint copies it into ComfyUI's \`loras\` folder so you can use it\r
in a workflow. Over a few months of training that folder fills up, and taking\r
LoRAs back out used to be a one-at-a-time errand: open a run's checkpoint pill,\r
open its popover, press ⏏ Undeploy, repeat. Nothing anywhere even told you how\r
many were deployed.\r
\r
**⏏ Undeploy…** at the top of the **Canvas** page opens the whole list at once —\r
every LoRA this app has put into ComfyUI, across *all* your datasets and all\r
families, grouped by dataset. Tick the ones you want gone, press the button, and\r
they go in one pass. **Select all** is there for the clear-out.\r
\r
**Only what the app deployed is listed.** A LoRA you downloaded yourself and\r
dropped in the same folder never appears, and is never touched — the list is\r
built from the app's own record of what it imported, not from a directory scan.\r
That distinction matters because this screen deletes files.\r
\r
**It is the reversible half.** Your *training saves* are kept: every LoRA you\r
undeploy can be deployed again from its checkpoint whenever you want. The\r
removed copies go to the trash, recoverable until you empty it in\r
**Settings ▸ Maintenance**.\r
\r
The run reports what it actually did, in three parts, because they are not the\r
same thing: how many were **removed**, how many were **already gone** (you had\r
deleted the file by hand — no error, you have the outcome you asked for), and how\r
many were **refused**, each named so you can act on it.\r
\r
## Upscale a picture straight from the board\r
\r
Click a pinned picture (🔍, or the picture itself) and the full-screen view now\r
carries **✨ Upscale & improve** next to **⬇ Download** — the same pass, and the\r
same choice of engine, as the one in the dataset lightbox.\r
\r
The same button is on the **checkpoint and run galleries** — open a picture from\r
a pill's 🖼 gallery, or from a run card, and it is there too. That is where an\r
improvement is delivered, so it is where the gesture costs the fewest clicks:\r
you are already comparing a checkpoint's renders when you decide one of them\r
deserves a bigger pass. Both surfaces are the same action on the same picture:\r
\r
- **✨ Improve via Klein** re-renders detail and texture. Sharper, but skin and\r
  colour can shift. Pressing it opens a small settings window that quotes the\r
  exact instruction it is about to send — editable in place, or switched off —\r
  with the Klein model, LoRA preset and output size, and a **✨ Generate**\r
  button. Stay, and the finished picture appears right in that window.\r
- **🔍 Upscale via SeedVR2** resolves detail at a higher resolution and keeps the\r
  original look. It appears once SeedVR2 is installed; until then Setup ▸ ComfyUI\r
  can download it for you, and pressing ✨ before that answers with the same\r
  offer to install it rather than a plain error.\r
\r
**Where the result goes.** The picture you started from is never touched. The\r
improvement arrives as its **own image in that checkpoint's gallery**, right next\r
to the original — open the gallery from the checkpoint pill (🖼) and you can\r
compare the two, download either, or pin the improved one onto the board beside\r
its source. A Klein pass shows its result **in the ✨ window itself** if you stay\r
on it; close the window early (or run SeedVR2, which has no window) and nothing\r
moves on its own, which is why the confirmation says where to look. The pass\r
takes minutes, and a gallery already open does not refresh by itself: close it\r
and open it again to find the new picture waiting at the top.\r
\r
Two things it deliberately will not do. An **improvement cannot be improved\r
again** — running two passes over the same pixels is how a face turns to\r
plastic — and the **lane's reference face** has no ✨ at all, because it is a\r
photo you supplied, not something the app generated. If a pass fails, press ✨\r
again: that is the retry.\r
\r
**It stays out of the Test Studio.** These upscales are not sweep cells, so they\r
never appear in the Test Studio grid, never count as a run in progress, and never\r
enter the 👍/👎 ranking of a checkpoint — a rating you give an *upscale* would\r
otherwise be read as a vote for the checkpoint that did not produce it.\r
\r
## Tips that save runs\r
\r
- Trust the composition meter over your instinct — a set that "looks varied"\r
  is usually still face-heavy.\r
- Fix every leak the badge reports before training; one "a woman with long\r
  blonde hair" caption quietly competes with your trigger unless Hair is set\r
  to Describe in Captions ⚙️ Options.\r
- Don't chase steps. Train the auto count, then let the Test Studio find the\r
  *earliest* checkpoint that nails the identity — it keeps the most prompt\r
  flexibility.\r
- The next chapter — **Building a good dataset** — explains *why* behind every\r
  rule above. Read it once before your first serious run.\r
`;export{e as default};
