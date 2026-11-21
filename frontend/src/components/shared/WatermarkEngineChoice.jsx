import { useState } from 'react';
import { putJson } from '../../api/fetchClient';
import { activeLocalLlm } from '../../utils/localLlm.js';
import {
  WATERMARK_ENGINES, normalizeEngine, watermarkEngineStatus, withVisionModel,
} from '../../utils/watermarkEngine.js';
import VisionModelPicker from './VisionModelPicker.jsx';
import { Select } from '../common/Controls.jsx';

/* The saved engine is shared by both scan dialogs. A missing detector shows a fallback warning. */
export default function WatermarkEngineChoice({ caps = {}, disabled = false, onChanged }) {
  const [value, setValue] = useState(() => normalizeEngine(caps.watermark_detect_backend));
  const [saving, setSaving] = useState(false);
  // Keep the engine tooltip in sync with the selected vision model.
  const [visionModel, setVisionModel] = useState('');
  const capsView = visionModel
    ? withVisionModel(caps, activeLocalLlm(caps).provider, visionModel) : caps;
  const status = watermarkEngineStatus(value, capsView);

  const save = async (next) => {
    const engine = normalizeEngine(next);
    setValue(engine);
    setSaving(true);
    try {
      await putJson('/api/settings', { config: { watermark_detect: { backend: engine } } });
      onChanged?.(engine);
    } catch { /* the scan still uses the stored value; the select shows intent */ }
    setSaving(false);
  };

  return (
    <div className="text-xs text-content-subtle">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-content" title="Shared by Bank and Dataset.">Detection Engine</span>
        <Select size="sm" value={value} disabled={disabled || saving}
          aria-label="Watermark detection engine"
          title={status.warn ? undefined : status.line}
          onChange={(e) => save(e.target.value)}
          className="min-w-0 max-w-full">
          {WATERMARK_ENGINES.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </Select>
      </div>
      {status.warn && <p className="m-0 mt-1 text-amber-300">{status.line}</p>}
      {status.runs === 'vision' && (
        <VisionModelPicker caps={capsView} disabled={disabled} onModel={setVisionModel} />
      )}
    </div>
  );
}
