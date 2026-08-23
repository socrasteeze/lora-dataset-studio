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

/* ── Cloud-engine IDENTIFIERS (not just marketing phrases) ──────────────────
   The FORBIDDEN_* lists above are exact UI sentences. They are precise but
   narrow, and the 2026-07-27 sync proved how narrow: upstream shipped a new
   PromptPreview whose engine picker listed Nano Banana / ChatGPT / OpenRouter
   and branched on an `API_ENGINES` membership test, plus six API-key help
   topics and a `PREVIEW_ENGINES` tuple on the backend — none of which contains
   a single forbidden PHRASE, so every one of them merged green.

   This guards the identifiers themselves. A handful of legitimate references
   survive by design (LEGACY_API_ENGINE_TAGS so old rows still regenerate
   through Klein, explanatory comments, historical what's-new entries naming a
   feature that was removed), so the contract is a per-file BUDGET rather than
   a ban: the count may not grow, and a file not listed may not gain one at all.

   WHEN THIS FAILS after a merge: look at the new occurrence. If it is live
   plumbing for a removed engine, strip it (that is the whole point). If it is
   genuinely historical — a what's-new blurb about a feature this fork dropped,
   a comment explaining the divergence — bump that file's number here and say
   why in the commit. Never delete the entry to make it pass. */
const CLOUD_ENGINE_IDENTIFIERS = /nanobanana|chatgpt|openrouter/gi

const ALLOWED_SRC_CLOUD_REFS = {
  // The API-engine prompt metadata upstream shares with Klein; kept so the
  // identity-prompt shapes do not fork, filtered out of the UI instead.
  'components/common/promptOverride.js': 7,
  // Comment: why an unknown/legacy generator resolves to Klein.
  'components/dataset/IdentityPromptModal.jsx': 1,
  // canonicalEngines' comment about quietly retiring a stored cloud id.
  'components/dataset/engineSelection.js': 3,
  'components/dataset/scraperState.js': 1,
  'help/helpRegistry.js': 1,
  // Historical entries announcing engines this fork later removed. They moved
  // from whatsNew.js to whatsNewArchive.js on 2026-08-24 when upstream split the
  // feed — the same 21 references, in a file that is now loaded lazily. The
  // budget moved with them rather than being re-counted: a number that GREW
  // across that split would have meant upstream entries this fork had rejected
  // (or reworded) coming back in through the new file.
  'whatsNewArchive.js': 21,
}

async function cloudRefCounts(dir) {
  const counts = {}
  for (const file of await walkJs(dir)) {
    const rel = file.slice(dir.length + 1).split(/[\\/]/).join('/')
    const hits = (await readFile(file, 'utf8')).match(CLOUD_ENGINE_IDENTIFIERS)
    if (hits) counts[rel] = hits.length
  }
  return counts
}

test('no NEW cloud-engine identifier reaches frontend/src', async () => {
  const counts = await cloudRefCounts(SRC_DIR)
  const problems = []
  for (const [file, n] of Object.entries(counts)) {
    const allowed = ALLOWED_SRC_CLOUD_REFS[file]
    if (allowed === undefined) {
      problems.push(`${file}: ${n} cloud-engine reference(s) in a file that should have none`)
    } else if (n > allowed) {
      problems.push(`${file}: ${n} cloud-engine references, was ${allowed}`)
    }
  }
  assert.deepEqual(problems, [],
    `Cloud-engine identifiers (Nano Banana / ChatGPT / OpenRouter) grew in frontend/src.\n`
    + `${problems.join('\n')}\n`
    + `See FORK_NOTES.md Divergence 1. Strip live plumbing; only bump the budget\n`
    + `in this file for a genuinely historical mention, and say why in the commit.`)
})

test('the cloud-reference budget has no stale entries', async () => {
  // A file that drops to zero (or is deleted) should lose its entry, or the
  // budget silently re-authorises a future reintroduction.
  const counts = await cloudRefCounts(SRC_DIR)
  const stale = Object.keys(ALLOWED_SRC_CLOUD_REFS).filter((f) => !counts[f])
  assert.deepEqual(stale, [], `remove these from ALLOWED_SRC_CLOUD_REFS: ${stale.join(', ')}`)
})
