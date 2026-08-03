"""The version string and the feed it is compared against must agree.

Both halves of this file guard the same failure: **an "update" that installs a
different codebase.** `settings.check_update` reads the latest release tag from
`updates.repo`, strips a leading 'v', and compares it to APP_VERSION with a
plain string comparison. Two things therefore have to hold, and neither is
checked anywhere else:

  * the feed must be THIS repository's. Pointed at upstream from a fork, the
    first upstream tag sorting above APP_VERSION reads as an upgrade, and on a
    ZIP install the button downloads that release's asset over the current one.
  * APP_VERSION must be a shape `release.yml` will accept, because that workflow
    refuses to publish a tag which does not equal it. A version this repo cannot
    tag is a release that fails after the ZIP has already been built.

The regex below is a COPY of the one in `.github/workflows/release.yml`. It has
to be: the workflow's copy lives in YAML that no test can import, so the only
way to notice the two drifting apart is to state the contract on this side and
fail loudly when APP_VERSION stops satisfying it.
"""
import re

# Keep in step with .github/workflows/release.yml's "Tag must match APP_VERSION".
RELEASE_TAG_RE = re.compile(r'^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}(?:\.[0-9]+)?F?$')


def test_app_version_is_a_tag_this_repo_can_actually_publish():
    from app.version import APP_VERSION
    assert RELEASE_TAG_RE.match(f'v{APP_VERSION}'), (
        f'APP_VERSION {APP_VERSION!r} is not a shape release.yml will accept, so '
        'tagging it would fail the release AFTER the ZIP was built')


def test_the_fork_marker_is_last_so_it_cannot_disturb_ordering():
    """F sits after the date and the counter on purpose. The update check is a
    string comparison, so a marker anywhere earlier would reorder releases."""
    from app.version import APP_VERSION
    assert APP_VERSION.endswith('F'), (
        'this fork marks its builds with a trailing F so a tag, a ZIP and the '
        'About screen all say which codebase they came from')
    assert 'F' not in APP_VERSION[:-1], 'the marker must appear once, at the end'
    # The property that matters: same version, marked, still reads as newer.
    assert APP_VERSION > APP_VERSION[:-1]


def test_the_update_feed_is_this_fork_and_not_upstream(app):
    """The one that would have hurt. An F-marked version compared against
    upstream's unmarked tags makes any upstream release look like an upgrade."""
    from app import config as cfg
    repo = cfg.DEFAULTS['updates']['repo']
    assert repo.startswith('socrasteeze/'), (
        f'the update feed points at {repo!r}: Update & restart would offer '
        "another project's releases and a ZIP install would take them")


def test_a_release_of_this_fork_sorts_above_the_upstream_tag_it_forked_from():
    """Guards the comparison itself rather than the constant. Upstream tags carry
    no F, so on a shared date the fork's build must still read as the newer one —
    otherwise a user on the fork is told they are up to date against a feed that
    is not theirs, which is the quiet half of the same bug."""
    assert '2026.08.02.2F' > '2026.08.02'
    assert '2026.08.02.2F' > '2026.08.02.1'
    assert '2026.08.03F' > '2026.08.02.2F'


def test_the_upstream_check_points_at_upstream_and_not_the_fork():
    """Mirror image of test_the_update_feed_is_this_fork_and_not_upstream. That one
    guards `updates.repo` staying pointed at THIS fork; this one guards the
    upstream-ahead indicator's constant staying pointed at the OTHER one. Pointed
    at the fork itself, ahead_by would always compare a SHA against its own
    history and read 0 forever — the badge would be silently useless, never wrong
    out loud."""
    from app.services import updater
    assert updater.UPSTREAM_REPO.startswith('perfectgf/'), (
        f'the upstream-ahead check points at {updater.UPSTREAM_REPO!r}: it should '
        'name the project this fork tracks, not this fork itself')
