"""Publish a dataset to the Hugging Face Hub as a `dataset` repo — EXPORT only.

Reuses the training-export SHAPE (kept images + a same-stem `.txt` caption with
the trigger word prepended, via `face_dataset_service._export_caption`) but with
three deliberate differences from the ZIP export:

  * each public image is a fresh, metadata-free **PNG staging copy**. This keeps
    camera EXIF/XMP/GPS out of the Hub while leaving the local master untouched;
  * the **real reference photo** (`_000_ref`) is included ONLY when `include_ref`
    is set (default OFF) — it's the source face of a possibly real person;
  * a **`metadata.jsonl`** (`{"file_name", "text"}` per image) and a
    **`README.md`** dataset card are generated so the repo is readable by the HF
    Dataset Viewer and `load_dataset("imagefolder")`.

Publishing was removed from this install. NOTHING secret is ever written into
the repo, and every line of the README passes through `redact_user_paths` so no
local `C:\\Users\\<name>\\…` path can leak. The HF token is the app's existing
`HF_TOKEN` secret (same one cloud training / model downloads read).

The long part is the upload of potentially hundreds of files: `start_publish`
runs the whole flow in a daemon thread (mirroring `setup_installer`) and
`publish_status` reports {state, repo_url, error, error_code} for the UI to poll.
`publish_to_hf` itself is fully synchronous and the single seam the tests drive
(HfApi mocked — no real network).
"""
import re
import threading


from ..config import LOCAL_USER
from ..utils.redact import redact_user_paths

# Licence choices offered in the modal — the usual dataset licences plus a
# catch-all. Validated server-side (never trust the client's dropdown).
LICENSE_CHOICES = ('cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0', 'openrail', 'other')

_FAMILY_LABEL = {'zimage': 'Z-Image', 'krea': 'Krea 2', 'sdxl': 'SDXL',
                 'flux': 'FLUX.1', 'flux2klein': 'FLUX.2 Klein'}
_KIND_LABEL = {'concept': 'concept', 'style': 'style'}   # else -> 'character'

GITHUB_REPO = 'perfectgf/lora-dataset-studio'
GITHUB_URL = f'https://github.com/{GITHUB_REPO}'

READ_ONLY_MSG = ('your Hugging Face token is read-only — create a write token at '
                 'https://huggingface.co/settings/tokens')


class HfPublishError(Exception):
    """A structured, user-facing failure. `code` lets the UI branch (notably on
    `read_only_token`, the most likely first-use failure); `message` is the human
    line shown as-is."""
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


# --- naming ------------------------------------------------------------------

def _slug(s) -> str:
    """A repo-name-safe slug: keep alphanumerics/._-, collapse the rest to a
    single dash, lowercase. Empty -> 'dataset'."""
    s = re.sub(r'[^A-Za-z0-9._-]+', '-', (s or '').strip())
    s = re.sub(r'-{2,}', '-', s).strip('-._').lower()
    return s or 'dataset'


def default_repo_id(username, ds) -> str:
    """`<username>/<slug-of-dataset-name>` — the modal's pre-filled default."""
    stem = _slug(ds.name) if ds is not None else 'dataset'
    return f'{username}/{stem}' if username else stem


# --- huggingface_hub seam ----------------------------------------------------

def _make_api(token):
    raise HfPublishError('offline', 'Publishing was removed from this install.')


def _http_status(e):
    """Best-effort HTTP status code out of a huggingface_hub error (its
    HfHubHTTPError carries `.response.status_code`); falls back to scraping a
    3-digit 4xx/5xx out of the message. None when nothing looks like a status."""
    resp = getattr(e, 'response', None)
    code = getattr(resp, 'status_code', None)
    if isinstance(code, int):
        return code
    m = re.search(r'\b([45]\d\d)\b', str(e))
    return int(m.group(1)) if m else None


def hf_namespace(token):
    """The token owner's username (for the default repo id), or None if the token
    is missing/invalid/unreachable. Never raises — the modal degrades to a free
    text field with a placeholder."""
    return None


# --- write-scope preflight ---------------------------------------------------

def _require_write_scope(api):
    """This install does not ask Hugging Face who a token is."""
    raise HfPublishError('offline', 'Publishing was removed from this install.')


# --- dataset folder build ----------------------------------------------------

def _target_family(ds) -> str:
    return (getattr(ds, 'train_type', None) or 'zimage').lower()


def _kind_label(ds) -> str:
    return _KIND_LABEL.get((getattr(ds, 'kind', None) or '').lower(), 'character')


def build_readme(ds, count, license, nfaa) -> str:
    """YAML front-matter (license / task_categories / tags) + a dataset card
    derived from the ⎘ Share-config pattern (kind, target family, image count,
    trigger, 'built with LoRA Dataset Studio' + repo link). Fully redacted."""
    fam = _FAMILY_LABEL.get(_target_family(ds), _target_family(ds))
    kind = _kind_label(ds)
    trigger = ds.trigger_word or ''
    tags = ['lora-dataset-studio']
    if nfaa:
        tags.append('not-for-all-audiences')

    fm = ['---', f'license: {license}', 'task_categories:', '- text-to-image', 'tags:']
    fm += [f'- {t}' for t in tags]
    fm += ['size_categories:', '- n<1K', '---', '']

    trig_line = (f'| Trigger word | `{trigger}` |' if trigger
                 else '| Trigger word | _(none — style dataset)_ |')
    body = [
        f'# {ds.name}',
        '',
        f'A LoRA training dataset built with '
        f'**[LoRA Dataset Studio]({GITHUB_URL})**.',
        '',
        '| | |',
        '|---|---|',
        f'| Dataset type | {kind} |',
        f'| Target model family | {fam} |',
        trig_line,
        f'| Images | {count} |',
        '',
        '## Contents',
        '',
        'Each image ships with a matching `.txt` caption (the trigger word is '
        'prepended), and a `metadata.jsonl` maps every image to its caption, so '
        'the dataset loads straight into the 🤗 Datasets library:',
        '',
        '```python',
        'from datasets import load_dataset',
        'ds = load_dataset("imagefolder", data_dir=".", split="train")',
        '```',
        '',
    ]
    if trigger:
        body += [f'Put the trigger word **`{trigger}`** in your prompts to summon '
                 'this concept once the LoRA is trained.', '']
    body += [
        '---',
        '',
        f'Exported automatically with [LoRA Dataset Studio]({GITHUB_URL}) — an '
        'open-source tool for building character / style / concept LoRA datasets. '
        'The uploader is responsible for the rights to these images and for the '
        'consent of any identifiable person shown.',
        '',
    ]
    return redact_user_paths('\n'.join(fm + body))


# --- the synchronous publish flow (the tested seam) --------------------------

def publish_to_hf(dataset_id, repo_id, private, nfaa, license, include_ref, token,
                  user_id=LOCAL_USER, _api=None):
    """This install does not upload a dataset repository."""
    raise HfPublishError('offline', 'Publishing was removed from this install.')


# --- background job (route seam; upload can exceed a request's window) --------
# The upload of a full dataset (dozens–hundreds of webp + txt, tens of MB) over a
# home uplink routinely runs past 30 s — too long for a synchronous request. So
# the route launches a daemon thread (same shape as setup_installer) and the UI
# polls `publish_status`. The DB reads happen inside the passed app's context.

_lock = threading.Lock()
_jobs = {}   # dataset_id -> {state, repo_url, repo_id, error, error_code, count}


def _job_snapshot(dataset_id):
    j = _jobs.get(dataset_id)
    if not j:
        return {'state': 'idle'}
    return dict(j)


def publish_status(dataset_id):
    with _lock:
        return _job_snapshot(dataset_id)


def start_publish(app, dataset_id, repo_id, private, nfaa, license, include_ref,
                  token, user_id=LOCAL_USER):
    """Launch the publish in the background. Returns the initial status; a second
    call while one is running is a no-op (`already=True`)."""
    raise HfPublishError('offline', 'Publishing was removed from this install.')
    with _lock:
        cur = _jobs.get(dataset_id)
        if cur and cur.get('state') == 'running':
            return {**cur, 'already': True}
        _jobs[dataset_id] = {'state': 'running', 'repo_url': None, 'repo_id': repo_id,
                             'error': None, 'error_code': None, 'count': None}
    threading.Thread(
        target=_run_publish_job,
        args=(app, dataset_id, repo_id, private, nfaa, license, include_ref, token, user_id),
        daemon=True).start()
    return {'state': 'running'}


def _run_publish_job(app, dataset_id, repo_id, private, nfaa, license, include_ref,
                     token, user_id):
    try:
        with app.app_context():
            res = publish_to_hf(dataset_id, repo_id, private, nfaa, license,
                                include_ref, token, user_id=user_id)
        result = {'state': 'done', 'repo_url': res['repo_url'], 'repo_id': res['repo_id'],
                  'error': None, 'error_code': None, 'count': res['count']}
    except HfPublishError as e:
        result = {'state': 'error', 'repo_url': None, 'repo_id': repo_id,
                  'error': e.message, 'error_code': e.code, 'count': None}
    except Exception as e:   # never let a background thread die silently
        result = {'state': 'error', 'repo_url': None, 'repo_id': repo_id,
                  'error': f'unexpected error: {e}', 'error_code': 'unknown', 'count': None}
    with _lock:
        _jobs[dataset_id] = result
