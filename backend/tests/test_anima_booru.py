"""Anima booru normalization: spaces, score tags, escaping, order, safety and counts."""
from app.services.anima_booru import (
    compose_hybrid_caption, format_anima_booru, normalize_anima_tag,
)


def test_hybrid_caption_is_one_line():
    assert compose_hybrid_caption('1girl, solo', 'She sits.\nSoft light.') == (
        '1girl, solo. She sits. Soft light.')
    assert compose_hybrid_caption('', 'Only prose.') == 'Only prose.'
from app.services.face_variations import drop_identity_tags


def test_underscores_become_spaces_except_score_tags():
    assert normalize_anima_tag('looking_at_viewer') == 'looking at viewer'
    assert normalize_anima_tag('best_quality') == 'best quality'
    assert normalize_anima_tag('score_9') == 'score_9'
    assert normalize_anima_tag('score_8_up') == 'score_8_up'
    assert normalize_anima_tag('SCORE_7_UP') == 'score_7_up'


def test_parentheses_are_escaped_once():
    assert normalize_anima_tag('gwen_(fortnite)') == r'gwen \(fortnite\)'
    assert normalize_anima_tag(r'gwen_\(fortnite\)') == r'gwen \(fortnite\)'
    assert normalize_anima_tag(r'already \(done\)') == r'already \(done\)'


def test_anima_order_keeps_safety_count_character_and_artist():
    text = format_anima_booru({
        'general': {
            'looking_at_viewer': 0.4,
            '1girl': 0.95,
            'masterpiece': 0.5,
            'score_9': 0.99,
            'blue_eyes': 0.2,
            'solo': 0.9,
            'gwen_(fortnite)': 0.1,
        },
        'meta': {'highres': 0.8, 'year_2024': 0.7, 'newest': 0.6},
        'rating': {'rating:s': 0.9, 'explicit': 0.2},
        'character': {'hatsune_miku': 0.5},
        'copyright': {'vocaloid': 0.4},
        'artist': {'wanke': 0.3},
    }, include_character=True)
    assert text == (
        'score_9, masterpiece, highres, year 2024, newest, sensitive, explicit, '
        '1girl, solo, hatsune miku, vocaloid, @wanke, looking at viewer, '
        'blue eyes, gwen \\(fortnite\\)'
    )


def test_character_names_drop_when_the_dataset_locks_identity():
    text = format_anima_booru(
        {'general': {'smile': 0.4}, 'character': {'hatsune_miku': 0.9}},
        include_character=False)
    assert text == 'smile'


def test_anima_cleaner_keeps_count_and_safety_and_drops_identity():
    raw = format_anima_booru({
        'general': {'1girl': 0.9, 'solo': 0.8, 'blue_eyes': 0.7, 'smile': 0.4,
                    'multiple_girls': 0.3},
        'rating': {'safe': 0.95},
    }, include_character=False)
    cleaned = drop_identity_tags(raw, keep_count_tags=True)
    assert cleaned == 'safe, 1girl, solo, multiple girls, smile'
    # The historical filter still removes counts. Anima opts out on purpose.
    assert drop_identity_tags(raw) == 'safe, smile'
