import { useEffect, useRef } from 'react'
import { selectionKeyAction } from '../components/shared/reviewShortcuts.js'

/** K/R act on the current selection only when no editor or overlay owns it. */
export function useSelectionShortcuts({ enabled, onKeep, onReject, onError }) {
  const callbacks = useRef({ onKeep, onReject, onError })
  callbacks.current = { onKeep, onReject, onError }
  const inFlight = useRef(false)

  useEffect(() => {
    if (!enabled) return undefined
    const onKey = async (event) => {
      const action = selectionKeyAction(event)
      if (!action || document.querySelector(
        '[role="dialog"], [aria-modal="true"], dialog[open], [data-probe-layer]',
      )) return
      event.preventDefault()
      if (inFlight.current) return
      inFlight.current = true
      try {
        await (action === 'keep' ? callbacks.current.onKeep() : callbacks.current.onReject())
      } catch (error) {
        callbacks.current.onError(error)
      } finally {
        inFlight.current = false
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
