import { useCallback, useEffect, useState } from 'react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { useToast } from '../common/Toast'
import { HelpBadge } from '../../help/HelpMode'
import { ensureLicenceAck } from './licenceAck'

/** Targets that have been trained end to end at least once. A target absent
 * from this set is wired from the installed ai-toolkit's own code and preset —
 * correct as far as reading goes, never yet proven by a run — and the card says
 * so, because "it is wired" and "it works" are different claims and only the
 * user can decide whether to spend a night on the second.
 *
 * DIVERGENCE 4 — this replaces the older PROVEN_ON map, which answered the same
 * question with 'local' vs 'cloud' and rendered "trained end to end on a rented
 * pod, but not yet on a local GPU". A set answers what a user can act on
 * (has anyone finished a run with this target, yes or no) without naming a lane
 * this build does not offer. Upstream made the same simplification; taking it
 * retires the fork's "elsewhere" reword rather than carrying it forward. */
const PROVEN_TARGETS = new Set(['wan22_14b', 'minimax_h3', 'minimax_h3_ref2va'])

/** 🎬 The training block of one video dataset: one set of dials, and everything
 * the run reports back.
 *
 * The settings describe the RUN, so they are asked for once, above the button
 * that spends them. Upstream reaches the same shape from the other direction —
 * it had two stacked sections, one per destination, each with its own Steps
 * field and its own i2v checkbox. This build trains video on this machine only
 * (Divergence 4), so there is one destination and the block keeps upstream's
 * name and structure with the rented-pod lane left out.
 *
 * WHY THE BUTTON MUST NEVER START SILENTLY
 * MiniMax H3 pulls about 43 GB of weights on its first run, so the server
 * refuses with the repository and the size, and this asks, once, before that
 * becomes a night of downloading behind a bar that reads "Starting up…".
 *
 * Polling is strictly on demand: the progress line polls only while this
 * dataset's own run is live (`active` is answered from the training fence,
 * which names the TABLE as well as the id — a face training of the colliding
 * id must not drive this bar).
 */
export default function VideoTrainingBlock({ ds }) {
  const toast = useToast()
  // Prefilled with the server's dataset-sized suggestion (steps scale with the
  // clip count — measured, not vibes; see suggested_steps in video_training.py).
  // Still just a prefill: what the user types is what trains.
  const [steps, setSteps] = useState(ds?.suggested_steps || 2000)
  const [doI2v, setDoI2v] = useState(false)
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState(false)

  const poll = useCallback(async () => {
    try {
      setProgress(await apiFetch(`/api/video-dataset/${ds.id}/train/progress`,
        { background: true }))
    } catch { /* the card stays useful without its progress line */ }
  }, [ds.id])
  useEffect(() => { poll() }, [poll])

  const active = !!progress?.active
  useEffect(() => {
    if (!active) return undefined
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [active, poll])

  const start = async (acceptDownload = false) => {
    // The licence question comes BEFORE anything is spent — not after the
    // download confirm, whose 43 GB would already be an investment in a run
    // the licence answer might forbid.
    if (!ensureLicenceAck(ds, {
      storage: window.localStorage, confirmFn: window.confirm,
    })) return undefined
    setBusy(true)
    try {
      const r = await postJson(`/api/video-dataset/${ds.id}/train`,
        { steps, do_i2v: doI2v, accept_download: acceptDownload })
      toast.success(`Training started — ${r.clips} clips, ${r.steps} steps.`)
      // Things the run will not fail on but that change what to expect from it.
      ;(r.warnings || []).forEach((w) => toast.warning(w))
      poll()
    } catch (e) {
      const body = e?.body
      if (body?.needs_download) {
        // `free_gigabytes` is null when the drive could not be measured. Saying
        // nothing is the only honest rendering — "0 GB free" and "plenty of
        // room" are opposite answers and we have neither.
        const room = typeof body.free_gigabytes === 'number'
          ? ` You have ${body.free_gigabytes.toFixed(1)} GB free there.`
          : ''
        if (window.confirm(`${body.error}\n\nDownload about ${body.gigabytes} GB from ${body.repo}?${room}`)) {
          setBusy(false)
          return start(true)
        }
      } else {
        toast.error(e?.message || 'Could not start training.')
      }
    } finally {
      setBusy(false)
    }
    return undefined
  }

  const stop = async () => {
    try {
      const r = await postJson(`/api/video-dataset/${ds.id}/train/stop`, {})
      // `ok: false` means the fence names another run. Saying "stopped" there
      // would tell the user a GPU was released while ai-toolkit still owns it.
      if (r.ok) toast.success('Training stopped.')
      else toast.warning('That run is not this dataset’s — nothing was stopped.')
      poll()
    } catch (e) {
      toast.error(e?.message || 'Could not stop training.')
    }
  }

  if (!ds.training_verified) return null

  const dl = progress?.download

  return (
    <section className="flex flex-col gap-1.5 border-t border-border pt-1.5">
      {active ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={stop}
            className="rounded border border-rose-500/60 bg-rose-500/10 px-2 py-1 text-[0.6875rem] font-semibold text-rose-100 hover:bg-rose-500/20">
            ⏹ Stop training
          </button>
          <HelpBadge topic="video-train-local" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[0.6875rem] text-content-muted">
              Steps
              <input type="number" min={100} step={100} value={steps}
                onChange={(e) => setSteps(Number(e.target.value) || 1000)}
                className="w-20 rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[0.6875rem] text-content" />
            </label>
            {Boolean(ds?.suggested_steps) && (
              <span className="text-[0.625rem] text-content-subtle">
                suggested for {ds.clips} clips
              </span>
            )}
            {ds.target_profile === 'minimax_h3' && (
              <label className="flex items-center gap-1 text-[0.6875rem] text-content-muted">
                <input type="checkbox" checked={doI2v}
                  onChange={(e) => setDoI2v(e.target.checked)} />
                i2v (first-frame)
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Upstream reads "▶ Train on this PC" because it has a second
                button beside it. There is only one destination here, so naming
                the machine would advertise a lane this build does not offer. */}
            <button type="button" onClick={() => start(false)}
              disabled={busy || !ds.clips}
              className="rounded border border-border bg-surface-raised px-2 py-1 text-[0.6875rem] font-semibold text-content hover:bg-surface disabled:opacity-50">
              {busy ? 'Starting…' : '▶ Train this dataset'}
            </button>
            <HelpBadge topic="video-train-local" />
          </div>
        </>
      )}

      {!active && !ds.clips && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[0.6875rem] text-amber-100">
          This set has no clips yet — promote some shots into it first.
        </p>
      )}

      {active && (
        <p className="text-[0.6875rem] text-content-muted">
          {dl
            ? `Downloading weights — ${dl.percent ?? 0}%`
            : progress.step != null
              ? `Step ${progress.step}${progress.total ? ` / ${progress.total}` : ''}${progress.loss != null ? ` · loss ${progress.loss}` : ''}${progress.eta ? ` · ${progress.eta} left` : ''}`
              : 'Starting up…'}
        </p>
      )}

      {!active && !PROVEN_TARGETS.has(ds.target_profile) && (
        <p className="text-[0.6875rem] text-content-subtle">
          {ds.target_label} is wired from ai-toolkit’s own settings but has not
          been trained end to end yet.
        </p>
      )}
      {/* On the card, not only in the toast after launching: a warning that
          arrives once the run is up is a warning about a decision already made. */}
      {!active && progress?.resolution_note && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[0.6875rem] text-amber-100">
          ⚠ {progress.resolution_note}
        </p>
      )}
      {!!progress?.checkpoints?.length && (
        <p className="text-[0.6875rem] text-content-muted">
          {progress.checkpoints.length} saved checkpoint
          {progress.checkpoints.length === 1 ? '' : 's'} in {progress.run_name}
        </p>
      )}
    </section>
  )
}
