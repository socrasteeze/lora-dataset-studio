import { BANK_BULK_LIMIT, bankSelectionKey } from './bankBulk.js'

export function createBankMoveBatch(banks, profileId, newOperationId) {
  if (!Array.isArray(banks) || !banks.length || banks.length > BANK_BULK_LIMIT) {
    throw new Error(`Select between 1 and ${BANK_BULK_LIMIT} banks.`)
  }
  const seen = new Set()
  const items = banks.map((bank) => {
    const id = Number(bank.id)
    if (!Number.isInteger(id) || id < 1 || !bank.instance_id || seen.has(id)) {
      throw new Error('The Bank selection changed. Refresh the list before moving it.')
    }
    seen.add(id)
    return { id, instance_id: String(bank.instance_id), operation_id: newOperationId() }
  })
  return { profileId, items, completed: new Set() }
}

/** Reuse the verified single-Bank endpoint, with one request in flight.
 * A failed move stops the batch. Retry reuses the same operation receipt
 * before continuing, and never resends a Bank whose move was acknowledged. */
export async function runBankMoveBatch(batch, { post, onResult, onProgress }) {
  const pending = batch.items.filter((bank) => !batch.completed.has(bankSelectionKey(bank)))
  const results = []
  onProgress({ processed: 0, total: pending.length })
  for (const bank of pending) {
    let result
    try {
      const response = await post(`/api/profiles/banks/${bank.id}/move`, {
        instance_id: bank.instance_id, profile_id: batch.profileId, operation_id: bank.operation_id,
      })
      if (response?.ok !== true || response.moved !== true || response.profile_id !== batch.profileId
        || !Number.isInteger(response.bank_id) || response.bank_id < 1) {
        throw new Error('The move response could not be verified. Retry to check the recorded move.')
      }
      result = { id: bank.id, instance_id: bank.instance_id, ok: true }
      batch.completed.add(bankSelectionKey(bank))
    } catch (failure) {
      result = { id: bank.id, instance_id: bank.instance_id, ok: false,
        error: failure?.message || 'The move did not complete.',
        unknown: !Number.isInteger(failure?.status) || failure.status >= 500 }
    }
    results.push(result)
    onResult(result)
    onProgress({ processed: results.length, total: pending.length })
    if (!result.ok) break
  }
  return results
}
