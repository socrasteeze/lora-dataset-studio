import { useEffect, useState } from 'react'
import { Card, INPUT_CLASS, ResetToDefault } from '@lds/plugin-sdk/ui'
import { defaultValueAt } from '@lds/plugin-sdk/data'
import { laneForTarget } from '../lib/seedvr2Tiling.js'
// Mirror seedvr2_helper's clamps. The SERVER stays the authority (it re-clamps
// every value), these only stop the input offering a number that would be
// silently corrected.
const SEEDVR2_RESOLUTION_MIN = 256
const SEEDVR2_RESOLUTION_MAX = 4096
const SEEDVR2_MAX_RESOLUTION_MAX = 8192
const SEEDVR2_BLOCKS_MAX = 36
// seedvr2_helper.TILE_PX_MIN / TILE_PX_MAX, and the factor the 'auto' crossover
// is derived from (TILE_ABOVE_FACTOR) — shown, never enforced here.
const SEEDVR2_TILE_MIN = 512
const SEEDVR2_TILE_MAX = 2048
const SEEDVR2_TILE_ABOVE_FACTOR = 1.5
// seedvr2_helper.COLOR_CORRECTIONS — the node's own enum, in its own order.
const SEEDVR2_COLOR_MODES = ['lab', 'wavelet', 'wavelet_adaptive', 'hsv', 'adain', 'none']

/* SeedVR2 — the FIDELITY upscaler (issue #32, requested by SurpassHR).

   It is not a generation engine and deliberately does not appear in the enabled-
   engines list above: nothing in the variation catalog can be produced by it. It
   is the OTHER way to run Upscale & improve — the one that resolves detail
   without reinterpreting it — so its settings live next to the engines that feed
   the same pass, not in a section of their own. */
export default function SeedVr2Card({ config, setField, configDefaults, caps }) {
  const svr = config.seedvr2 || {}
  const reset = { config, configDefaults, setField }
  const dflt = (key) => defaultValueAt(configDefaults, 'seedvr2', key)
  const comfy = (caps && caps.comfyui) || {}
  const ready = comfy.seedvr2_ready === true
  const [models, setModels] = useState(null)
  // Which builds are ON DISK — asked once per readiness change, never polled:
  // it is a directory listing, and the card is not a monitor.
  useEffect(() => {
    let live = true
    fetch('/api/seedvr2/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setModels(d) })
      .catch(() => { if (live) setModels(null) })
    return () => { live = false }
  }, [ready])
  const installed = (models && models.installed) || []
  const catalog = (models && models.catalog) || []
  // Every file in the SEEDVR2 folder, split on whether its NAME looks like a
  // VAE. The unlikely ones are still offered, in their own group and labelled:
  // the pin exists for the install whose VAE is named something the automatic
  // path cannot recognise, and hiding those files would leave that install with
  // a picker it cannot use.
  const vaeChoices = (models && models.vae_choices) || []
  const vaeLikely = vaeChoices.filter((v) => v.likely_vae)
  const vaeOther = vaeChoices.filter((v) => !v.likely_vae)
  const tilePx = Number(svr.tile_px ?? dflt('tile_px')) || SEEDVR2_TILE_MIN
  // What 'auto' will actually use as its crossover: the explicit threshold, or
  // the tile side x1.5 — the same arithmetic the server does.
  const tileAbove = Number(svr.tile_threshold ?? dflt('tile_threshold')) > 0
    ? Number(svr.tile_threshold ?? dflt('tile_threshold'))
    : Math.round(tilePx * SEEDVR2_TILE_ABOVE_FACTOR)
  // ...and what that means for the target actually configured. The crossover is
  // strict AND derived (1.5x the tile), so it lands exactly on round numbers
  // people type — a target sitting on it ran whole with nothing said anywhere.
  const laneLine = laneForTarget(svr.tiling ?? dflt('tiling'),
    Number(svr.resolution ?? dflt('resolution')), tileAbove)
  return (
    <Card
      id="seedvr2-engine"
      title="SeedVR2 upscaling (local)"
      help="SeedVR2 resolves detail at a higher resolution and leaves the original look alone. It works independently of Klein Improve. Pick it per batch from the bulk actions in the dataset workspace, or choose its default in the shared improvement engine preference. Open Preparation above to prepare its ComfyUI node pack and two model files."
    >
      <p className={ready ? 'text-2xs text-emerald-300' : 'text-2xs text-amber-300'}>
        {ready
          ? 'Ready — SeedVR2 appears in the workspace bulk actions.'
          : 'Not ready yet. Open Preparation above, connect a compatible ComfyUI Windows portable, then review and install the node pack and model files together. Restart ComfyUI when idle and re-check. Other ComfyUI installations show their manual preparation steps.'}
      </p>

      <p className="mt-1 text-2xs text-content-subtle">
        <a href="https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler" target="_blank"
          rel="noreferrer" className="text-sky-300 underline hover:text-sky-200">Node pack →</a>
        {' · '}
        <a href="https://huggingface.co/numz/SeedVR2_comfyUI" target="_blank"
          rel="noreferrer" className="text-sky-300 underline hover:text-sky-200">Model weights →</a>
        {' · '}
        <a href="https://github.com/ByteDance-Seed/SeedVR" target="_blank"
          rel="noreferrer" className="text-sky-300 underline hover:text-sky-200">SeedVR2 by ByteDance-Seed →</a>
        {' — all Apache-2.0.'}
      </p>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-model" className="block text-xs font-medium text-content">
          Model build (optional)
        </label>
        <select
          id="seedvr2-model"
          value={svr.model ?? ''}
          onChange={(e) => setField('seedvr2', 'model', e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">auto — the 3B FP8 build, or whatever is installed</option>
          {installed.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <p className="mt-1 text-2xs text-content-subtle">
          Only builds already in your ComfyUI&rsquo;s <code>models/SEEDVR2</code> folder are
          listed: the pack&rsquo;s loader downloads an unknown name on first use, and a
          dropdown must not start a multi-gigabyte download. To use another build, put the
          file in that folder — it then appears here.
        </p>
        {catalog.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-2xs text-content-subtle">
            {catalog.map((v) => (
              <li key={v.file}>
                {v.installed ? '✓' : '·'} <b>{v.label}</b> — {v.size_gb} GB, ~{v.vram_gb} GB
                {' '}VRAM{v.recommended ? ' (recommended)' : ''}
              </li>
            ))}
          </ul>
        )}
        <ResetToDefault label="Model build (optional)" section="seedvr2" field="model" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-vae" className="block text-xs font-medium text-content">
          VAE build (optional)
        </label>
        <select
          id="seedvr2-vae"
          value={svr.vae ?? ''}
          onChange={(e) => setField('seedvr2', 'vae', e.target.value)}
          title="Use Auto unless the VAE filename lacks “vae”."
          className={INPUT_CLASS}
        >
          <option value="">auto — ema_vae_fp16, or the first VAE in the folder</option>
          {vaeLikely.map((v) => <option key={v.file} value={v.file}>{v.file}</option>)}
          {vaeOther.length > 0 && (
            <optgroup label="Other files in models/SEEDVR2 (not named like a VAE)">
              {vaeOther.map((v) => <option key={v.file} value={v.file}>{v.file}</option>)}
            </optgroup>
          )}
        </select>
        <ResetToDefault label="VAE build (optional)" section="seedvr2" field="vae" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-tiling" className="block text-xs font-medium text-content">
          High-resolution tiling
        </label>
        <select
          id="seedvr2-tiling"
          value={svr.tiling ?? dflt('tiling')}
          onChange={(e) => setField('seedvr2', 'tiling', e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="auto">Tile when it helps (recommended)</option>
          <option value="always">Always tile large frames</option>
          <option value="never">Never tile</option>
        </select>
        <p className="mt-1 text-2xs text-content-subtle">
          Requires <code>Comfyui_TTP_Toolset</code>. Auto tiles above {tileAbove} px on the short edge.
        </p>
        {laneLine && (
          <p className="mt-1 text-2xs text-sky-300">{laneLine}</p>
        )}
        <ResetToDefault label="High-resolution tiling" section="seedvr2" field="tiling" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-tile-px" className="block text-xs font-medium text-content">
          Tile size (px)
        </label>
        <input
          id="seedvr2-tile-px"
          type="number"
          min={SEEDVR2_TILE_MIN}
          max={SEEDVR2_TILE_MAX}
          step={64}
          value={svr.tile_px ?? dflt('tile_px')}
          onChange={(e) => setField('seedvr2', 'tile_px',
            e.target.value === '' ? dflt('tile_px') : Number(e.target.value))}
          title="Smaller tiles use less VRAM. Larger tiles reduce seams."
          className={INPUT_CLASS}
        />
        <ResetToDefault label="Tile size (px)" section="seedvr2" field="tile_px" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-tile-threshold" className="block text-xs font-medium text-content">
          Tiling Threshold (px)
        </label>
        <input
          id="seedvr2-tile-threshold"
          type="number"
          min={0}
          max={SEEDVR2_MAX_RESOLUTION_MAX}
          step={64}
          value={svr.tile_threshold ?? dflt('tile_threshold')}
          onChange={(e) => setField('seedvr2', 'tile_threshold',
            e.target.value === '' ? dflt('tile_threshold') : Number(e.target.value))}
          title={`Zero uses ${Math.round(tilePx * SEEDVR2_TILE_ABOVE_FACTOR)} px (${SEEDVR2_TILE_ABOVE_FACTOR}× tile size). Applies in Auto mode.`}
          className={INPUT_CLASS}
        />
        <ResetToDefault label="Tiling Threshold (px)" section="seedvr2" field="tile_threshold" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-resolution" className="block text-xs font-medium text-content">
          Short Edge (px)
        </label>
        <input
          id="seedvr2-resolution"
          type="number"
          min={SEEDVR2_RESOLUTION_MIN}
          max={SEEDVR2_RESOLUTION_MAX}
          step={2}
          value={svr.resolution ?? dflt('resolution')}
          onChange={(e) => setField('seedvr2', 'resolution',
            e.target.value === '' ? dflt('resolution') : Number(e.target.value))}
          title="Scales the short edge and keeps the aspect ratio."
          className={INPUT_CLASS}
        />
        <ResetToDefault label="Short Edge (px)" section="seedvr2" field="resolution" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-max-resolution" className="block text-xs font-medium text-content">
          Long Edge Limit
        </label>
        <input
          id="seedvr2-max-resolution"
          type="number"
          min={0}
          max={SEEDVR2_MAX_RESOLUTION_MAX}
          step={2}
          value={svr.max_resolution ?? dflt('max_resolution')}
          onChange={(e) => setField('seedvr2', 'max_resolution',
            e.target.value === '' ? dflt('max_resolution') : Number(e.target.value))}
          title="Caps the long edge to limit memory use. Zero disables the cap."
          className={INPUT_CLASS}
        />
        <ResetToDefault label="Long Edge Limit" section="seedvr2" field="max_resolution" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-color" className="block text-xs font-medium text-content">
          Colour correction
        </label>
        <select
          id="seedvr2-color"
          value={svr.color_correction ?? dflt('color_correction')}
          onChange={(e) => setField('seedvr2', 'color_correction', e.target.value)}
          title="Lab preserves source colour. Wavelet preserves broad tones. None uses raw output."
          className={INPUT_CLASS}
        >
          {SEEDVR2_COLOR_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <ResetToDefault label="Colour correction" section="seedvr2" field="color_correction" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="seedvr2-swap" className="block text-xs font-medium text-content">
          RAM Offload Blocks
        </label>
        <input
          id="seedvr2-swap"
          type="number"
          min={0}
          max={SEEDVR2_BLOCKS_MAX}
          step={1}
          value={svr.blocks_to_swap ?? dflt('blocks_to_swap')}
          onChange={(e) => setField('seedvr2', 'blocks_to_swap',
            e.target.value === '' ? dflt('blocks_to_swap') : Number(e.target.value))}
          title="Offload more blocks to reduce VRAM use at the cost of speed. Zero disables offload."
          className={INPUT_CLASS}
        />
        <ResetToDefault label="RAM Offload Blocks" section="seedvr2" field="blocks_to_swap" {...reset} />
      </div>

      <p className="mt-3 text-2xs text-content-subtle">One image per job.</p>
    </Card>
  )
}
