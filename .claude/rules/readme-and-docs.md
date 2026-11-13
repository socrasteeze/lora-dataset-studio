---
paths:
  - "README.md"
  - "docs/**"
---

# README & docs doctrine

Update `docs/guide/settings-reference.md` when a setting is added or changes
meaning.

**README — at every release.** A looser trigger lets the README drift until
it promises something the app does not do. Two questions, every time:

- does a section now describe something **that is no longer true**? (a changed
  default, a renamed action, a capability that moved) — that is a debt, not a
  gap, and it is the expensive one;
- does the wave change **what the tool can do**? Only then does it earn a
  line. The README is what a stranger reads to decide if this is for them,
  not a changelog — What's-new already is one.

**Every limit stays visible.** A ranking is not a filter, an undo that skips
deletes says so, a search that ignores "without" says so. That distinction is
what separates a README from a brochure.
