import test from 'node:test'
import assert from 'node:assert/strict'
import { QUICK_SET_DEFAULTS, validateQuickSet } from './quickSetForm.js'

test('quick set defaults to Qwen 2.1, turbo on, and 30 images', () => {
  assert.equal(QUICK_SET_DEFAULTS.engine, 'qwen21')
  assert.equal(QUICK_SET_DEFAULTS.turbo, true)
  assert.equal(QUICK_SET_DEFAULTS.targetCount, 30)
})

test('quick set requires one or two images, a trigger, and a name', () => {
  assert.deepEqual(
    validateQuickSet({ files: [], trigger: '', name: '' }),
    ['Use 1 or 2 images.', 'Enter a trigger word.', 'Enter a name.'],
  )
  assert.deepEqual(
    validateQuickSet({ files: [{}, {}, {}], trigger: 'tok', name: 'alpha' }),
    ['Use 1 or 2 images.'],
  )
  assert.deepEqual(
    validateQuickSet({ files: [{}], trigger: 'tok', name: 'alpha' }),
    [],
  )
  assert.deepEqual(
    validateQuickSet({ files: [{}, {}], trigger: 'tok', name: 'alpha' }),
    [],
  )
})
