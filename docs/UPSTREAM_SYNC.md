# Upstream sync — the operational page

Everything needed to merge `upstream/main` into this fork, in the order it is
needed. **`FORK_NOTES.md` remains the authority on WHAT diverges and WHY**; this
page is the authority on HOW to run the sync and which commands to trust.

Fork: `socrasteeze/lora-dataset-studio` · Upstream: `perfectgf/lora-dataset-studio`

> **Read this page first, then FORK_NOTES.md's divergence sections.** You do not
> need to read the FORK_NOTES changelog table to perform a sync — it is a
> historical record, kept deliberately, and it lives at the bottom of that file
> for exactly this reason.

## The rule behind this page

**Every hand-maintained list in this repo has drifted from the tree.** Measured
on 2026-08-05: the reject-list documented 9 of 58 files, one Divergence-5 family
said "twelve" where the tree had 13, a second D5 family of 12 files was
undocumented, and the capability count in prose was one release behind the
number its own contract test asserts.

So: **derive, do not recall.** Where a command can produce the list, this page
gives the command and no list. Where a number matters, it gives the command that
computes it from source. A number you copied from upstream, or from a doc, is a
guess.

---

## 0 · Identity, before the first commit

Local git config is not part of a clone, so a fresh checkout, container or agent
sandbox inherits whatever global identity is present. This has already produced
six wrongly-authored commits.

```bash
git config user.name  'lora-dataset-studio'
git config user.email 'noreply@lora-dataset-studio.dev'
git config --list | grep -E '^user\.'
```

No AI attribution of any kind in a commit message, trailer, comment, doc or
generated file — no `Co-authored-by:` naming a model or bot, no model or vendor
names, no `Signed-off-by`/`Generated-by`/`Assisted-by`, no "Generated with"
footers. Human credit is *required*, not banned: adopted upstream work keeps its
human attribution, and community-sourced fixes name their author.

A bad author or trailer already committed is fixed with `commit-tree`, **never
`rebase`** — a rebase across a sync rewrites the merged upstream commits too and
breaks the fork's ancestry.

## 1 · Baseline BEFORE fetching

Run it the way CI does — **from the repo root**, which is a different rootdir and
`sys.path` than running from `backend/`.

```bash
python -m pytest backend/tests -q -rf 2>&1 | tail -60 > /tmp/baseline-backend.txt
cd frontend && npm test 2>&1 | tail -20 > /tmp/baseline-frontend.txt && cd ..
```

**No baseline = no merge.** The baseline must both collect *and* execute on the
pre-merge tree; a run that starts before the merge and finishes against merged
files is not a baseline. Record the failure **list**, not just the total.

### Expected failures on a dev box

**Know which OS each CI job runs on before you call anything "environment".**
`.github/workflows/ci.yml`: **backend tests run on `windows-latest`**; the
frontend job and the gate run on `ubuntu-latest`. So a Windows-specific backend
failure is *not* a local quirk — CI reproduces it exactly.

| Test | Status |
|---|---|
| *(none)* | There is currently **no accepted environment failure.** Everything must be green. |

That is the whole list as of 2026-08-06, and the shortest it has been.

**"Everything must be green" means green on CI, and CI is Windows — a LINUX box
is a different question, measured 2026-08-09.** Running the whole backend suite
in a Linux container gave **67 failed / 6818 passed**, while CI run #102 on the
very same commit was **green on all four jobs** (backend `windows-latest`,
56m 14s). Every one of the 67 was a path-separator artifact: fixtures across
`test_studio_service.py`, `test_krea_training_bases.py`, `test_comfyui_utils.py`
and the rest build model names like `z image\lora_bbb_….safetensors`, which is
correct on the OS CI runs and unresolvable on this one.

**This is NOT a table row, and must not become 67 of them.** It is a property of
the platform, and the way to use it is the way this sync did: take the pre-merge
baseline, diff the post-merge list against it, and investigate only the DELTA.
That reduced 67 failures to one question worth answering — and the answer
(upstream's own new test, reproduced failing on pristine detached `upstream/main`
with a clean `git status`) took minutes rather than a triage of the whole floor.
On a Linux box the frontend job is your fast signal, since it is `ubuntu-latest`
and therefore identical to what CI runs.

Read the two paragraphs below before you add a row: **every entry this table has ever
carried was eventually removed as wrong** — the peer-training four because they
were a real bug CI had been red on for three pushes, the OpenCV one because its
reason had quietly expired.

**A stale dev env is not an environment failure.** The current way to get this
wrong is `test_zimage_convert_streaming.py`: 1 failed + 4 errors, all
`ModuleNotFoundError: No module named 'safetensors'`. That box is not missing
something CI happens to have — `safetensors>=0.4` has been declared in
`backend/requirements-dev.txt` since 2026-08-04 (`2912e86c`), so the box is
simply behind that file. It is a stale virtualenv wearing an environment
failure's clothes, and the fix is one command, not a table row:

```bash
python -m pip install -r backend/requirements-dev.txt
```

The trap has a shape: this suite `importorskip`s **Torch**, and a dev box that
has Torch but not `safetensors` sails past the guard and dies on the import.
`requirements-dev.txt` says so in its own comment, which also records that the
box used to get `safetensors` transitively — so when that stopped being true,
nothing announced it.

**The row this table used to carry was stale for the same reason, in reverse.**
`test_watermarks.py::test_prefill_falls_back_to_telea_when_lama_absent` was
recorded as "OpenCV is absent here" and left standing after
`opencv-python-headless` was declared on 2026-07-28 (`7a6ca302`) and installed.
Measured 2026-08-06: `test_watermarks.py`, **134 passed**. The row outlived its
fact by a week, and a table entry nobody re-measures is a place for a real
failure to hide — which is precisely what the warning below was written about.

**This table is a snapshot, not a licence.** Confirm each against your own
baseline run. A failure not in this table is damage, whoever wrote the test —
and a failure *in* it is damage too once the reason expires. Three questions
before you write a row: name the CI job and read its `runs-on`; check whether
the package is already declared in `requirements-dev.txt` (if it is, your env is
behind, not excused); and re-measure the rows already here.

> **How this table earned its warning.** On 2026-08-05 four
> `test_peer_training_over_http.py` failures were recorded here as
> "Windows-only, green on CI's Linux" and carried through a whole sync as
> accepted baseline. The backend job runs on **Windows**, so CI had been red on
> them since the file landed — three pushes in a row. The reasoning failed at
> the cheapest possible check: reading `runs-on` for the job that was failing.
> They are fixed now (`newline=''` on both the mirror and its test double; a
> platform-aware separator assertion). **Before writing a failure off as
> environment, name the CI job, read its `runs-on`, and say why that OS differs
> from yours.** "It's a Windows thing" is not a reason when CI is Windows.

Confirm CI's verdict directly rather than inferring it:

```bash
gh run list -R socrasteeze/lora-dataset-studio --limit 5
gh run view <id> -R socrasteeze/lora-dataset-studio --log-failed
```

`gh` defaults to the **upstream parent** for a fork, so a bare `gh run list`
shows perfectgf's CI, not yours. Always pass `-R`.

## 2 · Recon the window

```bash
git fetch upstream
git log --oneline HEAD..upstream/main        # read EVERY message — this is ground truth
git rev-list --left-right --count HEAD...upstream/main
```

If the incoming count looks implausible, **fetch again** — a stale ref once
reported 123 incoming commits on a window that was already merged.

`git diff --stat HEAD..upstream/main` is **not** a summary of what is new: it
re-lists the fork's entire historical divergence, and its cloud hits are the
fork's own removals. For a scoped question diff `merge-base..upstream/main`.

Classify every commit adopt / adopt-with-split / reject **before merging**, and
report the classification. Commit messages usually name a rejected feature
outright.

## 3 · Merge, then count before resolving

```bash
git merge upstream/main
grep -rn '^<<<<<<< HEAD' -- . ':(exclude)frontend/dist' | wc -l
```

Count the regions before touching one, and assert that count in any script. A
file that "looked like two conflicts" had four; the two unseen ones were ~340
lines of an entire rejected lane.

### Git mechanics that have cost real time

- **`git checkout --ours -- <file>` is a NO-OP on a file git auto-merged.** It
  resolves *unmerged* paths only. For an auto-merged path it exits 0, prints
  nothing, and changes nothing — so a batch revert can silently leave one file
  carrying upstream's version. This bit **twice in one sync** (2026-08-05):
  `frontend/src/utils/trainingMode.js` and
  `backend/tests/test_full_transformer_training.py`. Lint passed, the build
  passed, and the second one only surfaced in the full backend suite.
  **Use `git checkout HEAD -- <file>`**, then verify:
  ```bash
  git diff HEAD --stat -- <file>     # empty == really reverted
  ```
- **`git checkout --theirs <file>` is a WHOLE-FILE revert, not a hunk one.** On a
  one-hunk conflict it silently restored an entire rejected lane with zero
  markers left and a clean `--diff-filter=U`.
- **`modify/delete` means upstream MOVED the file**, not that it vanished. Find
  where with `git log --diff-filter=A -- '**/<name>'` on `upstream/main`, and
  re-apply the fork's hunks on the new path before deleting the old one.
- **`git add -A -- . ':(exclude)frontend/dist'` does not unstage dist.** The
  pathspec governs what `add` *adds*; anything already in the index from the
  merge stays. Use `git restore --staged frontend/dist` before a source commit.
- `.gitattributes` carries `frontend/dist/** -merge`, so git never content-merges
  the served bundle. Do not remove it: dist is the one path that reintroduces
  removed UI with no source change.

### Resolution rules

- **Per hunk, never per file.** Upstream ships legitimate and rejected work in
  one hunk routinely. A whole-file revert is justified only after confirming
  every changed line traces to the one rejected feature — check with
  `git log --oneline <pre-merge-HEAD>..upstream/main -- <file>`; if only the
  rejected commit touched it, a wholesale revert is safe.
- **Adjacent-import conflicts are usually keep-BOTH.** Taking one side drops a
  symbol the file still uses.
- **Prepend-vs-prepend** (`whatsNew.js`, README rows): keep both, upstream's on
  top, minus rejected-feature entries. Upstream now *appends* What's-new entries
  at the tail (ordering is by date, not array position) specifically to stop this
  class of mangling — follow that convention.
- **`frontend/dist` conflicts**: never take upstream's bundle. Revert to the
  fork's, and rebuild in step 6.
- Before deleting a symbol belonging to a rejected feature, `grep -rn` it across
  `backend/ frontend/src/` and confirm zero callers.
- **Recompute counts and defaults from this fork's source** — see §5.

## 4 · Sweep the whole tree

Rejected plumbing lands with **zero conflict markers** in files the fork did not
touch. Conflict resolution alone misses it; this step is what catches it.

```bash
# Divergence 1 — cloud image engines
grep -rln "chatgpt\|nanobanana\|ChatGPT\|Nano Banana\|GEMINI_API_KEY\|OPENAI_API_KEY\|openrouter\|OpenRouter" \
  backend/app backend/tests frontend/src frontend/tests docs

# Divergence 4 — remote-GPU / dense training. D4 is now the LARGER surface:
# it produced six marker-less leftovers in the 2026-08-04 window alone.
grep -rln --exclude-dir=__pycache__ "dense_artifacts\|dense_local_delivery\|dense_pod_hub\|dense_weights\|dense_fp8_delivery\|fp8_local_delivery\|cloud_quantize\|hf_storage\|hfStorage\|HfStorageCard\|hub_presence\|useHubPresence\|pod_transfer_plan\|pod_checkpoint_push\|podTransportChoice\|DenseModelsPanel\|DenseBasePicker\|CloudQuantizeButton\|denseModels" backend/app backend/tests frontend/src frontend/tests docs
```

Deliberately **excludes** `vast.ai` / `VAST_API_KEY`: those live all through the
dormant cloud-training backend this fork KEEPS, and including them turned a
3-hit sweep into 70 hits of legitimate code. A sweep that cries wolf gets
ignored, which is worse than no sweep. Expected clean output as of 2026-08-05 is
three benign hits: `helpRegistry.js` (search keywords), the
`fp8-quantize-doors-contract` test (it guards the boundary), and this page.

**The most reliable finder is not the phrase list — it is grepping for the
identifiers of the feature you just rejected**, because that asks what the merge
*kept* rather than what it asked you about. After rejecting a feature, grep its
own symbol names across the tree.

Also check by hand every sync: `frontend/src/whatsNew.js`,
`frontend/src/help/helpRegistry.js`, `frontend/src/hooks/useDataset.js` (the new
callback *and* its slot in the returned object), the consuming component's
button/modal wiring, `backend/app/services/dataset_activity.py` `KINDS`, and
`docs/guide/**.md`.

`docs/guide/**.md` compiles into `frontend/dist`, so a contract test can go red
on a documentation line while `frontend/src` passes. Trace from the bundle:
`grep -o '.\{0,200\}<phrase>.\{0,200\}' frontend/dist/assets/*.js`.

### The re-delete list — derived, never recalled

```bash
comm -13 <(git ls-files | sort) \
         <(git ls-tree -r --name-only upstream/main | sort) | grep -v '^frontend/dist'
```

Every path this prints is a file upstream has and this fork deliberately does
not. **58 as of 2026-08-05** — roughly 33 in the Divergence-4 cluster
(`dense_*`, `pod_*`, `hub_presence`, `cloud_quantize`, `fp8_local_delivery`,
`hf_storage`/`hfStorage`, `DenseModelsPanel`, and their tests) and 10 in the
Divergence-1 cluster (`nanobanana`, `chatgpt*`, `openrouter`, `engine_errors`,
and their tests).

Run this **after** resolving. Anything it no longer lists came back in.

**Do not read this as "delete anything matching".** Some files upstream has and
the fork *maintains* in a local-only form — the reference-edit stack and
`engineSelection.js` are adopted (Divergence 1b/1c). The command above only
prints what is genuinely absent here, which is why it is safe where a
hand-written list is not.

## 5 · Recompute, never copy

A merged upstream test that pins upstream's number is wrong, not evidence.

| Value | Fork's value (2026-08-05) | How to recompute |
|---|---|---|
| Capability rows | **10** | `grep -n 'rows.length' frontend/tests/capability-destinations-contract.test.mjs` — and derive from `deriveCapabilitySummary`, not from upstream |
| One-time help tips | **12** (upstream 17) | `cd frontend && node -e "import('./src/help/helpRegistry.js').then(m=>console.log(m.helpTips().length))"` |
| Local-only contract | **8** frontend + **3** backend | `node --test frontend/tests/local-only-engines-contract.test.mjs`; `python -m pytest backend/tests/test_local_only_engines.py -q` |
| `DEFAULT_ENGINE` | `'klein'` | `grep -rn "DEFAULT_ENGINE" backend/app frontend/src` |

The capability count is the cautionary tale: FORK_NOTES described it as 12→9
while the contract test had already moved to 10. Trust the test, then fix the
prose.

## 6 · Gates — all of them, in this order

Each exists because the ones before it have a documented blind spot.

```bash
# 1 — bare-identifier tripwire. THE gate for the ReferenceError class; the
#     bundler resolves imports, not identifiers.
cd frontend && npm run lint
```

If the output is anything other than ESLint's own (e.g. `'eslint' is not
recognized`), the tripwire never fired — `npm install`, then re-run.

```bash
# 2 — import resolution
npm run build

# 3 — local-only contract, BOTH halves
node --test tests/local-only-engines-contract.test.mjs && cd ..
python -m pytest backend/tests/test_local_only_engines.py -q

# 4 — backend import sanity
python -c "import sys; sys.path.insert(0,'backend'); import app; app.create_app()"

# 5 — repo hygiene
python -m pytest backend/tests/test_no_personal_data.py \
                backend/tests/test_windows_scripts_are_ascii.py -q

# 6 — full suites, CI's own invocation, diffed against the §1 baseline
python -m pytest backend/tests -q -rf 2>&1 | tail -60 > /tmp/post-backend.txt
cd frontend && npm test 2>&1 | tail -20 > /tmp/post-frontend.txt && cd ..
diff /tmp/baseline-backend.txt /tmp/post-backend.txt

# 7 — attribution and identity, before EVERY commit including build(frontend):
git diff --cached | grep -niE \
  'co-authored-by|signed-off-by|generated-by|assisted-by|generated with|AI-assisted|claude|haiku|sonnet|opus|fable|mythos|anthropic|chatgpt|copilot|cursor|codex' \
  | grep -viE 'cursor-pointer|cursor-not-allowed|cursor-default'
git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD | sort -u
```

| Gate | Catches what nothing before it can |
|---|---|
| 1 lint | a hunk that kept a variable whose definition the resolution dropped |
| 2 build | an import that no longer resolves |
| 3 contract | a rejected engine or rental surface back in `src` **or** the served `dist` |
| 4 create_app | a backend import broken by a deleted module |
| 5 hygiene | personal data, non-ASCII in a `.ps1`/`.bat` |
| 6 full suites | a mounted assertion no grep reaches; a dangling call inside a handler |
| 7 attribution | a wrong author or an AI trailer, before it is published |

**Interpreting gate 6:** the diff *classifies* a failure, it does not excuse one.
The shipping gate is `.github/workflows/ci.yml`, which does not care who wrote
the failing test. Fix every failure red at HEAD; leave only the §1 environment
table. Green suites are necessary, not sufficient — gates 1–5 cover what they
cannot see.

**When something fails, prove whose it is before believing it is yours:**

```bash
git diff origin/main --stat -- <file>   # empty == identical to origin, not your damage
```

That one check settled a fourth peer-training failure in seconds on 2026-08-05.

### When an upstream test is structurally unsatisfiable here

Not every red upstream test is damage or environment. Upstream tests sometimes
encode an assumption about *upstream's implementation shape* that this fork's
implementation makes impossible.

2026-08-05: `test_bank_scan_no_db_lock.py::test_the_walk_really_did_hold_the_lock_before`
is a control that re-adds the old autoflush and asserts a concurrent writer is
blocked. Upstream's loop mutates ORM rows, so the flush has dirty state and takes
the lock. This fork stages every write as plain data and holds no ORM row, so the
flush is a no-op and the probe can never fire — it failed because the fork
*removed the cause*, while the sibling asserting the real property passed.

Adapt such a test so it still proves what it was written to prove, record it
under Divergence 5, and say why in a comment. Deleting it is the easy call and
the wrong one — it was guarding its sibling against being vacuously green.

## 7 · Document, commit, hold

1. **`FORK_NOTES.md` in the same commit as the merge** — a changelog row, plus
   edits to any divergence section this sync changed.
2. **`frontend/src/whatsNew.js`** — one benefit-first entry per user-visible
   feature adopted. Release notes are generated from this file's diff since the
   last tag, so skipping it costs a release, not just a panel line. Reword an
   adopted entry whose prose assumes a lane this fork does not have.
3. **`frontend/src/help/helpRegistry.js`** — a topic for any new setting,
   section, page or big button, or the contract test fails.
4. **`docs/guide/settings-reference.md`** for changed settings; **README** when
   the wave changes what the tool can do — or when a section now describes
   something no longer true. That second question is the expensive one.
5. **Source-only commit first**, then rebuild and commit `frontend/dist`
   separately as `build(frontend):`. Re-run the contract test against the
   rebuilt bundle, and gate 7 against that commit too.

```bash
git restore --staged frontend/dist          # dist never rides with sources
git commit -F <message-file>                # a file, not -m: backticks in a
                                            # message get run by the shell
cd frontend && npm run build && cd ..
git add frontend/dist && git commit -m "build(frontend): rebuild dist — <what>"
```

**Never push without explicit confirmation. Never force-push, ever, without a
separate confirmation naming force-push.** Never write to GitHub — comments,
reviews, releases — through a personally authenticated `gh`; reads are fine.

If the push is rejected because `origin/main` moved, **merge, never rebase**, and
rebuild dist from the merged source rather than picking either side's bundle.

## Hard stops

- Setup shows "Image generation" with Gemini/OpenAI key fields → the dist is
  stale or hostile. Rebuild from fork source. Do **not** "fix" it by re-adding
  engines.
- Working tree dirty at step 0 → stop and ask.
- No pre-merge baseline → do not merge.
- Any gate red → do not commit dist, do not push, fix first.
- Lint output that is not ESLint's own → gate 1 did not run.
- About to strip an emoji → stop. That divergence is retired; this app uses
  emoji as controls and stripping them left real buttons blank.
- About to re-delete a file from a remembered list without re-deriving → stop.
  Part of that list is now maintained here, local-only.
- Git identity not matching `CLAUDE.md` → stop, ask, do not commit.
- An `API_ENGINES` membership test surviving as dead code → delete the branch.
  Dead references to deleted concepts are the trap pre-detonation.

## Where the rest lives

| Question | File |
|---|---|
| What diverges, and why | `FORK_NOTES.md` — divergence sections |
| Why a past sync went wrong | `FORK_NOTES.md` — merge diagnostics, changelog |
| Identity, privacy, shipping checklist, releases | `CLAUDE.md` |
| Contributing *to* this fork | `CONTRIBUTING.md` |
| Sending a PR **upstream** | `CLAUDE.md` — that is a different procedure, and
  upstream's own `CONTRIBUTING.md` and PR template are the authority there |
