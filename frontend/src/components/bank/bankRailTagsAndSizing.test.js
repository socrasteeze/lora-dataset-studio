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
test('the rail renders the WD14 tag filter', () => {
  assert.match(rail, /aria-label="Tag filters"/)
  assert.match(rail, /setFacetTag\(facet, e\.target\.value\)/)
  assert.match(rail, /toggleWd14Tag\(o\.name\)/)
  assert.match(rail, /tagGroups\.facets\.map/)
  assert.match(rail, /tagGroups\.other/)
})

test('the workspace hands the rail its tag state and handlers', () => {
  for (const prop of ['tagFiltersShown={tagFiltersShown}', 'tagGroups={grouped}',
    'setFacetTag={setFacetTag}', 'toggleWd14Tag={toggleWd14Tag}', 'wd14Tags={filter.wd14Tags}']) {
    assert.ok(workspace.includes(prop), `BankWorkspace passes ${prop}`)
  }
})

/* Uneven controls: a label allowed to wrap doubles its button's height beside
   one-line neighbours. Buttons in the rail keep one line and one height. */
test('status tiles and chips keep one line and a fixed desktop height', () => {
  assert.match(rail, /lg:h-9 min-w-0 items-center justify-between gap-2 whitespace-nowrap/)
  assert.match(atoms, /inline-flex min-h-10 lg:min-h-0 lg:h-7 items-center whitespace-nowrap rounded-full/)
})
