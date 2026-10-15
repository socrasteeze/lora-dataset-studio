import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from './support/mountJsx.mjs'

const { default: BankStatsStrip } = await import('../src/components/bank/BankStatsStrip.jsx')

test('loading, populated and failed statistics share the same reserved toolbar box', () => {
  const pending = render(BankStatsStrip, { loading: true })
  const populated = render(BankStatsStrip, { children: '42 images' })
  const failed = render(BankStatsStrip, { error: true, onRetry: () => {} })
  const box = (markup) => /<div[^>]*class="([^"]+)"/.exec(markup)?.[1]
  assert.ok(box(pending))
  assert.equal(box(pending), box(populated))
  assert.equal(box(failed), box(populated))
  assert.match(pending, /aria-busy="true"/)
  assert.match(pending, /Loading Stats/)
  assert.doesNotMatch(pending, /0 images/)
  assert.match(populated, /42 images/)
  assert.match(failed, /Stats Unavailable/)
  assert.match(failed, /<button[^>]*>Retry<\/button>/)
})
