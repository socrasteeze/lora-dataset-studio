/** 🗃️ Bank list ordering — pure helpers (no JSX, so `node --test` can run them).
 *
 * A library grows to twenty-odd banks fast (the per-subfolder split alone makes
 * one per subfolder), and "newest first" is only useful the day you create them.
 * Sorting happens CLIENT-side on purpose: GET /api/banks force-re-walks every
 * source folder before answering, so re-fetching just to reorder would spin the
 * disks — and re-toast the folder-sync note — for a pure display change. */

export const BANK_SORTS = [
  { id: 'recent', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'name', label: 'Name A→Z' },
  { id: 'name_desc', label: 'Name Z→A' },
  { id: 'images', label: 'Most images' },
  { id: 'untriaged', label: 'Least triaged' },
]

export const DEFAULT_BANK_SORT = 'recent'

const IDS = new Set(BANK_SORTS.map((s) => s.id))

/** Fall back to the default for an unknown id — a stale localStorage value from
 * a previous version must never leave the list unsorted. */
export function normalizeBankSort(id) {
  return IDS.has(id) ? id : DEFAULT_BANK_SORT
}

/* localeCompare with numeric:true so "Export 2" sorts before "Export 10" —
   split banks are named after folders, which are numbered far more often than
   not. Case-insensitive for the same reason: nobody thinks of "telegram" and
   "Telegram" as two different neighbourhoods of the list. */
const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''),
  undefined, { numeric: true, sensitivity: 'base' })

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** How much of the bank still has no ✓/✕ — the "what's left to do" order. */
export function untriagedCount(bank) {
  return Math.max(0, num(bank?.total) - num(bank?.keep) - num(bank?.reject))
}

const created = (b) => {
  const t = Date.parse(b?.created_at || '')
  return Number.isNaN(t) ? 0 : t
}

/* Every comparator falls back to the name, then the id, so the order is TOTAL:
   two banks with the same image count must not swap places between renders. */
const COMPARATORS = {
  recent: (a, b) => created(b) - created(a) || byName(a, b),
  oldest: (a, b) => created(a) - created(b) || byName(a, b),
  name: byName,
  name_desc: (a, b) => byName(b, a),
  images: (a, b) => num(b.total) - num(a.total) || byName(a, b),
  untriaged: (a, b) => untriagedCount(b) - untriagedCount(a) || byName(a, b),
}

/** Ordered COPY of the banks (never mutates the state array React holds). */
export function sortBanks(banks, sortId) {
  const rows = Array.isArray(banks) ? banks.slice() : []
  const cmp = COMPARATORS[normalizeBankSort(sortId)]
  return rows.sort((a, b) => cmp(a, b) || num(a.id) - num(b.id))
}

/** Does this bank match a free-text query? Matches the NAME and the source
 *  FOLDER — the only two strings on a bank row, and the folder matters because
 *  banks are often named alike while living in very different places.
 *
 *  Same rule as the dataset library's `datasetMatches` (utils/datasetLibrary.js):
 *  trimmed, lowercased, substring. Deliberately not fuzzy — a filter that
 *  matches things you did not type is worse than one that misses. An empty
 *  query matches everything, so callers need no special case. */
export function bankMatches(bank, query = '') {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const b = bank || {}
  return `${b.name || ''} ${b.source_path || ''}`.toLowerCase().includes(q)
}
