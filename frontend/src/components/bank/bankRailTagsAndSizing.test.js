import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
const rail = read('BankFilterRail.jsx')
const workspace = read('BankWorkspace.jsx')
const atoms = read('BankAtoms.jsx')

/* The upstream Encre merge (f7543f826) moved every filter into the rail and
   dropped the 🔖 tag block without a sound: the server filter, the facet fetch
   and the workspace handlers all survived, wired to nothing. These pin both
   ends of the wire, so the next merge that drops one side fails here. */
test('the rail renders each tag facet as a multiselect menu', () => {
  assert.match(rail, /aria-label="Tag filters"/)
  assert.match(rail, /type="checkbox"/)
  assert.match(rail, /onToggle\(option\.name\)/)
  assert.match(rail, /tagGroups\.facets/)
  assert.doesNotMatch(rail, /All other tags/)
  assert.doesNotMatch(rail, /long tail trimmed/)
})

test('the workspace hands the rail its tag state and handlers', () => {
  for (const prop of ['tagFiltersShown={tagFiltersShown}', 'tagGroups={grouped}',
    'toggleFacetTag={toggleFacetTag}', 'wd14Tags={filter.wd14Tags}']) {
    assert.ok(workspace.includes(prop), `BankWorkspace passes ${prop}`)
  }
  assert.equal(workspace.includes('setFacetTag='), false)
  assert.equal(workspace.includes('tagTruncated='), false)
})

/* Uneven controls: a label allowed to wrap doubles its button's height beside
   one-line neighbours. Buttons in the rail keep one line and one height. */
test('status tiles and chips keep one line and a fixed desktop height', () => {
  assert.match(rail, /controlHeight\('md'\)\} flex min-w-0 items-center justify-between gap-2 whitespace-nowrap/)
  assert.match(atoms, /inline-flex min-h-10 lg:min-h-0 lg:h-7 items-center whitespace-nowrap rounded-full/)
})
