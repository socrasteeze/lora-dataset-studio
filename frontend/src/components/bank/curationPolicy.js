// Shared request state. The server owns kind-specific axes and target weights.
export const emptyCurationPolicy = () => ({
  kind: 'character', axis: '', match: 'image', prefer_quality: true,
  duplicate_limit: 1, min_similarity: '', reference_ids: [], locked_ids: [], weights: {},
})

export function policyForKind(previous, kind, metadata) {
  const profile = metadata?.kinds?.find((item) => item.id === kind)
  return { ...previous, kind, axis: profile?.axis || '', match: 'image',
    weights: {}, min_similarity: '', reference_ids: [] }
}

export function selectionRequest(policy) {
  return { ...policy, min_similarity: policy.min_similarity === ''
    ? null : Number(policy.min_similarity),
  reference_ids: [...policy.reference_ids], locked_ids: [...policy.locked_ids],
  weights: { ...policy.weights } }
}

export function selectionContextKey({ bankId, filter, engine, modelKey, policy }) {
  return JSON.stringify([bankId, filter, engine, modelKey, selectionRequest(policy)])
}

export function curationSummary(result) {
  if (!result) return ''
  return `${result.selected} of ${result.requested} selected for ${result.kind}. Review before Keep or Promote.`
}

export function targetRows(policy, metadata, result) {
  const axis = metadata?.axes?.find((entry) => entry.id === policy.axis)
  const keys = new Set([...(axis?.buckets || []),
    ...(result?.axis === policy.axis ? result.buckets?.map((entry) => entry.key) || [] : []),
    ...Object.keys(policy.weights)])
  keys.add('unknown')
  const defaults = policy.kind === 'character' && policy.axis === 'framing'
    ? metadata?.framing_weights || {} : {}
  return [...keys].map((key) => ({ key, label: key.replaceAll('_', ' ').replace('#', ' · person ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
    weight: policy.weights[key] ?? defaults[key] ?? 1 }))
}
