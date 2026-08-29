# HANDOFF

**Updated:** 2026-08-29 · **Branch:** main (mirrored to `claude/magical-tesla-lwjyth`) · **Base:** 6700a127 · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `06c9382c` — 0 behind. All gates
green on the exact tree pushed. `main` and `claude/magical-tesla-lwjyth` both at
`29154a07`.

## Done this session
- Merged upstream `06c9382c` — 13 commits, **six source conflicts** (three of
  them marker regions), 0 rejected features shipped.
- **The conflict that mattered looked trivial.** `face_dataset_service.py`
  raised ONE region: four lines of a refusal-sentence rewrite on our side,
  **261 lines of the rejected API fan-out on upstream's** (`chatgpt_image` /
  `engine_errors` imports, `_api_generate_fn`, `_run_nanobanana_batch`,
  `generate_variations_nanobanana`). Merge diagnostic 17, verbatim. The resolver
  asserted the region count *and* the content of both sides before writing.
- `settings-reference.md` was diagnostic 4: two rejected **API engine — identity
  lock** bullets interleaved with a legitimate improve-window rewording in one
  hunk. Resolved per BULLET.
- Adopted: the **Studio unified viewer** (`gallery_image` becomes the published
  floor of every Studio cells payload; the fifth lightbox is gone); the
  **improve settings window**; **⚙ Details / ⇄ Compare on the checkpoint cards**
  (same lineage panels, never copies); the **made-with stamp** minus its API
  lane; the **named Ollama fence hold** and the **managed-venv pip upgrade**
  (both reported by drago87 on Discord — credit preserved in the commit);
  `camera_ready()` as one verdict.
- **One rejected-feature leftover, caught by the sweep and by no conflict:** the
  new `generationMetaFacts.js` hardcoded `nanobanana`/`chatgpt`/`openrouter`
  labels in a file the local-only contract does not budget. Stripped, docstring
  included — the contract counts identifiers in comments too.
- **D10 engaged in its full three-part shape:** upstream edited BOTH deleted
  help modules, so `git rm` alone would have been green and lossy. Ported one
  new topic (`action-dataset-made-with`) and **three rewords no count and no
  id-list diff can see**. 300 → **301** topics, tips **14**, nothing lost.
- **D5 gained a thirteenth entry** — see Open #0 below for why it matters.

## Open
0. **Nothing owed on the sync itself.** Recorded here only so the next session
   does not re-derive it: D5's new entry is
   `test_dataset_generation_meta.py`, where upstream's floor of **six**
   generating lanes counts its API variations lane. Lowered to five, not
   dropped. It was the ONLY delta against the pre-merge baseline (71 → 72), and
   nothing but a baseline would have separated it from this container's floor.
1. **Delete 12 stale merged branches — attempted again this session, blocked
   again, and now confirmed a HARD limitation rather than a transient 403.**
   Every merged branch was tried with `git push origin --delete`, which returned
   `Everything up-to-date` **without deleting anything** (a silent no-op, not an
   error — do not read that output as success), and the explicit refspec form
   `git push origin :refs/heads/<b>` returned
   `send-pack: unexpected disconnect`. The credential in this container lane can
   CREATE and UPDATE refs but not DELETE them. The GitHub MCP server exposes
   `create_branch` and `list_branches` with **no delete counterpart** —
   re-derived from the tool list this session, not recalled. There is no route
   from a container like this one; owed to a session whose credential can delete
   refs. Re-derive the list, never copy it:
   `git branch -r --merged main | grep -v 'origin/main$'`.
2. Fork-only controls still carry emoji while upstream's use icons (`🔖 Tags`,
   `⚖️ Balanced pick`, `✂ Find crops & variants`, `⬆ Promote`). `🔖 Tags` alone
   touches `wd14Gate.js`, `bankPassCoverage.js`, `bankFacets.js`,
   `pipelineSteps.js` + their tests — a wave of its own (D3).
3. `no-unused-vars` is at `warn` (D9): 20 warnings, all pre-existing orphans of
   D1/D4 deletions, unchanged by this wave. Restore to `error` when that orphan
   wave lands.
4. Three remote branches keep unmerged commits, left in place deliberately:
   `beautiful-ride-rllujy` (2), `gracious-planck-nykeey` (2),
   `magical-tesla-1c639u` (3, a duplicate sync of an older window). These are
   NOT stale — do not sweep them in with the twelve above.

## Decisions
- **Prose corrected for claims this fork cannot honour.** Upstream's What's-new
  entry read *"Every **cloud-run** card in a dataset's checkpoints"*; this fork
  filters cloud rows out of Runs and the card reads `Run #<id>`, so it is
  *"Every run card"* — id untouched, since ids are stored in localStorage. The
  README's **Act from the feed** row still promised ✨ *"runs straight from
  here"*, which the window makes half-false; it now names the Klein window and
  keeps SeedVR2's straight-fire.
- **Bank/Dataset parity was asked and nothing is owed** — recorded so it is not
  re-litigated. The Bank's ✨ improve is a scoped BATCH pass that replaces the
  image; upstream's own rule keeps a batch's instruction inline *"because a
  batch shows its instruction before launching a lot"*. The dials-in-a-window
  change is for the single-image lightbox verb, which the Bank does not have.
- `ResultLightbox.jsx` arrived as `modify/delete` and the fork's **entire**
  divergence in it was retired-D3 residue (two stripped 👍/👎), so taking the
  deletion cost nothing and `StudioResultViewer` restores both glyphs free.
- The new screenshot was **opened and looked at**
  (`studio/unified-viewer-facts.png`) — Klein-only verbs, no key field.

## Traps
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- A fresh container clones **shallow**, and this is worse than a wrong count:
  `git merge-base` fails outright, so `main` and the working branch read as
  **unrelated histories with no common ancestor**, and the local `main` ref was
  235 commits stale. Anything computed before `git fetch --unshallow origin` is
  fiction.
- `pgrep -f "pytest backend/tests"` **matches your own wait-loop's command
  line**, so an `until ! pgrep …` waiter never exits and looks like a suite that
  never finishes. Wait on the controller PID instead (`while kill -0 <pid>`).
- On Linux the backend suite has an environment failure floor of **71** (Windows
  drive-letter fixtures, no ComfyUI on `127.0.0.1:8188`, no egress). CI's backend
  job is `windows-latest` and does not reproduce them. Always diff a pre-merge
  baseline; a failure not in the baseline is damage, whoever wrote the test.
- `download.pytorch.org` is blocked in the container lane (403 at CONNECT):
  install the Torch overlay from PyPI (`torch==2.13.0`, resolves to `+cu130`),
  or ~124 tests silently skip and one FAILS rather than skipping.
- A fresh container has no `.venv`/`node_modules` and **inherits a vendor git
  identity** — this one again arrived pre-set to an AI vendor's name and noreply
  address, with commit signing on. Set the project identity per the repo rules
  before committing and confirm with `git config --list | grep '^user\.'`. (Do
  not paste the vendor address into a tracked file to illustrate this —
  `test_no_personal_data.py` catches emails everywhere.)
- Rebuilt bundle files still match a cloud-phrase grep (`DiagnosticReport`,
  `whatsNewArchive`). Both are documented kept-as-is legacy: a guide sentence
  saying the engines were REMOVED, and the historical archive. The local-only
  contract passes 8/8 against the rebuilt dist.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -rf -n 4 --dist loadfile   # -n 8 on a bigger box
```
