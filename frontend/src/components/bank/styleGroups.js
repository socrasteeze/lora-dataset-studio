/** Groups smaller than this are mostly k-means stragglers, hidden by default. */
export const SMALL_STYLE_GROUP = 15

/**
 * The style groups to show, in order. ``minSize`` counts kept-or-undecided
 * images (rejected ones never train); a group with no aesthetic score sorts
 * last under "aesthetic".
 */
export function sortStyleGroups(groups, sort, minSize = 0) {
  const live = (g) => g.size - (g.rejected || 0)
  const out = groups.filter((g) => live(g) >= minSize)
  const bySize = (a, b) => live(b) - live(a) || a.id - b.id
  if (sort === 'aesthetic') {
    return out.sort((a, b) => (b.aesthetic ?? -1) - (a.aesthetic ?? -1) || bySize(a, b))
  }
  if (sort === 'small') return out.sort((a, b) => -bySize(a, b))
  return out.sort(bySize)
}
