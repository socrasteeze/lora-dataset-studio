import test from 'node:test'
import { readSource } from './support/readSource.mjs'
import assert from 'node:assert/strict'

import { deriveCapabilitySummary, capabilityDestination } from '../src/hooks/useSetupSteps.js'
import { getHelpTopic } from '../src/help/helpRegistry.js'
import { isValidTarget } from '../src/whatsNew.js'
import { SETTINGS_SECTIONS } from '../src/components/settings/registry.js'

/* The Settings ▸ Overview capability grid is a dashboard AND a set of doors: a
   row that says "✗ Person masks" has to be clickable straight to the control
   that turns person masks on. This contract is what keeps a rotten door from
   ever reaching the screen — every row must carry a destination, and every
   destination must resolve against the LIVE registries (help topics, settings
   sections, the what's-new target validator), exactly the way whatsNew.test.js
   validates its own "Try it →" targets. */

const read = readSource

// Three rigs that between them light up every row shape: nothing configured,
// everything configured, and the "installed but ComfyUI isn't running" rig that
// puts Klein / Test Studio in the `pending` state.
const CAPS_EMPTY = {}
const CAPS_FULL = {
  engines: { klein: true, krea: true },
  captioners: { joycaption: true, ollama: true },
  ollama: { reachable: true, vision_model_ready: true },
  comfyui: { dir_valid: true, reachable: true },
  face_scoring: true, masks: true, watermark_inpaint: true,
  training_visible: true, studio_visible: true,
}
const CAPS_COMFY_OFF = { comfyui: { dir_valid: true, reachable: false } }

const RIGS = [
  ['nothing configured', CAPS_EMPTY],
  ['everything ready', CAPS_FULL],
  ['ComfyUI installed but not running', CAPS_COMFY_OFF],
]

test('every capability row carries a destination, in every rig', () => {
  for (const [name, caps] of RIGS) {
    const rows = deriveCapabilitySummary(caps)
    // 19 upstream, not 17: the three cloud API engines (Nano Banana, ChatGPT,
    // OpenRouter) are not capabilities on this fork (Divergence 1) — see
    // deriveCapabilitySummary. Upstream's own count moved 12 (Krea 2 Edit) ->
    // 14 (the two video pieces) -> 18 (bank scoring/SigLIP2/watermark
    // detector/scraping extras) -> 19 (clip encoding, counted apart from
    // decode/detect because they fail apart — ffmpeg can be absent on a
    // machine that decodes fine, and that machine cannot export a single
    // clip). This fork's count follows every one of those bumps and adds its
    // own WD14 tagger row, recomputed here from the array
    // deriveCapabilitySummary actually returns rather than copied from either
    // side's prose — 19 - 3 cloud + 1 WD14 = 17.
    assert.equal(rows.length, 17, `${name}: expected 17 capabilities`)
    for (const row of rows) {
      const dest = capabilityDestination(row)
      assert.ok(dest, `${name}: "${row.label}" has no destination`)
      assert.ok(dest.href && dest.href.startsWith('/'),
        `${name}: "${row.label}" href is not an in-app path (${dest.href})`)
      assert.ok(dest.where && dest.where.trim(),
        `${name}: "${row.label}" has no human destination name`)
    }
  }
})

test('every destination topic exists in the LIVE help registry', () => {
  for (const [name, caps] of RIGS) {
    for (const row of deriveCapabilitySummary(caps)) {
      const id = capabilityDestination(row).topic
      assert.ok(getHelpTopic(id),
        `${name}: "${row.label}" points at unknown help topic "${id}"`)
    }
  }
})

test('every destination href is a navigable in-app target', () => {
  for (const [name, caps] of RIGS) {
    for (const row of deriveCapabilitySummary(caps)) {
      const { href } = capabilityDestination(row)
      // Strip the focus hint: it is a DOM id, validated separately by the
      // help-registry contract, and not part of the route grammar.
      const route = href.replace(/([?&])focus=[^&]*/, '$1').replace(/[?&]$/, '')
      assert.equal(isValidTarget(route), true,
        `${name}: "${row.label}" → ${href} is not navigable`)
    }
  }
})

test('a settings destination names a real Settings section', () => {
  const titles = new Map(SETTINGS_SECTIONS.map((s) => [s.id, s.title]))
  for (const [name, caps] of RIGS) {
    for (const row of deriveCapabilitySummary(caps)) {
      const { href, where } = capabilityDestination(row)
      const m = href.match(/^\/settings\/([a-z0-9-]+)/)
      if (!m) continue
      assert.ok(titles.has(m[1]), `${name}: unknown settings section ${m[1]}`)
      assert.equal(where, titles.get(m[1]),
        `${name}: "${row.label}" announces "${where}" but lands on ${titles.get(m[1])}`)
    }
  }
})

test('a pending row is not a missing one: own destination, own wording', () => {
  const pending = deriveCapabilitySummary(CAPS_COMFY_OFF).filter((r) => r.pending)
  assert.deepEqual(pending.map((r) => r.label), ['Klein (local)', 'Test Studio'],
    'ComfyUI down should leave exactly Klein + Test Studio pending')
  for (const row of pending) {
    assert.ok(row.note, `${row.label}: pending row must explain itself`)
    const waiting = capabilityDestination(row)
    // Same row, ComfyUI genuinely absent → the install path, a DIFFERENT door.
    const missing = capabilityDestination({ ...row, pending: false, note: undefined })
    assert.notEqual(waiting.href, missing.href,
      `${row.label}: "waiting for a process" and "not installed" must not send the user to the same place`)
  }
})

test('the accessible label says the state AND where the row leads', () => {
  const rows = deriveCapabilitySummary(CAPS_COMFY_OFF)
  const label = (l) => {
    const row = rows.find((r) => r.label === l)
    return capabilityDestination(row).announce
  }
  // Local-only fork (Divergence 1): both engines are ComfyUI-backed, so a
  // ComfyUI that is down is what makes them unavailable — there is no API lane.
  assert.match(label('Klein (local)'), /^Klein \(local\) — launch ComfyUI to enable, /)
  const ready = deriveCapabilitySummary(CAPS_FULL).find((r) => r.label === 'Klein (local)')
  assert.match(capabilityDestination(ready).announce, /^Klein \(local\) — ready, /)
})

test('the Overview grid actually uses the destinations (no dead tiles)', () => {
  const src = read('src/components/settings/OverviewSection.jsx')
  assert.match(src, /capabilityDestination/,
    'OverviewSection must resolve each tile through capabilityDestination')
  assert.match(src, /<Link\b/, 'tiles must be real links, not clickable divs')
  assert.doesNotMatch(src, /FIX_LINKS/,
    'the coarse "Where to fix it" table is superseded by per-capability destinations')
})
