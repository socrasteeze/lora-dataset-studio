/* Which machine each picker remembers — pure, so it can be tested.
 *
 * ONE key was shared by every picker, and the surfaces do not agree on what is
 * eligible: a ComfyUI backend picked for the Klein inpaint engine is not
 * offerable for a bank pass. That already cost a reconciliation effect — a
 * dialog reading "this machine" while it posted a peer — and it became
 * untenable when the bank workspace grew a SECOND picker: a bank-pass one for
 * the Analyze row beside the comfy one for the inpaint engine, on the same
 * screen, each silently overwriting the other's choice.
 *
 * So the choice is remembered per kind. The legacy key is still read when a
 * kind has nothing of its own, because it holds a real decision someone made:
 * a stored key is never renamed without a path for what is already stored.
 */

const LEGACY_KEY = 'lds.cluster.device_id'

export const deviceKeyFor = (kind) => `${LEGACY_KEY}.${kind || 'comfy'}`

export function loadSavedDeviceId(kind) {
  try {
    return localStorage.getItem(deviceKeyFor(kind))
      || localStorage.getItem(LEGACY_KEY) || 'local'
  } catch {
    return 'local'                    // private mode
  }
}

export function saveDeviceId(id, kind) {
  try {
    localStorage.setItem(deviceKeyFor(kind), id || 'local')
  } catch { /* private mode */ }
}
