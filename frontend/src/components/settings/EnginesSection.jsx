import { useState } from 'react'
import { INPUT_CLASS, Card } from './primitives'
import KleinLoraCombobox, { useKleinGenerationLoras } from './KleinLoraCombobox'
import PromptOverrideField from '../common/PromptOverrideField'
import PromptPreview from './PromptPreview'
import ResetToDefault from './ResetToDefault'
import { defaultValueAt } from './settingDefaults.js'
import {
  identityPromptFields, PROMPT_SUBJECT_TYPES,
  readIdentityPrompt, writeIdentityPrompt, subjectHasOverride,
  GLOBAL_PROMPT_PART_FIELDS, SUBJECT_PROMPT_PART_FIELDS, FRAMING_PROMPT_PART_FIELDS,
} from '../common/promptOverride.js'
import { SUBJECT_TYPE_LABELS } from '../dataset/subjectTypes.js'

/* The engines the generate panel may offer. LOCAL-ONLY on this fork
   (Divergence 1) — mirrors ENGINES in dataset/engineSelection.js and
   LOCAL_ENGINES in face_dataset_service.py. Never add a cloud engine here. */
const ENGINE_OPTIONS = [
  { id: 'klein', label: 'Klein (ComfyUI, local)' },
  { id: 'krea', label: 'Krea 2 Edit (ComfyUI, local)' },
]

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
/* Klein GENERATION sampling. The shipped workflow hardcodes 5 steps at its
   sampler node and nothing on the generation paths ever passed a value, so the
   engine's own `sampler_steps` parameter was unreachable — "is the number of
   generation steps fixed at 5?" (ashish.sinha, Discord). Default 5 = the exact
   historical render; the ceiling mirrors the backend clamp. Deliberately its own
   card, next to the other Klein knobs and clearly NOT the "Upscale & improve"
   steps, which drive a different pass. */
const KLEIN_GENERATION_STEPS_MAX = 50   // face_dataset_service._IMPROVE_MAX_STEPS

function KleinGenerationCard({ config, setField, configDefaults }) {
  // The shipped 5 is read from the server payload, never retyped here: it used
  // to be a literal `?? 5` in this file, i.e. a second copy of a backend default
  // that nothing kept in sync.
  const shipped = defaultValueAt(configDefaults, 'klein', 'generation_steps')
  const steps = config.klein?.generation_steps ?? shipped
  return (
    <Card
      id="klein-generation"
      title="Klein generation quality"
      help="How many sampler steps the local Klein engine spends on each generated variation. 5 is the value the app used before this was exposed, so leaving it alone keeps today's result. More steps render more cleanly but take proportionally longer — 10 steps is roughly twice the wait per image. It will not fix a wrong prompt: anatomy problems (extra limbs, tails) come from the identity prompt, not from the step count. Raised by ashish.sinha (Discord)."
    >
      <div className="sm:max-w-xs">
        <label htmlFor="klein-generation-steps" className="block text-xs font-medium text-content">
          Generation steps
        </label>
        <input
          id="klein-generation-steps"
          type="number"
          min={1}
          max={KLEIN_GENERATION_STEPS_MAX}
          step={1}
          value={steps}
          onChange={(e) => setField('klein', 'generation_steps',
            e.target.value === '' ? shipped : Number(e.target.value))}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-[0.6875rem] text-content-subtle">
          {shipped} = the shipped value. More steps = slower, usually cleaner; 1–{KLEIN_GENERATION_STEPS_MAX}.
          Applies to variations, regenerations and the small-image rescue — not to
          “Upscale &amp; improve”, which has its own Steps below.
        </p>
        <ResetToDefault label="Generation steps" section="klein" field="generation_steps"
          config={config} configDefaults={configDefaults} setField={setField} />
      </div>
    </Card>
  )
}

/* Krea 2 Identity Edit — the second LOCAL engine. Its headline knob is
   `grounding_px`, THE consistency <-> prompt-adherence dial, so it is first and
   explained in plain words: a number nobody can interpret is not a setting.
   The two path fields are BLANK-MEANS-AUTO on purpose: the resolver finds the
   files by canonical name then by a narrow token across every ComfyUI model
   root, so an install that looks nothing like the developer's works untouched —
   they exist for the person whose files are named something else. */
const KREA_GROUNDING_MIN = 512      // mirrors krea_edit_helper.GROUNDING_PX_MIN
const KREA_GROUNDING_MAX = 1536     // mirrors krea_edit_helper.GROUNDING_PX_MAX
const KREA_STEPS_MAX = 50

function KreaCard({ config, setField, configDefaults }) {
  const krea = config.krea || {}
  const reset = { config, configDefaults, setField }
  const dflt = (key) => defaultValueAt(configDefaults, 'krea', key)
  const grounding = Number(krea.grounding_px ?? dflt('grounding_px'))
  return (
    <Card
      id="krea-engine"
      title="Krea 2 Edit (local)"
      help="The second local engine. It re-stages your reference photo — new angle, framing, light, background — while keeping the face and the body, from that ONE photo and with no character LoRA, which is what makes it useful before a LoRA exists. It needs the comfyui-krea2edit custom-node pack plus four model files; the engine card in the workspace names whatever is still missing. Its output always keeps the reference's aspect ratio (capped at 2 MP) — the shot catalog's aspect overrides do not apply — because the model was trained on same-size pairs."
    >
      <div className="sm:max-w-md">
        <label htmlFor="krea-grounding" className="block text-xs font-medium text-content">
          Reference grounding ({grounding} px)
        </label>
        <input
          id="krea-grounding"
          type="range"
          min={KREA_GROUNDING_MIN}
          max={KREA_GROUNDING_MAX}
          step={64}
          value={grounding}
          onChange={(e) => setField('krea', 'grounding_px', Number(e.target.value))}
          className="mt-1 w-full accent-violet-500"
        />
        <p className="mt-1 text-[0.6875rem] text-content-subtle">
          The resolution your reference is shown to the model&rsquo;s vision encoder at — the
          consistency ↔ prompt dial. <b>Lower</b> = it follows the shot description (more
          variety in pose, outfit and scene, looser likeness). <b>Higher</b> = it resembles
          the reference more, but starts copying the pose and outfit you asked it to change.
          1024 px is the recommended balance for people; the node&rsquo;s own default is 768.
        </p>
        <ResetToDefault label="Reference grounding" section="krea" field="grounding_px" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="krea-steps" className="block text-xs font-medium text-content">
          Sampler steps
        </label>
        <input
          id="krea-steps"
          type="number"
          min={1}
          max={KREA_STEPS_MAX}
          step={1}
          value={krea.steps ?? dflt('steps')}
          onChange={(e) => setField('krea', 'steps',
            e.target.value === '' ? dflt('steps') : Number(e.target.value))}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-[0.6875rem] text-content-subtle">
          {dflt('steps')} is the value the model&rsquo;s own reference workflow uses. More is
          slower and rarely better on this pipeline.
        </p>
        <ResetToDefault label="Sampler steps" section="krea" field="steps" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="krea-base-model" className="block text-xs font-medium text-content">
          Base model file (optional)
        </label>
        <input
          id="krea-base-model"
          type="text"
          value={krea.base_model ?? ''}
          placeholder="auto — finds a Krea 2 Turbo/Raw build"
          onChange={(e) => setField('krea', 'base_model', e.target.value)}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-[0.6875rem] text-content-subtle">
          Leave blank unless you own several Krea builds. Blank = the app picks a Krea 2
          Turbo then Raw model from your ComfyUI. Non-Krea-2 checkpoints that merely carry
          &ldquo;krea&rdquo; in their name are skipped: the identity LoRA renders pure noise on them.
        </p>
        {/* The default here is the EMPTY string, and resetting writes exactly
            that: blank means "resolve it yourself", and a reset must give that
            state back rather than freeze whichever file the app happens to
            pick today. */}
        <ResetToDefault label="Base model file" section="krea" field="base_model" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="krea-identity-lora" className="block text-xs font-medium text-content">
          Identity edit LoRA (optional)
        </label>
        <input
          id="krea-identity-lora"
          type="text"
          value={krea.identity_lora ?? ''}
          placeholder="krea/krea2_identity_edit_v1_2.safetensors"
          onChange={(e) => setField('krea', 'identity_lora', e.target.value)}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-[0.6875rem] text-content-subtle">
          Path relative to ComfyUI&rsquo;s models/loras. If the file isn&rsquo;t there under this
          name, the app searches your LoRA folders for a krea2_identity_edit file, so a
          renamed download still works.
        </p>
        <ResetToDefault label="Identity edit LoRA" section="krea" field="identity_lora" {...reset} />
      </div>
    </Card>
  )
}

/* Editable identity / quality prompts (feature request by @bbsorry / 雨田壹).
   The identity "locks" that ride ahead of every generated variation used to be
   hardcoded and invisible; here each is an override shown in ONE editable box
   that already holds the shipped default text, with a Reset — one set PER
   SUBJECT TYPE, picked with the chips at the top of the card.

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
// The `fallback` numbers this list used to carry (2 / 0 / 0 / 4) are gone: they
// were a hand-kept copy of config.DEFAULTS['klein'], and one of them (0 for the
// consistency strength) had ALREADY drifted from the backend's 1.0. Both the
// displayed value and "Reset to default" now read the server's `config_defaults`.
const IMPROVE_KNOBS = [
  { key: 'improve_megapixels', label: 'Output size (MP)',
    min: 0.5, max: 8, step: 0.5,
    hint: 'The result’s resolution.' },
  { key: 'improve_base_lora_strength', label: 'Enhancement LoRA',
    min: 0, max: 2, step: 0.05,
    hint: '0 = off (the shipped behaviour). Try 0.5–0.8. Needs klein/realistic.safetensors.' },
  // Drives klein.consistency_strength, which enqueue_klein_edit clamps to 1.5 — the
  // UI must not offer a value the engine pulls back. It anchors COMPOSITION, not
  // identity: it was mislabelled "Character LoRA" when these knobs first shipped.
  { key: 'improve_consistency_strength', label: 'Consistency LoRA',
    min: 0, max: 1.5, step: 0.05,
    hint: 'Holds the composition and background. High values resist the edit.' },
  { key: 'improve_steps', label: 'Steps',
    min: 1, max: 50, step: 1, hint: 'More steps = slower, usually cleaner.' },
]

function IdentityPromptsCard({ config, setField, promptDefaults, promptDefaultsBySubject,
                               setIdentityPrompts, configDefaults }) {
  const ip = config.identity_prompts || {}
  const kleinDefault = (key) => defaultValueAt(configDefaults, 'klein', key)
  // Subject type being edited. This screen has NO dataset context, so without an
  // explicit picker it edited "the" identity prompt — which is exactly how an
  // animal-tuned lock ended up on human generations (ashish.sinha, Discord).
  // Human first: it is the default subject and the one the flat legacy keys hold.
  const [subject, setSubject] = useState('human')
  const defaults = (promptDefaultsBySubject || {})[subject] || promptDefaults || {}
  const set = (key, v) => setField('identity_prompts', key, v)
  const setPrompt = (key, v) => setIdentityPrompts((prev) => writeIdentityPrompt(prev, subject, key, v))
  const improveEnabled = ip.klein_improve_enabled !== false
  return (
    <Card
      id="identity-prompts"
      title="Identity & Klein prompts (advanced)"
      help="The hidden prompt that locks a subject's identity across generated variations, now editable. Pick the subject type first: each type (Human, Animal, Creature, Object, Other) has its OWN text, and one you write for one type never applies to another. The box already holds the prompt in use: edit it to override, Reset to go back. Reproducibility note: as long as the box still matches the built-in text, nothing is stored and generation stays byte-identical to before — you also keep receiving improvements to that prompt. Feature request by @bbsorry (雨田壹); per-subject scoping reported by ashish.sinha."
    >
      {/* flex-wrap: five chips fit one row on a laptop and wrap to two or three
          on a phone — never a row that overflows the card. */}
      <div>
        <span className="block text-sm font-medium text-content">Subject type</span>
        <p className="mt-1 mb-2 text-xs text-content-muted">
          Which datasets this prompt applies to. Each subject type keeps its own text —
          editing the Animal one leaves your Human datasets untouched. A dot marks a type you
          have already customised.
        </p>
        <div role="group" aria-label="Subject type to edit" className="flex flex-wrap gap-1.5">
          {PROMPT_SUBJECT_TYPES.map((st) => {
            const on = st === subject
            return (
              <button
                key={st}
                type="button"
                aria-pressed={on}
                onClick={() => setSubject(st)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                  on ? 'border-indigo-400/60 bg-indigo-500/15 text-indigo-200 font-semibold'
                     : 'border-border bg-surface text-content-muted hover:text-content'}`}
              >
                {SUBJECT_TYPE_LABELS[st]}
                {subjectHasOverride(ip, st) && (
                  <span aria-label="customised" title="Customised" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Divergence 1: this fork generates on Klein ONLY, so the two identity
          locks belonging to the removed cloud engines are never shown. */}
      {identityPromptFields(subject).filter((f) => f.engines.includes('klein')).map((f) => (
        <PromptOverrideField
          key={`${subject}-${f.key}`}
          id={f.id}
          label={f.label}
          desc={f.desc}
          value={readIdentityPrompt(ip, subject, f.key)}
          defaultText={defaults[f.key]}
          onChange={(v) => setPrompt(f.key, v)}
        />
      ))}

      {/* The identity locks were one of SIX sources the prompt is built from.
          The other five shipped hardcoded and invisible; they are edited here,
          split the same way the storage is — per subject above the line, global
          below it. The composed preview closes the card, because the whole point
          of these boxes is to change a part and see the whole move. */}
      <div id="prompt-part-render-tail" className="border-t border-border pt-4">
        <h4 className="text-sm font-medium text-content">
          Klein &amp; Krea — the rest of the prompt ({SUBJECT_TYPE_LABELS[subject]})
        </h4>
        <p className="mt-1 mb-3 text-xs text-content-muted">
          These follow the subject type selected above, like the identity locks: the tail asks
          an Anime dataset for a drawing and every other type for a photograph.
        </p>
        {SUBJECT_PROMPT_PART_FIELDS.map((f) => (
          <PromptOverrideField
            key={`${subject}-${f.key}`}
            id={f.id}
            label={f.label}
            desc={f.desc}
            warn={f.warn}
            rows={f.rows}
            value={readIdentityPrompt(ip, subject, f.key)}
            defaultText={defaults[f.key]}
            onChange={(v) => setPrompt(f.key, v)}
            className="mt-3"
          />
        ))}
      </div>

      <div id="prompt-part-framing" className="border-t border-border pt-4">
        <h4 className="text-sm font-medium text-content">
          Shot detail per framing ({SUBJECT_TYPE_LABELS[subject]})
        </h4>
        <p className="mt-1 mb-1 text-xs text-content-muted">
          Klein and Krea under-fill a short tag prompt and invent the rest, so each shot carries
          a concrete description of what the framing should look like. This is where the lens
          talk (&ldquo;85mm portrait lens look&rdquo;) lives.
        </p>
        {/* Four boxes: two columns on a laptop, stacked on a phone. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {FRAMING_PROMPT_PART_FIELDS.map((f) => (
            <PromptOverrideField
              key={`${subject}-${f.key}`}
              id={f.id}
              label={f.label}
              rows={f.rows}
              value={readIdentityPrompt(ip, subject, f.key)}
              defaultText={defaults[f.key]}
              onChange={(v) => setPrompt(f.key, v)}
              className="mt-2"
            />
          ))}
        </div>
      </div>

      <div id="prompt-part-global" className="border-t border-border pt-4">
        <h4 className="text-sm font-medium text-content">Applied to every subject type</h4>
        <p className="mt-1 mb-1 text-xs text-content-muted">
          These four are <strong>not</strong> per subject type: the two directives are only ever
          injected into human shots, and the skin hold is one sentence about not inventing
          detail. Editing them here changes them everywhere.
        </p>
        {GLOBAL_PROMPT_PART_FIELDS.map((f) => (
          <PromptOverrideField
            key={f.key}
            id={f.id}
            label={f.label}
            desc={f.desc}
            warn={f.warn}
            rows={f.rows}
            value={ip[f.key]}
            defaultText={defaults[f.key]}
            onChange={(v) => set(f.key, v)}
            className="mt-3"
          />
        ))}
      </div>

      <PromptPreview subject={subject} identityPrompts={ip} />

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs text-content-subtle">
          The prompt below is <strong>not</strong> per subject type — it asks for texture and
          detail, which means the same thing for a person, a dog or a car.
        </p>
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
      {/* id spelled out literally: it is the deep-link target of the lightbox's
          "Adjust improve strength →" link, and the contract tests find targets by
          scanning this file for id="…". The BLOCK is the target, not one knob:
          "strength" here is the four values together, and ringing the group is
          the honest answer to what that label promises. */}
      <div id="klein-improve-strength" className="scroll-mt-24 border-t border-border pt-4">
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
                value={config.klein?.[k.key] ?? kleinDefault(k.key)}
                onChange={(e) => setField('klein', k.key,
                  e.target.value === '' ? kleinDefault(k.key) : Number(e.target.value))}
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-[0.6875rem] text-content-subtle">
                {k.hint} Default {String(kleinDefault(k.key))}.
              </p>
              <ResetToDefault label={k.label} section="klein" field={k.key}
                config={config} configDefaults={configDefaults} setField={setField} />
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
  const { config, setField, toggleEngine, caps, configDefaults } = props
  return (
    <div className="space-y-6">
      <Card title="Engines"
        help="Local-only fork: images are generated on your own GPU through ComfyUI. Configure ComfyUI under Local tools; the model files install from the Setup page.">
        <p className="text-sm text-content-muted">
          Klein and Krea 2 Edit both render locally through ComfyUI — free, on your own
          GPU, NSFW-capable. The cloud API engines were removed from this fork.
        </p>
      </Card>

      <Card id="engines-choice" title="Which engines to offer"
        help="Which engines appear in the generate panel, and which one is preselected. Both run locally, so turning one off is about what you have installed, not about cost: Krea 2 Edit needs its own custom-node pack and model files, so leave it unticked until Setup reports it ready.">
        <div>
          <label htmlFor="engine-default" className="block text-sm font-medium text-content">Default engine</label>
          <select
            id="engine-default"
            value={config.engines.default}
            onChange={(e) => setField('engines', 'default', e.target.value)}
            className={INPUT_CLASS}
          >
            {ENGINE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <ResetToDefault label="Default engine" section="engines" field="default"
            config={config} configDefaults={configDefaults} setField={setField} />
        </div>

        <fieldset id="engines-enabled" className="scroll-mt-24">
          <legend className="mb-1 block text-sm font-medium text-content">Enabled engines</legend>
          <div className="flex flex-col gap-2">
            {ENGINE_OPTIONS.map((o) => (
              <label key={o.id} htmlFor={`engine-enabled-${o.id}`} className="flex items-center gap-2 text-sm text-content">
                <input
                  id={`engine-enabled-${o.id}`}
                  type="checkbox"
                  checked={(config.engines.enabled || []).includes(o.id)}
                  onChange={() => toggleEngine(o.id)}
                  className="h-4 w-4 rounded border-border-strong"
                />
                {o.label}
              </label>
            ))}
          </div>
          {/* The only LIST with a reset. Ticking the boxes back one by one means
              knowing which five shipped enabled — and the catalog grows with
              releases, so that knowledge goes stale. Order is not compared: a
              re-ticked selection is the same selection. */}
          <ResetToDefault label="Enabled engines" section="engines" field="enabled"
            config={config} configDefaults={configDefaults} setField={setField} />
        </fieldset>
      </Card>

      <KleinModelFilesCard config={config} setField={setField} caps={caps} />

      <KleinGenerationCard config={config} setField={setField} configDefaults={configDefaults} />

      <KleinLorasCard config={config} setField={setField} />

      <KreaCard config={config} setField={setField} configDefaults={configDefaults} />

      <IdentityPromptsCard config={config} setField={setField} promptDefaults={props.promptDefaults}
        promptDefaultsBySubject={props.promptDefaultsBySubject}
        setIdentityPrompts={props.setIdentityPrompts} configDefaults={configDefaults} />
    </div>
  )
}
