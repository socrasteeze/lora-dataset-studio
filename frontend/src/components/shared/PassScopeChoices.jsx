import { useId } from 'react';
import { PASS_SCOPE_OPTIONS, passScopeLineLabel } from '../bank/bankPassScope.js';

/** Shared status and selection choices for Bank and Dataset passes. */
export default function PassScopeChoices({
  payload, passId, scope, redo = false, onScope,
  selectionSize = 0, selection = { ok: true }, useSelection, onUseSelection,
  rows = PASS_SCOPE_OPTIONS, disabled = false,
}) {
  const name = useId();
  const selected = selectionSize > 0 && selection.ok && useSelection;
  return <>
    {selectionSize > 0 && (
      <label className={`flex min-h-10 items-start gap-2 rounded-md border border-border p-2 text-sm ${selection.ok ? 'bg-surface-raised' : 'opacity-70'}`}>
        <input type="radio" name={name} className="mt-1" checked={!!selected}
          disabled={disabled || !selection.ok} onChange={() => onUseSelection(true)} />
        <span className="min-w-0">
          <span className="font-medium text-content">Your selection — up to {selectionSize} image(s)</span>
          {selection.ok ? (
            <span className="block text-2xs leading-snug text-content-subtle">
              The pass narrows this selection by its status scope and remaining work.
            </span>
          ) : <span className="mt-0.5 block text-2xs leading-snug text-amber-300/90">{selection.reason}</span>}
        </span>
      </label>
    )}
    {rows.map((row) => (
      <label key={row.id || 'default'}
        className={`flex min-h-10 items-start gap-2 rounded-md border border-border p-2 text-sm ${row.ok !== false ? 'bg-surface-raised' : 'opacity-70'}`}>
        <input type="radio" name={name} className="mt-1" checked={!selected && scope === row.id}
          disabled={disabled || row.ok === false}
          onChange={() => { onUseSelection(false); onScope(row.id); }} />
        <span className="min-w-0">
          <span className="font-medium text-content">{passScopeLineLabel(payload, passId, row.id, redo)}</span>
          <span className={`block text-2xs leading-snug ${row.ok !== false ? 'text-content-subtle' : 'text-amber-300/90'}`}>
            {row.ok !== false ? row.hint : row.reason}
          </span>
        </span>
      </label>
    ))}
  </>;
}
