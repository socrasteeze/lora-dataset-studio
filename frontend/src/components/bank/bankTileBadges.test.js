import assert from 'node:assert/strict'
import test from 'node:test'
import { FLAG_LABEL, FLAG_SHORT, flagShortLabel } from './bankFacets.js'
import { TILE_BADGE_LIMIT, capTileBadges, tileBadges } from './bankTileBadges.js'

const img = (over = {}) => ({ status: 'pending', flags: [], ...over })

test('a rejected tile reads the reason in words, not as the raw id', () => {
  const [b] = tileBadges(img({ status: 'reject', reject_reason: 'low_aesthetic' }))
  assert.equal(b.text, '✕ Low aesthetic')
  assert.equal(b.title, 'Rejected: Low aesthetic')
  // The reasons the ✕ Why row owns, through the same reasonLabel().
  assert.equal(tileBadges(img({ status: 'reject', reject_reason: 'semantic_dup' }))[0].text,
    '✕ ✂ Same shot')
  // An unknown reason still shows, under its own id.
  assert.equal(tileBadges(img({ status: 'reject', reject_reason: 'mystery' }))[0].text, '✕ mystery')
  // No reason recorded: just the cross.
  assert.equal(tileBadges(img({ status: 'reject' }))[0].text, '✕')
})

test('every known flag has its own short label', () => {
  const shorts = Object.keys(FLAG_LABEL).map(flagShortLabel)
  assert.equal(new Set(shorts).size, shorts.length, `duplicate short labels: ${shorts.join(', ')}`)
  // The collision that started it: Blurry and Black bars both read "Bl".
  assert.notEqual(flagShortLabel('blur'), flagShortLabel('bars'))
  for (const f of Object.keys(FLAG_LABEL)) assert.ok(FLAG_SHORT[f], `${f} has no short label`)
})

test('an unknown flag falls back to the old two letters, then to its id', () => {
  assert.equal(flagShortLabel('made_up_flag'), 'made_up_flag')
})

test('a flag badge carries its full name for the tooltip and screen readers', () => {
  const b = tileBadges(img({ flags: ['bars'] })).find((x) => x.key === 'flag:bars')
  assert.equal(b.text, 'Bars')
  assert.equal(b.title, 'Black bars')
  assert.equal(b.label, 'Black bars')
})

test('the stack shows at most three badges, then "+n" naming the rest', () => {
  assert.equal(TILE_BADGE_LIMIT, 3)
  const all = tileBadges(img({
    status: 'keep', promoted_dataset_id: 4, flags: ['blur', 'noise'], framing: 'portrait',
  }))
  assert.equal(all.length, 5)
  const { shown, more } = capTileBadges(all)
  assert.deepEqual(shown.map((b) => b.key), ['keep', 'promoted', 'flag:blur'])
  assert.equal(more.text, '+2')
  assert.equal(more.title, 'Noisy, portrait')
  assert.equal(more.label, '2 more: Noisy, portrait')
})

test('three badges or fewer need no "+n"', () => {
  const { shown, more } = capTileBadges(tileBadges(img({ status: 'keep', flags: ['blur', 'nsfw'] })))
  assert.equal(shown.length, 3)
  assert.equal(more, null)
})

test('the decision badge always survives the cap', () => {
  const all = tileBadges(img({
    status: 'reject', reject_reason: 'blur', flags: ['blur', 'noise', 'small', 'bars'],
  }))
  assert.equal(capTileBadges(all).shown[0].key, 'reject')
})
