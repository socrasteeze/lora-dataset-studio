"""The Klein model used by ✨ Upscale & improve is a CHOICE, and it is the dataset's.

Reported by the maintainer: "I have no option anywhere to choose the Klein model
used for improve and upgrade". Both halves were true. `improve_existing_image`
took no model parameter, so `enqueue_klein_edit` always received `klein_model=None`
and fell back to whatever `resolve_klein_unet(None)` happened to find — while the
GENERATION lane had had a picker for months, whose value was persisted per BROWSER
(`editPage_flux2KleinModel_v1`) even though it describes what the dataset contains.

What this file pins:

* the stored choice reaches `enqueue_klein_edit` on all THREE improve lanes
  (single, re-improve, batch) — a choice honoured by one of them would be worse
  than no choice at all;
* a dataset that never chose still resolves EXACTLY the model it resolved before
  (the anti-regression that makes this migration a no-op);
* a stored model that has since left the disk is refused BY NAME instead of being
  silently swapped for another one — the old `resolve_klein_unet(selected)`
  fallback chain did the swap without a word;
* every on-disk layout the resolver accepts is also OFFERED by the picker, layout
  by layout (the list is imported from test_klein_model_locations_documented so
  the two can never drift apart).
"""
import io
from app.extensions import db
import os
import struct
import subprocess

import pytest
from PIL import Image

from test_klein_model_locations_documented import DOCUMENTED_LAYOUTS, KLEIN_FILE

pytestmark = pytest.mark.plugins()

_VALID_ST = struct.pack('<Q', 2) + b'{}'
OTHER_FILE = 'flux-2-klein-32b-heavy.safetensors'


def _png():
    buf = io.BytesIO()
    Image.new('RGB', (96, 64), (25, 50, 75)).save(buf, 'PNG')
    return buf.getvalue()


def _dataset_with_source(svc, image_cls, user_id, filename='source.png'):
    ds = svc.create_dataset(user_id, 'Improve model', 'improvemodel')
    os.makedirs(svc._dataset_dir(ds.id), exist_ok=True)
    with open(os.path.join(svc._dataset_dir(ds.id), filename), 'wb') as fh:
        fh.write(_png())
    image = image_cls(dataset_id=ds.id, filename=filename, source='import',
                      status='keep', framing='body', caption='a caption',
                      variation_label='Imported', variation_prompt='p')
    svc.db.session.add(image)
    svc.db.session.commit()
    return ds, image


@pytest.fixture()
def lanes(app, monkeypatch):
    """The three improve lanes, each returning the kwargs enqueue_klein_edit saw."""
    from app.config import LOCAL_USER
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc
    from app.services import klein_edit_helper as keh

    queued = []
    monkeypatch.setattr(keh, 'klein_missing_assets', lambda: [])
    monkeypatch.setattr(keh, 'klein_missing_nodes', lambda: [])
    monkeypatch.setattr(svc, '_sync_generate_activity', lambda *a, **k: None)
    counter = {'n': 0}

    def _enqueue(**kwargs):
        queued.append(kwargs)
        counter['n'] += 1
        return f'job-{counter["n"]}'

    monkeypatch.setattr(keh, 'enqueue_klein_edit', _enqueue)

    class Lanes:
        calls = queued

        @staticmethod
        def single(stored=None):
            ds, src = _dataset_with_source(svc, FaceDatasetImage, LOCAL_USER)
            if stored is not None:
                svc.set_dataset_klein_model(LOCAL_USER, ds.id, stored)
            svc.improve_existing_image(LOCAL_USER, src.id)
            return ds, src

        @staticmethod
        def reimprove(stored=None):
            ds, src = _dataset_with_source(svc, FaceDatasetImage, LOCAL_USER)
            if stored is not None:
                svc.set_dataset_klein_model(LOCAL_USER, ds.id, stored)
            res = svc.improve_existing_image(LOCAL_USER, src.id)
            candidate = db.session.get(FaceDatasetImage, res['candidate_id'])
            # A re-improve only runs on a FINISHED candidate.
            candidate.filename = 'improved.png'
            with open(os.path.join(svc._dataset_dir(ds.id), 'improved.png'), 'wb') as fh:
                fh.write(_png())
            candidate.status = 'keep'
            svc.db.session.commit()
            queued.clear()
            svc.reimprove_image(LOCAL_USER, candidate.id)
            return ds, candidate

        @staticmethod
        def batch(stored=None):
            ds, src = _dataset_with_source(svc, FaceDatasetImage, LOCAL_USER)
            if stored is not None:
                svc.set_dataset_klein_model(LOCAL_USER, ds.id, stored)
            svc.start_bulk_improve(app, LOCAL_USER, ds.id, [src.id])
            return ds, src

    with app.app_context():
        yield Lanes


# --- 1. The choice reaches the queue, on all three lanes ---------------------
@pytest.mark.plugins('image_upscale')
@pytest.mark.parametrize('lane', ['single', 'reimprove', 'batch'])
def test_the_stored_choice_reaches_enqueue_on_every_lane(lanes, lane):
    getattr(lanes, lane)(stored=OTHER_FILE)
    assert lanes.calls, f'{lane} enqueued nothing'
    assert lanes.calls[-1].get('klein_model') == OTHER_FILE, lane


# --- 2. Anti-regression: a dataset that never chose is untouched -------------
@pytest.mark.plugins('image_upscale')
@pytest.mark.parametrize('lane', ['single', 'reimprove', 'batch'])
def test_a_dataset_that_never_chose_keeps_todays_model(lanes, lane):
    """`klein_model=None` is what every improve sent before this feature existed,
    and it is what makes resolve_klein_unet pick the canonical download. Anything
    else here means the migration changed the output of an untouched install."""
    getattr(lanes, lane)()
    assert lanes.calls[-1].get('klein_model') is None, lane


# --- 3. A model that left the disk is refused BY NAME -----------------------
def test_a_vanished_model_is_refused_by_name_not_swapped(app, tmp_path):
    """The old chain resolved an unknown pick to the canonical file and ran the
    job on it. A user who chose a 32B model and got a 9B result had no way to
    know: the tile looks fine, it is just not what was asked for."""
    from app import config as cfg
    from app.services import klein_edit_helper as keh
    with app.app_context():
        base = tmp_path / 'ComfyUI'
        (base / 'models' / 'unet' / 'klein').mkdir(parents=True)
        (base / 'input').mkdir(parents=True, exist_ok=True)
        (base / 'main.py').write_text('# fake', encoding='utf-8')
        (base / 'models' / 'unet' / 'klein' / KLEIN_FILE).write_bytes(_VALID_ST)
        cfg.save_config({'comfyui': {'base_dir': str(base)}})

        # The present file still resolves, prefix and all.
        assert keh.klein_model_on_disk(KLEIN_FILE) == os.path.join('klein', KLEIN_FILE)
        # The absent one resolves to NOTHING — never to the neighbour.
        assert keh.klein_model_on_disk(OTHER_FILE) is None

        src = tmp_path / 'src.png'
        src.write_bytes(_png())
        with pytest.raises(keh.KleinModelGone) as exc:
            keh.enqueue_klein_edit(user_id='local', source_filename='src.png',
                                   source_path=str(src), edit_prompt='improve',
                                   klein_model=OTHER_FILE)
        assert OTHER_FILE in str(exc.value)
        assert exc.value.name == OTHER_FILE


def test_missing_absolute_pin_does_not_resolve_by_basename(client, tmp_path, monkeypatch):
    from app import capabilities, config as cfg
    from app.services import klein_edit_helper as keh

    base = tmp_path / 'ComfyUI'
    folder = base / 'models' / 'diffusion_models' / 'flux'
    folder.mkdir(parents=True)
    (folder / KLEIN_FILE).write_bytes(_VALID_ST)
    pin = str(tmp_path / 'old' / KLEIN_FILE)
    cfg.save_config({'comfyui': {'base_dir': str(base)}, 'klein': {'unet': pin}})
    offered = keh.klein_unet_choices()
    monkeypatch.setattr(capabilities, 'probe', lambda: {'comfyui': {'models': {'klein': offered}}})

    assert keh.klein_model_on_disk(KLEIN_FILE) == os.path.join('flux', KLEIN_FILE)
    assert keh.klein_model_on_disk(pin) is None
    assert keh.klein_override_status()['unet']['status'] == 'missing'
    state = client.get('/api/klein-model').get_json()
    assert state['missing'] == state['stored'] == pin
    assert state['resolved'] is None
    with pytest.raises(keh.KleinModelGone) as exc:
        keh.unet_for_job()
    assert exc.value.name == pin
    assert cfg.get('klein.unet') == pin


# --- 4. The offered list is as WIDE as the resolver -------------------------
# Offering fewer places than the resolver accepts is the same bug seen from the
# other end: the app would refuse to let you pick a model it can happily load.
@pytest.mark.parametrize('label,parts,expected', DOCUMENTED_LAYOUTS,
                         ids=[c[0] for c in DOCUMENTED_LAYOUTS])
def test_every_resolvable_layout_is_also_offerable(app, tmp_path, label, parts, expected):
    from app import capabilities, config as cfg
    from app.services import comfy_model_paths as cmp
    from app.services import klein_edit_helper as keh
    cmp.clear_cache()
    with app.app_context():
        base = tmp_path / 'ComfyUI'
        for sub in ('input', 'output', 'models'):
            (base / sub).mkdir(parents=True, exist_ok=True)
        (base / 'main.py').write_text('# fake', encoding='utf-8')
        target = base.joinpath('models', *parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(_VALID_ST)
        cfg.save_config({'comfyui': {'base_dir': str(base)}})
        offered = capabilities._scan_models()['klein']
        # Offered under the resolver's own relative name (the probe delegates
        # to the resolvers' scan since the fifth scanner folded)…
        assert expected in offered, label
        # …and picking exactly what was offered lands on exactly what the
        # resolver would have chosen by itself. A bare name still resolves too
        # (the deep-search wave's own tests pin that).
        assert keh.klein_model_on_disk(expected) == expected, label
        assert keh.klein_model_on_disk(KLEIN_FILE) == expected, label
        assert keh.resolve_klein_unet() == expected, label
    cmp.clear_cache()


def test_flux_weights_in_extra_paths_resolve_an_absolute_pin_through_a_link(
    app, client, tmp_path, monkeypatch,
):
    from app import capabilities, config as cfg
    from app.services import face_dataset_service as svc, klein_edit_helper as keh

    base = tmp_path / 'ComfyUI'
    registered = tmp_path / 'registered'
    flux = registered / 'diffusion_models' / 'flux'
    flux.mkdir(parents=True)
    base.mkdir()
    (base / 'extra_model_paths.yaml').write_text(
        'shared:\n  base_path: ../registered\n  diffusion_models: diffusion_models\n',
        encoding='utf-8',
    )
    pinned = 'flux-2-klein-9b.safetensors'
    kv = 'flux-2-klein-9b-kv-fp8.safetensors'
    unrelated = 'other-flux.safetensors'
    for name in (pinned, kv, unrelated):
        (flux / name).write_bytes(_VALID_ST)
    link = tmp_path / 'linked'
    if os.name == 'nt':
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(flux)],
                       check=True, capture_output=True)
    else:
        link.symlink_to(flux, target_is_directory=True)
    try:
        path = str(link / pinned)
        cfg.save_config({'comfyui': {'base_dir': str(base)}, 'klein': {'unet': path}})
        expected = os.path.join('flux', pinned)
        kv_ref = os.path.join('flux', kv)
        assert keh.klein_model_on_disk(path) == expected
        assert keh.klein_model_on_disk(kv) == kv_ref
        assert keh.resolve_klein_unet() == expected
        assert keh.klein_override_status()['unet']['status'] == 'ok'
        assert keh.unet_for_job() == expected
        offered = capabilities._scan_models()['klein']
        assert expected in offered and kv_ref in offered
        assert os.path.join('flux', unrelated) not in offered
        monkeypatch.setattr(capabilities, 'probe', lambda: {'comfyui': {'models': {'klein': offered}}})
        state = client.get('/api/klein-model').get_json()
        assert state['stored'] == path
        assert state['missing'] is None
        assert state['effective'] == pinned
        assert cfg.get('klein.unet') == path
        with app.app_context():
            dataset_id = svc.create_dataset('local', 'Model sample', 'model-sample').id
        response = client.post(f'/api/dataset/{dataset_id}/klein-model', json={'klein_model': kv_ref})
        assert response.status_code == 200
        assert response.get_json()['resolved'] == kv_ref
        assert cfg.get('klein.unet') == kv_ref
        assert keh.unet_for_job() == kv_ref
        assert keh.klein_model_on_disk(os.path.join('absent', kv)) is None
    finally:
        if os.name == 'nt':
            link.rmdir()
        else:
            link.unlink()


# --- 5. Storing the choice -------------------------------------------------
def test_the_choice_is_stored_on_the_dataset_not_the_browser(app):
    from app.config import LOCAL_USER
    from app.services import face_dataset_service as svc
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Storage', 'storage')
        assert svc.dataset_klein_model(ds) is None
        svc.set_dataset_klein_model(LOCAL_USER, ds.id, OTHER_FILE)
        assert svc.dataset_klein_model(ds) == OTHER_FILE
        # Clearing goes back to "auto" — the same NULL a fresh dataset has, so
        # un-choosing is a real gesture and not a stuck value.
        svc.set_dataset_klein_model(LOCAL_USER, ds.id, '')
        assert svc.dataset_klein_model(ds) is None


def test_a_path_separator_cannot_be_smuggled_into_the_choice(app):
    """Only installed picker choices may carry a path, on either OS."""
    from app.config import LOCAL_USER
    from app.services import face_dataset_service as svc
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Traversal', 'traversal')
        for bad in ('../secret.safetensors', '..\\secret.safetensors',
                    'sub/model.safetensors', 'sub\\model.safetensors',
                    '/etc/passwd', 'C:\\models\\x.safetensors', '.', '..'):
            with pytest.raises(ValueError):
                svc.set_dataset_klein_model(LOCAL_USER, ds.id, bad)
        assert svc.dataset_klein_model(ds) is None
