/**
 * Run a slow refresh AFTER a burst of clicks, and never two at once.
 *
 * The full Bank payload takes seconds on a large bank. Keep and Reject must not
 * wait for it, and a run of quick decisions must not stack one such request per
 * click on the server. Calls within `delayMs` collapse into one run, and a call
 * made while a run is in flight earns exactly one more run after it.
 */
export function coalescedRun(run, delayMs = 1000) {
  let timer = null
  let running = false
  let again = false

  const fire = async () => {
    timer = null
    if (running) { again = true; return }
    running = true
    try {
      await run()
    } catch { /* the next decision or poll refreshes again */ }
    running = false
    if (again) { again = false; schedule() }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(fire, delayMs)
  }
  schedule.cancel = () => { clearTimeout(timer); timer = null; again = false }
  return schedule
}
