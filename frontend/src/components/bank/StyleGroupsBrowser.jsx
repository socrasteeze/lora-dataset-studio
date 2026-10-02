import { useEffect, useMemo, useRef, useState } from 'react'
import { Palette } from 'lucide-react'
import { apiFetch } from '../../api/fetchClient'
import { sortStyleGroups, SMALL_STYLE_GROUP } from './styleGroups.js'
import { IconButton, Select } from '../common/Controls.jsx'

/**
 * Every 🎨 style group of a bank as a grid of preview mosaics. The rail's strip
 * stops at the 40 biggest, and a k-means Score pass makes hundreds — this is
 * where the rest are reachable. Picking one filters the bank to it, exactly
 * like a strip tile.
 */
export default function StyleGroupsBrowser({ bankId, activeStyle, onPick, onClose }) {
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('size')
  const [hideSmall, setHideSmall] = useState(true)
  const dialogRef = useRef(null)

  useEffect(() => {
    let live = true
    apiFetch(`/api/bank/${bankId}/style-groups`)
      .then((d) => { if (live) setGroups(d.groups || []) })
      .catch((e) => { if (live) setError(e?.message || 'Could not load the style groups.') })
    return () => { live = false }
  }, [bankId])

  useEffect(() => {
    const keydown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', keydown)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', keydown)
  }, [onClose])

  const shown = useMemo(
    () => sortStyleGroups(groups || [], sort, hideSmall ? SMALL_STYLE_GROUP : 0),
    [groups, sort, hideSmall])
  const hidden = (groups?.length || 0) - shown.length

  return (
    <div data-probe-layer
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true"
        aria-labelledby="style-groups-title" data-probe-chrome="style-groups" data-probe-layer
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-2xl outline-none">
        <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <h2 id="style-groups-title" className="mr-auto text-base font-semibold text-content">
            Style groups{groups ? ` (${groups.length})` : ''}
          </h2>
          <Select size="md" value={sort} onChange={(e) => setSort(e.target.value)}
            aria-label="Sort style groups">
            <option value="size">Largest first</option>
            <option value="aesthetic">Best aesthetic first</option>
            <option value="small">Smallest first</option>
          </Select>
          <label className="flex h-10 min-h-10 items-center gap-1 text-sm text-content-muted lg:h-8 lg:min-h-0">
            <input type="checkbox" checked={hideSmall} onChange={(e) => setHideSmall(e.target.checked)} />
            Hide under {SMALL_STYLE_GROUP} images
          </label>
          <IconButton type="button" size="md" onClick={onClose} label="Close style groups">
            ✕
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && <p className="text-sm text-red-300">{error}</p>}
          {!error && !groups && <p className="text-sm text-content-muted">Loading style groups</p>}
          {groups && groups.length === 0 && (
            <p className="text-sm text-content-muted">No style groups yet. Run ✨ Score to make them.</p>
          )}
          {hidden > 0 && (
            <p className="mb-2 text-xs text-content-subtle">
              {hidden} group(s) under {SMALL_STYLE_GROUP} images hidden.
            </p>
          )}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {shown.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => { onPick(g.id); onClose() }}
                  aria-pressed={activeStyle === g.id}
                  title={`Show style group #${g.id} (${g.size} image(s))`}
                  className={`block w-full overflow-hidden rounded-lg border text-left ${activeStyle === g.id
                    ? 'border-fuchsia-400 ring-2 ring-fuchsia-400' : 'border-border hover:border-content-muted'}`}>
                  <span className="grid aspect-square grid-cols-2 grid-rows-2 gap-px bg-border">
                    {[0, 1, 2, 3].map((k) => (g.preview_ids[k] != null ? (
                      <img key={k} src={`/api/bank/${bankId}/thumb/${g.preview_ids[k]}`} alt=""
                        loading="lazy" className="h-full w-full object-cover" />
                    ) : <span key={k} className="bg-surface" />))}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1 text-2xs text-content-muted">
                    <Palette aria-hidden="true" className="h-3 w-3 shrink-0" />
                    <span className="font-semibold text-content">{g.id}</span>
                    <span>· {g.size - g.rejected}</span>
                    {g.aesthetic != null && <span className="ml-auto">★ {g.aesthetic.toFixed(1)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
