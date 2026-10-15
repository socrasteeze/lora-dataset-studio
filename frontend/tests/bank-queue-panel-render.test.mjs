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
const { default: BankQueuedJob } = await import('../src/components/bank/BankQueuedJob.jsx')
const { MemoryRouter } = await import('react-router')

const noop = () => {}
const NAMES = { 1: 'Alpha', 2: 'Bravo', 3: 'Charlie' }
const html = (items, active_jobs = []) => renderToStaticMarkup(createElement(MemoryRouter, null,
  createElement(BankQueuePanel, {
    queue: { items, active_jobs }, nameOf: (id) => NAMES[id], onCancel: noop, onStopDirect: noop,
    onClearWaiting: noop, onStopRunning: noop, onRetry: noop,
  })))
const item = (bank_id, state, extra = {}) => ({ bank_id, state, position: bank_id, ...extra })

test('an empty queue renders nothing', () => {
  assert.equal(html([]), '')
})

test('a workspace pass remains visible when no pipeline is queued', () => {
  const out = html([], [{ bank_id: 1, kind: 'score', direct: true, state: 'running' }])
  assert.match(out, />Active Passes</)
  assert.match(out, />Alpha</)
  assert.match(out, /Score pass/)
  assert.match(out, /aria-label="Stop Alpha"/)
  assert.match(out, />Stop Running</)
  assert.doesNotMatch(out, />Clear Waiting</)
})

test('direct work and a waiting pipeline retain separate controls', () => {
  const out = html([item(2, 'pending')], [{ bank_id: 1, kind: 'caption', direct: true, state: 'running' }])
  assert.match(out, />Alpha</)
  assert.match(out, />Bravo</)
  assert.match(out, />Captioning</)
  assert.match(out, /aria-label="Stop Alpha"/)
  assert.match(out, /aria-label="Remove Bravo from queue"/)
  assert.match(out, />1 in line</)
})

test('a running bank with banks waiting offers both actions, and no Clear all', () => {
  const out = html([item(1, 'running'), item(2, 'pending'), item(3, 'pending')])
  assert.match(out, />Clear Waiting</)
  assert.match(out, />Stop Running</)
  assert.doesNotMatch(out, /Clear all/)
  assert.match(out, />3 in line</)
})

test('each action appears only when it has something to act on', () => {
  const waitingOnly = html([item(2, 'pending')])
  assert.match(waitingOnly, />Clear Waiting</)
  assert.doesNotMatch(waitingOnly, />Stop Running</)
  const runningOnly = html([item(1, 'running')])
  assert.match(runningOnly, />Stop Running</)
  assert.doesNotMatch(runningOnly, />Clear Waiting</)
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

test('a failed workspace job names the pass and offers Retry without Clear Waiting', () => {
  const out = html([item(2, 'failed', { operation: 'caption', error: 'Install the required model in Setup.' })])
  assert.match(out, /Captioning/)
  assert.match(out, />Failed</)
  assert.match(out, /Install the required model in Setup/)
  assert.match(out, /aria-label="Retry Bravo"/)
  assert.match(out, /aria-label="Remove Bravo from queue"/)
  assert.doesNotMatch(out, />Clear Waiting</)
  assert.doesNotMatch(out, />Stop Running</)
})

test('the workspace shows pending jobs and allows cancellation before they start', () => {
  const out = renderToStaticMarkup(createElement(BankQueuedJob, {
    entry: { state: 'pending', position: 2, operation: 'score' }, onCancel: noop, onRetry: noop,
  }))
  assert.match(out, /Score pass/)
  assert.match(out, /Waiting in queue · #2/)
  assert.match(out, />Cancel Job</)
  assert.doesNotMatch(out, />Retry</)
})

test('the workspace keeps failures actionable and leaves live progress to the existing bar', () => {
  const failed = renderToStaticMarkup(createElement(BankQueuedJob, {
    entry: { state: 'failed', operation: 'caption', error: 'Synthetic failure' }, onCancel: noop, onRetry: noop,
  }))
  assert.match(failed, /Synthetic failure/)
  assert.match(failed, />Retry</)
  assert.match(failed, />Remove</)
  assert.equal(renderToStaticMarkup(createElement(BankQueuedJob, {
    entry: { state: 'running', operation: 'scan' }, live: true,
  })), '')
})
