import assert from 'node:assert/strict'
import test from 'node:test'

import { ancestorExcluded, toggleExcluded } from './bankFolderExclude.js'

test('unchecking a folder stores it and drops folders already under it', () => {
  const next = toggleExcluded('alice', ['alice/indoor', 'bob'], false)
  assert.deepEqual(next, ['alice', 'bob'])
})

test('checking a folder removes only that path', () => {
  assert.deepEqual(toggleExcluded('alice/indoor', ['alice/indoor', 'bob'], true), ['bob'])
})

test('a child of an excluded folder is not its own choice', () => {
  assert.equal(ancestorExcluded('alice/indoor', ['alice']), 'alice')
  assert.equal(ancestorExcluded('alice', ['alice']), null)
  assert.equal(ancestorExcluded('bob', ['alice']), null)
})
