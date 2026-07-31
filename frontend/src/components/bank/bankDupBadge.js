/* ≈ / ✂ duplicate marks — which ones a tile draws.
 *
 * THE RULE, and why it lives here rather than inline in the tile.
 *
 * A group is a duplicate group worth showing when it STILL holds two or more
 * images you have not decided on. That is the server's rule
 * (`_unresolved_dup_groups_q`), and it is what the ≈ Duplicates chip and the
 * resolution panel have always asked.
 *
 * The tile asked something else. It drew a mark whenever `dup_group != null` —
 * which only ever meant "was once grouped". Nothing clears that column:
 * `rebuild_dup_groups` is the scan's and only the scan's, resolving a group
 * rejects the losers and leaves their ids, and deleting the rejected rows leaves
 * the survivor alone in a group of one. Measured on a real bank: 10 060 images
 * wearing a ≈ mark while the chip beside them honestly read 0 and its panel said
 * there was nothing left to resolve.
 *
 * So the row now carries `dup_unresolved` / `semantic_dup_unresolved`, computed
 * per page against that one server-side predicate. This file NEVER re-derives
 * the rule — it only decides what to draw with the answer. Putting the ">= 2
 * undecided" threshold here would give it a second home, which is precisely the
 * drift that caused the bug.
 *
 * A MISSING flag counts as RESOLVED, never as unresolved. An older cached
 * payload, or a future call site that forgets to wire the live state, then
 * degrades to a quiet tile rather than silently restoring the bug.
 */

export const DUP_STAGES = [
  { key: 'dup', group: 'dup_group', flag: 'dup_unresolved',
    mark: '≈', cls: 'bg-black/60 text-fuchsia-200', word: 'duplicate' },
  { key: 'sdup', group: 'semantic_dup_group', flag: 'semantic_dup_unresolved',
    mark: '✂', cls: 'bg-black/60 text-orange-200', word: 'same shot' },
]

/** Badges for one image tile: [{key, text, cls, title}], newest rule applied.
 *  Resolved groups draw NOTHING on the grid — the tile is 10px of space and a
 *  rejected image already carries `✕ duplicate`, which answers "why" far better
 *  than a group id can. The lightbox keeps a qualified chip instead, where
 *  there is room to say "· resolved" out loud. */
export function dupBadges(img) {
  const out = []
  for (const s of DUP_STAGES) {
    const gid = img?.[s.group]
    if (gid == null) continue
    if (img[s.flag] !== true) continue
    out.push({
      key: s.key,
      text: `${s.mark}${gid}`,
      cls: s.cls,
      title: `${s.word} group #${gid} — still to resolve`,
    })
  }
  return out
}

/** How the lightbox and tooltip qualify a group that is no longer open. */
export function dupStateSuffix(img, stage) {
  const s = DUP_STAGES.find((x) => x.key === stage)
  if (!s || img?.[s.group] == null) return ''
  return img[s.flag] === true ? '' : ' · resolved'
}
