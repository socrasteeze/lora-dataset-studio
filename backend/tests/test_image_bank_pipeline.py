"""🗃️ Image bank — the "Launch all" chained triage pipeline.

The pipeline chains the EXISTING passes; here we exercise the ORCHESTRATION
(order, auto-reject params, per-step skip-with-reason, cancel, the persisted
report, and the "heavy passes only touch survivors" guarantee) with the heavy
ML passes mocked — no torch, no Ollama. Background jobs run inline under TESTING
(see bank_jobs.start), so a POST /pipeline runs the whole chain synchronously.
"""
import os

from PIL import Image


# --- factories (mirror test_image_bank_scoring) ------------------------------
def _save(path, im):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if path.lower().endswith(('.jpg', '.jpeg')):
        im.save(path, 'JPEG', quality=92)
    else:
        im.save(path)


def _flat(size=128, value=128):
    return Image.new('RGB', (size, size), (value, value, value))


def _photo(size=256):
    im = Image.new('L', (size, size))
    c, r2 = size / 2, (size / 3) ** 2
    im.putdata([min(255, int(150 * x / size + 50 * y / size)
                    + (80 if (x - c) ** 2 + (y - c) ** 2 < r2 else 0))
                for y in range(size) for x in range(size)])
    return im.convert('RGB')


def _mkbank(client, tmp_path, files, name='B'):
    src = tmp_path / 'src'
    for rel, im in files.items():
        _save(str(src / rel), im)
    r = client.post('/api/bank/create', json={'name': name, 'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id'], src


def _fake_pass(log, name, *, mutate=None):
    """A stand-in for one of the heavy _X_job factories: records that it ran (and
    the SURVIVOR count it would see) instead of touching torch/Ollama."""
    def factory(*_a, **_k):
        def run(job):
            from app.models import BankImage
            survivors = (BankImage.query.filter(BankImage.status != 'reject').count())
            log.append((name, survivors))
            if mutate:
                mutate()
        return run
    return factory


def _report(client, bank_id):
    return client.get(f'/api/bank/{bank_id}').get_json().get('pipeline_report')


# --- order + report ----------------------------------------------------------
def test_pipeline_runs_every_step_in_canonical_order(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as svc
    log = []
    # Heavy passes mocked; scan + auto_reject run for real (pure PIL / SQL).
    monkeypatch.setattr(svc, '_score_prereq', lambda: None)
    monkeypatch.setattr(svc, '_watermark_prereq', lambda: None)
    monkeypatch.setattr(svc, '_faces_prereq', lambda: None)
    monkeypatch.setattr(svc, '_framing_prereq', lambda: None)
    monkeypatch.setattr(svc, '_caption_prereq', lambda: None)
    monkeypatch.setattr(svc, '_tags_prereq', lambda: None)
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr(svc, '_score_job', _fake_pass(log, 'score'))
    monkeypatch.setattr(svc, '_watermark_job', _fake_pass(log, 'watermark'))
    monkeypatch.setattr(svc, '_faces_job', _fake_pass(log, 'faces'))
    monkeypatch.setattr(svc, '_framing_job', _fake_pass(log, 'framing'))
    monkeypatch.setattr(svc, '_caption_job', _fake_pass(log, 'caption'))
    monkeypatch.setattr(svc, '_tags_job', _fake_pass(log, 'tags'))
    # semantic_dedup reads the ✨ Score embedding cache (mocked away here) — stand
    # it in so the step runs to 'done' like the other mocked passes.
    monkeypatch.setattr(svc, 'rebuild_semantic_dup_groups',
                        lambda *_a, **_k: (log.append(('semantic_dedup', 0)) or 0))

    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': _photo(), 'b.jpg': _flat()})
    r = client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': list(svc.PIPELINE_STEPS), 'reject_flags': [], 'resolve_dups': False})
    assert r.status_code == 202, r.get_json()

    assert [name for name, _ in log] == ['score', 'semantic_dedup', 'watermark',
                                         'faces', 'framing', 'tags', 'caption']
    report = _report(client, bank_id)
    assert report is not None
    assert [s['step'] for s in report['steps']] == list(svc.PIPELINE_STEPS)
    assert all(s['status'] == 'done' for s in report['steps']), report['steps']
    assert report['cancelled'] is False
    assert report['counts']['total'] == 2


# --- auto-reject params ------------------------------------------------------
def test_pipeline_auto_reject_honors_flags_and_dedup(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as svc
    # Two identical flat images (a duplicate pair) + one photo. 'uniform' flags
    # the flats; dedup would also target the pair.
    bank_id, _src = _mkbank(client, tmp_path, {
        'flat1.jpg': _flat(value=128), 'flat2.jpg': _flat(value=128),
        'photo.jpg': _photo()})
    r = client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'auto_reject'],
        'reject_flags': ['uniform'], 'resolve_dups': True})
    assert r.status_code == 202, r.get_json()

    report = _report(client, bank_id)
    steps = {s['step']: s for s in report['steps']}
    assert steps['scan']['status'] == 'done'
    ar = steps['auto_reject']
    assert ar['status'] == 'done'
    # The flats are uniform → rejected; nothing is deleted from disk.
    assert ar['counts']['rejected'] >= 2
    assert (_src / 'flat1.jpg').is_file()
    with client.application.app_context():
        from app.models import BankImage
        rej = BankImage.query.filter_by(bank_id=bank_id, status='reject').count()
        assert rej >= 2


def test_pipeline_never_bulk_rejects_on_a_non_verdict_flag():
    """soft_detail and bars measure PROVENANCE, not quality: a crisp watermark
    rescues an enlargement's detail ratio, a motion-blurred native shot sinks it,
    and `bars` fires on dark-themed screenshots. Their own documentation says to
    check before mass-rejecting — which unattended overnight auto-reject cannot
    do, and it runs FIRST, so anything it drops never reaches the later passes.
    They stay available on the standalone (attended, undoable) button."""
    from app.services import image_bank_service as svc
    assert 'soft_detail' in svc._QUALITY_FLAGS and 'bars' in svc._QUALITY_FLAGS
    assert 'soft_detail' not in svc.PIPELINE_REJECT_FLAGS
    assert 'bars' not in svc.PIPELINE_REJECT_FLAGS
    # Everything else the CPU scan produces is still offered.
    assert set(svc.PIPELINE_REJECT_FLAGS) == {'blur', 'noise', 'uniform', 'small',
                                              'unreadable'}


def test_pipeline_drops_a_non_verdict_flag_sent_by_an_old_client(client, tmp_path):
    """A client (or a saved preset) that still asks for soft_detail must not be
    refused — it is simply ignored, like any unknown flag."""
    bank_id, _src = _mkbank(client, tmp_path, {'flat.jpg': _flat()})
    r = client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'auto_reject'],
        'reject_flags': ['soft_detail', 'bars', 'uniform'], 'resolve_dups': False})
    assert r.status_code == 202, r.get_json()
    report = _report(client, bank_id)
    ar = {s['step']: s for s in report['steps']}['auto_reject']
    assert ar['status'] == 'done'


def test_pipeline_auto_reject_skips_flags_when_not_requested(client, tmp_path):
    bank_id, _src = _mkbank(client, tmp_path, {'flat.jpg': _flat()})
    client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'auto_reject'], 'reject_flags': [], 'resolve_dups': False})
    report = _report(client, bank_id)
    ar = next(s for s in report['steps'] if s['step'] == 'auto_reject')
    assert ar['counts']['rejected'] == 0


# --- graceful skip -----------------------------------------------------------
def test_pipeline_skips_step_with_reason_when_prereq_absent(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as svc
    log = []
    monkeypatch.setattr(svc, '_score_prereq', lambda: 'bank scoring extra not installed')
    monkeypatch.setattr(svc, '_caption_prereq', lambda: None)
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr(svc, '_score_job', _fake_pass(log, 'score'))
    monkeypatch.setattr(svc, '_caption_job', _fake_pass(log, 'caption'))

    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': _photo()})
    r = client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'score', 'caption'], 'reject_flags': [], 'resolve_dups': False})
    assert r.status_code == 202

    report = _report(client, bank_id)
    steps = {s['step']: s for s in report['steps']}
    assert steps['score']['status'] == 'skipped'
    assert 'bank scoring' in steps['score']['reason']
    # The pipeline CONTINUES past a skipped step.
    assert steps['scan']['status'] == 'done'
    assert steps['caption']['status'] == 'done'
    assert 'score' not in [n for n, _ in log]        # never ran
    assert 'caption' in [n for n, _ in log]


def test_pipeline_skips_gpu_step_when_gpu_busy(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as svc
    log = []
    monkeypatch.setattr(svc, '_score_prereq', lambda: None)
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: 'training is running on the GPU')
    monkeypatch.setattr(svc, '_score_job', _fake_pass(log, 'score'))

    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': _photo()})
    client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'score'], 'reject_flags': [], 'resolve_dups': False})
    report = _report(client, bank_id)
    score = next(s for s in report['steps'] if s['step'] == 'score')
    assert score['status'] == 'skipped'
    assert 'GPU' in score['reason'] or 'training' in score['reason']
    assert log == []
    # The verdict the bank card reads. Without it the card had to guess from
    # prose, and BLOCKED_RE matched only the MID-flight "GPU busy — …" text —
    # so a night where every GPU pass was skipped for a busy card rendered a
    # clean tick, which is the whole failure the badge exists to expose.
    assert score['blocked'] is True


def test_a_step_that_declines_ITSELF_is_not_marked_blocked(client, tmp_path,
                                                           monkeypatch):
    """The distinction the badge is built on: "install the extra" is the
    pipeline working as designed; "the card is busy" means the night did less
    than it looked like. Only the second earns a badge."""
    from app.services import image_bank_service as svc
    log = []
    monkeypatch.setattr(svc, '_score_prereq', lambda: 'bank scoring extra not installed')
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr(svc, '_score_job', _fake_pass(log, 'score'))

    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': _photo()})
    client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'score'], 'reject_flags': [], 'resolve_dups': False})
    score = next(s for s in _report(client, bank_id)['steps'] if s['step'] == 'score')
    assert score['status'] == 'skipped'
    assert score['blocked'] is False


def test_a_step_the_run_never_reached_is_blocked_but_a_user_cancel_is_not(
        client, tmp_path, monkeypatch):
    """Stopping a run is a decision, not a fault — badging someone for their own
    Stop is nagging. A run that stopped short for any OTHER reason is not."""
    from app.services import bank_jobs
    from app.services import image_bank_service as svc
    monkeypatch.setattr(svc, '_score_prereq', lambda: None)
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: None)

    def _cancel_midway(bank_id_, *a, **k):
        def run(job):
            bank_jobs.cancel(bank_id_)
        return run

    monkeypatch.setattr(svc, '_score_job', _cancel_midway)
    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': _photo()})
    client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'score', 'caption'], 'reject_flags': [],
        'resolve_dups': False})
    report = _report(client, bank_id)
    assert report['cancelled'] is True
    cap = next(s for s in report['steps'] if s['step'] == 'caption')
    assert cap['status'] == 'cancelled'
    assert cap['blocked'] is False


# --- survivors only ----------------------------------------------------------
def test_pipeline_heavy_passes_only_see_survivors(client, tmp_path, monkeypatch):
    """auto-reject runs BEFORE the heavy passes, so by the time score/faces run
    the rejected images are already out — the costly work never pays for them."""
    from app.services import image_bank_service as svc
    log = []
    monkeypatch.setattr(svc, '_score_prereq', lambda: None)
    monkeypatch.setattr(svc, '_faces_prereq', lambda: None)
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr(svc, '_score_job', _fake_pass(log, 'score'))
    monkeypatch.setattr(svc, '_faces_job', _fake_pass(log, 'faces'))

    # 3 flats (uniform → rejected) + 2 photos (survive).
    files = {f'flat{i}.jpg': _flat(value=100 + i) for i in range(3)}
    files.update({'p1.jpg': _photo(), 'p2.jpg': _photo(300)})
    bank_id, _src = _mkbank(client, tmp_path, files)
    client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'auto_reject', 'score', 'faces'],
        'reject_flags': ['uniform'], 'resolve_dups': False})

    # Every heavy pass saw only the survivors (< the 5 total).
    assert log, 'heavy passes ran'
    for name, survivors in log:
        assert survivors <= 2, f'{name} saw {survivors} rows — should skip rejects'


# --- cancel ------------------------------------------------------------------
def test_pipeline_cancel_midway_records_remaining_as_cancelled(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as svc
    from app.services import bank_jobs
    log = []

    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': _photo()})

    # Cancel this bank's live job from inside the score pass.
    def score_factory(*_a, **_k):
        def run(job):
            log.append('score')
            bank_jobs.cancel(bank_id)
        return run

    monkeypatch.setattr(svc, '_score_prereq', lambda: None)
    monkeypatch.setattr(svc, '_watermark_prereq', lambda: None)
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr(svc, '_score_job', score_factory)
    monkeypatch.setattr(svc, '_watermark_job', _fake_pass(log, 'watermark'))

    client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'score', 'watermark'], 'reject_flags': [], 'resolve_dups': False})

    assert 'watermark' not in log                    # never reached after cancel
    report = _report(client, bank_id)
    assert report['cancelled'] is True
    steps = {s['step']: s for s in report['steps']}
    assert steps['scan']['status'] == 'done'
    assert steps['score']['status'] == 'done'        # it executed, then cancelled
    assert steps['watermark']['status'] == 'cancelled'


# --- validation --------------------------------------------------------------
def test_pipeline_empty_steps_is_400(client, tmp_path):
    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': _photo()})
    r = client.post(f'/api/bank/{bank_id}/pipeline', json={'steps': []})
    assert r.status_code == 400


def test_pipeline_unknown_bank_is_400(client):
    r = client.post('/api/bank/999999/pipeline', json={'steps': ['scan']})
    assert r.status_code == 400


def test_a_caption_pass_that_refused_itself_is_not_reported_as_done(
        client, tmp_path, monkeypatch):
    """_caption_job refuses with bank_jobs.fail and a plain RETURN, never an
    exception — right for the standalone button, but inside the pipeline the
    step then fell through to 'done'. A pass that never happened, reported as
    having run, on a bank whose card therefore showed a clean tick.

    Reached here the way it happens for real: a peer picked, which skips the
    local gates, and the peer turns out to have no captioner.
    """
    import json

    from app.extensions import db
    from app.models import ClusterDevice
    from app.services import image_bank_service as svc

    peer = '4fa2b7c1-0000-4000-8000-0000000000c1'
    monkeypatch.setattr(svc, '_caption_prereq',
                        lambda: 'no caption engine is ready')
    monkeypatch.setattr(svc, '_gpu_busy_reason', lambda: None)

    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': _photo()})
    with client.application.app_context():
        db.session.add(ClusterDevice(id=peer, name='Spare box',
                                     auth_token_hash='x',
                                     capabilities=json.dumps(
                                         {'joycaption': False, 'ollama': False})))
        db.session.commit()
    # The peer reports it cannot caption at all, so the run is refused before it
    # starts — the honest outcome, and the one the dialog now prevents.
    r = client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'caption'], 'device_id': peer})
    assert r.status_code == 400, r.get_json()

    # Now the case that still reaches the fallback: the peer has not reported
    # what it can do, so nothing refuses it up front — and it cannot caption.
    with client.application.app_context():
        ClusterDevice.query.filter_by(id=peer).update({'capabilities': '{}'})
        db.session.commit()
    r = client.post(f'/api/bank/{bank_id}/pipeline', json={
        'steps': ['scan', 'caption'], 'device_id': peer})
    assert r.status_code == 202, r.get_json()
    cap = next(s for s in _report(client, bank_id)['steps'] if s['step'] == 'caption')
    assert cap['status'] == 'skipped', 'a pass that never ran was reported done'
    assert cap['blocked'] is True
    assert 'captioner' in (cap['reason'] or '')
