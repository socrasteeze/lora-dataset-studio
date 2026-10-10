/** Shift/Ctrl multi-select for an image grid, the file-manager gesture.
 *
 *  Shared by the Bank grid and the Dataset grid on purpose: they are two
 *  surfaces of one selection, and a range that behaves differently on each is
 *  a bug with a delay on it.
 *
 *  - Plain click and Ctrl/Cmd-click TOGGLE the tile (a phone has no modifier,
 *    so plain click can never become "replace the selection with this one").
 *    Either one moves the anchor to that tile.
 *  - Shift-click ADDS everything from the anchor to this tile, in the order the
 *    grid shows them. The anchor stays where it was, so a second Shift-click
 *    extends from the same place. The range is a union: nothing already
 *    selected is dropped.
 *  - No usable anchor (none yet, or it left the visible order through a page,
 *    filter or delete) falls back to a plain toggle and anchors here.
 *
 *  `orderedIds` is the visible order the user is looking at, which is the one
 *  a range must follow.
 */
export function nextSelection(prev, orderedIds, id, anchorId, { shift = false } = {}) {
  const selected = new Set(prev)
  if (shift) {
    const from = orderedIds.indexOf(anchorId)
    const to = orderedIds.indexOf(id)
    if (from >= 0 && to >= 0) {
      const [lo, hi] = from <= to ? [from, to] : [to, from]
      for (let i = lo; i <= hi; i++) selected.add(orderedIds[i])
      return { selected, anchor: anchorId }
    }
  }
  if (selected.has(id)) selected.delete(id); else selected.add(id)
  return { selected, anchor: id }
}
