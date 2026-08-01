# One lane per machine in the bank queue

*2026-07-31*

## The defect

`_ensure_worker` started **one** thread and `_process_next` was *"process
exactly one queued bank end to end"*, closing with
`while bank_jobs.running(bank_id): sleep`. A bank queued to a compute peer
already skipped the local-GPU gate — but it still had to wait for that single
thread, so renting a second machine bought nothing in wall-clock. Reported as
*"if I queue jobs to peer it still treats it as part of primary queue and doesn't
run in parallel"*, and confirmed exactly as described.

## The rule

Stated by the owner: *"A bank can only be processed by 1 gpu/system at once. 2
separate banks are fine, but the same bank (including merged banks since they are
now being counted as 1) cannot be split and processed simultaneously."*

- **This machine is one lane** and stays strictly serial. Two local banks never
  overlap, exactly as before — that is now the only thing keeping two pipelines
  off one card, so it is load-bearing rather than incidental.
- **Each distinct peer gets one lane.** One and no more: a peer pulls one job at
  a time (`peer_worker`), so a second lane aimed at it would not run in parallel
  — it would queue *on the peer*, out of sight of this queue's own reporting.
- **A merged group is one unit** across every lane.

## Design

**Lanes are derived, never stored.** `_lane_of(entry)` is
`entry.get('device_id') or 'local'`. `device_id` is already folded to `None` for
every spelling of "this machine" by `_normalized_device`, so there is no new
entry key — which matters because two tests hand-build entry dicts and two more
call `_process_next` directly on a bare thread.

**The lane rides in a `threading.local()`**, so `_process_next(app)` stays a
one-arg module-level callable. Four test files stub it to suppress the drain; no
test patches `_ensure_worker`, so that is the seam that had to survive.

**The claim became atomic.** `_next_pending` selected without claiming, and
`_lock` was released across the whole wait loop — two workers would have received
the *same object*, both passed the `_find(bank_id) is not entry` identity check,
both set `state='running'`, and the loser's `BankJobBusy` handler would have
reset it to `'pending'` while the winner was running it. `_claim_next(lane)`
selects **and** marks under one `_lock` acquisition. The claim is read with
`.get()` so older entry dicts still work, and the `BankJobBusy` path releases it.

**`_unit_of(entry)`** is `group:<key>` or `bank:<id>`. `bank_queue` contained
zero references to groups: `routes/bank.py` expands a group with
`bank_groups.member_ids` and hands the queue N independent entries, so the
one-at-a-time rule held only by accident of the single worker. `enqueue` now
records `group_key` — server-derived, never client-supplied, the same rule
`member_ids` documents — and `_claim_next` skips an entry whose unit is already
live in **any** lane. An ungrouped bank is a group of one, so there is no special
case.

**A blocked lane must not end its drain.** A lane whose only work is held by
another lane's group would otherwise return `False`, `_drain` would exit, the
worker would die, and nothing would restart it when the group freed up. It sleeps
and returns `True` instead; only a lane with nothing pending is done.

## Compatibility, verified against the tests rather than assumed

| constraint | how it holds |
|---|---|
| `_process_next(app)` one-arg | lane in a `threading.local()` |
| `_lock` / `_queue` / `_POLL_SECONDS` module-level and test-mutable | unchanged |
| entry dict's creation keys; `waiting_for` written in place | unchanged; `group_key` and the claim read via `.get()` |
| TESTING drains synchronously inside `enqueue` | `_claim_next(None)` walks every lane on the caller's thread |
| `enqueue_many` positions `[1, 2, 3]`; global 1-based `position` | unchanged |
| `snapshot()['running_bank_id']` | kept (first running); `running_bank_ids` added |
| `start_pipeline` positional call | unchanged |
| activity strings | unchanged |
| `clear()` step 1 of `global_stop` | unchanged; its `running_ids` list already handled N |

## The panel

`snapshot()` had published `device_id` and `waiting_for` all along and
`QueuePanel` rendered neither — `waiting_for` was read **nowhere** in
`frontend/src` despite `snapshot()`'s own comment claiming the panel showed it.
Twelve banks queued to a peer looked byte-identical to twelve local ones, and a
queue stalled on a stuck GPU flag looked simply dead. With two lanes live, two
`running` rows would have been indistinguishable, so the panel now names the
machine (`device_label`, added to the snapshot so no second fetch is needed) and
shows what a waiting bank is waiting for.

## Known limits

- `group_key` is read at **enqueue** time, because `_claim_next` runs under
  `_lock` and must not issue a query there. A bank renamed *between* being queued
  and being run keeps its old key — the group rule then treats it as its own
  unit, which is the safe direction: it can only ever run alone.
- Two lanes aimed at the same peer are deliberately impossible; the concurrency
  ceiling is one local plus one per distinct peer.
- SQLite write contention is the one thing two concurrent pipelines genuinely
  share. WAL is on and `busy_timeout` is 15 s, but `apply_flags` and
  `resolve_dups` still wrap a whole bank's mutations in a single
  `write_with_retry`. If `database is locked` reappears, that pair is where to
  look first, and `LDS_DB_TRACE=2` will name it.
- No reaper for a peer that dies mid-`comfy` job: the `ClusterJob` stays
  `running` and its queue row stays `pending`.
