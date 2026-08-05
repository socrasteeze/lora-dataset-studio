/** One in-flight `/api/cluster/devices` request per kind, shared by every picker.
 *
 * `DevicePicker` fetched on EVERY mount, and two of them are commonly mounted
 * at once: the bank workspace holds one, and opening the Launch-all dialog
 * mounts a second. So the act of opening that dialog fired a second identical
 * request, and each one makes the hub run `local_capabilities()` plus a probe
 * per configured ComfyUI backend.
 *
 * A short TTL is the right shape rather than a subscription: the list only has
 * to be fresh enough to pick from, and the submit routes re-validate the choice
 * against the same rule anyway (`refuse_steps_for_device`), so a picker holding
 * a few-seconds-old list can never queue work a peer will refuse.
 *
 * Kept out of the .jsx on purpose — `node --test` cannot import JSX, and this
 * is the part worth testing.
 */

/** How long a fetched list stays fresh. Below the 5 s the Devices card polls at. */
export const DEVICE_LIST_TTL_MS = 4000

const entries = new Map()

/** Test seam: drop everything so one test cannot see another's list. */
export function clearDeviceListCache() {
  entries.clear()
}

/**
 * @param {string} kind          picker kind ('comfy' | 'bank-pass')
 * @param {(url: string) => Promise<any>} fetcher  usually apiFetch
 * @param {() => number} now     injectable clock, for tests
 * @returns {Promise<Array>}     the devices array (never rejects; [] on failure)
 */
export function fetchDeviceList(kind, fetcher, now = Date.now) {
  const key = kind || 'comfy'
  const hit = entries.get(key)
  if (hit && now() - hit.at < DEVICE_LIST_TTL_MS) {
    return hit.promise
  }
  const promise = fetcher(`/api/cluster/devices?kind=${encodeURIComponent(key)}`)
    .then((d) => (d && d.devices) || [])
    .catch(() => {
      // Drop a failed lookup so the next mount retries instead of being served
      // an empty list for the whole TTL.
      if (entries.get(key) && entries.get(key).promise === promise) entries.delete(key)
      return []
    })
  entries.set(key, { at: now(), promise })
  return promise
}

export default fetchDeviceList
