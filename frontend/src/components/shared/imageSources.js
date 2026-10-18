export const SOURCE_NAMES = {
  danbooru: 'Danbooru', gelbooru: 'Gelbooru', e621: 'e621', e926: 'e926',
  rule34: 'Rule34', paheal: 'Paheal', pawchive: 'Pawchive',
}

const HOSTS = {
  danbooru: 'danbooru.donmai.us', gelbooru: 'gelbooru.com', e621: 'e621.net',
  e926: 'e926.net', rule34: 'rule34.xxx', paheal: 'rule34.paheal.net', pawchive: 'pawchive.pw',
}

export function sourceLink(metadata) {
  try {
    const url = new URL(metadata?.source_url)
    return url.protocol === 'https:' && !url.username && !url.password
      && (!url.port || url.port === '443') && url.hostname === HOSTS[metadata.platform] ? url.href : null
  } catch { return null }
}

export function sourceTags(metadata) {
  if (!metadata?.tags || typeof metadata.tags !== 'object') return []
  return [...new Set(Object.values(metadata.tags).filter(Array.isArray).flat()
    .filter((tag) => typeof tag === 'string'))]
}

export function jobRuns(job) {
  return job?.state === 'running' || job?.state === 'queued'
}

export function jobLabel(job) {
  const states = { queued: 'Queued', running: 'Running', ready: 'Ready', failed: 'Failed',
    cancelled: 'Stopped', interrupted: 'Interrupted' }
  const phases = { scan: 'Scan', download: 'Download', import: 'Import', previews: 'Previews' }
  return `${phases[job?.phase] || 'Scan'}: ${states[job?.state] || 'Ready'}`
}
