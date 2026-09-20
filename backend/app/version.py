"""Single source of truth for the app version.

Date-based (YYYY.MM.DD[.N]) so string comparison IS version comparison — the
update check just compares the latest GitHub release tag (stripped of a leading
'v') against this. Bump it when cutting a release ZIP; the Windows source bundle
picks it up automatically (backend/ is copied verbatim into the archive).
"""
# The trailing fork marker is a PEP 440 LOCAL segment ('+fork'), not a bare
# letter. V2's plugin contract (plugins/package_contract._version_issue) parses
# this with packaging.Version to check a plugin's host requirement, and
# '2026.09.04F' is not a valid version: every bundled plugin was rejected as
# 'incompatible - The installed LDS version cannot be verified', which is a boot
# failure, not a version quibble. '+fork' parses, satisfies the same specifiers,
# and still sorts ABOVE upstream's plain 2026.09.04. The updater's plain string
# comparison below is unaffected (verified against both forms).
APP_VERSION = '2026.09.04+fork'
# Release tooling reads this marker from the tagged tree. Adopted from V2:
# .github/workflows/release.yml greps for it and a missing marker breaks a tag.
# The VERSION above stays the fork's own (D11) -- upstream's release identity
# is not this fork's.
APP_RELEASE_CHANNEL = 'v2'
