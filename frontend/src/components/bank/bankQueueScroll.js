/** Scroll a queue row into view inside the list, without moving the page.
 *
 * `scrollIntoView` can also pan the document; this only adjusts `root.scrollTop`.
 * A row already fully visible (the usual case: the running bank at the top) is
 * left alone. Otherwise the list moves just enough to reveal it (nearest). */
export function scrollQueueRowIntoView(root, row) {
  if (!root || !row) return
  const rootRect = root.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  if (rowRect.top >= rootRect.top && rowRect.bottom <= rootRect.bottom) return
  if (rowRect.top < rootRect.top) {
    root.scrollTop += rowRect.top - rootRect.top
    return
  }
  root.scrollTop += rowRect.bottom - rootRect.bottom
}
