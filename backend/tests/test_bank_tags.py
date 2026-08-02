"""🏷️ The bank's WD14 tag pass — the parts that are NOT the model.

The classifier itself is a downloaded ONNX file and is not exercised here; it is
stubbed. What IS exercised is everything around it, and each of these has a
failure mode that would be silent in production:

  • the filter matches whole tags only — a substring match shows the wrong
    images under a filter that looks right;
  • tags never touch captions — the whole reason they are a separate column;
  • a tagged row is not re-tagged, and an unreadable one is not retried forever;
  • the pass refuses with the RIGHT reason (busy vs not installed), in the right
    order — the mistake start_framing's comments record having shipped;
  • a peer cannot be handed a pass it cannot run.
"""
import os

import pytest
from PIL import Image

from app.config import LOCAL_USER


def _mkbank(client, tmp_path, n=3, name='TAGB'):
    src = tmp_path / 'src'
    os.makedirs(src, exist_ok=True)
    for i in range(n):
        Image.new('RGB', (64, 64), (10 * i, 40, 90)).save(src / f'i{i}.png')
    r = client.post('/api/bank/create', json={'name': name, 'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id'], src


def _stub_tagger(monkeypatch, per_image, model='wd-test'):
    """Replace the subprocess with a deterministic answer, keyed by basename.

    Patched on the wd14_tagger MODULE, not on a name bound inside the bank
    service: the pass imports it lazily per call, so the module attribute is the
    seam both the real code and this stub go through."""
    from app.services import wd14_tagger as w

    def fake_tag_images(paths, threshold_value=None, on_progress=None, **kw):
        if on_progress:
            on_progress({'phase': 'loading'})
            on_progress({'phase': 'tagging', 'done': len(paths), 'total': len(paths)})
        results = {}
        for p in paths:
            got = per_image.get(os.path.basename(p))
            if got is not None:
                results[p] = got
        return {'ok': True, 'results': results, 'model': model,
                'errors': {p: 'unreadable' for p in paths
                           if os.path.basename(p) not in per_image}}

    monkeypatch.setattr(w, 'tag_images', fake_tag_images)
    # The pass gates on the capability probe and on whether it would take the GPU.
    import app.capabilities as caps
    monkeypatch.setattr(caps, 'probe_wd14', lambda: {'ok': True, 'detail': 'stub'})
    monkeypatch.setattr(w, 'uses_gpu', lambda: False)


def _run_tags(app, bank_id, **kw):
    from app.services import image_bank_service as banks
    banks.start_tags(app, LOCAL_USER, bank_id, **kw)


# --- the pass -------------------------------------------------------------------

def test_tags_are_stored_and_captions_are_left_alone(app, client, tmp_path, monkeypatch):
    """The entire point of a separate column: tagging a bank must not consume the
    captioning work, and must not fake it either."""
    from app.extensions import db
    from app.models import BankImage
    bank_id, _src = _mkbank(client, tmp_path, n=2)
    with app.app_context():
        db.session.execute(
            db.update(BankImage).where(BankImage.bank_id == bank_id)
            .values(caption='a hand-written caption'))
        db.session.commit()
    _stub_tagger(monkeypatch, {'i0.png': {'blonde_hair': 0.98, 'shirt': 0.7},
                               'i1.png': {'red_dress': 0.9}})
    with app.app_context():
        _run_tags(app, bank_id)
        rows = {r.relpath: r for r in BankImage.query.filter_by(bank_id=bank_id)}
        assert rows['i0.png'].tags_state == 'ok'
        assert rows['i0.png'].tags_text == ',blonde_hair,shirt,'
        assert 'blonde_hair' in rows['i0.png'].tags
        # …and the caption is byte-for-byte what it was.
        assert rows['i0.png'].caption == 'a hand-written caption'
        assert rows['i1.png'].caption == 'a hand-written caption'


def test_the_full_scored_output_is_kept_so_rethresholding_is_free(
        app, client, tmp_path, monkeypatch):
    from app.models import BankImage
    from app.services import wd14_tagger as w
    bank_id, _src = _mkbank(client, tmp_path, n=1)
    _stub_tagger(monkeypatch, {'i0.png': {'blonde_hair': 0.98, 'shirt': 0.36}})
    with app.app_context():
        _run_tags(app, bank_id)
        row = BankImage.query.filter_by(bank_id=bank_id).one()
        stored = w.parse_tags_blob(row.tags)
        # Both survive with their confidences, so raising the cut to 0.5 later is
        # a read, not another pass over the GPU.
        assert stored == {'blonde_hair': 0.98, 'shirt': 0.36}


def test_an_unreadable_row_is_marked_not_left_for_every_future_run(
        app, client, tmp_path, monkeypatch):
    """NULL would mean 'not tagged yet', so the row would be re-attempted by
    every run forever and nothing would ever say why."""
    from app.models import BankImage
    bank_id, _src = _mkbank(client, tmp_path, n=2)
    _stub_tagger(monkeypatch, {'i0.png': {'shirt': 0.9}})     # i1 comes back with nothing
    with app.app_context():
        _run_tags(app, bank_id)
        rows = {r.relpath: r for r in BankImage.query.filter_by(bank_id=bank_id)}
        assert rows['i0.png'].tags_state == 'ok'
        assert rows['i1.png'].tags_state == 'error'


def test_a_second_run_skips_tagged_rows_unless_rescan(app, client, tmp_path, monkeypatch):
    from app.models import BankImage
    bank_id, _src = _mkbank(client, tmp_path, n=1)
    _stub_tagger(monkeypatch, {'i0.png': {'shirt': 0.9}})
    with app.app_context():
        _run_tags(app, bank_id)
    _stub_tagger(monkeypatch, {'i0.png': {'hat': 0.9}})
    with app.app_context():
        _run_tags(app, bank_id)                       # no rescan -> untouched
        assert BankImage.query.filter_by(bank_id=bank_id).one().tags_text == ',shirt,'
        _run_tags(app, bank_id, rescan=True)          # rescan -> re-tagged
        assert BankImage.query.filter_by(bank_id=bank_id).one().tags_text == ',hat,'


def test_rejected_images_are_not_tagged(app, client, tmp_path, monkeypatch):
    """Tagging exists to help decide what to keep; paying for something already
    thrown away is work with no question behind it."""
    from app.extensions import db
    from app.models import BankImage
    bank_id, _src = _mkbank(client, tmp_path, n=2)
    with app.app_context():
        row = BankImage.query.filter_by(bank_id=bank_id, relpath='i1.png').one()
        row.status = 'reject'
        db.session.commit()
    _stub_tagger(monkeypatch, {'i0.png': {'shirt': 0.9}, 'i1.png': {'hat': 0.9}})
    with app.app_context():
        _run_tags(app, bank_id)
        rows = {r.relpath: r for r in BankImage.query.filter_by(bank_id=bank_id)}
        assert rows['i0.png'].tags_state == 'ok'
        assert rows['i1.png'].tags_state is None


# --- refusals -------------------------------------------------------------------

def test_a_busy_bank_says_busy_not_not_installed(app, client, tmp_path, monkeypatch):
    """The order start_framing's comment records having got wrong once: probing
    the capability first sent the user to install something while the real answer
    was 'wait, a pass is running' — and made the refusal depend on a probe that
    CI cannot satisfy."""
    from app.services import bank_jobs, image_bank_service as banks
    import app.capabilities as caps
    bank_id, _src = _mkbank(client, tmp_path, n=1)
    monkeypatch.setattr(caps, 'probe_wd14',
                        lambda: {'ok': False, 'detail': 'onnxruntime import failed'})
    monkeypatch.setattr(bank_jobs, 'running', lambda _b: True)
    monkeypatch.setattr(bank_jobs, 'get', lambda _b: {'kind': 'score'})
    with app.app_context():
        with pytest.raises(bank_jobs.BankJobBusy):
            banks.start_tags(app, LOCAL_USER, bank_id)


def test_an_uninstalled_tagger_names_what_is_missing(app, client, tmp_path, monkeypatch):
    """Two different ✗ reasons (no onnxruntime vs no model download) are fixed in
    different places, so the message has to carry which one it is."""
    from app.services import image_bank_service as banks
    import app.capabilities as caps
    bank_id, _src = _mkbank(client, tmp_path, n=1)
    monkeypatch.setattr(
        caps, 'probe_wd14',
        lambda: {'ok': False, 'detail': 'onnxruntime OK, model not downloaded (model.onnx)'})
    with app.app_context():
        with pytest.raises(RuntimeError, match='model not downloaded'):
            banks.start_tags(app, LOCAL_USER, bank_id)


def test_a_cpu_pass_is_not_refused_by_a_busy_gpu(app, client, tmp_path, monkeypatch):
    """The stock extra is CPU onnxruntime. A pass that never touches the card
    must not be blocked by it — nor hold it for an hour."""
    from app.services import image_bank_service as banks
    bank_id, _src = _mkbank(client, tmp_path, n=1)
    _stub_tagger(monkeypatch, {'i0.png': {'shirt': 0.9}})
    monkeypatch.setattr(banks, '_gpu_busy_reason',
                        lambda: 'training is running on the GPU')
    with app.app_context():
        banks.start_tags(app, LOCAL_USER, bank_id)     # no RuntimeError


def test_a_peer_queue_refuses_the_tag_step_at_launch(app, client, tmp_path, monkeypatch):
    """A peer advertises no wd14 capability, so peer_refusal would wave this
    through and the pass would die on the other side — an hour into an overnight
    queue. Refuse where the message can explain itself."""
    from app.services import image_bank_service as banks
    bank_id, _src = _mkbank(client, tmp_path, n=1)
    monkeypatch.setattr(banks, '_remote_pass_device', lambda _d: True)
    with app.app_context():
        with pytest.raises(ValueError, match='only run on this machine'):
            banks.start_pipeline(app, LOCAL_USER, bank_id,
                                 steps=['tags'], device_id='peer:1')


# --- the filter -----------------------------------------------------------------

def _tagged_bank(app, client, tmp_path, monkeypatch, mapping):
    bank_id, _src = _mkbank(client, tmp_path, n=len(mapping))
    _stub_tagger(monkeypatch, mapping)
    with app.app_context():
        _run_tags(app, bank_id)
    return bank_id


def test_the_tag_filter_matches_whole_tags_only(app, client, tmp_path, monkeypatch):
    """A substring match would quietly show the wrong images under a filter that
    reads perfectly correctly."""
    bank_id = _tagged_bank(app, client, tmp_path, monkeypatch, {
        'i0.png': {'blonde_hair': 0.9},
        'i1.png': {'blonde_hair_ribbon': 0.9},
    })
    r = client.get(f'/api/bank/{bank_id}/images?tags=blonde_hair')
    assert r.status_code == 200
    got = [i['relpath'] for i in r.get_json()['images']]
    assert got == ['i0.png']


def test_two_tag_filters_narrow_rather_than_widen(app, client, tmp_path, monkeypatch):
    """Each facet dropdown is an independent question, so they AND."""
    bank_id = _tagged_bank(app, client, tmp_path, monkeypatch, {
        'i0.png': {'blonde_hair': 0.9, 'shirt': 0.8},
        'i1.png': {'blonde_hair': 0.9},
        'i2.png': {'shirt': 0.8},
    })
    r = client.get(f'/api/bank/{bank_id}/images?tags=blonde_hair,shirt')
    got = [i['relpath'] for i in r.get_json()['images']]
    assert got == ['i0.png']


def test_an_untagged_image_matches_no_tag_filter(app, client, tmp_path, monkeypatch):
    bank_id = _tagged_bank(app, client, tmp_path, monkeypatch, {'i0.png': {'shirt': 0.8}})
    r = client.get(f'/api/bank/{bank_id}/images?tags=shirt')
    assert [i['relpath'] for i in r.get_json()['images']] == ['i0.png']


def test_search_finds_a_tag_without_any_caption(app, client, tmp_path, monkeypatch):
    """The reason tags feed the search at all: a big dump becomes searchable
    without paying for a captioning run first. And since booru writes
    `red_dress`, the two-word form a human types has to work."""
    bank_id = _tagged_bank(app, client, tmp_path, monkeypatch, {
        'i0.png': {'red_dress': 0.9},
        'i1.png': {'shirt': 0.9},
    })
    for term in ('red_dress', 'red dress'):
        r = client.get(f'/api/bank/{bank_id}/images?search={term}')
        assert [i['relpath'] for i in r.get_json()['images']] == ['i0.png'], term


def test_tag_facets_count_only_what_is_still_in_play(app, client, tmp_path, monkeypatch):
    """Rejected images are excluded: the facets exist to help decide what to
    keep, so counting the discarded pile would misdescribe it."""
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks
    bank_id = _tagged_bank(app, client, tmp_path, monkeypatch, {
        'i0.png': {'shirt': 0.9}, 'i1.png': {'shirt': 0.9}, 'i2.png': {'hat': 0.9},
    })
    with app.app_context():
        row = BankImage.query.filter_by(bank_id=bank_id, relpath='i1.png').one()
        row.status = 'reject'
        db.session.commit()
        payload = banks.tag_facets_payload(LOCAL_USER, bank_id)
    by_name = {t['name']: t['count'] for t in payload['tags']}
    assert by_name == {'shirt': 1, 'hat': 1}
    assert payload['truncated'] is False


@pytest.mark.parametrize('raw,expected', [
    ('blonde_hair', ['blonde_hair']),
    ('  Blonde_Hair , SHIRT ', ['blonde_hair', 'shirt']),
    ('a,,a', ['a']),                       # deduped, blanks dropped
    ('sneaky,tag', ['sneaky', 'tag']),
    ('', []),
    (None, []),
])
def test_tag_filter_input_is_canonicalised(raw, expected):
    from app.services.image_bank_service import _clean_tag_filter
    assert _clean_tag_filter(raw) == expected


def test_a_comma_inside_one_tag_cannot_span_two(app):
    """A comma is the SENTINEL the LIKE pattern is built from, so one arriving
    inside a name could match across two different tags. Stripped at the single
    place every caller goes through."""
    from app.services.image_bank_service import _clean_tag_filter
    assert _clean_tag_filter(['blonde_hair,shirt']) == ['blonde_hairshirt']
