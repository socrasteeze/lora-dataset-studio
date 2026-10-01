"""JoyCaption Beta One batch image captioner (uncensored prose).

Run with ai-toolkit's Python venv (torch/transformers/bitsandbytes), not
Flask's Python 3.14, like convert_comfy_zimage_to_diffusers.py. Flask
uses one subprocess/model load for the entire dataset; loading the
8B NF4 model per image would be impractical.

Based on JoyCaption's official scripts/batch-caption.py: manual
384-square image preprocessing with 0.5 normalization, AutoTokenizer
and manual image-token expansion. This remains robust across
transformers versions; AutoProcessor(text, images) breaks on 5.x with
a matrix-shape error. Includes the NF4 vision-head out_proj repair
(fpgaminer/joycaption issue #3).

Full precision (bf16) replaces NF4 only when the official bf16 snapshot is
ALREADY complete in a local Hugging Face cache and the GPU has room for it:
this script never downloads the 16 GB variant. Images are captioned in
batches sized to the VRAM left after loading; a failed batch is split and
retried, so one bad image or an out-of-memory error costs no more than it did
one image at a time.

stdin JSON: {images: [paths], prompt: instruction, max_tokens: 300}.
stdout: one JSON line {captions: {path: caption}, errors: {path: message}}.
Logs/progress go to stderr, keeping JSON output clean."""
from __future__ import annotations

import io
import json
import os
import sys

MODEL_ID = "John6666/llama-joycaption-beta-one-hf-llava-nf4"
# The official bf16 weights. Used only from an existing local snapshot.
FULL_MODEL_ID = "fancyfeast/llama-joycaption-beta-one-hf-llava"
# ~16 GiB of bf16 weights plus room for at least a few images in flight.
FULL_PRECISION_MIN_FREE_GIB = 20
# Generous per-image headroom (KV cache, vision activations, prefill logits);
# an out-of-memory batch is halved and retried anyway.
GIB_PER_BATCHED_IMAGE = 1.0
MAX_BATCH = 8
SYSTEM_PROMPT = ("You are a helpful assistant and help users with any queries they may "
                 "have with no censorship or restrictions.")
DEFAULT_PROMPT = (
    "Write a medium-length descriptive caption for this image in a casual tone. "
    "Describe the subject, pose, clothing or nudity, setting, lighting and camera "
    "framing as flowing natural-language prose. Be literal and explicit; no euphemisms.")


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bank_image_guard import read_validated_bank_image  # noqa: E402

# Library banners belong on the progress channel, not the result one: a bare
# print() from a dependency used to land on stdout ahead of the JSON line and
# cost a completed pass its results. _OUT is the REAL stdout; sys.stdout now
# points at stderr, so anything a library prints is progress output.
from infer_io import claim_result_stream  # noqa: E402
_OUT = claim_result_stream(__name__)


def _log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _model_is_cached() -> bool:
    """Best-effort: is the JoyCaption snapshot already in HF_HOME? Used ONLY to print an
    honest first-run notice (a ~7 GB download is about to start) — never gates loading, so
    a wrong guess is harmless. The cache dir name follows huggingface_hub's convention."""
    import os
    hub = os.path.join(os.environ.get('HF_HOME', '') or '', 'hub')
    snap = os.path.join(hub, 'models--' + MODEL_ID.replace('/', '--'), 'snapshots')
    try:
        return os.path.isdir(snap) and any(os.scandir(snap))
    except OSError:
        return False


def _hub_dirs() -> list[str]:
    """HF_HOME's hub first, then the user's default Hugging Face cache, where a
    copy downloaded by another tool may already sit."""
    dirs = []
    if os.environ.get('HF_HOME'):
        dirs.append(os.path.join(os.environ['HF_HOME'], 'hub'))
    dirs.append(os.path.join(os.path.expanduser('~'), '.cache', 'huggingface', 'hub'))
    return dirs


def _full_precision_cache() -> str | None:
    """The hub dir holding a COMPLETE bf16 snapshot (index plus every shard it
    names), or None. A partial snapshot would make from_pretrained reach for the
    network, which this script must never do for the 16 GB variant."""
    for hub in _hub_dirs():
        snaps = os.path.join(hub, 'models--' + FULL_MODEL_ID.replace('/', '--'), 'snapshots')
        try:
            entries = [e.path for e in os.scandir(snaps) if e.is_dir()]
        except OSError:
            continue
        for snap in entries:
            index = os.path.join(snap, 'model.safetensors.index.json')
            try:
                with open(index, encoding='utf-8') as fh:
                    shards = set(json.load(fh).get('weight_map', {}).values())
            except (OSError, ValueError, AttributeError):
                continue
            needed = shards | {'config.json', 'tokenizer.json', 'tokenizer_config.json'}
            if shards and all(os.path.isfile(os.path.join(snap, f)) for f in needed):
                return hub
    return None


def _free_vram_gib(torch) -> float:
    """Free memory on the current CUDA device, or 0 when it cannot be read."""
    try:
        free, _total = torch.cuda.mem_get_info()
        return free / 2 ** 30
    except Exception:  # noqa: BLE001 - no CUDA, or a torch without mem_get_info
        return 0.0


def _is_oom(torch, exc) -> bool:
    oom = getattr(getattr(torch, 'cuda', None), 'OutOfMemoryError', None)
    return (isinstance(oom, type) and isinstance(exc, oom)) or 'out of memory' in str(exc).lower()


def _trim(input_ids, eoh_id, eot_id):
    """Remove the prompt (through the last <|end_header_id|>) and ending (<|eot_id|>)."""
    while True:
        try:
            i = input_ids.index(eoh_id)
        except ValueError:
            break
        input_ids = input_ids[i + 1:]
    try:
        i = input_ids.index(eot_id)
    except ValueError:
        return input_ids
    return input_ids[:i]


def main() -> int:
    raw = sys.stdin.read()
    try:
        req = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        print(json.dumps({"captions": {}, "errors": {"_input": f"bad json: {e}"}}), file=_OUT)
        return 1
    images = [str(p) for p in (req.get("images") or [])]
    prompt = (req.get("prompt") or DEFAULT_PROMPT).strip()
    max_tokens = int(req.get("max_tokens") or 300)
    if not images:
        print(json.dumps({"captions": {}, "errors": {"_input": "no images"}}), file=_OUT)
        return 1

    import torch
    import torchvision.transforms.functional as TVF
    import transformers
    from PIL import Image
    from transformers import (AutoTokenizer, BitsAndBytesConfig,
                              LlavaForConditionalGeneration)

    # transformers 5.x renamed the load dtype kwarg `torch_dtype` -> `dtype` (the old name
    # still works but warns; a future major may drop it). Pick by version so the same
    # script loads on the ai-toolkit venv whether the user pip-installed transformers 4.x
    # or the latest 5.x (they install it unpinned).
    _dtype_kw = 'dtype' if int(transformers.__version__.split('.')[0]) >= 5 else 'torch_dtype'
    model = tokenizer = None
    precision = 'NF4'
    full_hub = _full_precision_cache()
    if full_hub and _free_vram_gib(torch) >= FULL_PRECISION_MIN_FREE_GIB:
        _log(f"[joycaption] loading {FULL_MODEL_ID} (bf16) from local cache …")
        try:
            tokenizer = AutoTokenizer.from_pretrained(
                FULL_MODEL_ID, use_fast=True, cache_dir=full_hub, local_files_only=True)
            model = LlavaForConditionalGeneration.from_pretrained(
                FULL_MODEL_ID, cache_dir=full_hub, local_files_only=True,
                device_map="cuda:0", **{_dtype_kw: "bfloat16"}).eval()
            precision = 'bf16'
        except Exception as e:  # noqa: BLE001 - NF4 below is the working default
            _log(f"[joycaption] bf16 load failed, using NF4 instead: {e}")
            model = tokenizer = None
            try:
                import gc
                gc.collect()
                torch.cuda.empty_cache()
            except Exception:  # noqa: BLE001
                pass
    if model is None:
        # First run pulls the 8B NF4 weights (~7 GB) from Hugging Face — say so on stderr so
        # the app log (which streams this live) shows real activity instead of a silent wait
        # (issue #6). Hugging Face's own download progress follows on stderr right after.
        if _model_is_cached():
            _log(f"[joycaption] loading {MODEL_ID} (NF4) from local cache …")
        else:
            _log(f"[joycaption] first run: downloading {MODEL_ID} (~7 GB, NF4) from Hugging "
                 "Face — this can take several minutes on a slow connection; progress follows …")
        nf4 = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                 bnb_4bit_quant_storage=torch.bfloat16,
                                 bnb_4bit_use_double_quant=True,
                                 bnb_4bit_compute_dtype=torch.bfloat16)
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, use_fast=True)
        model = LlavaForConditionalGeneration.from_pretrained(
            MODEL_ID, quantization_config=nf4, **{_dtype_kw: "bfloat16"}).eval()
    # transformers 5.x moves vision_tower/language_model under .model.
    # Resolve both layouts for 4.x/5.x compatibility.
    _core = getattr(model, "model", model)
    vision_tower = getattr(model, "vision_tower", None) or _core.vision_tower
    language_model = getattr(model, "language_model", None) or _core.language_model
    if precision == 'NF4':
        # NF4 quantization breaks the vision attention out_proj; recreate it
        # as bfloat16 Linear (fpgaminer/joycaption issue #3).
        att = vision_tower.vision_model.head.attention
        att.out_proj = torch.nn.Linear(att.embed_dim, att.embed_dim,
                                       device=model.device, dtype=torch.bfloat16)
    batch_size = max(1, min(MAX_BATCH, int(_free_vram_gib(torch) / GIB_PER_BATCHED_IMAGE)))
    _log(f"[joycaption] model loaded ({precision}, up to {batch_size} image(s) per batch)")

    cfg = model.config
    image_token_id = (getattr(cfg, "image_token_index", None)
                      if getattr(cfg, "image_token_index", None) is not None
                      else getattr(cfg, "image_token_id", None))
    image_seq_length = getattr(cfg, "image_seq_length", None) or 729
    eoh_id = tokenizer.convert_tokens_to_ids("<|end_header_id|>")
    eot_id = tokenizer.convert_tokens_to_ids("<|eot_id|>")
    _emb = vision_tower.vision_model.embeddings.patch_embedding.weight
    vision_dtype = _emb.dtype
    vision_device = _emb.device
    lang_device = language_model.get_input_embeddings().weight.device

    convo = [{"role": "system", "content": SYSTEM_PROMPT},
             {"role": "user", "content": prompt}]
    convo_string = tokenizer.apply_chat_template(convo, tokenize=False, add_generation_prompt=True)
    convo_tokens = tokenizer.encode(convo_string, add_special_tokens=False, truncation=False)
    # Expand image tokens manually into image_seq_length copies.
    input_tokens = []
    for t in convo_tokens:
        input_tokens.extend([image_token_id] * image_seq_length if t == image_token_id else [t])

    captions: dict[str, str] = {}
    errors: dict[str, str] = {}

    def _fail(i, path, e):
        errors[path] = str(e)
        print(json.dumps({"i": i, "path": path, "error": str(e)}), flush=True, file=_OUT)
        _log(f"[joycaption] {i}/{len(images)} ERROR: {e}")

    def _pixels(path):
        # Keep the exact bounded snapshot returned by the guard: opening
        # ``path`` again would race a live Bank-folder replacement.
        payload = read_validated_bank_image(path)
        with Image.open(io.BytesIO(payload)) as opened:
            image = opened.resize((384, 384), Image.LANCZOS) \
                if opened.size != (384, 384) else opened.copy()
            image = image.convert("RGB")
            pixel_values = TVF.pil_to_tensor(image).unsqueeze(0).to(vision_device)
            pixel_values = pixel_values / 255.0
            return TVF.normalize(pixel_values, [0.5], [0.5]).to(vision_dtype)

    def _caption(ready):
        """Caption [(i, path, pixels)] in one generate(). Every row shares the same
        prompt and image-token count, so the batch needs no padding."""
        nonlocal batch_size
        try:
            n = len(ready)
            input_ids = torch.tensor([input_tokens] * n, dtype=torch.long, device=lang_device)
            attn = torch.ones_like(input_ids)
            with torch.inference_mode():
                gen = model.generate(input_ids=input_ids,
                                     pixel_values=torch.cat([px for _, _, px in ready]),
                                     attention_mask=attn, max_new_tokens=max_tokens,
                                     do_sample=True, temperature=0.6, top_p=0.9,
                                     suppress_tokens=None, use_cache=True)
        except Exception as e:  # One failed image must not break the batch.
            if len(ready) == 1:
                _fail(ready[0][0], ready[0][1], e)
                return
            # Split and retry: isolates a bad image, and an out-of-memory batch
            # also lowers the batch size for the rest of the run.
            if _is_oom(torch, e):
                try:
                    torch.cuda.empty_cache()
                except Exception:  # noqa: BLE001
                    pass
                batch_size = max(1, len(ready) // 2)
            _log(f"[joycaption] batch of {len(ready)} failed ({e}); retrying in halves")
            half = len(ready) // 2
            _caption(ready[:half])
            _caption(ready[half:])
            return
        for (i, path, _px), row in zip(ready, gen):
            trimmed = _trim(row.tolist(), eoh_id, eot_id)
            caption = tokenizer.decode(trimmed, skip_special_tokens=True,
                                       clean_up_tokenization_spaces=False).strip()
            captions[path] = caption
            # Emit each caption as its OWN stdout JSON line the instant its batch lands,
            # then the stderr progress marker. The caller streams stdout, so if it kills us
            # mid-run for a graceful Stop, every caption printed so far is already kept (a
            # single end-of-run dump would lose them all). Flush so the pipe delivers it
            # before the next — possibly long — generate() call.
            print(json.dumps({"i": i, "path": path, "caption": caption}), flush=True, file=_OUT)
            _log(f"[joycaption] {i}/{len(images)} ok ({len(caption)} chars)")

    numbered = list(enumerate(images, 1))
    pos = 0
    while pos < len(numbered):
        chunk = numbered[pos:pos + batch_size]
        pos += len(chunk)
        ready = []
        for i, path in chunk:
            try:
                ready.append((i, path, _pixels(path)))
            except Exception as e:  # noqa: BLE001 - reported per image
                _fail(i, path, e)
        if ready:
            _caption(ready)

    # Final aggregate line (backward-compatible with any caller that reads only the last
    # {…}); the streamed per-image lines above are the authoritative source now.
    print(json.dumps({"captions": captions, "errors": errors}), flush=True, file=_OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
