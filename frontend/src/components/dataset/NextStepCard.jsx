import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { btnClass } from '../common/controls';

const LS_KEY = 'guidedCardCollapsed';

export default function NextStepCard({ step, busy, totalImages, onAction, actionLabel }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(LS_KEY) === '1');
  const forceOpen = totalImages === 0;
  const open = forceOpen || !collapsed;
  useEffect(() => { if (!forceOpen) localStorage.setItem(LS_KEY, collapsed ? '1' : '0'); },
    [collapsed, forceOpen]);
  if (!step) return null;

  return (
    <div role="status" className="rounded-lg border border-border bg-surface-raised px-3 py-2 lg:px-4 lg:py-3">
      <div className="flex items-center gap-2">
        <Lightbulb aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-content text-sm font-semibold lg:text-base">Next step: {step.label}</span>
        {!forceOpen && (
          <button type="button" onClick={() => setCollapsed((v) => !v)} aria-expanded={open}
            className={`${btnClass({ size: 'sm', variant: 'ghost' })} ml-auto min-w-10 lg:min-w-0`}
            title={open ? 'Collapse the guide' : 'Expand the guide'}>
            <span aria-hidden>{open ? '▾' : '▸'}</span>
            <span className="sr-only">{open ? 'Collapse' : 'Expand'} next-step guide</span>
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1 flex">
          <button type="button" onClick={onAction} disabled={busy}
            className={`${btnClass({ variant: 'primary' })} w-full lg:ml-auto lg:w-auto`}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
