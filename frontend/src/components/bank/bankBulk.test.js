import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BANK_BULK_LIMIT, bankSelectionKey, buildBulkEditItems, bulkSelectionNote,
  selectVisibleBanks, successfulBulkKeys, transformBankName,
} from './bankBulk.js'

test('selection uses the bank instance and respects the hard limit', () => {
  const banks = Array.from({ length: BANK_BULK_LIMIT + 2 }, (_, i) => ({ id: i + 1, instance_id: `v${i}` }))
  const selected = selectVisibleBanks(new Set(), banks)
  assert.equal(selected.size, BANK_BULK_LIMIT)
  assert.equal(selected.has(bankSelectionKey(banks[BANK_BULK_LIMIT])), false)
})

test('select visible adds rows without broadening to hidden rows', () => {
  const selected = new Set(['9:old'])
  const next = selectVisibleBanks(selected, [{ id: 1, instance_id: 'one' }])
  assert.deepEqual([...next], ['9:old', '1:one'])
})

test('select visible stops at the rows it is given', () => {
  const page = [{ id: 1, instance_id: 'a' }, { id: 2, instance_id: 'b' }]
  const selected = selectVisibleBanks(new Set(), page)
  assert.deepEqual([...selected], ['1:a', '2:b'])
})

test('the selection note names a hidden filter and a limit that leaves matches out', () => {
  assert.equal(bulkSelectionNote({
    selectedCount: 500, hiddenSelectedCount: 2, matchingCount: 530,
  }), '500 selected, 2 hidden by the filter, 30 matching not selected (limit 500)')
  assert.equal(bulkSelectionNote({
    selectedCount: 3, hiddenSelectedCount: 0, matchingCount: 10,
  }), '3 selected')
})

test('name transformations are literal and ordered', () => {
  assert.equal(transformBankName('a.b.a', { find: '.', replace: '-', prefix: '[', suffix: ']' }), '[a-b-a]')
})

test('edit payload carries stable identity and only changed fields', () => {
  const banks = [
    { id: 4, instance_id: 'four', name: 'Alpha', keep_separate: false },
    { id: 5, instance_id: 'five', name: 'Bravo', keep_separate: true },
  ]
  const drafts = { '4:four': 'Alpha 2', '5:five': 'Bravo' }
  assert.deepEqual(buildBulkEditItems(banks, drafts, 'separate'), [
    { id: 4, instance_id: 'four', name: 'Alpha 2', keep_separate: true },
  ])
  assert.deepEqual(buildBulkEditItems(banks, drafts, 'group'), [
    { id: 4, instance_id: 'four', name: 'Alpha 2' },
    { id: 5, instance_id: 'five', keep_separate: false },
  ])
})

test('successful results require the returned instance identity', () => {
  assert.deepEqual([...successfulBulkKeys([
    { id: 1, instance_id: 'new', ok: true },
    { id: 2, instance_id: 'two', ok: false },
  ])], ['1:new'])
})
