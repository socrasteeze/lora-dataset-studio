import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiFetch, getCsrfToken } from '../../api/fetchClient'
import { Button, Input } from '../common/Controls.jsx'
import { HelpBadge } from '../../help/HelpMode'
import { QUICK_SET_DEFAULTS, validateQuickSet } from './quickSetForm.js'

const STAGES = {
  orbit: 'Orbit',
  frames: 'Frames',
  reinforce: 'Reinforce',
  cull: 'Score',
  captions: 'Captions',
  save: 'Save',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Stopped',
}

export default function QuickSetDialog({ onClose, onOpen, suggestedTrigger = '' }) {
  const [files, setFiles] = useState([])
  const [trigger, setTrigger] = useState(suggestedTrigger || '')
  const [name, setName] = useState('')
  const [engine, setEngine] = useState(QUICK_SET_DEFAULTS.engine)
  const [turbo, setTurbo] = useState(QUICK_SET_DEFAULTS.turbo)
  const [targetCount, setTargetCount] = useState(String(QUICK_SET_DEFAULTS.targetCount))
  const [error, setError] = useState('')
  const [job, setJob] = useState(null)

  const running = job && job.status === 'running'
  const errors = validateQuickSet({ files, trigger, name })

  useEffect(() => {
    if (!job || job.status !== 'running') return undefined
    let stop = false
    const tick = async () => {
      try {
        const next = await apiFetch(`/api/quick-set/${job.id}`, { background: true })
        if (!stop) setJob(next)
      } catch { /* the next poll retries */ }
    }
    const timer = setInterval(tick, 2000)
    return () => { stop = true; clearInterval(timer) }
  }, [job])

  const start = async () => {
    if (running || errors.length) {
      setError(errors[0] || '')
      return
    }
    setError('')
    const body = new FormData()
    files.forEach((file) => body.append('images', file))
    body.set('trigger', trigger.trim())
    body.set('name', name.trim())
    body.set('engine', engine)
    body.set('turbo', turbo ? '1' : '0')
    body.set('target_count', targetCount)
    try {
      const created = await apiFetch('/api/quick-set', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrfToken() },
        body,
      })
      setJob(created)
    } catch (err) {
      setError(err?.body?.error || err?.message || 'Quick set failed.')
    }
  }

  const stop = async () => {
    if (!job) return
    try {
      setJob(await apiFetch(`/api/quick-set/${job.id}/cancel`, {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrfToken() },
      }))
    } catch (err) {
      setError(err?.body?.error || err?.message || 'Stop failed.')
    }
  }

  const stage = STAGES[job?.stage] || 'Running'
  const progress = job?.total ? `${job.done || 0} / ${job.total}` : ''

  return (
    <div role="dialog" aria-modal="true" aria-label="Quick Set" data-probe-layer
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface-overlay p-4 shadow-2xl space-y-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-content">
          Quick Set
          <HelpBadge topic="quick-set" />
        </h2>
        {!job && (
          <>
            <label className="block text-sm font-medium text-content">
              Images
              <input type="file" accept="image/*" multiple
                className="mt-1 block min-h-10 w-full text-sm"
                onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 2))} />
            </label>
            <p className="text-sm text-content-muted">Use 1 or 2 images of one person.</p>
            <label className="block text-sm font-medium text-content" htmlFor="quick-set-trigger">Trigger</label>
            <Input id="quick-set-trigger" value={trigger} spellCheck={false}
              onChange={(event) => setTrigger(event.target.value)} className="w-full font-mono" />
            <label className="block text-sm font-medium text-content" htmlFor="quick-set-name">Name</label>
            <Input id="quick-set-name" value={name}
              onChange={(event) => setName(event.target.value)} className="w-full" />
            <label className="block text-sm font-medium text-content" htmlFor="quick-set-engine">Engine</label>
            <select id="quick-set-engine" value={engine} onChange={(event) => setEngine(event.target.value)}
              className="min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm">
              <option value="qwen21">Qwen 2.1</option>
              <option value="krea2">Krea 2</option>
            </select>
            <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-content">
              <input type="checkbox" checked={turbo} onChange={(event) => setTurbo(event.target.checked)} />
              Turbo
            </label>
            {engine === 'qwen21' && !turbo && (
              <p className="text-sm text-content-muted">
                Off uses 25 steps and CFG 4. The simple scheduler on that path is untested.
              </p>
            )}
            <label className="block text-sm font-medium text-content" htmlFor="quick-set-count">Count</label>
            <Input id="quick-set-count" type="number" min="1" max="120" value={targetCount}
              onChange={(event) => setTargetCount(event.target.value)} className="w-full" />
          </>
        )}
        {job && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-content">{stage}{progress ? ` · ${progress}` : ''}</p>
            <p className="text-sm text-content-muted">{job.message}</p>
            {!!job.thumbnails?.length && (
              <div className="grid grid-cols-4 gap-2">
                {job.thumbnails.map((url) => (
                  <img key={url} src={url} alt="" className="aspect-[2/3] w-full rounded object-cover" />
                ))}
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          {!job && (
            <Button variant="primary" className="min-h-10 w-full sm:flex-1" onClick={start}>Start</Button>
          )}
          {running && (
            <Button className="min-h-10 w-full sm:flex-1" onClick={stop}>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Stop
            </Button>
          )}
          {job?.status === 'done' && job.dataset_id && (
            <Button variant="primary" className="min-h-10 w-full sm:flex-1"
              onClick={() => { onOpen?.(job.dataset_id); onClose() }}>
              Open Dataset
            </Button>
          )}
          <Button className="min-h-10 w-full sm:flex-1" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
