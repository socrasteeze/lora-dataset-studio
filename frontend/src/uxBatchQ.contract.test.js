import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

// Source-text contracts for a batch of small UX fixes. They prove the rules are
// WRITTEN; the layout itself was measured in a browser (see the commit message).
const SRC = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8').replace(/\r\n/g, '\n')

test('the phone input font-size rule sits outside @layer base and beats text-xs/text-sm', () => {
  const css = read('index.css')
  const layerStart = css.indexOf('@layer base {')
  const layerEnd = css.indexOf('\n}\n', layerStart)
  const rule = css.indexOf('input, select, textarea {')
  assert.ok(rule > layerEnd, 'the rule must come after the base layer closes')
  assert.match(css.slice(rule, rule + 80), /font-size: 16px !important/)
  const media = css.lastIndexOf('@media', rule)
  assert.match(css.slice(media, rule), /max-width: 639px/)
  assert.match(css.slice(media, rule), /pointer:\s*coarse/)
  assert.match(css, /html \{[\s\S]*?overflow-x: clip;/)
  assert.match(css, /body \{[\s\S]*?overflow-x: clip;/)
  const html = readFileSync(path.join(SRC, '..', 'index.html'), 'utf8')
  assert.doesNotMatch(html, /maximum-scale|user-scalable/)
})

test('anchors clear the sticky app bar', () => {
  const css = read('index.css')
  assert.match(css, /html \{\s*scroll-padding-top: var\(--app-header-h\);/)
  // Measured 2026-09-29: 64.8 px below 768 px wide, 101.6 px from 768 px up.
  assert.match(css, /--app-header-h: 65px;/)
  assert.match(css, /:root\[data-theme="dark"\] \{ --app-header-h: 102px; \}/)
  assert.doesNotMatch(read('components/common/Markdown.jsx'), /scroll-mt-/)
})

test('the Guide does not nest a second <main>, and its side menus can stick', () => {
  const guide = read('pages/GuidePage.jsx')
  assert.doesNotMatch(guide, /<main[\s>]/)
  assert.match(guide, /<article className=/)
  assert.match(guide, /<aside className="lg:self-stretch">/)
  assert.match(guide, /<aside className="hidden xl:block xl:self-stretch">/)
  assert.match(read('pages/SettingsPage.jsx'), /<aside className="lg:self-stretch">/)
  // 80 px was shorter than the 102 px bar: a "sticky" menu sat under it.
  for (const file of ['pages/GuidePage.jsx', 'pages/SettingsPage.jsx']) {
    assert.doesNotMatch(read(file), /sticky[^"]*top-20/)
  }
})

test('every copy button goes through copyText', () => {
  const offenders = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name) && name !== 'copyText.js') {
        if (/navigator\.clipboard/.test(readFileSync(full, 'utf8'))) offenders.push(path.relative(SRC, full))
      }
    }
  }
  walk(SRC)
  assert.deepEqual(offenders, [])
})

test('the Guide renders a Copy button on code blocks', () => {
  const md = read('components/common/Markdown.jsx')
  assert.match(md, /case 'code': return <CodeBlock /)
  assert.match(md, /min-h-10[^"]*lg:min-h-0/)
  assert.match(md, /'Copied'/)
})

test('index.html paints a placeholder inside #root before React mounts', () => {
  const html = readFileSync(path.join(SRC, '..', 'index.html'), 'utf8')
  assert.match(html, /<div id="root"><div[^>]*>Loading LoRA Dataset Studio<\/div><\/div>/)
})

test('a dataset list that never loaded is not shown as an empty library', () => {
  const hook = read('hooks/useDataset.js')
  assert.match(hook, /useState\('loading'\)/)
  assert.match(hook, /setListStatus\('error'\)/)
  assert.match(hook, /listStatus, retryList: fetchList/)
  const panel = read('components/dataset/DatasetListPanel.jsx')
  assert.match(panel, /const pending = empty && listStatus !== 'ready'/)
  assert.match(panel, /Loading datasets/)
  assert.match(panel, /Could not load your datasets\./)
  assert.ok(panel.indexOf('{pending ? (') < panel.indexOf('<EmptyState />', panel.indexOf('{pending ? (')))
  assert.match(read('pages/DatasetPage.jsx'), /listStatus=\{ds\.listStatus\} onRetryList=\{ds\.retryList\}/)
})
