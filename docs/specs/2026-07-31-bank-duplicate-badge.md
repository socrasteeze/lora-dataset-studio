# The bank's ≈ / ✂ duplicate marks

Date: 2026-07-31

## Why

Reported: a bank's thumbnails were marked as duplicates while the ≈ Duplicates
filter showed nothing. The filter was right.

Measured on the reporter's own database before anything was designed:

| bank | rows carrying `dup_group` | unresolved groups | of those: already rejected | surviving singletons |
|---|---|---|---|---|
| 52 `misc` | 10,060 | **0** | 6,887 | 3,173 |
| 2 `anna_faith` | 2,266 | **0** | 1,665 | 601 |

Every group had already been resolved — those rejected rows *are* the
resolution. Two predicates were being asked over one column, and the tile had
the wrong one:

| | tile badge | ≈ chip + resolution panel |
|---|---|---|
| predicate | `dup_group != null` | `dup_group != null` AND `status != 'reject'` AND `COUNT(*) >= 2` |
| source | `_image_dict` | `_unresolved_dup_groups_q` |

`dup_group` is written by `rebuild_dup_groups`, whose only call site is the scan
job. Nothing clears it afterwards: `resolve_dups` / `resolve_dups_keep_best`
reject the losers and leave the ids, and `delete_rejected` drops the rejected
rows without regrouping, leaving the survivor alone in a group of one. So the
column only ever meant *"was once grouped"*.

## How it works

The live state is **computed per page, never stored**.

- `_live_dup_groups(bank_id, rows)` reuses `_unresolved_dup_groups_q` — which
  already takes a `col`, so it serves both the exact and semantic stages — and
  asks only about the group ids the current page actually carries. Cost is
  bounded by page size, not bank size; a stage with nothing grouped on the page
  costs no query at all.
- `_page_images` computes it once and hands it to `_image_dict`, where `live` is
  a **required** parameter. A default would let a future call site silently
  un-badge every tile, or silently restore the bug.
- `dup_groups_payload` renders up to 200 groups in a loop, so it computes `live`
  once over the union and passes it in — otherwise the two extra queries become
  four hundred.
- The payload keeps the raw `dup_group` / `semantic_dup_group` (they are
  history) and adds `dup_unresolved` / `semantic_dup_unresolved` beside them.
- `frontend/src/components/bank/bankDupBadge.js` decides what to draw and never
  re-derives the rule. A **missing** flag counts as resolved, so a stale cached
  payload degrades to a quiet tile rather than back to the bug.

`flag=dups` and `flag=semantic_dups` in `list_images`, and the same pair in
`_pool_query` (the curation selectors' candidate pool), now qualify through the
same subquery. That path feeds "Select all in filter" and ▶ Review, and
unqualified it handed back all 10,060 rows on bank 52 under a chip reading 0.

## Why clearing `dup_group` is the wrong fix

This is the change a future reader will reach for first, and it looks obviously
correct. It is not.

`bank_undo` snapshots **only** `(status, reject_reason)` — its module docstring
states that as a deliberate honesty boundary. Clearing the column on resolve
would therefore make undo restore the statuses while the group stayed gone:
neither the badge nor the resolution panel would come back.

`test_undo_brings_the_duplicate_group_back` defends exactly this. Verifying it
by reverting the shipped fix only makes it fail on a missing key — to see it do
its real job, add `setattr(r, attr, None)` to `resolve_dups._apply` and watch all
four of its assertions go red. That experiment was run before this shipped.

## Decisions

- **A resolved group draws nothing on the grid tile.** A tile badge is ~10 px and
  a rejected image already carries `✕ duplicate` from `reject_reason` (8,547 of
  the badged rejects did), which answers *why* far better than a group id can.
- **The lightbox keeps a qualified chip** — `≈ dup #7 · resolved` — because it has
  room to say it out loud, and it is where a reject is actually inspected.
- **A boolean, not a live member count.** The ">= 2 non-rejected" threshold lives
  in exactly one place (`_unresolved_dup_groups_q`), shared by the chip, the panel
  and the bulk resolver. Shipping a count would give that rule a second home in
  the client — which is precisely the drift that caused this bug.
- **`flag=dups` deliberately still includes a still-open group's already-rejected
  member.** Adding `status != 'reject'` would make `reject ∩ dups` always empty
  and destroy "show me the duplicates I rejected".

## Key files

- `backend/app/services/image_bank_service.py` — `_live_dup_groups`,
  `_page_images`, `_image_dict`, `list_images`, `_pool_query`,
  `dup_groups_payload`
- `frontend/src/components/bank/bankDupBadge.js` (+ its test)
- `frontend/src/components/bank/BankWorkspace.jsx`,
  `BankReviewLightbox.jsx`
- `backend/tests/test_bank_dup_live_badge.py`

## Limits (keep visible)

- **Existing banks are not re-grouped.** The marks disappear because they are now
  judged live, not because any data was repaired. `dup_group` still holds its
  historical ids, and only a re-scan recomputes them.
- **`bank_payload.dup.groups` / `.images` still mean "was once grouped".** Only
  `.unresolved` is live. See non-goal 2.

## Non-goals (this wave)

Good adds, deliberately not bundled — bundling them would blur what this change
is judged on.

1. **Make `≈N` clickable.** The badge would set `filter.group`; `list_images`
   already accepts `group=`, and only `filterParams` in `BankWorkspace.jsx` never
   sends it. The smallest of the three and the most user-visible: it turns a group
   id from decoration into navigation, and it is the honest answer to "what is
   this number for?" — which is currently *nothing you can act on*.
2. **Make `dup.groups` / `.images` live too.** Not a blind fix: the ✂ Same shot
   chip's *visibility* is gated on `groups > 0` while its *number* shows
   `unresolved`, so making `groups` live would hide the chip — and with it the
   panel that explains the state. Whoever changes it must first decide what the
   chip should do when a bank has duplicate history but nothing open. Accepted
   consequence for now: a bank can still show "✂ Same shot 0".
3. **Hoist `_promoted_dataset_by_image` out of `dup_groups_payload`'s per-group
   loop.** The same N-queries-per-page shape this wave fixed for the live-dup
   lookup, in the same function, but an unrelated cause.

Also noted, pre-existing and untouched: the ≈ Duplicates chip renders
unconditionally while ✂ Same shot is gated on `groups > 0`.
