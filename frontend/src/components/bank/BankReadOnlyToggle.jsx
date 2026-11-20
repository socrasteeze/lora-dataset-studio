import { HelpBadge } from '../../help/HelpMode'
import { Button } from '../common/Controls.jsx'

/** An on/off button, the same pressed look as the import form's Subfolders. */
export default function BankReadOnlyToggle({
  checked, onChange, disabled = false, size = 'md', className = '', compact = false,
}) {
  return (
    <div className={`flex shrink-0 items-center gap-1 ${className}`}>
      <Button size={size} aria-pressed={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        title="Protect source files from deletion and new imports. Triage, captions, edits to working copies and promotion still work."
        className={`${compact ? 'w-full !px-1' : ''} ${checked ? 'border-primary/60 bg-primary/15 text-content' : ''}`}>
        {compact ? 'Read-Only' : 'Read-only Source'}
      </Button>
      {!compact && <HelpBadge topic="bank-read-only" />}
    </div>
  )
}
