import { Link } from 'react-router';
import { useState } from 'react';
import { Ruler } from 'lucide-react';
import { HelpBadge } from '../../help/HelpMode';
import { classifyFramingState } from './classifyFramingGate';
import AutoCropOptions, { DEFAULT_CROP_CONFIDENCE_PERCENT, validCropConfidence } from './AutoCropOptions.jsx';
import PassScopeChoices from '../shared/PassScopeChoices.jsx';
import { DEFAULT_PASS_SCOPE, passBinWarning, passScopeCount } from '../bank/bankPassScope.js';
import { datasetFramingScope } from './datasetFramingScope.js';

/** 📐 Classify framing — sits right under the Composition bar, where the lack is
 * seen: imported without a shot type, or cropped since the last classify (crop
 * clears framing, same as the Bank). Auto-Crop remains available for image
 * files that already have a framing. */
export default function ClassifyFramingButton({
  images, selectedIds = [], ollama, capsLoading = false, busy = false, activity = null, onClassify, onStop,
}) {
  const [autoCrop, setAutoCrop] = useState(false);
  const [cropConfidence, setCropConfidence] = useState(DEFAULT_CROP_CONFIDENCE_PERCENT);
  const [scope, setScope] = useState(DEFAULT_PASS_SCOPE);
  const [useSelection, setUseSelection] = useState(true);
  const s = classifyFramingState({ images, ollama, capsLoading, busy, activity });
  const total = Array.isArray(images) ? images.filter((image) => image?.filename).length : 0;
  const { payload, statuses, imageIds } = datasetFramingScope(images, selectedIds, scope);
  const selectionActive = useSelection && selectedIds.length > 0;
  const count = autoCrop ? (selectionActive ? imageIds.length : passScopeCount(payload, 'framing', scope, true)) : s.count;
  const binWarning = autoCrop && !selectionActive ? passBinWarning(scope) : '';
  if (!s.visible && !total) return null;

  return (
    <div id="ds-classify-framing" tabIndex={-1}
      className="lds-section scroll-mt-20 flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-workspace-focus
          onClick={() => onClassify?.(count, autoCrop
            ? { auto_crop: true, min_crop_confidence: Number(cropConfidence) / 100,
              ...(selectionActive ? { image_ids: imageIds } : statuses ? { statuses } : {}) } : undefined)}
          disabled={s.disabled || !count || (autoCrop && !validCropConfidence(cropConfidence))}
          title={autoCrop ? 'Classify images in this scope. Save crops when confidence meets the minimum.' : s.title}
          className="min-h-10 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-200 text-sm font-semibold disabled:opacity-40">
          <Ruler aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{s.running ? s.label : autoCrop ? `Classify & Crop (${count})` : s.label}
        </button>
        {s.running && onStop && <button type="button" onClick={onStop} disabled={activity?.cancelling}
          className="min-h-10 rounded-lg border border-border px-3 py-1.5 text-sm text-content disabled:opacity-40">
          {activity?.cancelling ? 'Stopping' : 'Stop Framing'}
        </button>}
        <HelpBadge topic="action-classify-framing" className="self-center" />
        {!s.running && !autoCrop && s.count > 0 && (
          <span className="text-content-subtle text-2xs min-w-0">
            no shot type yet — imported without one, or cropped since they were last classified
          </span>
        )}
      </div>
      <AutoCropOptions enabled={autoCrop} onEnabledChange={setAutoCrop}
        confidence={cropConfidence} onConfidenceChange={setCropConfidence} disabled={busy || s.running}
        note="Saves full-subject crops in this scope. Includes already-classified images." />
      {autoCrop && <fieldset className="space-y-2" disabled={busy || s.running}>
        <legend className="mb-2 text-xs font-semibold text-content">Scope</legend>
        <PassScopeChoices payload={payload} passId="framing" scope={scope} redo
          onScope={setScope} selectionSize={selectedIds.length}
          useSelection={useSelection} onUseSelection={setUseSelection} disabled={busy || s.running} />
        <p className="m-0 text-2xs text-content-subtle">Selections exclude rejected images. Choose a bin scope to include them.</p>
        {binWarning && <p role="note" className="m-0 text-2xs text-amber-300/90">{binWarning}</p>}
        {count === 0 && <p role="status" className="m-0 text-2xs text-content-subtle">No images in this scope. Choose another scope or change the selection.</p>}
      </fieldset>}
      {s.blocked && (
        <p className="m-0 text-amber-300/90 text-2xs">
          ⚠ {s.blockedReason}{' '}
          <Link to="/settings/local-tools" className="underline hover:text-amber-200">Open Local tools</Link>
        </p>
      )}
    </div>
  );
}
