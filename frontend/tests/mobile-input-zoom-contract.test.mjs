/* iOS Safari auto-zooms the page when a text-like input's effective font-size
 * is under 16px. index.css carries a global rule bumping every input/select/
 * textarea to 16px below the app's own `sm` breakpoint (640px) so that trigger
 * can't fire at all — belt-and-suspenders alongside the fixes for the actual
 * overflow sources (see bank-curate-popover-mobile-contract.test.mjs and
 * mobile-rail-containing-block.test.mjs), since the zoom transition is the
 * documented mechanism by which a latent overflow gets "stuck" as a
 * persistently scrollable page. This greps the raw CSS — there is no CSS
 * parser in this test environment, and the whole point is that the rule
 * survives a future tidy-up of index.css.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const css = fs.readFileSync(path.join(here, '..', 'src/index.css'), 'utf8')

test('mobile form controls are forced to 16px below the sm breakpoint', () => {
  assert.match(css, /@media \(max-width:\s*639px\)\s*\{[^}]*input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px;?[^}]*\}[^}]*\}/s,
    'index.css must set input/select/textarea to font-size: 16px inside a max-width: 639px media query')
})

test('the rule is scoped below sm, not applied globally', () => {
  // A bare `input { font-size: 16px }` outside any media query would also
  // resize every desktop control — the whole point is that desktop keeps
  // today's text-xs/text-sm sizing untouched.
  const ruleIndex = css.search(/input,\s*select,\s*textarea\s*\{\s*font-size:\s*16px/)
  assert.ok(ruleIndex > -1, 'the font-size rule must exist')
  const before = css.slice(Math.max(0, ruleIndex - 200), ruleIndex)
  assert.match(before, /@media \(max-width:\s*639px\)/,
    'the font-size: 16px rule must be nested inside the max-width: 639px media query')
})
