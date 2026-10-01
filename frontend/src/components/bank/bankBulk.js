export const BANK_BULK_LIMIT = 500

export function bankSelectionKey(bank) {
  return `${Number(bank?.id)}:${String(bank?.instance_id || '')}`
}

/** One status sentence for the bulk bar. Hidden-by-filter names selected banks
 *  the current search does not show. When the matching list is longer than the
 *  batch limit, the same sentence says Select all cannot take the rest. */
export function bulkSelectionNote({
  selectedCount = 0,
  hiddenSelectedCount = 0,
  matchingCount = 0,
  limit = BANK_BULK_LIMIT,
} = {}) {
  const parts = [`${selectedCount} selected`]
  if (hiddenSelectedCount > 0) parts.push(`${hiddenSelectedCount} hidden by the filter`)
  const leftOut = Math.max(0, Number(matchingCount) - limit)
  if (leftOut > 0) parts.push(`${leftOut} matching not selected (limit ${limit})`)
  return parts.join(', ')
}

export function selectVisibleBanks(selected, visibleBanks, limit = BANK_BULK_LIMIT) {
  const next = new Set(selected)
  for (const bank of visibleBanks) {
    if (!bank?.instance_id) continue
    if (next.size >= limit) break
    next.add(bankSelectionKey(bank))
  }
  return next
}

export function transformBankName(name, { find = '', replace = '', prefix = '', suffix = '' } = {}) {
  let next = String(name ?? '')
  if (find) next = next.split(String(find)).join(String(replace ?? ''))
  return `${String(prefix ?? '')}${next}${String(suffix ?? '')}`
}

export function buildBulkEditItems(banks, drafts, grouping = 'unchanged') {
  return banks.flatMap((bank) => {
    const item = { id: Number(bank.id), instance_id: String(bank.instance_id) }
    const draft = String(drafts[bankSelectionKey(bank)] ?? bank.name).trim()
    if (draft && draft !== bank.name) item.name = draft
    if (grouping === 'separate' && !bank.keep_separate) item.keep_separate = true
    if (grouping === 'group' && bank.keep_separate) item.keep_separate = false
    return Object.keys(item).length > 2 ? [item] : []
  })
}

export function successfulBulkKeys(results) {
  return new Set((results || []).filter((row) => row.ok)
    .map((row) => `${Number(row.id)}:${String(row.instance_id || '')}`))
}
