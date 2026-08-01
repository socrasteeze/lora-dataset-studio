"""Queue only what is missing.

Two failures this replaces. "Queue all banks" queued the same step list at every
bank regardless of what had already run — so re-running a caption pass that
finished last night looked like progress for hours. And its eligibility rule was
"has undecided images", which made a FULLY TRIAGED bank invisible: exactly the
bank worth re-targeting, because triage says nothing about whether it ever had a
face pass.
"""
from __future__ import annotations

import pytest
from PIL import Image


def _bank(app, tmp_path, name, rows):
    """A bank whose images carry the pass markers given in `rows`."""
    from app.extensions import db
    from app.models import BankImage, ImageBank

    folder = tmp_path / name
    folder.mkdir(parents=True, exist_ok=True)
    bank = ImageBank(user_id='local', name=name, source_path=str(folder))
    db.session.add(bank)
    db.session.flush()
    for i, marks in enumerate(rows):
        p = folder / f'{i}.jpg'
        Image.new('RGB', (8, 8)).save(str(p))
        db.session.add(BankImage(bank_id=bank.id, relpath=f'{i}.jpg',
                                 status=marks.pop('status', 'new'), **marks))
    db.session.commit()
    return bank.id


def test_coverage_counts_pending_and_done_per_pass(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id = _bank(app, tmp_path, 'cov', [
            {'face_state': 'scorable', 'caption': 'a cat'},
            {'face_state': None, 'caption': ''},
            {'face_state': 'no_face', 'caption': None},
        ])
        cov = banks.bank_pass_coverage('local', [bank_id])[bank_id]

    # 'no_face' means the pass RAN and found nothing — done, not pending.
    assert cov['faces'] == {'pending': 1, 'done': 2, 'complete': False}
    assert cov['caption'] == {'pending': 2, 'done': 1, 'complete': False}
    assert cov['framing']['pending'] == 3, 'nothing has been framed'


def test_a_finished_pass_reads_complete(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id = _bank(app, tmp_path, 'done', [
            {'face_state': 'scorable'}, {'face_state': 'no_face'}])
        cov = banks.bank_pass_coverage('local', [bank_id])[bank_id]

    assert cov['faces']['complete'] is True
    assert cov['faces']['pending'] == 0


def test_rejected_images_do_not_keep_a_pass_pending(app, tmp_path):
    """Every pass skips rejects, so counting them would make a finished bank
    look permanently unfinished and re-queue it forever."""
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id = _bank(app, tmp_path, 'rej', [
            {'face_state': 'scorable'},
            {'status': 'reject', 'face_state': None},
        ])
        cov = banks.bank_pass_coverage('local', [bank_id])[bank_id]

    assert cov['faces']['complete'] is True


def test_the_steps_with_no_marker_are_never_called_done(app, tmp_path):
    """auto_reject is cheap and DB-only; semantic_dedup is bank-global and there
    is no cheap per-image "pending" for it. Guessing either would silently skip
    real work, so both stay pending on purpose."""
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id = _bank(app, tmp_path, 'always', [{'face_state': 'scorable'}])
        cov = banks.bank_pass_coverage('local', [bank_id])[bank_id]

    for step in ('auto_reject', 'semantic_dedup'):
        assert cov[step]['complete'] is False
        assert cov[step]['pending'] == 1


def test_a_fully_triaged_bank_that_never_had_a_face_pass_is_eligible(
        app, tmp_path):
    """The headline eligibility bug: every image decided, so the old rule said
    "nothing to do" — while the face pass had never run at all."""
    from app.services import image_bank_service as banks

    with app.app_context():
        triaged = _bank(app, tmp_path, 'triaged', [
            {'status': 'keep', 'face_state': None},
            {'status': 'reject', 'face_state': None},
        ])
        assert triaged not in banks.banks_needing_triage('local'), \
            'this bank is invisible to the OLD rule — that is the bug'
        assert triaged in banks.banks_needing_work('local', ['faces'])


def test_a_bank_with_that_pass_already_done_is_not_eligible(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        done = _bank(app, tmp_path, 'faced', [{'face_state': 'scorable'}])

        assert banks.banks_needing_work('local', ['faces']) == []
        assert done in banks.banks_needing_work('local', ['caption'])


def test_queue_all_narrows_each_banks_steps_to_what_is_missing(app, tmp_path,
                                                               monkeypatch):
    from app.services import bank_queue
    from app.services import image_bank_service as banks

    seen = {}
    monkeypatch.setattr(bank_queue, 'enqueue',
                        lambda app_, uid, bid, **kw: seen.setdefault(bid, kw['steps']) and 1)

    with app.app_context():
        # captioned but never framed; framed but never captioned
        a = _bank(app, tmp_path, 'a', [{'caption': 'x', 'framing': None}])
        b = _bank(app, tmp_path, 'b', [{'caption': None, 'framing': 'face'}])
        out = bank_queue.enqueue_many(app, 'local', [a, b],
                                      steps=['caption', 'framing'])

    assert seen[a] == ['framing'], 'a captioned bank was re-captioned'
    assert seen[b] == ['caption'], 'a framed bank was re-framed'
    assert out['skipped'] == []


def test_a_bank_with_nothing_left_is_skipped_by_name(app, tmp_path, monkeypatch):
    from app.services import bank_queue

    monkeypatch.setattr(bank_queue, 'enqueue',
                        lambda *a, **k: pytest.fail('queued a bank with no work'))

    with app.app_context():
        bank_id = _bank(app, tmp_path, 'nothing', [{'caption': 'done'}])
        out = bank_queue.enqueue_many(app, 'local', [bank_id], steps=['caption'])

    assert out['queued'] == []
    assert out['skipped'] == [{'bank_id': bank_id,
                               'reason': 'all selected passes already done'}]


def test_skip_completed_off_still_queues_everything(app, tmp_path, monkeypatch):
    """The narrowing is a default, not a rule — a deliberate re-run must stay
    possible without hunting for what the DB thinks is already done."""
    from app.services import bank_queue

    seen = {}
    monkeypatch.setattr(bank_queue, 'enqueue',
                        lambda app_, uid, bid, **kw: seen.setdefault(bid, kw['steps']) and 1)

    with app.app_context():
        bank_id = _bank(app, tmp_path, 'redo', [{'caption': 'done'}])
        bank_queue.enqueue_many(app, 'local', [bank_id], steps=['caption'],
                                skip_completed=False)

    assert seen[bank_id] == ['caption']


def test_an_unknown_step_is_kept_rather_than_silently_dropped(app, tmp_path):
    """A pass with no coverage entry is one we cannot answer for. Dropping it
    would be the queue quietly doing less than it was asked."""
    from app.services import image_bank_service as banks

    kept = banks.steps_with_pending_work({'caption': {'pending': 0}},
                                         ['caption', 'brand_new_pass'])

    assert kept == ['brand_new_pass']


def test_the_queue_all_ROUTE_uses_the_new_eligibility(app, client, tmp_path,
                                                      monkeypatch):
    """Through the HTTP route, not the service. The first version of this file
    tested the service only, so reverting the route's eligibility to the old
    rule broke nothing — the change had no coverage at all."""
    from app.services import bank_queue

    queued = []
    monkeypatch.setattr(bank_queue, 'enqueue',
                        lambda app_, uid, bid, **kw: queued.append(bid) or 1)

    with app.app_context():
        triaged = _bank(app, tmp_path, 'route', [
            {'status': 'keep', 'face_state': None},
            {'status': 'reject', 'face_state': None},
        ])

    r = client.post('/api/bank-queue/all', json={'steps': ['faces']})

    assert r.status_code == 202
    assert queued == [triaged], \
        'a fully triaged bank that never had a face pass was not queued'
    assert r.get_json()['eligible'] == 1


def test_the_route_honours_an_explicit_re_run(app, client, tmp_path, monkeypatch):
    """The dialog's "skip passes a bank has already had" must actually reach the
    queue. A checkbox that changes nothing is worse than no checkbox."""
    from app.services import bank_queue

    seen = {}
    monkeypatch.setattr(bank_queue, 'enqueue',
                        lambda app_, uid, bid, **kw: seen.setdefault(bid, kw['steps']) and 1)

    with app.app_context():
        bank_id = _bank(app, tmp_path, 'rerun', [{'caption': 'already done'}])

    r = client.post('/api/bank-queue/all',
                    json={'steps': ['caption'], 'skip_completed': False})

    assert r.status_code == 202
    assert seen.get(bank_id) == ['caption'], 'the re-run was narrowed away'


def test_omitting_the_flag_still_narrows(app, client, tmp_path, monkeypatch):
    """An older tab that does not send the field must not silently re-run every
    finished pass — the default has to be ON at the route, not just in the UI."""
    from app.services import bank_queue

    monkeypatch.setattr(bank_queue, 'enqueue',
                        lambda *a, **k: pytest.fail('re-queued a finished pass'))

    with app.app_context():
        _bank(app, tmp_path, 'older-tab', [{'caption': 'already done'}])

    r = client.post('/api/bank-queue/all', json={'steps': ['caption']})

    assert r.status_code == 202
    assert r.get_json()['queued'] == []
