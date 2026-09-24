"""🎬 Video datasets API — the flat folders the trainers actually read.

A video dataset is a directory of `clip_0001.mp4` files with homonym `clip_0001.txt`
captions, and nothing else. No subfolder is ever created under it: ai-toolkit's
dataset scan is `os.walk` — recursive — and excludes only dotfiles and a directory
literally named `_controls`, so anything we wrote there for our own convenience
would be trained on without a word.

This blueprint also serves the TARGET CATALOGUE, because the frontend must not
hard-code it. Two of its fields are the difference between a good week and a
wasted one: `training_verified` (we know the model's geometry, but no trainer for
it is known to exist) and `licence_note` (MiniMax H3's licence grants no rights at
all in the EU, the UK, South Korea or the USA, and the restriction reaches the
OUTPUTS — a user must not discover that in a forum thread after building a set).
"""
import logging
import mimetypes

from flask import Blueprint, current_app, jsonify, request, send_file

from lds_sdk.video_host.config import LOCAL_USER
from lds_video import video_bank_service as svc
from lds_video import neural_render_media as nr
from lds_video import video_targets
from lds_sdk.video_host.http import map_error as _map_error
from lds_sdk.video_host.http import require_comfyui as _require_comfyui
from lds_sdk.video_host.http import require_no_stalled_comfyui as _require_no_stalled_comfyui
from lds_sdk.video_host.http import studio_missing_response as _studio_missing_response
from lds_video import video_dataset_import as intake
from lds_sdk.video_host import bank_jobs

logger = logging.getLogger(__name__)

bp = Blueprint('video_datasets', __name__, url_prefix='/api')


def _missing(dataset_id):
    return jsonify({'error': f'video dataset {dataset_id} not found'}), 404


@bp.get('/video/targets')
def video_targets_list():
    """The target catalogue, rendered for a picker. GET {'targets': [...]}.

    `default_seconds` is computed here rather than left to the client: "81 frames"
    means nothing to someone choosing clips out of a rush, and the intervals
    arithmetic ((frames-1)/fps, because N frames span N-1 intervals) is exactly the
    off-by-one that decides how much source a cut needs."""
    out = []
    for key in video_targets.PROFILE_KEYS:
        profile = video_targets.get(key)
        default_frames = profile['frame_default']
        out.append({
            'key': key,
            'label': profile['label'],
            'fps': profile['fps'],
            'frame_choices': list(profile['frame_choices']),
            'frame_default': default_frames,
            'default_seconds': (video_targets.clip_seconds(key, default_frames)
                                if default_frames else None),
            'size_multiple': profile['size_multiple'],
            'recommended_sizes': [list(s) for s in profile['recommended_sizes']],
            # Sizes WE verified survive the trainer's re-bucketing unchanged —
            # a separate field on purpose; recommended_sizes stays the model's
            # own claim (resolution_note quotes it back to the user as such).
            'exact_sizes': [list(s) for s in profile.get('exact_sizes', ())],
            'picker_hint': profile.get('picker_hint'),
            # Kept as a plain boolean because the picker only ever asks
            # "does this target want sound?"; `audio` carries the format
            # the exporter has to impose (32 kHz stereo for MiniMax H3).
            'keep_audio': profile['audio'] is not None,
            'audio': profile['audio'],
            'aitk_arch': profile['aitk_arch'],
            'max_pixels': profile['max_pixels'],
            'caption_style': profile['caption_style'],
            # Two vocabularies that must not be conflated: the app can know a
            # model's geometry perfectly and still have no way to train it.
            'training_verified': profile['training_verified'],
            'licence_note': profile['licence_note'],
        })
    return jsonify({'targets': out})


@bp.get('/video-datasets')
def video_datasets_list():
    """Every built video training set. GET {'datasets': [...]}"""
    return jsonify({'datasets': svc.list_video_datasets(LOCAL_USER)})


@bp.post('/video-datasets')
def video_dataset_create():
    data = request.get_json(silent=True) or {}
    try:
        out = intake.create(LOCAL_USER, name=data.get('name'),
            target_profile=data.get('target_profile'), frames=data.get('frames'),
            size=data.get('size'), trigger_word=data.get('trigger_word'))
    except (TypeError, ValueError) as exc:
        return jsonify({'error': str(exc)}), 400
    return jsonify({'ok': True, **out}), 201


@bp.post('/video-dataset/<int:dataset_id>/import')
@bp.post('/video-dataset/<int:dataset_id>/scrape-import')
def video_dataset_import(dataset_id):
    data = request.get_json(silent=True) or {}
    uploads = request.files.getlist('files') if request.mimetype == 'multipart/form-data' else None
    try:
        out = intake.start(current_app._get_current_object(), LOCAL_USER, dataset_id,
            files=uploads, items=data.get('items'),
            slice_long=(request.form.get('slice_long') == 'true' if uploads is not None
                        else data.get('slice_long') is True))
    except bank_jobs.BankJobBusy:
        return jsonify({'error': 'An import is already running for this dataset.'}), 409
    except (TypeError, ValueError, RuntimeError) as exc:
        return jsonify({'error': str(exc)}), 404 if 'not found' in str(exc) else 400
    return jsonify(out), 202


@bp.post('/video-dataset/<int:dataset_id>/import/cancel')
def video_dataset_import_cancel(dataset_id):
    if svc.get_video_dataset(LOCAL_USER, dataset_id) is None:
        return _missing(dataset_id)
    return jsonify({'ok': bank_jobs.cancel(intake.job_key(dataset_id))})


@bp.post('/video-datasets/from-dataset')
def video_dataset_from_face_dataset():
    """Build an H3 STILLS set from an existing image dataset — body
    {dataset_id, name?}. Reuses the image lane's own exporter (curated images,
    edited captions, trigger — all already there), so the two lanes cannot
    disagree about what a caption or a trigger means."""
    data = request.get_json(silent=True) or {}
    try:
        out = svc.create_stills_dataset_from_face_dataset(
            LOCAL_USER, int(data.get('dataset_id') or 0), name=data.get('name'))
    except (TypeError, ValueError) as e:
        msg = str(e) or 'dataset_id must be a number'
        return jsonify({'error': msg}), 404 if 'not found' in msg else 400
    return jsonify({'ok': True, **out}), 201


@bp.get('/video-dataset/<int:dataset_id>')
def video_dataset_get(dataset_id):
    """The dataset and its clips, each carrying the source file and the bounds it
    was cut at — so a later re-export to another target is a re-encode from the
    original rather than a re-scan from scratch."""
    payload = svc.video_dataset_payload(LOCAL_USER, dataset_id)
    if payload is None:
        return _missing(dataset_id)
    return jsonify(payload)


@bp.get('/video-dataset/<int:dataset_id>/train/previews')
def video_dataset_previews(dataset_id):
    from lds_video import video_checkpoint_previews as previews
    try:
        return jsonify(previews.list_previews(LOCAL_USER, dataset_id))
    except LookupError:
        return _missing(dataset_id)


@bp.post('/video-dataset/<int:dataset_id>/train/previews')
def video_dataset_render_previews(dataset_id):
    from lds_video import video_checkpoint_previews as previews
    from lds_sdk.video_host.studio import StudioAssetsMissing
    blocked = _require_comfyui() or _require_no_stalled_comfyui()
    if blocked:
        return blocked
    try:
        payload = previews.start_previews(LOCAL_USER, dataset_id, request.get_json(silent=True))
    except previews.PreviewSelectionError as exc:
        return jsonify({'ok': False, 'error': str(exc), 'queued': [], 'failures': exc.failures}), 400
    except StudioAssetsMissing as exc:
        return _studio_missing_response(exc)
    except LookupError:
        return _missing(dataset_id)
    except (ValueError, TypeError, RuntimeError, OSError) as exc:
        return _map_error(ValueError(previews._safe_error(exc)))
    return jsonify(payload)


@bp.get('/video-dataset/<int:dataset_id>/best-settings')
def video_dataset_best_settings(dataset_id):
    from lds_video import video_best_settings as best
    try:
        ds = best.get_dataset(LOCAL_USER, dataset_id)
    except LookupError:
        return _missing(dataset_id)
    return jsonify({'best_settings': best.read_best(ds),
                    'best_settings_loras': best.best_settings_loras(ds)})


@bp.delete('/video-dataset/<int:dataset_id>/best-settings')
def video_dataset_remove_best_settings(dataset_id):
    from lds_video import video_best_settings as best
    try:
        best.remove_best(LOCAL_USER, dataset_id)
    except LookupError:
        return _missing(dataset_id)
    return jsonify({'ok': True})


@bp.get('/video-dataset/<int:dataset_id>/clip/<int:clip_id>/media')
def video_dataset_clip_media(dataset_id, clip_id):
    """One promoted clip's bytes. A dataset you cannot re-watch is a list of
    filenames, and watching a cut IS how you find out the length was wrong before
    paying for a training run.

    ``conditional=True`` for the same reason as the bank's source route (Range),
    though these files are a few megabytes rather than a rush.

    Cached for a DAY, not a year, and the difference is not caution: SQLite reuses
    rowids after a delete unless the column is AUTOINCREMENT, so
    /video-dataset/7/clip/12/media can legitimately become a different clip. A day
    covers a working session without pinning a stale clip to that URL forever."""
    path = svc.dataset_clip_media_path(LOCAL_USER, dataset_id, clip_id)
    if path is None:
        return jsonify({'error': 'clip file not available'}), 404
    # A stills set serves images through the same route; the extension decides.
    guessed = mimetypes.guess_type(path)[0] or 'video/mp4'
    return send_file(path, mimetype=guessed, conditional=True, max_age=86400)


@bp.post('/video-dataset/<int:dataset_id>/clip/<int:clip_id>/caption')
def video_dataset_caption(dataset_id, clip_id):
    """Body {caption}. Writes the row AND rewrites the .txt sidecar.

    The disk write is the feature, not the bookkeeping: the trainer never reads
    our database, it reads the file next to the .mp4. A caption saved to one and
    not the other trains the dataset on the previous text while the interface
    shows the new one, with nothing anywhere to reveal it.

    An empty caption empties the file; it never deletes it. A MISSING sidecar
    crashes musubi-tuner (FileNotFoundError out of a worker future, no handler on
    the path) and makes diffusion-pipe drop the clip in silence."""
    data = request.get_json(silent=True) or {}
    out = svc.set_dataset_clip_caption(LOCAL_USER, dataset_id, clip_id,
                                       data.get('caption'))
    if out is None:
        return _missing(dataset_id)
    return jsonify(out)


@bp.post('/video-dataset/<int:dataset_id>/clips/remove')
def video_dataset_remove_clips(dataset_id):
    """Body {ids: [...]}. Drop clips out of a built set — the encode, not the triage.

    A POST rather than a DELETE, and not for taste: this deletes a LIST, and a
    request body on DELETE is unspecified enough that Werkzeug, the dev proxy and
    the browser's own fetch have each been observed dropping it. The verb that
    carries a body reliably is the one used here.

    The bank keeps every shot and every decision — the source clips are merely
    un-promoted, so what was removed can be promoted again without triaging
    anything. That promise is the reason this is a safe button, so it is stated
    both here and in the confirmation the user reads.

    Answers {removed, clips, files_missing, files_kept, delete_mode}.
    ``files_kept`` is the one nobody expects and the one that matters: a clip
    whose .mp4 is held open (an antivirus scan, a player, a training run reading
    this very folder) keeps its row and stays in the set, because the folder IS
    the dataset and a row deleted without its file removes the clip from the app
    while leaving it in the training run. The caller must not report a plain
    success when it is non-zero. ``delete_mode`` names where the files went, in
    the vocabulary of services.trash, so the toast can say it through the
    app-wide wording rather than a sentence of its own.

    A 500 here means the commit failed — and the files are back in the folder
    (the service restores them from the trash before re-raising), so "could not
    remove" is true of the disk as well as of the database.
    """
    data = request.get_json(silent=True) or {}
    ids = data.get('ids')
    if not isinstance(ids, list):
        return jsonify({'error': 'ids must be a list of clip ids'}), 400
    # The kept originals of the doomed clips are read BEFORE the rows go: a
    # backup whose clip left can never be restored and would only accumulate.
    doomed = svc.dataset_clip_filenames(LOCAL_USER, dataset_id, ids)
    out = svc.remove_dataset_clips(LOCAL_USER, dataset_id, ids)
    if out is None:
        return _missing(dataset_id)
    if out.get('removed'):
        nr.forget_backups(dataset_id, doomed)
    return jsonify({'ok': True, **out})


@bp.post('/video-dataset/<int:dataset_id>/references')
def video_dataset_references(dataset_id):
    """Attach 1-4 identity reference images (multipart field `files`). Replaces
    the previous set whole. 400 names every refusal; the target that needs
    them is the only one that accepts them."""
    files = request.files.getlist('files')
    images = [(f.filename, f.read()) for f in files if f and f.filename]
    try:
        out = svc.set_dataset_references(LOCAL_USER, dataset_id, images)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if out is None:
        return _missing(dataset_id)
    return jsonify({'ok': True, **out})


@bp.delete('/video-dataset/<int:dataset_id>')
def video_dataset_delete(dataset_id):
    """Throw away a badly cut dataset — the ENCODE, never the triage.

    The bank's clips survive untouched; they only stop claiming to have been
    promoted, so the user can re-cut at a different length without re-triaging."""
    try:
        with bank_jobs.mutation_lease(intake.job_key(dataset_id), 'delete'):
            if not svc.delete_video_dataset(LOCAL_USER, dataset_id):
                return _missing(dataset_id)
            nr.forget_backups(dataset_id)      # the kept originals go with the set
    except bank_jobs.BankJobBusy:
        return jsonify({'error': 'Stop the video import before deleting this dataset.'}), 409
    return jsonify({'ok': True})


@bp.post('/video-dataset/<int:dataset_id>/train')
def video_dataset_train_local(dataset_id):
    """Train a LoRA on this video dataset with the ai-toolkit installed here.

    Its own endpoint, and not the face lane's `/dataset/<id>/train`, for the same
    reason the cloud one is separate: that route's id means a `face_dataset`, and
    the two tables share one integer space.

    Three refusals get their own status because the UI has to say three different
    things: an uncatalogued or unsupported target is a 400 (a choice the user can
    change), no ai-toolkit and a card already taken are 409s (the request is fine,
    the machine is not), and absent weights are a 409 carrying the repository and
    the size so the panel can ask for a yes instead of just saying no."""
    from lds_video import video_training
    from lds_video import video_training_local as vtl
    from lds_sdk.video_host.gpu import GpuBusyError
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(vtl.start_video_training(
            LOCAL_USER, dataset_id,
            steps=body.get('steps') or 1000,
            base_model=(body.get('base_model') or '').strip() or None,
            low_vram=bool(body.get('low_vram', True)),
            rank=body.get('rank', 16),
            sample_prompts=body.get('sample_prompts'),
            do_i2v=bool(body.get('do_i2v', False)),
            accept_download=bool(body.get('accept_download', False))))
    except vtl.VideoWeightsMissing as e:
        return jsonify({'error': str(e), 'needs_download': True,
                        'repo': e.repo, 'gigabytes': e.gigabytes,
                        # None when the drive could not be measured. The panel
                        # must render that as silence, not as zero and not as
                        # room — the two read as opposite answers.
                        'free_gigabytes': e.free_gigabytes}), 409
    except video_training.VideoTrainingUnsupported as e:
        return jsonify({'error': str(e)}), 400
    except GpuBusyError as e:
        return jsonify({'error': str(e)}), 409
    except ValueError as e:
        if 'not found' in str(e):
            return _missing(dataset_id)
        # 'a training is already in progress' is a state refusal, not a malformed
        # request — the same 409 the face lane's launch route returns for it.
        if 'in progress' in str(e):
            return jsonify({'error': str(e)}), 409
        return jsonify({'error': str(e)}), 400
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 409


@bp.get('/video-dataset/<int:dataset_id>/train/progress')
def video_dataset_train_progress(dataset_id):
    """The local run's live progress, for the card to poll.

    Reports `active` only for a run whose fence names THIS dataset AND the video
    table — a face training of the colliding id must not drive this bar."""
    from lds_video import video_training_local as vtl
    try:
        progress = vtl.video_training_progress(dataset_id, LOCAL_USER)
    except ValueError:
        return _missing(dataset_id)
    progress['checkpoints'] = vtl.list_run_checkpoints(dataset_id, LOCAL_USER)
    return jsonify(progress)


@bp.post('/video-dataset/<int:dataset_id>/train/stop')
def video_dataset_train_stop(dataset_id):
    """Stop the local run of THIS video dataset.

    Names the table alongside the id, which is what stops this button from
    killing the face dataset of the same number. `ok: false` is the honest answer
    when the fence names another run — the click was refused, not silently
    ignored."""
    from lds_sdk.video_host import run_dataset as crd
    from lds_sdk import video_training_runtime as lt
    stopped = lt.stop_training(expected_dataset_id=dataset_id,
                               expected_dataset_table=crd.VIDEO)
    return jsonify({'ok': bool(stopped)})


# DIVERGENCE 4 — upstream continues here with the rented-pod video lane:
# POST /train/cloud, GET /train/cloud/progress, GET /train/cloud/checkpoints,
# GET /train/cloud/checkpoint, POST /train/cloud/retry, POST /train/cloud/continue,
# DELETE /train/cloud/run/<id> (2026-08-31: the 🗑 that clears one finished run),
# GET /train/cloud/offers (2026-09-03: the live price/h tier list the launch
# window shows) and GET /train/cloud/run/<id> (2026-09-03: the ⓘ details card,
# which reports GPU and price), plus their `_video_run` / `_relaunch` helpers.
# This fork trains video LOCALLY only, so none of it is carried and
# `cloud_video_training` is not a module here.
# The local lane above (/train, /train/progress, /train/stop) is the whole
# surface. `cloud_run_dataset` IS kept and used above: despite the name it is the
# face_dataset/video_dataset table disambiguator, not part of the rental lane.
# The Checkpoints & LoRAs section below arrived in the SAME upstream commit as
# the two 2026-09-03 rejections (779aee6): its ⬇ / 📦 / ⏏ / 🗑 verbs read the
# local run's own saves and are kept, resolved per hunk rather than per file.

@bp.get('/video-dataset/<int:dataset_id>/train/preflight')
def video_dataset_train_preflight(dataset_id):
    """Report local training prerequisites; refuse unsupported rental lanes."""
    from lds_video import video_training_local as vtl
    try:
        report = vtl.training_preflight(LOCAL_USER, dataset_id,
                                        lane=request.args.get('lane') or 'local')
    except ValueError as e:
        if 'not found' in str(e):
            return _missing(dataset_id)
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True, **report})


# ── Checkpoints & LoRAs — the workspace section, both lanes, per STEP ──────
# The verbs the image workspace's Checkpoints section has, for a video set.
# `run_id` null on a body means the LOCAL run; a number means one of this
# dataset's cloud runs, resolved by the (id, table) pair like every run route.

def _checkpoint_verb(call):
    """deploy / undeploy / delete answer alike: a dataset, run or step that is
    not there is a 404 (LookupError), a refusal the user can act on — no loras
    folder, a hand-placed LoRA — a 400 (ValueError), and a lane still writing
    the files a 409 (RuntimeError)."""
    try:
        return jsonify({'ok': True, **call()})
    except LookupError as e:
        return jsonify({'error': str(e)}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 409


@bp.get('/video-dataset/<int:dataset_id>/train/checkpoints')
def video_dataset_checkpoints(dataset_id):
    """Both lanes' saves of this dataset grouped by STEP, each file with its
    deployed state — everything the Checkpoints & LoRAs section renders."""
    from lds_video import video_checkpoints as vck
    try:
        return jsonify(vck.list_checkpoints(LOCAL_USER, dataset_id))
    except LookupError:
        return _missing(dataset_id)


@bp.post('/video-dataset/<int:dataset_id>/train/checkpoint/deploy')
def video_dataset_checkpoint_deploy(dataset_id):
    """📦 Every file of one step into ComfyUI's loras folder, through the Video
    Test Studio's own copy — one folder, one naming, for both surfaces."""
    from lds_video import video_checkpoints as vck
    body = request.get_json(silent=True) or {}
    return _checkpoint_verb(lambda: vck.deploy_step(
        LOCAL_USER, dataset_id, body.get('run_id'), body.get('step'),
        bool(body.get('final'))))


@bp.post('/video-dataset/<int:dataset_id>/train/checkpoint/undeploy')
def video_dataset_checkpoint_undeploy(dataset_id):
    """⏏ Move one deployed copy out of ComfyUI (to the trash). The training
    save stays; only a copy the app deployed itself is accepted."""
    from lds_video import video_checkpoints as vck
    body = request.get_json(silent=True) or {}
    return _checkpoint_verb(lambda: vck.undeploy(
        LOCAL_USER, dataset_id, body.get('deployed_as', '')))


@bp.post('/video-dataset/<int:dataset_id>/train/checkpoint/delete')
def video_dataset_checkpoint_delete(dataset_id):
    """🗑 Every file of one step to the trash — all of a Wan pair, never half.
    409 while the lane is still writing them (local training running, cloud
    run on its pod)."""
    from lds_video import video_checkpoints as vck
    body = request.get_json(silent=True) or {}
    return _checkpoint_verb(lambda: vck.delete_step(
        LOCAL_USER, dataset_id, body.get('run_id'), body.get('step'),
        bool(body.get('final'))))


@bp.get('/video-dataset/<int:dataset_id>/train/checkpoint')
def video_dataset_local_checkpoint(dataset_id):
    """Download ONE save of this dataset's LOCAL run — the cloud route's twin
    (`/train/cloud/checkpoint`), resolved through the folder's own listing so
    the request names a file and never a path."""
    from flask import abort
    from lds_video import video_checkpoints as vck
    try:
        path = vck.local_checkpoint_path(LOCAL_USER, dataset_id,
                                         request.args.get('filename'))
    except LookupError:
        path = None
    if not path:
        abort(404)
    return send_file(path, as_attachment=True)




# Neural-render routes (/video-dataset/.../neural-render, clip original/comparison) live on the dlss5 plugin (lds_dlss5.video_routes). Kept out of this blueprint so factory(PRODUCTS) cannot register the same URL+method twice.

@bp.get('/video-dataset/<int:dataset_id>/train/lineage')
def video_dataset_lineage(dataset_id):
    """The local video run in the shape the image workspace's graph draws."""
    from lds_video import video_lineage
    try:
        return jsonify(video_lineage.tree(LOCAL_USER, dataset_id))
    except LookupError:
        return _missing(dataset_id)


def _sample_lane(dataset_id):
    """Resolve the local sample lane; numbered cloud runs are not carried."""
    from lds_video import video_checkpoints as vck
    from lds_video import video_lineage
    ds = vck._dataset(LOCAL_USER, dataset_id)
    return ds, video_lineage.resolve_run(ds, request.args.get('run_id'))


@bp.get('/video-dataset/<int:dataset_id>/train/samples')
def video_dataset_samples(dataset_id):
    """The training samples ai-toolkit rendered for one lane of this dataset,
    newest step first, with a URL per sample and per poster."""
    from lds_video import video_lineage
    try:
        ds, run = _sample_lane(dataset_id)
    except LookupError as e:
        return jsonify({'error': str(e)}), 404
    out = []
    for s in video_lineage.list_samples(ds, run):
        out.append({**s, **video_lineage._sample_urls(ds, run, s)})
    return jsonify({'run_id': run.id if run else None, 'samples': out})


@bp.get('/video-dataset/<int:dataset_id>/train/sample')
def video_dataset_sample(dataset_id):
    """ONE sample clip (or image), resolved by name through the lane's own
    listing. Conditional so a player can seek."""
    from flask import abort
    from lds_video import video_lineage
    try:
        ds, run = _sample_lane(dataset_id)
    except LookupError:
        abort(404)
    path = video_lineage.sample_path(ds, run, request.args.get('filename'))
    if not path:
        abort(404)
    return send_file(path, mimetype=mimetypes.guess_type(path)[0] or 'application/octet-stream',
                     conditional=True)


@bp.get('/video-dataset/<int:dataset_id>/train/sample/poster')
def video_dataset_sample_poster(dataset_id):
    """A still of one sample — the image itself, or the clip's first frame cut
    once and cached. 404 when the frame cannot be cut: a pill without a
    thumbnail, never a broken image."""
    from flask import abort
    from lds_video import video_lineage
    try:
        ds, run = _sample_lane(dataset_id)
    except LookupError:
        abort(404)
    path = video_lineage.poster_path(ds, run, request.args.get('filename'))
    if not path:
        abort(404)
    return send_file(path, mimetype=mimetypes.guess_type(path)[0] or 'image/jpeg',
                     conditional=True)
