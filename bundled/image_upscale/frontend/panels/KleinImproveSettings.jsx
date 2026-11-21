import { Card, INPUT_CLASS, ResetToDefault, PromptOverrideField } from '@lds/plugin-sdk/ui'
import { defaultValueAt } from '@lds/plugin-sdk/data'
const IMPROVE_KNOBS = [
  { key: 'improve_megapixels', label: 'Output size (MP)',
    min: 0.5, max: 8, step: 0.5,
    hint: 'Output resolution in megapixels.' },
  { key: 'improve_base_lora_strength', label: 'Enhancement LoRA',
    min: 0, max: 2, step: 0.05,
    hint: 'Zero turns it off. Try 0.5–0.8.' },
  // Drives klein.consistency_strength, which enqueue_klein_edit clamps to 1.5 — the
  // UI must not offer a value the engine pulls back. It anchors COMPOSITION, not
  // identity: it was mislabelled "Character LoRA" when these knobs first shipped.
  { key: 'improve_consistency_strength', label: 'Consistency LoRA',
    min: 0, max: 1.5, step: 0.05,
    hint: 'Holds the composition and background. High values resist the edit.' },
  { key: 'improve_steps', label: 'Steps',
    min: 1, max: 50, step: 1, hint: 'More steps = slower, usually cleaner.' },
]
export default function KleinImproveSettings({ config, setField, configDefaults, promptDefaults }) {
const ip = config.identity_prompts || {}
const defaults = promptDefaults || {}
const improveEnabled = ip.klein_improve_enabled !== false
const kleinDefault = key => defaultValueAt(configDefaults, 'klein', key)
const set = (key, value) => setField('identity_prompts', key, value)
return <Card id="klein-improve-settings" title="Klein improvement">
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs text-amber-300">
          The default prompt can make drawings look more photographic.
        </p>
        <label htmlFor="identity-prompt-klein-improve-enabled" className="flex items-center gap-2 text-sm font-medium text-content">
          <input
            id="identity-prompt-klein-improve-enabled"
            type="checkbox"
            checked={improveEnabled}
            onChange={(e) => set('klein_improve_enabled', e.target.checked)}
            className="h-4 w-4 rounded border-border-strong"
          />
          Apply Improve Prompt
        </label>
        <PromptOverrideField
          id="identity-prompt-klein-improve"
          label="Improve Prompt"
          rows={3}
          value={ip.klein_improve}
          defaultText={defaults.klein_improve}
          onChange={(v) => set('klein_improve', v)}
          disabled={!improveEnabled}
          className="mt-2"
        />
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
        <h4 className="mb-2 text-sm font-medium text-content">Upscale Strength</h4>
        <p className="mb-2 text-xs text-content-muted">
          Enhancement LoRA requires <code>klein/realistic.safetensors</code> from Setup ▸ Downloads &amp; Repair.
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
                title={`${k.hint} Default ${kleinDefault(k.key)}.`}
                min={k.min}
                max={k.max}
                step={k.step}
                value={config.klein?.[k.key] ?? kleinDefault(k.key)}
                onChange={(e) => setField('klein', k.key,
                  e.target.value === '' ? kleinDefault(k.key) : Number(e.target.value))}
                className={INPUT_CLASS}
              />
              <ResetToDefault label={k.label} section="klein" field={k.key}
                config={config} configDefaults={configDefaults} setField={setField} />
            </div>
          ))}
        </div>
      </div>
</Card>
}
