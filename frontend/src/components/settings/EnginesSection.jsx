import { INPUT_CLASS, Card } from './primitives'
import KleinLoraCombobox, { useKleinGenerationLoras } from './KleinLoraCombobox'

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
   hardcoded and invisible; here each is a GLOBAL override with a one-line
   description (the discoverability the request asked for) and a Restore default.
   Blank = the shipped default is used (the app stays byte-identical to before),
   so Restore just clears the field. The Klein-improve prompt additionally has an
   on/off toggle: off applies NO prompt to the manual "Klein upscale & improve".
   Keys mirror config identity_prompts.* — never renamed (persisted globally).
   Upstream also ships face_single/face_multi keys for its API-engine wrapper;
   this fork's generation path is Klein-only (wrap_variation is never called),
   so only the field actually wired into Klein is surfaced here. */
const IDENTITY_PROMPTS = [
  { key: 'klein_identity', id: 'identity-prompt-klein-identity',
    label: 'Klein — restage & face-identity block',
    desc: 'The instruction block Klein (local) uses to restage the shot while keeping the face identical. Steers pose/framing/outfit changes without altering the person.' },
]

/* The default is real code text shipped in face_variations.py, delivered
   read-only in the settings payload (identity_prompt_defaults). When a field is
   blank the app uses this exact text — so we SHOW it (grey mono block) and offer
   "Load default to edit", which copies it into the textarea (you can't edit a
   placeholder). Loading it makes the field a real override on next save, which is
   the point: you start from the true prompt and change it. `disabled` mutes the
   whole block when the parent step is toggled off. */
function DefaultPromptPreview({ text, disabled }) {
  if (!text) return null
  return (
    <div className={`mt-1 rounded-md border border-border bg-surface p-2 ${disabled ? 'opacity-50' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-content-subtle">
        Built-in default (currently in use) — use “✎ Load default to edit” above to start from it and adjust
      </span>
      <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-content-muted">{text}</p>
    </div>
  )
}

function IdentityPromptField({ field, value, onChange, onRestore, defaultText }) {
  const blank = !(value || '').trim()
  return (
    <div>
      <label htmlFor={field.id} className="block text-sm font-medium text-content">{field.label}</label>
      <p className="mb-1 text-xs text-content-muted">{field.desc}</p>
      <textarea
        id={field.id}
        rows={4}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultText || 'Leave blank to use the built-in default.'}
        className={`${INPUT_CLASS} font-mono leading-relaxed`}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-content-subtle">{blank ? 'Using the built-in default.' : 'Custom override active.'}</span>
        {blank
          ? (defaultText && (
            <button type="button" onClick={() => onChange(defaultText)} className={TEXT_BTN}>
              ✎ Load default to edit
            </button>
          ))
          : (
            <button type="button" onClick={onRestore} className={TEXT_BTN}>
              Restore default
            </button>
          )}
      </div>
      {blank && <DefaultPromptPreview text={defaultText} />}
    </div>
  )
}

function IdentityPromptsCard({ config, setField, promptDefaults }) {
  const ip = config.identity_prompts || {}
  const defaults = promptDefaults || {}
  const set = (key, v) => setField('identity_prompts', key, v)
  const improveEnabled = ip.klein_improve_enabled !== false
  const improveBlank = !(ip.klein_improve || '').trim()
  return (
    <Card
      id="identity-prompts"
      title="Identity & Klein prompts (advanced)"
      help="The hidden prompts that lock a subject's facial identity across generated variations, now editable. Each applies globally to every dataset; leave a field blank to keep the shipped default. Reproducibility note: with everything blank, generation is byte-identical to before. Feature request by @bbsorry (雨田壹)."
    >
      {IDENTITY_PROMPTS.map((f) => (
        <IdentityPromptField
          key={f.key}
          field={f}
          value={ip[f.key]}
          defaultText={defaults[f.key]}
          onChange={(v) => set(f.key, v)}
          onRestore={() => set(f.key, '')}
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
        <p className="mt-1 mb-1 text-xs text-content-muted">
          The fixed instruction the manual “Klein upscale &amp; improve” action sends to add texture and detail. Turn this off to upscale with no prompt at all (pure enhancement).
        </p>
        <textarea
          id="identity-prompt-klein-improve"
          rows={3}
          value={ip.klein_improve ?? ''}
          onChange={(e) => set('klein_improve', e.target.value)}
          disabled={!improveEnabled}
          placeholder={defaults.klein_improve || 'Leave blank to use the built-in default.'}
          className={`${INPUT_CLASS} font-mono leading-relaxed disabled:opacity-50`}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs text-content-subtle">
            {!improveEnabled ? 'Disabled — no prompt is applied.' : improveBlank ? 'Using the built-in default.' : 'Custom override active.'}
          </span>
          {improveEnabled && (improveBlank
            ? (defaults.klein_improve && (
              <button type="button" onClick={() => set('klein_improve', defaults.klein_improve)} className={TEXT_BTN}>
                ✎ Load default to edit
              </button>
            ))
            : (
              <button type="button" onClick={() => set('klein_improve', '')} className={TEXT_BTN}>
                Restore default
              </button>
            ))}
        </div>
        {improveEnabled && improveBlank && (
          <DefaultPromptPreview text={defaults.klein_improve} />
        )}
        <p className="mt-3 text-xs text-content-subtle">
          Separate from the scraper rescue prompt for small images — see Settings ▸ Scraping ▸ “Klein rescue — small scraped images”.
        </p>
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
