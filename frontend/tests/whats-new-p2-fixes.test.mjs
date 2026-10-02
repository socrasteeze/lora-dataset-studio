import assert from 'node:assert/strict'
import test from 'node:test'

import { WHATS_NEW } from '../src/whatsNew.js'

const ADDED = [
  {
    id: '2026-10-01-zzzzzzzzzzzz-whole-bank-groups',
    title: 'A bank group stays whole across pages',
  },
  {
    id: '2026-10-01-zzzzzzzzzzz-plugin-screen-failed',
    title: 'A plugin screen that failed to load says so',
  },
  {
    id: '2026-10-01-zzzzzzzzzz-zip-says-why',
    title: 'A blocked plugin ZIP explains what to fix',
  },
  {
    id: '2026-10-01-zzzzzzzzz-install-guide',
    title: 'The install guide matches how you add a plugin',
  },
]

test('four benefit-first entries for these fixes are prepended and older ids stay', () => {
  assert.deepEqual(WHATS_NEW.slice(0, 4).map((entry) => entry.id), ADDED.map((entry) => entry.id))
  assert.equal(WHATS_NEW[4].id, '2026-10-01-zzzzzzzz-no-civitai-publish')
  for (const expected of ADDED) {
    const entry = WHATS_NEW.find((item) => item.id === expected.id)
    assert.equal(entry.title, expected.title)
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(entry.blurb.length > 40, expected.id)
  }
  for (const id of [
    '2026-10-01-zzzzzzz-honest-bank-cards',
    '2026-10-01-plugins-on-this-install',
    '2026-10-01-direct-install',
    '2026-10-01-zzzzz-bank-pages',
  ]) {
    assert.equal(WHATS_NEW.some((entry) => entry.id === id), true, id)
  }
})
