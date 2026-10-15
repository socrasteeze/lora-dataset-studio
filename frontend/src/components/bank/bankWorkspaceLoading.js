/** Independent metadata, statistics and runtime reads must retain each other's
 * fields. A late metadata response must not overwrite a newer decision or path. */
export function mergeWorkspacePayload(current, incoming, { metadata = false } = {}) {
  if (!current || current.id !== incoming.id) return incoming
  return metadata ? { ...incoming, ...current } : { ...current, ...incoming }
}
