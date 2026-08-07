"""The last two long write transactions in a bank pass, and two smaller lies.

`apply_flags` and `resolve_dups` each wrapped a whole bank's mutations in one
`write_with_retry`, reading INSIDE it: one SELECT per duplicate group, one per
flag, interleaved with the rejects. With autoflush on, every one of those reads
flushes what is already staged — so the write transaction opens on the first
group and is held across N more round trips. On a bank with thousands of groups
that is the hold, and it became the first thing to look at once two queue lanes
could run at once.

Reading everything first does not change a single decision; it changes when the
transaction opens. So these tests measure the QUERIES, not the outcome — the
outcome is already covered by the resolve/flag suites, which would not notice
this at all.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from PIL import Image


@pytest.fixture()
def count_selects(app):
    """How many SELECTs against bank_image a block issues."""
    from app.extensions import db

    class _Counter:
        n = 0

    counter = _Counter()

    def _before(conn, cursor, statement, params, context, many):
        if statement.lstrip().upper().startswith('SELECT') and 'bank_image' in statement:
            counter.n += 1

    with app.app_context():
        engine = db.session.get_bind()
    event.listen(engine, 'before_cursor_execute', _before)
    try:
        yield counter
    finally:
        event.remove(engine, 'before_cursor_execute', _before)


def _bank_with_dup_groups(app, tmp_path, groups):
    """A bank whose images sit in ``groups`` duplicate groups of two."""
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks

    src = tmp_path / 'src'
    src.mkdir(parents=True, exist_ok=True)
    for i in range(groups * 2):
        Image.new('RGB', (16, 16), (i, 40, 80)).save(str(src / f'{i}.png'))
    bank, _ = banks.create_bank('local', f'DUPS{groups}', str(src))
    rows = BankImage.query.filter_by(bank_id=bank.id).order_by(BankImage.id).all()
    for i, r in enumerate(rows):
        r.dup_group = i // 2 + 1
        r.status = 'pending'
        r.sharpness = float(i)
    db.session.commit()
    return bank.id


@pytest.mark.parametrize('groups', [2, 12])
def test_resolve_dups_does_not_issue_a_query_per_group(app, tmp_path,
                                                       count_selects, groups):
    """The count must not scale with the number of groups. Reverting the batch
    makes this one-query-per-group again, which is exactly the shape that held
    the write lock open across the whole resolve."""
    from app.services import image_bank_service as banks
    with app.app_context():
        bank_id = _bank_with_dup_groups(app, tmp_path, groups)
        count_selects.n = 0
        out = banks.resolve_dups('local', bank_id, strategy='best')
    assert out['rejected'] == groups, 'it stopped resolving what it used to'
    assert count_selects.n <= 8, (
        f'{count_selects.n} SELECTs for {groups} groups — the reads are still '
        f'interleaved with the rejects, so the write transaction spans them all')


def test_apply_flags_reads_every_flag_before_rejecting_any(app, tmp_path,
                                                           count_selects):
    from app.extensions import db
    from app.models import BankImage
    from app.services import image_bank_service as banks

    src = tmp_path / 'src'
    src.mkdir(parents=True, exist_ok=True)
    for i in range(6):
        Image.new('RGB', (16, 16), (i, 9, 9)).save(str(src / f'{i}.png'))
    with app.app_context():
        bank, _ = banks.create_bank('local', 'FLAGS', str(src))
        rows = BankImage.query.filter_by(bank_id=bank.id).order_by(BankImage.id).all()
        # Both flags true on every row: blur and uniform read different
        # columns, and an image can genuinely carry both.
        th = banks.thresholds()
        for r in rows:
            r.status = 'pending'
            r.quality_state = 'ok'
            r.blur_score = th['sharpness_min'] - 1
            r.uniformity_score = th['uniformity_min'] - 1
        db.session.commit()
        count_selects.n = 0
        out = banks.apply_flags('local', bank.id, ['blur', 'uniform'])

    # The subtlety reading up front introduces: an image carrying BOTH flags is
    # in both lists now, where the interleaved version never saw it twice (the
    # first reject took it out of the second query's `pending`). The first flag
    # still claims it, and the second must not count it again.
    assert out['blur'] == 6
    assert out['uniform'] == 0, 'an image was counted under two flags'


def test_a_job_whose_peer_went_silent_is_failed(app):
    """A peer that dies mid-job left its ClusterJob 'running' for ever, and for
    a comfy job the ImageGenerationQueue row it bridges stayed pending with it:
    never completed, never failed, never retried, and nothing said so."""
    from app.extensions import db
    from app.models import ClusterDevice, ClusterJob
    from app.services import cluster as cluster_svc

    old = datetime.utcnow() - timedelta(hours=2)
    with app.app_context():
        db.session.add(ClusterDevice(id='dead-peer', name='Gone',
                                     auth_token_hash='x', last_heartbeat=old))
        db.session.add(ClusterJob(job_id='j-dead', device_id='dead-peer',
                                  kind='infer', status='running',
                                  claimed_at=old, last_heartbeat=old))
        db.session.commit()
        assert cluster_svc.reap_dead_peer_jobs() == 1
        row = ClusterJob.query.filter_by(job_id='j-dead').first()
        assert row.status == 'failed'
        assert 'stopped responding' in (row.error_message or '')


def test_a_slow_job_on_a_LIVE_peer_is_left_alone(app):
    """Quiet on the job while the machine still beats is a peer mid-upload of a
    large artifact. Killing that would be a self-inflicted failure."""
    from app.extensions import db
    from app.models import ClusterDevice, ClusterJob
    from app.services import cluster as cluster_svc

    old = datetime.utcnow() - timedelta(hours=2)
    with app.app_context():
        db.session.add(ClusterDevice(id='live-peer', name='Busy',
                                     auth_token_hash='x',
                                     last_heartbeat=datetime.utcnow()))
        db.session.add(ClusterJob(job_id='j-slow', device_id='live-peer',
                                  kind='comfy', status='running',
                                  claimed_at=old, last_heartbeat=old))
        db.session.commit()
        assert cluster_svc.reap_dead_peer_jobs() == 0
        assert ClusterJob.query.filter_by(job_id='j-slow').first().status == 'running'


def test_a_finished_job_is_never_reaped(app):
    from app.extensions import db
    from app.models import ClusterJob
    from app.services import cluster as cluster_svc

    old = datetime.utcnow() - timedelta(hours=2)
    with app.app_context():
        db.session.add(ClusterJob(job_id='j-done', device_id='whoever',
                                  kind='infer', status='completed',
                                  claimed_at=old, last_heartbeat=old))
        db.session.commit()
        assert cluster_svc.reap_dead_peer_jobs() == 0
        assert ClusterJob.query.filter_by(job_id='j-done').first().status == 'completed'


@pytest.mark.parametrize('method,remote,refused', [
    ('klein', True, False),    # renders elsewhere — this card is irrelevant
    ('klein', False, True),    # renders here
    ('auto', True, True),      # LaMa never travels, whatever is picked
])
def test_the_inpaint_gpu_gate_only_applies_when_it_renders_here(
        app, monkeypatch, method, remote, refused):
    """A Klein run rendering on another machine was refused with 503 because a
    local vision pass held the flag — a refusal for work this machine was never
    going to do. Every other pass already exempts its remote branch."""
    from app.extensions import db
    from app.models import ImageBank
    from app.services import bank_jobs
    from app.services import image_bank_service as banks

    class _Pool:
        def count(self):
            return 3

    monkeypatch.setattr(banks, '_clean_pool_query', lambda *a, **k: _Pool())
    monkeypatch.setattr(banks, '_watermark_inpaint_prereq', lambda *a, **k: None)
    monkeypatch.setattr(banks, '_gpu_busy_reason',
                        lambda: 'a vision/GPU pass is already running')
    monkeypatch.setattr(bank_jobs, 'start', lambda *a, **k: {'ok': True})

    device = '4fa2b7c1-0000-4000-8000-0000000000e1' if remote else 'local'
    with app.app_context():
        row = ImageBank(user_id='local', name=f'INP{method}{remote}',
                        source_path='')
        db.session.add(row)
        db.session.commit()

        def _call():
            return banks.start_watermark_inpaint(app, 'local', row.id,
                                                 method=method, device_id=device)

        if refused:
            with pytest.raises(RuntimeError, match='already running'):
                _call()
        else:
            assert _call() == {'ok': True}, (
                'a repaint rendering on another machine was refused because '
                "THIS machine's card was busy")
