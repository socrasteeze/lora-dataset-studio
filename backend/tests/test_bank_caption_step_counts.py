"""The Launch-all caption step keeps its outcome as NUMBERS, not only as prose.

The step used to store {captioned, total_captioned} and nothing else. Who wrote
the captions and what the pass left uncaptioned lived only in the detail line,
so five banks whose captions were 5-83 % written by the fallback engine, or
whose images were refused while another client held the model, all stored a
plain "done" and the bank card (pipelineVerdict.js) had nothing to flag.

The engines are mocked at the caption_paths seam; everything after it is real.
"""
import contextlib

import pytest
from PIL import Image


def _bank(workdir, n=12):
    from app.extensions import db
    from app.services import image_bank_service as banks
    src = workdir / 'src'
    src.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        Image.new('RGB', (64, 64), (10 * i, 90, 160)).save(str(src / f'a{i:02d}.jpg'))
    bank, _added = banks.create_bank('local', 'Counts', str(src))
    db.session.commit()
    return bank.id


def _new_job():
    return {'kind': 'pipeline', 'done': 0, 'total': 0, 'error': None,
            'cancelled': False, 'finished': False, 'detail': None,
            'started_at': 0.0, '_touched': 0.0, '_cancel_hook': None,
            'pipeline': None}


def _entry():
    return {'step': 'caption', 'status': 'done', 'reason': None, 'detail': None,
            'counts': {}}


@pytest.fixture()
def local_caption_step(app, tmp_path, monkeypatch):
    """A bank, both local gates open, and no real GPU window."""
    from app import config as cfg
    from app.services import image_bank_service as banks
    monkeypatch.setattr(banks, '_caption_prereq', lambda: None)
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr('app.gpu_window.gpu_exclusive_vision_window',
                        lambda **_kw: contextlib.nullcontext())
    with app.app_context():
        cfg.save_config({'captioning': {'backend': 'auto'}})
        yield _bank(tmp_path)


def test_the_caption_step_stores_who_wrote_what_and_what_it_left(
        local_caption_step, monkeypatch):
    """5 by JoyCaption, 3 by the fallback, 4 left: 2 refused by the GPU fence
    (another client held the model), 1 answered with nothing, 1 unreadable."""
    from app.services import face_dataset_service as fds
    from app.services import image_bank_service as banks

    bank_id = local_caption_step

    def fake_caption_paths(paths, *a, on_caption=None, outcome=None,
                           progress=None, **_k):
        for i, p in enumerate(sorted(paths)):
            if i < 5:
                on_caption(p, f'joy caption {i}', 'joycaption')
            elif i < 8:
                on_caption(p, f'fallback caption {i}', 'ollama')
        outcome.update(fenced=2, unanswered=1, failed=1,
                       fence_reason='another client holds the model')
        if progress:
            progress(len(paths), len(paths))

    monkeypatch.setattr(fds, 'caption_paths', fake_caption_paths)
    job, entry = _new_job(), _entry()
    banks._run_pipeline_step(job, 'local', bank_id, 'caption', (), False, entry)

    assert job['error'] is None, job['error']
    assert entry['status'] == 'done', 'a step that ran stays done'
    assert entry['counts'] == {
        'captioned': 8, 'total_captioned': 8,
        'joycaption': 5, 'ollama': 3,
        'skipped': 2, 'failed': 2,
        'first_choice': 'joycaption',
    }
    # The prose is still the detail line; the numbers ride beside it.
    assert '8 captioned' in entry['detail']
    assert '_caption_counts' not in job, 'the hand-off key must not linger on the job'


def test_a_single_engine_run_stores_zeros_not_missing_keys(
        local_caption_step, monkeypatch):
    from app.services import face_dataset_service as fds
    from app.services import image_bank_service as banks

    bank_id = local_caption_step

    def fake_caption_paths(paths, *a, on_caption=None, progress=None, **_k):
        for p in paths:
            on_caption(p, 'a caption', 'joycaption')
        if progress:
            progress(len(paths), len(paths))

    monkeypatch.setattr(fds, 'caption_paths', fake_caption_paths)
    entry = _entry()
    banks._run_pipeline_step(_new_job(), 'local', bank_id, 'caption', (), False,
                             entry)

    counts = entry['counts']
    assert counts['joycaption'] == 12 and counts['ollama'] == 0
    assert counts['skipped'] == 0 and counts['failed'] == 0
    assert counts['captioned'] == 12 and counts['total_captioned'] == 12


def test_a_forced_engine_is_its_own_first_choice(local_caption_step, monkeypatch):
    """With 'ollama' chosen there is no fallback: the local LLM IS the choice."""
    from app import config as cfg
    from app.services import face_dataset_service as fds
    from app.services import image_bank_service as banks

    bank_id = local_caption_step
    cfg.save_config({'captioning': {'backend': 'ollama'}})

    def fake_caption_paths(paths, *a, on_caption=None, progress=None, **_k):
        for p in paths:
            on_caption(p, 'a caption', 'ollama')

    monkeypatch.setattr(fds, 'caption_paths', fake_caption_paths)
    entry = _entry()
    banks._run_pipeline_step(_new_job(), 'local', bank_id, 'caption', (), False,
                             entry)
    assert entry['counts']['first_choice'] == 'ollama'
    assert entry['counts']['ollama'] == 12
