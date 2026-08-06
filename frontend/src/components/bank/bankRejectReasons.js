/* ✕ WHY — the reason an image is in the bin, as words.
 *
 * ✕ Rejected used to be one undifferentiated pile. That is fine until a bulk
 * action closes a whole category at once: a user auto-rejected their bank's
 * duplicates, then filtered by ≈ Duplicates and found 0. The ≈ chip was RIGHT —
 * it counts groups still holding two or more undecided copies, and "keep best"
 * leaves exactly one, so a resolved bank honestly has nothing left to resolve.
 * But the thousands of images it had just rejected then had no address at all:
 * no chip selected them, and the only thing telling them apart from a blurry
 * reject was a text badge on the tile.
 *
 * The backend had recorded the answer on every row the whole time
 * (BankImage.reject_reason). This module is the vocabulary for surfacing it.
 *
 * Read-only by design. These chips SELECT a pile so it can be looked at before
 * 🗑 Delete rejected; nothing here un-rejects anything.
 *
 * Kept free of JSX (like bankMedium.js, bankProvenance.js, bankSort.js) so
 * `node --test` runs it directly and the wording is testable on its own.
 *
 * `id`s are stored — they are query-string values AND the values already sitting
 * in users' bank databases. Never rename one without an alias path.
 */

/* Ids in chip order, mirroring backend REASON_KEYS.
 *
 * The order is deliberate: the three reasons no flag can produce come first
 * (they are decisions ABOUT a set — two dedup stages and a human), then the
 * quality flags in scan order, then the score-pass flags, then the bucket for
 * rows that never recorded a reason.
 *
 * The backend DERIVES its copy from its flag tuples, because 🧹 Auto-reject
 * writes the flag id itself as the reason — so a new flag becomes a new reason
 * for free there. This list cannot derive itself the same way (the flag names
 * live in BankWorkspace's own tables), which is exactly why
 * test_bank_reject_reason_facet.py pins the two together: a reason the server
 * can write and this file has never heard of would be unreachable in precisely
 * the way duplicates were. */
export const REASON_IDS = [
  'duplicate', 'semantic_dup', 'manual',
  'blur', 'noise', 'uniform', 'small', 'soft_detail', 'bars', 'unreadable',
  'low_aesthetic', 'nsfw', 'watermark',
  'unrecorded',
]

/* The four labels this row owns. Everything else reuses FLAG_LABEL, injected
 * rather than copied — the rule bankFilterSummary.js states: a chip relabelled
 * in one place is relabelled everywhere that reads it. */
const OWN_LABEL = {
  duplicate: '≈ Duplicate',
  semantic_dup: '✂ Same shot',
  manual: '✋ By hand',
  unrecorded: '❔ Not recorded',
}

/** Words for a reason id. Falls back to the raw id, never to silence: an
 *  unlabelled pile a user cannot name is still a pile they must be able to
 *  reach. */
export function reasonLabel(id, flagLabel = {}) {
  return OWN_LABEL[id] || flagLabel[id] || String(id)
}

/** The chip row's buckets, in order. A function rather than a constant because
 *  the flag labels are injected — see reasonLabel. */
export function reasonBuckets(flagLabel = {}) {
  return REASON_IDS.map((id) => ({ id, label: reasonLabel(id, flagLabel) }))
}

export const REASON_HINT = {
  duplicate: 'Rejected as an exact or resized copy of another image, by the '
    + '🔎 scan\'s perceptual hash. Once a group is resolved the ≈ Duplicates '
    + 'chip correctly drops to 0 — this is where those images went.',
  semantic_dup: 'Rejected as the same shot in a different crop or compression, '
    + 'found by ✂ Find crops & variants. Same story as ≈ Duplicate: the ✂ chip '
    + 'goes quiet once the groups are resolved.',
  manual: 'You rejected these yourself, one at a time or by selection — not a '
    + 'pass, a decision.',
  unrecorded: 'Rejected before the app recorded WHY — an older version, or a '
    + 'path that never wrote a reason. Nothing is wrong with these images '
    + 'beyond the decision itself; they are here so the pile is reachable '
    + 'rather than invisible.',
}

/** Tooltip for a reason chip, or null. Flag-derived reasons fall back to the
 *  flag's own hint where one exists, so the caveats already written for
 *  🌫 Soft detail and ⬛ Bars are not restated (or contradicted) here. */
export function reasonHint(id, flagHint = {}) {
  return REASON_HINT[id] || flagHint[id] || null
}
