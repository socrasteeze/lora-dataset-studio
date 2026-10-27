"""Anima content categories, source facts and omission rules; synthetic inputs only."""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.services.anima_booru import anima_character_tags, format_anima_caption
from app.services.face_variations import caption_has_identity_leak, drop_identity_tags


def test_character_caption_filters_categories_before_flattening():
    raw = {
        'general': {'solo': .99, '1girl': .9, '3d': .85,
                    'blue_dress': .8, 'looking_at_viewer': .7},
        'character': {'invented_character': .99},
        'copyright': {'invented_series': .99},
        'meta': {'official_art': .99, 'ai-generated': .99},
        'style': {'invented_style': .99},
        'rating': {'rating:g': .99},
        'artist': {'invented_artist': .99},
        'unknown': {'untrusted_label': .99},
    }
    before = deepcopy(raw)
    assert format_anima_caption(raw, include_character=False) == (
        '1girl, solo, 3d, blue dress, looking at viewer')
    assert raw == before


def test_style_caption_keeps_subject_names_but_not_aesthetic_or_provenance():
    raw = {'general': {'1girl': .9, 'sitting': .8},
           'character': {'invented_character': .99},
           'copyright': {'invented_series': .99},
           'style': {'invented_style': .99}, 'meta': {'official_art': .99}}
    assert format_anima_caption(raw, include_character=True) == (
        '1girl, solo, invented character, sitting')


@pytest.mark.parametrize('transparent,expected', [(False, '1girl, solo'),
                                                (True, '1girl, solo, transparent background'),
                                                (None, '1girl, solo, transparent background')])
def test_transparency_needs_source_facts_to_be_rejected(transparent, expected):
    raw = {'general': {'1girl': .9, 'transparent_background': .8}}
    assert format_anima_caption(raw, include_character=False,
                                image_facts={'transparent': transparent}) == expected


def test_empty_content_does_not_gain_an_invented_subject():
    assert format_anima_caption({'meta': {'official_art': .9}}, include_character=False) == ''


def test_text_only_anima_cleanup_drops_provenance_and_keeps_visible_content():
    assert anima_character_tags(
        r'official_art, ai-generated, photoshop \(medium\), solo, 1girl, blue_dress') == (
            '1girl, solo, blue dress')


@pytest.mark.parametrize('tag', ['sidelocks', 'forelock', 'ahoge', 'grey_skin',
                               'blue_skin', 'colored_skin', 'shiny_skin',
                               'two-tone_skin', 'deep_skin', 'cracked_skin',
                               'patchwork_skin', 'metal_skin', 'gradient_skin',
                               'aqua_skin', 'silver_skin', 'darkened_skin',
                               'lightened_skin', 'striped_skin', 'gold_skin',
                               'split-color_skin', 'glowing_skin', 'light-skinned_palms'])
def test_locked_or_omitted_traits_do_not_survive_the_tag_cleaner(tag):
    assert drop_identity_tags('1girl, solo, ' + tag + ', blue_dress',
                              keep_count_tags=True) == '1girl, solo, blue_dress'


def test_hair_describe_is_preserved_while_skin_stays_locked():
    assert drop_identity_tags('sidelocks, blue_skin, hair_bow, looking_at_viewer',
                              appearance={'hair': 'describe'}) == (
                                  'sidelocks, hair_bow, looking_at_viewer')
    assert drop_identity_tags('sidelocks, hair_bow, skintight, looking_at_viewer',
                              appearance={'hair': 'omit'}) == (
                                  'hair_bow, skintight, looking_at_viewer')


def test_badge_detects_the_same_hair_family_without_a_custom_policy():
    assert caption_has_identity_leak('1girl, solo, sidelocks, blue dress')
    assert not caption_has_identity_leak('1girl, solo, sidelocks, blue dress',
                                         appearance={'hair': 'describe'})


def test_anima_empty_cleanup_never_restores_a_rejected_draft():
    from app.services import face_dataset_service as service
    assert service._clean_caption_result(SimpleNamespace(train_type='anima'),
                                         'blue eyes', lambda _text: '') == ''
    assert service._clean_caption_result(SimpleNamespace(train_type='sdxl'),
                                         'draft', lambda _text: '') == 'draft'


def test_source_replacement_rejects_the_old_worker_caption(tmp_path, monkeypatch):
    from app.services import bank_transfer_metadata, face_dataset_service as service
    source = tmp_path / 'input.png'
    source.write_bytes(b'invented original image bytes')
    original = bank_transfer_metadata.content_fingerprint_path(source)
    monkeypatch.setattr(service, '_img_path', lambda _image: str(source))
    image = SimpleNamespace(filename='input.png')
    assert service._pixai_source_matches(image, str(source), {'sha256': original})
    source.write_bytes(b'invented replacement image bytes')
    assert not service._pixai_source_matches(image, str(source), {'sha256': original})
    assert not service._pixai_source_matches(SimpleNamespace(filename=None), str(source),
                                             {'sha256': original})


def test_anima_defaults_match_options_without_writing_overrides():
    from app.services import face_dataset_service as service
    from app.services.face_variations import APPEARANCE_DEFAULTS
    dataset = SimpleNamespace(train_type='anima', kind=None, caption_options=None)
    stored = service.caption_options(dataset)
    assert stored['appearance'] == {}
    _, clean = service._dataset_caption_recipe(dataset, stored)
    assert clean('1girl, solo, sidelocks, beard, hair_bow, blush, glasses, blue_dress') == (
        '1girl, solo, hair bow, blush, glasses, blue dress')
    assert dataset.caption_options is None
    assert stored['appearance'] == {}
    effective = service._caption_appearance(dataset)
    assert effective == APPEARANCE_DEFAULTS
    effective['hair'] = 'describe'
    assert APPEARANCE_DEFAULTS['hair'] == 'omit'


def test_explicit_describe_overrides_anima_omit_defaults():
    from app.services import face_dataset_service as service
    dataset = SimpleNamespace(train_type='anima', kind='character')
    _, clean = service._dataset_caption_recipe(dataset, {
        'appearance': {'hair': 'describe', 'facial_hair': 'describe'}})
    assert clean('1girl, sidelocks, beard, blue_skin, blue_dress') == (
        '1girl, solo, sidelocks, beard, blue dress')


@pytest.mark.parametrize('kind', [None, 'style'])
def test_anima_short_counts_follow_the_long_caption(kind):
    from app.services import face_dataset_service as service
    dataset = SimpleNamespace(train_type='anima', kind=kind, fidelity='face',
                              caption_options=None, trigger_word='invented_trigger')
    short = service._scrub_short_like_long(
        dataset, '2girls, blue_dress, looking_at_viewer, official_art', 'booru',
        source_caption='1girl, solo, blue dress, looking at viewer, standing')
    assert short == '1girl, solo, blue dress, looking at viewer'


def test_legacy_family_defaults_are_not_changed():
    from app.services import face_dataset_service as service
    assert service._caption_appearance(SimpleNamespace(train_type='sdxl', kind=None)) is None
    assert service._caption_appearance(SimpleNamespace(train_type='anima', kind='style')) is None


def test_body_omission_preserves_scarves_and_expressions():
    assert drop_identity_tags('arm_tattoo, scar_on_face, ear_piercing, red_scarf, '
                              'scarlet_dress, scared, standing', body=True) == (
                                  'red_scarf, scarlet_dress, scared, standing')
