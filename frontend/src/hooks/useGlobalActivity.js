import { useEffect, useState } from 'react'
import { apiFetch } from '../api/fetchClient'

const POLL_MS = 15000
const HIDDEN_POLL_MS = 60000
const MAX_404 = 3

export function useGlobalActivity() {
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    let alive = true
    let timer = null
    let notFound = 0

    const tick = async () => {
      try {
        const data = await apiFetch('/api/system/activity?limit=1', { background: true })
        if (alive) setSnapshot(data)
        notFound = 0
      } catch (e) {
        // Keep the last state so a transient error does not claim work stopped.
        if (e?.status === 404 && ++notFound >= MAX_404) {
          clearInterval(timer)
          timer = null
        }
      }
    }

    const schedule = () => {
      clearInterval(timer)
      if (notFound >= MAX_404) return
      timer = setInterval(tick, document.hidden ? HIDDEN_POLL_MS : POLL_MS)
    }

    const onVisibility = () => {
      if (notFound >= MAX_404) return
      if (!document.hidden) tick()
      schedule()
    }

    tick()
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return snapshot
}
