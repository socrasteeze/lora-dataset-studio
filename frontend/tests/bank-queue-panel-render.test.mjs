/* The Launch-all queue panel, rendered (see support/mountJsx.mjs for what a
 * render proves and what it does not: no layout, no events, no measuring).
 *
 * Pinned here: the single "Clear all" (which also stopped the running bank) is
 * gone, each of Clear waiting / Stop running appears only when it has work, the
 * ✕ names its bank, and every row carries the whole-row tint classes. */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement, renderToStaticMarkup } from './support/mountJsx.mjs'

const { default: BankQueuePanel } = await import('../src/components/bank/BankQueuePanel.jsx')
const { MemoryRouter } = await import('react-router')

const noop = () => {}
const NAMES = { 1: 'Alpha', 2: 'Bravo', 3: 'Charlie' }
const html = (items) => renderToStaticMarkup(createElement(MemoryRouter, null,
  createElement(BankQueuePanel, {
    queue: { items }, nameOf: (id) => NAMES[id], onCancel: noop,
    onClearWaiting: noop, onStopRunning: noop,
  })))
const item = (bank_id, state, extra = {}) => ({ bank_id, state, position: bank_id, ...extra })

test('an empty queue renders nothing', () => {
  assert.equal(html([]), '')
})

test('a running bank with banks waiting offers both actions, and no Clear all', () => {
  const out = html([item(1, 'running'), item(2, 'pending'), item(3, 'pending')])
  assert.match(out, />Clear waiting</)
  assert.match(out, />Stop running</)
  assert.doesNotMatch(out, /Clear all/)
  assert.match(out, />3 in line</)
})

test('each action appears only when it has something to act on', () => {
  const waitingOnly = html([item(2, 'pending')])
  assert.match(waitingOnly, />Clear waiting</)
  assert.doesNotMatch(waitingOnly, />Stop running</)
  const runningOnly = html([item(1, 'running')])
  assert.match(runningOnly, />Stop running</)
  assert.doesNotMatch(runningOnly, />Clear waiting</)
})

test('the ✕ names its bank, and says when it stops a run', () => {
  const out = html([item(1, 'running'), item(2, 'pending')])
  assert.match(out, /aria-label="Remove Bravo from queue"/)
  assert.match(out, /aria-label="Stop Alpha and remove it from queue"/)
})

test('every row carries the whole-row tint for hover, focus and press', () => {
  const out = html([item(1, 'running'), item(2, 'pending')])
  const rows = [...out.matchAll(/<li class="([^"]*)"/g)].map((m) => m[1])
  assert.equal(rows.length, 2)
  for (const cls of rows) {
    for (const want of ['group', 'hover:bg-surface-raised', 'focus-within:bg-surface-raised',
      'active:bg-surface-raised', 'has-[:active]:bg-surface-raised']) {
      assert.ok(cls.split(/\s+/).includes(want), `row is missing ${want}: ${cls}`)
    }
  }
})

test('the ✕ and both actions are finger-sized below lg', () => {
  const out = html([item(1, 'running'), item(2, 'pending')])
  const buttons = [...out.matchAll(/<button[^>]*class="([^"]*)"[^>]*>/g)].map((m) => m[1])
  // Clear waiting, Stop running and two ✕ (HelpBadge renders nothing while help mode is off).
  assert.equal(buttons.length, 4)
  for (const cls of buttons) assert.match(cls, /(^|\s)min-h-10(\s|$)/, cls)
})

test('the machine and the wait reason still show', () => {
  const out = html([item(1, 'running', { device_label: 'Peer box' }),
    item(2, 'pending', { waiting_for: 'the GPU is busy' })])
  assert.match(out, />on (<!-- -->)?Peer box</)
  assert.match(out, />the GPU is busy</)
})
