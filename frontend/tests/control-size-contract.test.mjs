/* The controls this wave names use the shared height helpers.
 *
 * A raw `rounded-md` + `border` + `px-` class string at one of those sites
 * is a control that opted out of the row height. The folder browser modal
 * inside FolderPicker.jsx is not one of those sites; later waves migrate
 * the remaining raw buttons when they touch those files.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const RAW = /(['"`])(?:\\.|(?!\1)[^\\])*?\1/g

function rawControl(source) {
  const hits = []
  for (const match of source.matchAll(RAW)) {
    const body = match[0]
    if (/\brounded-md\b/.test(body) && /\bborder\b/.test(body) && /\bpx-/.test(body)) {
      hits.push(body.slice(0, 120))
    }
  }
  return hits
}

test('FolderPickerField uses Input and Button, not a hand-written field', () => {
  const src = read('../src/components/common/FolderPicker.jsx')
  const field = src.slice(src.indexOf('export default function FolderPickerField'))
  assert.ok(field.includes('export default function FolderPickerField'))
  assert.match(src, /from '\.\/Controls\.jsx'/)
  assert.match(field, /<Input\b/)
  assert.match(field, /<Button\b/)
  assert.deepEqual(rawControl(field), [])
})

test('FolderCheckLine uses Button at the shared md height', () => {
  const src = read('../src/components/bank/FolderCheckLine.jsx')
  assert.match(src, /from '\.\.\/common\/Controls\.jsx'/)
  assert.match(src, /<Button\b/)
  assert.doesNotMatch(src, /text-xs font-semibold/)
  assert.deepEqual(rawControl(src), [])
})

test('TileSizeControl uses Chip at size sm and does not pin h-6', () => {
  const src = read('../src/components/shared/TileSizeControl.jsx')
  assert.match(src, /from '\.\.\/common\/Controls\.jsx'/)
  assert.match(src, /<Chip\b/)
  assert.doesNotMatch(src, /\bh-6\b/)
  assert.deepEqual(rawControl(src), [])
})

test('the backup summary uses btnClass at size md', () => {
  const src = read('../src/components/dataset/FullBackupControls.jsx')
  assert.match(src, /btnClass\(\{ size: 'md' \}\)/)
  const summary = src.slice(src.indexOf('<summary'), src.indexOf('</summary>'))
  assert.doesNotMatch(summary, /\bpy-/)
  assert.deepEqual(rawControl(summary), [])
})

test('settings INPUT_CLASS is fieldClass, and the file has no raw control class', () => {
  const src = read('../src/components/settings/primitives.jsx')
  assert.match(src, /\$\{fieldClass\(\)\}/)
  assert.match(src, /\[&:is\(textarea\)\]:h-auto/)
  assert.match(src, /btnShape\(\)/)
  assert.deepEqual(rawControl(src), [])
})
