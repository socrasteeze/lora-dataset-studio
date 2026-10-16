import { curationSummary } from './curationPolicy.js'

export default function CurationSelectionReport({ result, onDismiss, onReviewUnknown }) {
  if (!result) return null
  return (
    <section aria-label="Selection Report" aria-live="polite"
      className="mt-2 min-w-0 space-y-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-content">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words">{curationSummary(result)}</p>
        <button type="button" className="min-h-10 shrink-0 rounded-md border border-border px-2 lg:min-h-0 lg:h-8"
          onClick={onDismiss}>Dismiss</button>
      </div>
      <p className="text-content-muted">Selection only. Image status and source files stay unchanged.</p>
      {result.shortfall > 0 && <p className="text-amber-300">{result.shortfall} slots remain empty after the current constraints.</p>}
      <p className="text-content-muted">{result.duplicate_omitted} duplicate candidates omitted. {result.below_minimum} below the match cutoff. {result.quality_unknown} without quality measurements.</p>
      {result.missing_locked > 0 && <p className="text-amber-300">{result.missing_locked} pins were unavailable in this filtered, indexed pool.</p>}
      {result.unknown_match_count > 0 && <div className="space-y-1">
        <p className="text-amber-300">{result.unknown_match_count} images have no usable face match. They are unmeasured, not wrong identities.</p>
        <button type="button" className="min-h-10 rounded-md border border-border px-2 lg:min-h-0 lg:h-8"
          onClick={() => onReviewUnknown(result.unknown_match_ids)}>Review Unmeasured</button>
        {result.unknown_match_count > result.unknown_match_ids.length && <p>Review shows the first {result.unknown_match_ids.length} images. Narrow the filter for the remainder.</p>}
      </div>}
      {!!result.buckets?.length && <details open>
        <summary className="min-h-10 cursor-pointer py-2 lg:min-h-0">Target Coverage</summary>
        <ul className="space-y-1">
          {result.buckets.map((bucket) => <li key={bucket.key} className="break-words">
            {bucket.label.replaceAll('_', ' ')}: {bucket.selected} selected, {bucket.available} available, {bucket.fair_share} target
            {bucket.under_target ? '. Target not met after constraints.' : ''}
          </li>)}
        </ul>
      </details>}
      <details>
        <summary className="min-h-10 cursor-pointer py-2 lg:min-h-0">Other Coverage</summary>
        <p className="text-content-muted">Caption and tag mentions are hints. They can miss details or misread negation. Framing uses the measured labels.</p>
        <ul className="space-y-1">
          {result.coverage?.map((axis) => <li key={axis.axis} className="break-words">
            {axis.axis}: {Object.entries(axis.available).map(([key, count]) => `${key.replaceAll('_', ' ')} ${axis.selected[key] || 0} of ${count}`).join(', ') || 'No known labels'}
            {' · '}{axis.unknown} candidates unmeasured, {axis.unknown_selected} selected
          </li>)}
        </ul>
      </details>
      <details>
        <summary className="min-h-10 cursor-pointer py-2 lg:min-h-0">Selection Reasons</summary>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {result.results?.map((item) => <li key={item.id} className="break-words">
            #{item.id}: {item.reason}{item.similarity != null ? ` · match ${item.similarity}` : ''}
            {item.quality_factor < 1 ? ` · quality factor ${item.quality_factor}` : ''}
            {item.flags?.length ? ` · ${item.flags.join(', ')}` : ''}
          </li>)}
        </ul>
      </details>
    </section>
  )
}
