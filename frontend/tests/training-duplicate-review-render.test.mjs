import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from './support/mountJsx.mjs'

const { default: PreflightModal } = await import('../src/components/dataset/PreflightModal.jsx')
const report = { dup_pairs: [{ a: { id: 1, filename: 'sample1.png', fingerprint: 'a'.repeat(64) },
  b: { id: 2, filename: 'sample2.png', fingerprint: 'b'.repeat(64) } }] }
const ds = { data: { images: [{ id: 1, status: 'keep' }, { id: 2, status: 'keep' }] }, curationBusy: false }

test('readiness pair review provides both decisions without a training-launch action', () => {
  const html = render(PreflightModal, { report, ds, datasetId: 9, reviewOnly: true, onResolve: () => {} })
  assert.match(html, /aria-label="Near Duplicates"/)
  assert.match(html, /Copy 1/)
  assert.match(html, /Copy 2/)
  assert.match(html, /Keep Both/)
  assert.match(html, />Reject<\/button>/)
  assert.match(html, />Done<\/button>/)
  assert.doesNotMatch(html, /Start Anyway/)
})

test('training preflight retains its explicit confirmation action', () => {
  const html = render(PreflightModal, { report, ds, datasetId: 9, onResolve: () => {} })
  assert.match(html, /Start Anyway/)
  assert.match(html, />Cancel<\/button>/)
})
