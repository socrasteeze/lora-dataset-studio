import assert from 'node:assert/strict'
import test from 'node:test'
import { isSameDocument } from '../src/utils/sameDocument.js'

const current = 'http://localhost:5050/#/settings/server'

test('a hash-only change stays in the same document', () => {
  assert.equal(isSameDocument('http://localhost:5050/#/datasets', current), true)
})

test('a different token query changes the document', () => {
  assert.equal(isSameDocument('http://localhost:5050/?token=example#/datasets', current), false)
})

test('a different port changes the document', () => {
  assert.equal(isSameDocument('http://localhost:5051/#/datasets', current), false)
})
