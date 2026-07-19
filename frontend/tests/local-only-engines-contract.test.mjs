/**
 * Local-only fork guard: Nano Banana (Gemini) / ChatGPT (OpenAI) image engines
 * AND remote GPU rental (vast.ai / "Train in cloud") must stay gone. An upstream
 * merge that resurrects their Setup/Settings/Runs UI, or a stale frontend/dist,
 * will fail this contract.
 *
 * See FORK_NOTES.md § Divergence 1 + 4 and the merge routine's dist rebuild step.
 */
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(TEST_DIR, '../src')
const DIST_DIR = resolve(TEST_DIR, '../dist')

// Strings that mean cloud API generation engines are back in the live UI.
// Avoid phrases that only appear in historical what's-new removal blurbs.
const FORBIDDEN_ENGINE_UI = [
  'Powers Nano Banana',
  'Powers ChatGPT',
  'Unlocks: Nano Banana',
  'Gemini API key',
  'OpenAI API key',
  'Get a Gemini',
  'chatgpt_subscription',
]

// Strings that mean remote GPU rental / cloud training UI is back.
// Keep these specific so FORK_NOTES / dormant API path comments can mention
// the old lane without failing the contract.
const FORBIDDEN_TRAINING_UI = [
  'Open the vast.ai console',
  'Rents a vast.ai GPU',
  'Train in cloud',
  'Cloud training isn',
  'Choose cloud GPU speed',
  'Stop cloud run',
  'Download the cloud-trained',
  'rent GPUs on demand',
  'vast.ai API key',
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
    else if (['.js', '.jsx', '.mjs'].includes(extname(ent.name))) {
      // Skip tests — they may name forbidden strings while asserting absence.
      if (/\.test\.(js|mjs|jsx)$/.test(ent.name) || /[\\/]tests[\\/]/.test(p)) continue
      out.push(p)
    }
  }
  return out
}

async function findForbidden(dir, needles) {
  const files = await walkJs(dir)
  const hits = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    for (const needle of needles) {
      if (text.includes(needle)) hits.push(`${file}: ${needle}`)
    }
  }
  return hits
}

test('Setup wizard step ids stay local-only (no engines/API-keys step)', async () => {
  const src = await readFile(join(SRC_DIR, 'hooks', 'useSetupSteps.js'), 'utf8')
  for (const needle of REQUIRED_SETUP) {
    assert.ok(src.includes(needle), `useSetupSteps.js must contain: ${needle}`)
  }
  assert.ok(!src.includes("'engines'"), 'useSetupSteps must not list an engines step id')
})

test('CapabilitiesContext forces cloud_training off', async () => {
  const src = await readFile(join(SRC_DIR, 'context', 'CapabilitiesContext.jsx'), 'utf8')
  assert.ok(
    src.includes('cloud_training: false'),
    'CapabilitiesContext must force cloud_training: false',
  )
})

test('frontend/src has no cloud API generation engine UI', async () => {
  const hits = await findForbidden(SRC_DIR, FORBIDDEN_ENGINE_UI)
  assert.deepEqual(hits, [], `cloud API engine UI strings found:\n${hits.join('\n')}`)
})

test('frontend/src has no remote GPU rental / cloud training UI', async () => {
  const hits = await findForbidden(SRC_DIR, FORBIDDEN_TRAINING_UI)
  assert.deepEqual(hits, [], `cloud training UI strings found:\n${hits.join('\n')}`)
})

test('frontend/dist (served bundle) has no resurrected cloud API engine UI', async () => {
  const files = await walkJs(DIST_DIR)
  assert.ok(files.length > 0, 'frontend/dist must exist — rebuild with npm run build after src changes')
  const hits = await findForbidden(DIST_DIR, FORBIDDEN_ENGINE_UI)
  assert.deepEqual(
    hits, [],
    `Stale frontend/dist still contains cloud API engines. After an upstream merge, ` +
    `rebuild with: cd frontend && npm run build  (see FORK_NOTES.md).\n${hits.join('\n')}`,
  )
})

test('frontend/dist (served bundle) has no remote GPU rental / cloud training UI', async () => {
  const files = await walkJs(DIST_DIR)
  assert.ok(files.length > 0, 'frontend/dist must exist — rebuild with npm run build after src changes')
  const hits = await findForbidden(DIST_DIR, FORBIDDEN_TRAINING_UI)
  assert.deepEqual(
    hits, [],
    `Stale frontend/dist still contains cloud training UI. After an upstream merge, ` +
    `rebuild with: cd frontend && npm run build  (see FORK_NOTES.md).\n${hits.join('\n')}`,
  )
})
