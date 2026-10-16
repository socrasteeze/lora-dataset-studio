/** Independent metadata, statistics and runtime reads must retain each other's
 * fields. A late metadata response must not overwrite a newer decision or path. */
export function mergeWorkspacePayload(current, incoming, { metadata = false } = {}) {
  if (!current || current.id !== incoming.id) return incoming
  const merged = metadata ? { ...incoming, ...current } : { ...current, ...incoming }
  if (current.semantic && incoming.semantic
      && current.semantic.engine === incoming.semantic.engine) {
    merged.semantic = metadata
      ? { ...incoming.semantic, ...current.semantic }
      : { ...current.semantic, ...incoming.semantic }
  }
  return merged
}
