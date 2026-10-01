import { LayoutGrid } from 'lucide-react';
import { Chip } from '../common/Controls.jsx';
/**
 * Discreet segmented S/M/L control, not a slider (mouse-fragile, no useful
 * granularity for 3 steps). Shared by the workspace image grid (DatasetGrid)
 * and the Datasets library (DatasetListPanel) — callers pass their own
 * context-specific `titles` so the tooltips explain what each step is FOR.
 */
export default function TileSizeControl({ size, onChange, titles, className = '' }) {
  return (
    <div role="group" aria-label="Thumbnail size" className={`flex items-center gap-1 shrink-0 ${className}`}>
      <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5 text-content-subtle" />
      {['S', 'M', 'L'].map((s) => (
        <Chip key={s} size="md" pressed={size === s} onClick={() => onChange(s)}
          title={titles[s]}
          aria-label={`${titles[s]}${size === s ? ' (active)' : ''}`}>
          {s}
        </Chip>
      ))}
    </div>
  );
}
