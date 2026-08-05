/** What a partially-capable machine cannot do, named rather than counted.
 *
 * The picker used to append a bare `(some passes)`. The spec that added it said
 * so itself: it "says a peer is partial without saying which", and argued that
 * naming them there would mean a second, worse copy of the per-pass rule inside
 * a single <option>.
 *
 * That argument held while the browser had to recompute the verdict from a
 * capability blob. It does not any more: the server decides each pass with the
 * same function the launch route uses and ships the answer — label included —
 * on the device. Naming them is now a read, not a second copy.
 *
 * It also replaces a THIRD copy of the capability knowledge that lived in the
 * option-building loop: `bank_scoring && face_scoring && ollama`, a hand-listed
 * set that no test pinned and that would not have noticed a new gated pass.
 *
 * Kept out of the .jsx so `node --test` can cover it.
 */

/** Beyond this many, the names stop fitting in an <option> and a count reads better. */
export const MAX_NAMED = 2

/**
 * @param {object|null|undefined} device a device from /api/cluster/devices
 * @returns {string} a suffix to append to the option label, or '' when the
 *                   machine can run everything (or has not said otherwise)
 */
export function devicePartialLabel(device) {
  const passes = (device && device.passes) || null
  if (!passes) return ''

  const blocked = Object.keys(passes)
    .filter((key) => passes[key] && passes[key].blocked)
    .map((key) => (passes[key].label || key))
    .sort()

  if (blocked.length === 0) return ''
  if (blocked.length <= MAX_NAMED) return ` (no ${blocked.join(', ')})`
  return ` (${blocked.length} passes it can’t run)`
}

export default devicePartialLabel
