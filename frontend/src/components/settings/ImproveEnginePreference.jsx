import { contributions } from '../../plugins/registry.js'
import { INPUT_CLASS } from './primitives'
import ResetToDefault from './ResetToDefault'

/** A host preference across whichever independent restoration products are active. */
export default function ImproveEnginePreference({ config, configDefaults, setField }) {
  const engines = contributions('improve.engine')
  if (!engines.length) return null
  const saved = config.improve?.engine
  const selected = engines.some(engine => engine.id === saved) ? saved : engines[0].id
  return (
    <div>
      <label htmlFor="improve-engine" className="block text-sm font-medium text-content">Improvement Engine</label>
      <select id="improve-engine" value={selected} className={INPUT_CLASS} title="Default for single Improve actions."
        onChange={event => setField('improve', 'engine', event.target.value)}>
        {engines.map(engine => <option key={engine.id} value={engine.id}>{engine.label}</option>)}
      </select>
      <ResetToDefault label="Default improvement engine" section="improve" field="engine"
        config={config} configDefaults={configDefaults} setField={setField} />
    </div>
  )
}
