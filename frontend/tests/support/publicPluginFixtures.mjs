import { resetRegistry, setEnabled } from '../../src/plugins/registry.js'
import { registerBundledDescriptor } from './bundledDescriptors.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import cameraAngles from '../../../bundled/camera_angles/frontend/index.js'
import canvas from '../../../bundled/canvas/frontend/index.js'
import imageUpscale from '../../../bundled/image_upscale/frontend/index.js'
import live from '../../../bundled/live/frontend/index.js'
import modelTools from '../../../bundled/model_tools/frontend/index.js'
import resourceMonitor from '../../../bundled/resource_monitor/frontend/index.js'
import seedvr2 from '../../../bundled/seedvr2/frontend/index.js'
import video from '../../../bundled/video/frontend/index.js'
import qwenDataset from '../../../bundled/qwen_dataset/frontend/index.js'

/* DIVERGENCE 1 / 4 -- upstream's api_engines and cloud_training are not in this
   list because bundled/api_engines and bundled/cloud_training do not exist here:
   the fork deletes both directories outright (pinned by
   tests/local-only-engines-contract.test.mjs, which fails on their presence) and
   drops their ids from backend/app/plugins/official.OFFICIAL_IDS. */
export const PUBLIC_DESCRIPTORS = [cameraAngles, canvas, imageUpscale,
  live, modelTools, resourceMonitor, seedvr2, video, qwenDataset]
export const PUBLIC_PLUGIN_IDS = PUBLIC_DESCRIPTORS.map(descriptor => descriptor.id)

export function mountPublicPlugins(enabled = PUBLIC_PLUGIN_IDS) {
  resetRegistry()
  for (const descriptor of PUBLIC_DESCRIPTORS) {
    if (!registerBundledDescriptor(descriptor)) throw new Error(`Invalid public descriptor: ${descriptor.id}`)
  }
  setEnabled(enabled)
}

const REPO = new URL('../../../', import.meta.url)
export const imageDigest = url => createHash('sha256').update(readFileSync(url)).digest('hex')
export function publicNewsImage(entry) {
  const url = new URL(entry.image, REPO)
  const anchor = entry.plugin
    ? new URL(`bundled/${entry.plugin}/frontend/assets/`, REPO)
    : new URL('docs/screenshots/', REPO)
  if (!url.href.startsWith(anchor.href)) throw new Error(`Screenshot leaves its public owner: ${entry.id}`)
  return url
}

export function curatedImageDigests() {
  const root = new URL('docs/screenshots/', REPO)
  // Reviewed neutral Video screenshots already published in the plugin's own
  // assets. Pin their bytes instead of duplicating them in the core showcase.
  const pluginShowcase = [
    'd77ebab2beb0b22b1247f5d66d0c0e53b7db18b564bb39e9becb33bb6384618c',
    '70eec9fdd66125ece46809aa9465c46287d033ff57f9b50bd9dda9ae7f0ff0ea',
    '9411f33bc783849e6ecb9ca2e8c566efe99b84f14edfeecbcdb81f1908ce95e0',
    '79900699d21335fa0cefd6d6549c54e8d7a096b52beea84cb350641b660c6270',
  ]
  return new Set([...pluginShowcase, ...readdirSync(root, { recursive: true })
    .filter(name => /\.(png|jpe?g|gif|webp)$/i.test(name))
    .map(name => imageDigest(new URL(name.replaceAll('\\', '/'), root)))])
}
