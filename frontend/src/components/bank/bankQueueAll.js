/* 🚀 Queue every bank — the decidable half.
 *
 * Queueing is not running: the queue drains ONE bank at a time, waiting for the
 * previous to finish and the GPU to be free. That is the whole reason this is
 * safe to offer as a single button, and the confirm has to say it — "run all"
 * on twelve banks is what people are (rightly) afraid of.
 */

import { untriagedCount } from './bankSort.js'

/** Banks worth queueing: the ones with undecided images that are not already in
 *  the queue. The SERVER decides for real (banks_needing_triage); this is what
 *  the confirm counts, so it must use the same rule or the sentence lies. */
export function queueAllCandidates(banks, queue) {
  const inQueue = new Set((queue?.items || []).map((i) => i.bank_id))
  return (banks || []).filter(
    (b) => untriagedCount(b) > 0 && !inQueue.has(b.id))
}

/** The confirm sentence, or null when there is nothing to ask about. */
export function queueAllConfirm(candidates, steps) {
  const n = (candidates || []).length
  if (!n) return null
  const passes = (steps || []).length
  return `Queue ${n} bank${n === 1 ? '' : 's'}?\n\n`
    + `They run ONE AT A TIME, in order — each waits for the previous to finish `
    + `and for the GPU to be free. Nothing starts in parallel.\n\n`
    + `${passes} pass${passes === 1 ? '' : 'es'} per bank. Banks with nothing left `
    + `to decide are skipped, and you can cancel any of them from the queue.`
}

/** The result toast, built from the SERVER's own counts.
 *
 *  Deliberately not from the candidate list: the client's idea of what is
 *  eligible can differ from the server's (a bank triaged in another tab, one
 *  queued a second ago), and the honest answer is to report what the server did.
 *  A disagreement is then visible instead of hidden behind a number we guessed. */
export function queueAllResult(response) {
  const queued = (response?.queued || []).length
  const skipped = (response?.skipped || []).length
  if (!queued && !skipped) {
    return { type: 'info', text: 'Nothing to queue — every bank is fully triaged.' }
  }
  if (!queued) {
    return { type: 'info', text: `Nothing queued — ${skipped} bank(s) were already in the queue.` }
  }
  const tail = skipped ? ` ${skipped} skipped (already queued).` : ''
  return {
    type: 'success',
    text: `${queued} bank(s) queued — they run one at a time.${tail}`,
  }
}
