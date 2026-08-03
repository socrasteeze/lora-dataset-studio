/** Can the SELECTED machine actually run this pass?
 *
 * The Launch-all dialog used to answer that with `|| remote` — a truthy device
 * id and nothing else. So picking a peer that reports `bank_scoring: false`
 * TICKED ✨ Score for you, staged the whole bank across the network and died on
 * the first image as a mid-pipeline step error.
 *
 * The data was already on the client and unused: /api/cluster/devices serialises
 * every peer's own capability blob. This module is the one place that turns it
 * into a per-pass verdict.
 *
 * Refusal polarity matches the backend deliberately (bank_remote.peer_refusal):
 * only an EXPLICIT false blocks. A peer that has never checked in reports
 * nothing, and being unable to describe yourself is not the same as being unable
 * to do the work — the hub would run that job happily, so the dialog must not
 * pretend otherwise. Unknown is a warning, not a wall.
 */

/* MUST mirror PASS_PEER_CAPS in backend/app/services/bank_remote.py — pinned by
 * passDeviceGate.test.js. A list is an ANY-of: captions run on either engine, so
 * only a peer reporting BOTH missing is refused.
 *
 * scan / auto_reject / semantic_dedup are absent on purpose: they read this
 * machine's database and embeddings cache, never travel, and so can never be
 * blocked by the device you pick. */
export const PASS_PEER_CAPS = {
  score: ['bank_scoring'],
  faces: ['face_scoring'],
  watermark: ['ollama'],
  framing: ['ollama'],
  caption: ['joycaption', 'ollama'],
}

/* Passes that CANNOT travel, whatever the peer reports. Mirrors
 * image_bank_service.LOCAL_ONLY_STEPS, and the polarity is the opposite of
 * PASS_PEER_CAPS above on purpose: there, silence from a peer means "probably
 * fine". Here there is nothing to be silent about — no peer advertises the
 * tagger at all, so the permissive rule would wave every one of them through
 * and the pass would die on the other side, an hour into an overnight queue. */
export const LOCAL_ONLY_PASSES = ['tags']

const CAP_HINT = {
  bank_scoring: 'the bank-scoring extra',
  face_scoring: 'the face-scoring extra',
  joycaption: 'JoyCaption',
  ollama: 'Ollama with a vision model',
}

/** The peer we are gating against, or null for "this machine". */
function peerOf(device) {
  if (!device || device.local || device.id === 'local' || !device.id) return null
  return device
}

/** Is this pass's tool installed HERE — the pre-peer verdict, unchanged. */
function localReady(key, caps, visionReady) {
  switch (key) {
    case 'score':
    case 'semantic_dedup':
      return !!caps?.bank_scoring
    case 'faces':
      return !!caps?.face_scoring
    case 'watermark':
    case 'framing':
    case 'caption':
      return !!visionReady
    case 'tags':
      return !!caps?.wd14
    default:
      return true            // scan, auto_reject: always available
  }
}

/**
 * @returns {{ok: boolean, blocked: boolean, reason?: string, warn?: string}}
 *   `blocked` means the checkbox is disabled: the chosen machine has said it
 *   cannot do this. `ok: false` without `blocked` is the older, softer state —
 *   the pass is still selectable and will be recorded as skipped with a reason.
 */
export function stepGate(key, ctx = {}) {
  const { caps, visionReady, device } = ctx

  // Stage 2 reuses Score's embeddings, but it runs HERE either way — a remote
  // score brings them home. So it follows Score's verdict and is never blocked
  // by the device: with no embeddings it declines itself, which the bank card
  // already renders as "declined for a stated prerequisite", not as a fault.
  if (key === 'semantic_dedup') {
    const score = stepGate('score', ctx)
    return { ok: score.ok, blocked: false, warn: score.warn }
  }

  const peer = peerOf(device)
  if (!peer) return { ok: localReady(key, caps, visionReady), blocked: false }

  // A pass that cannot travel is blocked by ANY peer, not by what that peer
  // reports — the server refuses the whole queue at launch otherwise.
  if (LOCAL_ONLY_PASSES.includes(key)) {
    return { ok: false, blocked: true,
             reason: `${peer.name || 'that machine'} can’t run this — it only runs here` }
  }

  const needed = PASS_PEER_CAPS[key]
  if (!needed) return { ok: true, blocked: false }

  const name = peer.name || 'that machine'
  const blob = peer.capabilities || {}
  const hint = needed.map((c) => CAP_HINT[c] || c).join(' or ')

  if (needed.every((c) => blob[c] === false)) {
    return { ok: false, blocked: true, reason: `${name} reports no ${hint}` }
  }
  if (needed.every((c) => typeof blob[c] !== 'boolean')) {
    return { ok: true, blocked: false, warn: `${name} hasn’t reported what it can run yet` }
  }
  return { ok: true, blocked: false }
}
