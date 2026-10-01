/* The shared control system: one height per size, so a row of buttons,
 * selects and inputs lines up on a desktop and stays finger-sized on a phone.
 *
 * Wrong versions this pins: a button without `inline-flex` (its <svg> icon
 * stacks above the label), a size whose phone target drops under 40 px, a
 * field and a button of the same size that do not share a height, and a typo
 * that silently renders `undefined` into a className.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { btnClass, btnShape, controlHeight, fieldClass } from './controls.js'

const classes = (s) => s.split(/\s+/).filter(Boolean)
const has = (s, cls) => assert.ok(classes(s).includes(cls), `expected "${cls}" in "${s}"`)
const lacks = (s, cls) => assert.ok(!classes(s).includes(cls), `unexpected "${cls}" in "${s}"`)

test('each size is one fixed desktop height and a 40-px target below lg', () => {
  const heights = { sm: 'lg:h-7', md: 'lg:h-8', lg: 'lg:h-9' }
  for (const [size, h] of Object.entries(heights)) {
    const s = controlHeight(size)
    has(s, 'min-h-10')
    has(s, 'lg:min-h-0')
    has(s, h)
  }
  assert.equal(controlHeight(), controlHeight('md'))
})

test('a button lays its icon beside the label, never above it', () => {
  const s = btnClass()
  for (const cls of ['inline-flex', 'items-center', 'justify-center', 'gap-1.5', 'whitespace-nowrap', 'rounded-md']) {
    has(s, cls)
  }
})

test('sizes carry their type scale', () => {
  has(btnShape({ size: 'sm' }), 'text-xs')
  has(btnShape({ size: 'md' }), 'text-sm')
  has(btnShape({ size: 'lg' }), 'text-sm')
  has(btnShape({ size: 'lg' }), 'font-semibold')
})

test('a field and a button of the same size share one height', () => {
  for (const size of ['sm', 'md']) {
    const h = controlHeight(size)
    assert.ok(btnClass({ size }).includes(h))
    assert.ok(fieldClass({ size }).includes(h))
  }
})

test('shrink-0 only when asked, for a row that scrolls sideways', () => {
  lacks(btnClass(), 'shrink-0')
  has(btnClass({ noShrink: true }), 'shrink-0')
  has(btnShape({ noShrink: true }), 'shrink-0')
})

test('btnShape carries no colours; each variant adds its own', () => {
  const shape = btnShape()
  for (const cls of ['bg-gradient-primary', 'bg-surface', 'border', 'text-content']) lacks(shape, cls)
  has(btnClass({ variant: 'primary' }), 'bg-gradient-primary')
  has(btnClass({ variant: 'secondary' }), 'border-border')
  has(btnClass({ variant: 'danger' }), 'bg-red-600/80')
  has(btnClass({ variant: 'ghost' }), 'hover:bg-surface-raised')
  assert.ok(btnClass({ variant: 'primary' }).startsWith(shape))
})

test('an unknown size or variant fails loudly instead of rendering "undefined"', () => {
  assert.throws(() => controlHeight('xl'), /unknown size "xl"/)
  assert.throws(() => btnClass({ variant: 'primray' }), /unknown variant "primray"/)
  assert.throws(() => btnShape({ size: 'xs' }), /unknown size/)
  assert.throws(() => fieldClass({ size: 'xl' }), /unknown field size "xl"/)
  has(fieldClass({ size: 'lg' }), 'lg:h-9')
  has(fieldClass({ size: 'lg' }), 'text-sm')
})

test('no output contains a stray "undefined" or doubled space', () => {
  for (const size of ['sm', 'md', 'lg']) {
    for (const variant of ['primary', 'secondary', 'danger', 'ghost']) {
      const s = btnClass({ variant, size, noShrink: true })
      assert.doesNotMatch(s, /undefined|\s{2}/)
    }
  }
  for (const size of ['sm', 'md', 'lg']) {
    assert.doesNotMatch(fieldClass({ size }), /undefined|\s{2}/)
  }
})

test('Button, Input, Select and Chip render the shared classes', async () => {
  await import('../../../tests/support/mountJsx.mjs')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { Button, IconButton, Input, Select, Chip } = await import('./Controls.jsx')
  const html = (node) => renderToStaticMarkup(node)

  const button = html(createElement(Button, { children: 'Save' }))
  assert.match(button, /type="button"/)
  assert.match(button, /min-h-10/)
  assert.match(button, /lg:h-8/)
  assert.match(button, /text-sm/)

  const large = html(createElement(Button, { size: 'lg', variant: 'primary', children: 'Create' }))
  assert.match(large, /lg:h-9/)
  assert.match(large, /bg-gradient-primary/)

  const icon = html(createElement(IconButton, { label: 'Close', children: 'x' }))
  assert.match(icon, /aria-label="Close"/)
  assert.match(icon, /lg:h-8/)

  const input = html(createElement(Input, { 'aria-label': 'Name' }))
  assert.match(input, /<input/)
  assert.match(input, /lg:h-8/)
  assert.match(input, /text-sm/)

  const select = html(createElement(Select, { 'aria-label': 'Size', children: 'S' }))
  assert.match(select, /<select/)
  assert.match(select, /lg:h-8/)

  const chip = html(createElement(Chip, { pressed: true, children: 'M' }))
  assert.match(chip, /aria-pressed="true"/)
  assert.match(chip, /lg:h-7/)
  assert.match(chip, /text-xs/)
  assert.doesNotMatch(chip, /\bh-6\b/)
})

test('every class is written out whole in the source, where Tailwind can find it', () => {
  // Tailwind scans source TEXT. A class assembled from pieces (`lg:h-${n}`)
  // would build a string no stylesheet rule matches.
  const src = readFileSync(new URL('./controls.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /[\w:-]\$\{/, 'no class may be assembled from a template piece')
  const outputs = ['sm', 'md', 'lg'].flatMap((size) => ['primary', 'secondary', 'danger', 'ghost']
    .map((variant) => btnClass({ variant, size, noShrink: true })))
    .concat(fieldClass({ size: 'sm' }), fieldClass({ size: 'md' }))
  for (const cls of new Set(outputs.flatMap(classes))) {
    assert.ok(src.includes(cls), `"${cls}" is not written literally in controls.js`)
  }
})
