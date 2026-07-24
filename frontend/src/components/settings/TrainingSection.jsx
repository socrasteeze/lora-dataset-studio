import { INPUT_CLASS, Card } from './primitives'

// Keep in sync with backend TRAIN_TYPES (face_dataset_service.py) — 'flux' had
// been forgotten here when the FLUX.1 family landed (fixed alongside flux2klein).
const FAMILY_OPTIONS = ['zimage', 'sdxl', 'krea', 'flux', 'flux2klein', 'anima']

export default function TrainingSection(props) {
  const { config, setField } = props
  return (
    <div className="space-y-6">
      <Card title="Defaults" help="Preselected model family for new training runs — each dataset can still override it.">
        <div>
          <label htmlFor="training-default-family" className="block text-sm font-medium text-content">Default training family</label>
          <select
            id="training-default-family"
            value={config.training.default_family}
            onChange={(e) => setField('training', 'default_family', e.target.value)}
            className={INPUT_CLASS}
          >
            {FAMILY_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </Card>
    </div>
  )
}
