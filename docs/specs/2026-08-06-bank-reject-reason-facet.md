# ✕ Why — the reason an image is in the bin

Date: 2026-08-06

Direct successor to [`2026-07-31-bank-duplicate-badge.md`](2026-07-31-bank-duplicate-badge.md).
Read that one first: this wave repairs an invariant that spec **stated in its own
Decisions section** and did not deliver.

## Why

Reported: *"there's duplicates that got autorejected, but when I try to filter by
duplicates it still shows 0 and nothing found."*

The ≈ chip is right, again — and this time for the opposite reason to the July
bug. `_unresolved_dup_groups_q` counts a group as open while it holds **≥2
non-rejected members**. `resolve_dups` keeps the best copy and rejects the rest,
leaving exactly one, so a bank auto-reject has been through honestly has nothing
left to resolve. One predicate drives three surfaces at once, and all three
correctly go quiet together:

| surface | source |
|---|---|
| the ≈ Duplicates chip | `bank_payload` → `dup.unresolved` |
| the `flag=dups` grid query | `_apply_facets` |
| the resolution panel's "nothing found" | `dup_groups_payload` |

What was wrong is what that leaves behind. The July spec's fourth Decision reads:

> **`flag=dups` deliberately still includes a still-open group's already-rejected
> member.** Adding `status != 'reject'` would make `reject ∩ dups` always empty
> and destroy "show me the duplicates I rejected".

The clause was dropped at the **row** level and left at the **group** level,
inside `_unresolved_dup_groups_q`, which is strictly stronger: rejecting the
losers removes the whole group from the subquery, rejected members included. So
`status=reject & flag=dups` *was* always empty, and the sentence describing what
must not happen described what did.

There was no fallback either. `_apply_facets` had no `reject_reason` facet at
all, so ✕ Rejected was one pile of duplicate + blur + uniform + manual + nsfw
whose only distinguishing mark was a text badge on each tile. On the reporter's
own bank shape — 6,887 rows rejected as duplicates — nothing could select them.

## How it works

A **new facet beside `status`**, not a change to any duplicate predicate.

- `REJECT_REASONS` is **derived** from `_QUALITY_FLAGS + _SCORE_FLAGS` plus the
  three reasons no flag produces (`duplicate`, `semantic_dup`, `manual`).
  `auto_reject_by_flags` writes the flag id *itself* as the reason, so a
  hand-copied list would be a release behind — which is the shape of the bug
  this facet exists to end. `REASON_KEYS` adds `unrecorded` for NULL.
- `_reason_case()` is `COALESCE(reject_reason, 'unrecorded')`, used to **count
  and to filter** — the `_angle_case` discipline, so a chip cannot print a
  number the page it opens does not have.
- The `_apply_facets` predicate is two equalities:
  `status == 'reject' AND _reason_case() == reason`.
- Counts land in both maps, per `bankFacetCounts.js`' rule: `bank_payload`
  (bank-wide) decides a chip **exists**, `facet_counts` (filtered) decides what
  it **prints**.
- The frontend row is gated on `filter.status === 'reject' || filter.reason`.

## Decisions

- **The reason predicate carries its own `status = 'reject'`; it does not write
  the status facet.** Three reasons, in order of weight. (1) `reject_reason` is
  NULL on every *pending and kept* row, so `reason=unrecorded` without that scope
  returns the whole undecided bank —
  `test_the_unrecorded_bucket_never_counts_an_undecided_image` is the guard.
  (2) A chip toggles its own facet and nothing else, the rule written into
  `BankWorkspace.jsx` after the score chips silently cleared the cluster.
  (3) `facet_counts`' `pool('status')` must lift only status.
  Consequence, accepted: `status=keep & reason=blur` is honestly **empty**
  rather than silently switched to ✕ Rejected behind the user.
- **`unrecorded` is a selectable bucket, not a silence.** `by_bucket` drops NULL
  keys by design ("never classified is not a bucket"); the coalesce means there
  are none. On a bank triaged by an older build this bucket may hold everything,
  and a row that cannot be reached is the same defect one level down.
- **"All" clears `reason`; the ✕ Why chips do not clear anything.** "All" is the
  status row's reset, and `reason` is a sub-facet of status — leaving it behind
  would light "All" up over a grid showing only rejected duplicates.
- **Read-only.** The facet selects; it never un-rejects and never re-picks a
  group's keeper. Re-picking a *resolved* group was considered and declined this
  wave — see non-goal 1.
- **No `order` override.** A reason is a label, not a measure. The active sort
  or id order applies (the `_SORT_KEYS` rule).

## What was deliberately NOT changed

`_unresolved_dup_groups_q`, the `flag=dups` branch, `dup.unresolved` and
`dup_groups_payload` are untouched. `status=reject & flag=dups` (rejected members
of a still-**open** group) and `status=reject & reason=duplicate` (everything
rejected **as** a duplicate) are two different questions; the second must not
replace the first. Merging them turns `test_bank_dup_live_badge.py` red, which is
the intended alarm.

One trap for an implementer: `test_the_live_lookup_is_once_per_page_not_once_per_row`
spies on statements containing `HAVING`. This design adds none — `_reason_counts`
is a plain GROUP BY, the filter is two equalities — and it must stay that way.
`_reason_counts` is called only from `bank_payload` and `facet_counts`, never
from `list_images` / `_page_images`.

## Key files

- `backend/app/services/image_bank_service.py` — `REJECT_REASONS`/`REASON_KEYS`,
  `_reason_case`, `_reason_counts`, `FACETS`, `_apply_facets`, `list_images`,
  `facet_counts`, `bank_payload`
- `backend/app/routes/bank.py` — `reason` on `/images` and `/facets`
- `frontend/src/components/bank/bankRejectReasons.js` (+ its test)
- `frontend/src/components/bank/BankWorkspace.jsx`, `bankFacetCounts.js`,
  `bankFilterSummary.js`, `DupGroupsPanel.jsx`
- `backend/tests/test_bank_reject_reason_facet.py`

## Limits (keep visible)

- **A filter, not a repair.** Nothing is un-rejected; which copy of a duplicate
  group survived does not change.
- **A reason is what the app decided at the time**, at the thresholds then in
  force. Re-tuning 🎚 thresholds does not rewrite it.
- **`unrecorded` cannot be backfilled.** The reason was never written; no pass
  can recover it.
- **The ≈ Duplicates chip still counts GROUPS while `flag=dups` returns their
  member IMAGES** — three open pairs read "≈ Duplicates 3" over a grid of 6.
  Pre-existing, untouched, and now the last surviving gap in the "the number on
  a chip is the number it opens" invariant. See non-goal 2.

## Non-goals (this wave)

1. **Re-pick the keeper of an already-resolved group.** The resolution panel
   filters to unresolved groups by definition; showing resolved ones means
   deciding what its count, its pagination and the ≈ chip's number then mean.
   Explicitly declined with the reporter, whose need was "look before deleting".
2. **Make the ≈ chip count images rather than groups.** A one-line change with a
   real question behind it: the panel's own header says "N unresolved group(s)",
   so the chip and the panel currently agree with each other and disagree with
   the grid.
3. **`_pool_query`'s copy of the composition** (the curation selectors) does not
   gain the facet. "Rejected for reason X" is not a candidate pool for a
   diversity pick.

Fixed in passing, because it sat in the object literal this change had to edit:
`clearAllFilters` never cleared `medium` or `angle`, so "Clear all" left those
chips narrowing a grid the header then called unfiltered.
