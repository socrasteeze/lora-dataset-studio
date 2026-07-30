/* 🖥 Polls "is this machine currently working for a Primary" for the header chip
   and the tab title.

   GET /api/cluster/activity, not /api/cluster/status: the latter probes ComfyUI
   and Ollama over HTTP on every call (capabilities.probe), so polling it would
   hammer both and stall whenever either is down. The activity route reads only
   in-memory worker state.

   DELIBERATE DIFFERENCE from useTrainingActivity, which stops polling while the
   tab is hidden: this one keeps going, slower. The tab title exists precisely to
   be read while the tab is NOT focused — a pinned tab still saying "● Working"
   twenty minutes after the pass ended is worse than no indicator, because it is
   a claim rather than a gap. 60 s of a trivial local request is a cost worth
   paying for a title that stays true; the visible-tab cadence stays at 15 s. */
import { useEffect, useState } from 'react'
import { apiFetch } from '../api/fetchClient'
import { EMPTY_PEER_ACTIVITY, normalizePeerActivity } from '../utils/peerActivity'

const POLL_MS = 15000
const HIDDEN_POLL_MS = 60000

export function usePeerActivity() {
  const [activity, setActivity] = useState(EMPTY_PEER_ACTIVITY)

  useEffect(() => {
    let alive = true
    let timer = null

    const tick = async () => {
      try {
        const data = await apiFetch('/api/cluster/activity', { background: true })
        if (alive) setActivity(normalizePeerActivity(data))
      } catch {
        // Keep the last-known state on a transient error: blinking the chip off
        // mid-pass reads as "it stopped".
      }
    }

    const schedule = () => {
      clearInterval(timer)
      timer = setInterval(tick, document.hidden ? HIDDEN_POLL_MS : POLL_MS)
    }

    const onVisibility = () => {
      if (!document.hidden) tick()   // don't make the user wait a full period
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

  return activity
}
