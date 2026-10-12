/** Hide nested folders inside an open bank.

 * Checked means the folder is still in the grid. Unchecking a folder hides
 * it and everything inside it. An ancestor that is already hidden covers its
 * children, so those boxes are not their own choice until the ancestor comes
 * back. The stored list is only the folders the user unchecked directly.
 */

/** The excluded ancestor of `path`, or null when the folder itself is the
 *  choice (or nothing above it is hidden). */
export function ancestorExcluded(path, excluded) {
  const set = new Set(excluded || [])
  const parts = String(path || '').split('/')
  let acc = ''
  for (let i = 0; i < parts.length - 1; i += 1) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i]
    if (set.has(acc)) return acc
  }
  return null
}

/** Parent, then that folder's children, then the next sibling. Comparing the
 *  whole path as one string puts "anima-cn-test" between "anima" and the
 *  folders inside anima, because "-" sorts before "/". */
export function sortFolders(folders) {
  return [...(folders || [])].sort((a, b) => {
    const ap = String(a.path || '').split('/')
    const bp = String(b.path || '').split('/')
    const n = Math.min(ap.length, bp.length)
    for (let i = 0; i < n; i += 1) {
      const av = ap[i].toLocaleLowerCase()
      const bv = bp[i].toLocaleLowerCase()
      if (av < bv) return -1
      if (av > bv) return 1
    }
    return ap.length - bp.length
  })
}

/** Next stored list after checking or unchecking `path`. Unchecking a parent
 *  drops nested entries, because the parent already hides them. */
export function toggleExcluded(path, excluded, include) {
  const set = new Set(excluded || [])
  if (include) set.delete(path)
  else {
    set.add(path)
    for (const item of [...set]) {
      if (item !== path && item.startsWith(`${path}/`)) set.delete(item)
    }
  }
  return [...set].sort()
}
