import { useEffect, useMemo, useRef, useState } from 'react'
import { Rocket } from 'lucide-react';
import DevicePicker, { loadSavedDeviceId } from '../common/DevicePicker'
import { stepGate } from './passDeviceGate.js'
import { buildSteps, defaultChecked } from './pipelineSteps.js'
import { attemptModalSubmit } from '../../utils/submitOutcome.js'
import { flagCandidateLabel, launchRejectNote } from './autoRejectReadiness.js'
// NOTE: upstream also imports normalizeSemanticEngine / semanticEngineLabel /
// pipelineStepKeys / defaultPipelineStepKeys here, to build the step list and
// its default ticks in this component. This fork does not: the step list comes
// from the SERVER (`caps.bank_pipeline_steps`, which already publishes the
// SigLIP 2 order) through buildSteps/defaultChecked, and the gates come from
// stepGate — one registry each instead of three lists in this file, which is
// what stopped a new step arriving with a checkbox and no gate. The semantic
// engine reaches the dialog as a server-ordered key, so nothing here has to
// know its name.

/** 🚀 Launch all — the overnight funnel. The user picks which passes run and how
 * auto-reject behaves, sees a plain "here's what will run" preview, and hits Go.
 * The backend chains the EXISTING passes in this exact order; a pass whose extra
 * isn't installed is skipped (with a reason) at run time, never failing the launch.
 *
 * Defaults: scan plus the ready passes without defaultOff are pre-checked.
 * Auto-reject, watermark scanning and captioning stay OFF.
 * Rejection needs an explicit choice; captioning adds GPU work that a triage
 * run may not need. When selected,
 * auto-reject defaults to duplicate "keep best" only. The quality flags stay
 * off so an overnight run does not reject shots without that choice. The
 * standalone sheet still starts on blurry + flat because it has no duplicates
 * control.
 */
const QUALITY_FLAGS = [
  { key: 'blur', label: 'Blurry' },
  { key: 'noise', label: 'Noisy' },
  { key: 'uniform', label: 'Flat' },
  { key: 'small', label: 'Small' },
]

export default function LaunchAllDialog({
  caps, visionReady, scope, counts, flagsActionable, onClose, onLaunch, onQueue,
}) {
  // Which machine runs the passes that can travel. FIVE do: ✨ Score,
  // 👥 Group by person, 🚩 Watermarks, 📐 Framing and 🏷️ Captions. scan,
  // auto-reject and ✂ same-shot always run here — they read the database and
  // the embeddings cache, so sending them would be slower, not faster. 🔖 Tags
  // also stays here, for a different reason: no peer advertises the tagger, so
  // there is nobody to send it to (LOCAL_ONLY_PASSES).
  const [deviceId, setDeviceId] = useState(() => loadSavedDeviceId('bank-pass'))
  const [device, setDevice] = useState(null)
  // A heavy pass is "ready" when its tool is installed on the machine that will
  // RUN it. Which machine that is, the picker decides — so the verdict follows
  // the PEER's own capability report when one is picked, and this machine's
  // otherwise. Answering with `|| remote` (a truthy device id and nothing else)
  // ticked ✨ Score on a peer that had already said it has no scoring stack.
  //
  // The steps themselves come in the server's order, off the capability blob
  // this dialog already holds. It used to keep three lists of its own — the
  // gate keys, a render array and the default-ticked set — so a step added to
  // one and not the others got a checkbox with no gate, or one the submit route
  // would silently drop. See pipelineSteps.js.
  const STEPS = useMemo(() => buildSteps(caps?.bank_pipeline_steps), [caps])
  const gates = useMemo(() => Object.fromEntries(
    STEPS.map((s) => [s.key, stepGate(s.key, { caps, visionReady, device })]),
  ), [STEPS, caps, visionReady, device])
  const ready = useMemo(
    () => Object.fromEntries(Object.entries(gates).map(([k, g]) => [k, g.ok])),
    [gates])

  const [steps, setSteps] = useState(() => defaultChecked(STEPS, ready))
  const [rejectFlags, setRejectFlags] = useState(() => new Set())
  const [resolveDups, setResolveDups] = useState(true)
  // Only the multi-bank scopes narrow per bank; a single bank is queued through
  // enqueue(), which has no such notion. Offering the choice there would be a
  // control that silently does nothing.
  const manyBanks = scope === 'all' || scope === 'group'
  const [skipCompleted, setSkipCompleted] = useState(true)

  // Picking a machine that cannot run a ticked pass UNTICKS it. Its checkbox is
  // about to be disabled, and leaving it ticked would post a run the API now
  // refuses outright. Never the reverse: switching back to this machine
  // re-enables the box and leaves the choice to the user — the initial
  // selection is a lazy useState evaluated once, so this effect is the only
  // re-sync and it must not undo a deliberate untick.
  useEffect(() => {
    setSteps((prev) => {
      const next = new Set([...prev].filter((k) => !gates[k]?.blocked))
      return next.size === prev.size ? prev : next
    })
  }, [gates])

  const toggleStep = (k) => setSteps((prev) => {
    if (gates[k]?.blocked) return prev
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })
  const toggleFlag = (k) => setRejectFlags((prev) => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  const autoRejectOn = steps.has('auto_reject')
  const blockedSteps = STEPS.filter((s) => gates[s.key]?.blocked)
  // Honest about the ORDER: auto-reject runs after the scan here, so the counts
  // shown next to the flags are a floor, and images nothing has ever measured
  // are invisible to every flag until 🔎 Scan reaches them.
  const rejectNote = launchRejectNote(counts, steps.has('scan'))
  // The honest preview: the steps that will actually RUN, in order, tagged when
  // one will be skipped because its tool isn't ready.
  const plan = STEPS.filter((s) => steps.has(s.key)).map((s) => ({
    ...s, willSkip: !ready[s.key],
  }))
  const nRun = plan.filter((s) => !s.willSkip).length
  // What config() actually SENDS. The two differ whenever a picked step is not
  // ready, and the button used to show only nRun — "Launch 4 passes" while
  // seven were enqueued. The skipped ones are still sent on purpose: the
  // backend records them as `skipped` in pipeline_report, which is what makes
  // the bank card able to say a pass did not happen. Dropping them here would
  // make a bank that ran nothing look clean.
  const nSent = plan.length

  const config = () => ({
    steps: [...steps],
    reject_flags: autoRejectOn ? [...rejectFlags] : [],
    resolve_dups: autoRejectOn && resolveDups,
    device_id: deviceId || 'local',
    ...(manyBanks ? { skip_completed: skipCompleted } : {}),
  })
  const queue = () => onQueue(config())

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  /* ONE way out, shut only while the launch is being posted. */
  const dismiss = () => { if (!busy) onClose() }
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])  // eslint-disable-line react-hooks/exhaustive-deps

  /* One bank, one background job: this dialog is refused whenever another pass
     owns the bank — the single most likely answer for an overnight funnel the
     user just spent a minute configuring. Closing first reset all seven
     checkboxes and the reject flags to their defaults. The card scrolls inside
     itself, so scroll to the end where the message and the button that produced
     it live. */
  const cardRef = useRef(null)
  useEffect(() => {
    const card = cardRef.current
    if (error && card) card.scrollTop = card.scrollHeight
  }, [error])

  const launch = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    let outcome
    try {
      outcome = await attemptModalSubmit(() => onLaunch(config()),
                                         { fallback: 'Could not start the run' })
    } finally { setBusy(false) }
    if (outcome.close) onClose()
    else setError(outcome.error)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Launch All"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss() }}>
      <div ref={cardRef}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface-overlay p-5 shadow-2xl space-y-4">
        {/* No intro paragraph and no "What will run" list: the ticked boxes ARE
            the plan, and dropping both lets the dialog fit without scrolling. */}
        <h2 className="flex items-center gap-2 text-base font-bold text-content"><Rocket aria-hidden="true" className="h-4 w-4" /> Launch All</h2>

        {blockedSteps.length > 0 && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            🚫 {blockedSteps.length === 1 ? 'One pass' : `${blockedSteps.length} passes`}
            {' '}can’t run on the machine you picked and {blockedSteps.length === 1 ? 'has' : 'have'}
            {' '}been unticked: {blockedSteps.map((s) => s.label).join(', ')}.
            {' '}Run on this machine instead to get {blockedSteps.length === 1 ? 'it' : 'them'} back.
          </p>
        )}

        <ul className="space-y-1.5">
          {STEPS.map((s) => (
            <li key={s.key}>
              <label className={`flex items-start gap-2 rounded-md border border-border bg-surface p-2 text-sm${
                gates[s.key]?.blocked ? ' opacity-50 cursor-not-allowed' : ''}`}>
                <input type="checkbox" className="mt-0.5" checked={steps.has(s.key)}
                  disabled={!!gates[s.key]?.blocked}
                  onChange={() => toggleStep(s.key)} />
                <span className="min-w-0">
                  <span className="font-medium text-content">{s.label}</span>
                  {/* Three different states, and conflating them is what made
                      this dialog lie twice already: the machine REFUSES it
                      (disabled), its tool is missing but it will still be
                      recorded as skipped (amber), or we simply don't know yet. */}
                  {gates[s.key]?.blocked ? (
                    <span className="ml-1.5 rounded bg-red-500/15 px-1.5 py-px text-2xs font-semibold text-red-300">
                      {gates[s.key].reason}
                    </span>
                  ) : !ready[s.key] ? (
                    <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-px text-2xs font-semibold text-amber-300">
                      {s.needs} not ready — will skip
                    </span>
                  ) : gates[s.key]?.warn ? (
                    <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-px text-2xs font-semibold text-amber-300">
                      {gates[s.key].warn}
                    </span>
                  ) : null}
                  {s.desc ? (
                    <span className="block text-xs text-content-subtle">{s.desc}</span>
                  ) : null}
                </span>
              </label>
              {s.key === 'auto_reject' && autoRejectOn && (
                <div className="lds-section ml-6 mt-1.5 space-y-2 py-2">
                  {/* The count is what the flag would catch RIGHT NOW — undecided
                      images only, the same pile the pass touches. It is not the
                      outcome: 🔎 Scan runs before auto-reject in this funnel, so
                      the note below says which way the number will move rather
                      than letting a stale figure pass for a promise. */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {QUALITY_FLAGS.map((f) => (
                      <label key={f.key} className="flex items-center gap-1.5 text-sm text-content">
                        <input type="checkbox" checked={rejectFlags.has(f.key)}
                          onChange={() => toggleFlag(f.key)} />
                        {f.label}
                        <span className="text-xs text-content-subtle">
                          ({flagCandidateLabel(f.key, flagsActionable)})
                        </span>
                      </label>
                    ))}
                  </div>
                  {rejectNote && (
                    <p className="m-0 text-2xs leading-snug text-amber-200">
                      ⚠ {rejectNote}
                    </p>
                  )}
                  <label className="flex items-center gap-1.5 text-sm text-content">
                    <input type="checkbox" checked={resolveDups}
                      onChange={(e) => setResolveDups(e.target.checked)} />
                    ≈ Duplicates — keep best
                  </label>
                  {resolveDups && (
                    <p className="m-0 text-xs text-content-muted">
                      Marks a survivor Keep before applying quality flags. Uses your existing kept copy when available.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {manyBanks && (
          <label className="flex items-start gap-1.5 text-sm text-content">
            <input type="checkbox" checked={skipCompleted} className="mt-0.5"
              onChange={(e) => setSkipCompleted(e.target.checked)} />
            <span>Skip finished passes</span>
          </label>
        )}

        {/* The refusal, right above the button that produced it — the passes you
            ticked are still ticked. shrink-0 keeps it from being squashed to a
            clipped sliver, max-h-24 keeps a long sentence from pushing 🚀 Launch
            off a 400-px screen. */}
        {error && (
          <div role="alert"
            className="shrink-0 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 max-h-24 overflow-y-auto">
            <span className="block whitespace-pre-wrap break-words text-xs leading-relaxed text-red-200">
              {error}
            </span>
            <span className="mt-1 block text-2xs text-content-subtle">
              Your selection is kept — adjust and try again.
            </span>
          </div>
        )}

        <DevicePicker value={deviceId} onChange={setDeviceId} onDevice={setDevice}
          kind="bank-pass" showLabel={false} className="w-full [&>select]:max-w-none [&>select]:flex-1" />

        <div className={`grid gap-2 ${onQueue ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <button type="button" onClick={dismiss} disabled={busy}
            className="min-h-10 rounded-md border border-border px-2 py-1.5 text-sm text-content-muted hover:text-content hover:bg-surface-raised disabled:opacity-50 lg:min-h-0">
            Cancel
          </button>
          {onQueue && (
            <button type="button" onClick={queue} disabled={nRun === 0}
              title="Add to queue: line this bank up to run when the ones ahead of it finish — never fails for a busy GPU."
              className="min-h-10 rounded-md border border-border bg-surface-raised px-2 py-1.5 text-sm font-semibold text-content hover:bg-surface disabled:opacity-50 lg:min-h-0">
              Queue
            </button>
          )}
          <button type="button" onClick={launch} disabled={busy || nRun === 0}
            title={nRun ? `Launch ${nRun} pass${nRun > 1 ? 'es' : ''} now${nRun === nSent ? '' : ` (${nSent - nRun} recorded as skipped)`}` : 'Tick at least one pass'}
            className="min-h-10 whitespace-nowrap rounded-md bg-gradient-primary px-2 py-1.5 text-sm font-semibold text-gray-950 disabled:opacity-50 lg:min-h-0">
            <Rocket aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{busy ? 'Starting'
              : `Launch${nRun ? ` ${nRun === nSent ? nRun : `${nRun} of ${nSent}`}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
