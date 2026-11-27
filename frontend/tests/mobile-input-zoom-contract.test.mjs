import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import postcss from 'postcss'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('editable controls override small text sizes on coarse pointers and narrow screens', () => {
  const css = postcss.parse(read('../src/index.css'))
  const queries = ['(max-width: 1023px)', '(pointer: coarse)']
  const rules = css.nodes.filter((node) => node.name === 'media' &&
    node.params.split(/\s*,\s*/).sort().join(', ') === queries.join(', '))
  const controls = rules.flatMap((rule) => rule.nodes).find((rule) =>
    rule.nodes?.some((decl) => decl.prop === 'font-size' && decl.value === '16px' && decl.important))
  assert.ok(controls, 'expected an unlayered mobile 16px rule with !important')
  const scope = ':root body :is('
  assert.equal(controls.selectors.length, 1)
  assert.ok(controls.selector.startsWith(scope) && controls.selector.endsWith(')'), 'expected one shared high-specificity selector')
  const selectors = postcss.list.comma(controls.selector.slice(scope.length, -1))
  for (const selector of ['select', 'textarea', '[contenteditable]:not([contenteditable="false"])']) {
    assert.ok(selectors.includes(selector), `missing ${selector}`)
  }
  const input = selectors.find((selector) => selector.startsWith('input:not('))
  assert.ok(input, 'expected an input selector with non-text exclusions')
  assert.ok(!selectors.includes('input'), 'bare input also matches non-text controls')
  for (const type of ['checkbox', 'radio', 'hidden', 'range', 'file', 'button', 'submit', 'reset', 'image', 'color']) {
    assert.ok(input.includes(`[type="${type}"]`), `expected to exclude ${type} inputs`)
  }
})

test('the viewport limits iOS focus zoom and exposes safe-area insets', () => {
  const viewport = read('../index.html').match(/<meta\s+name="viewport"\s+content="([^"]+)"/i)?.[1]
  assert.equal(viewport, 'width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover')
})
