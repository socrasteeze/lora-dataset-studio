export function isSameDocument(url, currentUrl) {
  const current = new URL(currentUrl)
  const destination = new URL(url, current)
  return destination.origin === current.origin
    && destination.pathname === current.pathname
    && destination.search === current.search
}
