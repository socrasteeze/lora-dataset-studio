/** Does this peer run the same build as the Primary?
 *
 * There was no version handshake at all. A peer on older code IS survivable —
 * the hub's result parser is tolerant and the vision reader falls back to the
 * older key — but nothing detected or reported the disagreement, so a mixed
 * cluster looked exactly like a matched one right up until a pass behaved
 * differently on one machine.
 *
 * The rule is deliberately soft. Being unable to say what you run is not the
 * same as running the wrong thing:
 *
 *   - either side unknown  -> no note. A peer that has never checked in reports
 *                             nothing, and an older peer has no `app_version`
 *                             key at all. Neither is evidence of a mismatch.
 *   - equal                -> no note.
 *   - different            -> a note naming both, and nothing is blocked.
 *
 * This mirrors `passDeviceGate`'s polarity: only an explicit disagreement says
 * anything, and even then it informs rather than refuses — the hub genuinely
 * can run against an older peer.
 *
 * Pure so `node --test` can cover it; the .jsx only renders the string.
 */

/**
 * @param {object|null|undefined} peerCaps  the peer's reported capability blob
 * @param {object|null|undefined} localCaps this machine's own blob
 * @returns {string|null} a sentence for the peer row, or null when there is
 *                        nothing worth saying
 */
export function peerVersionNote(peerCaps, localCaps) {
  const theirs = String((peerCaps || {}).app_version || '').trim()
  const ours = String((localCaps || {}).app_version || '').trim()
  if (!theirs || !ours || theirs === ours) return null
  return `runs ${theirs}, this machine runs ${ours}`
}

export default peerVersionNote
