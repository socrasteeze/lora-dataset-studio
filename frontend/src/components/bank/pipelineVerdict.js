/* Did last night's Launch-all actually do anything? — pure logic.
 *
 * Every pipeline step records its own outcome into `ImageBank.pipeline_report`,
 * but that report was only ever shown INSIDE the bank's workspace. On the bank
 * list a run where every GPU pass was skipped for "GPU busy" looked exactly like
 * a clean one. A bank you launch by hand you watch; twelve queued overnight you
 * do not — which is why queue-all is what makes this urgent.
 *
 * SKIPPED IS NOT FAILED, and the whole value is in that distinction.
 * `semantic_dedup` skipped because Score has not run yet is the pipeline working
 * as designed — nagging about it would train people to ignore the badge. Every
 * GPU pass skipped because the GPU was busy means the night was wasted. So the
 * verdict separates a step that declined itself from one the machine refused.
 */

/** Reasons that mean "this pass could not run because something else had the
 *  machine" — the ones worth waking someone for.
 *
 *  A FALLBACK ONLY. `pipeline_report` is persisted JSON, so every run already in
 *  a user's database carries prose and nothing else; new runs carry an explicit
 *  `blocked` flag from the backend and never reach this regex.
 *
 *  It also used to be wrong in the way that mattered most. `GPU busy — …` is
 *  what _pipeline_job writes when the window raises MID-flight, but the common
 *  path is the PRE-flight gate in _run_pipeline_step, which records
 *  _gpu_busy_reason()'s own words — "a vision/GPU pass is already running…",
 *  "training is running on the GPU…" — and neither matched. So a bank whose
 *  Score, Watermarks, Framing and Captions were every one of them skipped for a
 *  busy card rendered a clean tick: precisely the wasted night this file exists
 *  to expose.
 *
 *  `cancelled before it ran` is deliberately NOT here, though this docstring
 *  used to claim it was: a run the user stopped on purpose is not a fault, and
 *  badging it would be nagging someone about their own decision. */
const BLOCKED_RE = /gpu busy|not reached|is already running|is running on the gpu/i

/** Did the MACHINE refuse this step, as opposed to the step declining itself?
 *  Prefer the backend's explicit verdict; fall back to reading its prose. */
function wasBlocked(step) {
  if (typeof step?.blocked === 'boolean') return step.blocked
  return BLOCKED_RE.test(String(step?.reason || ''))
}

/** {state, errors, skipped, blocked, first_reason} for a stored pipeline_report.
 *
 *  state:
 *    'error'   at least one step threw
 *    'partial' at least one step was blocked by the machine (GPU busy / never
 *              reached) — the night did less than it looked like
 *    'ok'      everything ran, or only declined itself for a stated prerequisite
 *
 *  null when there is no report at all: a bank that never ran a pipeline has no
 *  verdict, and inventing 'ok' for it would put a green tick on nothing. */
export function pipelineReportVerdict(report) {
  const steps = report?.steps
  if (!Array.isArray(steps) || steps.length === 0) return null
  const errored = steps.filter((s) => s?.status === 'error')
  const skipped = steps.filter((s) => s?.status === 'skipped' || s?.status === 'cancelled')
  const blocked = skipped.filter(wasBlocked)
  const worst = errored[0] || blocked[0] || null
  return {
    state: errored.length ? 'error' : blocked.length ? 'partial' : 'ok',
    errors: errored.length,
    skipped: skipped.length,
    blocked: blocked.length,
    cancelled: Boolean(report?.cancelled),
    first_reason: worst ? String(worst.reason || '') : null,
    first_step: worst ? String(worst.step || '') : null,
  }
}

/** The badge for a bank card, or null when there is nothing worth a badge.
 *  A clean run gets NO badge: a green tick on every card is noise, and it would
 *  make the one amber card harder to spot, not easier. */
export function pipelineBadge(verdict) {
  if (!verdict || verdict.state === 'ok') return null
  if (verdict.state === 'error') {
    return {
      tone: 'error',
      label: `⚠ ${verdict.errors} step${verdict.errors === 1 ? '' : 's'} failed`,
      title: verdict.first_reason
        ? `${verdict.first_step}: ${verdict.first_reason}`
        : 'The last Launch-all had a step fail. Open the bank for the report.',
    }
  }
  return {
    tone: 'warn',
    label: `⚠ ${verdict.blocked} pass${verdict.blocked === 1 ? '' : 'es'} skipped`,
    title: verdict.first_reason
      ? `${verdict.first_step}: ${verdict.first_reason}`
      : 'The last Launch-all could not run every pass. Open the bank for the report.',
  }
}

/** The queue panel's closing line: what became of the banks that just drained.
 *  "N finished" alone is what let a wasted night pass for a good one. */
export function queueOutcomeLine(verdicts) {
  const list = (verdicts || []).filter(Boolean)
  if (!list.length) return null
  const bad = list.filter((v) => v.state !== 'ok').length
  if (!bad) return `${list.length} finished.`
  return `${list.length - bad} finished, ${bad} with problems — open them for the report.`
}
