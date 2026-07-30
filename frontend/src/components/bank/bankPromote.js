/* ⬆ Promote — the DECIDABLE part of the three-destination dialog, kept free of
 * JSX so `node --test` can run it.
 *
 * Promoting used to lead exactly one place: an EXISTING dataset. A dataset is the
 * strict, training-bound container — pulling 200 candidates out of a 9 000-image
 * dump to keep working on them is a different intent, and a dataset commits
 * material the user has not decided on yet. So a NEW BANK door was added.
 *
 * The third door closes the remaining gap: the funnel's last step still sent the
 * user to the Datasets page to make a blank dataset and back again. A bank needs
 * one thing to exist (a name) and a dataset needs two — but asking for a second
 * field is not the same as having no door.
 *
 * The cost line is not decoration. Images average ~300 KB, so 200 of them are
 * ~60 MB and nobody needs a warning — but a video bank is three orders of
 * magnitude above that, and the same sentence has to stay true when it is. So
 * the dialog states a MEASURED figure from the server, or says it is still
 * measuring; it never guesses one.
 */

import { canCreateDataset } from '../dataset/newDataset.js'

/* The tab row's single source of truth. It used to be a bare id list referenced
 * only by its own test — a decorative constant that would silently disagree with
 * the JSX on the first edit. The dialog now renders FROM this, so it cannot.
 * The two dataset doors sit adjacent, and the labels are short because three
 * tabs have to survive a 400 px viewport. */
export const PROMOTE_DESTINATIONS = [
  { id: 'dataset', label: '📁 Existing dataset' },
  { id: 'new-dataset', label: '🆕 New dataset' },
  { id: 'bank', label: '🗃 New image bank' },
]

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** Human weight for a byte count. null/undefined/negative → null, so callers
 *  render "measuring…" instead of a confident "0 B". */
export function formatWeight(bytes) {
  // Number(null) is 0 — an absent measurement must NOT render as "0 B", which
  // reads as "this costs nothing" at the exact moment nothing is known.
  if (typeof bytes !== 'number') return null
  const n = bytes
  if (!Number.isFinite(n) || n < 0) return null
  if (n < 1024) return `${Math.round(n)} B`
  let v = n
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i += 1 }
  // One decimal below 10 (1.4 GB reads better than 1 GB), none above.
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${UNITS[i]}`
}

/** How many images the promotion will carry, or null while unknown.
 *
 *  A grid selection is authoritative and known client-side. With no selection
 *  the set is "every kept image not already there", which only the server can
 *  count — and for a dataset it is per-target, so it is unknown until one is
 *  picked. */
export function promoteCount({ useSelection, selectedCount, promotable, size }) {
  if (useSelection) return selectedCount
  if (Number.isFinite(promotable)) return promotable
  if (Number.isFinite(size?.count)) return size.count
  return null
}

/** The weight sentence, or null when there is nothing honest to say.
 *
 *  Only for the NEW BANK destination: that copy is byte-for-byte, so the
 *  measured size IS the disk cost. BOTH dataset doors re-encode to webp on the
 *  way in, so quoting the source weight there would be a number the user could
 *  check and find wrong — this deliberately stays silent for 'new-dataset' too,
 *  and a test pins that. The instinct when adding a destination is to teach
 *  every helper about it; here the correct change is none. */
export function weightNotice({ destination, size }) {
  if (destination !== 'bank') return null
  if (!size) return 'Measuring what that weighs on disk…'
  const w = formatWeight(size.bytes)
  if (w == null) return 'Measuring what that weighs on disk…'
  return `That is ${w} of image files copied onto your disk — the two banks never share a file, `
    + 'so each one owns its own copy.'
}

/** The main copy line of the dialog, per destination. */
export function promoteSummary({ destination, useSelection, selectedCount,
  promotable, size, datasetChosen }) {
  const n = promoteCount({ useSelection, selectedCount, promotable, size })
  const many = n == null ? 'The kept image(s)' : `The ${n} image(s)`
  if (destination === 'bank') {
    return `${many} will be COPIED into a brand-new bank, left un-triaged so you can `
      + 'work on them apart. This bank keeps every one of them, marked as promoted.'
  }
  // ABOVE the no-target branch below on purpose: a dataset that does not exist
  // yet has nothing "already in" it and no target to choose, so falling through
  // would print "into the CHOSEN dataset" about a dataset being named right now.
  if (destination === 'new-dataset') {
    return `${many} will be COPIED into a brand-new dataset — normalized to webp,`
      + ' near-duplicates within the selection collapsed. The bank and its source'
      + ' folder are left as they are.'
  }
  if (!useSelection && !datasetChosen) {
    return 'Kept image(s) not yet in the chosen dataset will be COPIED into it'
      + ' — normalized to webp, near-duplicates already in the dataset skipped.'
      + ' The bank and its source folder are left as they are.'
  }
  const scoped = useSelection ? `The ${selectedCount} selected image(s)`
    : (n == null ? 'The kept image(s) not yet in this dataset'
      : `The ${n} kept image(s) not yet in this dataset`)
  return `${scoped} will be COPIED into the dataset — normalized to webp,`
    + ' near-duplicates already in the dataset skipped. The bank and its source'
    + ' folder are left as they are.'
}

/** May the confirm button arm? An existing dataset needs a target, a new bank
 *  needs a name, a new dataset needs a name AND a trigger — and none may fire
 *  twice.
 *
 *  The new-dataset case DELEGATES to canCreateDataset rather than restating the
 *  rule: a second copy of a rule that mirrors the server is a second chance to
 *  stop mirroring it, which is exactly why that helper was extracted. */
export function canStartPromote({ destination, datasetId, bankName, busy,
  datasetName, datasetTrigger }) {
  if (busy) return false
  if (destination === 'bank') return String(bankName || '').trim().length > 0
  if (destination === 'new-dataset') {
    return canCreateDataset({ name: datasetName, trigger: datasetTrigger })
  }
  return !!datasetId
}

/** Label of the confirm button — it has to name what it is about to make. */
export function promoteButtonLabel({ destination, busy }) {
  if (busy) return 'Starting…'
  if (destination === 'bank') return 'Create bank'
  if (destination === 'new-dataset') return 'Create dataset'
  return 'Promote'
}
