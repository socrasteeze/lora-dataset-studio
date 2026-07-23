import { INPUT_CLASS, Card } from './primitives'
import KleinLoraCombobox, { useKleinGenerationLoras } from './KleinLoraCombobox'
import PromptOverrideField from '../common/PromptOverrideField'
import { IDENTITY_PROMPT_FIELDS } from '../common/promptOverride.js'

/* Optional generation-LoRA PRESETS for the local Klein engine (Idea by
   @waltm — Discord feature request): named combinations of user-pointed LoRA
   files (any files, any purpose — texture, anatomy, style…). Inside a preset
   the rows chain after the consistency LoRA in LIST ORDER (file + strength,
   reorderable, capped at 8). Per run the workspace's Klein tuning panel
   just PICKS a preset ("None" by default) — the choice carries the intent,
   there is no automatic gating. The app never ships or hardcodes a LoRA name. */
const MAX_GENERATION_LORAS = 8        // mirrors backend klein_edit_helper caps
const MAX_GENERATION_LORA_PRESETS = 12

const SMALL_BTN = 'grid h-6 w-6 place-items-center rounded border border-border text-xs ' +
  'text-content-muted hover:bg-surface-raised disabled:opacity-30'
const TEXT_BTN = 'rounded-md border border-border-strong px-2 py-1 text-xs font-medium ' +
  'text-content hover:bg-surface-raised disabled:opacity-50'

/** Fresh name not colliding with the existing presets ("Preset 2", "x (copy)"…). */
function freeName(presets, base) {
  const taken = new Set(presets.map((p) => (p?.name || '').trim()))
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const cand = `${base} ${n}`
    if (!taken.has(cand)) return cand
  }
}

function KleinLoraPresetCard({ preset, index, presets, save, loraScan }) {
  const rows = Array.isArray(preset?.loras) ? preset.loras : []
  const patchPreset = (p) => save(presets.map((x, j) => (j === index ? { ...x, ...p } : x)))
  const patchRow = (i, p) => patchPreset({ loras: rows.map((r, j) => (j === i ? { ...r, ...p } : r)) })
  const moveRow = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    patchPreset({ loras: next })
  }
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text" aria-label={`Preset ${index + 1} name`}
          value={preset?.name || ''}
          onChange={(e) => patchPreset({ name: e.target.value })}
          placeholder="Preset name"
          className={`${INPUT_CLASS} mt-0 font-medium`}
        />
        <button type="button" className={TEXT_BTN}
          disabled={presets.length >= MAX_GENERATION_LORA_PRESETS}
          onClick={() => save([...presets,
            { ...preset, name: freeName(presets, `${(preset?.name || 'Preset').trim() || 'Preset'} (copy)`), loras: rows.map((r) => ({ ...r })) }])}
          title="Duplicate this preset">
          Duplicate
        </button>
        <button type="button" className={`${TEXT_BTN} hover:bg-red-500/15 hover:text-red-300`}
          onClick={() => save(presets.filter((_, j) => j !== index))}
          title="Delete this preset">
          Delete
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-content-muted">Empty preset — add a LoRA below.</p>
      )}
      {rows.map((row, i) => {
        const strength = Number.isFinite(Number(row?.strength)) ? Number(row.strength) : 0.6
        return (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-content-muted w-4 shrink-0" aria-hidden="true">{i + 1}.</span>
            <KleinLoraCombobox
              ariaLabel={`Preset ${index + 1} LoRA file ${i + 1}`}
              value={row?.file || ''}
              onChange={(next) => patchRow(i, { file: next })}
              {...loraScan}
            />
            <label className="flex items-center gap-1.5 text-xs text-content-muted">
              <span className="whitespace-nowrap">{strength.toFixed(2)}</span>
              <input
                type="range" min={0} max={1.5} step={0.05} value={strength}
                aria-label={`Preset ${index + 1} LoRA ${i + 1} strength`}
                onChange={(e) => patchRow(i, { strength: Number(e.target.value) })}
                className="w-28 accent-indigo-500"
              />
            </label>
            <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0}
              aria-label={`Move LoRA ${i + 1} up in preset ${index + 1}`} title="Chain earlier" className={SMALL_BTN}>↑</button>
            <button type="button" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1}
              aria-label={`Move LoRA ${i + 1} down in preset ${index + 1}`} title="Chain later" className={SMALL_BTN}>↓</button>
            <button type="button" onClick={() => patchPreset({ loras: rows.filter((_, j) => j !== i) })}
              aria-label={`Remove LoRA ${i + 1} from preset ${index + 1}`} title="Remove this LoRA"
              className={`${SMALL_BTN} hover:bg-red-500/15 hover:text-red-300`}>✕</button>
          </div>
        )
      })}
      <div className="flex items-center gap-3">
        <button
          type="button" className={TEXT_BTN}
          onClick={() => patchPreset({ loras: [...rows, { file: '', strength: 0.6 }] })}
          disabled={rows.length >= MAX_GENERATION_LORAS}
        >
          ＋ Add LoRA
        </button>
        <span className="text-xs text-content-muted">{rows.length}/{MAX_GENERATION_LORAS} in the chain</span>
      </div>
    </div>
  )
}

function KleinLorasCard({ config, setField }) {
  const presets = Array.isArray(config.klein?.generation_lora_presets)
    ? config.klein.generation_lora_presets : []
  const save = (next) => setField('klein', 'generation_lora_presets', next)
  // ONE scan of ComfyUI's loras folder, shared by every row's picker (never one
  // fetch per row). Degrades to free-text on any failure — see the hook.
  const loraScan = useKleinGenerationLoras()
  return (
    <Card
      id="klein-generation-lora-presets"
      title="Klein generation LoRA presets (optional)"
      help={`Named combinations of your own LoRA files, chained after the consistency LoRA on the local Klein engine — inside a preset the order is the chain order (max ${MAX_GENERATION_LORAS} LoRAs each, ${MAX_GENERATION_LORA_PRESETS} presets). Pick each row from the LoRAs found under ComfyUI's models/loras (Klein-compatible ones are listed first; you can still type a path for a file not on disk yet) — any LoRA, any purpose. Per run, pick a preset in the workspace's Klein tuning panel ("None" by default). Presets and LoRA autocomplete by @waltm (Discord).`}
    >
      {presets.length === 0 && (
        <p className="text-sm text-content-muted">No presets yet — create your first combination below.</p>
      )}
      {presets.map((preset, i) => (
        <KleinLoraPresetCard key={i} preset={preset} index={i} presets={presets} save={save} loraScan={loraScan} />
      ))}
      <div className="flex items-center gap-3">
        <button
          type="button" className={TEXT_BTN}
          onClick={() => save([...presets, { name: freeName(presets, 'My preset'), loras: [] }])}
          disabled={presets.length >= MAX_GENERATION_LORA_PRESETS}
        >
          ＋ New preset
        </button>
        <span className="text-xs text-content-muted">{presets.length}/{MAX_GENERATION_LORA_PRESETS}</span>
      </div>
    </Card>
  )
}

/* The overridable Klein model slots. `key` is the DOM id the help
   registry focuses (the contract test scans these literals); `cfg` is the
   klein.* config key; `slot` matches caps.comfyui.klein_overrides. */
const KLEIN_MODEL_SLOTS = [
  { key: 'klein-model-unet', cfg: 'unet', slot: 'unet', label: 'Diffusion model (UNET)',
    hint: "Full path from anywhere, or relative to a diffusion-model folder — e.g. flux-2-klein-9b.safetensors (bf16) or klein/flux-2-klein-9b-kv-fp8.safetensors under models/unet." },
  { key: 'klein-model-text_encoder', cfg: 'text_encoder', slot: 'text_encoder', label: 'Text encoder',
    hint: 'Full path from anywhere, or relative to models/text_encoders — e.g. qwen_3_8b.safetensors (full) or qwen_3_8b_fp8mixed.safetensors.' },
  { key: 'klein-model-vae', cfg: 'vae', slot: 'vae', label: 'VAE',
    hint: 'Full path from anywhere, or relative to models/vae — e.g. flux2-vae.safetensors.' },
  { key: 'klein-model-consistency_lora', cfg: 'consistency_lora', slot: 'consistency_lora', label: 'Consistency LoRA',
    hint: 'Full path from anywhere, or relative to models/loras — the structure-anchoring LoRA chained onto the Klein edit graph. Clearing this disables it entirely.' },
]

/* Editable identity / quality prompts (feature request by @bbsorry / 雨田壹).
   The identity "locks" that ride ahead of every generated variation used to be
   hardcoded and invisible; here each is a GLOBAL override shown in ONE editable
   box that already holds the shipped default text, with a Reset.

   IDENTITY_PROMPT_FIELDS (common/promptOverride.js) also ships keys for
   upstream's API-engine wrapper; this fork's generation path is Klein-only
   (wrap_variation is never called), so IdentityPromptsCard below filters to
   the `klein` entry only — the other fields would edit dead config nothing
   reads.

   The two-box era is over: the field used to be an empty textarea next to a
   read-only copy of the shipped text and a button that pasted it in. One box is
   clearer, but it must not turn "I looked at the default" into a persisted COPY
   of it — that would freeze the prompt for that user and hide every future
   improvement. PromptOverrideField normalises the text back to '' whenever it
   equals the shipped default, so blank-means-default (the backend contract in
   face_variations.get_identity_prompt) still holds.

   The Klein-improve prompt additionally has an on/off toggle: off applies NO
   prompt to the manual "Klein upscale & improve".
   Field metadata (keys mirroring config identity_prompts.*, never renamed) lives
   in common/promptOverride.js, shared with the workspace's Extra-refs modal. */

// Bounds mirror the server-side clamps in face_dataset_service._improve_float /
// _improve_int — the UI should not offer a value the backend will silently pull back.
const IMPROVE_KNOBS = [
  { key: 'improve_megapixels', label: 'Output size (MP)', fallback: 2,
    min: 0.5, max: 8, step: 0.5,
    hint: 'The result’s resolution. 2 = the shipped value.' },
  { key: 'improve_base_lora_strength', label: 'Enhancement LoRA', fallback: 0,
    min: 0, max: 2, step: 0.05,
    hint: '0 = off (the shipped behaviour). Try 0.5–0.8. Needs klein/realistic.safetensors.' },
  // Drives klein.consistency_strength, which enqueue_klein_edit clamps to 1.5 — the
  // UI must not offer a value the engine pulls back. It anchors COMPOSITION, not
  // identity: it was mislabelled "Character LoRA" when these knobs first shipped.
  { key: 'improve_consistency_strength', label: 'Consistency LoRA', fallback: 0,
    min: 0, max: 1.5, step: 0.05,
    hint: 'Holds the composition and background. High values resist the edit.' },
  { key: 'improve_steps', label: 'Steps', fallback: 4,
    min: 1, max: 50, step: 1, hint: 'More steps = slower, usually cleaner.' },
]

function IdentityPromptsCard({ config, setField, promptDefaults }) {
  const ip = config.identity_prompts || {}
  const defaults = promptDefaults || {}
  const set = (key, v) => setField('identity_prompts', key, v)
  const improveEnabled = ip.klein_improve_enabled !== false
  return (
    <Card
      id="identity-prompts"
      title="Identity & Klein prompts (advanced)"
      help="The hidden prompts that lock a subject's facial identity across generated variations, now editable. Each box already holds the prompt in use: edit it to override, Reset to go back. Each applies globally to every dataset. Reproducibility note: as long as a box still matches the built-in text, nothing is stored and generation stays byte-identical to before — you also keep receiving improvements to that prompt. Feature request by @bbsorry (雨田壹)."
    >
      {IDENTITY_PROMPT_FIELDS.filter((f) => f.engines.includes('klein')).map((f) => (
        <PromptOverrideField
          key={f.key}
          id={f.id}
          label={f.label}
          desc={f.desc}
          value={ip[f.key]}
          defaultText={defaults[f.key]}
          onChange={(v) => set(f.key, v)}
        />
      ))}

      <div className="border-t border-border pt-4">
        <label htmlFor="identity-prompt-klein-improve-enabled" className="flex items-center gap-2 text-sm font-medium text-content">
          <input
            id="identity-prompt-klein-improve-enabled"
            type="checkbox"
            checked={improveEnabled}
            onChange={(e) => set('klein_improve_enabled', e.target.checked)}
            className="h-4 w-4 rounded border-border-strong"
          />
          Apply an improvement prompt on “Klein upscale &amp; improve”
        </label>
        <PromptOverrideField
          id="identity-prompt-klein-improve"
          label="Klein upscale & improve prompt"
          desc="The fixed instruction the manual “Klein upscale & improve” action sends to add texture and detail. Turn the checkbox above off to upscale with no prompt at all (pure enhancement)."
          rows={3}
          value={ip.klein_improve}
          defaultText={defaults.klein_improve}
          onChange={(v) => set('klein_improve', v)}
          disabled={!improveEnabled}
          className="mt-2"
        />
        {!improveEnabled && (
          <p className="mt-1 text-xs text-content-subtle">Disabled — no prompt is applied.</p>
        )}
        <p className="mt-3 text-xs text-content-subtle">
          Separate from the scraper rescue prompt for small images — see Settings ▸ Scraping ▸ “Klein rescue — small scraped images”.
        </p>
      </div>

      {/* The instruction above was already editable, but the knobs deciding how
          much the pass actually changes were hardcoded — including both LoRA
          strengths at 0, which meant the workflow's own realistic LoRA never
          applied. Defaults here are those historical values. */}
      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-medium text-content">Upscale &amp; improve — strength</h4>
        <p className="mt-1 mb-2 text-xs text-content-muted">
          Output resolution, and how much the pass is allowed to change the image. All four
          start at the values the action used before they were exposed, so leaving them alone
          keeps today’s result.
        </p>
        <p className="mb-2 text-xs text-content-muted">
          The <strong>enhancement LoRA</strong> needs its weights file
          (<code>klein/realistic.safetensors</code>): without it that node is skipped and the
          strength changes nothing. Setup downloads it with the other Klein assets — if the
          slider seems to do nothing, run <strong>Install everything</strong> there first.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {IMPROVE_KNOBS.map((k) => (
            <div key={k.key}>
              <label htmlFor={`klein-${k.key}`} className="block text-xs font-medium text-content">
                {k.label}
              </label>
              <input
                id={`klein-${k.key}`}
                type="number"
                min={k.min}
                max={k.max}
                step={k.step}
                value={config.klein?.[k.key] ?? k.fallback}
                onChange={(e) => setField('klein', k.key,
                  e.target.value === '' ? k.fallback : Number(e.target.value))}
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-[0.6875rem] text-content-subtle">{k.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

/* Badge per resolve status from caps.comfyui.klein_overrides. */
function overrideBadge(st) {
  if (!st) return null
  if (st.found) return { cls: 'text-emerald-400', text: '✓ found' }
  if (st.status === 'outside_roots') {
    return { cls: 'text-amber-400',
             text: "⚠ could not link into ComfyUI's model folders — check permissions or move the file" }
  }
  return { cls: 'text-amber-400', text: '⚠ not found — auto-detection is used' }
}

function KleinModelFilesCard({ config, setField, caps }) {
  const overrides = caps?.comfyui?.klein_overrides || {}
  return (
    <Card
      id="klein-model-files"
      title="Klein model files (optional)"
      help="Pin the exact files the Klein graph loads instead of relying on auto-detection (canonical download names, then a narrow token scan). Each field takes a full absolute path OR a ComfyUI-relative loader name. Paths under ComfyUI's model folders (including extra_model_paths.yaml) convert automatically; paths from anywhere else are hardlinked/symlinked into an lds-pinned/ folder so ComfyUI can still load them. Leave a field empty to keep auto-detection for that slot. A pinned file that can't be resolved falls back to auto-detection and shows a badge here."
    >
      {KLEIN_MODEL_SLOTS.map(({ key, cfg, slot, label, hint }) => {
        const badge = overrideBadge(overrides[slot])
        return (
          <div key={key}>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={key} className="block text-sm font-medium text-content">{label}</label>
              {badge && (
                <span className={`text-xs text-right ${badge.cls}`}>{badge.text}</span>
              )}
            </div>
            <input
              id={key}
              type="text"
              value={config.klein?.[cfg] || ''}
              onChange={(e) => setField('klein', cfg, e.target.value)}
              placeholder="Empty = auto-detect"
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-content-muted">{hint}</p>
          </div>
        )
      })}
    </Card>
  )
}

export default function EnginesSection(props) {
  const { config, setField, caps } = props
  return (
    <div className="space-y-6">
      <Card title="Engine"
        help="Local-only fork: images are generated by the local Klein engine (ComfyUI). Configure ComfyUI under Local tools; Klein models install from the Setup page.">
        <p className="text-sm text-content-muted">
          Klein (ComfyUI, local) is the only generation engine — free, on your own GPU,
          NSFW-capable. The cloud API engines were removed from this fork.
        </p>
      </Card>

      <KleinModelFilesCard config={config} setField={setField} caps={caps} />

      <KleinLorasCard config={config} setField={setField} />

      <IdentityPromptsCard config={config} setField={setField} promptDefaults={props.promptDefaults} />
    </div>
  )
}
