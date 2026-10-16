import assert from 'node:assert/strict'
import test from 'node:test'
import { runSuites } from '../scripts/testAll.mjs'

test('a failed core suite still runs bundled contracts with a separate process', () => {
  const calls = []
  const result = runSuites((command, args, options) => {
    calls.push({ command, args, options })
    return { status: calls.length === 1 ? 7 : 0 }
  })
  assert.equal(result, 7)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].command, process.execPath)
  assert.deepEqual(calls[0].args, ['--import', './scripts/registerSdk.mjs', '--test'])
  assert.deepEqual(calls[1].args, ['scripts/testBundled.mjs'])
  assert.ok(calls.every(({ options }) => options.stdio === 'inherit' && !options.shell))
})

test('a failed bundled suite or a child without an exit status cannot report green', () => {
  for (const statuses of [[0, 3], [null, 0]]) {
    let index = 0
    assert.equal(runSuites(() => ({ status: statuses[index++] })), statuses[1] || 1)
    assert.equal(index, 2)
  }
})

test('all successful children report success', () => {
  assert.equal(runSuites(() => ({ status: 0 })), 0)
})
