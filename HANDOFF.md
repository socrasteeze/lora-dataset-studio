# HANDOFF

**Updated:** 2026-09-03 · **Branch:** `claude/pensive-lovelace-64tfir` (= `main`) · **Base:** `9ef0f13` · **Tree:** clean

## State
The **126-commit v2026.09.03.1 sync is merged, gated and pushed**. `upstream/main`
is `75da453` and is now an ancestor of `HEAD`. Two commits landed: the merge
(`ff1b24a`) and its bundle (`7481022`). Nothing is in flight.

## Done this session
**The largest window this fork has taken — upstream drained its whole `nightly`
into `main` — and the Civitai question two previous runs escalated arrived with
it and had to be answered inside the merge.**

**Adopted whole:** the ✨ DLSS 5 **neural render** lane over finished clips, the
**video dataset workspace** as a page of its own (six sections), the
**Checkpoints & LoRAs** section's local verbs, the **start-frame picker** and its
batch, the **motion writers**, **saved prompts** with pictures and search, the
**multi-LoRA comparison prompt batch**, the 🧹 **free-memory broom**, **Krea
hi-res second pass** + the app-side **finishing pass**, **slider locks**,
**canvas lane placement**, and the 🌐 **Civitai browser feeding the prompt batch**.

**Rejected:** the **Civitai publisher** and the **video cloud launch window** (D4).
`779aee6` was split per hunk as the previous row predicted.

### The Civitai decision — read this first if it comes up again
It is **not** "no cloud". This fork already carries `CIVITAI_API_KEY` in
`SECRET_KEYS`, `civitai_browser.py`, `scrape/sources/civitai.py` and the 🌐
browser — 38 files — and this sync *adopted* the browser→batch feature. What was
refused is the **upload** direction, and the reason is structural: `eaadb72`
appends the key to `SetupPage.jsx`'s `KEY_FIELDS` (whose other three entries are
`nanobanana`, `chatgpt`, `openrouter`), extends `KEY_TEST_TARGET` beside them,
and maps `CAPABILITY_STEP_ID['📤 Civitai publishing'] = 'image'` — and this fork
has **none** of those three. Refused on the **D1c precedent** (rejected inside a
sync, adoptable later as its own wave) and left as the maintainer's call.
**If the answer is yes**, FORK_NOTES' new "Divergence 1's Civitai note" gives the
whole recipe: restore five files, put the key's Setup row on the **Scraping &
sources** card rather than in `KEY_FIELDS`, recompute the capability count
(19 → 20, two suites assert it), re-add the guide chapter.

## Verified 2026-09-03 (all on the exact pushed tree)
| Gate | Result |
|---|---|
| `ruff check .` | All checks passed |
| ESLint `npm run lint` | **0 errors / 20 warnings — D9 baseline exactly** |
| `npm run build` | clean; bundle committed separately |
| local-only contract | **8/8** frontend · **3** backend |
| `create_app()` | OK — 498 routes |
| hygiene (`test_no_personal_data`, ASCII scripts) | 13 passed / 2 skipped |
| `node --test` | **4866 passed / 0 failed** (baseline 4557 — 309 adopted tests) |
| backend full suite | **71 failed / 9031 passed / 122 skipped**, 10m10s, `-n 4`, Torch — **zero new failures vs the 72 / 8657 baseline taken on the pre-merge tree** |
| identity / attribution | project identity on both commits, no trailers |

**The Linux floor is unchanged: 27 files, and the names match.** A failure in a
file NOT on the previous handoff's list is a regression. The baseline's 28th file
(`test_bank_scan_no_db_lock`, the documented timing flake) passed this run.

## Open
1. **Civitai publisher: still the maintainer's yes/no.** Now recorded properly
   rather than deferred — the recipe for a yes is written down, so it no longer
   gets more expensive per window the way diagnostic 35 measured.
2. **CI has not run on this push** (`[skip ci]` per the standing request). Both
   suites and both linters were run locally on this exact tree.
3. **Stale remote branches** — see the note below; the 403 on ref deletion is a
   token limitation, not staleness.
4. **Responsive probe not run** — needs a live instance. The new
   `#/video-dataset/<id>` URL is now in `.claude/rules/frontend-contracts.md`.
5. `training/runs-hub.png` and `advanced-options.png` still photograph the rental
   lane; referenced by `docs/guide/workflow.md`, so they need a re-shoot.
6. Fork-only controls still carry emoji while upstream's use `lucide-react`.

## Traps (carried forward, all confirmed again this run)
- **Fetch BOTH remotes before reading any count** (diagnostic 32).
- **A fresh container has no `upstream` remote, no `.venv`, no `node_modules`.**
  Re-add upstream with `git remote set-url --push upstream DISABLED_NO_PUSH`.
- **`requirements-torch-tests.txt` pins `torch==2.13.0+cpu`, which PyPI does not
  serve here** (`download.pytorch.org` is 403 at CONNECT). `pip install
  torch==2.13.0` resolves to `2.13.0+cu130` — same pinned version, different
  build, runs on CPU. Install it BEFORE starting the suite.
- **Call `.venv/bin/python` by ABSOLUTE path, and never run two commands in
  parallel when one `cd`s.** The working directory persists across tool calls.
- **This box has 4 cores.** Use `-n 4 --dist loadfile`.
- **NEW — a `write_text` that raises still TRUNCATES the file.** A Python
  `unicode_escape` round-trip on `helpRegistry.js` threw `UnicodeEncodeError`
  mid-write and left the file at **0 bytes**; it survived only because it had
  already been `git add`ed. Write to a temp file and `os.replace`, and never
  round-trip a UTF-8 source through `unicode_escape`.
- **NEW — a ported help topic must be grepped against the registry before
  insertion.** `canvas-arrange` was upstream's fourth consecutive silent reword,
  not a new topic; ported blind it becomes a duplicate id.

## Verify
```bash
git fetch origin --prune && git fetch upstream
git rev-list --left-right --count HEAD...upstream/main
git rev-list --left-right --count HEAD...upstream/nightly
/abs/path/.venv/bin/python -m pytest backend/tests -q -rf -n 4 --dist loadfile
/abs/path/.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
