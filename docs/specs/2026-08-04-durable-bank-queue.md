# The Launch-all queue survives a restart

**Date:** 2026-08-04
**Branch:** `claude/hub-peer-architecture-review-0ud684`
**Status:** implemented, tested.

## What was wrong

`bank_queue` was a module-level list and nothing else. Its own docstring said so
and treated it as a property:

> **In-memory ONLY** — the queue dies with the process; a restart starts empty
> (raw scores already committed stay, so a re-run only pays for what's missing).

That reasoning covers the **cost** of losing an entry. It does not cover losing
it **silently**, which is the actual failure: queue eleven banks, go to bed, the
machine reboots for an update, and by morning the panel is empty — no row, no
log line, no report saying anything was dropped. Nine hours of GPU time did not
happen and nothing anywhere says why. "It only pays for what is missing" is true
of a re-run somebody knows to start.

It was on the review's Wave 3 correctness list and again as Wave 5 item 3, both
times pointing at the same sentence.

## The shape

**The FIFO stays.** The lane, unit and atomic-claim logic in that module is
intricate and well covered — `_claim_next` alone exists because selecting
without claiming let two workers run the same entry. Moving the queue into SQL
would have rewritten all of it to fix a durability bug.

So every mutation is mirrored into a `BankQueueEntry` row beside it:

| | Holds |
|---|---|
| The list | The working copy — order, claim state, `waiting_for` |
| The table | The record — what has to outlive the process |

On boot `restore(app)` rebuilds the list from the table. That is the same shape
the sibling dataset-manager project uses for its own `cancel_requested`, for the
same reason: state that must outlive the process cannot live in the process.

Four hooks, one per way an entry leaves: `enqueue` inserts, `_remove` (the exit
every completed run takes), `cancel` and `clear` delete.

## Decisions worth keeping

**A running entry comes back pending.** The pipeline running it died with the
process, so nothing is running any more. Leaving it `running` would park its
lane behind a job that can never finish — the same shape as the peer job rows a
dead peer left claimed forever, which this project has already paid for once.
Re-running a partly-done bank is cheap by design.

**The device survives.** Without it a restart would silently repatriate a whole
overnight queue onto this machine — the exact outcome renting a second machine
exists to avoid, and it would read as the queue merely being slow.

**A durable write that fails never breaks the queue.** The record is worth
having; it is not worth failing a launch for. Each write is wrapped in
`_safely`, which logs and swallows — the same treatment this module already
gives its activity-log mirror. A failure there loses the restart-resume for one
entry, never the entry.

**Deletes are keyed on `bank_id`, not on the stashed row id.** So an entry whose
insert failed still cleans up, and a row left behind by a crash mid-`_remove`
cannot resurrect the bank at the next boot.

**`restore` is idempotent.** Boot is not guaranteed to be its only caller, and a
second restore that doubled the queue would run every bank in it twice.

**The insert re-checks the queue after it lands.** The row cannot be written
under `_lock` — `_claim_next` runs there — so the insert happens after the lock
is released, and a worker left alive by an earlier `enqueue` can claim, run and
remove the entry in that gap. `_remove`'s delete then finds no row yet, the
insert lands after it, and the next boot re-runs a bank that already finished.
The window is microseconds wide and was never observed; it is closed rather than
written down because the failure is invisible — the bank simply runs again one
morning, and nothing connects that to a restart.

## What is NOT stored

`claimed`, `waiting_for` and the worker threads. All three describe a process
that no longer exists.
