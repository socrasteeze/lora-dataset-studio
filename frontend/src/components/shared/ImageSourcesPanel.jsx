import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Expand } from 'lucide-react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { btnClass, Input, Select } from '../common/Controls.jsx'
import FolderPickerField from '../common/FolderPicker.jsx'
import InstallRunner from '../setup/InstallRunner'
import SourceImagePreview from './SourceImagePreview'
import { useUnsavedWork } from '../../hooks/useUnsavedWork.js'
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
  const nextStep = active ? 'Closing this panel keeps the job running.'
    : ({ resume: job?.phase === 'previews' ? 'Resume retries the previous preview batch.' : 'Resume the last action after resolving the error.',
      previews: 'Load previews for this page, then select images.',
      download: 'Download the selected originals to the host.',
      import: 'Import selected images into the destination shown above.',
      scan: 'Select more images or scan the next results.' })[nextAction]
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

  return (
    <>
      <details id={`image-sources-${scope}`} className="lds-section min-w-0 py-2"
        onToggle={(event) => setOpen(event.currentTarget.open)} data-probe-panel="image-sources">
        <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold lg:min-h-8">
          <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />Image Sources
        </summary>
        {open && <div className="min-w-0 space-y-3 pt-3">
          <p className="text-xs text-content-muted">Find images, inspect previews, then download and import your selection.</p>
          {error && <p role="alert" className="break-words text-sm text-red-300">{error}</p>}
          {notice && <p role="status" className="text-sm text-content-muted">{notice}</p>}
          {!catalog && !error && <p role="status" className="text-sm text-content-muted">Loading Sources...</p>}
          {!catalog && error && <button type="button" className={button} onClick={() => { setError(''); refresh() }}>Retry</button>}
          {catalog && !catalog.capability?.ok && <div className="space-y-2 rounded border border-border p-3">
            <p className="text-xs">Install the source downloaders before scanning.</p>
            <InstallRunner action="image_source_extras" buttonLabel="Install Sources" onDone={refresh} />
          </div>}
          {catalog && <>
            {jobs.length > 0 && <label htmlFor={fieldId('jobs')} className="block min-w-0 space-y-1 text-xs">Jobs
              <Select id={fieldId('jobs')} aria-label="Jobs" className="w-full text-base lg:text-sm" value={jobId}
                disabled={busy || credentialDirty}
              onChange={(event) => { setJobId(event.target.value); setJob(null); setOffset(0); setError(''); setNotice(''); if (!folderDirty) setNewScanOpen(false) }}>
                {jobs.map((entry) => <option key={entry.id} value={entry.id}>{sourceName(entry.provider)} · {entry.name} · {jobLabel(entry)}</option>)}
              </Select>
            </label>}
            {jobs.length > 0 ? <button type="button" className={button} aria-expanded={showScan} aria-controls={fieldId('new-scan')}
            disabled={busy || credentialDirty || folderDirty} onClick={() => { setNewScanOpen((value) => !value); setError(''); setNotice('') }}>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${showScan ? 'rotate-180' : ''}`} />New Scan
            </button> : <h3 className="text-sm font-semibold">New Scan</h3>}
            {showScan && <section id={fieldId('new-scan')} aria-label="New Scan" onFocusCapture={() => setNewScanOpen(true)}
              className="min-w-0 space-y-3 border-b border-border pb-3">
              <p className="text-xs text-content-muted">These settings create a new job. Existing jobs keep their saved source and destination.</p>
              <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                <label htmlFor={fieldId('provider')} className="min-w-0 space-y-1 text-xs">Search Preset
                  <Select id={fieldId('provider')} aria-label="Search Preset" value={provider} disabled={busy || credentialDirty}
                    onChange={(event) => setProvider(event.target.value)} className="w-full text-base lg:text-sm">
                    <option value="">Any Source URL</option>
                    {Object.entries(SOURCE_NAMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </Select>
                </label>
                <label htmlFor={fieldId('url')} className="min-w-0 space-y-1 text-xs">URL
                  <Input id={fieldId('url')} value={url} disabled={busy || credentialDirty} autoComplete="off"
                    onChange={(event) => setUrl(event.target.value)} placeholder="https://" className="w-full text-base lg:text-sm" />
                </label>
                {provider && provider !== 'pawchive' && !url && <label htmlFor={fieldId('tags')} className="min-w-0 space-y-1 text-xs">Tag Query
                  <Input id={fieldId('tags')} value={tags} disabled={busy || !provider || provider === 'pawchive' || Boolean(url)}
                    onChange={(event) => setTags(event.target.value)} className="w-full text-base lg:text-sm" />
                </label>}
                {!datasetId && <>
                  <label htmlFor={fieldId('bank')} className="min-w-0 space-y-1 text-xs">Destination
                    <Select id={fieldId('bank')} aria-label="Destination" value={target} disabled={busy}
                      onChange={(event) => setTarget(event.target.value)} className="w-full text-base lg:text-sm">
                      <option value="">New Bank</option>
                      {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                    </Select>
                  </label>
                  {!target && <label htmlFor={fieldId('name')} className="min-w-0 space-y-1 text-xs">Bank Name
                    <Input id={fieldId('name')} value={name} maxLength="100" disabled={busy}
                      onChange={(event) => setName(event.target.value)} className="w-full text-base lg:text-sm" />
                  </label>}
                </>}
              </div>
              {url && provider && <p className="text-xs text-content-muted">The URL takes priority over the search preset.</p>}
              <details className="group min-w-0 border-t border-border pt-2">
                <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-xs font-medium lg:min-h-8">
                  <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />Advanced
                </summary>
                <div className="min-w-0 space-y-3 pt-2">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <label htmlFor={fieldId('limit')} className="min-w-0 space-y-1 text-xs">Scan Limit
                      <Input id={fieldId('limit')} type="number" min="1" max="1000" value={limit} disabled={busy}
                        onChange={(event) => setLimit(event.target.value)} className="w-full text-base lg:text-sm" />
                    </label>
                    <label htmlFor={fieldId('engine')} className="min-w-0 space-y-1 text-xs">Downloader
                      <Select id={fieldId('engine')} aria-label="Downloader" value={engine} disabled={busy}
                        onChange={(event) => setEngine(event.target.value)} className="w-full text-base lg:text-sm">
                        <option value="auto">Auto</option><option value="gallery-dl">gallery-dl</option><option value="yt-dlp">yt-dlp</option>
                      </Select>
                    </label>
                    <label htmlFor={fieldId('media')} className="min-w-0 space-y-1 text-xs">Select Media
                      <Select id={fieldId('media')} aria-label="Select Media" value={media} disabled={busy}
                        onChange={(event) => setMedia(event.target.value)} className="w-full text-base lg:text-sm">
                        <option value="images">Images And ZIPs</option><option value="videos">Videos</option><option value="all">All Media</option>
                      </Select>
                    </label>
                  </div>
                  <h4 className="text-xs font-semibold">Extractor Settings</h4>
                  <label htmlFor={fieldId('extractor')} className="block min-w-0 space-y-1 text-xs">Extractor Name
                    <Input id={fieldId('extractor')} value={extractor} disabled={busy} maxLength="80"
                    onChange={(event) => setExtractor(event.target.value)} className="w-full text-base lg:text-sm" />
                  </label>
                  <p className="text-xs text-content-muted">Optional gallery-dl site prefix. Leave blank for automatic detection.</p>
                  <fieldset disabled={busy || active} className="min-w-0 space-y-2">
                    <FolderPickerField id={fieldId('extractors-dir')} label="Extractor Folder" value={extractorsDir}
                      onChange={(value) => { folderTouched.current = true; setFolderDirty(true); setExtractorsDir(value) }}
                      fieldClassName="min-w-0 w-full" />
                    <p className="text-xs text-content-muted">Choose the host folder with your GDLOPS extractor modules. These modules run as trusted local code. Clear the folder to use only built-in extractors.</p>
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
              <button type="button" className={`${primaryButton} w-full lg:w-auto`} disabled={busy || disabled || credentialDirty || folderDirty || !hasScanSource || !catalog.capability?.ok}
                onClick={() => perform(async () => {
                  const created = await postJson('/api/image-sources/jobs', {
                    provider, url, tags, limit: Number(limit), destination: datasetId ? 'dataset' : 'bank',
                    target_id: datasetId || (target ? Number(target) : null), name, engine, media, extractor,
                  })
                  setJobId(created.id); setJob(null); setOffset(0); setFilter(''); setNewScanOpen(false)
                })}>Scan</button>
              {!hasScanSource && <p className="text-xs text-content-muted">Paste a URL or choose a preset and enter tags.</p>}
            </section>}
            <details className="group border-t border-border pt-2">
              <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-xs font-medium lg:min-h-8">
                <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />Credentials
              </summary>
              <p className="mb-2 break-words text-xs text-content-muted">Source: {sourceName(credentialSource)}. Blank fields keep saved values. Saved values remain hidden.</p>
              {!credentialSource && <p className="mb-2 text-xs text-content-muted">Enter a URL or choose a search preset in New Scan.</p>}
              <div className="grid min-w-0 gap-2 lg:grid-cols-2">
                {CREDENTIAL_FIELDS.map(([key, label]) =>
                  <label key={key} htmlFor={fieldId(key)} className="min-w-0 space-y-1 text-xs">{label}
                    <Input id={fieldId(key)} type="password" autoComplete="new-password" value={credentials[key]} disabled={busy || !credentialSource}
                      onChange={(event) => { setCredentialOwner(credentialSource); setCredentials((old) => ({ ...old, [key]: event.target.value })) }} className="w-full text-base lg:text-sm" />
                  </label>)}
              </div>
              <p className="my-2 text-xs text-content-muted">Cookies use name=value; name=value format. API fields depend on the source.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={busy || !credentialSource || !credentialDirty} onClick={() => perform(async () => {
                  await postJson(`/api/image-sources/credentials/${encodeURIComponent(credentialSource)}`, credentials)
                  setCredentials(emptyCredentials()); setNotice('Source credentials saved.')
                })}>Save Credentials</button>
                {credentialDirty && <button type="button" className={button} disabled={busy} onClick={() => setCredentials(emptyCredentials())}>Discard Draft</button>}
                {!confirmClear && <button type="button" className={button} disabled={busy || !credentialSource} onClick={() => setConfirmClear(true)}>Clear Credentials</button>}
              </div>
              {credentialDirty && <p className="mt-2 text-xs text-content-muted">Save or discard these edits before changing the source.</p>}
              {confirmClear && <div role="alert" className="mt-2 space-y-2">
                <p className="text-xs text-content-muted">This removes all saved credentials for {sourceName(credentialSource)}.</p>
                <div className="flex gap-2">
                  <button type="button" className={btnClass({ variant: 'danger' })} disabled={busy} onClick={() => perform(async () => {
                    await postJson(`/api/image-sources/credentials/${encodeURIComponent(credentialSource)}`, { clear: true })
                    setCredentials(emptyCredentials()); setConfirmClear(false); setNotice('Source credentials cleared.')
                  })}>Confirm Clear</button>
                  <button type="button" className={button} disabled={busy} onClick={() => setConfirmClear(false)}>Cancel</button>
                </div>
              </div>}
            </details>
            {jobId && !job && <p role="status" className="text-sm text-content-muted">Loading Job...</p>}
            {job && <div className="min-w-0 space-y-3">
              <h3 className="text-sm font-semibold">Current Job</h3>
              <dl className="grid min-w-0 gap-1 text-xs">
                <div className="min-w-0"><dt className="font-semibold">Source</dt><dd className="break-all text-content-muted">{job.url}</dd></div>
                <div className="min-w-0"><dt className="font-semibold">Import Destination</dt><dd className="break-words text-content-muted">{destination}</dd></div>
              </dl>
              <div role="status" className="flex min-h-12 min-w-0 flex-wrap items-center gap-2 text-xs lg:min-h-6">
                <span>{jobLabel(job)}</span><span>{job.done}/{job.total || job.done}</span>
                <span>{job.selected_count} Selected</span><span>{job.downloaded_count} Downloaded</span><span>{job.imported_count} Imported</span>
              </div>
              {job.error && <p className="break-words text-xs text-amber-200">{job.error}</p>}
              <p className="min-h-10 text-xs text-content-muted lg:min-h-5">{nextStep}</p>
              <div data-source-actions className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
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
              <label htmlFor={fieldId('filter')} className="block min-w-0 space-y-1 text-xs">Filter Results
                <Input id={fieldId('filter')} value={filter} className="w-full text-base lg:text-sm" maxLength="200"
                  onChange={(event) => { setFilter(event.target.value); setOffset(0) }} />
              </label>
              <p className="text-xs text-content-muted">Load Previews uses this page. Download and Import Images use selections across all pages.</p>
              <p className="text-xs text-content-muted">Only compatible still images can be imported. Download ZIPs to list their images. Other media stays downloadable.</p>
              <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
                <button type="button" className={button} disabled={controlsDisabled}
                  onClick={() => select(job.items.filter((item) => item.kind !== 'unsupported').map((item) => item.id), true)}>Select Page</button>
                <button type="button" className={button} disabled={controlsDisabled} onClick={() => select([], false, true)}>Clear All</button>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
                {job.items.map((item) => <article key={item.id} className="min-w-0 space-y-2 rounded border border-border bg-surface p-2">
                  <label className="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 text-xs lg:min-h-8">
                    <input type="checkbox" checked={item.selected} disabled={controlsDisabled || item.kind === 'unsupported'}
                      aria-label={`Select Item ${item.id}`} className="h-5 w-5 shrink-0 accent-primary"
                      onChange={(event) => select([item.id], event.target.checked)} />
                    <span className="truncate">{({ archive: 'ZIP Archive', unsupported: 'Other Archive', video: 'Video', file: 'File' })[item.kind] || `Post ${item.metadata.post_id || item.id}`}</span>
                  </label>
                  <button type="button" onClick={() => setPreviewId(item.id)} aria-label={`Preview Image ${item.id}`}
                    disabled={item.kind !== 'image' || (!item.preview && !item.downloaded)}
                    title={item.preview || item.downloaded ? 'Open the image viewer.' : 'Load previews or download the image first.'}
                    className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:cursor-default">
                    {item.preview ? <img src={`/api/image-sources/jobs/${job.id}/preview/${item.id}`} alt="Source preview"
                      loading="lazy" className="h-full w-full object-contain" /> : <span className="px-2 text-center text-xs text-content-muted">No Preview</span>}
                    {(item.preview || item.downloaded) && item.kind === 'image' && <Expand aria-hidden="true"
                      className="absolute right-2 top-2 h-5 w-5 rounded bg-surface-overlay/90 p-0.5 text-content" />}
                  </button>
                  <div className="min-h-5 text-xs text-content-muted">{item.imported ? 'Imported' : item.downloaded ? 'Downloaded' : 'Original'}
                    {item.metadata.width && item.metadata.height ? ` · ${item.metadata.width}×${item.metadata.height}` : ''}</div>
                  <p className="line-clamp-2 break-words text-2xs text-content-muted" title={sourceTags(item.metadata).join(', ')}>{sourceTags(item.metadata).join(', ')}</p>
                  {sourceLink(item.metadata) && <a href={sourceLink(item.metadata)} target="_blank" rel="noreferrer noopener"
                    className="flex min-h-10 items-center text-xs underline lg:min-h-8">Source</a>}
                  {item.downloaded && <a href={`/api/image-sources/jobs/${job.id}/file/${item.id}`} download
                    className="flex min-h-10 items-center text-xs underline lg:min-h-8">Save Original</a>}
                  {item.error && <p className="break-words text-xs text-amber-200">{item.error}</p>}
                </article>)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={button} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))}>Previous</button>
                <button type="button" className={button} disabled={offset + 24 >= job.filtered_count} onClick={() => setOffset(offset + 24)}>Next</button>
              </div>
            </div>}
          </>}
        </div>}
      </details>
      <SourceImagePreview jobId={jobId} items={previewItems} itemId={previewId}
        onItemChange={setPreviewId} onClose={() => setPreviewId(null)} />
    </>
  )
}
