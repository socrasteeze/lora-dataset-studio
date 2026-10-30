import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Expand } from 'lucide-react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { btnClass, Input, Select } from '../common/Controls.jsx'
import FolderPickerField from '../common/FolderPicker.jsx'
import InstallRunner from '../setup/InstallRunner'
import SourceImagePreview from './SourceImagePreview'
import { useUnsavedWork } from '../../hooks/useUnsavedWork.js'
import PasswordInput from '../common/PasswordInput.jsx'
import { SOURCE_NAMES, jobLabel, jobRuns, sourceLink, sourceName, sourceProvider, sourceTags } from './imageSources.js'

const CREDENTIAL_FIELDS = [['username', 'Username'], ['password', 'Password'], ['api_key', 'API Key'],
  ['user_id', 'User ID'], ['cookies', 'Cookies'], ['access_token', 'Access Token'],
  ['access_token_secret', 'Token Secret'], ['client_id', 'Client ID'],
  ['client_secret', 'Client Secret'], ['refresh_token', 'Refresh Token']]
const emptyCredentials = () => Object.fromEntries(CREDENTIAL_FIELDS.map(([key]) => [key, '']))

export default function ImageSourcesPanel({ datasetId, datasetName, banks = [], disabled = false, onImported }) {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState(null)
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState(null)
  const [provider, setProvider] = useState('')
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [name, setName] = useState('Source Import')
  const [target, setTarget] = useState('')
  const [limit, setLimit] = useState(200)
  const [engine, setEngine] = useState('auto')
  const [media, setMedia] = useState('images')
  const [extractor, setExtractor] = useState('')
  const [extractorsDir, setExtractorsDir] = useState('')
  const [folderDirty, setFolderDirty] = useState(false)
  const folderTouched = useRef(false)
  const [filter, setFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [credentials, setCredentials] = useState(emptyCredentials)
  const [credentialOwner, setCredentialOwner] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newScanOpen, setNewScanOpen] = useState(false)
  const [previewId, setPreviewId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [hidden, setHidden] = useState(null)
  const generation = useRef(0)
  const fetching = useRef(false)
  const changing = useRef(false)
  const importedCallback = useRef(onImported)
  importedCallback.current = onImported
  const seen = useRef('')
  const scope = datasetId ? `dataset-${datasetId}` : 'bank'
  const skipDraft = useRef(true)
  const credentialDirty = Object.values(credentials).some(Boolean)
  useUnsavedWork(folderDirty || credentialDirty)
  const jobs = (catalog?.jobs || []).filter((entry) => datasetId
    ? entry.destination === 'dataset' && entry.target_id === datasetId : entry.destination === 'bank')
  const showScan = newScanOpen || jobs.length === 0 || folderDirty
  const hasScanSource = Boolean(url.trim()) || Boolean(provider && provider !== 'pawchive' && tags.trim())
  const credentialSource = credentialDirty ? credentialOwner
    : showScan ? sourceProvider(url, provider) : job?.provider || ''
  const active = jobRuns(job)
  const controlsDisabled = busy || active || disabled
  const button = `${btnClass({ size: 'md' })} min-w-0 font-semibold`
  const primaryButton = `${btnClass({ variant: 'primary' })} min-w-0`
  const destination = job?.destination === 'dataset' ? (datasetName || 'Current Dataset')
    : job?.target_id ? (banks.find((bank) => bank.id === job.target_id)?.name || `Bank #${job.target_id}`)
      : `${job?.name || 'Source Import'} (New Bank)`
  const previewItems = (job?.items || []).filter((item) => item.kind === 'image' && (item.preview || item.downloaded))
  const previewCandidates = (job?.items || []).filter((item) => item.kind === 'image')
  const readyImport = job?.ready_import_count || 0
  const pendingDownload = job?.pending_download_count || 0
  const recoverable = ['failed', 'cancelled', 'interrupted'].includes(job?.state)
  const nextAction = active ? 'stop' : recoverable ? 'resume'
    : readyImport && !pendingDownload ? 'import'
      : previewCandidates.some((item) => !item.preview && !item.downloaded) ? 'previews'
        : pendingDownload ? 'download' : readyImport ? 'import' : 'scan'
  const jobHint = active ? 'The job continues when you close this panel.'
    : recoverable ? (job?.phase === 'previews' ? 'Resume retries the previous preview batch.' : 'Resolve the error, then resume the last action.')
      : ''
  const actionButton = (primary) => primary ? primaryButton : button
  const fieldId = (field) => `image-source-${scope}-${field}`

  const refresh = useCallback(async () => {
    if (fetching.current || changing.current) return
    fetching.current = true
    const version = generation.current
    try {
      const next = await apiFetch('/api/image-sources', { background: true })
      if (version !== generation.current) return
      setCatalog(next)
      if (!folderTouched.current) setExtractorsDir(next.settings?.extractors_dir || '')
      const jobs = next.jobs.filter((entry) => datasetId
        ? entry.destination === 'dataset' && entry.target_id === datasetId : entry.destination === 'bank')
      const selected = jobId || jobs[0]?.id
      if (!jobId && selected) { setJobId(selected); return }
      if (selected) {
        const query = new URLSearchParams({ offset: String(offset), q: filter })
        const detail = await apiFetch(`/api/image-sources/jobs/${selected}?${query}`, { background: true })
        if (version !== generation.current) return
        setJob(detail)
        const receipt = `${detail.id}:${detail.imported_count}`
        if (detail.imported_count && seen.current !== receipt) {
          seen.current = receipt
          importedCallback.current?.()
        }
      }
    } catch (failure) {
      if (version === generation.current) setError(failure.message)
    } finally { fetching.current = false }
  }, [datasetId, jobId, offset, filter])

  useEffect(() => {
    generation.current += 1
    if (!open) return undefined
    refresh()
    const timer = setInterval(refresh, 1500)
    return () => { generation.current += 1; clearInterval(timer) }
  }, [open, refresh])

  useEffect(() => {
    setJobId(''); setJob(null); setOffset(0); setFilter('')
    setNewScanOpen(false); setPreviewId(null)
    skipDraft.current = true
    try {
      const draft = JSON.parse(sessionStorage.getItem(`image-source-draft:${scope}`) || '{}')
      setProvider(SOURCE_NAMES[draft.provider] ? draft.provider : '')
      setUrl(typeof draft.url === 'string' ? draft.url : '')
      setTags(typeof draft.tags === 'string' ? draft.tags : '')
      setName(typeof draft.name === 'string' ? draft.name : 'Source Import')
      setLimit(Number.isInteger(draft.limit) ? draft.limit : 200)
      setTarget(typeof draft.target === 'string' ? draft.target : '')
      setEngine(['gallery-dl', 'yt-dlp'].includes(draft.engine) ? draft.engine : 'auto')
      setMedia(['videos', 'all'].includes(draft.media) ? draft.media : 'images')
      setExtractor(typeof draft.extractor === 'string' ? draft.extractor : '')
    } catch { /* Storage can be unavailable in private sessions. */ }
    setCredentials(emptyCredentials()); setCredentialOwner('')
  }, [scope])

  useEffect(() => {
    if (skipDraft.current) { skipDraft.current = false; return }
    try { sessionStorage.setItem(`image-source-draft:${scope}`, JSON.stringify({ provider, url, tags, name, limit: Number(limit), target, engine, media, extractor })) }
    catch { /* The form remains available when storage is unavailable. */ }
  }, [scope, provider, url, tags, name, limit, target, engine, media, extractor])

  // Settings > Shared Service Access can hide this panel. A failed read shows it.
  useEffect(() => {
    let live = true
    apiFetch('/api/settings', { background: true })
      .then((data) => { if (live) setHidden(data.config?.image_sources?.hidden === true) })
      .catch(() => { if (live) setHidden(false) })
    return () => { live = false }
  }, [])

  useEffect(() => { setCredentials(emptyCredentials()); setConfirmClear(false) }, [credentialSource])
  useEffect(() => { setPreviewId(null) }, [jobId, offset, filter])

  async function perform(action) {
    generation.current += 1
    changing.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      await action()
      changing.current = false
      await refresh()
    } catch (failure) { setError(failure.message) }
    finally { changing.current = false; setBusy(false) }
  }

  const select = (ids, selected, all = false) => {
    const previous = job
    const affected = new Set(ids)
    setJob((current) => {
      if (!current) return current
      const delta = current.items.filter((item) => affected.has(item.id) && item.selected !== selected).length
      return { ...current,
        selected_count: all ? (selected ? current.count : 0) : current.selected_count + (selected ? delta : -delta),
        items: current.items.map((item) => all || affected.has(item.id) ? { ...item, selected } : item),
      }
    })
    return perform(async () => {
      try { await postJson(`/api/image-sources/jobs/${jobId}/selection`, { ids, selected, all }) }
      catch (failure) { setJob(previous); throw failure }
    })
  }
  const run = (action, body = {}) => perform(async () => {
    await postJson(`/api/image-sources/jobs/${jobId}/${action}`, body)
  })

  if (hidden !== false) return null

  return (
    <>
      <details id={`image-sources-${scope}`} className="lds-section min-w-0 py-2"
        onToggle={(event) => setOpen(event.currentTarget.open)} data-probe-panel="image-sources">
        <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-base font-semibold lg:min-h-8">
          <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />Image Sources
        </summary>
        {open && <div className="grid min-w-0 gap-x-6 gap-y-3 pt-3 lg:grid-cols-2">
          <div className="min-w-0 space-y-3 empty:hidden lg:col-span-2">
            {error && <p role="alert" className="break-words text-sm text-red-300">{error}</p>}
            {notice && <p role="status" className="text-sm text-content-muted">{notice}</p>}
            {!catalog && !error && <p role="status" className="text-sm text-content-muted">Loading Sources...</p>}
            {!catalog && error && <button type="button" className={button} onClick={() => { setError(''); refresh() }}>Retry</button>}
            {catalog && !catalog.capability?.ok && <div className="space-y-2 rounded border border-border p-3 [&_button]:text-sm">
              <p className="text-sm">Install the source downloaders before scanning.</p>
              <InstallRunner action="image_source_extras" buttonLabel="Install Sources" onDone={refresh} />
            </div>}
          </div>
          {catalog && <>
            <div className="grid min-w-0 gap-3 lg:row-span-5 lg:grid-rows-subgrid">
              <div className="flex min-h-10 items-center lg:min-h-8">
                {jobs.length > 0 ? <button type="button" className={button} aria-expanded={showScan}
                aria-controls={`${fieldId('new-scan')} ${fieldId('scan-actions')} ${fieldId('advanced')}`}
                disabled={busy || credentialDirty || folderDirty} onClick={() => { setNewScanOpen((value) => !value); setError(''); setNotice('') }}>
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${showScan ? 'rotate-180' : ''}`} />New Scan
                </button> : <h3 className="text-sm font-semibold">New Scan</h3>}
              </div>
              {showScan ? <section id={fieldId('new-scan')} aria-label="New Scan"
                onFocusCapture={() => setNewScanOpen(true)} className="min-w-0 space-y-3">
                <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                  <label htmlFor={fieldId('provider')} className="min-w-0 space-y-1 text-sm">Search Preset
                    <Select id={fieldId('provider')} aria-label="Search Preset" value={provider} disabled={busy || credentialDirty}
                      onChange={(event) => setProvider(event.target.value)} className="w-full text-base lg:text-sm">
                      <option value="">Any Source URL</option>
                      {Object.entries(SOURCE_NAMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </Select>
                  </label>
                  <label htmlFor={fieldId('url')} className="min-w-0 space-y-1 text-sm">URL
                    <Input id={fieldId('url')} value={url} disabled={busy || credentialDirty} autoComplete="off"
                      onChange={(event) => setUrl(event.target.value)} placeholder="https://" className="w-full text-base lg:text-sm" />
                  </label>
                  {provider && provider !== 'pawchive' && !url && <label htmlFor={fieldId('tags')} className="min-w-0 space-y-1 text-sm">Tag Query
                    <Input id={fieldId('tags')} value={tags} disabled={busy || !provider || provider === 'pawchive' || Boolean(url)}
                      onChange={(event) => setTags(event.target.value)} className="w-full text-base lg:text-sm" />
                  </label>}
                  {!datasetId && <>
                    <label htmlFor={fieldId('bank')} className="min-w-0 space-y-1 text-sm">Destination
                      <Select id={fieldId('bank')} aria-label="Destination" value={target} disabled={busy}
                        onChange={(event) => setTarget(event.target.value)} className="w-full text-base lg:text-sm">
                        <option value="">New Bank</option>
                        {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                      </Select>
                    </label>
                    {!target && <label htmlFor={fieldId('name')} className="min-w-0 space-y-1 text-sm">Bank Name
                      <Input id={fieldId('name')} value={name} maxLength="100" disabled={busy}
                        onChange={(event) => setName(event.target.value)} className="w-full text-base lg:text-sm" />
                    </label>}
                  </>}
                </div>
                {url && provider && <p className="text-sm text-content-muted">The URL takes priority over the search preset.</p>}
              </section> : <div className="hidden lg:block" />}
              {showScan ? <div id={fieldId('scan-actions')} className="min-w-0 space-y-2">
                <button type="button" className={`${primaryButton} w-full`} disabled={busy || disabled || credentialDirty || folderDirty || !hasScanSource || !catalog.capability?.ok}
                  onClick={() => perform(async () => {
                    const created = await postJson('/api/image-sources/jobs', {
                      provider, url, tags, limit: Number(limit), destination: datasetId ? 'dataset' : 'bank',
                      target_id: datasetId || (target ? Number(target) : null), name, engine, media, extractor,
                    })
                    setJobId(created.id); setJob(null); setOffset(0); setFilter(''); setNewScanOpen(false)
                  })}>Scan</button>
                {!hasScanSource && <p className="text-sm text-content-muted">Enter a URL or choose a preset with tags.</p>}
                {jobs.length > 0 && <p className="text-sm text-content-muted">Saved jobs keep their source and destination.</p>}
              </div> : <div className="hidden lg:block" />}
              {showScan ? <div id={fieldId('advanced')} className="min-w-0">
                <details className="group min-w-0 border-t border-border pt-2">
                  <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium lg:min-h-8">
                    <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />Advanced
                  </summary>
                  <div className="min-w-0 space-y-3 pt-2">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <label htmlFor={fieldId('limit')} className="min-w-0 space-y-1 text-sm">Scan Limit
                        <Input id={fieldId('limit')} type="number" min="1" max="1000" value={limit} disabled={busy}
                          onChange={(event) => setLimit(event.target.value)} className="w-full text-base lg:text-sm" />
                      </label>
                      <label htmlFor={fieldId('engine')} className="min-w-0 space-y-1 text-sm">Downloader
                        <Select id={fieldId('engine')} aria-label="Downloader" value={engine} disabled={busy}
                          onChange={(event) => setEngine(event.target.value)} className="w-full text-base lg:text-sm">
                          <option value="auto">Auto</option><option value="gallery-dl">gallery-dl</option><option value="yt-dlp">yt-dlp</option>
                        </Select>
                      </label>
                      <label htmlFor={fieldId('media')} className="min-w-0 space-y-1 text-sm">Select Media
                        <Select id={fieldId('media')} aria-label="Select Media" value={media} disabled={busy}
                          onChange={(event) => setMedia(event.target.value)} className="w-full text-base lg:text-sm">
                          <option value="images">Images And ZIPs</option><option value="videos">Videos</option><option value="all">All Media</option>
                        </Select>
                      </label>
                    </div>
                    <h4 className="text-sm font-semibold">Extractor Settings</h4>
                    <label htmlFor={fieldId('extractor')} className="block min-w-0 space-y-1 text-sm">Extractor Name
                      <Input id={fieldId('extractor')} value={extractor} disabled={busy} maxLength="80"
                      onChange={(event) => setExtractor(event.target.value)} className="w-full text-base lg:text-sm" />
                    </label>
                    <p className="text-sm text-content-muted">Optional gallery-dl site prefix. Leave blank for automatic detection.</p>
                    <fieldset disabled={busy || active} className="min-w-0 space-y-2">
                      <FolderPickerField id={fieldId('extractors-dir')} label="Extractor Folder" value={extractorsDir}
                        onChange={(value) => { folderTouched.current = true; setFolderDirty(true); setExtractorsDir(value) }}
                        fieldClassName="min-w-0 w-full" />
                      <p className="text-sm text-content-muted">Use a folder of trusted GDLOPS modules. Clear it to use built-in extractors.</p>
                      <button type="button" className={button} onClick={() => perform(async () => {
                        const saved = await postJson('/api/image-sources/settings', { extractors_dir: extractorsDir })
                        setExtractorsDir(saved.extractors_dir); setFolderDirty(false); folderTouched.current = false
                        setNotice('Extractor folder saved.')
                      })}>Save Folder</button>
                      {folderDirty && <button type="button" className={`${button} ml-2`} onClick={() => {
                        setExtractorsDir(catalog.settings?.extractors_dir || ''); setFolderDirty(false); folderTouched.current = false
                      }}>Reset Folder</button>}
                    </fieldset>
                  </div>
                </details>
              </div> : <div className="hidden lg:block" />}
              <details className="group border-t border-border pt-2">
                <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium lg:min-h-8">
                  <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />Credentials
                </summary>
                <p className="mb-2 break-words text-sm text-content-muted">Source: {sourceName(credentialSource)}. Blank fields keep saved values. Saved values remain hidden.</p>
                {!credentialSource && <p className="mb-2 text-sm text-content-muted">Enter a URL or choose a search preset in New Scan.</p>}
                <div className="grid min-w-0 gap-2 lg:grid-cols-2">
                  {CREDENTIAL_FIELDS.map(([key, label]) =>
                    <label key={key} htmlFor={fieldId(key)} className="min-w-0 space-y-1 text-sm">{label}
                      <PasswordInput key={`${credentialSource}:${key}`} label={label} id={fieldId(key)} autoComplete="new-password" value={credentials[key]} disabled={busy || !credentialSource}
                        onChange={(event) => { setCredentialOwner(credentialSource); setCredentials((old) => ({ ...old, [key]: event.target.value })) }} className="w-full text-base lg:text-sm" />
                    </label>)}
                </div>
                <p className="my-2 text-sm text-content-muted">Cookies use name=value; name=value format.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={button} disabled={busy || !credentialSource || !credentialDirty} onClick={() => perform(async () => {
                    await postJson(`/api/image-sources/credentials/${encodeURIComponent(credentialSource)}`, credentials)
                    setCredentials(emptyCredentials()); setNotice('Source credentials saved.')
                  })}>Save Credentials</button>
                  {credentialDirty && <button type="button" className={button} disabled={busy} onClick={() => setCredentials(emptyCredentials())}>Discard Draft</button>}
                  {!confirmClear && <button type="button" className={button} disabled={busy || !credentialSource} onClick={() => setConfirmClear(true)}>Clear Credentials</button>}
                </div>
                {credentialDirty && <p className="mt-2 text-sm text-content-muted">Save or discard these edits before changing the source.</p>}
                {confirmClear && <div role="alert" className="mt-2 space-y-2">
                  <p className="text-sm text-content-muted">This removes all saved credentials for {sourceName(credentialSource)}.</p>
                  <div className="flex gap-2">
                    <button type="button" className={btnClass({ variant: 'danger' })} disabled={busy} onClick={() => perform(async () => {
                      await postJson(`/api/image-sources/credentials/${encodeURIComponent(credentialSource)}`, { clear: true })
                      setCredentials(emptyCredentials()); setConfirmClear(false); setNotice('Source credentials cleared.')
                    })}>Confirm Clear</button>
                    <button type="button" className={button} disabled={busy} onClick={() => setConfirmClear(false)}>Cancel</button>
                  </div>
                </div>}
              </details>
            </div>
            <div className="grid min-w-0 gap-3 lg:row-span-5 lg:grid-rows-subgrid">
              <h3 className="flex min-h-10 items-center text-sm font-semibold lg:min-h-8">Current Job</h3>
              <div className="min-w-0 space-y-3">
                {jobs.length > 0 && <label htmlFor={fieldId('jobs')} className="block min-w-0 space-y-1 text-sm">Jobs
                  <Select id={fieldId('jobs')} aria-label="Jobs" className="w-full text-base lg:text-sm" value={jobId}
                    disabled={busy || credentialDirty}
                  onChange={(event) => { setJobId(event.target.value); setJob(null); setOffset(0); setError(''); setNotice(''); if (!folderDirty) setNewScanOpen(false) }}>
                    {jobs.map((entry) => <option key={entry.id} value={entry.id}>{sourceName(entry.provider)} · {entry.name} · {jobLabel(entry)}</option>)}
                  </Select>
                </label>}
                {jobId && !job && <p role="status" className="text-sm text-content-muted">Loading Job...</p>}
                {job && <>
                  <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                    <label htmlFor={fieldId('job-source')} className="min-w-0 space-y-1 text-sm">Source
                      <Input id={fieldId('job-source')} value={job.url} readOnly
                        className="w-full text-base lg:text-sm" />
                    </label>
                    <label htmlFor={fieldId('job-destination')} className="min-w-0 space-y-1 text-sm">Import Destination
                      <Input id={fieldId('job-destination')} value={destination} readOnly
                        className="w-full text-base lg:text-sm" />
                    </label>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>Status</p>
                    <div role="status" className="grid min-w-0 gap-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                        <span>{jobLabel(job)}</span><span>{job.done}/{job.total || job.done}</span>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                        <span>{job.selected_count} Selected</span><span>{job.downloaded_count} Downloaded</span><span>{job.imported_count} Imported</span>
                      </div>
                    </div>
                  </div>
                  {job.error && <p className="break-words text-sm text-amber-200">{job.error}</p>}
                </>}
                {!jobId && <p className="text-sm text-content-muted">No jobs yet.</p>}
              </div>
              {job ? <div className="min-w-0 space-y-2">
                <div data-source-actions className="grid grid-cols-2 gap-2">
                  <button type="button" className={actionButton(nextAction === 'scan')} disabled={controlsDisabled} onClick={() => run('scan')}>Scan More</button>
                  <button type="button" className={button} disabled={controlsDisabled} onClick={() => run('rescan')}>Rescan</button>
                  <button type="button" className={actionButton(nextAction === 'previews')} disabled={controlsDisabled || !previewCandidates.length}
                    onClick={() => run('previews', { ids: previewCandidates.map((item) => item.id) })}>Load Previews</button>
                  <button type="button" className={actionButton(nextAction === 'download')} disabled={controlsDisabled || !job.selected_count} onClick={() => run('download')}>Download</button>
                  <button type="button" className={actionButton(nextAction === 'import')} disabled={controlsDisabled || !readyImport} onClick={() => run('import')}>Import Images</button>
                  {recoverable
                    ? <button type="button" className={actionButton(nextAction === 'resume')} disabled={controlsDisabled} onClick={() => run('resume')}>Resume</button>
                    : <button type="button" className={actionButton(nextAction === 'stop')} disabled={busy || !active} onClick={() => run('stop')}>Stop</button>}
                </div>
                {jobHint && <p className="text-sm text-content-muted">{jobHint}</p>}
              </div> : <div className="hidden lg:block" />}
              {job ? <div className="min-w-0 border-t border-border pt-2">
                <label htmlFor={fieldId('filter')} className="flex min-h-10 min-w-0 items-center gap-3 text-sm lg:min-h-8">
                  <span className="shrink-0">Filter Results</span>
                  <Input id={fieldId('filter')} value={filter} className="min-w-0 flex-1 text-base lg:text-sm" maxLength="200"
                    onChange={(event) => { setFilter(event.target.value); setOffset(0) }} />
                </label>
              </div> : <div className="hidden lg:block" />}
              {job ? <div className="min-w-0 space-y-3 border-t border-border pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={button} disabled={controlsDisabled}
                    onClick={() => select(job.items.filter((item) => item.kind !== 'unsupported').map((item) => item.id), true)}>Select Page</button>
                  <button type="button" className={button} disabled={controlsDisabled} onClick={() => select([], false, true)}>Clear All</button>
                </div>
                <p className="text-sm text-content-muted">Previews use this page. Downloads and imports use all selected items.</p>
                <p className="text-sm text-content-muted">Import Images accepts still images. Download ZIPs to extract images.</p>
              </div> : <div className="hidden lg:block" />}
            </div>
          </>}
          <section aria-labelledby={fieldId('results')} className="min-w-0 space-y-3 lg:col-span-2">
            <h3 id={fieldId('results')} className="text-sm font-semibold">Results</h3>
            {job ? <>
              {job.items.length === 0 && <p className="text-sm text-content-muted">
                {filter ? 'No results match this filter.' : 'This job has no results yet.'}
              </p>}
              <div className="grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
                {job.items.map((item) => <article key={item.id} className="row-span-5 grid min-w-0 grid-rows-subgrid overflow-hidden rounded-lg border border-border bg-surface pb-2">
                  <label className="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 px-2 text-sm lg:min-h-8">
                    <input type="checkbox" checked={item.selected} disabled={controlsDisabled || item.kind === 'unsupported'}
                      aria-label={`Select Item ${item.id}`} className="h-5 w-5 shrink-0 accent-primary"
                      onChange={(event) => select([item.id], event.target.checked)} />
                    <span className="truncate">{({ archive: 'ZIP Archive', unsupported: 'Other Archive', video: 'Video', file: 'File' })[item.kind] || `Post ${item.metadata.post_id || item.id}`}</span>
                  </label>
                  <button type="button" onClick={() => setPreviewId(item.id)} aria-label={`Preview Image ${item.id}`}
                    disabled={item.kind !== 'image' || (!item.preview && !item.downloaded)}
                    title={item.preview || item.downloaded ? 'Open the image viewer.' : 'Load previews or download the image first.'}
                    className="group relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:cursor-default">
                    {item.preview ? <img src={`/api/image-sources/jobs/${job.id}/preview/${item.id}`} alt="Source preview"
                      loading="lazy" className="h-full w-full object-cover" /> : <span className="px-2 text-center text-sm text-content-muted">No Preview</span>}
                    {(item.preview || item.downloaded) && item.kind === 'image' && <Expand aria-hidden="true"
                      className="absolute right-2 top-2 h-5 w-5 rounded bg-surface-overlay/90 p-0.5 text-content" />}
                  </button>
                  <div className="min-h-5 px-2 text-xs text-content-muted">{item.imported ? 'Imported' : item.downloaded ? 'Downloaded' : 'Original'}
                    {item.metadata.width && item.metadata.height ? ` · ${item.metadata.width}×${item.metadata.height}` : ''}</div>
                  <p className="line-clamp-2 break-words px-2 text-xs text-content-muted" title={sourceTags(item.metadata).join(', ')}>{sourceTags(item.metadata).join(', ')}</p>
                  <div className="space-y-2">
                    {sourceLink(item.metadata) && <a href={sourceLink(item.metadata)} target="_blank" rel="noreferrer noopener"
                      className="flex min-h-10 items-center px-2 text-sm underline lg:min-h-8">Source</a>}
                    {item.downloaded && <a href={`/api/image-sources/jobs/${job.id}/file/${item.id}`} download
                      className="flex min-h-10 items-center px-2 text-sm underline lg:min-h-8">Save Original</a>}
                    {item.error && <p className="break-words px-2 text-sm text-amber-200">{item.error}</p>}
                  </div>
                </article>)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={button} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))}>Previous</button>
                <button type="button" className={button} disabled={offset + 24 >= job.filtered_count} onClick={() => setOffset(offset + 24)}>Next</button>
              </div>
            </> : <p className="text-sm text-content-muted">
              {jobId ? 'Loading Job...' : 'Scan a source to see its results.'}
            </p>}
          </section>
        </div>}
      </details>
      <SourceImagePreview jobId={jobId} items={previewItems} itemId={previewId}
        onItemChange={setPreviewId} onClose={() => setPreviewId(null)} />
    </>
  )
}
