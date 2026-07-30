"""A loading model must not be drawn like a hang.

Reported: 🏷️ Caption sat at `0 / 61 · captioning` with the GPU marked taken and
a growing stale age, which is rendered identically to a stuck pass. It then
captioned all 61 fine — the silence was the model loading. Every pass that loads
a model before it can count its first image had the same gap.
"""
from __future__ import annotations


def _Job():
    """A job dict with the keys the passes actually read — bank_jobs.start
    builds these, and reaching the code under test without them only proves the
    stub is wrong."""
    import time
    return {'kind': 'test', 'done': 0, 'total': 0, 'error': None,
            'cancelled': False, 'finished': False, 'detail': None,
            'started_at': time.time(), '_touched': time.time(),
            '_cancel_hook': None, 'pipeline': None, 'device': None}


def _progress_recorder(monkeypatch, mod):
    """Capture every bank_jobs.progress(...) call the pass makes."""
    calls = []

    def fake(job, done=None, total=None, detail=None):
        calls.append({'done': done, 'total': total, 'detail': detail})
    monkeypatch.setattr(mod.bank_jobs, 'progress', fake)
    return calls


# ── the caption pass (in-process, no stderr to read) ──────────────────────

def test_caption_names_the_wait_before_the_first_image(app, tmp_path, monkeypatch):
    from PIL import Image
    from app.services import image_bank_service as banks

    src = tmp_path / 'src'
    src.mkdir()
    for i in range(2):
        Image.new('RGB', (32, 32)).save(str(src / f'a{i}.jpg'))
    with app.app_context():
        bank, _ = banks.create_bank('local', 'Dump', str(src))
        calls = _progress_recorder(monkeypatch, banks)
        # A caption engine that loads (reporting 0/2) and only then produces.
        def fake_caption_paths(paths, **kw):
            kw['progress'](0, len(paths))          # still loading
            kw['progress'](1, len(paths))          # first image out
            return {}
        monkeypatch.setattr(
            'app.services.face_dataset_service.caption_paths', fake_caption_paths)
        monkeypatch.setattr('app.gpu_window.gpu_exclusive_vision_window',
                            lambda **kw: __import__('contextlib').nullcontext())
        banks._caption_job(bank.id, None, False)(_Job())

    details = [c['detail'] for c in calls if c['detail']]
    assert any('loading the caption model' in d for d in details), details
    # A 0-count report must NOT clear the note — that report is the load.
    zero = next(c for c in calls if c['done'] == 0 and c['total'] == 2
                and c['detail'] is None)
    assert zero is not None
    # …and the first real image restores the plain sentence.
    assert any(c['done'] == 1 and c['detail'] == 'captioning' for c in calls), calls


# ── the infer-driven passes (score / faces) ───────────────────────────────

def _drive(monkeypatch, banks, lines, busy_detail):
    """Run the driver against a fake child emitting `lines` on stderr."""
    import io
    import re
    import subprocess
    from contextlib import nullcontext

    calls = _progress_recorder(monkeypatch, banks)

    class _Proc:
        pid = 4242
        returncode = 0

        def __init__(self):
            self.stdin = type('S', (), {'write': lambda s, d: None,
                                        'close': lambda s: None})()
            self.stdout = io.StringIO('{"ok": true, "results": {}}')
            self.stderr = iter(lines)

        def wait(self, timeout=None):
            return 0

        def poll(self):
            return 0

    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **k: _Proc())
    monkeypatch.setattr(banks.bank_jobs, 'set_cancel_hook', lambda job, hook: None)
    monkeypatch.setattr(banks.bank_jobs, 'cancelled', lambda job: False)
    banks._drive_infer_subprocess(
        _Job(), 'py', 'script.py', '{}', str('cache'),
        re.compile(r'\[score\] (\d+)/(\d+)'), nullcontext(),
        stall_label='scoring', busy_detail=busy_detail)
    return calls


def test_the_infer_driver_names_the_load_then_takes_it_back(app, monkeypatch):
    from app.services import image_bank_service as banks
    with app.app_context():
        calls = _drive(monkeypatch, banks, [
            '[score] loading CLIP ViT-L\n',          # spoke, counted nothing
            '[score] still loading\n',
            '[score] 1/9 ok\n',                      # first counted image
            '[score] 2/9 ok\n',
        ], busy_detail='scoring pass (CUDA)')

    details = [c['detail'] for c in calls if c['detail']]
    assert 'scoring pass (CUDA) — loading the model' in details, details
    # Said ONCE, not on every pre-progress line.
    assert details.count('scoring pass (CUDA) — loading the model') == 1
    # Restored on the first counted image, so it cannot survive to 9/9…
    assert 'scoring pass (CUDA)' in details
    # …and not re-set afterwards.
    assert details[-1] == 'scoring pass (CUDA)'


def test_a_caller_that_does_not_opt_in_is_untouched(app, monkeypatch):
    """busy_detail=None → the driver never writes a detail, exactly as before."""
    from app.services import image_bank_service as banks
    with app.app_context():
        calls = _drive(monkeypatch, banks, [
            '[score] warming up\n', '[score] 1/9 ok\n',
        ], busy_detail=None)
    assert [c['detail'] for c in calls if c['detail']] == []


def test_the_resuming_hint_still_wins_over_the_loading_note(app, monkeypatch):
    """"resuming — 3 of 9 already cached" says strictly more, so it must not be
    overwritten by the generic loading note."""
    from app.services import image_bank_service as banks
    with app.app_context():
        calls = _drive(monkeypatch, banks, [
            '[score] 9 image(s), 3 cached\n',
            '[score] 1/9 ok\n',
        ], busy_detail='scoring pass (CPU)')
    details = [c['detail'] for c in calls if c['detail']]
    assert any('resuming — 3 of 9 already cached' in d for d in details), details
    assert details.index('scoring pass (CPU) — loading the model') < \
        next(i for i, d in enumerate(details) if 'resuming' in d), \
        'the hint must land after, and therefore win'
