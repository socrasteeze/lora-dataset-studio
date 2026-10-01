---
paths:
  - ".github/workflows/**"
  - "frontend/scripts/**"
---

# Release mechanics

Releases are cut on validated waves only — never per commit.
Announcements tell users to "Update & restart".

- `release.yml` rebuilds `frontend/dist` and only warns when it differs from
  the committed build; it does not block the release. Commit a fresh build
  before tagging.
- Push CI runs only for pushes to `v2` (`.github/workflows/ci.yml`); a push to
  `main` starts nothing, so use a manual dispatch or a PR. On a push, heavy
  jobs run for any test change, any Torch-sensitive path, or at least 5 source
  files or 100 changed lines.
- `frontend/scripts/releaseNotes.mjs` builds the release body from the
  What's-new entries `frontend/src/whatsNew.js` gained since the previous tag
  (git diff of that file, not entry `date` — several releases can be cut on
  one day). A tag whose body would announce NOTHING fails the release job in
  seconds. A genuine plumbing-only release says so on purpose by carrying
  `[no-notes]` in its annotated tag message.
