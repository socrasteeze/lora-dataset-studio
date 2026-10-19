export const SOURCE_NAMES = {
  danbooru: 'Danbooru', gelbooru: 'Gelbooru', e621: 'e621', e926: 'e926',
  rule34: 'Rule34', paheal: 'Paheal', pawchive: 'Pawchive',
}

const HOSTS = {
  danbooru: 'danbooru.donmai.us', gelbooru: 'gelbooru.com', e621: 'e621.net',
  e926: 'e926.net', rule34: 'rule34.xxx', paheal: 'rule34.paheal.net', pawchive: 'pawchive.pw',
}

function publicLink(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(value)) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || (url.port && url.port !== (url.protocol === 'http:' ? '80' : '443'))
      || host === 'localhost' || /\.(localhost|local|internal|home\.arpa)$/.test(host)
      || (!host.includes('.') && !host.includes(':'))) return null
    // The server also resolves and pins every connection. Reject private and
    // reserved literals here before presenting an external source link.
    if (host.includes(':') && (!/^[23][0-9a-f]{3}:/i.test(host)
      || /^2001:(?:db8:|0*:|2:|1[0-9a-f]:)/i.test(host))) return null
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b, c] = host.split('.').map(Number)
      if ([0, 10, 127].includes(a) || a >= 224 || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && (b === 168 || b === 0))
        || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
        || (a === 203 && b === 0 && c === 113)) return null
    }
    return url
  } catch { return null }
}

export function sourceProvider(value, preset = '') {
  const url = publicLink(value)
  if (!url) return value ? '' : preset
  const host = url.hostname.replace(/^www\./, '')
  return Object.keys(HOSTS).find((key) => HOSTS[key] === host)
    || ({ 'x.com': 'twitter', 'twitter.com': 'twitter', 'youtube.com': 'youtube', 'youtu.be': 'youtube' })[host]
    || host
}

export function sourceName(provider) {
  return SOURCE_NAMES[provider] || provider || 'Source'
}

export function sourceLink(metadata) {
  const url = publicLink(metadata?.source_url)
  if (!url) return null
  if (metadata.acquisition === true && /^[a-z0-9][a-z0-9._-]{0,252}$/.test(metadata.platform || '')) return url.href
  return url.protocol === 'https:' && url.hostname === HOSTS[metadata.platform] ? url.href : null
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
