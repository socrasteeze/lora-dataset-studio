/* One type scale in app source and bundled plugin UI.
 *
 * Allowed: text-2xs, text-xs, text-sm, text-base, text-xl, text-2xl.
 * Anything else — an arbitrary text-[…] or a named size outside that list —
 * fails here. The allowlist starts empty. Adding a path to it is a decision,
 * not a way to land a one-off size.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const frontend = fileURLToPath(new URL('..', import.meta.url))
const repo = fileURLToPath(new URL('../..', import.meta.url))

/** Paths, relative to the repo, that may keep an off-scale class. Empty. */
const ALLOWLIST = []

const OFF_SCALE = /(?<![\w-])text-(?:\[|lg\b|3xl\b|4xl\b|5xl\b|6xl\b|7xl\b|8xl\b|9xl\b)/g

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, acc)
    else if (/\.(js|jsx|mjs|css)$/.test(name)) acc.push(path)
  }
}

function scannedFiles() {
  const files = []
  walk(join(frontend, 'src'), files)
  const bundled = join(repo, 'bundled')
  for (const plugin of readdirSync(bundled)) {
    const ui = join(bundled, plugin, 'frontend')
    try {
      if (statSync(ui).isDirectory()) walk(ui, files)
    } catch {
      /* a plugin with no frontend tree is not a type-scale surface */
    }
  }
  return files
}

test('the type-scale allowlist starts empty', () => {
  assert.deepEqual(ALLOWLIST, [])
})

test('frontend and bundled UI use only the named type scale', () => {
  const hits = []
  for (const file of scannedFiles()) {
    const rel = relative(repo, file).replaceAll('\\', '/')
    if (ALLOWLIST.includes(rel)) continue
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(OFF_SCALE)) {
      const line = text.slice(0, match.index).split('\n').length
      hits.push(`${rel}:${line} ${match[0]}`)
    }
  }
  assert.deepEqual(hits, [], hits.slice(0, 40).join('\n'))
})
