"""PixAI Tagger helpers that must stay true without a model on disk.

No interpreter launch, no download, no creation of a snapshot folder.
"""
import os

import pytest

from app.config import data_dir, save_config
from app.services import pixai_tagger as p
from app.services.face_variations import drop_identity_tags


def test_models_dir_defaults_to_the_app_data_models_folder():
    assert p.FOLDER_NAME == 'pixai-tagger-v1.0'
    dest = data_dir() / 'models' / 'pixai-tagger-v1.0'
    assert p.models_dir() == str(dest)
    assert not dest.exists()


def test_models_root_overrides_the_parent_and_does_not_create_the_folder(tmp_path):
    save_config({'pixai': {'models_root': str(tmp_path)}})
    dest = p.models_dir()
    assert dest == os.path.join(str(tmp_path), 'pixai-tagger-v1.0')
    assert not os.path.exists(dest)


def test_missing_snapshot_is_true_until_config_and_weights_exist(tmp_path):
    assert p.missing_snapshot(str(tmp_path)) is True
    (tmp_path / 'config.json').write_text('{}', encoding='utf-8')
    assert p.missing_snapshot(str(tmp_path)) is True
    (tmp_path / 'model.safetensors').write_bytes(b'not-a-real-weight')
    assert p.missing_snapshot(str(tmp_path)) is False


def test_booru_caption_keeps_general_and_orders_by_score():
    text = p.booru_caption(
        {'general': {'solo': 0.4, '1girl': 0.9}, 'rating': {'rating:e': 0.99},
         'character': {'hatsune_miku': 0.8}},
        include_character=False)
    assert text == '1girl, solo'


def test_character_tags_join_only_when_the_dataset_is_not_an_identity_lock():
    results = {'general': {'1girl': 0.9}, 'character': {'hatsune_miku': 0.7}}
    assert p.include_character_tags('character') is False
    assert p.include_character_tags(None) is False
    assert p.include_character_tags('style') is True
    assert p.booru_caption(results, include_character=False) == '1girl'
    assert p.booru_caption(results, include_character=True) == '1girl, hatsune_miku'


def test_booru_string_then_the_existing_identity_tag_cleaner():
    text = p.booru_caption(
        {'general': {'1girl': 0.9, 'blue_eyes': 0.8, 'smile': 0.5}},
        include_character=False)
    cleaned = drop_identity_tags(text)
    assert 'blue_eyes' not in cleaned
    assert cleaned == 'smile'


def test_concept_datasets_are_refused_and_other_kinds_are_not():
    assert p.concept_refusal('concept') == p.CONCEPT_REFUSAL
    assert p.concept_refusal('character') is None
    assert p.concept_refusal('style') is None


def test_resolved_mode_matches_the_dataset_default():
    assert p.resolved_mode('sdxl', None) == 'booru'
    assert p.resolved_mode('anima', None) == 'prose'
    assert p.resolved_mode('anima', 'booru') == 'booru'
    assert p.resolved_mode('zimage', 'prose') == 'prose'


@pytest.mark.parametrize('stored,expected', [
    ('cuda', 'cuda'),
    ('cpu', 'cpu'),
    ('auto', 'auto'),
    ('gpu', 'auto'),
    ('', 'auto'),
])
def test_device_is_auto_cuda_or_cpu(stored, expected):
    save_config({'pixai': {'device': stored}})
    assert p.device() == expected


def test_an_empty_batch_does_not_start_the_interpreter():
    assert p.caption_images([]) == {
        'ok': True, 'results': {}, 'errors': {}, 'model': 'pixai-tagger-v1.0'}


def test_a_missing_snapshot_refuses_without_a_download(tmp_path):
    save_config({'pixai': {'models_root': str(tmp_path)}})
    out = p.caption_images([__file__])
    assert out['ok'] is False
    assert out['error_kind'] == 'unavailable'
    assert out['model'] == 'pixai-tagger-v1.0'
    assert not (tmp_path / 'pixai-tagger-v1.0').exists()
