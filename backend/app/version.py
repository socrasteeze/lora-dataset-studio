"""Single source of truth for the app version.

Date-based (YYYY.MM.DD[.N][F]) so string comparison IS version comparison — the
update check just compares the latest GitHub release tag (stripped of a leading
'v') against this. Bump it when cutting a release ZIP; the Windows source bundle
picks it up automatically (backend/ is copied verbatim into the archive).

The trailing **F marks a build of THIS FORK**. It is the last character on
purpose: string comparison walks left to right, so a marker placed after the
date and the counter cannot disturb the ordering that the update check depends
on, and a build carrying it still reads as newer than the same version without.

Because it is a plain string compare, `updates.repo` must name a feed whose tags
share this shape — which for a fork means the FORK's own releases. Comparing an
F-marked version against a feed of unmarked upstream tags is how an "update"
ends up being a different codebase; see the note on that key in config.py.
"""
APP_VERSION = '2026.08.05F'
