import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from './support/mountJsx.mjs'

const { default: BankReviewLightbox } = await import('../src/components/bank/BankReviewLightbox.jsx')

function review(watermarkState) {
  return render(BankReviewLightbox, {
    bankId: 7, ids: [1], onClose: () => {},
    seedImages: [{ id: 1, name: 'Demo', status: 'pending', width: 400, height: 600,
      flags: [], watermark_state: watermarkState }],
  })
}

test('Review renders the crop action and its shortcut', () => {
  const markup = review('unchecked')
  assert.match(markup, /title="Crop \(C\)"/)
  assert.match(markup, /✂ Crop<kbd[^>]*>C<\/kbd>/)
})

test('unscanned and cleared images offer a visible mask action', () => {
  for (const state of ['unchecked', 'none']) {
    const markup = review(state)
    assert.match(markup, /Mark a watermark/)
    assert.match(markup, /title="Edit watermark mask \(M\)"/)
    assert.match(markup, /Mark a watermark<kbd[^>]*>M<\/kbd>/)
  }
})

test('a detected watermark offers editing, while a cleaned image has no mask action', () => {
  assert.match(review('detected'), /Edit mask/)
  assert.doesNotMatch(review('cleaned'), /Edit watermark mask|Edit mask|Mark a watermark/)
})
