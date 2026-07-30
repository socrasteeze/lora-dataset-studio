/* "This machine is working for a Primary" — the peer's own visible state.
 *
 * A compute peer runs someone else's GPU work for minutes or hours with nothing
 * on screen saying so: the role lives in Settings ▸ Devices and nowhere else, so
 * the machine looks idle while its card is pinned. Two surfaces fix that, and
 * both take their words from here so they are testable without a DOM:
 *
 *   - a header chip, visible while the peer's UI is open;
 *   - the browser TAB TITLE, which is the one you can read without switching to
 *     the tab — the case that actually matters for a pinned tab.
 */

/** Job kinds as the user should read them, not as the wire names them. */
const KIND_WORDS = {
  comfy: 'generating an image',
  vision: 'a vision pass',
  infer: 'a scoring pass',
  training: 'a training run',
}

export const EMPTY_PEER_ACTIVITY = { role: 'standalone', busy: false }

/** Defensive shape for the /api/cluster/activity payload — an unreachable or
 *  half-written response must read as "not busy", never as busy-forever. */
export function normalizePeerActivity(data) {
  if (!data || typeof data !== 'object') return EMPTY_PEER_ACTIVITY
  return {
    role: typeof data.role === 'string' ? data.role : 'standalone',
    busy: data.busy === true,
    kind: typeof data.kind === 'string' && data.kind ? data.kind : null,
    phase: typeof data.phase === 'string' && data.phase ? data.phase : null,
    connected: data.connected === true,
  }
}

/** True only for a peer that is actually executing something. A peer sitting
 *  idle gets no chip and no title change: a header lit whenever the app is
 *  merely *able* to work would be lit permanently, which is the same as off. */
export function isPeerWorking(a) {
  return !!a && a.role === 'peer' && a.busy === true
}

/** The header chip's text, or null when nothing should render.
 *  Names the work when the kind is known and degrades to the plain sentence
 *  when it isn't — "busy" with no object is the thing being fixed here. */
export function peerChipLabel(a) {
  if (!isPeerWorking(a)) return null
  const what = KIND_WORDS[a.kind] || (a.kind ? `a ${a.kind} job` : null)
  return what ? `Working for Primary · ${what}` : 'Working for Primary'
}

/** Longer form for the chip's title/aria — adds the phase when the peer
 *  reported one, since that is what moves during a long pass. */
export function peerChipTitle(a) {
  const base = peerChipLabel(a)
  if (!base) return null
  return a.phase ? `${base} (${a.phase})` : base
}

/** The document title while working, or the untouched base when idle.
 *  The bullet leads so it survives truncation in a narrow pinned tab, where
 *  only the first character or two is visible. */
export function peerTabTitle(a, baseTitle) {
  const base = String(baseTitle || '').trim() || 'LoRA Dataset Studio'
  return isPeerWorking(a) ? `● Working — ${base}` : base
}
