"""Bank captioning has to be honest about what it is doing.

Reported from a real run: the panel sat at `0 / 307` for six minutes and the
user pressed Stop — on a pass that was working perfectly. Their log:

    joycaption[sub]: [joycaption] 89/307 ok (511 chars)
    joycaption: batch stopped (89/307 captioned, elapsed=384.0s)

89 images in 384 s is a healthy batch. Nothing reported it, because
`caption_paths` called JoyCaption with no progress hook and only emitted the
captions AFTER the whole batch returned — so `done` could not move even in
principle. These tests pin that, and the four silent-failure paths found while
tracing it.
"""
from __future__ import annotations

import json

from PIL import Image


def _bank(tmp_path, n=3, name='Dump'):
    from app.services import image_bank_service as banks
    src = tmp_path / name
    src.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        Image.new('RGB', (32, 32), (10 * i, 90, 160)).save(str(src / f'a{i}.jpg'))
    bank, _added = banks.create_bank('local', name, str(src))
    return bank


# ── the reported bug: progress during the batch, not after it ─────────────

def test_joycaption_reports_each_caption_as_it_lands(app, tmp_path, monkeypatch):
    """The fix. Without it a 300-image batch reported nothing for ~22 minutes."""
    from app.services import joycaption

    paths = []
    for i in range(3):
        f = tmp_path / f'i{i}.jpg'
        Image.new('RGB', (8, 8)).save(str(f))
        paths.append(str(f))

    # A fake child that emits one JSON line per image, like the real script.
    class _Proc:
        returncode = 0

        def __init__(self):
            self.stdin = type('S', (), {'write': lambda s, d: None,
                                        'close': lambda s: None})()
            self.stdout = iter([json.dumps({'path': p, 'caption': f'cap {i}'}) + '\n'
                                for i, p in enumerate(paths)])
            self.stderr = iter([])
            self._polls = 0

        def poll(self):
            # Alive for a couple of ticks so the caller's pump loop runs while
            # the "child" is still going — the whole point of the change.
            self._polls += 1
            return None if self._polls < 3 else 0

        def wait(self, timeout=None):
            return 0

        def kill(self):
            pass

    monkeypatch.setattr(joycaption.subprocess, 'Popen', lambda *a, **k: _Proc())
    monkeypatch.setattr(joycaption, 'is_available', lambda: True)
    monkeypatch.setattr(joycaption.cfg, 'aitoolkit_path', lambda k: 'x')

    landed, ticks = [], []
    out = joycaption.caption_images_joycaption(
        paths, on_caption=lambda p, c: landed.append((p, c)),
        progress=lambda d, t: ticks.append((d, t)))

    assert len(out) == 3
    assert [c for _p, c in landed] == ['cap 0', 'cap 1', 'cap 2']
    # Counted up, not delivered as one lump at the end.
    assert ticks == [(1, 3), (2, 3), (3, 3)], ticks


def test_callbacks_run_on_the_caller_thread_not_the_reader(app, tmp_path,
                                                           monkeypatch):
    """The bank's handler commits to the DB, which needs the app context the
    CALLER holds. Firing it on the stdout reader would crash on a real run."""
    import threading
    from app.services import joycaption

    f = tmp_path / 'a.jpg'
    Image.new('RGB', (8, 8)).save(str(f))
    caller = threading.get_ident()
    seen = {}

    class _Proc:
        returncode = 0

        def __init__(self):
            self.stdin = type('S', (), {'write': lambda s, d: None,
                                        'close': lambda s: None})()
            self.stdout = iter([json.dumps({'path': str(f), 'caption': 'c'}) + '\n'])
            self.stderr = iter([])
            self._n = 0

        def poll(self):
            self._n += 1
            return None if self._n < 3 else 0

        def wait(self, timeout=None):
            return 0

        def kill(self):
            pass

    monkeypatch.setattr(joycaption.subprocess, 'Popen', lambda *a, **k: _Proc())
    monkeypatch.setattr(joycaption, 'is_available', lambda: True)
    monkeypatch.setattr(joycaption.cfg, 'aitoolkit_path', lambda k: 'x')

    joycaption.caption_images_joycaption(
        [str(f)], on_caption=lambda p, c: seen.update(tid=threading.get_ident()))
    assert seen['tid'] == caller


def test_a_failing_callback_never_kills_the_batch(app, tmp_path, monkeypatch):
    from app.services import joycaption

    f = tmp_path / 'a.jpg'
    Image.new('RGB', (8, 8)).save(str(f))

    class _Proc:
        returncode = 0

        def __init__(self):
            self.stdin = type('S', (), {'write': lambda s, d: None,
                                        'close': lambda s: None})()
            self.stdout = iter([json.dumps({'path': str(f), 'caption': 'c'}) + '\n'])
            self.stderr = iter([])
            self._n = 0

        def poll(self):
            self._n += 1
            return None if self._n < 3 else 0

        def wait(self, timeout=None):
            return 0

        def kill(self):
            pass

    monkeypatch.setattr(joycaption.subprocess, 'Popen', lambda *a, **k: _Proc())
    monkeypatch.setattr(joycaption, 'is_available', lambda: True)
    monkeypatch.setattr(joycaption.cfg, 'aitoolkit_path', lambda k: 'x')

    def boom(_p, _c):
        raise RuntimeError('db went away')

    out = joycaption.caption_images_joycaption([str(f)], on_caption=boom)
    assert out == {str(f): 'c'}, 'the caption still comes back'


# ── the silent failures ───────────────────────────────────────────────────

def test_a_moved_source_folder_fails_instead_of_reporting_success(app, tmp_path):
    """Every isfile() fails, `paths` empties, and the pass used to 'finish'
    having done nothing — while still showing the loading note at 0/0."""
    import shutil
    from app.services import image_bank_service as banks
    with app.app_context():
        bank = _bank(tmp_path, name='Gone')
        shutil.rmtree(bank.source_path)          # the drive walks away
        job = {'kind': 'caption', 'done': 0, 'total': 0, 'error': None,
               'cancelled': False, 'finished': False, 'detail': None,
               'started_at': 0, '_touched': 0, '_cancel_hook': None,
               'pipeline': None, 'device': None}
        banks._caption_job(bank.id, None, False)(job)
    assert job['error'] and 'folder' in job['error'].lower(), job


def test_nothing_left_to_caption_is_still_a_success(app, tmp_path):
    """The OTHER zero case must stay a success — and must not leave the
    'loading the caption model' note as its final word."""
    from app.services import image_bank_service as banks
    from app.models import BankImage
    from app.extensions import db
    with app.app_context():
        bank = _bank(tmp_path, name='Done')
        for row in BankImage.query.filter_by(bank_id=bank.id).all():
            row.caption = 'already captioned'
        db.session.commit()
        job = {'kind': 'caption', 'done': 0, 'total': 0, 'error': None,
               'cancelled': False, 'finished': False, 'detail': None,
               'started_at': 0, '_touched': 0, '_cancel_hook': None,
               'pipeline': None, 'device': None}
        banks._caption_job(bank.id, None, False)(job)
    assert job['error'] is None
    assert 'nothing to caption' in (job['detail'] or '')
    assert 'loading' not in (job['detail'] or '')


def test_a_pass_that_captions_nothing_is_a_failure(app, tmp_path, monkeypatch):
    """Ollama going away mid-run returns '' per image, so every image counts as
    handled and the pass ended `done — 0 captioned`: a success that produced
    nothing."""
    from app.services import image_bank_service as banks
    with app.app_context():
        bank = _bank(tmp_path, name='Silent')
        monkeypatch.setattr(
            'app.services.face_dataset_service.caption_paths',
            lambda paths, **kw: (kw['progress'](len(paths), len(paths)), {})[1])
        monkeypatch.setattr('app.gpu_window.gpu_exclusive_vision_window',
                            lambda **kw: __import__('contextlib').nullcontext())
        job = {'kind': 'caption', 'done': 0, 'total': 0, 'error': None,
               'cancelled': False, 'finished': False, 'detail': None,
               'started_at': 0, '_touched': 0, '_cancel_hook': None,
               'pipeline': None, 'device': None}
        banks._caption_job(bank.id, None, False)(job)
    assert job['error'], 'a pass that produced nothing did not succeed'
    assert 'no captions' in job['error'].lower()


# ── the prereq now probes, like every sibling ─────────────────────────────

def test_caption_prereq_probes_the_real_engine(app, monkeypatch):
    from app import config as cfg
    from app.services import image_bank_service as banks

    with app.app_context():
        cfg.save_config({'captioning': {'backend': 'none'}})
        assert 'no captioning backend' in (banks._caption_prereq() or '')

        # ollama: follows the model probe
        cfg.save_config({'captioning': {'backend': 'ollama'}})
        monkeypatch.setattr('app.capabilities.probe_ollama_model',
                            lambda *a, **k: {'ok': True})
        assert banks._caption_prereq() is None
        monkeypatch.setattr('app.capabilities.probe_ollama_model',
                            lambda *a, **k: {'ok': False})
        assert 'vision model' in (banks._caption_prereq() or '')

        # auto: ready when EITHER engine is, unready only when both are dead.
        cfg.save_config({'captioning': {'backend': 'auto'}})
        monkeypatch.setattr('app.services.joycaption.availability',
                            lambda: {'ok': True, 'detail': ''})
        assert banks._caption_prereq() is None
        monkeypatch.setattr('app.services.joycaption.availability',
                            lambda: {'ok': False, 'detail': 'no venv'})
        reason = banks._caption_prereq()
        assert reason and 'no caption engine is ready' in reason


# ── the queue says why it is waiting ──────────────────────────────────────

def test_the_queue_publishes_what_it_is_waiting_for(app, tmp_path, monkeypatch):
    """`while True: sleep(2)` with no logger froze the whole queue in silence
    whenever the GPU flag stuck — the literal 'doesn't queue, logs show
    nothing'."""
    from app.services import bank_queue, image_bank_service as banks

    with app.app_context():
        bank = _bank(tmp_path, name='Queued')
        # Busy forever, so _process_next parks in the wait loop.
        monkeypatch.setattr(banks, '_gpu_busy_reason',
                            lambda: 'a vision/GPU pass is already running')
        monkeypatch.setattr(bank_queue, '_POLL_SECONDS', 0.01)
        entry = {'bank_id': bank.id, 'user_id': 'local', 'steps': ['scan'],
                 'reject_flags': [], 'resolve_dups': False, 'device_id': None,
                 'enqueued_at': 0, 'state': 'pending'}
        with bank_queue._lock:
            bank_queue._queue.append(entry)
        import threading
        t = threading.Thread(target=bank_queue._process_next, args=(app,),
                             daemon=True)
        t.start()
        import time
        for _ in range(200):
            if entry.get('waiting_for'):
                break
            time.sleep(0.01)
        snap = bank_queue.snapshot()
        with bank_queue._lock:
            bank_queue._queue.clear()

    assert entry.get('waiting_for') == 'a vision/GPU pass is already running'
    assert snap['items'][0]['waiting_for'] == 'a vision/GPU pass is already running'
