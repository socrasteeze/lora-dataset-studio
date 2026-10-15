# CLAUDE.md

Read [AGENTS.md](AGENTS.md) before working in this repository. It is the shared
source of repository guidance for all coding agents.

The scoped files under `.claude/rules/` remain applicable. AGENTS.md links them
so agents that do not auto-load those files receive the same instructions.

<!-- ghost:start -->
## Ghost data-handling policy
Treat every data file in this repo (images, video, audio, documents, exports,
datasets, anything a person or customer could be identified from) as private.
Names and contents of data stay on this machine. This applies to every agent.

Names
- Never write a real data file or folder name in replies, docs, commits, PR or
  ticket text, handoffs, logs, or code comments. Say "14 images in data/",
  "the third PDF", or use the alias if ghost lockdown is active.
- Prefer commands that do not print names: count, filter by extension, act by
  glob. Do not list or tree data folders unless the task needs it.
- Files you create get generic names: `screenshot-01.png`, `preview-02.jpg`,
  `export-2026-01.csv`. Never derive an output name from a data file name.

Visuals
- Every screenshot, image preview, thumbnail, contact sheet, GIF, or rendered
  page you save, commit, embed, or send to the user is redacted first. Pixelate
  faces, people, plates, and any data text; keep UI chrome only if it shows no
  data. When unsure, pixelate the whole frame.
- Redact with `ghost.py redact <in> --out=<out>` (from the ghost skill's scripts) or any pixelate/blur tool. ghost.py also strips EXIF/GPS metadata; with another
  tool, strip it yourself.
- Delete or overwrite the unredacted capture. Never commit one.
- You may view raw data images to do the work (for example captioning). That
  view never leaves as an output.

Contents
- Do not quote data contents (names, addresses, account numbers, message text)
  in replies or docs. Summarize by shape: field names, counts, types.
- Test fixtures, examples, and seed data use invented values, never copies of
  real rows.

If a rule blocks the task, stop and ask. Do not work around it.
<!-- ghost:end -->
