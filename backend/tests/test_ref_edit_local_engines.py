"""Reference editing on the LOCAL engines — the only lane this fork has.

Upstream shipped reference editing as an API-only gesture (Nano Banana / ChatGPT
/ OpenRouter) and excluded Klein and Krea 2 Edit for a reason that had expired:
the edit used to be a BLOCKING provider call, and a local engine has no blocking
call to make. It now rides the ComfyUI queue every other local render already
waits on, so the exclusion outlived its own rationale.

This fork removed the paid lane entirely (Divergence 1), so the local lane is not
an addition here — it IS the feature. These tests pin two things:

  * the derived list stays local-only, so a future sync cannot reintroduce a paid
    edit lane by widening `editable_engines()`; and
  * the queue round trip (enqueue -> completion callback -> candidate) behaves,
    including the cancel paths that upstream could only implement for local jobs.
"""
import contextlib
import io
import os

import pytest
from PIL import Image

from app.services import face_dataset_service as svc
from app.services import reference_edit_jobs as rej
from app.services import dataset_activity


def _png():
    b = io.BytesIO()
    Image.new('RGB', (256, 256), (120, 40, 40)).save(b, 'PNG')
    return b.getvalue()


def _webp(color, size=(300, 300)):
    b = io.BytesIO()
    Image.new('RGB', size, color).save(b, 'WEBP')
    return b.getvalue()


@pytest.fixture(autouse=True)
def _clean_registry():
    rej.reset()
    dataset_activity.reset()
    yield
    rej.reset()
    dataset_activity.reset()


def _create_with_ref(client, monkeypatch, name, trig):
    import app.routes.datasets as dr
    monkeypatch.setattr(dr, 'gpu_exclusive_vision_window', lambda: contextlib.nullcontext())
    monkeypatch.setattr(dr.svc, 'face_crop_to_square_webp', lambda raw, **k: (_webp((1, 2, 3)), True))
    did = client.post('/api/dataset/create',
                      json={'name': name, 'trigger_word': trig}).get_json()['id']
    client.post(f'/api/dataset/{did}/ref',
                data={'file': (io.BytesIO(_png()), 'r.png')},
                content_type='multipart/form-data')
    return did


def _stub_krea(monkeypatch, calls, job_id='krea-job-1'):
    """A Krea install that is ready and whose enqueue records its arguments."""
    from app.services import krea_edit_helper as keh
    monkeypatch.setattr(keh, 'preflight', lambda: None)

    def _enqueue(**kw):
        calls.append(kw)
        return job_id
    monkeypatch.setattr(keh, 'enqueue_krea_edit', _enqueue)


def _stub_klein(monkeypatch, calls, job_id='klein-job-1'):
    from app.services import klein_edit_helper as keh

    def _enqueue(**kw):
        calls.append(kw)
        return job_id
    monkeypatch.setattr(keh, 'enqueue_klein_edit', _enqueue)


# --- the list ---------------------------------------------------------------

def test_both_local_engines_can_edit_the_reference():
    """THE red assertion. Krea 2 Edit (and Klein) were simply not in the set the
    route accepts, so the modal could not offer them however it was written."""
    editable = svc.editable_engines()
    assert 'krea' in editable
    assert 'klein' in editable


def test_the_edit_lane_is_local_only_and_stays_that_way():
    """Divergence 1, pinned where it can actually be violated.

    `editable_engines()` is upstream's expression verbatim — LOCAL + API — and it
    answers correctly here only because API_ENGINES is the empty tuple. That is
    deliberate (Divergence 1b: an empty export makes every derived helper correct
    by construction), but it means a sync that ever refilled API_ENGINES would
    silently hand this fork a paid edit lane with no other code change. Assert the
    OUTCOME, not the expression."""
    assert svc.API_ENGINES == ()
    assert svc.editable_engines() == tuple(svc.LOCAL_ENGINES)
    for tag in svc.LEGACY_API_ENGINE_TAGS:
        assert tag not in svc.editable_engines(), tag


def test_the_refusal_names_every_editable_engine():
    msg = svc.edit_engine_choice_message()
    labels = svc.engine_labels()
    for engine in svc.editable_engines():
        assert labels[engine] in msg, engine
    # ...and never an engine this fork does not ship.
    for tag in svc.LEGACY_API_ENGINE_TAGS:
        assert tag not in msg.lower(), tag


def test_a_legacy_cloud_tag_is_refused_rather_than_run(client, monkeypatch):
    """A stored 'nanobanana'/'chatgpt' preference reaching /ref/edit must come back
    as a 400 naming the real engines, never be dispatched to a Klein loader as if
    the tag were a model."""
    did = _create_with_ref(client, monkeypatch, 'Cam', 'zchar_cam')
    resp = client.post(f'/api/dataset/{did}/ref/edit',
                       data={'prompt': 'add glasses', 'engine': 'chatgpt'},
                       content_type='multipart/form-data')
    assert resp.status_code == 400
    assert 'Klein' in resp.get_json()['error']
    assert client.get(f'/api/dataset/{did}').get_json()['reference_edit'] is None


# --- starting an edit -------------------------------------------------------

def test_krea_edit_enqueues_a_comfy_job_instead_of_blocking(client, monkeypatch):
    """The green half: the route answers 202 at once, a queue job is enqueued with
    the reference and the raw prompt, and the modal's registry entry is 'running'
    and knows which job it waits on."""
    did = _create_with_ref(client, monkeypatch, 'Kay', 'zchar_kay')
    calls = []
    _stub_krea(monkeypatch, calls)

    resp = client.post(f'/api/dataset/{did}/ref/edit',
                       data={'prompt': 'plain studio-grey background', 'engine': 'krea'},
                       content_type='multipart/form-data')

    assert resp.status_code == 202
    assert len(calls) == 1
    assert calls[0]['edit_prompt'] == 'plain studio-grey background'
    assert calls[0]['extra_metadata']['is_reference_edit'] is True
    entry = client.get(f'/api/dataset/{did}').get_json()['reference_edit']
    assert entry['status'] == 'running' and entry['engine'] == 'krea'
    # The callback must be able to find its way back to this edit.
    assert rej.find_by_job('krea-job-1')['dataset_id'] == did


def test_klein_edit_forwards_the_datasets_extra_references(client, monkeypatch):
    """Klein chains extra refs as native ReferenceLatent nodes, so the dataset's
    own anchors DO travel — the identity lock, by path rather than by bytes."""
    did = _create_with_ref(client, monkeypatch, 'Lex', 'zchar_lex')
    client.post(f'/api/dataset/{did}/ref/extra',
                data={'file': (io.BytesIO(_png()), 'x.png')},
                content_type='multipart/form-data')
    calls = []
    _stub_klein(monkeypatch, calls)

    resp = client.post(f'/api/dataset/{did}/ref/edit',
                       data={'prompt': 'warmer lighting', 'engine': 'klein'},
                       content_type='multipart/form-data')

    assert resp.status_code == 202
    assert len(calls) == 1
    assert len(calls[0]['extra_ref_paths']) == 1
    assert os.path.basename(calls[0]['extra_ref_paths'][0]).endswith('.webp')


def test_krea_edits_the_primary_reference_only(client, monkeypatch):
    """The other half of LOCAL_EDIT_REF_SUPPORT: Krea's patch takes ONE source, so
    the dataset's extras must NOT be smuggled in — the UI says 'main reference
    only' at pick time and the enqueue has to match that promise."""
    did = _create_with_ref(client, monkeypatch, 'Val', 'zchar_val')
    client.post(f'/api/dataset/{did}/ref/extra',
                data={'file': (io.BytesIO(_png()), 'x.png')},
                content_type='multipart/form-data')
    calls = []
    _stub_krea(monkeypatch, calls)

    client.post(f'/api/dataset/{did}/ref/edit',
                data={'prompt': 'add glasses', 'engine': 'krea'},
                content_type='multipart/form-data')

    assert len(calls) == 1
    assert 'extra_ref_paths' not in calls[0]
    assert svc.LOCAL_EDIT_REF_SUPPORT['krea'] == 'primary_only'


def test_an_engine_refuses_the_modals_transient_references(client, monkeypatch):
    """Both local graphs take file PATHS; a client's uploads are request-scoped
    bytes. Refused with the engine named — a silent drop would return an edit that
    ignored half of what the user handed it. (This fork's modal has no picker at
    all, so reaching here means a client that didn't know.)"""
    did = _create_with_ref(client, monkeypatch, 'Mo', 'zchar_mo')
    calls = []
    _stub_krea(monkeypatch, calls)

    resp = client.post(f'/api/dataset/{did}/ref/edit',
                       data={'prompt': 'add glasses', 'engine': 'krea',
                             'ref': (io.BytesIO(_png()), 'anchor.png')},
                       content_type='multipart/form-data')

    assert resp.status_code == 400
    assert 'Krea 2 Edit' in resp.get_json()['error']
    assert not calls                                   # nothing queued
    assert client.get(f'/api/dataset/{did}').get_json()['reference_edit'] is None


def test_an_unavailable_engine_is_explained_and_leaves_no_phantom_job(
        client, monkeypatch):
    """ComfyUI is there but Krea's weights/nodes are not: the click comes back with
    the SAME actionable 409 the generate path returns, immediately — not a spinner
    that ends in a raw ComfyUI error. And nothing is left 'running'."""
    did = _create_with_ref(client, monkeypatch, 'Nia', 'zchar_nia')
    from app.services import krea_edit_helper as keh

    def _boom():
        raise keh.KreaModelsMissing(['krea_model'])
    monkeypatch.setattr(keh, 'preflight', _boom)

    resp = client.post(f'/api/dataset/{did}/ref/edit',
                       data={'prompt': 'add glasses', 'engine': 'krea'},
                       content_type='multipart/form-data')

    assert resp.status_code == 409
    assert resp.get_json()['error']                    # actionable, not empty
    assert client.get(f'/api/dataset/{did}').get_json()['reference_edit'] is None
    assert dataset_activity.get(did) is None           # no ✦ badge left lit


def test_an_empty_prompt_is_refused_before_anything_is_queued(client, monkeypatch):
    did = _create_with_ref(client, monkeypatch, 'Uma', 'zchar_uma')
    calls = []
    _stub_krea(monkeypatch, calls)

    resp = client.post(f'/api/dataset/{did}/ref/edit',
                       data={'prompt': '   ', 'engine': 'krea'},
                       content_type='multipart/form-data')

    assert resp.status_code == 400
    assert not calls
    assert client.get(f'/api/dataset/{did}').get_json()['reference_edit'] is None


# --- landing ----------------------------------------------------------------

def test_the_queue_callback_fills_the_candidate_the_modal_polls(client, monkeypatch):
    """The whole point of reusing the queue: the completion callback produces the
    'ready' + candidate_filename shape the client polls for."""
    did = _create_with_ref(client, monkeypatch, 'Ora', 'zchar_ora')
    calls = []
    _stub_krea(monkeypatch, calls)
    client.post(f'/api/dataset/{did}/ref/edit',
                data={'prompt': 'x', 'engine': 'krea'},
                content_type='multipart/form-data')
    # The render "landed": bytes come back through the /view fallback, so the test
    # needs no ComfyUI output folder at all.
    monkeypatch.setattr(svc, '_read_comfy_output', lambda fn: _webp((7, 7, 7)))
    monkeypatch.setattr(svc, '_drop_comfy_output', lambda fn: None)

    svc.link_completed_reference_edit('krea-job-1', 'out_00001_.png', failed=False)

    entry = client.get(f'/api/dataset/{did}').get_json()['reference_edit']
    assert entry['status'] == 'ready' and entry['candidate_filename']
    assert os.path.exists(os.path.join(svc._dataset_dir(did), entry['candidate_filename']))
    # Activity closed AFTER the candidate is ready — the poll's final refresh must
    # already see it, or the modal stays on the spinner forever.
    assert dataset_activity.get(did) is None


def test_a_failed_render_says_which_engine_failed_and_why(client, monkeypatch):
    did = _create_with_ref(client, monkeypatch, 'Pia', 'zchar_pia')
    calls = []
    _stub_krea(monkeypatch, calls)
    client.post(f'/api/dataset/{did}/ref/edit',
                data={'prompt': 'x', 'engine': 'krea'},
                content_type='multipart/form-data')

    svc.link_completed_reference_edit('krea-job-1', None, failed=True,
                                      reason='KSampler: out of memory')

    entry = client.get(f'/api/dataset/{did}').get_json()['reference_edit']
    assert entry['status'] == 'failed'
    assert 'krea' in entry['error'] and 'out of memory' in entry['error']
    assert dataset_activity.get(did) is None


def test_keeping_a_candidate_promotes_it_to_be_the_reference(client, monkeypatch):
    """Keep is the only destructive step, and it must leave the dataset on a REAL
    reference: new files written and verified before the old ones are unlinked."""
    did = _create_with_ref(client, monkeypatch, 'Wren', 'zchar_wren')
    calls = []
    _stub_krea(monkeypatch, calls)
    client.post(f'/api/dataset/{did}/ref/edit',
                data={'prompt': 'x', 'engine': 'krea'},
                content_type='multipart/form-data')
    monkeypatch.setattr(svc, '_read_comfy_output', lambda fn: _webp((9, 9, 9)))
    monkeypatch.setattr(svc, '_drop_comfy_output', lambda fn: None)
    svc.link_completed_reference_edit('krea-job-1', 'out_00001_.png', failed=False)
    before = client.get(f'/api/dataset/{did}').get_json()['ref_filename']

    resp = client.post(f'/api/dataset/{did}/ref/edit/keep')

    assert resp.status_code == 200
    after = client.get(f'/api/dataset/{did}').get_json()
    assert after['ref_filename'] != before
    assert os.path.exists(os.path.join(svc._dataset_dir(did), after['ref_filename']))
    # The pending edit is consumed, not left for a second Keep.
    assert after['reference_edit'] is None


def test_keep_without_a_ready_candidate_is_a_409_not_a_crash(client, monkeypatch):
    did = _create_with_ref(client, monkeypatch, 'Yan', 'zchar_yan')
    assert client.post(f'/api/dataset/{did}/ref/edit/keep').status_code == 409


def test_discarding_a_running_edit_cancels_the_render(client, monkeypatch):
    """An edit on our own GPU CAN be cancelled, and leaving it running would hold
    the GPU for a result nobody will ever see."""
    did = _create_with_ref(client, monkeypatch, 'Rae', 'zchar_rae')
    calls = []
    _stub_krea(monkeypatch, calls)
    client.post(f'/api/dataset/{did}/ref/edit',
                data={'prompt': 'x', 'engine': 'krea'},
                content_type='multipart/form-data')
    cancelled = []
    from app import job_queue
    monkeypatch.setattr(job_queue.queue_manager, 'cancel_job',
                        lambda jid, **kw: cancelled.append(jid) or True)

    assert client.post(f'/api/dataset/{did}/ref/edit/discard').status_code == 200

    assert cancelled == ['krea-job-1']
    assert client.get(f'/api/dataset/{did}').get_json()['reference_edit'] is None
    assert dataset_activity.get(did) is None


def test_switching_engine_cancels_the_render_it_supersedes(client, monkeypatch):
    """Supersede. Starting a Klein edit over a running Krea one must not drop the
    registry entry and leave the GPU rendering a result whose callback would find
    nothing — with the activity badge lit until the TTL.

    Upstream tests this ACROSS lanes (a paid engine superseding a local render);
    with one lane there is only the same-lane case, and it is the one that can
    actually strand a job here."""
    did = _create_with_ref(client, monkeypatch, 'Sam', 'zchar_sam')
    krea_calls, klein_calls = [], []
    _stub_krea(monkeypatch, krea_calls)
    _stub_klein(monkeypatch, klein_calls)
    client.post(f'/api/dataset/{did}/ref/edit',
                data={'prompt': 'x', 'engine': 'krea'},
                content_type='multipart/form-data')
    cancelled = []
    from app import job_queue
    monkeypatch.setattr(job_queue.queue_manager, 'cancel_job',
                        lambda jid, **kw: cancelled.append(jid) or True)

    client.post(f'/api/dataset/{did}/ref/edit',
                data={'prompt': 'y', 'engine': 'klein'},
                content_type='multipart/form-data')

    assert cancelled == ['krea-job-1']
    entry = client.get(f'/api/dataset/{did}').get_json()['reference_edit']
    assert entry['engine'] == 'klein' and entry['status'] == 'running'
    # The superseded job's callback must no longer find a home.
    assert rej.find_by_job('krea-job-1') is None


def test_a_landing_nobody_awaits_deletes_its_output(client, monkeypatch):
    """Discarded/superseded while ComfyUI rendered: the finished file is removed
    rather than left in the output folder for the user to wonder about."""
    dropped = []
    monkeypatch.setattr(svc, '_drop_comfy_output', lambda fn: dropped.append(fn))
    svc.link_completed_reference_edit('nobody-waits', 'out_00002_.png', failed=False)
    assert dropped == ['out_00002_.png']


def test_cropping_the_reference_invalidates_a_pending_edit(client, monkeypatch):
    """A Before/After computed from the OLD reference would be a visual lie, so a
    crop drops the candidate. This hook lives in crop_reference/recrop_reference_auto
    and was absent from this fork while the feature was removed."""
    did = _create_with_ref(client, monkeypatch, 'Zoe', 'zchar_zoe')
    calls = []
    _stub_krea(monkeypatch, calls)
    client.post(f'/api/dataset/{did}/ref/edit',
                data={'prompt': 'x', 'engine': 'krea'},
                content_type='multipart/form-data')
    monkeypatch.setattr(svc, '_read_comfy_output', lambda fn: _webp((3, 3, 3)))
    monkeypatch.setattr(svc, '_drop_comfy_output', lambda fn: None)
    svc.link_completed_reference_edit('krea-job-1', 'out_00001_.png', failed=False)
    assert client.get(f'/api/dataset/{did}').get_json()['reference_edit']

    from app import job_queue
    monkeypatch.setattr(job_queue.queue_manager, 'cancel_job', lambda jid, **kw: True)
    client.post(f'/api/dataset/{did}/ref/crop', json={'x': 0, 'y': 0, 'w': 100, 'h': 100})

    assert client.get(f'/api/dataset/{did}').get_json()['reference_edit'] is None
