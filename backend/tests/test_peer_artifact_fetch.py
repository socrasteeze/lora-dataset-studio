"""Staging a job's files fetches all of them, and one failure still fails the job.

The download loop was strictly serial: one `requests.get` at a time, per file.
`cluster.py`'s own note measures what that cost — a 5 000-image bank is roughly
15 minutes of the peer downloading before its script prints anything at all —
and almost all of it was round-trip latency, not bandwidth, because each small
image waited for a full request/response before the next one started.

Concurrency is the risky kind of change, so what is pinned here is not speed
(a timing assertion at any size a test can build would pass either way, per
CLAUDE.md) but the two behaviours that must survive it:

  * every requested name comes back, mapped by basename, whatever order the
    responses land in;
  * a single failure still raises, so an incomplete stage can never be handed
    to a pass as if it were complete. The serial loop got that for free by
    raising on the spot; a pool has to be made to do it on purpose.
"""
import threading

import pytest

from app.services.peer_worker import peer_worker


class _FakeResponse:
    def __init__(self, name, fail=False):
        self._name = name
        self._fail = fail

    def raise_for_status(self):
        if self._fail:
            raise RuntimeError(f'boom: {self._name}')

    def iter_content(self, chunk_size=0):
        yield self._name.encode()


@pytest.fixture
def fake_get(monkeypatch):
    """Replaces requests.get and records what was asked for, concurrently-safe."""
    seen = []
    lock = threading.Lock()
    failing = set()

    def _get(url, headers=None, timeout=None, stream=False):
        name = url.rsplit('/', 1)[-1]
        with lock:
            seen.append(name)
        return _FakeResponse(name, fail=name in failing)

    monkeypatch.setattr('app.services.peer_worker.requests.get', _get)
    monkeypatch.setattr(peer_worker, '_url', lambda path: f'http://primary{path}')
    monkeypatch.setattr(peer_worker, '_headers', lambda: {})
    return seen, failing


def test_every_staged_file_arrives(tmp_path, fake_get):
    seen, _ = fake_get
    names = [f'{i}__img.png' for i in range(25)]

    out = peer_worker._download_artifacts('job-1', names, tmp_path)

    assert sorted(out) == sorted(names)
    assert sorted(seen) == sorted(names)
    for name in names:
        assert out[name].read_bytes() == name.encode()


def test_one_bad_file_fails_the_whole_stage(tmp_path, fake_get):
    """A pass that ran against a partial bank would silently produce different
    answers — for the faces pass, different person groups. Better to fail."""
    seen, failing = fake_get
    names = [f'{i}__img.png' for i in range(10)]
    failing.add('4__img.png')

    with pytest.raises(RuntimeError):
        peer_worker._download_artifacts('job-1', names, tmp_path)


def test_a_single_file_still_works(tmp_path, fake_get):
    """The one-file path skips the pool entirely; it must behave identically."""
    seen, _ = fake_get

    out = peer_worker._download_artifacts('job-1', ['solo.npz'], tmp_path)

    assert list(out) == ['solo.npz']
    assert seen == ['solo.npz']


def test_no_files_is_not_an_error(tmp_path, fake_get):
    """A vision job whose images were all covered by the shipped cache stages
    nothing at all — that is a normal outcome, not a failure."""
    seen, _ = fake_get

    assert peer_worker._download_artifacts('job-1', [], tmp_path) == {}
    assert seen == []


def test_a_path_like_name_is_reduced_to_its_basename(tmp_path, fake_get):
    """The peer routes everything by basename; a name carrying directories must
    not escape the work folder."""
    seen, _ = fake_get

    out = peer_worker._download_artifacts('job-1', ['sub/dir/9__img.png'], tmp_path)

    assert list(out) == ['9__img.png']
    assert out['9__img.png'].parent == tmp_path
