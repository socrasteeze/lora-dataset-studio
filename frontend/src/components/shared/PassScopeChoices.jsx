import { useId } from 'react';
import { PASS_SCOPE_OPTIONS, passScopeLineLabel } from '../bank/bankPassScope.js';

/** Shared status and selection choices for Bank and Dataset passes. */
export default function PassScopeChoices({
  payload, passId, scope, redo = false, onScope,
  selectionSize = 0, selection = { ok: true }, useSelection, onUseSelection,
  rows = PASS_SCOPE_OPTIONS, disabled = false, columns = '',
}) {
  const name = useId();
  const selected = selectionSize > 0 && selection.ok && useSelection;
  if (selectionSize === 0 && rows.length === 0) return null;

  return <div className={`grid gap-2 ${columns}`}>
    {selectionSize > 0 && (
      <label title={selection.ok ? 'Only eligible images in the selection will run.' : selection.reason}
        className={`flex min-h-10 items-center gap-2 rounded-md border border-border p-2 text-sm ${selection.ok ? 'bg-surface-raised' : 'opacity-70'}`}>
        <input type="radio" name={name} checked={!!selected}
          disabled={disabled || !selection.ok} onChange={() => onUseSelection(true)} />
        <span className="min-w-0 font-medium text-content">Your selection · up to {selectionSize}</span>
      </label>
    )}
    {rows.map((row) => (
      <label key={row.id || 'default'} title={row.ok === false ? row.reason : undefined}
        className={`flex min-h-10 items-center gap-2 rounded-md border border-border p-2 text-sm ${row.ok !== false ? 'bg-surface-raised' : 'opacity-70'}`}>
        <input type="radio" name={name} checked={!selected && scope === row.id}
          disabled={disabled || row.ok === false}
          onChange={() => { onUseSelection(false); onScope(row.id); }} />
        <span className="min-w-0 font-medium text-content">{passScopeLineLabel(payload, passId, row.id, redo)}</span>
      </label>
    ))}
  </div>;
}
