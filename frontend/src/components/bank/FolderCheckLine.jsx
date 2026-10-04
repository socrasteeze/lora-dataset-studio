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
 * Freshness stays on the button title. The host can hide the short stale
 * notice on mobile to keep the toolbar compact. */
export default function FolderCheckLine({ banks, busy = false, onRescan, className = '', noticeClassName = '' }) {
  const note = folderCheckNote(banks)
  if (!note) return null
  return (
    <>
      {note.stale ? (
        <>
          <p className={`text-xs font-medium text-amber-300/90 ${noticeClassName}`} title={note.text}
            aria-label={note.text}>Counts May Be Stale</p>
          <Button size="md" noShrink onClick={onRescan} disabled={busy}
            title={note.text} className={className}>
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{busy ? 'Checking Folders' : 'Rescan Folders'}
          </Button>
        </>
      ) : (
        <Button size="md" noShrink onClick={onRescan} disabled={busy} title={note.text} className={className}>
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{busy ? 'Checking Folders' : 'Rescan Folders'}
        </Button>
      )}
    </>
  )
}
