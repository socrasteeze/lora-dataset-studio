/* WHAT IS CURRENTLY FILTERING THE BANK GRID, IN WORDS.
 *
 * The filter panel (BankWorkspace.jsx, ② Triage) folds behind a one-line
 * summary on a narrow screen — see bankFilterPanelOpen.js for when. The moment
 * the chips are out of sight the grid stops explaining itself: a bank showing
 * 412 of 9,004 images looks exactly like a bank that LOST 8,592 of them. The
 * app already treats this as a real failure mode elsewhere — the 🚫 Exclude
 * words box is deliberately never persisted between visits because "images
 * missing from a grid for a reason you set last week reads as data loss"
 * (docs/guide/using-the-app.md) — and a folded panel recreates that risk
 * inside a single session unless the header keeps naming what is active. That
 * is this module's one job.
 *
 * Kept free of JSX (like bankSort.js, bankProvenance.js) so `node --test` can
 * run it directly, and so the exact wording is testable independent of the
 * component that renders it.
 *
 * The FLAG_LABEL / RES_BUCKETS / FRAMING_BUCKETS / ORIGIN_BUCKETS tables stay
 * defined once, in BankWorkspace.jsx — they already back the chips and the
 * 🧹 Auto-reject popover there — and are passed in here rather than
 * duplicated, so a chip relabelled in one place is relabelled everywhere that
 * reads it.
 */

/** Facet parts shown before the header falls back to "+N more". */
export const SUMMARY_MAX_PARTS = 4

const quote = (s) => `“${String(s)}”`

const bucketLabel = (buckets, id) =>
  (buckets || []).find((b) => b.id === id)?.label || String(id)

// Chips whose flag is a GROUPING rather than a quality verdict — the three
// rows (Status/Groups) that build their own label inline in the JSX instead
// of reading FLAG_LABEL. Kept here, next to the one place that needs to
// resolve a flag id to words for a facet the chips don't hand a label table.
const GROUP_FLAG_LABEL = {
  clean: '✨ Clean',
  dups: '≈ Duplicates',
  semantic_dups: '✂ Same shot',
  no_face: '🚫👤 No face',
}

const STATUS_LABEL = { pending: 'Undecided', keep: '✓ Kept', reject: '✕ Rejected' }

/**
 * Every facet currently narrowing the bank grid, as display strings, in the
 * open panel's own reading order (Status → Quality/Score/Groups → Resolution
 * → Origin → 🎨 Medium → ⤢ Angle → Framing → 🔖 tag facets → 🏷️ caption tags
 * → search/exclude).
 * Deliberately excludes `sort` — a ranking is not a filter, it changes which
 * image is first, never which images match, so counting it would make
 * "N shown of M" lie about why the total differs.
 *
 * @param {object} filter same shape as BankWorkspace's `filter` state
 * @param {object} [ctx]
 * @param {object} [ctx.labels] { FLAG_LABEL, RES_BUCKETS, FRAMING_BUCKETS,
 *   ORIGIN_BUCKETS, MEDIUM_BUCKETS, ANGLE_BUCKETS }
 * @returns {string[]}
 */
export function bankFilterParts(filter, { labels = {} } = {}) {
  const f = filter || {}
  const { FLAG_LABEL = {}, RES_BUCKETS = [], FRAMING_BUCKETS = [], ORIGIN_BUCKETS = [],
    MEDIUM_BUCKETS = [], ANGLE_BUCKETS = [] } = labels
  const out = []
  if (f.status) out.push(STATUS_LABEL[f.status] || f.status)
  if (f.flag) out.push(FLAG_LABEL[f.flag] || GROUP_FLAG_LABEL[f.flag] || f.flag)
  if (f.cluster != null) out.push(`👥 Person #${f.cluster}`)
  if (f.style != null) out.push(`🎨 Style #${f.style}`)
  if (f.resBucket) out.push(bucketLabel(RES_BUCKETS, f.resBucket))
  if (f.origin) out.push(`Origin: ${bucketLabel(ORIGIN_BUCKETS, f.origin)}`)
  if (f.medium) out.push(bucketLabel(MEDIUM_BUCKETS, f.medium))
  if (f.angle) out.push(bucketLabel(ANGLE_BUCKETS, f.angle))
  if (f.framing) out.push(bucketLabel(FRAMING_BUCKETS, f.framing))
  // Subfolder: '' is a MEANINGFUL value (the bank root itself), so this must
  // stay a `!= null` test — a truthiness check would silently stop naming it.
  if (f.subfolder != null) out.push(`📁 ${f.subfolder === '' ? '(bank root)' : f.subfolder}`)
  for (const t of (f.wd14Tags || [])) out.push(`🔖 ${String(t).replace(/_/g, ' ')}`)
  // 🏷️ caption tags ride as one comma-joined string (bankTags.tagsParam).
  for (const t of String(f.tags || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    out.push(`🏷️ ${t}`)
  }
  if (f.search) out.push(`🔍 ${quote(f.search)}`)
  if (f.exclude) out.push(`🚫 ${quote(f.exclude)}`)
  return out
}

/** How many facets narrow the grid — the same count `isFiltered` needs, so a
 *  facet can never be summarised without being counted or counted without
 *  being named. */
export function bankFilterCount(filter, ctx) {
  return bankFilterParts(filter, ctx).length
}

/**
 * @param {object} filter
 * @param {object} [ctx] see bankFilterParts
 * @param {number} [ctx.max] parts named before "+N more" (default SUMMARY_MAX_PARTS)
 * @returns {{count:number, parts:string[], text:string, title:string}}
 *   parts — every active facet, untruncated
 *   text  — the folded header line
 *   title — the untruncated list, for a tooltip / aria-label
 */
export function bankFilterSummary(filter, ctx = {}) {
  const { max = SUMMARY_MAX_PARTS, ...rest } = ctx
  const parts = bankFilterParts(filter, rest)
  if (!parts.length) {
    return { count: 0, parts, text: 'All images', title: 'Nothing is filtering the grid' }
  }
  const shown = parts.slice(0, Math.max(1, max))
  const more = parts.length - shown.length
  const text = more > 0 ? `${shown.join(' · ')} +${more} more` : shown.join(' · ')
  return { count: parts.length, parts, text, title: parts.join(' · ') }
}
