import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { scrollQueueRowIntoView } from './bankQueueScroll.js'

const panel = readFileSync(new URL('./BankQueuePanel.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

test('the queue list caps at 15 rows via CSS variables and scrolls inside the panel', () => {
  assert.match(css, /--bank-queue-visible-rows:\s*15/)
  assert.match(css, /--bank-queue-row-h:\s*calc\(/)
  assert.match(css, /--bank-queue-row-gap:\s*0\.25rem/)
  assert.match(css, /\[data-bank-queue-list\][\s\S]*max-height:\s*calc\(/)
  assert.match(css, /\[data-bank-queue-list\][\s\S]*overflow-y:\s*auto/)
  assert.match(panel, /data-bank-queue-list/)
  const headerAt = panel.indexOf('Bank Queue')
  const clearAt = panel.indexOf('Clear Waiting')
  const stopAt = panel.indexOf('Stop Running')
  const listAt = panel.indexOf('data-bank-queue-list')
  assert.ok(headerAt >= 0 && clearAt >= 0 && stopAt >= 0 && listAt > headerAt)
  assert.ok(clearAt < listAt && stopAt < listAt,
    'Clear Waiting and Stop Running must stay in the header, above the scroll list')
})

test('the running queue row is scrolled into view on mount when it is not already visible', () => {
  assert.match(panel, /useLayoutEffect/)
  assert.match(panel, /scrollQueueRowIntoView\(root, row\)/)
  assert.match(panel, /data-queue-row="queued"]\[data-bank-id=/)
})

test('scrollQueueRowIntoView: a row already in view is left alone', () => {
  const root = { getBoundingClientRect: () => ({ top: 0, bottom: 100 }), scrollTop: 10 }
  scrollQueueRowIntoView(root, { getBoundingClientRect: () => ({ top: 10, bottom: 30 }) })
  assert.equal(root.scrollTop, 10)
})

test('scrollQueueRowIntoView: a row at the top of a taller list is left alone', () => {
  const root = { getBoundingClientRect: () => ({ top: 50, bottom: 50 + 476 }), scrollTop: 0 }
  scrollQueueRowIntoView(root, { getBoundingClientRect: () => ({ top: 50, bottom: 78 }) })
  assert.equal(root.scrollTop, 0)
})

test('scrollQueueRowIntoView: a row below the fold is scrolled just into view', () => {
  const root = { getBoundingClientRect: () => ({ top: 0, bottom: 100 }), scrollTop: 20 }
  scrollQueueRowIntoView(root, { getBoundingClientRect: () => ({ top: 120, bottom: 148 }) })
  assert.equal(root.scrollTop, 68)
})

test('scrollQueueRowIntoView: a row clipped at the top is scrolled down into view', () => {
  const root = { getBoundingClientRect: () => ({ top: 100, bottom: 200 }), scrollTop: 80 }
  scrollQueueRowIntoView(root, { getBoundingClientRect: () => ({ top: 80, bottom: 108 }) })
  assert.equal(root.scrollTop, 60)
})
