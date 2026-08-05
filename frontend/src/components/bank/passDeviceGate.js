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

/* The per-pass verdict for a PEER is computed on the server and arrives with
 * the device (`/api/cluster/devices` -> `device.passes`). This file used to
 * hold a second copy of the capability map, the local-only list and the hint
 * strings, kept in step with `bank_remote.py` by a test that string-parsed that
 * Python source — which a reformat, an inline comment or a `# noqa` would have
 * broken silently.
 *
 * The sibling dataset-manager project states the rule this now follows:
 * one function answers "can this machine run this?", and the picker and the
 * submit route both call it. Here that function is
 * `bank_remote.device_pass_gate`, and `refuse_steps_for_device` calls the same
 * one, so the dialog can no longer offer a pass the launch route refuses.
 *
 * What stays client-side is the LOCAL question — is this pass's tool installed
 * on THIS machine — because that is about the caps blob the page already holds
 * and has never had a second copy on the server. */

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

  // The server already decided, with the same function the launch route uses.
  const verdict = (peer.passes || {})[key]
  if (verdict) {
    return {
      ok: !!verdict.ok,
      blocked: !!verdict.blocked,
      ...(verdict.reason ? { reason: verdict.reason } : {}),
      ...(verdict.warn ? { warn: verdict.warn } : {}),
    }
  }

  // No verdict for this step means the server does not gate it (scan,
  // auto_reject) — or, on a device list fetched before the verdicts existed,
  // that we simply do not know. Both are "allowed": the launch route is the
  // authority and refuses anything this misses, which is the safe direction
  // for a picker that must never be MORE restrictive than the submit path.
  return { ok: true, blocked: false }
}
