# Offline Workflows

This fork runs its dataset, generation, captioning and training workflows on
local tools. API targets must be on localhost, a private LAN or the operator's
tailnet. A public API address is refused before user data is sent.

## Included Plugins

The curated build includes Camera Angles, Canvas, DLSS 5, Image Upscale, Live,
Model Tools, Qwen Dataset, Resource Monitor, SeedVR2 and Video. Their local
operations remain available. `fork-plugins.json` owns this list.

Hugging Face publishing and web scraping are excluded. API image generators,
GPU rentals and the Civitai publisher remain excluded. Distribution overrides
cannot load a plugin in the excluded list. Civitai browsing, online image/video
imports and in-app online updates return a refusal without contacting a service.

## Preparation

Setup may download packages, node packs and model weights only after an
operator starts the action. This retains the existing preparation workflow.
For a machine with no internet access, prepare the files elsewhere and copy
the packages and model weights through the documented local installation paths.

Provide model weights locally before starting inference or training. Runtime
workers use the local Hugging Face cache and reject public socket connections.
Missing weights produce an error; a pass must not silently fetch them. Training
also disables Hugging Face telemetry and online experiment logging.

This is an application policy. It does not sandbox arbitrary external plugin
code or control network calls made independently by local tools. Prepare those
tools and their model files before running an offline workflow.

## Saved Data and Validation

Existing datasets, banks, prompts, credentials and historical publication/link
records are retained. Excluding a plugin does not delete its data. Credentials
can still support operator-started model downloads; they cannot enable online
runtime features.

Regression coverage is in `backend/tests/test_offline_workflows.py`. Tests and
rendered checks are deferred under the current instruction. Lint and compilation
are source checks. User-authorized startup confirmed health and all ten local
plugins on API 1.24. It did not qualify inference, training or network behavior.
The backend and its matching curated frontend bundle were activated together.
