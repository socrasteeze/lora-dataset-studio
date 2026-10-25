"""Anima character captions: booru default, signature traits, tag shape, and the
external-folder recaption. Every value here is invented."""
import json
import os

import pytest
from PIL import Image

from app.config import LOCAL_USER
from app.services import face_variations as fv
from app.services import pixai_tagger
from app.services.anima_booru import anima_character_tags


def _kept(svc, ds, name='k0.png', caption=None):
    from app.models import FaceDatasetImage
    folder = svc._dataset_dir(ds.id)
    os.makedirs(folder, exist_ok=True)
    Image.new('RGB', (32, 32)).save(os.path.join(folder, name))
    img = FaceDatasetImage(dataset_id=ds.id, source='import', status='keep',
                           filename=name, framing='face', caption=caption)
    svc.db.session.add(img)
    svc.db.session.commit()
    return img


# --- the default in all three spots -------------------------------------------
def test_resolved_mode_defaults_anima_to_booru_and_an_explicit_mode_wins():
    assert pixai_tagger.resolved_mode('anima', None) == 'booru'
    assert pixai_tagger.resolved_mode('sdxl', None) == 'booru'
    assert pixai_tagger.resolved_mode('zimage', None) == 'prose'
    assert pixai_tagger.resolved_mode('anima', 'prose') == 'prose'


def test_caption_recipe_defaults_anima_character_and_style_to_booru(app):
    from app.services import face_dataset_service as svc
    with app.app_context():
        char = svc.create_dataset(LOCAL_USER, 'C', 'zchar_c', train_type='anima')
        prompt, _clean = svc._dataset_caption_recipe(char, {})
        assert 'start with 1girl, solo' in prompt
        prose, _ = svc._dataset_caption_recipe(char, {}, mode='prose')
        assert 'compact factual paragraph' in prose
        style = svc.create_dataset(LOCAL_USER, 'S', 'zstyle_s', kind='style',
                                   train_type='anima')
        assert svc._dataset_caption_recipe(style, {})[0] == fv.CAPTION_PROMPT_STYLE_BOORU
        plain = svc.create_dataset(LOCAL_USER, 'Z', 'zchar_z', train_type='zimage')
        assert svc._dataset_caption_recipe(plain, {})[0] == fv.JOYCAPTION_PROMPT


def test_short_captions_default_anima_to_booru(app):
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'D', 'zchar_d', train_type='anima')
        ds.train_settings = json.dumps({'dual_captions': True})
        svc.set_caption_options(LOCAL_USER, ds.id, {'signature_tags': 'tattoo'})
        img = _kept(svc, ds, caption='a long caption')
        n = svc.derive_short_captions(
            LOCAL_USER, ds.id, generate=lambda _p: 'smile, blue eyes, arm tattoo, standing')
        assert n == 1
        # A prose cleaner would drop this whole "sentence" for its eye colour.
        assert svc.db.session.get(FaceDatasetImage, img.id).caption_short == 'smile, standing'


# --- signature traits -----------------------------------------------------------
def test_signature_tags_strip_whole_words_and_plurals():
    caption = ('1girl, solo, arm tattoo, black armor, hoop earrings, smile, '
               'armored outfit, armory, scared, red scarf')
    assert fv.drop_signature_tags(caption, ['tattoo', 'armor', 'earring', 'scar']) == (
        '1girl, solo, smile, armory, scared, red scarf')
    assert fv.drop_signature_tags(caption, []) == caption


def test_signature_sentences_strip_the_prose_fallback():
    text = 'She stands in a corridor. A scar crosses her cheek. Green light.'
    assert fv.drop_signature_sentences(text, ['scar']) == 'She stands in a corridor. Green light.'


def test_signature_omit_rule_is_empty_without_tags():
    assert fv.signature_omit_rule([]) == ''
    rule = fv.signature_omit_rule(['black_armor', 'Scar'])
    assert 'black armor, scar.' in rule and 'differs from' in rule


def test_signature_tags_round_trip_through_caption_options(app):
    from app.services import face_dataset_service as svc
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'O', 'zchar_o', train_type='anima')
        out = svc.set_caption_options(
            LOCAL_USER, ds.id, {'signature_tags': 'Black_Armor, scar, scar, '})
        assert out['signature_tags'] == ['black armor', 'scar']
        assert svc.caption_options(ds)['signature_tags'] == ['black armor', 'scar']
        prompt, clean = svc._dataset_caption_recipe(ds, svc.caption_options(ds))
        assert 'black armor, scar.' in prompt
        assert clean('1girl, black armor, facial scar, standing') == '1girl, solo, standing'
        svc.set_caption_options(LOCAL_USER, ds.id, {'signature_tags': []})
        assert ds.caption_options is None


def test_suggest_keeps_traits_in_sixty_percent_of_images():
    lines = [
        '1girl, solo, arm tattoo, black armor, standing',
        '1girl, solo, arm tattoo, black armor, sitting',
        '1girl, solo, arm tattoo, smile, standing',
        '1girl, solo, black armor, from behind',
        '1girl, solo, red dress',
    ]
    # count tags and poses are frequent but are not signature traits
    assert fv.suggest_signature_tags(lines) == ['armor', 'tattoo']


def test_dataset_suggestion_reads_only_booru_captions(app):
    from app.services import face_dataset_service as svc
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'G', 'zchar_g', train_type='anima')
        _kept(svc, ds, 'a.png', '1girl, solo, horns, standing, indoors')
        _kept(svc, ds, 'b.png', '1girl, solo, horns, sitting, outdoors')
        _kept(svc, ds, 'c.png', 'She has horns. She stands outside in the rain.')
        assert svc.suggest_dataset_signature_tags(LOCAL_USER, ds.id) == ['horn']


# --- tag shape --------------------------------------------------------------------
def test_anima_tags_lead_with_counts_and_drop_quality_and_rating():
    raw = 'masterpiece, from_behind, 1girl, score_9, solo, safe, holding gun, absurdres'
    assert anima_character_tags(raw) == '1girl, solo, from behind, holding gun'


def test_a_lone_subject_count_gains_solo_and_a_pair_does_not():
    assert anima_character_tags('smile, 1girl') == '1girl, solo, smile'
    assert anima_character_tags('1girl, 1boy, smile') == '1girl, 1boy, smile'
    assert anima_character_tags('1girl, solo focus') == '1girl, solo focus'


def test_anima_recipe_keeps_count_tags_and_drops_identity(app):
    from app.services import face_dataset_service as svc
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'K', 'zchar_k', train_type='anima')
        _prompt, clean = svc._dataset_caption_recipe(ds, {})
        assert clean('standing, 1girl, solo, long hair, blue eyes, best quality') == (
            '1girl, solo, standing')


# --- Auto picks PixAI for Anima booru when it is installed ------------------------
def test_anima_auto_uses_pixai_when_installed(app, monkeypatch):
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc

    def _tags(paths, **_kw):
        return {'ok': True, 'errors': {}, 'model': pixai_tagger.MODEL_ID, 'results': {
            paths[0]: {'general': {'1girl': 0.9, 'solo': 0.8, 'black_armor': 0.7,
                                   'standing': 0.6, 'red_eyes': 0.5},
                       'rating': {'general': 0.9}}}}

    monkeypatch.setattr(pixai_tagger, 'is_installed', lambda: True)
    monkeypatch.setattr(pixai_tagger, 'caption_images', _tags)
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'P', 'zchar_p', train_type='anima')
        svc.set_caption_options(LOCAL_USER, ds.id, {'backend': 'auto',
                                                    'signature_tags': 'armor'})
        img = _kept(svc, ds)
        assert svc.caption_images(LOCAL_USER, ds.id) == 1
        row = svc.db.session.get(FaceDatasetImage, img.id)
        assert row.caption_origin == 'pixai'
        assert row.caption == '1girl, solo, standing'


def test_anima_auto_prose_does_not_use_pixai(app, monkeypatch):
    from app.services import face_dataset_service as svc
    monkeypatch.setattr(pixai_tagger, 'is_installed', lambda: True)
    with app.app_context():
        ds = svc.create_dataset(LOCAL_USER, 'Q', 'zchar_q', train_type='anima')
        assert svc._anima_auto_pixai(ds, None) is True
        assert svc._anima_auto_pixai(ds, 'prose') is False
        concept = svc.create_dataset(LOCAL_USER, 'R', 'zconc_r', kind='concept',
                                     concept_desc='jumping', train_type='anima')
        assert svc._anima_auto_pixai(concept, None) is False
        monkeypatch.setattr(pixai_tagger, 'is_installed', lambda: False)
        assert svc._anima_auto_pixai(ds, None) is False


# --- external folder ------------------------------------------------------------------
@pytest.fixture
def folder(tmp_path):
    src = tmp_path / 'src'
    src.mkdir()
    for i in range(5):
        Image.new('RGB', (16, 16)).save(src / f'img-{i:02d}.png')
    (src / 'img-00.txt').write_text('old caption', encoding='utf-8')
    return src


def _fake_ollama(monkeypatch, lines):
    from app.services import face_dataset_service as svc
    seen = {}

    def _caption_paths(paths, **kw):
        seen.update(kw)
        return {p: lines[i % len(lines)] for i, p in enumerate(paths)}

    monkeypatch.setattr(pixai_tagger, 'is_installed', lambda: False)
    monkeypatch.setattr(svc, 'caption_paths', _caption_paths)
    return seen


def test_external_recaption_writes_only_to_the_output_folder(folder, tmp_path, monkeypatch):
    from app.services.external_recaption import recaption_external_folder
    seen = _fake_ollama(monkeypatch, [
        '1girl, solo, from behind, standing, black armor, long hair, dark corridor',
        '1girl, solo, sitting, black armor, green lighting, masterpiece',
    ])
    before = sorted(os.listdir(folder))
    out = tmp_path / 'out'
    result = recaption_external_folder(str(folder), str(out), 'zchar_\\(x\\)')
    assert sorted(os.listdir(folder)) == before
    assert (folder / 'img-00.txt').read_text(encoding='utf-8') == 'old caption'
    assert result['written'] == 5 and result['skipped'] == 0
    assert result['suggested_signature_tags'] == ['armor', 'long hair']
    assert seen['backend'] == 'ollama'
    assert 'start with 1girl, solo' in seen['prompt']
    assert sorted(os.listdir(out)) == [f'img-{i:02d}.txt' for i in range(5)]
    first = (out / 'img-00.txt').read_text(encoding='utf-8').strip()
    assert first == 'zchar_\\(x\\), 1girl, solo, from behind, standing, dark corridor'
    second = (out / 'img-01.txt').read_text(encoding='utf-8').strip()
    assert second == 'zchar_\\(x\\), 1girl, solo, sitting, green lighting'


def test_external_recaption_uses_an_explicit_list_as_given(folder, tmp_path, monkeypatch):
    from app.services.external_recaption import recaption_external_folder
    seen = _fake_ollama(monkeypatch, ['1girl, solo, black armor, hoop earring, standing'])
    result = recaption_external_folder(str(folder), str(tmp_path / 'out'), 't',
                                       signature_tags=[])
    assert result['signature_tags'] == []
    assert 'signature traits' not in seen['prompt']
    text = (tmp_path / 'out' / 'img-03.txt').read_text(encoding='utf-8').strip()
    assert text == 't, 1girl, solo, black armor, hoop earring, standing'
    result = recaption_external_folder(str(folder), str(tmp_path / 'out'), 't',
                                       signature_tags='armor, earring')
    assert result['signature_tags'] == ['armor', 'earring']
    assert 'usual outfit: armor, earring.' in seen['prompt']
    text = (tmp_path / 'out' / 'img-03.txt').read_text(encoding='utf-8').strip()
    assert text == 't, 1girl, solo, standing'


def test_external_recaption_refuses_the_source_folder_as_output(folder, monkeypatch):
    from app.services.external_recaption import recaption_external_folder
    _fake_ollama(monkeypatch, ['1girl'])
    with pytest.raises(ValueError):
        recaption_external_folder(str(folder), str(folder), 't')
    with pytest.raises(ValueError):
        recaption_external_folder(str(folder), str(folder) + '_out', '')
