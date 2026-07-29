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

  if (devices == null) return null
  const peers = devices.filter((d) => !d.local)
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
        {devices.map((d) => {
          const offline = !d.local && !d.online
          const capOk = kind !== 'comfy' || d.local || d.capabilities?.comfyui
          let label = d.name
          if (offline) label += ' (offline)'
          else if (!capOk) label += ' (no ComfyUI)'
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
