import { useId } from 'react';
import { HelpBadge } from '../../help/HelpMode';

export const DEFAULT_CROP_CONFIDENCE_PERCENT = 90;

export function validCropConfidence(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 100;
}

export default function AutoCropOptions({ enabled, onEnabledChange, confidence,
  onConfidenceChange, disabled = false, note = '' }) {
  const id = useId();
  return <div className="min-w-0 space-y-2 rounded-lg border border-border p-2">
    {onEnabledChange && <div className="flex items-center gap-2">
      <label className="flex min-h-10 flex-1 items-center gap-2 text-sm text-content">
        <input type="checkbox" checked={enabled} disabled={disabled}
          onChange={(event) => onEnabledChange(event.target.checked)} />
        Auto-Crop
      </label>
      <HelpBadge topic="auto-crop-framing" />
    </div>}
    <label htmlFor={id} className="flex min-h-10 flex-wrap items-center gap-2 text-sm text-content">
      <span className="min-w-0 flex-1">Minimum Confidence</span>
      <input id={id} type="number" min="0" max="100" step="any" value={confidence}
        disabled={disabled || !enabled} onChange={(event) => onConfidenceChange(event.target.value)}
        className="min-h-10 w-20 rounded border border-border bg-surface px-2 text-base text-content" />
      <span>%</span>
    </label>
    {enabled && !validCropConfidence(confidence) && <p role="alert" className="m-0 text-xs text-danger">
      Enter a confidence greater than 0 and at most 100%.
    </p>}
    {enabled && <p className="m-0 text-xs text-content-muted">
      {note && <>{note}{' '}</>}Only scores at or above this minimum allow a crop. Model confidence is uncalibrated.
    </p>}
  </div>;
}
