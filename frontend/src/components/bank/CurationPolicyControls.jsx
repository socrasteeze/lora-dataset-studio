import { targetRows } from './curationPolicy.js'

const inputClass = 'min-h-10 w-full min-w-0 rounded-md border border-border bg-surface px-2 py-1 text-sm text-content lg:min-h-0 lg:h-8'
const buttonClass = 'min-h-10 rounded-md border border-border px-2 py-1 text-xs text-content hover:bg-surface-raised disabled:opacity-50 lg:min-h-0 lg:h-8'

export default function CurationPolicyControls({ policy, onChange, metadata, selected,
  mode, result, disabled = false }) {
  const update = (patch) => onChange({ ...policy, ...patch })
  const selectedIds = [...selected]
  const limits = metadata?.limits
  const axes = (metadata?.axes || []).filter((axis) => policy.kind === 'character'
    || axis.id !== 'framing+person')
  return (
    <details className="min-w-0 whitespace-normal break-words border-t border-border pt-2">
      <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold text-content lg:min-h-0">Selection Policy</summary>
      <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="sr-only">Selection Policy</legend>
      <label className="block space-y-1 text-xs text-content">
        <span>LoRA Kind</span>
        <select aria-label="LoRA Kind" className={inputClass} value={policy.kind}
          onChange={(event) => onChange({ ...policy, kind: event.target.value, resetKind: true })}>
          {(metadata?.kinds || []).map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
        </select>
      </label>
      <p className="text-2xs leading-snug text-content-muted">
        {policy.kind === 'character' ? 'Preserve the character. Cover views, expressions, outfits and settings.'
          : policy.kind === 'concept' ? 'Preserve the concept. Cover views, lighting and settings.'
            : 'Cover subjects, compositions and settings within the intended style. Face identity does not control selection.'}
      </p>
      <p className="text-2xs leading-snug text-content-muted">Choose the intended character, concept or style with filters and references. The kind does not identify it automatically.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={buttonClass}
          disabled={!selectedIds.length || selectedIds.length > (limits?.references || 16)}
          onClick={() => update({ reference_ids: selectedIds })}>Use References</button>
        <button type="button" className={buttonClass} disabled={!policy.reference_ids.length}
          onClick={() => update({ reference_ids: [] })}>Clear References</button>
      </div>
      <p className="text-2xs text-content-muted">{policy.reference_ids.length} references. Select up to {limits?.references || 16} images in the grid, then use them here.</p>
      {policy.kind === 'character' && (
        <label className="block space-y-1 text-xs text-content">
          <span>Reference Match</span>
          <select aria-label="Reference Match" className={inputClass} value={policy.match} onChange={(event) => update({ match: event.target.value, min_similarity: '' })}>
            <option value="image">Whole Image</option><option value="face">Face Similarity</option>
          </select>
        </label>
      )}
      {policy.match === 'face' && <p className="text-2xs leading-snug text-content-muted">
        Uses the face recorded by Group by Person. Run that pass first. Drawings and missing faces need manual review. This is not an identity verdict.
      </p>}
      <label className="block space-y-1 text-xs text-content">
        <span>Minimum Similarity</span>
        <input className={inputClass} type="number" min={-1} max={1} step={0.01}
          placeholder="No Minimum" value={policy.min_similarity}
          onChange={(event) => update({ min_similarity: event.target.value })} />
      </label>
      <p className="text-2xs leading-snug text-content-muted">Optional. Requires references. Higher values return fewer matches. Review this setting after an engine change.</p>
      <label className="flex min-h-10 items-center gap-2 text-xs text-content lg:min-h-0">
        <input type="checkbox" checked={policy.prefer_quality}
          onChange={(event) => update({ prefer_quality: event.target.checked })} />Prefer Quality
      </label>
      <p className="text-2xs leading-snug text-content-muted">Measured technical flags lower priority. Missing measurements stay unknown. Aesthetic and anatomy are not quality verdicts.</p>
      <label className="block space-y-1 text-xs text-content">
        <span>Duplicate Limit</span>
        <input className={inputClass} type="number" min={0} max={limits?.duplicate_limit || 20}
          value={policy.duplicate_limit} onChange={(event) => update({ duplicate_limit: Number(event.target.value) })} />
      </label>
      <p className="text-2xs leading-snug text-content-muted">Maximum picks per measured duplicate group. Zero disables the limit. Distinct-image decisions and pinned picks take priority.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={buttonClass} disabled={!selectedIds.length || selectedIds.length > (limits?.pins || 2000)}
          onClick={() => update({ locked_ids: selectedIds })}>Pin Selected</button>
        <button type="button" className={buttonClass} disabled={!policy.locked_ids.length}
          onClick={() => update({ locked_ids: [] })}>Clear Pins</button>
      </div>
      <p className="text-2xs leading-snug text-content-muted">{policy.locked_ids.length} pinned. Pins stay inside the current filter. They can override the match cutoff, target weights and duplicate limit.</p>
      {mode === 'balanced' && <>
        <label className="block space-y-1 text-xs text-content">
          <span>Balance Axis</span>
          <select aria-label="Balance Axis" className={inputClass} value={policy.axis}
            onChange={(event) => update({ axis: event.target.value, weights: {} })}>
            {axes.map((axis) => <option key={axis.id} value={axis.id}>{axis.label}</option>)}
          </select>
        </label>
        <details className="min-w-0">
          <summary className="min-h-10 cursor-pointer py-2 text-xs text-content lg:min-h-0">Target Weights</summary>
          <p className="mb-2 text-2xs text-content-muted">Relative weights, not optimal training ratios. Zero excludes a bucket unless an image is pinned.</p>
          <div className="grid grid-cols-2 gap-2">
            {targetRows(policy, metadata, result).map((row) => <label key={row.key} className="min-w-0 space-y-1 text-xs text-content">
              <span className="block break-words">{row.label}</span>
              <input type="number" min={0} max={100} step={0.5} className={inputClass}
                value={row.weight} onChange={(event) => update({ weights: { ...policy.weights, [row.key]: Number(event.target.value) } })} />
            </label>)}
          </div>
        </details>
      </>}
      </fieldset>
    </details>
  )
}
