/** Run-on device picker for GPU jobs (Primary local + registered peers). */
import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/fetchClient'
import { fetchDeviceList } from './deviceListCache.js'
import { loadSavedDeviceId, saveDeviceId } from './deviceMemory.js'

/* The remembered choice lives in deviceMemory.js — pure, and therefore
 * testable (node --test cannot import a .jsx). Re-exported here so every
 * existing `from './DevicePicker'` import keeps working. */
export { loadSavedDeviceId, saveDeviceId } from './deviceMemory.js'

/**
 * Compact select: "Run on" — only renders when Primary has at least one peer
 * (or always when `always` is set). Value is a device id (`local` or uuid).
 */
export default function DevicePicker({ value, onChange, onDevice, kind = 'comfy', className = '', always = false }) {
  const [devices, setDevices] = useState(null)

  useEffect(() => {
    let cancelled = false
    // Shared, short-TTL fetch: two pickers are commonly mounted at once (the
    // bank workspace holds one, opening Launch-all mounts another), and each
    // request makes the hub re-probe every configured backend.
    fetchDeviceList(kind, apiFetch)
      .then((list) => {
        if (!cancelled) setDevices(list)
      })
    return () => { cancelled = true }
  }, [kind])

  // The saved id is ONE global key shared by every picker, and the surfaces do
  // not agree on what is eligible: a ComfyUI backend picked for generation is
  // not offerable for a bank pass. With no matching <option> the browser paints
  // the FIRST one — "this machine" — while the value stays the backend id, so
  // the dialog said local and posted a peer (a 400 the user could not explain).
  // Worse when nothing is eligible at all: the picker does not render, and the
  // stale id is still posted with no control to correct it.
  //
  // So reconcile: an id this picker cannot offer falls back to local, visibly,
  // and tells the parent so what is SHOWN is what will be sent.
  useEffect(() => {
    if (devices == null || !value || value === 'local') return
    const offerable = devices.some((d) => d.id === value && (kind !== 'bank-pass' || !d.backend))
    if (!offerable) {
      saveDeviceId('local', kind)
      onChange?.('local')
    }
  }, [devices, value, kind, onChange])

  // Hand the parent the whole device, not just its id — a caller that has to
  // decide what that machine CAN do needs its capability blob, and the list is
  // already fetched here. An effect rather than a second argument to onChange,
  // because the value is normally restored from localStorage: onChange never
  // fires for that one, and a restored peer is exactly the case that must be
  // gated. null means "this machine" (or not in the list yet).
  useEffect(() => {
    if (devices == null) return
    onDevice?.(devices.find((d) => d.id === value && !d.local) || null)
  }, [devices, value, onDevice])

  if (devices == null) return null
  // 'bank-pass' = the bank's Score/Faces passes: they need the FULL app on the
  // other machine (its scoring stacks), so API backends — bare ComfyUI — are
  // not offered at all rather than listed disabled.
  const eligible = kind === 'bank-pass'
    ? devices.filter((d) => d.local || !d.backend)
    : devices
  const peers = eligible.filter((d) => !d.local)
  if (!always && peers.length === 0) return null

  const current = value || 'local'

  return (
    <label className={`inline-flex items-center gap-2 text-sm text-content ${className}`}>
      <span className="text-content-muted whitespace-nowrap">Run on</span>
      <select
        value={current}
        onChange={(e) => {
          const id = e.target.value
          saveDeviceId(id, kind)
          onChange?.(id)
        }}
        className="rounded-md border border-border-strong bg-surface-raised px-2 py-1.5 text-sm text-content max-w-[14rem]"
        aria-label="Run on device"
      >
        {eligible.map((d) => {
          const offline = !d.local && !d.online
          const capOk = d.local
            || (kind === 'comfy' ? d.capabilities?.comfyui
              : kind === 'bank-pass'
                // Ollama counts now: the framing and watermark passes travel as
                // vision jobs, so a peer with Ollama but no scoring stack is
                // still useful for a pipeline — it just can't do Score/Faces.
                ? (d.capabilities?.bank_scoring || d.capabilities?.face_scoring
                   || d.capabilities?.ollama)
                : true)
          // An OR across three stacks, so "capOk" here means "useful for SOME
          // pass", never "useful for all of them" — a peer with only Ollama
          // passes it. Saying more than that from one <option> would be a
          // second, worse copy of the per-pass gate the Launch dialog now runs;
          // it names the passes it cannot do, so this only has to be honest.
          const partial = kind === 'bank-pass' && !d.local && capOk
            && !(d.capabilities?.bank_scoring && d.capabilities?.face_scoring
                 && d.capabilities?.ollama)
          // Two machines can share a name (a peer and a ComfyUI backend added
          // from the same box routinely do). Say which is which, or the picker
          // offers two identical-looking rows that behave differently.
          let label = d.local ? d.name : `${d.name} · ${d.backend ? 'ComfyUI only' : 'peer'}`
          if (offline) label += ' (offline)'
          else if (!capOk) label += kind === 'bank-pass' ? ' (no vision or scoring stack)' : ' (no ComfyUI)'
          else if (d.busy) label += ' (busy)'
          // Additive, not part of the chain above: "busy" is transient and
          // "some passes" is structural, and swallowing either behind the other
          // loses the one the user needed to see.
          if (partial) label += ' (some passes)'
          return (
            <option key={d.id} value={d.id} disabled={offline}>
              {label}
            </option>
          )
        })}
      </select>
    </label>
  )
}
