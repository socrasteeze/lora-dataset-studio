import { HelpBadge } from '../../help/HelpMode'
import { Button } from '../common/Controls.jsx'

/** An on/off button, the same pressed look as the import form's Subfolders. */
export default function BankReadOnlyToggle({ checked, onChange, disabled = false }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button size="md" aria-pressed={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        title="Protect source files from deletion and new imports. Triage, captions, edits to working copies and promotion still work."
        className={checked ? 'border-primary/60 bg-primary/15 text-content' : ''}>
        Read-only Source
      </Button>
      <HelpBadge topic="bank-read-only" />
    </div>
  )
}
