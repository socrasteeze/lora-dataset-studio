// Data-driven section list for the Settings page: sidebar labels, deep-link
// ids, the mono eyebrow tag, and the keywords the sidebar search matches on.

export const SETTINGS_SECTIONS = [
  { id: 'overview', title: 'Overview', icon: '📊', eyebrow: 'status',
    keywords: ['status', 'summary', 'capabilities', 'ready'] },
  { id: 'engines', title: 'Image engines', icon: '🎨', eyebrow: 'generation',
    // Divergence 1: upstream's cloud-provider keywords stay out. Its SeedVR2
    // block is kept — that upscaler is a local ComfyUI node pack, not a lane.
    keywords: ['klein', 'krea', 'krea 2 edit', 'engine', 'engines', 'comfyui', 'local',
      'generation', 'grounding',
      'lora', 'preset', 'texture', 'anatomy', 'nsfw', 'identity', 'prompt', 'guard', 'improve', 'upscale',
      'seedvr2', 'seed vr2', 'upscaler', 'super resolution', 'restore', 'sharpen', 'fidelity',
      'colour shift', 'color shift', 'target resolution', 'colour correction', 'blocks to swap'] },
  { id: 'scraping', title: 'Scraping & sources', icon: '🔎', eyebrow: 'sources',
    keywords: ['reddit', 'client id', 'civitai', 'pexels', 'pexels api', 'api key', 'scrape', 'scraper',
      'rate limit', '429', 'quota', 'nsfw', 'source', 'import',
      'klein', 'small image', 'rescue', 'upscale'] },
  { id: 'local-tools', title: 'Local tools', icon: '🖥️', eyebrow: 'integrations',
    keywords: ['comfyui', 'ollama', 'ai-toolkit', 'vision model', 'path', 'url', 'hugging face', 'hf token', 'directory', 'install'] },
  { id: 'captioning', title: 'Captioning & quality', icon: '✍', eyebrow: 'pipeline',
    keywords: ['caption', 'joycaption', 'backend', 'face score', 'threshold', 'green', 'orange', 'similarity',
      'import', 'resolution', 'downscale', 'normalize', '1024', 'webp', 'lossless', 'original size'] },
  { id: 'training', title: 'Training', icon: '🏋️', eyebrow: 'training',
    keywords: ['family', 'zimage', 'sdxl', 'krea', 'flux', 'flux2klein', 'training', 'default'] },
  { id: 'storage', title: 'Storage', icon: '💾', eyebrow: 'disk',
    keywords: ['storage', 'disk', 'space', 'full', 'drive', 'path', 'folder', 'location',
      'move', 'relocate', 'data', 'dataset root', 'trash', 'archive', 'free space', 'gb'] },
  { id: 'server', title: 'Server & access', icon: '🌐', eyebrow: 'network',
    keywords: ['port', 'host', 'lan', 'network', 'token', 'remote', 'phone', 'bind'] },
  { id: 'devices', title: 'Devices', icon: '🖥️', eyebrow: 'cluster',
    keywords: ['device', 'devices', 'peer', 'primary', 'worker', 'cluster', 'gpu', 'tailscale',
      'remote', 'laptop', 'hub', 'join', 'hardware'] },
  { id: 'maintenance', title: 'Maintenance', icon: '🔧', eyebrow: 'housekeeping',
    keywords: ['update', 'restart', 'log', 'diagnostic', 'version', 'bug'] },
]

/* Sidebar LED per section — derived from live capabilities so the rail doubles
   as a health map of the rig: 'ready' | 'partial' | 'off' | null (no LED). */
export function sectionStatus(id, caps) {
  const c = caps || {}
  const e = c.engines || {}
  switch (id) {
    case 'engines':
      return (e.klein || e.krea) ? 'ready' : 'off'
    case 'local-tools': {
      const parts = [
        !!(c.comfyui && c.comfyui.reachable),
        !!(c.ollama && c.ollama.reachable),
        !!(c.aitoolkit && c.aitoolkit.valid),
      ]
      const n = parts.filter(Boolean).length
      return n === 3 ? 'ready' : n > 0 ? 'partial' : 'off'
    }
    case 'captioning': {
      const cap = c.captioners || {}
      return (cap.joycaption || cap.ollama) ? 'ready' : 'off'
    }
    case 'training':
      return c.training_visible ? 'ready' : 'off'
    default:
      return null
  }
}

export function matchesQuery(section, q) {
  const needle = (q || '').trim().toLowerCase()
  if (!needle) return true
  return section.title.toLowerCase().includes(needle)
    || section.keywords.some((k) => k.includes(needle))
}
