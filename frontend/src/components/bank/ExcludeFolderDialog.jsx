import { useEffect, useState } from 'react'
import { apiFetch, putJson } from '../../api/fetchClient'
import { Button } from '../common/Controls.jsx'
import { ancestorExcluded, sortFolders, toggleExcluded } from './bankFolderExclude.js'

/** Exclude folder — hide nested folders from this open bank.
 *
 * Every directory that holds an image is listed, nested ones indented under
 * their parent. A tick means the folder is in the grid. Unticking it hides
 * that folder and everything inside it from curation. The files stay on disk
 * and the rows keep their decisions; ticking the folder again brings them
 * back. Images sitting in the bank's own folder have no row here. */
export default function ExcludeFolderDialog({ bankId, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    apiFetch(`/api/bank/${bankId}/folder-exclusions`)
      .then((d) => { if (live) setData(d) })
      .catch((e) => { if (live) setError(e?.message || 'Could not list the folders.') })
    return () => { live = false }
  }, [bankId])

  const save = async (next) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const d = await putJson(`/api/bank/${bankId}/folder-exclusions`, { excluded: next })
      setData(d)
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'Could not update the folders.')
    } finally {
      setBusy(false)
    }
  }

  const folders = sortFolders(data?.folders || [])
  const excluded = data?.excluded || []
  const rootImages = Number(data?.root_images) || 0

  return (
    <div role="dialog" aria-modal="true" aria-label="Exclude folder"
      data-probe-chrome="exclude-folders" data-probe-layer
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-xl border border-border bg-surface-overlay p-4 shadow-2xl sm:p-5">
        <h2 className="text-base font-bold text-content">Exclude folder</h2>
        <p className="text-sm text-content-muted">
          Uncheck a folder to hide it from this bank. The files stay on disk, and
          checking it again brings those images back with their decisions.
        </p>
        {error && (
          <p className="rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
        {!data && !error && (
          <p className="text-sm text-content-subtle">Loading folders</p>
        )}
        {data && folders.length === 0 && (
          <p className="text-sm text-content-muted">
            This bank has no nested folders.
          </p>
        )}
        {folders.length > 0 && (
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto" aria-label="Nested folders">
            {folders.map((folder) => {
              const ancestor = ancestorExcluded(folder.path, excluded)
              const disabled = busy || !!ancestor
              return (
                <li key={folder.path}>
                  <label
                    className="flex min-h-10 items-center gap-2 rounded-md px-1 text-sm text-content hover:bg-surface"
                    style={{ paddingLeft: `${folder.depth * 1.25}rem` }}
                    title={ancestor
                      ? `Hidden because ${ancestor} is excluded`
                      : `${folder.images} image${folder.images === 1 ? '' : 's'}`}>
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={!!folder.included && !ancestor}
                      disabled={disabled}
                      aria-label={folder.path}
                      onChange={(e) => save(toggleExcluded(folder.path, excluded, e.target.checked))}
                    />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <span className="shrink-0 tabular-nums text-xs text-content-subtle">
                      {folder.images}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {rootImages > 0 && (
          <p className="text-xs text-content-subtle">
            {rootImages} image{rootImages === 1 ? '' : 's'} in the bank folder stay visible.
            They are not inside a nested folder.
          </p>
        )}
        <div className="flex justify-end">
          <Button type="button" size="md" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
