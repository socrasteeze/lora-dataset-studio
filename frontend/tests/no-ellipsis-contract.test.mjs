/* User-visible text does not use U+2026. Comments may.
 *
 * The strip is string-aware: a URL's "//" inside a quote is not a comment,
 * so an ellipsis later on that line cannot hide behind it. Markdown is
 * scanned whole. The escape \\u2026 in a test is not the character.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const frontend = fileURLToPath(new URL('..', import.meta.url))
const repo = fileURLToPath(new URL('../..', import.meta.url))
const ELLIPSIS = '\u2026'

function stripJsComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  const lineComment = (at) => src.startsWith('//', at) && (at === 0 || src[at - 1] !== ':')
  while (i < n) {
    if (lineComment(i)) {
      const nl = src.indexOf('\n', i)
      i = nl < 0 ? n : nl + 1
      out += '\n'
      continue
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      out += '\n'
      continue
    }
    const q = src[i]
    if (q === '"' || q === "'" || q === '`') {
      out += q
      i += 1
      while (i < n) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2)
          i += 2
          continue
        }
        if (q === '`' && src.startsWith('${', i)) {
          out += '${'
          i += 2
          let depth = 1
          while (i < n && depth) {
            if (src[i] === '{') depth += 1
            else if (src[i] === '}') {
              depth -= 1
              if (!depth) break
            }
            out += src[i]
            i += 1
          }
          continue
        }
        out += src[i]
        if (src[i] === q) {
          i += 1
          break
        }
        i += 1
      }
      continue
    }
    out += q
    i += 1
  }
  return out
}

function stripPyComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    if (src[i] === '#') {
      const nl = src.indexOf('\n', i)
      i = nl < 0 ? n : nl + 1
      out += '\n'
      continue
    }
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i]
      const triple = src.startsWith(q.repeat(3), i)
      const end = triple ? q.repeat(3) : q
      out += end
      i += end.length
      while (i < n) {
        if (!triple && src[i] === '\\') {
          out += src.slice(i, i + 2)
          i += 2
          continue
        }
        if (src.startsWith(end, i)) {
          out += end
          i += end.length
          break
        }
        out += src[i]
        i += 1
      }
      continue
    }
    out += src[i]
    i += 1
  }
  return out
}

function visible(path, src) {
  const suf = path.slice(path.lastIndexOf('.')).toLowerCase()
  if (suf === '.py') return stripPyComments(src)
  if (suf === '.md') return src
  return stripJsComments(src)
}

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, acc)
    else acc.push(path)
  }
}

function scanned() {
  const files = []
  walk(join(frontend, 'src'), files)
  const bundled = join(repo, 'bundled')
  for (const plugin of readdirSync(bundled)) {
    const ui = join(bundled, plugin, 'frontend')
    try {
      if (statSync(ui).isDirectory()) walk(ui, files)
    } catch {
      /* plugin without a frontend tree */
    }
  }
  const guide = join(repo, 'docs', 'guide')
  for (const name of readdirSync(guide)) {
    if (name.endsWith('.md')) files.push(join(guide, name))
  }
  files.push(join(repo, 'docs', 'DATASET_GUIDE.md'))
  return files.filter((path) => /\.(js|jsx|mjs|css|md|py)$/.test(path))
}

test('visible text has no ellipsis character', () => {
  const hits = []
  for (const file of scanned()) {
    const text = readFileSync(file, 'utf8')
    if (!text.includes(ELLIPSIS)) continue
    const shown = visible(file, text)
    if (!shown.includes(ELLIPSIS)) continue
    const rel = relative(repo, file).replaceAll('\\', '/')
    shown.split('\n').forEach((line, index) => {
      if (line.includes(ELLIPSIS)) hits.push(`${rel}:${index + 1}`)
    })
  }
  assert.deepEqual(hits, [], hits.slice(0, 30).join('\n'))
})
