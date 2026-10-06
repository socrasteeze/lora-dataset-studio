# Offline Workflows

This fork runs its dataset, generation, captioning and training workflows on
local tools. API targets must be on localhost, a private LAN or the operator's
tailnet. A public API address is refused before user data is sent.

## Included Plugins

The curated build includes Camera Angles, Canvas, DLSS 5, Image Upscale, Live,
Model Tools, Qwen Dataset, Resource Monitor, SeedVR2 and Video. Their local
operations remain available. `fork-plugins.json` owns this list.

Hugging Face publishing, web scraping, Civitai browsing and the Civitai
publisher are excluded. API image generators and GPU rentals are excluded.
Distribution overrides cannot load a plugin in the excluded list, and an
archive outside the ten bundled plugins is refused. Online image and video
imports and in-app update checks return a refusal without contacting a service.
Saving a cloud-training token is refused before any account check. The server
does not load a repository `.env` through Flask on startup.

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
records are retained. Excluding a plugin does not delete its data. A Hugging
Face or Civitai token can still support an operator-started Setup download.
It cannot enable publishing, browsing, scraping or a rental.

Regression coverage is in `backend/tests/test_offline_workflows.py` and
`backend/tests/test_fork_outbound_gate.py`. The current product description
is [FORK_NOTES.md](../FORK_NOTES.md), Divergences 1, 4 and 12.
