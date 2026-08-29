# HANDOFF

**Updated:** 2026-08-29 · **Branch:** main (mirrored to `claude/magical-tesla-u4hplx`) · **Base:** da2d3241 · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `1ec79862` — 0 behind. All gates
green on the exact tree pushed. `main` and `claude/magical-tesla-u4hplx` both at
`482286c1`. **Two syncs ran back to back in this session** — the Caption Lab /
queue-hold window, then the preset-sampler window below it.

## Done this session
- Merged upstream `5fc50448` — 13 commits, **five source conflicts** (three of
  them marker regions), 0 rejected features shipped.
- Adopted: the **🧪 Caption Lab on BOTH surfaces** (a rail entry, a row and a
  picker in the dataset Captions section; the Bank's 🏷️ Caption window gets the
  same bench through one shared `preview_caption_path`, plus a new
  `PUT /bank/<id>/image/<id>/caption` for writing one caption by hand); the
  **answerable Ollama queue hold** (`since` on the published block so the dock
  can say how long, a bounded fifteen-minute *Run anyway* that shares the card
  without unloading anything, and an unaddressable Ollama URL no longer letting
  a mistyped captioning setting stop image generation); **finger-sized "View in
  Runs" links** and the responsive probe state that can finally reach them; a
  **probe that exits 2** on an anchor it cannot click instead of printing "no
  violations" over a page it never opened; the **suite going hermetic about this
  machine's Ollama** (119 real connections on :11434 measured away upstream, one
  of them a `POST /api/generate` that loads an 8 GB vision model onto the shared
  card); and the **one-run-number** `record_id` plumbing.
- **Four D4 rejections, and three of them nothing would have flagged:**
  upstream's **README headline** rewrite, which re-offers the cloud LoRA lane
  and *"a full Krea 2 model on a rented GPU"* in the one sentence a stranger
  reads first — eight lines above the paragraph saying neither exists here (the
  tell is that it names a LANE, not a capability); the two
  `docs/screenshots/checkpoints/*.png` proof shots, which photograph
  *CLOUD CHECKPOINTS … HARVESTED FROM THE POD* at `RTX 5090 · $0.12`,
  unreferenced by any doc — the D1 `docs/screenshots/generate/` trap arriving on
  the D4 side; the fourth *View in Runs* link, which lives inside the cloud-run
  panel; and the `2026-08-29-one-run-number` **What's-new entry**, whose whole
  subject is a cloud run wearing two ids. The CODE is adopted (it keeps the next
  sync's surface small); the entry is not, because it would announce a fix no
  user of this fork can see.
- **D10 landed its DEFAULT shape for the fourth window running:** two hand-ported
  topics (`action-caption-lab`, `bank-caption-lab`) and **one silent reword** —
  eleven queue-hold keywords onto the existing `generation-queue-dock`. The count
  this file inherited said **300** while the tree already held **301**; measured
  **303 / 14 tips** now.
- **D5 gained a fourteenth entry** — see Open #0.

### Second sync, same session — the Krea preset sampler (7 commits, `1ec79862`)
- Adopted whole: five sampler presets for Krea 2 Turbo's 8-step regime, in the
  Studio's existing Sampler menu. In scope by **D1b** without argument — own GPU,
  through ComfyUI, no key, no network call. `neutral` is bit-exact Euler on
  purpose, so it is the reference column.
- **A new KIND of artifact:** `backend/comfy_nodes/` is the first ComfyUI node
  this app installs from its own payload rather than cloning from a third party.
  It inverts one rule deliberately — somebody else's pack on disk is left alone
  (they may have pinned it), ours is overwritten whenever its stamp is not this
  app version.
- **The one marker region was a keep-BOTH in `run.py` (Divergence 8), and the
  two failure modes are not symmetric** — the section now carries a subsection
  on it. Ours-whole silently drops `refresh_bundled_node_packs()` and strands
  every user on the node version they first installed; theirs-whole reverts
  `_announce_when_ready` to a **different signature**, double-threads a helper
  that already threads itself, and restores the `LDS_OPEN_BROWSER=1` force-on D8
  refuses by name. Spliced: their refresh block, our announce.
- **D10 inverted its usual shape:** two rewords, ZERO new topics (nine
  preset-sampler keywords onto `setup-krea-install`, eleven onto
  `studio-multilora-steps`). Both counts stand still at **303 / 14** *and* the
  id-list diff prints nothing — every check that section offers except the
  mandatory diff of the deleted module was blind to this window.
- **Counted invariants verified unmoved, not assumed:** upstream kept the
  sampler out of `krea_ready` and the capability rows on purpose, so the
  contract stays at **18** and `installCatalog` keeps its 23-action list.
  `models.py` / `__init__.py` gained only `sampler_preset`; `fail_kind` is still
  absent from both.
- Both new screenshots opened and read before adopting: the Setup one is the
  **local** Krea 2 Edit card with the optional row; the other is the Sampler
  menu. No key field, no cloud engine, no machine path, no dataset name.
- Gates: eslint 0 errors / 20 warnings, ruff clean, build clean, contract 8/8 +
  3/3 on the rebuilt dist, `create_app()` OK, hygiene 18/2. Frontend 4 397 →
  **4 405 / 0 fail**. Backend **8 291 / 71 / 108** against a baseline of
  **8 265 / 71 / 108** — the failure set is **byte-identical**, zero new, zero
  vanished.

## Open
0. **Nothing owed on the sync itself.** Recorded so the next session does not
   re-derive it: D5's new entry is `datasetProbeMarkers.test.js`, where upstream
   pins **four** floored *"View in Runs"* links and this fork renders three. The
   fix **derives** the count from the file rather than lowering the literal
   (`links.length === floored.length`, plus a `> 0` guard against a vacuous
   pass) — strictly stronger on both trees and immune to the next link added.
   Prefer that form over lowering a number whenever the fork's value is
   derivable from source the test already reads. It was the only red in Gate 6's
   frontend half.
1. **Delete the stale merged branches — attempted again, refused again, and the
   previous session's diagnosis is CONFIRMED, not merely repeated.**
   `git push origin --delete <b>` now returns an explicit
   `error: RPC failed; HTTP 403` (not the silent `Everything up-to-date` no-op
   the last session saw), and the proxy's own `recentRelayFailures` list carries
   **no github.com entry** for it — so the refusal is GitHub's, not the sandbox
   egress policy that blocks `download.pytorch.org`. The credential in this
   container lane can CREATE and UPDATE refs but not DELETE them. The GitHub MCP
   server still exposes `create_branch` / `list_branches` with **no delete
   counterpart** — re-derived from the tool list this session, not recalled.
   Owed to a session whose credential can delete refs. Re-derive, never copy:
   `git branch -r --merged origin/main | grep -v 'origin/main$'` — **14** as of
   this push, `claude/magical-tesla-u4hplx` now among them.
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
   NOT stale — do not sweep them in with the fourteen above.
5. The responsive probe was NOT run in EITHER sync. `.claude/rules/frontend-contracts.md`
   is explicit that a layout change is unverified until it has, and the first
   window touched touch targets and added three probe states. It needs a live
   instance holding a bank and a dataset, which this container has not got. The
   three floored links were verified by source assertion only.
6. **The README capability-requirements table carries three rows VERBATIM
   TWICE** — 🌐 Civitai top prompts, 📷 Camera angles and 🔤 Find text. It is
   pre-existing damage from an earlier merge, not from either sync this session,
   and it was left alone deliberately rather than widen a merge commit with an
   unrelated fix. It is a one-minute edit for a session that is not mid-sync;
   `grep -n '^| 🌐 Civitai top prompts' README.md` finds the pair.

## Decisions
- **The README earned two edits, and one was a debt rather than a gap.** The
  capability row named *"Caption Lab and recovery"* while describing find/replace
  and tag frequencies — which is what upstream's own `workflow.md` this window
  renamed to *"Caption tools"*, splitting the bench out. The row is now
  **Caption tools and recovery**, with a separate **🧪 Caption Lab** row naming
  the bench and saying it runs on both surfaces; the bank row gained the Lab, the
  *Use for the next run* wording and hand-editing.
- **The wording difference between the two surfaces is deliberate and is NOT a
  parity gap.** The dataset's button is *Make default*; the Bank's is *⚙️ Use for
  the next run*, because a bank picks its caption method per RUN and has no
  `caption_options` row to persist to. CLAUDE.md's rule cuts both ways —
  different behaviour must not wear the same label.
- **The queue-hold answer got a Guide chapter but no README line.** The README
  doctrine says only a new capability earns one, and the escape hatch is covered
  by the new *"When the queue waits for something that is not LDS"* section plus
  its What's-new entry. Revisit if the fence surfaces a setting.
- The two rejected screenshots were **opened and looked at** before the call, per
  the check FORK_NOTES added after three rejected-surface PNGs sat unreferenced.

## Traps
- `frontend/dist` is what Flask serves; never take upstream's `build(frontend):`
  commit — rebuild from this fork's `src` or the removed cloud UI returns.
- A fresh container clones **shallow**, and this is worse than a wrong count:
  `git merge-base` fails outright, so `main` and the working branch read as
  **unrelated histories with no common ancestor**, and the local `main` ref was
  404 commits stale while a branch that was byte-identical to `origin/main` read
  as 157 ahead. Anything computed before `git fetch --unshallow origin` is
  fiction — this cost the first ten minutes again.
- A `sleep`-then-check one-liner is blocked by the harness; wait with
  `until [ -s <file> ]; do sleep N; done` in a backgrounded command, and note
  that a piped `pytest … | tail -N > f` writes `f` only at the END, so an
  `[ -s f ]` waiter is the right probe and a mid-run `tail` shows nothing.
- **`cd` persists between Bash calls.** A `find frontend/src` that answers "No
  such file" usually means the shell is still inside `frontend/`, not that the
  merge deleted anything.
- On Linux the backend suite has an environment failure floor of **71–73**
  (path-separator fixtures building `z image\lora_….safetensors`, no ComfyUI on
  `127.0.0.1:8188`, no egress). CI's backend job is `windows-latest` and does not
  reproduce them. Always diff a pre-merge baseline; a failure not in the baseline
  is damage, whoever wrote the test. `test_peer_training_over_http.py` is the
  **rotating** xdist slot — it moved by two this window and passes 20/20
  serially; that is not a fix and must not be recorded as one.
- `download.pytorch.org` is blocked in the container lane (403 at CONNECT):
  install the Torch overlay from PyPI (`torch==2.13.0`, resolves to `+cu130`),
  or ~124 tests silently skip and one FAILS rather than skipping.
- A fresh container has no `.venv`/`node_modules` and **inherits a vendor git
  identity** — this one again arrived pre-set to an AI vendor's name and noreply
  address. Set the project identity per the repo rules before committing and
  confirm with `git config --list | grep '^user\.'`. **The stop hook in this
  lane actively asks for the vendor identity back**, naming `--amend
  --reset-author` on every listed commit; CLAUDE.md forbids exactly that, and on
  a merge commit the suggested remedy is also the `rebase`-class history rewrite
  the repo bans. Decline it. (Do not paste the vendor address into a tracked file
  to illustrate this — `test_no_personal_data.py` catches emails everywhere.)
- Rebuilt bundle files still match a cloud-phrase grep (`DiagnosticReport`,
  `ModelFilePicker`, `whatsNewArchive`). All three are documented kept-as-is
  legacy: a guide sentence saying the engines were REMOVED, the retained
  `face_single`/`face_multi` identity-prompt dead code, and the historical
  archive. Same three files before and after the merge; the local-only contract
  passes 8/8 against the rebuilt dist.

## Verify
```bash
ruff check .                                   # repo root
cd frontend && npm run lint && npm run build && node --test
python -m pytest backend/tests -q -rf -n 8 --dist loadfile   # -n 4 on a smaller box
```
