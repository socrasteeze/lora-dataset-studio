"""The peer's success path: what it does with an infer script's stdout.

This had no coverage, and it cost a real pass. InsightFace prints a banner to
STDOUT before the result line, the peer parsed the whole buffer as JSON, and the
`except` shipped `{'stdout': <everything>}` home with the job marked completed —
so the hub raised "face pass produced no output (rc=0)" over a result that was
sitting in the artifact, fully computed."""
import json

import pytest

from app.services import infer_stream
from app.services.peer_worker import peer_worker

BANNER = ("Applied providers: ['CPUExecutionProvider'], with options: {}\n"
          'set det-size: (640, 640)\n')
RESULT = {'ok': True, 'results': {'a.png': {'state': 'ok'}},
          'clusters': {'a.png': 1}}


@pytest.fixture
def peer(app, monkeypatch):
    """A peer whose network is stubbed out: no downloads, no uploads, and
    _complete captured instead of posted."""
    done = {}
    monkeypatch.setattr(peer_worker, '_download_artifacts',
                        lambda job_id, names, work: {})
    monkeypatch.setattr(peer_worker, '_upload_artifact',
                        lambda job_id, path, name=None: name or path.name)
    monkeypatch.setattr(peer_worker, '_progress', lambda job_id, data: {})
    monkeypatch.setattr(peer_worker, '_complete',
                        lambda job_id, **kw: done.update(kw))
    peer_worker.init_app(app)
    return done


def _run(monkeypatch, peer, stdout, rc=0, stderr_lines=()):
    monkeypatch.setattr(
        infer_stream, 'run_infer_script',
        lambda *a, **k: (stdout, list(stderr_lines), rc, False))
    peer_worker._run_infer({'job_id': 'job-1', 'kind': 'infer',
                            'payload': {'script': 'face_embed_infer.py',
                                        'stdin': {'images': []}}})
    return peer


def test_a_dependency_banner_does_not_cost_the_peer_its_result(monkeypatch, peer):
    """The bug. Before the fix this completed with {'stdout': …} — no `ok`, no
    `error` — and the hub blamed a pass that had actually run."""
    done = _run(monkeypatch, peer, BANNER + json.dumps(RESULT))

    assert not done.get('error')
    assert done['result']['result'] == RESULT


def test_a_zero_exit_with_nothing_readable_is_a_failure_not_a_success(
        monkeypatch, peer):
    """rc says fine, stdout says nothing: that is a failed job. Reporting it
    completed forces every caller to invent its own explanation, which is how
    "(rc=0)" — an exit code the hub never observed — got printed at all."""
    done = _run(monkeypatch, peer, 'loading weights...\nstill loading\n',
                stderr_lines=['Traceback (most recent call last):',
                              'MemoryError: out of memory'])

    assert 'no readable result' in (done.get('error') or '')
    # …and it must quote the machine's own words, not a placeholder.
    assert 'MemoryError: out of memory' in done['error']
    assert done.get('result') is None


def test_a_clean_json_failure_still_reports_the_script_reason(monkeypatch, peer):
    """rc != 0 with the script's own {'ok': false, 'error': …} keeps preferring
    that error over the stderr tail — the tqdm-download-bar regression."""
    done = _run(monkeypatch, peer,
                BANNER + json.dumps({'ok': False,
                                     'error': 'model load failed: antelopev2'}),
                rc=1,
                stderr_lines=['100%|██████| 352210/352210 [00:02, 140kB/s]'])

    assert 'model load failed: antelopev2' in (done.get('error') or '')
    assert '352210' not in done['error']
