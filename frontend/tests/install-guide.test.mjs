/* Current guide pages only. docs/history and docs/specs are out of scope. */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const guideDir = fileURLToPath(new URL('../../docs/guide/', import.meta.url))
const files = readdirSync(guideDir).filter((name) => name.endsWith('.md')).sort()
const read = (name) => readFileSync(join(guideDir, name), 'utf8')

// "the Store alias" in the settings reference is the Windows Python stub, not the
// removed plugin Store. Match the instructions that sent readers there.
const STORE = /\b(?:from|in|open|use|visit) the Store\b|\bthe Store offers\b/i
const UPDATES = /Plugins\s*(?:→|->)\s*Updates/

test('the scan is the current guide directory and not history or specs', () => {
  assert.match(guideDir, /[\\/]docs[\\/]guide[\\/]?$/)
  assert.equal(guideDir.includes(`${join('docs', 'history')}`), false)
  assert.equal(guideDir.includes(`${join('docs', 'specs')}`), false)
  assert.ok(files.includes('installation.md'))
  assert.equal(files.some((name) => name.includes('history') || name.includes('specs')), false)
})

test('installation.md describes the bundled plugins and refuses an external archive', () => {
  const text = read('installation.md')
  assert.match(text, /features that ship with the app are already installed/i)
  assert.match(text, /External plugin archives are refused/i)
  assert.doesNotMatch(text, /ZIP you trust/)
  assert.doesNotMatch(text, /\bthe Store\b/i)
  assert.doesNotMatch(text, STORE)
  assert.doesNotMatch(text, UPDATES)
})

test('no other current guide page sends readers to the Store or Plugins → Updates', () => {
  const offenders = files.filter((name) => name !== 'installation.md').flatMap((name) => {
    const text = read(name)
    const hits = []
    if (STORE.test(text)) hits.push(`${name}: the Store`)
    if (UPDATES.test(text)) hits.push(`${name}: Plugins → Updates`)
    return hits
  })
  assert.deepEqual(offenders, [])
})
