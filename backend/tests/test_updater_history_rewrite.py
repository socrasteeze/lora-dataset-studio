"""An upstream history REWRITE (rebase / filter-branch on the remote) breaks in-app
updates permanently: every commit gets a new SHA, so no local commit is an ancestor
of the remote branch and `git pull --ff-only` can never fast-forward again. The
checkout is fine — it simply can never update without manual git surgery.

These tests drive REAL git repositories rather than a faked _git, because the whole
question is what git actually does to commit identity across a rewrite; a stub would
just re-assert our own assumptions.
"""
import os
import shutil
import subprocess

import pytest

from app.services import updater

pytestmark = pytest.mark.skipif(shutil.which('git') is None, reason='git not on PATH')


def _git_env():
    """A git environment that depends on nothing outside this test.

    Two settings, both of which cost a real failure when they are left to the
    machine:

    * ``FILTER_BRANCH_SQUELCH_WARNING`` — without it ``git filter-branch``
      prints its deprecation banner and then **sleeps 10 seconds**, every time.
      Seven tests here rewrite a history: that was 70 s of deliberate sleep,
      measured at 98 s for this file against 31 s with the variable set —
      15 % of the entire backend suite, spent in ``sleep``.
    * ``GIT_CONFIG_GLOBAL`` / ``GIT_CONFIG_SYSTEM`` — these tests drive REAL
      repositories, so the developer's own git config is an input to them. A
      global ``commit.gpgsign=true``, ``core.hooksPath``, ``core.autocrlf`` or
      ``init.defaultBranch`` silently changes what the commands under test do,
      on that machine only. Pointing both at os.devnull makes the fixture
      hermetic; the identity the commits need is set per-repo below.
    """
    env = dict(os.environ)
    env['FILTER_BRANCH_SQUELCH_WARNING'] = '1'
    env['GIT_CONFIG_GLOBAL'] = os.devnull
    env['GIT_CONFIG_SYSTEM'] = os.devnull
    return env


def _run(cwd, *args):
    return subprocess.run(('git',) + args, cwd=str(cwd), capture_output=True,
                          text=True, timeout=60, env=_git_env())


def _must(cwd, *args):
    """A git command whose failure is a broken TEST ENVIRONMENT, not a verdict.

    The setup commands used to swallow their return code, so a git that refused
    to commit (signing, hooks, missing `sed` for the msg-filter) surfaced three
    lines later as an assertion about update behaviour — a mystery failure
    about the wrong subject. Failing here names the command and shows git's own
    words instead."""
    out = _run(cwd, *args)
    assert out.returncode == 0, (
        f'git {" ".join(args)} failed ({out.returncode}) in the test fixture:\n'
        f'{(out.stderr or out.stdout or "").strip()[-600:]}')
    return out


def _commit(repo, name, text, message):
    (repo / name).write_text(text, encoding='utf-8')
    _must(repo, 'add', '-A')
    _must(repo, 'commit', '-m', message)


@pytest.fixture(scope='module')
def history_templates(tmp_path_factory):
    """Prepare real histories once; every test receives independent copies."""
    tmp_path = tmp_path_factory.mktemp('rewrite-template')
    upstream = tmp_path / 'upstream'
    upstream.mkdir()
    _must(upstream, 'init', '-b', 'main')
    _must(upstream, 'config', 'user.email', 't@example.com')
    _must(upstream, 'config', 'user.name', 'Test')
    _commit(upstream, 'a.txt', 'one', 'first\n\nCo-Authored-By: Someone <s@example.com>')
    _commit(upstream, 'b.txt', 'two', 'second\n\nCo-Authored-By: Someone <s@example.com>')

    clone = tmp_path / 'clone'
    _must(tmp_path, 'clone', str(upstream), str(clone))
    _must(clone, 'config', 'user.email', 't@example.com')
    _must(clone, 'config', 'user.name', 'Test')
    rewritten = tmp_path / 'rewritten'
    shutil.copytree(upstream, rewritten)
    _rewrite_upstream(rewritten)
    return upstream, rewritten, clone


def _copy_checkout(tmp_path, history_templates, *, rewritten=False):
    original, rewritten_upstream, old_clone = history_templates
    tmp_path.mkdir(parents=True, exist_ok=True)
    upstream, clone = tmp_path / 'upstream', tmp_path / 'clone'
    shutil.copytree(rewritten_upstream if rewritten else original, upstream)
    shutil.copytree(old_clone, clone)
    # The copied clone must fetch its own mutable remote, never the template.
    _must(clone, 'remote', 'set-url', 'origin', str(upstream))
    return upstream, clone


@pytest.fixture()
def checkout(tmp_path, history_templates):
    return _copy_checkout(tmp_path, history_templates)


@pytest.fixture()
def rewritten_checkout(tmp_path, history_templates):
    return _copy_checkout(tmp_path, history_templates, rewritten=True)


def _rewrite_upstream(upstream):
    """Strip a trailer from every message — same shape as a filter-branch scrub:
    identical trees, brand-new commit SHAs.

    `_must`, not `_run`: the msg-filter runs through git's bundled shell and
    `sed`. When that resolves to something else (a PATH where another `sed`
    wins, a shell git can't spawn), filter-branch fails, the history is NOT
    rewritten, and the failure lands on whichever assertion happens to read the
    history next — blaming the updater for the environment."""
    _must(upstream, 'filter-branch', '-f', '--msg-filter',
          'sed "/^Co-Authored-By:/d"', '--', '--all')


def test_the_git_environment_is_hermetic_and_does_not_sleep():
    """The fixture's environment is part of the contract, not a detail.

    Drop FILTER_BRANCH_SQUELCH_WARNING and this file costs 98 s instead of 31 s
    — 70 s of `sleep` inside git, for nothing. Drop the config redirection and
    the tests start reading the developer's own ~/.gitconfig, which is how a
    suite passes on one machine and fails on another for reasons no diff
    explains."""
    env = _git_env()
    assert env['FILTER_BRANCH_SQUELCH_WARNING'] == '1'
    assert env['GIT_CONFIG_GLOBAL'] == os.devnull
    assert env['GIT_CONFIG_SYSTEM'] == os.devnull


def test_a_failing_setup_command_names_itself(tmp_path):
    """`_must` exists so a broken git environment says which command broke, in
    git's words — instead of a silent no-op that fails an unrelated assertion
    about the updater three lines later."""
    with pytest.raises(AssertionError) as excinfo:
        _must(tmp_path, 'rev-parse', 'HEAD')      # not a repository
    assert 'git rev-parse HEAD failed' in str(excinfo.value)


def test_pull_ff_only_really_does_break_after_a_rewrite(rewritten_checkout):
    """The premise, verified rather than assumed — otherwise the fix guards nothing."""
    upstream, clone = rewritten_checkout
    _run(clone, 'fetch', 'origin', 'main')
    pull = _run(clone, 'pull', '--ff-only', 'origin', 'main')
    assert pull.returncode != 0


def test_apply_update_recovers_from_a_rewritten_upstream(rewritten_checkout):
    upstream, clone = rewritten_checkout
    before = _run(clone, 'rev-parse', 'HEAD').stdout.strip()

    out = updater.apply_update(root=clone)
    assert out['ok'] is True and out['changed'] is True
    # landed exactly on the rewritten remote tip...
    _run(clone, 'fetch', 'origin', 'main')
    assert (_run(clone, 'rev-parse', 'HEAD').stdout.strip()
            == _run(clone, 'rev-parse', 'origin/main').stdout.strip())
    assert _run(clone, 'rev-parse', 'HEAD').stdout.strip() != before
    # ...and the FILES are untouched: a rewrite changes messages, not content
    assert (clone / 'a.txt').read_text() == 'one'
    assert (clone / 'b.txt').read_text() == 'two'
    assert 'Co-Authored-By' not in _run(clone, 'log', '--format=%B').stdout


def test_recovery_refuses_to_discard_uncommitted_work(rewritten_checkout):
    """A failing update is better than a destroyed edit."""
    upstream, clone = rewritten_checkout
    (clone / 'a.txt').write_text('locally edited', encoding='utf-8')

    out = updater.apply_update(root=clone)
    assert out['ok'] is False
    assert (clone / 'a.txt').read_text() == 'locally edited'


def test_recovery_refuses_when_the_user_has_real_local_commits(rewritten_checkout):
    """Local work makes HEAD's tree absent from the remote — the very case the tree
    check exists to catch, since commit COUNTS cannot tell it from a rewrite."""
    upstream, clone = rewritten_checkout
    _commit(clone, 'mine.txt', 'my work', 'my local commit')

    out = updater.apply_update(root=clone)
    assert out['ok'] is False
    assert (clone / 'mine.txt').exists()          # nothing destroyed


def test_untracked_files_do_not_block_the_recovery(rewritten_checkout):
    """reset --hard never removes untracked files, so they must not veto the update
    (a user's stray notes.txt would otherwise strand them forever)."""
    upstream, clone = rewritten_checkout
    (clone / 'notes.txt').write_text('scratch', encoding='utf-8')

    out = updater.apply_update(root=clone)
    assert out['ok'] is True
    assert (clone / 'notes.txt').read_text() == 'scratch'


def test_a_normal_fast_forward_update_still_works(checkout):
    """The ordinary path must be untouched by the recovery branch."""
    upstream, clone = checkout
    _commit(upstream, 'c.txt', 'three', 'third')

    out = updater.apply_update(root=clone)
    assert out['ok'] is True and out['changed'] is True
    assert (clone / 'c.txt').read_text() == 'three'


def test_status_does_not_claim_a_rewrite_is_hundreds_of_commits_behind(rewritten_checkout):
    """Someone perfectly up to date must not be told the whole history is pending
    just because the remote was rewritten — the count is re-measured by content."""
    upstream, clone = rewritten_checkout

    s = updater.git_update_status(root=clone)
    assert s['behind'] == 0 and s['update_available'] is False
    assert s.get('history_rewritten') is True


def test_status_still_counts_real_pending_commits_after_a_rewrite(rewritten_checkout):
    """And a genuine new commit on top of a rewrite still reads as exactly one."""
    upstream, clone = rewritten_checkout
    _commit(upstream, 'c.txt', 'three', 'third')

    s = updater.git_update_status(root=clone)
    assert s['behind'] == 1 and s['update_available'] is True


def test_copied_histories_have_independent_files_and_remotes(tmp_path, history_templates):
    first_remote, first_clone = _copy_checkout(tmp_path / 'first', history_templates)
    second_remote, second_clone = _copy_checkout(tmp_path / 'second', history_templates)
    (first_remote / 'a.txt').write_text('remote edit', encoding='utf-8')
    (first_clone / 'a.txt').write_text('clone edit', encoding='utf-8')
    assert (second_remote / 'a.txt').read_text() == 'one'
    assert (second_clone / 'a.txt').read_text() == 'one'
    assert (history_templates[0] / 'a.txt').read_text() == 'one'
    for remote, clone in ((first_remote, first_clone), (second_remote, second_clone)):
        assert _must(clone, 'remote', 'get-url', 'origin').stdout.strip() == str(remote)
