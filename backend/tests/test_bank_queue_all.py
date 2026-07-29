"""🗃️ Queue ALL banks — twelve entries, not twelve concurrent runs.

The queue engine is untouched: enqueue_many loops the existing enqueue(), and
_process_next still starts one bank only once the previous is done and the GPU is
free. What is new is the batch's own honesty — the step list is sanitized BEFORE
anything is enqueued (a half-queued 400 is the worst outcome available, because
the user cannot tell which banks made it in), and a bank already in the queue is
skipped by name rather than sinking the request.
"""
import pytest
from PIL import Image


@pytest.fixture(autouse=True)
def _clean_queue():
    from app.services import bank_jobs, bank_queue
    bank_queue.reset()
    bank_jobs.reset()
    yield
    bank_queue.reset()
    bank_jobs.reset()


def _freeze_worker(monkeypatch):
    """Stop the drain from consuming entries, so enqueue just records them —
    the same idiom test_bank_queue.py uses for its bookkeeping cases. Patching
    bank_jobs.running instead would spin _process_next forever: under TESTING
    the drain runs inline and waits for the bank to go idle."""
    from app.services import bank_queue
    monkeypatch.setattr(bank_queue, '_process_next', lambda _app: False)


def _bank(tmp_path, name, n=2):
    from app.services import image_bank_service as banks
    src = tmp_path / name
    src.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        Image.new('RGB', (32, 32), (i * 20, 90, 160)).save(str(src / f'{i}.jpg'))
    bank, _added = banks.create_bank('local', name, str(src))
    return bank.id


# --- eligibility --------------------------------------------------------------

def test_only_banks_with_undecided_images_are_eligible(app, tmp_path):
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks

    with app.app_context():
        a = _bank(tmp_path, 'a')
        b = _bank(tmp_path, 'b')
        # Fully triage b — every image decided, so a pipeline has nothing to do.
        for row in BankImage.query.filter_by(bank_id=b).all():
            row.status = 'keep'
        db.session.commit()
        assert banks.banks_needing_triage('local') == [a]


def test_an_empty_bank_is_not_eligible(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        empty = tmp_path / 'empty'
        empty.mkdir()
        bank, _n = banks.create_bank('local', 'empty', str(empty))
        assert bank.id not in banks.banks_needing_triage('local')


def test_another_users_banks_are_never_included(app, tmp_path):
    from app.extensions import db
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    with app.app_context():
        mine = _bank(tmp_path, 'mine')
        theirs = _bank(tmp_path, 'theirs')
        db.session.get(ImageBank, theirs).user_id = 'someone-else'
        db.session.commit()
        assert banks.banks_needing_triage('local') == [mine]


# --- enqueue_many -------------------------------------------------------------

def test_a_bad_step_list_raises_before_anything_is_queued(app, tmp_path,
                                                         monkeypatch):
    """The rule that matters most: a half-queued 400 leaves the user unable to
    tell which banks made it in."""
    from app.services import bank_queue

    _freeze_worker(monkeypatch)
    with app.app_context():
        a, b = _bank(tmp_path, 'a'), _bank(tmp_path, 'b')
        with pytest.raises(ValueError, match='no pipeline steps'):
            bank_queue.enqueue_many(app, 'local', [a, b], steps=['nonsense'])
        assert bank_queue.snapshot()['items'] == []


def test_an_already_queued_bank_is_skipped_by_name_not_a_failure(app, tmp_path,
                                                                monkeypatch):
    from app.services import bank_queue

    _freeze_worker(monkeypatch)
    with app.app_context():
        a, b = _bank(tmp_path, 'a'), _bank(tmp_path, 'b')
        bank_queue.enqueue(app, 'local', a, steps=['scan'])
        out = bank_queue.enqueue_many(app, 'local', [a, b], steps=['scan'])
        assert [q['bank_id'] for q in out['queued']] == [b]
        assert out['skipped'] == [{'bank_id': a, 'reason': 'already queued'}]


def test_queueing_several_banks_makes_several_ENTRIES_not_several_runs(
        app, tmp_path, monkeypatch):
    from app.services import bank_queue

    _freeze_worker(monkeypatch)
    with app.app_context():
        ids = [_bank(tmp_path, n) for n in ('a', 'b', 'c')]
        out = bank_queue.enqueue_many(app, 'local', ids, steps=['scan'])
        assert [q['position'] for q in out['queued']] == [1, 2, 3]
        snap = bank_queue.snapshot()
        assert len(snap['items']) == 3
        assert snap['running_bank_id'] is None, \
            'three entries, not three runs — the worker gate is untouched'


# --- the route ----------------------------------------------------------------

def test_the_route_reports_the_servers_own_counts(app, client, tmp_path,
                                                  monkeypatch):
    _freeze_worker(monkeypatch)
    with app.app_context():
        _bank(tmp_path, 'a')
        _bank(tmp_path, 'b')
    r = client.post('/api/bank-queue/all', json={'steps': ['scan']})
    assert r.status_code == 202
    body = r.get_json()
    assert body['eligible'] == 2
    assert len(body['queued']) == 2 and body['skipped'] == []


def test_nothing_eligible_is_still_202_because_nothing_was_refused(app, client):
    r = client.post('/api/bank-queue/all', json={'steps': ['scan']})
    assert r.status_code == 202
    assert r.get_json() == {'ok': True, 'eligible': 0, 'queued': [], 'skipped': []}


def test_an_empty_step_list_is_a_400_and_queues_nothing(app, client, tmp_path,
                                                       monkeypatch):
    from app.services import bank_queue

    _freeze_worker(monkeypatch)
    with app.app_context():
        _bank(tmp_path, 'a')
    r = client.post('/api/bank-queue/all', json={'steps': []})
    assert r.status_code == 400
    with app.app_context():
        assert bank_queue.snapshot()['items'] == []


# --- the verdict data the list now carries ------------------------------------

def test_the_bank_list_carries_the_last_pipelines_step_outcomes(app, tmp_path):
    """Without this the card cannot tell a run where every GPU pass was skipped
    from a clean one — and queue-all is exactly when nobody is watching."""
    import json

    from app.extensions import db
    from app.models import ImageBank
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id = _bank(tmp_path, 'a')
        db.session.get(ImageBank, bank_id).pipeline_report = json.dumps({
            'cancelled': False,
            'counts': {'total': 2},
            'steps': [{'step': 'scan', 'status': 'done', 'reason': None,
                       'detail': None, 'counts': {}},
                      {'step': 'score', 'status': 'skipped',
                       'reason': 'GPU busy — training is running',
                       'detail': None, 'counts': {}}],
        })
        db.session.commit()
        row = next(b for b in banks.list_banks('local') if b['id'] == bank_id)
        report = row['pipeline_report']
        assert [s['status'] for s in report['steps']] == ['done', 'skipped']
        assert 'GPU busy' in report['steps'][1]['reason']
        # The list gets a verdict, not a transcript.
        assert set(report) == {'cancelled', 'steps'}
        assert set(report['steps'][0]) == {'step', 'status', 'reason'}


def test_a_bank_that_never_ran_a_pipeline_reports_nothing(app, tmp_path):
    from app.services import image_bank_service as banks

    with app.app_context():
        bank_id = _bank(tmp_path, 'a')
        row = next(b for b in banks.list_banks('local') if b['id'] == bank_id)
        assert row['pipeline_report'] is None, \
            'no run means no verdict — never a green tick on nothing'
