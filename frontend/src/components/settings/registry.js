import { BarChart3, Dumbbell, Globe, Monitor, Network, Palette, PenLine, Save, Search, Wrench } from 'lucide-react';
// Data-driven section list for the Settings page: sidebar labels, deep-link
// ids, the mono eyebrow tag, and the keywords the sidebar search matches on.

export const SETTINGS_SECTIONS = [
  { id: 'overview', title: 'Overview', icon: BarChart3, eyebrow: 'status',
    description: 'What is configured and what to do next.',
    keywords: ['status', 'summary', 'capabilities', 'ready'] },
  { id: 'engines', title: 'Image engines', icon: Palette, eyebrow: 'generation',
    // Divergence 1: upstream's cloud-provider keywords stay out, and so does the
    // "API keys" half of its description — there are no keys to hold here. Its
    // SeedVR2 block is kept: that upscaler is a local ComfyUI node pack, not a lane.
    description: 'The local engines used to generate dataset images.',
    keywords: ['klein', 'krea', 'krea 2 edit', 'engine', 'engines', 'comfyui', 'local',
      'generation', 'grounding',
      'lora', 'preset', 'texture', 'anatomy', 'nsfw', 'identity', 'prompt', 'guard', 'improve', 'upscale',
      'seedvr2', 'seed vr2', 'upscaler', 'super resolution', 'restore', 'sharpen', 'fidelity',
      'colour shift', 'color shift', 'target resolution', 'colour correction', 'blocks to swap',
      'hi-res fix', 'hires fix', 'highres', 'second pass', 'two pass', '2 pass', 'latent upscale',
      'detail', 'denoise',
      'finishing', 'finish', 'film grain', 'grain', 'noise', 'unsharp', 'colour match',
      'color match', 'plastic', 'smooth', 'photographic'] },
  { id: 'scraping', title: 'Scraping & sources', icon: Search, eyebrow: 'sources',
    description: 'Credentials used when scanning image sources.',
    keywords: ['reddit', 'client id', 'civitai', 'pexels', 'pexels api', 'api key', 'scrape', 'scraper',
      'rate limit', '429', 'quota', 'nsfw', 'source', 'import',
      'klein', 'small image', 'rescue', 'upscale'] },
  { id: 'local-tools', title: 'Local tools', icon: Monitor, eyebrow: 'integrations',
    description: 'ComfyUI, Ollama and ai-toolkit — where they run and where they live.',
    keywords: ['comfyui', 'ollama', 'ai-toolkit', 'vision model', 'path', 'url', 'hugging face', 'hf token', 'directory', 'install'] },
  { id: 'captioning', title: 'Captioning & quality', icon: PenLine, eyebrow: 'pipeline',
    description: 'How captions are written and how face similarity is judged.',
    keywords: ['caption', 'joycaption', 'backend', 'face score', 'threshold', 'green', 'orange', 'similarity',
      'import', 'resolution', 'downscale', 'normalize', '1024', 'webp', 'lossless', 'original size'] },
  { id: 'training', title: 'Training', icon: Dumbbell, eyebrow: 'training',
    // Divergence 4: no rented-GPU guardrails to describe — training is local here.
    description: 'Default model family and training defaults.',
    keywords: ['family', 'zimage', 'sdxl', 'krea', 'flux', 'flux2klein', 'training', 'default'] },
  { id: 'storage', title: 'Storage', icon: Save, eyebrow: 'disk',
    description: 'Where everything lives on disk, and how much space it takes.',
    keywords: ['storage', 'disk', 'space', 'full', 'drive', 'path', 'folder', 'location',
      'move', 'relocate', 'data', 'dataset root', 'trash', 'archive', 'free space', 'gb'] },
  { id: 'server', title: 'Server & access', icon: Globe, eyebrow: 'network',
    description: 'Port, LAN access and the access token.',
    keywords: ['port', 'host', 'lan', 'network', 'token', 'remote', 'phone', 'bind'] },
  { id: 'devices', title: 'Devices', icon: Network, eyebrow: 'cluster',
    description: 'The machines this one shares work with, and what each can do.',
    keywords: ['device', 'devices', 'peer', 'primary', 'worker', 'cluster', 'gpu', 'tailscale',
      'remote', 'laptop', 'hub', 'join', 'hardware'] },
  { id: 'maintenance', title: 'Maintenance', icon: Wrench, eyebrow: 'housekeeping',
    description: 'Updates, server log and bug reports.',
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
        // The ACTIVE provider's reachability. Keyed on Ollama alone, this LED
        // read "off" on a perfectly healthy LM Studio install.
        (((c.local_llm && c.local_llm.provider) || 'ollama') === 'lmstudio'
          ? !!(c.lmstudio && c.lmstudio.reachable)
          : !!(c.ollama && c.ollama.reachable)),
        !!(c.aitoolkit && c.aitoolkit.valid),
      ]
      const n = parts.filter(Boolean).length
      return n === 3 ? 'ready' : n > 0 ? 'partial' : 'off'
    }
    case 'captioning': {
      const cap = c.captioners || {}
      // The active provider, falling back to the old expression for an older
      // caps payload: a healthy LM Studio install lit this LED off.
      return (cap.joycaption
        || (cap.local_llm !== undefined ? cap.local_llm : cap.ollama)) ? 'ready' : 'off'
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
