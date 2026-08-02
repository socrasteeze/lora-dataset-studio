"""The WD14 tagger's pure seams — the ones a bug in would be silent.

Nothing here loads a model or spawns a subprocess. The three things under test
are exactly the three that fail QUIETLY in production:

  1. the tags_text sentinels, without which a tag filter half-matches a longer
     tag and a bank silently shows the wrong images;
  2. the progress grammar, without which the UI sits on "Loading…" through a
     pass that is actually running;
  3. the threshold clamp and the blob round-trip, without which a hand-edited
     config tags nothing at all and nobody is told why.
"""
import json

import pytest

from app.config import save_config
from app.services import wd14_tagger as w


# --- tags_text: whole-tag matching ---------------------------------------------

def test_tags_text_wraps_in_sentinel_commas():
    """The leading/trailing commas ARE the feature: the filter is a SQL LIKE and
    they are what makes it match a whole tag instead of a substring."""
    assert w.tags_text({'blonde_hair': 0.9, 'shirt': 0.8}) == ',blonde_hair,shirt,'


def test_tags_text_of_nothing_is_empty_not_a_lone_comma():
    """An untagged row must match NO filter. ',' or ',,' would be matched by a
    `LIKE '%,%'`-shaped query and quietly drag every untagged image into a
    filtered view."""
    assert w.tags_text({}) == ''
    assert w.tags_text(None) == ''


@pytest.mark.parametrize('needle,expected', [
    ('blonde_hair', True),
    ('blonde_hair_ribbon', False),   # the longer tag must NOT match the shorter
    ('hair', False),                 # nor a substring of one
    ('shirt', True),
])
def test_like_pattern_matches_whole_tags_only(needle, expected):
    """The exact semantics frontend/src/utils/tagFilter.js promises for booru
    captions, reproduced here so one word means one thing in both places."""
    text = w.tags_text({'blonde_hair': 0.9, 'shirt': 0.8})
    assert (f',{needle},' in text) is expected


def test_a_longer_tag_row_is_not_matched_by_its_prefix():
    """The mirror case: a row carrying ONLY the longer tag must not answer to
    the shorter one."""
    text = w.tags_text({'blonde_hair_ribbon': 0.9})
    assert ',blonde_hair,' not in text
    assert ',blonde_hair_ribbon,' in text


# --- the stored blob ------------------------------------------------------------

def test_blob_keeps_the_full_output_sorted_by_confidence():
    """Everything above the threshold is stored, so re-thresholding later costs
    no inference — the same read-time contract the bank's quality scores follow."""
    blob = w.tags_blob({'shirt': 0.51, 'blonde_hair': 0.98}, threshold_value=0.35)
    data = json.loads(blob)
    assert list(data['tags']) == ['blonde_hair', 'shirt']      # sorted, best first
    assert data['threshold'] == 0.35
    assert data['model'] == w.MODEL_ID


def test_blob_round_trips_through_the_parser():
    scores = {'blonde_hair': 0.9812, 'outdoors': 0.4}
    assert w.parse_tags_blob(w.tags_blob(scores)) == {'blonde_hair': 0.9812, 'outdoors': 0.4}


@pytest.mark.parametrize('bad', [None, '', 'not json', '[]', '{"tags": "nope"}'])
def test_parse_tags_blob_never_raises_on_junk(bad):
    """A row written by a future build, a truncated string or NULL yields {} —
    raising here would take out the whole listing that renders the bank."""
    assert w.parse_tags_blob(bad) == {}


def test_parse_tags_blob_drops_unreadable_scores_and_keeps_the_rest():
    blob = json.dumps({'tags': {'shirt': 'x', 'blonde_hair': 0.9}})
    assert w.parse_tags_blob(blob) == {'blonde_hair': 0.9}


# --- progress grammar -----------------------------------------------------------

@pytest.mark.parametrize('phase', w.PHASES)
def test_every_declared_phase_parses(phase):
    assert w.parse_progress_line(f'[wd14] phase={phase}') == {'phase': phase}


def test_a_count_line_carries_the_tagging_phase():
    """A dropped `phase=tagging` line must never leave the UI stuck on 'Loading…',
    so reaching image 1 implies the phase by itself."""
    assert w.parse_progress_line('[wd14] 3/40 tags=12') == {
        'phase': 'tagging', 'done': 3, 'total': 40}


@pytest.mark.parametrize('line', ['', 'random library banner', '[wd14] phase=bogus',
                                  '[facemask] 1/2'])
def test_unrelated_lines_are_not_progress(line):
    assert w.parse_progress_line(line) is None


# --- threshold ------------------------------------------------------------------

@pytest.mark.parametrize('stored,expected', [
    (0.5, 0.5),
    (0.0, w.THRESHOLD_MIN),      # tag-everything is clamped back into usefulness
    (1.0, w.THRESHOLD_MAX),      # tag-nothing likewise: a pass must never no-op silently
    ('nonsense', 0.35),
    (None, 0.35),
])
def test_threshold_is_clamped_server_side(stored, expected):
    """A hand-edited config.json or a stale UI degrades to a usable value — it is
    never the reason a pass quietly returns nothing."""
    save_config({'wd14': {'threshold': stored}})
    assert w.threshold() == pytest.approx(expected)


def test_missing_model_files_lists_both_when_nothing_is_downloaded(tmp_path):
    """A truncated or absent file counts as MISSING: reporting ✓ for half a
    400 MB download would light up the Tags button for a pass that can only die
    on image 1."""
    save_config({'wd14': {'models_root': str(tmp_path)}})
    assert sorted(w.missing_model_files()) == ['model.onnx', 'selected_tags.csv']
    # A file that exists but is far too small is still missing, not present.
    d = tmp_path / 'wd14'
    d.mkdir()
    (d / 'model.onnx').write_bytes(b'<html>404</html>')
    assert 'model.onnx' in w.missing_model_files()


def test_tagging_nothing_is_a_success_not_a_subprocess(tmp_path):
    """An empty set must not pay for an interpreter launch — and must not look
    like a failure either."""
    out = w.tag_images([])
    assert out == {'ok': True, 'results': {}, 'model': w.MODEL_ID}
