/* The Bank grid tile, rendered (see support/mountJsx.mjs: no layout, no
 * events — this proves what the tile SAYS, not how big it is on a phone; the
 * responsive probe owns that).
 *
 * Pinned: the reject reason in words, distinct flag badges with full names,
 * the three-badge cap with "+n", the caption-author chip the Dataset tile
 * already shows, and the finger-sized action hooks. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { render } from './support/mountJsx.mjs'

const { default: BankTile } = await import('../src/components/bank/BankTile.jsx')

const noop = () => {}
const tile = (over = {}) => render(BankTile, {
  bankId: 7, selected: false, onToggle: noop, onReview: noop, onTags: noop,
  img: { id: 11, name: 'shot.jpg', status: 'pending', flags: [], ...over },
})

test('a rejected tile names the reason, not the raw id', () => {
  const html = tile({ status: 'reject', reject_reason: 'low_aesthetic' })
  assert.match(html, />✕ Low aesthetic</)
  assert.doesNotMatch(html, /low_aesthetic/)
})

test('Blurry and Black bars no longer both read "Bl"', () => {
  const html = tile({ flags: ['blur', 'bars'] })
  assert.match(html, /title="Blurry" aria-label="Blurry"[^>]*>Blur</)
  assert.match(html, /title="Black bars" aria-label="Black bars"[^>]*>Bars</)
  assert.doesNotMatch(html, />Bl</)
})

test('the badge stack stops at three and a "+n" names the rest', () => {
  const html = tile({
    status: 'keep', promoted_dataset_id: 1, flags: ['blur', 'noise', 'small'],
    framing: 'portrait',
  })
  assert.match(html, />✓</)
  assert.match(html, />⬆</)
  assert.match(html, />Blur</)
  assert.doesNotMatch(html, />Noise</)
  assert.match(html, /title="Noisy, Small, portrait"[^>]*>\+3</)
})

test('the caption author shows on the tile, the way the Dataset tile shows it', () => {
  const html = tile({ caption: 'a woman on a beach', caption_origin: 'joycaption' })
  assert.match(html, /class="bank-tile__origin[^"]*"[^>]*>JoyCaption</)
  const own = tile({ caption: 'my words', caption_origin: 'asserted' })
  assert.match(own, /class="bank-tile__origin[^"]*text-emerald-300[^"]*"[^>]*>✍ you</)
  // Silence when the author was never recorded, or there is no caption at all.
  assert.doesNotMatch(tile({ caption: 'old caption' }), /bank-tile__origin/)
  assert.doesNotMatch(tile({ caption_origin: 'joycaption' }), /bank-tile__origin/)
})

test('Tags, Review and Open sit in the finger-sized action strip', () => {
  const html = tile({ caption: 'red dress, standing outdoors' })
  assert.match(html, /<div class="bank-tile__actions">/)
  const actions = html.match(/class="bank-tile__action[ "]/g) || []
  assert.equal(actions.length, 3)
  assert.match(html, /aria-label="Review from shot\.jpg" class="bank-tile__action group\/act"/)
  assert.match(html, /aria-label="Open shot\.jpg full size" class="bank-tile__action group\/act no-underline"/)
})

test('index.css gives Bank tile actions the Dataset tile\'s coarse-pointer rule', () => {
  const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const block = css.match(/@media \(max-width: 1023px\), \(pointer: coarse\) \{\s*\.bank-tile__actions[\s\S]*?\n\}/)
  assert.ok(block, 'the coarse-pointer block for .bank-tile__actions is missing')
  assert.match(block[0], /\.bank-tile__action \{[^}]*min-height: 40px/)
  assert.match(block[0], /\.bank-tile__actions \{[^}]*left:\s*2\.5rem/)
})
