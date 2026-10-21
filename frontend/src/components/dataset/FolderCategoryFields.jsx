import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/fetchClient'
import { HelpBadge } from '../../help/HelpMode'
import { FOLDER_CATEGORIES, folderPathPreview } from '../common/folderNaming.js'

export default function FolderCategoryFields({ name, category, onChange, onReady, disabled = false }) {
  const [destination, setDestination] = useState({ loading: true, root: null, error: null })
  useEffect(() => {
    let live = true
    onReady?.(false)
    apiFetch('/api/dataset/creation-options').then((data) => {
      if (!live) return
      setDestination({ loading: false, root: data.root, error: null })
      onReady?.(true)
    }).catch((error) => {
      if (!live) return
      setDestination({ loading: false, root: null, error: error.message || 'Could not check the destination.' })
    })
    return () => { live = false }
  }, [onReady])
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1 text-sm text-content-muted">
        Folder Category <HelpBadge topic="dataset-folder-category" />
      </div>
      <label className="flex flex-col gap-1 text-sm text-content-muted"><span className="sr-only">Folder Category</span>
        <select value={category} onChange={(event) => onChange(event.target.value)} disabled={disabled}
          className="min-h-10 w-full rounded border border-border bg-surface-raised px-2 text-sm text-content">
          {FOLDER_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {destination.loading && <p className="text-xs text-content-subtle">Checking destination...</p>}
      {destination.error && <p role="alert" className="text-xs text-rose-300">{destination.error}</p>}
      {destination.root && <>
        <p className="break-all font-mono text-xs text-content-muted">{folderPathPreview(destination.root, name, category, 'LDS')}</p>
        <p className="text-xs text-content-subtle">The number is assigned on creation. The folder name stays fixed.</p>
      </>}
      {!destination.loading && !destination.error && !destination.root &&
        <p className="text-xs text-content-subtle">Uses the existing storage settings. No installation destination is configured.</p>}
    </div>
  )
}
