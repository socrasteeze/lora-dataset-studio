# Local pass benchmarks

Measured on 2026-10-19 with synthetic fixtures only. Score has a clear throughput
gain. Face-mask startup is shorter. CPU inpainting and localization regress.
The other completed comparisons do not establish a throughput gain.

## Comparison

- Before: `26ca2c1162e5f7e5eff80073db91d0b7cca49827`, immediately before pass tuning.
- After: `8352960b06949a4cd2f104d9df9cff9f2c5932d0`.
- Hardware: Core i7-13700KF, 24 logical CPUs, 128 GiB RAM, RTX 5090 with 32 GiB VRAM.
- Unchanged models, weights, precision, input order and thresholds in each pair.
- Separate archived workers, configured interpreters, isolated state and new
  analysis caches. Existing model files were reused. Nothing was downloaded.
- Each condition received an untimed warm-up. Timed order was before, after,
  after, before. Values below are medians of two runs per condition.
- Total time includes interpreter startup, imports, model loading, preprocessing,
  inference, cache writes, grouping and result serialization. It excludes the
  application's inventory and database publication.
- Resource samples cover each worker and its children. GPU readings cover the
  whole device, including the desktop. They are not model-only allocations.

## Completed comparisons

| Worker path | Images | Device | Before | After | Finding |
| --- | ---: | --- | ---: | ---: | --- |
| Score: CLIP, aesthetic, NSFW and style groups | 512 | CUDA | 26.237 s | 14.688 s | 44.0% less elapsed time; 1.79x throughput |
| Face/angle detection | 16 | CUDA | 3.375 s | 3.298 s | No clear gain; ranges overlap |
| WD14 tags | 32 | CUDA | 3.370 s | 3.436 s | No gain established |
| Watermark ranking | 16 | CPU | 6.582 s | 6.736 s | No gain established |
| Face-mask startup and detection | 16 | CPU | 3.779 s | 2.978 s | 21.2% less total time; no faces detected |
| LaMa inpainting | 8 | CPU | 18.854 s | 27.607 s | Regression: 46.4% more elapsed time |
| Quality core: metrics, provenance, hash and thumbnail | 128 | CPU | 3.331 s | 3.382 s | No gain established |
| Semantic dedup grouping core | 2048 vectors | CPU | 0.042 s | 0.041 s | No gain established |
| Identity startup and detection | 16 | CPU | 3.489 s | 3.490 s | No gain established; no usable faces |
| SigLIP2 semantic index | 32 | CPU | 9.510 s | 9.519 s | No gain established |
| Watermark ranking and localization, untiled | 1 | CPU | 12.766 s | 14.820 s | Regression: 16.1% more elapsed time |

The main fixtures are deterministic drawings with shapes, a stylized person and
occasional invented text. JPEG sizes are 1536x1024, 1024x1536, 2048x1536 and
1536x2048. This workload cannot establish
real-image accuracy or predict every bank's processing time.

### Score

All 512 images received CLIP embeddings, aesthetic scores and NSFW scores in
every timed run. There were no missing heads or image errors. The current worker
used CUDA batch 8, eight preparation workers, one Torch thread and a four-thread
native-library limit. The original environment had no native-thread overrides.
Both use CLIP ViT-L/14 with the OpenAI weights, the existing LAION aesthetic head
and `Marqo/nsfw-image-detection-384`.

The interval between the first and last completed-image progress messages fell
from 17.376 s to 5.886 s. This is a processing span, not an isolated kernel timer;
the first completion represents one image before and one batch after. Startup
and model loading account for much of the remaining total time.

Median sampled worker CPU time fell from 280.141 to 39.844 CPU-seconds. Peak
whole-device VRAM remained around 5.3 to 5.4 GiB. A small VRAM change does not
imply that the speed improvement is absent.

Output comparison across all timed runs found:

- Identical style-group membership and successful-result counts.
- Maximum aesthetic difference of 0.001, one unit at its stored precision.
- Maximum NSFW difference of 0.0001, one unit at its stored precision.
- Minimum embedding cosine of 0.99999999993; maximum component difference
  of 0.00000334. Batched CUDA results are numerically close, not bit-identical.

A separate unchanged-input cache-resume run reused all 512 entries and computed
zero new embeddings: 0.529 s before and 0.528 s after. These single-run resume
measurements establish reuse, not a speed gain.

### Other completed paths

Face/angle detection used the CUDA provider, but all fixtures returned
`no_face`. Outputs matched. Recognition, similarity and 3D pose inference were
not exercised, so there is no full face/angle speed claim.

WD14 produced identical tags, ratings and errors across the four timed runs.
Its existing eight-image batches were retained. These small batches do not
establish a throughput improvement from the ONNX thread changes.

Watermark ranking returned identical scores and clean-image decisions. None
crossed the 0.60 threshold. Localization was enabled but never invoked; the
worker's locator-available summary does not prove that DINO ran. Mean sampled
CPU use fell from 5.86 to 1.87 cores while total time stayed similar.

The face-mask worker returned identical `no_face` records. Its processing span
was similar, 1.241 s before and 1.225 s after; most of its total saving precedes
the first result. These fixtures do not establish mask-generation throughput.

LaMa processed eight 768x768 PNG copies with the same normalized rectangle in
each image. All output pixels matched. The four-thread environment reduces CPU
use but makes this CPU workload slower. A pass-specific CPU budget needs further
measurement before changing the implementation.

The Quality core used the actual scan worker with eight threads, new thumbnail
files and all existing metrics and byte checks. Outputs and encoded thumbnails
matched. The grouping-core workload used 2048 vectors made by repeating the
512 measured CLIP vectors. It retained the 0.98 threshold, one comparison block,
normalization, pair limits and union-find grouping. Groups matched. Both source
functions are unchanged between revisions. These are core-stage timings, not
complete inventory/database jobs.

Identity returned identical `no_usable_face` records. Its recognition and pose
heads were not exercised. SigLIP2 computed all 32 embeddings in every accepted
run, with zero failures or cache reuse. Its minimum embedding cosine was
0.999999999999, with a maximum component difference of 0.000000238. Median CPU
time fell from 68.773 to 21.172 CPU-seconds while elapsed time stayed similar.
The configured SigLIP2, watermark and LaMa
interpreters have CPU-only Torch builds; Score uses its separate CUDA build.

The localization workload uses a separate 576x384 synthetic PNG with a large
invented text mark. A 0.05 ranking threshold sends it through DINO on both
revisions. This threshold belongs to the benchmark only. Both geometry and
validation prompts run with the normal box thresholds and consensus/rescue
rules. The small frame selects the normal one-window plan. All accepted runs
loaded the locator, completed with zero window failures and returned identical
results. This is an untiled workload, not a large-image tile-sweep comparison.
An exploratory original-code run on the larger 14-window fixture took 112.406 s;
there is no paired after result for that case.

## Interrupted or incomplete work

Another ComfyUI workload started during later measurements. Face-mask and
identity runs that overlapped it are excluded. The affected LaMa baseline,
face-mask series, identity baseline and interrupted SigLIP2 trials were repeated
with the queue idle. Only complete, uncontested runs enter the comparison.

The benchmark now checks the external queue during CPU runs and stops its own
worker if competing work appears. An idle cached model may remain resident for
CPU measurements. The other application's jobs, cached models, settings and
source data are preserved.

VLM captioning, OCR, person masking and external upscale/generation have no new
paired timing here. Person masking's prepared U2Net weights were absent at the
inspected default location;
no installation or download was attempted.

Large-bank checkpoint I/O has not been separately quantified. The small face,
semantic and watermark workloads must not be used to claim a whole-bank cache
write benefit.

Raw logs, archived workers, the synthetic-input manifest, resource samples and
the local harness remain in ignored Git storage under
`pass-benchmarks-20261019-1`. No real source images or production image records
were used or changed. Application settings were unchanged. No full test suite
or cloud workflow was run for this work.
