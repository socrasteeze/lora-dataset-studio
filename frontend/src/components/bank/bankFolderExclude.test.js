import assert from 'node:assert/strict'
import test from 'node:test'

import { ancestorExcluded, sortFolders, toggleExcluded } from './bankFolderExclude.js'

test('unchecking a folder stores it and drops folders already under it', () => {
  const next = toggleExcluded('alice', ['alice/indoor', 'bob'], false)
  assert.deepEqual(next, ['alice', 'bob'])
})

test('checking a folder removes only that path', () => {
  assert.deepEqual(toggleExcluded('alice/indoor', ['alice/indoor', 'bob'], true), ['bob'])
})

test('a sibling with a longer name stays beside the parent, not inside its children', () => {
  const rows = [
    { path: '_trash/anima', name: 'anima' },
    { path: '_trash/anima-cn-test', name: 'anima-cn-test' },
    { path: '_trash/anima/_goth_1010b', name: '_goth_1010b' },
    { path: '_trash/anima/_anima_refine_rerun_1010/personal', name: 'personal' },
  ]
  assert.deepEqual(sortFolders(rows).map((folder) => folder.path), [
    '_trash/anima',
    '_trash/anima/_anima_refine_rerun_1010/personal',
    '_trash/anima/_goth_1010b',
    '_trash/anima-cn-test',
  ])
})

test('a child of an excluded folder is not its own choice', () => {
  assert.equal(ancestorExcluded('alice/indoor', ['alice']), 'alice')
  assert.equal(ancestorExcluded('alice', ['alice']), null)
  assert.equal(ancestorExcluded('bob', ['alice']), null)
})
