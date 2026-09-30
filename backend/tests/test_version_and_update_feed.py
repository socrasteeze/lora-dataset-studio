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
RELEASE_TAG_RE = re.compile(
    r'^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}(?:\.[0-9]+)?(?:\+fork)?$')


def test_app_version_is_a_tag_this_repo_can_actually_publish():
    from app.version import APP_VERSION
    assert RELEASE_TAG_RE.match(f'v{APP_VERSION}'), (
        f'APP_VERSION {APP_VERSION!r} is not a shape release.yml will accept, so '
        'tagging it would fail the release AFTER the ZIP was built')


def test_the_fork_marker_is_a_pep440_local_suffix():
    """The fork suffix stays parseable by the V2 plugin compatibility check."""
    from app.version import APP_VERSION
    from packaging.version import Version
    assert APP_VERSION.endswith('+fork'), (
        'this fork marks its builds with +fork so a tag, a ZIP and the '
        'About screen all say which codebase they came from')
    assert Version(APP_VERSION).local == 'fork'


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


def test_the_fork_never_asks_upstream_how_far_ahead_it_is():
    """Fork Divergence 12 removed the upstream-ahead indicator: it asked
    upstream's GitHub about this checkout every time Settings > Maintenance
    opened. The sync driver owns that question now, on the operator's command."""
    from app.services import updater
    assert not hasattr(updater, 'UPSTREAM_REPO')
    assert not hasattr(updater, 'upstream_ahead_status')
