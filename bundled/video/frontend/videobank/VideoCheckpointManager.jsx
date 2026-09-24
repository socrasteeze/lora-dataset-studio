import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { apiFetch, postJson } from '@lds/plugin-sdk'
import { useToast } from '@lds/plugin-sdk'
import {
  videoDatasetCheckpointsUrl, videoDatasetCheckpointDeployUrl,
  videoDatasetCheckpointUndeployUrl, videoDatasetCheckpointDeleteUrl,
  videoDatasetLineageUrl,
} from './videoBankApi.js'
import VideoLineageGraph from './VideoLineageGraph.jsx'
import VideoSampleLightbox from './VideoSampleLightbox.jsx'
import VideoPreviewDialog from './VideoPreviewDialog.jsx'
import { hasPendingPreviews, previewKey, previewSelector, videoPreviewsUrl } from './videoPreviewSelection.js'
import { PluginSlot, hasContributions } from '@lds/plugin-sdk/ui'
import { EMPTY_GRAPH_NOTE, MUTED_CLS, PREVIEWS_NOTE, ROW_CLS, graphSummary } from './videoLineage.js'
import {
  EMPTY_NOTE, checkpointGroups, deleteReport, deployReport,
  describeStepDelete, describeUndeploy, fmtSize, groupSub, groupTitle,
  stepActionModel, stepKey, stepUsesBest, undeployReport,
} from './videoCheckpoints.js'

// The row styles are the lane's shared ones (videoLineage.js): the list and
// the graph popover draw a verb the same way.
const ROW = ROW_CLS
const MUTED = MUTED_CLS

/** 📦 The Checkpoints & LoRAs section of a VIDEO dataset — presentational.
 *
 * Every decision it renders arrives from `stepActionModel`; every sentence it
 * confirms with comes from videoCheckpoints.js. The component owns nothing but
 * the DOM, which is what lets `node --test` render each state from a payload
 * (video-checkpoints-render.test.mjs) without a server behind it.
 *
 * The unit is the STEP: a Wan 2.2 save is two files at one step, and one row
 * per step with one ⬇ per file is the only shape that never offers half a LoRA.
 *
 * A plugin's row (📤 Civitai) mounts on `checkpoint.action`, surface `video`;
 * `ds` is the dataset its context needs — a list rendered from a bare payload
 * (the render tests) passes none and gets no plugin row. */
export function VideoCheckpointList({
  datasetId, payload, busy = null, onDeploy, onUndeploy, onDelete, ds = null,
  cloudAvailable = true,
}) {
  const groups = checkpointGroups(payload)
  if (!groups.length) {
    return <p className="m-0 text-xs text-content-muted">{EMPTY_NOTE}</p>
  }
  const ctx = {
    canDeploy: payload?.can_deploy !== false,
    deployFolder: payload?.deploy_folder || 'h3/lds',
    deleteMode: payload?.delete_mode,
    cloudAvailable,
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1.5" data-lane={g.lane}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="m-0 text-xs font-semibold text-content">{groupTitle(g)}</p>
            <p className="m-0 font-mono text-[0.625rem] text-content-subtle">{groupSub(g)}</p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {g.steps.map((s) => {
              const a = stepActionModel(datasetId, g, s, ctx)
              const rowBusy = typeof busy === 'string' && busy.startsWith(`${a.key}:`)
              return (
                <li key={a.key} data-step-key={a.key}
                  className="flex flex-col gap-1 rounded border border-border bg-surface-raised px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem]">
                    <span className="font-medium text-content">{a.label}</span>
                    {stepUsesBest(s, payload?.best_settings_loras) && <span className="text-amber-200" title="Used by the dataset’s best settings">★ Best settings</span>}
                    {a.deployed && (
                      <span className="rounded bg-emerald-500/15 px-1 py-px text-[0.5625rem] font-semibold uppercase text-emerald-200">
                        Deployed
                      </span>
                    )}
                    {/* One ⬇ per FILE: both experts of a pair have to land side
                        by side for the LoRA to load at all. */}
                    {a.files.map((f) => (
                      <a key={f.filename} href={f.url} download title={f.filename}
                        aria-label={`Download ${f.filename}`}
                        className={ROW + ' min-w-0 max-w-full border-emerald-500/40 bg-emerald-600/15 text-emerald-100 no-underline hover:bg-emerald-600/25'}>
                        <span aria-hidden>⬇</span>
                        {/* A single-file step shows its whole filename, which is one
                            unbreakable token: truncated inside the pill (the full
                            name is the title), or a 360-px screen overflows by the
                            width of a dataset name — measured by the probe. */}
                        <span className="truncate">{f.short}</span>
                        {f.size ? <span className="shrink-0 text-emerald-200/70">{fmtSize(f.size)}</span> : null}
                      </a>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={MUTED}><span aria-hidden>▶</span> {a.continue.reason}</span>
                    {a.deployed ? (a.undeploy?.ok ? (
                      <button type="button" disabled={rowBusy} onClick={() => onUndeploy?.(g, s)}
                        title="Remove this LoRA from ComfyUI's loras folder. Reversible: the training save is kept, so you can deploy it again"
                        className={ROW + ' border-emerald-500/40 bg-emerald-600/5 text-emerald-200/90 hover:bg-emerald-600/20'}>
                        <span aria-hidden>⏏</span> {busy === `${a.key}:undeploy` ? 'Undeploying…' : 'Undeploy'}
                      </button>
                    ) : (
                      <span className={MUTED}><span aria-hidden>⏏</span> {a.undeploy?.reason}</span>
                    )) : (a.deploy?.ok ? (
                      <button type="button" disabled={rowBusy} onClick={() => onDeploy?.(g, s)}
                        title={`Deploy this step into ComfyUI's ${a.deploy.folder} folder so the Video Test Studio can test it`}
                        className={ROW + ' border-primary/40 bg-primary/20 text-white hover:bg-primary/30'}>
                        <span aria-hidden>📦</span> {busy === `${a.key}:deploy` ? 'Deploying…' : `Deploy → ${a.deploy.folder}`}
                      </button>
                    ) : (
                      <span className={MUTED}><span aria-hidden>📦</span> {a.deploy?.reason}</span>
                    ))}
                    <PluginSlot slot="checkpoint.action" surface="video" ds={ds} group={g} step={s} busy={rowBusy} />
                    {/* 🗑 in retreat — a quiet text row, not a fourth coloured
                        button one clicks by reflex; its label names what goes. */}
                    {a.del.ok ? (
                      <button type="button" disabled={rowBusy} onClick={() => onDelete?.(g, s)}
                        title={a.del.title}
                        className="ml-auto flex items-center gap-1 px-1 py-0.5 text-[0.625rem] text-content-subtle hover:text-rose-200 disabled:opacity-60">
                        <Trash2 aria-hidden="true" className="h-3 w-3" />
                        {busy === `${a.key}:delete` ? 'Deleting…' : a.del.label}
                      </button>
                    ) : (
                      <span className={MUTED + ' ml-auto'}><span aria-hidden>🗑</span> {a.del.reason}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** The section's owner: one read, the verbs, and the toasts. Re-reads on
 * `refreshKey` — the training block reports its save count through it, so a
 * run that just harvested shows up here without a second poll of its own. */
export default function VideoCheckpointManager({ ds, refreshKey = 0, onSavesChange }) {
  const cloudAvailable = hasContributions('training.launch', 'video')
  const toast = useToast()
  const [payload, setPayload] = useState(null)
  const [tree, setTree] = useState(null)
  const [sampleTarget, setSampleTarget] = useState(null)
  const [previewTarget, setPreviewTarget] = useState(null)
  const [selected, setSelected] = useState([])
  const [previews, setPreviews] = useState([])
  const [previewError, setPreviewError] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try {
      setPayload(await apiFetch(videoDatasetCheckpointsUrl(ds.id), { background: true }))
      setErr(null)
    } catch (e) {
      setErr(e?.message || 'Could not list the checkpoints.')
    }
    // The ◉ Graph reads its own tree — same runs, laid out as a genealogy. A
    // tree that fails to load leaves the list standing: the graph is the
    // second view of the same saves, never the only one.
    try {
      setTree(await apiFetch(videoDatasetLineageUrl(ds.id), { background: true }))
    } catch { setTree(null) }
  }, [ds.id])
  useEffect(() => { load() }, [load, refreshKey])
  const loadPreviews = useCallback(async () => {
    try {
      const result = await apiFetch(videoPreviewsUrl(ds.id), { background: true })
      setPreviews(result.previews || []); setPreviewError('')
    } catch (e) { setPreviewError(e.message || 'Could not read preview history.') }
  }, [ds.id])
  useEffect(() => { setSelected([]); setPreviews([]); setPreviewTarget(null); loadPreviews() }, [loadPreviews])
  const pendingPreviews = hasPendingPreviews(previews)
  useEffect(() => {
    if (!pendingPreviews) return undefined
    // Video renders can take minutes. Follow until terminal status, including after reload.
    const timer = setInterval(() => { loadPreviews(); load() }, 4000)
    return () => clearInterval(timer)
  }, [pendingPreviews, loadPreviews, load])

  // After a verb changed what is on disk: this list re-reads, and the training
  // block is told so its save count stays current.
  const changed = () => { load(); onSavesChange?.() }

  const act = async (key, fn) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast.error(e?.message || 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  const deploy = (g, s) => act(`${stepKey(g, s)}:deploy`, async () => {
    const d = await postJson(videoDatasetCheckpointDeployUrl(ds.id),
      { run_id: g.run_id, step: s.step, final: !!s.final })
    toast.success(deployReport(d))
    changed()
  })

  const undeploy = (g, s) => {
    if (!window.confirm(describeUndeploy(s, payload?.delete_mode, payload?.best_settings_loras))) return
    act(`${stepKey(g, s)}:undeploy`, async () => {
      for (const f of s.files || []) {
        if (f.deployed_as && f.undeployable) {
          await postJson(videoDatasetCheckpointUndeployUrl(ds.id), { deployed_as: f.deployed_as })
        }
      }
      toast.success(undeployReport(s))
      changed()
    })
  }

  const remove = (g, s) => {
    if (!window.confirm(describeStepDelete(g, s, payload?.delete_mode, payload?.best_settings_loras))) return
    act(`${stepKey(g, s)}:delete`, async () => {
      const d = await postJson(videoDatasetCheckpointDeleteUrl(ds.id),
        { run_id: g.run_id, step: s.step, final: !!s.final })
      toast[d.files_kept?.length ? 'warning' : 'success'](deleteReport(d))
      changed()
    })
  }

  if (err && !payload) {
    return (
      <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-amber-200">
        {err}
        <button type="button" onClick={load} className="rounded border border-border px-2 py-0.5 text-content">Retry</button>
      </p>
    )
  }
  if (!payload) return <p className="m-0 text-xs text-content-subtle">Reading the saves…</p>
  const hasGraph = (tree?.nodes?.length || 0) > 0
  const generatePreviews = (node, pill) => {
    if (node && pill) setSelected([previewKey(previewSelector(node, pill))])
    setPreviewTarget({ tab: 'render' }); loadPreviews()
  }
  const renderedPreviews = (node, pill) => {
    setPreviewTarget({ tab: 'history', filter: node && pill ? previewKey(previewSelector(node, pill)) : null })
    loadPreviews()
  }
  const refreshPreviews = () => { loadPreviews(); load() }
  return (
    <div className="flex flex-col gap-3">
      <details open className="rounded-lg border border-border bg-surface-raised p-2"
        data-probe-reading>
        <summary className="cursor-pointer text-xs font-semibold text-content">
          ◉ Run graph{hasGraph ? ` — ${graphSummary(tree)}` : ''}
        </summary>
        <p className="m-0 mt-1 mb-1.5 text-[0.6875rem] text-content-muted">{hasGraph ? PREVIEWS_NOTE : EMPTY_GRAPH_NOTE}</p>
        {!hasGraph && previews.length > 0 && <button type="button" onClick={() => renderedPreviews()}
          className="min-h-10 rounded border border-border px-3 py-1 text-xs text-content lg:min-h-0">Rendered previews ({previews.length})</button>}
        {hasGraph && (
          <VideoLineageGraph datasetId={ds.id} tree={tree} busy={busy}
            ctx={{ cloudAvailable, canDeploy: payload?.can_deploy !== false,
              deployFolder: payload?.deploy_folder || 'h3/lds', deleteMode: payload?.delete_mode }}
            onDeploy={deploy} onUndeploy={undeploy} onDelete={remove}
            ds={ds}
            selected={selected} onSelection={setSelected} onGenerate={generatePreviews}
            onRenderedPreviews={renderedPreviews} renderedCount={previews.length}
            onPlaySample={(node, pill) => setSampleTarget({ node, pill })} />
        )}
      </details>
      {previewError && <p role="alert" className="text-xs text-amber-200">{previewError}</p>}
      <VideoCheckpointList datasetId={ds.id} payload={payload} busy={busy}
        onDeploy={deploy} onUndeploy={undeploy} onDelete={remove} ds={ds} />
      {/* The dialog of a plugin's row (📤 Civitai) lives here and outlives the
          popover; the saves are re-read on close (a link stamps the pill). */}
      <PluginSlot slot="checkpoint.layer" surface="video" onChanged={() => load()} />
      {sampleTarget && (
        <VideoSampleLightbox datasetId={ds.id} target={sampleTarget}
          onClose={() => setSampleTarget(null)} />
      )}
      {previewTarget && <VideoPreviewDialog key={ds.id} datasetId={ds.id} tree={tree}
        selected={selected} onSelection={setSelected} previews={previews} loadError={previewError}
        initialTab={previewTarget.tab} initialFilter={previewTarget.filter}
        onRefresh={refreshPreviews} onQueued={(result) => { if (result.previews) setPreviews(result.previews); refreshPreviews() }}
        onClose={() => setPreviewTarget(null)} />}
    </div>
  )
}
