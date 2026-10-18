import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { btnClass, Input, Select } from '../common/Controls.jsx'
import InstallRunner from '../setup/InstallRunner'
import { useUnsavedWork } from '../../hooks/useUnsavedWork.js'
import { SOURCE_NAMES, jobLabel, jobRuns, sourceLink, sourceTags } from './imageSources.js'

async function jsonResponse(response) {
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'The source action failed. Retry.')
  return value
}

export default function ImageSourcesPanel({ datasetId, banks = [], disabled = false, onImported }) {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState(null)
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState(null)
  const [provider, setProvider] = useState('danbooru')
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [name, setName] = useState('Source Import')
  const [target, setTarget] = useState('')
  const [limit, setLimit] = useState(200)
  const [filter, setFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [credentials, setCredentials] = useState({ username: '', api_key: '', user_id: '', cookies: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const fetching = useRef(false)
  const importedCallback = useRef(onImported)
  importedCallback.current = onImported
  const seen = useRef('')
  const scope = datasetId ? `dataset-${datasetId}` : 'bank'
  const skipDraft = useRef(true)
  useUnsavedWork(Object.values(credentials).some(Boolean))
  const active = jobRuns(job)
  const controlsDisabled = busy || active || disabled
  const button = `${btnClass({ size: 'md' })} min-h-10 min-w-0`
  const fieldId = (field) => `image-source-${scope}-${field}`

  const refresh = useCallback(async () => {
    if (fetching.current) return
    fetching.current = true
    const version = generation.current
    try {
      const next = await jsonResponse(await apiFetch('/api/image-sources'))
      if (version !== generation.current) return
      setCatalog(next)
      const jobs = next.jobs.filter((entry) => datasetId
        ? entry.destination === 'dataset' && entry.target_id === datasetId : entry.destination === 'bank')
      const selected = jobId || jobs[0]?.id
      if (!jobId && selected) { setJobId(selected); return }
      if (selected) {
        const query = new URLSearchParams({ offset: String(offset), q: filter })
        const detail = await jsonResponse(await apiFetch(`/api/image-sources/jobs/${selected}?${query}`))
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
    skipDraft.current = true
    try {
      const draft = JSON.parse(sessionStorage.getItem(`image-source-draft:${scope}`) || '{}')
      setProvider(SOURCE_NAMES[draft.provider] ? draft.provider : 'danbooru')
      setUrl(typeof draft.url === 'string' ? draft.url : '')
      setTags(typeof draft.tags === 'string' ? draft.tags : '')
      setName(typeof draft.name === 'string' ? draft.name : 'Source Import')
      setLimit(Number.isInteger(draft.limit) ? draft.limit : 200)
      setTarget(typeof draft.target === 'string' ? draft.target : '')
    } catch { /* Storage can be unavailable in private sessions. */ }
    setCredentials({ username: '', api_key: '', user_id: '', cookies: '' })
  }, [scope])

  useEffect(() => {
    if (skipDraft.current) { skipDraft.current = false; return }
    try { sessionStorage.setItem(`image-source-draft:${scope}`, JSON.stringify({ provider, url, tags, name, limit: Number(limit), target })) }
    catch { /* The form remains available when storage is unavailable. */ }
  }, [scope, provider, url, tags, name, limit, target])

  async function perform(action) {
    setBusy(true); setError(''); setNotice('')
    try {
      await action()
      await refresh()
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  const select = (ids, selected, all = false) => perform(async () => {
    await jsonResponse(await postJson(`/api/image-sources/jobs/${jobId}/selection`, { ids, selected, all }))
  })
  const run = (action) => perform(async () => {
    await jsonResponse(await postJson(`/api/image-sources/jobs/${jobId}/${action}`, {}))
  })
  const jobs = (catalog?.jobs || []).filter((entry) => datasetId
    ? entry.destination === 'dataset' && entry.target_id === datasetId : entry.destination === 'bank')

  return (
    <details id={`image-sources-${scope}`} className="min-w-0 rounded-lg border border-border bg-surface p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)} data-probe-panel="image-sources">
      <summary className="flex min-h-10 cursor-pointer items-center font-semibold">Image Sources</summary>
      {open && <div className="min-w-0 space-y-3 pt-3">
        <p className="text-xs text-content-muted">Scan a source. Select originals. Download, then import for review.</p>
        {error && <p role="alert" className="break-words text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-content-muted">{notice}</p>}
        {catalog && !catalog.capability?.ok && <div className="space-y-2 rounded border border-border p-3">
          <p className="text-xs">Install the optional source package before scanning.</p>
          <InstallRunner action="image_source_extras" buttonLabel="Install Sources" onDone={refresh} />
        </div>}
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <label htmlFor={fieldId('provider')} className="min-w-0 space-y-1 text-xs">Source
            <Select id={fieldId('provider')} value={provider} disabled={busy}
              onChange={(event) => { setProvider(event.target.value); setCredentials({ username: '', api_key: '', user_id: '', cookies: '' }) }} className="min-h-10 w-full text-base lg:text-sm">
              {Object.entries(SOURCE_NAMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </label>
          <label htmlFor={fieldId('url')} className="min-w-0 space-y-1 text-xs">URL
            <Input id={fieldId('url')} value={url} disabled={busy} autoComplete="off"
              onChange={(event) => setUrl(event.target.value)} placeholder="https://" className="min-h-10 w-full text-base lg:text-sm" />
          </label>
          <label htmlFor={fieldId('tags')} className="min-w-0 space-y-1 text-xs">Tag Query
            <Input id={fieldId('tags')} value={tags} disabled={busy || provider === 'pawchive' || Boolean(url)}
              onChange={(event) => setTags(event.target.value)} className="min-h-10 w-full text-base lg:text-sm" />
          </label>
          <label htmlFor={fieldId('limit')} className="min-w-0 space-y-1 text-xs">Scan Limit
            <Input id={fieldId('limit')} type="number" min="1" max="1000" value={limit} disabled={busy}
              onChange={(event) => setLimit(event.target.value)} className="min-h-10 w-full text-base lg:text-sm" />
          </label>
          {!datasetId && <>
            <label htmlFor={fieldId('bank')} className="min-w-0 space-y-1 text-xs">Destination
              <Select id={fieldId('bank')} value={target} disabled={busy}
                onChange={(event) => setTarget(event.target.value)} className="min-h-10 w-full text-base lg:text-sm">
                <option value="">New Bank</option>
                {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
              </Select>
            </label>
            {!target && <label htmlFor={fieldId('name')} className="min-w-0 space-y-1 text-xs">Bank Name
              <Input id={fieldId('name')} value={name} maxLength="100" disabled={busy}
                onChange={(event) => setName(event.target.value)} className="min-h-10 w-full text-base lg:text-sm" />
            </label>}
          </>}
        </div>
        <details className="rounded border border-border p-2">
          <summary className="flex min-h-10 cursor-pointer items-center text-xs font-medium">Credentials</summary>
          <p className="mb-2 text-xs text-content-muted">Save credentials for the selected source. Saved values remain hidden. Empty fields clear that source.</p>
          <div className="grid min-w-0 gap-2 lg:grid-cols-2">
            {[['username', 'Username'], ['api_key', 'API Key'], ['user_id', 'User ID'], ['cookies', 'Cookies']].map(([key, label]) =>
              <label key={key} htmlFor={fieldId(key)} className="min-w-0 space-y-1 text-xs">{label}
                <Input id={fieldId(key)} type="password" autoComplete="new-password" value={credentials[key]} disabled={busy}
                  onChange={(event) => setCredentials((old) => ({ ...old, [key]: event.target.value }))} className="min-h-10 w-full text-base lg:text-sm" />
              </label>)}
          </div>
          <p className="my-2 text-xs text-content-muted">Cookies use name=value; name=value format. API fields depend on the source.</p>
          <button type="button" className={button} disabled={busy} onClick={() => perform(async () => {
            await jsonResponse(await postJson(`/api/image-sources/credentials/${provider}`, credentials))
            setCredentials({ username: '', api_key: '', user_id: '', cookies: '' }); setNotice('Source credentials saved.')
          })}>Save Credentials</button>
        </details>
        <button type="button" className={`${button} w-full lg:w-auto`} disabled={busy || disabled || !catalog?.capability?.ok}
          onClick={() => perform(async () => {
            const created = await jsonResponse(await postJson('/api/image-sources/jobs', {
              provider, url, tags, limit: Number(limit), destination: datasetId ? 'dataset' : 'bank',
              target_id: datasetId || (target ? Number(target) : null), name,
            }))
            setJobId(created.id); setJob(null); setOffset(0); setFilter('')
          })}>Scan</button>
        {jobs.length > 0 && <label htmlFor={fieldId('jobs')} className="block min-w-0 space-y-1 text-xs">Jobs
          <Select id={fieldId('jobs')} className="min-h-10 w-full text-base lg:text-sm" value={jobId}
            onChange={(event) => { setJobId(event.target.value); setJob(null); setOffset(0) }}>
            {jobs.map((entry) => <option key={entry.id} value={entry.id}>{SOURCE_NAMES[entry.provider]} · {entry.name} · {jobLabel(entry)}</option>)}
          </Select>
        </label>}
        {job && <div className="min-w-0 space-y-3">
          <div role="status" className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span>{jobLabel(job)}</span><span>{job.done}/{job.total || job.done}</span>
            <span>{job.selected_count} Selected</span><span>{job.downloaded_count} Downloaded</span><span>{job.imported_count} Imported</span>
          </div>
          {job.error && <p className="break-words text-xs text-amber-200">{job.error}</p>}
          <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
            {active ? <button type="button" className={button} disabled={busy} onClick={() => run('stop')}>Stop</button> : <>
              <button type="button" className={button} disabled={controlsDisabled} onClick={() => run('scan')}>Scan More</button>
              <button type="button" className={button} disabled={controlsDisabled} onClick={() => run('rescan')}>Rescan</button>
              <button type="button" className={button} disabled={controlsDisabled || !job.selected_count} onClick={() => run('previews')}>Load Previews</button>
              <button type="button" className={button} disabled={controlsDisabled || !job.selected_count} onClick={() => run('download')}>Download</button>
              <button type="button" className={button} disabled={controlsDisabled || !job.downloaded_count} onClick={() => run('import')}>Import</button>
              {['failed', 'cancelled', 'interrupted'].includes(job.state) && <button type="button" className={button}
                disabled={controlsDisabled} onClick={() => run('resume')}>Resume</button>}
            </>}
          </div>
          <label htmlFor={fieldId('filter')} className="block min-w-0 space-y-1 text-xs">Filter Results
            <Input id={fieldId('filter')} value={filter} className="min-h-10 w-full text-base lg:text-sm" maxLength="200"
              onChange={(event) => { setFilter(event.target.value); setOffset(0) }} />
          </label>
          <p className="text-xs text-content-muted">Actions use selected items across all pages. Load Previews checks the first 24 selected items. ZIP downloads list their images after extraction.</p>
          <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
            <button type="button" className={button} disabled={controlsDisabled} onClick={() => select(job.items.map((item) => item.id), true)}>Select Page</button>
            <button type="button" className={button} disabled={controlsDisabled} onClick={() => select([], false, true)}>Clear All</button>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
            {job.items.map((item) => <label key={item.id} className="min-w-0 space-y-2 rounded border border-border p-2">
              <div className="flex min-h-10 min-w-0 items-center gap-2 text-xs">
                <input type="checkbox" checked={item.selected} disabled={controlsDisabled || item.kind === 'unsupported'}
                  aria-label={`Select Item ${item.id}`} className="h-5 w-5 shrink-0"
                  onChange={(event) => select([item.id], event.target.checked)} />
                <span className="truncate">{item.kind === 'archive' ? 'ZIP Archive' : item.kind === 'unsupported' ? 'Unsupported Archive' : `Post ${item.metadata.post_id || item.id}`}</span>
              </div>
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-surface-raised">
                {item.preview ? <img src={`/api/image-sources/jobs/${job.id}/preview/${item.id}`} alt="Source preview"
                  loading="lazy" className="h-full w-full object-contain" /> : <span className="px-2 text-center text-xs text-content-muted">No Preview</span>}
              </div>
              <div className="min-h-5 text-xs text-content-muted">{item.imported ? 'Imported' : item.downloaded ? 'Downloaded' : 'Original'}
                {item.metadata.width && item.metadata.height ? ` · ${item.metadata.width}×${item.metadata.height}` : ''}</div>
              <p className="line-clamp-2 break-words text-2xs text-content-muted" title={sourceTags(item.metadata).join(', ')}>{sourceTags(item.metadata).join(', ')}</p>
              {sourceLink(item.metadata) && <a href={sourceLink(item.metadata)} target="_blank" rel="noreferrer noopener"
                className="flex min-h-10 items-center text-xs underline">Source</a>}
              {item.error && <p className="break-words text-xs text-amber-200">{item.error}</p>}
            </label>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={button} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))}>Previous</button>
            <button type="button" className={button} disabled={offset + 24 >= job.filtered_count} onClick={() => setOffset(offset + 24)}>Next</button>
          </div>
        </div>}
      </div>}
    </details>
  )
}
