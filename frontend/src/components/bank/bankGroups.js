/* Banks that share a name, shown as one card — the client half of the rule.
 *
 * WHY GROUPING BY NAME AND NOT MERGING. The ask was "let two folders share
 * images while living in separate folders". Doing that for real means one bank
 * spanning two folders, but ImageBank.source_path is a single non-nullable
 * column and every image's path is relative to it — the most load-bearing rule
 * in the bank service. Copying the bytes instead was already evaluated and
 * rejected ("Banks never share their files. It costs the bytes."). Grouping by
 * name gives the same result on screen with no invariant touched.
 *
 * THE RULE (identical to backend/app/services/bank_groups.py):
 *   key = name.trim(), EXACT and case-sensitive
 *   a bank with keep_separate is never a member
 *   a group exists at 2+ members
 *   lead = the smallest member id
 *
 * Case-insensitive grouping is rejected on purpose: silently merging "Telegram"
 * and "telegram" costs a support thread; failing to merge them is fixed by an
 * obvious rename.
 *
 * IMPLEMENTED TWICE ON PURPOSE. Publishing the group on the row instead would
 * break the in-place rename patch on the bank list — that patch exists because
 * GET /api/banks force-re-walks every source folder, so the list cannot simply
 * be re-fetched to redraw one label. Both sides are pinned to the same table of
 * cases in their tests.
 */

import { untriagedCount } from './bankSort.js'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** The grouping key of a bank, or null when it never groups. */
export function groupKey(bank) {
  if (!bank || bank.keep_separate) return null
  const key = String(bank.name ?? '').trim()
  return key || null
}

/** Display rows for the bank list: a `{kind:'bank'}` row per ungrouped bank and
 *  a `{kind:'group'}` row per name with 2+ members. Input order is preserved —
 *  a group takes the position of its FIRST member, so a re-sort of the list
 *  moves the card rather than reshuffling everything around it.
 *
 *  Counters are summed from the rows already on screen, so they need no extra
 *  request. Members that overlap on disk therefore DOUBLE-COUNT; the card says
 *  so rather than hiding it (see overlapping_banks on the members). */
export function groupRows(banks) {
  const rows = Array.isArray(banks) ? banks : []
  const counts = new Map()
  for (const b of rows) {
    const key = groupKey(b)
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  }
  const emitted = new Set()
  const out = []
  for (const b of rows) {
    const key = groupKey(b)
    if (!key || (counts.get(key) || 0) < 2) {
      out.push({ kind: 'bank', key: `bank-${b.id}`, bank: b })
      continue
    }
    if (emitted.has(key)) continue
    emitted.add(key)
    const members = rows.filter((m) => groupKey(m) === key)
      .sort((a, b2) => num(a.id) - num(b2.id))
    out.push({
      kind: 'group',
      key: `group-${key}`,
      name: key,
      leadId: members[0].id,
      members,
      total: members.reduce((n, m) => n + num(m.total), 0),
      scanned: members.reduce((n, m) => n + num(m.scanned), 0),
      keep: members.reduce((n, m) => n + num(m.keep), 0),
      reject: members.reduce((n, m) => n + num(m.reject), 0),
      untriaged: members.reduce((n, m) => n + untriagedCount(m), 0),
    })
  }
  return out
}

/** "grouped with 1 other bank" — the line under a group card's name. */
export function groupLabel(otherCount) {
  const n = Math.max(0, num(otherCount))
  return `grouped with ${n} other bank${n === 1 ? '' : 's'}`
}

/** The warning for a group whose members sit over the same files on disk, or
 *  null. Promotion is safe (import dedupes), but the COUNTERS double-count —
 *  and a number that is quietly wrong is worse than one explained. */
export function groupOverlapNote(row) {
  if (row?.kind !== 'group') return null
  const overlapping = (row.members || []).filter((m) => (m.overlapping_banks || []).length)
  if (!overlapping.length) return null
  return 'Some banks in this group point at overlapping folders, so the counts '
    + 'above add the same images more than once. Promoting is still safe — '
    + 'duplicates are collapsed on the way into the dataset.'
}
