import { Card, ResetToDefault } from '@lds/plugin-sdk/ui'
import { defaultValueAt } from '@lds/plugin-sdk/data'
/* The finishing pass — three pixel operations the APP runs on the ✨ improve
   result, after ComfyUI is done with it.

   This card belongs to Klein Improve. SeedVR2 owns its separate finishing recipe. The reference workflow
   these come from does them with three third-party node packs; doing them here
   makes these finishing operations deterministic without extra node packs —
   no GPU, no model, no graph. */
const IMPROVE_SHARPEN_MAX = 1.5
const IMPROVE_GRAIN_MAX = 0.05
// The values the reference workflow uses, shown as the "known-good" landing spot
// rather than shipped as defaults — this ships off.
const IMPROVE_REFERENCE = { colour_match: 0.8, sharpen: 0.55, grain: 0.01 }

export default function ImproveFinishCard({ config, setField, configDefaults }) {
  const improve = config.improve || {}
  const reset = { config, configDefaults, setField }
  const dflt = (key) => defaultValueAt(configDefaults, 'improve', key)
  const num = (key) => Number(improve[key] ?? dflt(key)) || 0
  const colour = num('colour_match')
  const sharpen = num('sharpen')
  const grain = num('grain')
  const grainSat = num('grain_saturation')
  const anyOn = colour > 0 || sharpen > 0 || grain > 0
  return (
    <Card
      id="improve-finish"
      title="Klein finishing pass"
      help="Colour, sharpening, and grain run on the CPU."
    >
      {!anyOn && (
        <p className="rounded border border-border-subtle bg-surface-subtle px-2 py-1.5 text-2xs text-content-subtle">
          All finishing stages are off.
        </p>
      )}

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="improve-colour-match" className="block text-xs font-medium text-content">
          Match Colours ({colour === 0 ? 'off' : colour})
        </label>
        <input
          id="improve-colour-match"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={colour}
          onChange={(e) => setField('improve', 'colour_match', Number(e.target.value))}
          title={`Restores the source colours. Reference: ${IMPROVE_REFERENCE.colour_match}.`}
          className="mt-1 w-full accent-primary"
        />
        <ResetToDefault label="Match Colours" section="improve"
          field="colour_match" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="improve-sharpen" className="block text-xs font-medium text-content">
          Sharpen ({sharpen === 0 ? 'off' : sharpen})
        </label>
        <input
          id="improve-sharpen"
          type="range"
          min={0}
          max={IMPROVE_SHARPEN_MAX}
          step={0.05}
          value={sharpen}
          onChange={(e) => setField('improve', 'sharpen', Number(e.target.value))}
          title={`Sharpens fine detail. Reference: ${IMPROVE_REFERENCE.sharpen}.`}
          className="mt-1 w-full accent-primary"
        />
        <ResetToDefault label="Sharpen" section="improve" field="sharpen" {...reset} />
      </div>

      <div className="mt-3 sm:max-w-md">
        <label htmlFor="improve-grain" className="block text-xs font-medium text-content">
          Film grain ({grain === 0 ? 'off' : grain})
        </label>
        <input
          id="improve-grain"
          type="range"
          min={0}
          max={IMPROVE_GRAIN_MAX}
          step={0.002}
          value={grain}
          onChange={(e) => setField('improve', 'grain', Number(e.target.value))}
          title={`Adds fine texture. Reference: ${IMPROVE_REFERENCE.grain}.`}
          className="mt-1 w-full accent-primary"
        />
        <ResetToDefault label="Film grain" section="improve" field="grain" {...reset} />
      </div>

      {/* Not greyed on `grain === 0`: this dial also serves the Studio's PER-RUN
          grain (the cell carries its own amount, the colour mix follows this
          setting), so it has to stay editable while the improve pass's grain is
          off. */}
      <div className="mt-3 sm:max-w-md">
        <label htmlFor="improve-grain-sat" className="block text-xs font-medium text-content">
          Grain Colour ({grainSat})
        </label>
        <input
          id="improve-grain-sat"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={grainSat}
          onChange={(e) => setField('improve', 'grain_saturation', Number(e.target.value))}
          title="Zero is monochrome grain. Higher values add colour."
          className="mt-1 w-full accent-primary"
        />
        <ResetToDefault label="Grain Colour" section="improve"
          field="grain_saturation" {...reset} />
      </div>
    </Card>
  )
}
