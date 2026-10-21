import assert from 'node:assert/strict'
import test from 'node:test'
import { folderPreview, folderPathPreview, categoryForKind } from './folderNaming.js'

test('folder previews preserve category and identity while abbreviating words', () => {
  for (const name of ['Amber-art', 'Amber_art', 'Amber art']) {
    assert.equal(folderPreview(name, 'style', 'LDS'), 'STYL-AMBE-ART_LDS####')
  }
  assert.equal(folderPreview('Caf\u00e9_\u00c9tude', 'character', 'LDS'), 'CHAR-CAFE-ETUD_LDS####')
  assert.equal(folderPreview('\u753b\u50cf', 'miscellaneous', 'LDS'), 'MISC-DATA_LDS####')
  assert.equal(folderPreview('../___!!!', 'miscellaneous', 'LDS'), 'MISC-DATA_LDS####')
  const long = folderPreview('example '.repeat(100), 'style', 'LDS')
  assert.ok(long.length <= 64 && long.endsWith('_LDS####'))
  assert.equal(folderPathPreview('X:\\sets\\LDS', 'Amber', 'style', 'LDS'), 'X:\\sets\\LDS\\STYL-AMBE_LDS####')
  assert.equal(categoryForKind('concept'), 'miscellaneous')
})
