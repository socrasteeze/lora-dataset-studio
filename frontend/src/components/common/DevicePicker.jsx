/** Run-on device picker for GPU jobs (Primary local + registered peers). */
import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/fetchClient'

const STORAGE_KEY = 'lds.cluster.device_id'

export function loadSavedDeviceId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'local'
  } catch {
    return 'local'
  }
}

export function saveDeviceId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id || 'local')
  } catch { /* private mode */ }
}

/**
 * Compact select: "Run on" — only renders when Primary has at least one peer
 * (or always when `always` is set). Value is a device id (`local` or uuid).
 */
export default function DevicePicker({ value, onChange, kind = 'comfy', className = '', always = false }) {
  const [devices, setDevices] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/cluster/devices?kind=${encodeURIComponent(kind)}`)
      .then((d) => {
        if (!cancelled) setDevices(d.devices || [])
      })
      .catch(() => {
        if (!cancelled) setDevices([])
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
      saveDeviceId('local')
      onChange?.('local')
    }
  }, [devices, value, kind, onChange])

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
          saveDeviceId(id)
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
                // still useful for a pipeline — it just skips Score/Faces.
                ? (d.capabilities?.bank_scoring || d.capabilities?.face_scoring
                   || d.capabilities?.ollama)
                : true)
          // Two machines can share a name (a peer and a ComfyUI backend added
          // from the same box routinely do). Say which is which, or the picker
          // offers two identical-looking rows that behave differently.
          let label = d.local ? d.name : `${d.name} · ${d.backend ? 'ComfyUI only' : 'peer'}`
          if (offline) label += ' (offline)'
          else if (!capOk) label += kind === 'bank-pass' ? ' (no vision or scoring stack)' : ' (no ComfyUI)'
          else if (d.busy) label += ' (busy)'
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
