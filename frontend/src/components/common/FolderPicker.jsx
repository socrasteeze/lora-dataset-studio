import { useCallback, useEffect, useRef, useState } from 'react'
import { Folder, FolderOpen } from 'lucide-react';
import { apiFetch } from '../../api/fetchClient'
import { Button, Input } from './Controls.jsx'
import { attemptModalSubmit } from '../../utils/submitOutcome.js'
import { useFocusTrap } from '../../hooks/useFocusTrap.js'

/** Read-only in-app folder browser (drives → subfolders).
 * Nothing is written; only directories are listed.
 *
 * `onPick(path)` MUST answer {ok:true} or {ok:false, error} (or throw). It used
 * to be fired unawaited and followed by an unconditional onClose(), so a refused
 * folder import ("no images in that folder", another dataset job running) closed
 * the browser and threw away both the chosen path and the position in the tree.
 * A host that genuinely cannot fail says so explicitly (see FolderPickerField):
 * silence is not a success. */
export function FolderBrowserModal({ initial, onPick, onClose }) {
  // What the user is TYPING, kept apart from `data.path` (where the browser
  // actually is): a half-typed path must not be mistaken for the current folder,
  // and "Use this folder" must keep committing what is on screen, not the draft.
  const [typed, setTyped] = useState(initial || '')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  // Two different failures, two different boxes: `browseError` is "I could not
  // LIST that folder" (amber, informational, the list falls back to the drives);
  // `error` is "the host REFUSED the folder you picked" (red, blocking, keeps
  // you exactly where you are so you can pick another one).
  const [browseError, setBrowseError] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const dialogRef = useRef(null)
  const listingRequest = useRef(0)
  useFocusTrap(dialogRef)

  useEffect(() => {
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      listingRequest.current += 1
      document.body.style.overflow = overflow
    }
  }, [])

  /* ONE way out, shut only while the pick is being posted. */
  const dismiss = () => { if (!busy) onClose() }
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])  // eslint-disable-line react-hooks/exhaustive-deps

  const use = async () => {
    if (busy || !data?.path) return
    setBusy(true)
    setError('')
    let outcome
    try {
      outcome = await attemptModalSubmit(() => onPick(data.path),
        { fallback: 'That folder was refused' })
    } finally { setBusy(false) }
    if (outcome.close) onClose()
    else setError(outcome.error)
  }

  const load = useCallback(async (p) => {
    const requestId = ++listingRequest.current
    setLoading(true); setBrowseError('')
    try {
      const q = p ? `?path=${encodeURIComponent(p)}` : ''
      const d = await apiFetch(`/api/system/list-folders${q}`)
      if (requestId !== listingRequest.current) return
      setData(d)
      setQuery('')
      setError('')
      // Follow the browser: after a click, an Up, or a successful jump, the box
      // shows where you ARE, so the next paste replaces a real path.
      setTyped(d.path || '')
    } catch (e) {
      if (requestId !== listingRequest.current) return
      // Keep the last valid folder. Drives stays available even when the
      // initial path is missing or the server account cannot read it.
      setBrowseError(e?.message || 'Could not open that folder.')
    } finally {
      if (requestId === listingRequest.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load(initial || null) }, [load, initial])

  const entries = (data?.entries || []).filter((entry) =>
    entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const atRoot = !data || data.is_root

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Choose a folder"
      data-probe-chrome="folder-browser" data-probe-layer
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss() }}>
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-border bg-surface-overlay p-5 shadow-2xl [@media(max-height:500px)]:p-3"
        style={{ maxHeight: '90dvh' }}>
        <h2 className="flex items-center gap-2 text-base font-bold text-content"><Folder aria-hidden="true" className="h-4 w-4" /> Choose Folder</h2>
        <p className="mt-1 text-xs text-content-muted [@media(max-height:500px)]:hidden">
          Browse drives and folders on the LDS host. Access uses the host account's permissions.
        </p>

        {/* An address bar, for the same reason the native dialog needed one: the
            path is very often already on the clipboard (someone sent it, or it
            was copied out of Explorer), and clicking down to it folder by folder
            is pure friction. This is also the ONLY way to paste a path on the
            lanes that never get a native dialog at all — LAN, tablet, Linux —
            where this browser is the whole picker. Enter jumps; a path that does
            not exist reports itself in the amber box and leaves you put. */}
        <form className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); const v = typed.trim(); if (v) load(v) }}>
          <div className="flex w-full gap-2 sm:contents">
          <button type="button" onClick={() => load(null)} disabled={busy || loading}
            className="min-h-11 w-16 shrink-0 rounded-md border border-border px-2 text-xs text-content hover:bg-surface-raised disabled:opacity-40">
            Drives
          </button>
          <button type="button" onClick={() => load(atRoot ? null : (data?.parent ?? null))}
            disabled={busy || loading || atRoot}
            className="min-h-11 w-16 shrink-0 rounded-md border border-border px-2 py-1 text-xs text-content hover:bg-surface-raised disabled:opacity-40">
            ⬆ Up
          </button>
          </div>
          <input
            aria-label="Folder path"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={data?.path || 'Paste or type a path'}
            spellCheck={false}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-content placeholder:text-content-subtle" />
          <button type="submit" disabled={busy || loading || !typed.trim()}
            className="min-h-11 w-16 shrink-0 rounded-md border border-border px-2 py-1 text-xs text-content hover:bg-surface-raised disabled:opacity-40">
            Go
          </button>
        </form>

        {browseError && <p role="alert" className="mt-2 text-xs text-amber-300">{browseError}</p>}
        <input aria-label="Filter folders" placeholder="Filter folders" value={query}
          disabled={busy || loading} onChange={(e) => setQuery(e.target.value)}
          className="mt-2 min-h-11 w-full shrink-0 rounded-md border border-border bg-surface-raised px-3 text-sm text-content" />

        <ul aria-busy={loading} className="mt-2 min-h-0 grow overflow-y-auto rounded-md border border-border bg-surface-raised">
          {loading ? (
            <li className="px-3 py-2 text-xs text-content-muted">Loading…</li>
          ) : entries.length === 0 ? (
            <li className="px-3 py-2 text-xs text-content-muted">{query ? 'No matching folders.' : 'No folders available.'}</li>
          ) : entries.map((e) => (
            <li key={e.path}>
              <button type="button" onClick={() => load(e.path)} disabled={busy}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-content hover:bg-surface disabled:opacity-40">
                <Folder aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="min-w-0 truncate">{e.name}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* shrink-0 so the list above (grow + overflow) gives up the room instead
            of squashing this to a clipped sliver; max-h-24 so a long refusal
            cannot push "Use this folder" off a 400-px screen. */}
        {error && (
          <div role="alert"
            className="mt-2 shrink-0 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 max-h-24 overflow-y-auto">
            <span className="block whitespace-pre-wrap break-words text-xs leading-relaxed text-red-200">
              {error}
            </span>
            <span className="mt-1 block text-2xs text-content-subtle">
              You are still where you were — pick another folder and try again.
            </span>
          </div>
        )}

        <div className="mt-4 grid shrink-0 grid-cols-2 gap-2">
          <button type="button" onClick={dismiss} disabled={busy}
            className="min-h-11 rounded-md border border-border px-3 py-1.5 text-sm text-content hover:bg-surface-raised disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={busy || atRoot || loading} onClick={use}
            className="min-h-11 rounded-md bg-gradient-primary px-4 py-1.5 text-sm font-semibold text-gray-950 disabled:opacity-50">
            {busy ? 'Using…' : 'Use Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A path text field with a Browse button. The field stays editable (pasting a
 * path still works); Browse opens the in-app folder browser on the machine
 * running the app. Reused by the Image bank, the video bank, and Move folder. */
export default function FolderPickerField({
  id, label, value, onChange, placeholder, required, hint,
}) {
  const [browsing, setBrowsing] = useState(false)

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-content">{label}</label>
      )}
      <div className="mt-1 flex items-stretch gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} required={required}
          className="w-full min-w-0 grow font-mono" />
        <Button noShrink onClick={() => setBrowsing(true)}>
          <FolderOpen aria-hidden="true" className="h-4 w-4" /> Browse</Button>
      </div>
      {hint && <p className="mt-1 text-xs text-content-muted">{hint}</p>}
      {browsing && (
        /* This host only writes the path into the field above — nothing can
           refuse it — but it says {ok:true} out loud rather than returning
           nothing: the browser treats silence as "no answer", on purpose. */
        <FolderBrowserModal initial={value || null}
          onPick={(p) => { onChange(p); return { ok: true } }}
          onClose={() => setBrowsing(false)} />
      )}
    </div>
  )
}
