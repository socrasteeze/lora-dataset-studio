"""Prompt suffixes (global & per-framing) — free creative direction on variations.

Community feature request (waltm, Discord). The dataset carries a global suffix +
an optional per-framing map {face,bust,body,back}; both ride on every GENERATED
variation at WRAP time only:
  - never baked into the stored variation_prompt (a regenerate would double-apply),
  - never inside the restage/identity constraints (instruction-first Klein wrapper),
  - composition: per-framing FIRST (most specific, closest to the shot description),
    then the global suffix,
  - empty suffix -> byte-identical prompts (regression invariant).
"""
import io
import json
import os

from PIL import Image

from app.config import LOCAL_USER
from app.services.face_variations import (
    compose_prompt_suffix, wrap_variation_klein)


def _png(color=(255, 0, 0)):
    buf = io.BytesIO(); Image.new('RGB', (64, 64), color).save(buf, 'PNG')
    return buf.getvalue()


def _ds_with_ref(svc, name='Lola', trigger='lola', **kwargs):
    ds = svc.create_dataset(LOCAL_USER, name, trigger, **kwargs)
    d = svc._dataset_dir(ds.id); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'ref.webp'), 'wb') as fh:
        fh.write(_png())
    ds.ref_filename = 'ref.webp'
    svc.db.session.commit()
    return ds


# --- 1) Pure composition ------------------------------------------------------
def test_compose_prompt_suffix_order_and_sources():
    # per-framing first, then global
    assert compose_prompt_suffix('golden light', {'face': '85mm look'}, 'face') == \
        '85mm look, golden light'
    # framing without a dedicated suffix -> global only
    assert compose_prompt_suffix('golden light', {'face': '85mm look'}, 'body') == 'golden light'
    # accepts the JSON string exactly as stored on the row
    assert compose_prompt_suffix('g', json.dumps({'bust': 'b'}), 'bust') == 'b, g'
    # exact duplicate collapses to one
    assert compose_prompt_suffix('Same Thing', {'face': 'same thing'}, 'face') == 'same thing'
    # nothing set / broken JSON / unknown framing -> ''
    assert compose_prompt_suffix(None, None, 'face') == ''
    assert compose_prompt_suffix('', '{not json', 'face') == ''
    assert compose_prompt_suffix('  ', {'face': '   '}, 'face') == ''
    # trailing punctuation is trimmed so the later join stays clean
    assert compose_prompt_suffix('warm tones.', {'face': 'film grain,'}, 'face') == \
        'film grain, warm tones'


# --- 2) Wrapper ---------------------------------------------------------------
def test_wrap_variation_klein_suffix_in_descriptive_portion():
    out = wrap_variation_klein('close-up portrait', framing='face', suffix='warm film look')
    # In the DESCRIPTIVE portion: after the instruction opener, before the
    # framing detail and the restage/identity constraints.
    i_desc = out.index('reference image: ')
    i_sfx = out.index('warm film look')
    assert i_desc < i_sfx < out.index('Close-up head-and-shoulders')
    assert i_sfx < out.index('Restage the shot')
    assert 'close-up portrait, warm film look. ' in out
    # identity constraints stay verbatim after the suffix
    assert 'Keep the facial identity exactly the same' in out


def test_empty_suffix_is_byte_identical():
    """The no-suffix regression invariant: '' and absent produce the same bytes."""
    assert wrap_variation_klein('p', framing='body') == \
        wrap_variation_klein('p', framing='body', suffix='')
    assert wrap_variation_klein('p', nsfw=True) == wrap_variation_klein('p', nsfw=True, suffix='')


# --- 3) Persistence -----------------------------------------------------------
def test_schema_additions_cover_the_new_columns():
    """Existing installs (db already created) get the columns via the additive
    migration — db.create_all() never ALTERs an existing table."""
    from app import _SCHEMA_ADDITIONS
    assert ('face_dataset', 'prompt_suffix', 'TEXT') in _SCHEMA_ADDITIONS
    assert ('face_dataset', 'prompt_suffixes', 'TEXT') in _SCHEMA_ADDITIONS


def test_create_and_update_persist_suffixes(app):
    import pytest
    from app.extensions import db
    from app.models import FaceDataset
    from app.services import face_dataset_service as svc
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Lola', 'lola',
                                prompt_suffix='  warm tones  ',
                                prompt_suffixes={'face': ' 85mm ', 'body': '', 'nope': 'x'})
        row = db.session.get(FaceDataset, ds.id)
        assert row.prompt_suffix == 'warm tones'
        assert json.loads(row.prompt_suffixes) == {'face': '85mm'}   # empty/unknown dropped

        # update: set, replace whole map, then clear with '' / {}
        res = svc.update_dataset_settings(LOCAL_USER, ds.id,
                                          prompt_suffix='film grain',
                                          prompt_suffixes={'bust': 'soft light'})
        assert res['ok']
        row = db.session.get(FaceDataset, ds.id)
        assert row.prompt_suffix == 'film grain'
        assert json.loads(row.prompt_suffixes) == {'bust': 'soft light'}  # face gone (replaced)
        svc.update_dataset_settings(LOCAL_USER, ds.id, prompt_suffix='', prompt_suffixes={})
        row = db.session.get(FaceDataset, ds.id)
        assert row.prompt_suffix is None and row.prompt_suffixes is None
        # None = untouched (a name-only edit never wipes the suffixes)
        svc.update_dataset_settings(LOCAL_USER, ds.id, prompt_suffix='kept')
        svc.update_dataset_settings(LOCAL_USER, ds.id, name='Renamed')
        assert db.session.get(FaceDataset, ds.id).prompt_suffix == 'kept'
        # invalid payloads -> ValueError (route maps to 400)
        with pytest.raises(ValueError):
            svc.update_dataset_settings(LOCAL_USER, ds.id, prompt_suffixes=['not', 'a', 'dict'])
        with pytest.raises(ValueError):
            svc.update_dataset_settings(LOCAL_USER, ds.id, prompt_suffixes={'face': 42})
        with pytest.raises(ValueError):
            svc.update_dataset_settings(LOCAL_USER, ds.id, prompt_suffix=42)


def test_payload_and_settings_route_roundtrip(client):
    did = client.post('/api/dataset/create',
                      json={'name': 'L', 'trigger_word': 'l'}).get_json()['id']
    r = client.post(f'/api/dataset/{did}/settings',
                    json={'prompt_suffix': 'warm tones',
                          'prompt_suffixes': {'face': '85mm', 'back': 'from behind '}})
    assert r.status_code == 200 and r.get_json()['ok']
    p = client.get(f'/api/dataset/{did}').get_json()
    assert p['prompt_suffix'] == 'warm tones'
    assert p['prompt_suffixes'] == {'face': '85mm', 'back': 'from behind'}
    # bad shape -> 400, nothing changed
    r = client.post(f'/api/dataset/{did}/settings', json={'prompt_suffixes': 'oops'})
    assert r.status_code == 400
    assert client.get(f'/api/dataset/{did}').get_json()['prompt_suffix'] == 'warm tones'


# --- 4) Application at generation time (Klein) --------------------------------
def test_klein_fanout_applies_suffix_without_baking_it(app, monkeypatch):
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc
    from app.services import klein_edit_helper as keh
    monkeypatch.setattr(keh, 'klein_missing_assets', lambda *a, **k: set())
    captured = []
    monkeypatch.setattr(keh, 'enqueue_klein_edit',
                        lambda **k: captured.append(k) or f'job-{len(captured)}')
    with app.app_context():
        ds = _ds_with_ref(svc, prompt_suffix='warm tones',
                          prompt_suffixes={'face': '85mm lens'})
        svc.generate_variations(LOCAL_USER, ds.id,
                                [{'label': 'a', 'framing': 'face', 'prompt': 'close-up portrait'},
                                 {'label': 'b', 'framing': 'body', 'prompt': 'full body shot'}],
                                1, 'm.safetensors')
        face_p = captured[0]['edit_prompt']
        body_p = captured[1]['edit_prompt']
        # per-framing then global on the face shot; global only on the body shot
        assert 'close-up portrait, 85mm lens, warm tones. ' in face_p
        assert 'full body shot, warm tones. ' in body_p and '85mm lens' not in body_p
        assert face_p.count('warm tones') == 1
        # stored prompt stays RAW — the suffix is applied at wrap time only
        rows = FaceDatasetImage.query.filter_by(dataset_id=ds.id).all()
        assert sorted(r.variation_prompt for r in rows) == \
            ['close-up portrait', 'full body shot']


def test_klein_regenerate_applies_current_suffix_exactly_once(app, monkeypatch):
    """The double-application trap: generate then regenerate (twice) must show the
    suffix ONCE each time, and follow the CURRENT dataset value."""
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc
    from app.services import klein_edit_helper as keh
    import app.job_queue as jq
    monkeypatch.setattr(keh, 'klein_missing_assets', lambda *a, **k: set())
    captured = []
    monkeypatch.setattr(keh, 'enqueue_klein_edit',
                        lambda **k: captured.append(k) or f'job-{len(captured)}')
    with app.app_context():
        monkeypatch.setattr(jq.queue_manager, 'cancel_job', lambda *a, **k: None)
        ds = _ds_with_ref(svc, prompt_suffix='warm tones')
        svc.generate_variations(LOCAL_USER, ds.id,
                                [{'label': 'a', 'framing': 'face', 'prompt': 'close-up portrait'}],
                                1, 'm.safetensors')
        img = FaceDatasetImage.query.filter_by(dataset_id=ds.id).one()
        for _ in range(2):
            svc.regenerate_image(LOCAL_USER, img.id)
            prompt_sent = captured[-1]['edit_prompt']
            assert prompt_sent.count('warm tones') == 1        # never doubled
            assert 'close-up portrait, warm tones. ' in prompt_sent
            svc.db.session.expire_all()
            assert svc.db.session.get(FaceDatasetImage, img.id).variation_prompt == \
                'close-up portrait'                            # still raw
        # the CURRENT suffix wins on the next regenerate (edit after the fact)
        svc.update_dataset_settings(LOCAL_USER, ds.id, prompt_suffix='film grain')
        svc.regenerate_image(LOCAL_USER, img.id)
        assert 'warm tones' not in captured[-1]['edit_prompt']
        assert captured[-1]['edit_prompt'].count('film grain') == 1
        # clearing it restores the historical prompt byte-for-byte
        svc.update_dataset_settings(LOCAL_USER, ds.id, prompt_suffix='')
        svc.regenerate_image(LOCAL_USER, img.id)
        from app.services.face_variations import wrap_variation_klein as wk
        assert captured[-1]['edit_prompt'] == wk('close-up portrait', framing='face')


# --- 5) Legacy API-engine rows (engines removed) -------------------------------
def test_legacy_api_row_regenerates_via_klein(app, monkeypatch):
    """A row created by a removed API engine (klein_model holds the old engine
    TAG) regenerates on the Klein path, swapping in the workspace's real Klein
    model instead of the stale tag — and applies the suffix exactly once."""
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc
    from app.services import klein_edit_helper as keh
    import app.job_queue as jq
    monkeypatch.setattr(keh, 'klein_missing_assets', lambda *a, **k: set())
    captured = []
    monkeypatch.setattr(keh, 'enqueue_klein_edit',
                        lambda **k: captured.append(k) or f'job-{len(captured)}')
    with app.app_context():
        monkeypatch.setattr(jq.queue_manager, 'cancel_job', lambda *a, **k: None)
        ds = _ds_with_ref(svc, name='NBr', trigger='nbr', prompt_suffix='golden hour')
        img = FaceDatasetImage(dataset_id=ds.id, source='generated', status='keep',
                               framing='bust', variation_label='Buste face',
                               variation_prompt='upper body portrait',
                               klein_model='nanobanana')
        svc.db.session.add(img); svc.db.session.commit()
        svc.regenerate_image(LOCAL_USER, img.id, klein_model='m.safetensors')
        assert len(captured) == 1
        assert captured[0]['klein_model'] == 'm.safetensors'   # tag replaced
        assert captured[0]['edit_prompt'].count('golden hour') == 1
        svc.db.session.expire_all()
        row = svc.db.session.get(FaceDatasetImage, img.id)
        assert row.variation_prompt == 'upper body portrait'   # still raw
        assert row.klein_model == 'm.safetensors'


def test_regenerate_rejects_removed_engines(app, monkeypatch):
    import pytest
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc
    with app.app_context():
        ds = _ds_with_ref(svc, name='X', trigger='x')
        img = FaceDatasetImage(dataset_id=ds.id, source='generated', status='keep',
                               variation_prompt='p', klein_model='nanobanana')
        svc.db.session.add(img); svc.db.session.commit()
        for engine in ('nanobanana', 'chatgpt', 'bogus'):
            with pytest.raises(ValueError):
                svc.regenerate_image(LOCAL_USER, img.id, engine=engine)
