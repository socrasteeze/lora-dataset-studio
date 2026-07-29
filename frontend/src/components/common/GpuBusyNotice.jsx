import { useCallback, useEffect, useState } from 'react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { staleFlagNotice } from '../../utils/globalStop'

/** "GPU busy" when nothing is running — and the one click that fixes it.
 *
 * The gate is two server flags. A process that dies without clearing one leaves
 * every GPU pass, every queued bank and every training start refusing, and the
 * flag's TTL cannot save it: the window re-arms the TTL from a heartbeat for as
 * long as it is open, so a wedged-but-alive parent holds it until the app is
 * restarted.
 *
 * This renders ONLY when a flag is set and the server says nothing backs it up.
 * A flag a live pass legitimately owns gets no banner: offering "clear this"
 * over a running job invites someone to break it, and the server refuses it
 * anyway. So this is silent in every normal state — which is why it can sit
 * where the refusal appears rather than being buried in Settings.
 */
export default function GpuBusyNotice({ onCleared, className = '' }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setState(await apiFetch('/api/system/gpu-flags'))
    } catch {
      setState(null)   // unreachable server — the page has bigger banners for that
    }
  }, [])

  useEffect(() => { load() }, [load])

  const notice = staleFlagNotice(state)
  if (!notice) return null

  const clear = async () => {
    setBusy(true)
    setError('')
    try {
      await postJson('/api/system/gpu-flags/clear', {})
      await load()
      onCleared?.()
    } catch (e) {
      // A 409 here means the server found something live after all — say that
      // rather than leaving a button that silently did nothing.
      setError(e.message || 'The GPU flag could not be cleared.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`rounded-md border border-amber-500/60 bg-amber-500/10 p-3 space-y-2 ${className}`}>
      <p className="text-xs text-amber-200">⚠ {notice.text}</p>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <button type="button" onClick={clear} disabled={busy}
        className="rounded-md border border-amber-400/50 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
        {busy ? 'Clearing…' : notice.action}
      </button>
    </div>
  )
}
