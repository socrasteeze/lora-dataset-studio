# HANDOFF

**Updated:** 2026-08-31 · **Branch:** main · **Base:** 9b1a912 · **Tree:** clean

## State
Level with `perfectgf/lora-dataset-studio` at `4d21222` — 0 behind, all gates
green on the tree pushed. The window was **30 commits**; its one real decision
was a 212-line rented-pod region whose HEAD side was empty.

## Done this session
- Merged `261f60a..4d21222` — ten conflict regions, four `modify/delete` —
  `1f82ff3`; dist `65a7805`; Gate 6 verdict `9b1a912`
- **Adopted, all local-lane:** watermark **zone hunt**, **every zone surviving
  the scan**, the **scan-honesty** wave, the **Detection engine** selector,
  **⚖ Compare Klein models**, the Bank's **⤢ Compare** lightbox and refill fix,
  **≠ not duplicates** (stored as PAIRS, surviving each pass's renumbering),
  **C12-B** caption budgets and Audio line, the foldable video sets section.
- **Refused (D4):** the rented-pod video lane re-entering
  `routes/video_datasets.py`; the cut comment now names the seventh route.
  `VideoTrainingBlock.jsx` took the **Beta chip** and left the 🗑 delete-run
  button — it hangs off checkpoint groups this build does not render.
- **The one that mattered:** `resolve_dups` keeps the fork's batched `by_group`
  read AND takes upstream's `unresolved_dup_group_ids()` in the `else` —
  half-adopting ≠ would let "Resolve ALL" reject copies a user had just kept.
- D10 port: 308 → **310 topics / 14 tips**; D5 gained `test_klein_compare.py`;
  changelog row, D5/D4/D10 edits — `FORK_NOTES.md`

## Open
1. **Two merged branches still need deleting** — `claude/magical-tesla-ekn21b`
   and `claude/magical-tesla-tydc3z`, both fully contained in `main`. This
   sandbox gets **HTTP 403** on a ref delete (push works, delete does not, and
   the GitHub MCP server has no delete-branch tool). Owed from a machine with
   full push rights; third session running.
2. Responsive probe still NOT run, owed a third time: `DupCompareLightbox.jsx`
   is a new full-screen layer. Needs a live instance holding a bank.
3. Fork-only controls still carry emoji while upstream's use icons (D3 wave).
4. `no-unused-vars` is at `warn` (D9): **20 warnings, baseline-identical** —
   pre-existing D1/D4 orphans — `frontend/eslint.config.mjs` L64.
5. `training/runs-hub.png` and `advanced-options.png` still photograph the
   rental lane; referenced by `docs/guide/workflow.md`, so they need a
   re-shoot rather than a delete. Carried from three syncs.

## Decisions
- **`videoDatasetCloudRunUrl` is KEPT** in `videoBankApi.js`: all six such
  builders have zero consumers here and always have. The test is "does it
  SURFACE", not "is it called".
- **The video-lane help reword was re-homed, not dropped:** upstream's keywords
  landed on its rejected `video-cloud-training` topic; `beta` moved onto
  `video-train-local`, the delete-a-run terms went with the button.
- Kept the fork's `## Promote a shortlist out of a bank` heading over
  upstream's rename — `helpRegistry` anchors on it.

## Traps
- **`test_peer_training_over_http.py` flakes under xdist — fourth sync running.**
  Two reds one run, one the next, 20/20 alone. Replay before believing it.
- Linux floor here is **71 backend failures**; CI runs the backend on
  `windows-latest`. Diff the failure LIST against a baseline, never the total.
- `.venv` must carry the Torch overlay or ~124 tests silently skip.

## Verify
```bash
.venv/bin/python -m pytest backend/tests -q -n 8 --dist loadfile
.venv/bin/python -m ruff check .
cd frontend && node --test && npm run lint && npm run build
```
