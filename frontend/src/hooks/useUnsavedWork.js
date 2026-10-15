import { useEffect } from 'react'

// The same guard protects normal browser exits and controlled profile changes.
export function useUnsavedWork(dirty) {
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

export function hasUnsavedWork() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented || event.returnValue === false
}
