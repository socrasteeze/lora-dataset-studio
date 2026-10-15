import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch, postJson } from '../../api/fetchClient'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { hasUnsavedWork, useUnsavedWork } from '../../hooks/useUnsavedWork'
import { bankSelectionKey, successfulBulkKeys } from '../bank/bankBulk.js'
import { createBankMoveBatch, runBankMoveBatch } from '../bank/bankProfileMove.js'
import { Button, Input } from './Controls.jsx'

function operationId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export default function ProfileDialog({ onClose, bank = null, banks = null, onMoved, onResults }) {
  const dialog = useRef(null)
  const operation = useRef(null)
  const batch = useRef(null)
  const submitting = useRef(false)
  const navigation = useRef({})
  const bulk = banks !== null
  const [moveBanks] = useState(() => (banks || []).map((row) => ({
    id: row.id, instance_id: row.instance_id, name: row.name,
  })))
  const [moveResults, setMoveResults] = useState([])
  const [progress, setProgress] = useState(null)
  const [targetLocked, setTargetLocked] = useState(false)
  const [networkUnknown, setNetworkUnknown] = useState(false)
  const [catalog, setCatalog] = useState(null)
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [destination, setDestination] = useState('')
  const moving = !!bank || bulk
  const succeeded = successfulBulkKeys(moveResults)
  const resultsByBank = new Map(moveResults.map((row) => [bankSelectionKey(row), row]))
  const remaining = moveBanks.filter((row) => !succeeded.has(bankSelectionKey(row)))
  navigation.current = { busy, networkUnknown, name }
  useFocusTrap(dialog)
  useUnsavedWork(!!name.trim() || busy === 'moving' || busy === 'creating' || networkUnknown)

  useEffect(() => {
    if (!bulk) return undefined
    const previousOverflow = document.body.style.overflow
    const entryUrl = window.location.href
    let restoring = false
    document.body.style.overflow = 'hidden'
    const guardNavigation = (event) => {
      if (restoring) return
      const state = navigation.current
      if (!submitting.current && !state.busy && !state.networkUnknown && !state.name.trim()) return
      event.preventDefault()
      event.stopImmediatePropagation()
      restoring = true
      history.pushState(null, '', entryUrl)
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
      setTimeout(() => { restoring = false }, 0)
    }
    window.addEventListener('popstate', guardNavigation, true)
    window.addEventListener('hashchange', guardNavigation, true)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('popstate', guardNavigation, true)
      window.removeEventListener('hashchange', guardNavigation, true)
    }
  }, [bulk])

  useEffect(() => {
    let live = true
    apiFetch('/api/profiles').then((value) => { if (live) setCatalog(value) })
      .catch((failure) => { if (live) setError(failure.message || 'Profiles are unavailable. Restart Studio.') })
    return () => { live = false }
  }, [])

  const close = () => {
    if (busy || submitting.current) return
    if (name.trim()) { setError('Create this profile or clear its name before closing.'); return }
    if (networkUnknown && !window.confirm('Close with an unresolved move? Keep this popup open to retry.')) return
    onClose()
  }

  const create = async (event) => {
    event.preventDefault()
    if (!name.trim() || busy || submitting.current || targetLocked) return
    submitting.current = true
    setBusy('creating'); setError('')
    try {
      const result = await postJson('/api/profiles', { name: name.trim() })
      setCatalog((previous) => ({ ...previous, profiles: [...previous.profiles, result.profile] }))
      setSelected(result.profile.id); setName('')
    } catch (failure) { setError(failure.message || 'The profile could not be created.') }
    finally { submitting.current = false; setBusy('') }
  }

  const reconnect = async (url, profileId) => {
    const ready = new URL(url)
    ready.pathname = '/api/profiles/ready'
    ready.hash = ''
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1500)
      try {
        const value = await apiFetch(ready.toString(), {
          background: true, signal: controller.signal, credentials: 'omit', cache: 'no-store',
        })
        if (value.id === profileId) { window.location.assign(url); return }
      } catch { /* The selected backend is still restarting. */ }
      finally { clearTimeout(timeout) }
    }
    setError('Studio did not reconnect. Use Open Profile to check the selected instance.')
    setBusy('')
  }

  const apply = async () => {
    if (!selected || busy || submitting.current) return
    if (name.trim()) { setError('Create the new profile or clear its name first.'); return }
    if (!(bulk && targetLocked) && hasUnsavedWork()) { setError('Save or discard open edits before changing profiles.'); return }
    submitting.current = true
    setError(''); setBusy(moving ? 'moving' : 'switching')
    try {
      if (bulk) {
        if (!batch.current) batch.current = createBankMoveBatch(moveBanks, selected, operationId)
        setTargetLocked(true)
        setNetworkUnknown(false)
        const results = await runBankMoveBatch(batch.current, {
          post: postJson,
          onProgress: setProgress,
          onResult: (result) => {
            setMoveResults((previous) => [...previous.filter((row) => bankSelectionKey(row) !== bankSelectionKey(result)), result])
            if (result.ok) onResults?.([result])
          },
        })
        setNetworkUnknown(results.some((row) => row.unknown))
        if (batch.current.completed.size === batch.current.items.length) onClose()
        else if (!results.some((row) => row.unknown)) setError('Some Banks still need attention. Retry continues with the remaining Banks.')
        setBusy('')
      } else if (moving) {
        if (!operation.current || operation.current.profile !== selected) {
          operation.current = { profile: selected, id: operationId() }
        }
        await postJson(`/api/profiles/banks/${bank.id}/move`, {
          instance_id: bank.instance_id, profile_id: selected, operation_id: operation.current.id,
        })
        onMoved?.(); onClose()
      } else {
        const result = await postJson('/api/profiles/switch', { profile_id: selected })
        const url = new URL(result.destination)
        // Keep the address the operator uses, including a remote phone's host.
        url.hostname = window.location.hostname
        url.protocol = window.location.protocol
        url.hash = '/datasets'
        setDestination(url.toString())
        await reconnect(url.toString(), result.profile_id)
      }
    } catch (failure) { setError(failure.message || 'The profile action did not complete.'); setBusy('') }
    finally { submitting.current = false }
  }

  const current = catalog?.profiles.find((profile) => profile.id === catalog.current)
  const choices = (catalog?.profiles || []).filter((profile) => profile.id !== catalog.current)
  const popup = (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={moving ? 'Move to Profile' : 'Profiles'}
      data-probe-layer className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 sm:p-4"
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <section className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface-overlay p-4 shadow-2xl sm:p-5">
        <h2 className="text-base font-bold text-content">{moving ? 'Move to Profile' : 'Profiles'}</h2>
        <p className="mt-2 text-sm text-content-muted">
          {moving ? 'Metadata, edits, groups and caches move together. Source images stay in place.'
            : 'One profile runs at a time. Switching restarts Studio after running work has finished.'}
        </p>
        <p className="mt-2 break-words text-xs text-content-subtle">Current: {current?.name || 'Loading'}</p>
        {bank && <p className="mt-2 break-words text-sm font-medium text-content">{bank.name}</p>}
        {bulk && <p className="mt-2 text-sm text-content-muted">{remaining.length} of {moveBanks.length} banks remain.</p>}
        <label htmlFor="profile-destination" className="mt-4 block text-sm font-medium text-content">Destination</label>
        <select id="profile-destination" value={selected} disabled={!!busy || targetLocked}
          onChange={(event) => { setSelected(event.target.value); setError(''); setDestination('') }}
          className="mt-1 min-h-10 w-full min-w-0 rounded-md border border-border bg-surface-raised px-3 text-sm text-content">
          <option value="">{choices.length ? 'Choose a profile' : 'Create a profile below'}</option>
          {choices.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
        <form onSubmit={create} className="mt-4 border-t border-border pt-3">
          <label htmlFor="profile-name" className="block text-sm font-medium text-content">New Profile</label>
          <div className="mt-1 flex min-w-0 flex-col gap-2 sm:flex-row">
            <Input id="profile-name" value={name} maxLength={60} disabled={!!busy || targetLocked}
              onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1" />
            <Button type="submit" disabled={!!busy || targetLocked || !name.trim() || !catalog}>
              {busy === 'creating' ? 'Creating' : 'Create Profile'}
            </Button>
          </div>
        </form>
        {!moving && catalog && !catalog.can_switch && (
          <p className="mt-3 text-xs text-amber-300">Start Studio with start.bat to enable controlled switching.</p>
        )}
        {moving && <p className="mt-3 text-xs text-content-subtle">
          The Bank leaves this profile after verification. Existing promotions stay recorded as history. A recovery copy of the working cache is retained.
        </p>}
        {bulk && <ul aria-label="Bank Move Results" className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
          {moveBanks.map((row) => {
            const result = resultsByBank.get(bankSelectionKey(row))
            return <li key={bankSelectionKey(row)} className="break-words">
              <span className="font-medium text-content">{row.name}</span>
              <span className={`block text-xs ${result?.ok ? 'text-emerald-300' : result ? 'text-rose-200' : 'text-content-subtle'}`}>
                {result?.ok ? 'Moved' : result ? result.error : 'Pending'}
              </span>
            </li>
          })}
        </ul>}
        {targetLocked && <p className="mt-2 text-xs text-content-subtle">Retry skips confirmed moves and keeps this destination.</p>}
        {networkUnknown && <p role="alert" className="mt-2 text-sm text-amber-200">The last move result is unknown. Retry verifies that Bank before continuing.</p>}
        {error && <p role="alert" className="mt-3 rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        {destination && !busy && <a href={destination} className="mt-2 inline-flex min-h-10 items-center text-sm text-content underline">Open Profile</a>}
        {busy && <p role="status" aria-live="polite" className="mt-3 text-sm text-content-muted">
          {busy === 'moving' ? <>{progress && `${progress.processed} / ${progress.total} banks processed. `}Copying and verifying metadata and caches. Keep this dialog open.</>
            : busy === 'switching' ? 'Restarting the selected profile.' : 'Creating the profile.'}
        </p>}
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={close} disabled={!!busy} className="flex-1">Cancel</Button>
          <Button type="button" variant="primary" onClick={apply} className="flex-1"
            disabled={!!busy || !selected || (bulk && !remaining.length) || (!moving && !catalog?.can_switch)}>
            {bulk ? targetLocked ? 'Retry Moves' : 'Move Banks' : moving ? 'Move Bank' : 'Switch Profile'}
          </Button>
        </div>
      </section>
    </div>
  )
  return typeof document === 'undefined' ? popup : createPortal(popup, document.body)
}
