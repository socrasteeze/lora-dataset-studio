export const COMPARISON_PAGE_SIZE = 24;

export function comparisonPage(ids, offset) {
  return ids.slice(offset, offset + COMPARISON_PAGE_SIZE);
}

export function comparisonSelectionIds(selected, order = []) {
  return [...new Set([...order, ...selected])].filter((id) => selected.has(id));
}

export function toggleComparisonSelection(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function duplicateComparisonPaths(kind) {
  if (kind === 'exact') return { resolve: 'dups/resolve', distinct: 'dups/distinct' };
  if (kind === 'semantic') return { resolve: 'semantic-dups/resolve', distinct: 'semantic-dups/distinct' };
  return null;
}
