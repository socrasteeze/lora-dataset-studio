import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { folderNamesValue, splitFolderNames } from './bankFolderNames.js'

test('the typed list is split, trimmed, lower-cased and de-duplicated', () => {
  assert.deepEqual(splitFolderNames(' Reference, scratch,,REVIEW, scratch '),
    ['reference', 'scratch', 'review'])
  assert.deepEqual(splitFolderNames(''), [])
  assert.deepEqual(splitFolderNames('/review/, a/b'), ['review'])
})

test('the saved list wins, else the server default', () => {
  assert.deepEqual(folderNamesValue(['x'], ['reference']), ['x'])
  assert.deepEqual(folderNamesValue(undefined, ['reference']), ['reference'])
  assert.deepEqual(folderNamesValue([], ['reference']), [])
  assert.deepEqual(folderNamesValue('a, b', undefined), ['a', 'b'])
})

test('Settings writes the list to bank_processing and offers a reset', () => {
  const src = readFileSync(new URL('./CaptioningSection.jsx', import.meta.url), 'utf8')
  assert.match(src, /setField\('bank_processing', 'excluded_folder_names'/)
  assert.match(src, /section="bank_processing" field="excluded_folder_names"/)
})
