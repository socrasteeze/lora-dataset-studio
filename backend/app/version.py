"""Single source of truth for the app version.

Date-based (YYYY.MM.DD[.N]) so string comparison IS version comparison — the
update check just compares the latest GitHub release tag (stripped of a leading
'v') against this. Bump it when cutting a release ZIP; the Windows source bundle
picks it up automatically (backend/ is copied verbatim into the archive).
"""
# The trailing fork marker is a PEP 440 LOCAL segment ('+fork'), not a bare
# letter. V2's plugin contract (plugins/package_contract._version_issue) parses
# this with packaging.Version to check a plugin's host requirement, and
# a bare letter suffix is not a valid version. '+fork' parses, satisfies the
# same specifiers, and still sorts ABOVE upstream's plain version. The updater's
# plain string comparison below is unaffected.
APP_VERSION = '2026.09.23+fork'
# Release tooling reads this marker from the tagged tree. Adopted from V2:
# .github/workflows/release.yml greps for it and a missing marker breaks a tag.
# The VERSION above stays the fork's own -- upstream's release identity
# is not this fork's.APP_RELEASE_CHANNEL = 'v2'
