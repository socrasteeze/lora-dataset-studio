/* Browse versus selection for the bank list.
 *
 * groupRows only sums the banks it is given. Paging the raw banks first, then
 * grouping that slice, paints a partial card while promotion still uses the
 * whole server group. Browse therefore groups the full filtered list, then
 * pages those display rows. Selection still pages the raw banks: Select
 * Visible and the checkboxes are per bank, and a selection page is never a
 * group card.
 *
 * Search stays on the page, before this function. A name filtered down to one
 * bank arrives here as one row and does not become a group.
 */

import { paginate } from '../../utils/datasetLibrary.js'
import { bankSelectionKey } from './bankBulk.js'
import { groupRows } from './bankGroups.js'

export function composeBankList(visibleBanks, { selecting = false, page = 1, pageSize } = {}) {
  const banks = Array.isArray(visibleBanks) ? visibleBanks : []
  if (selecting) {
    const paged = paginate(banks, page, pageSize)
    return {
      paged,
      rows: paged.items.map((bank) => ({
        kind: 'bank',
        key: `select-${bankSelectionKey(bank)}`,
        bank,
      })),
    }
  }
  const grouped = groupRows(banks)
  const paged = paginate(grouped, page, pageSize)
  return { paged, rows: paged.items }
}
