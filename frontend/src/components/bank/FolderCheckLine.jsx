import { folderCheckNote } from './bankSync'
import { RefreshCw } from 'lucide-react';
import { Button } from '../common/Controls.jsx'

/** 🗃️ Bank list — how fresh these cards are, and the one click that refreshes them.
 *
 * The list used to re-walk every bank's source folder before rendering: a full
 * inventory of the whole library paid on every navigation to a page people
 * often only pass through (690-1 190 ms on a real 8-bank / 86 493-image
 * library). It no longer does — a folder is re-checked when its bank is OPENED,
 * or from here.
 *
 * That trade is only acceptable because this line exists. A list that is
 * silently late is worse than a list that is slow: the user would read counts
 * as facts. So the page says what it knows and offers the walk, instead of
 * doing it behind their back on every visit.
 *
 * Freshness stays on the button title. When counts may lag, Rescan Folders
 * itself turns amber so the toolbar stays compact. */
export default function FolderCheckLine({ banks, busy = false, onRescan, className = '' }) {
  const note = folderCheckNote(banks)
  if (!note) return null
  const staleClass = note.stale
    ? 'border-amber-400/60 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
    : ''
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button size="md" noShrink onClick={onRescan} disabled={busy}
        title={note.text} className={`${className} ${staleClass}`.trim()}>
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{busy ? 'Checking Folders' : 'Rescan Folders'}
      </Button>
    </div>
  )
}
