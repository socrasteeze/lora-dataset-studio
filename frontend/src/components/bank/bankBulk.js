export const BANK_BULK_LIMIT = 500

export function bankSelectionKey(bank) {
  return `${Number(bank?.id)}:${String(bank?.instance_id || '')}`
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
