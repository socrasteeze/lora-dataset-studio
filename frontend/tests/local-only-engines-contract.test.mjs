/**
 * Local-only fork guard: Nano Banana (Gemini) and ChatGPT (OpenAI) image
 * engines must stay gone. An upstream merge that resurrects their Setup step,
 * Settings cards, or a stale frontend/dist will fail this contract.
 *
 * See FORK_NOTES.md § Divergence 1 and the merge routine's dist rebuild step.
 */
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(TEST_DIR, '../src')
const DIST_DIR = resolve(TEST_DIR, '../dist')

// Strings that mean the cloud API generation engines are back in the UI.
// Keep these specific (avoid matching legacy comments / what's-new history).
// Strings that mean the cloud API generation engines are back in the live UI.
// Avoid phrases that only appear in the historical what's-new removal blurb
// (that text is allowed — and gets bundled into dist).
const FORBIDDEN_UI = [
  'Powers Nano Banana',
  'Powers ChatGPT',
  'Unlocks: Nano Banana',
  'Gemini API key',
  'OpenAI API key',
  'Get a Gemini',
  'chatgpt_subscription',
]

// Setup must start on ComfyUI, not a 5-step "Image generation" API-keys step.
const REQUIRED_SETUP = [
  "SETUP_STEP_IDS = ['comfyui', 'ollama', 'quality', 'training']",
]

async function walkJs(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (e) {
    if (e && e.code === 'ENOENT') return out
    throw e
  }
  for (const ent of entries) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) out.push(...await walkJs(p))
    else if (['.js', '.jsx', '.mjs'].includes(extname(ent.name))) out.push(p)
  }
  return out
}

test('Setup wizard step ids stay local-only (no engines/API-keys step)', async () => {
  const src = await readFile(join(SRC_DIR, 'hooks', 'useSetupSteps.js'), 'utf8')
  for (const needle of REQUIRED_SETUP) {
    assert.ok(src.includes(needle), `useSetupSteps.js must contain: ${needle}`)
  }
  assert.ok(!src.includes("'engines'"), 'useSetupSteps must not list an engines step id')
})

test('frontend/src has no cloud API generation engine UI', async () => {
  const files = await walkJs(SRC_DIR)
  const hits = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    for (const needle of FORBIDDEN_UI) {
      if (text.includes(needle)) hits.push(`${file}: ${needle}`)
    }
  }
  assert.deepEqual(hits, [], `cloud API engine UI strings found:\n${hits.join('\n')}`)
})

test('frontend/dist (served bundle) has no resurrected cloud API engine UI', async () => {
  const files = await walkJs(DIST_DIR)
  assert.ok(files.length > 0, 'frontend/dist must exist — rebuild with npm run build after src changes')
  const hits = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    for (const needle of FORBIDDEN_UI) {
      if (text.includes(needle)) hits.push(`${file}: ${needle}`)
    }
  }
  assert.deepEqual(
    hits, [],
    `Stale frontend/dist still contains cloud API engines. After an upstream merge, ` +
    `rebuild with: cd frontend && npm run build  (see FORK_NOTES.md).\n${hits.join('\n')}`,
  )
})
