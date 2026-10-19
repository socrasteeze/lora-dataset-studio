"""Subject-box parsing and input refusal without inference or file writes."""
import pytest

from app.services.auto_center import (
    MAX_UPLOAD_BYTES, SubjectNotFound, parse_subject_box, suggest_subject_box,
)


def test_normalized_subject_box_and_reversed_corners():
    assert parse_subject_box('```json\n{"found":true,"box":[800,900,200,100]}\n```') == [0.2, 0.1, 0.8, 0.9]


@pytest.mark.parametrize('raw', [
    '{"found":false}',
    '{"box":[0,0,1000,1000]}',
    '{"found":true,"box":[false,0,1000,1000]}',
    '{"found":true,"box":[0,0,1001,1000]}',
    '{"found":true,"box":[0,0,NaN,1000]}',
    '{"found":true,"box":[0,0,0,1000]}',
    'No clear subject.',
])
def test_unusable_detection_does_not_fall_back_to_a_center_crop(raw):
    with pytest.raises(SubjectNotFound):
        parse_subject_box(raw)


def test_oversized_preview_and_unknown_framing_are_refused_before_inference():
    with pytest.raises(ValueError, match='8 MB'):
        suggest_subject_box(b'x' * (MAX_UPLOAD_BYTES + 1))
    with pytest.raises(ValueError, match='Choose Full Subject'):
        suggest_subject_box(b'not an image', 'unsupported')
