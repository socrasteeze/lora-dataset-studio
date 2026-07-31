# Hand-off: "I queued jobs and nothing ran for an hour"

Branch: `claude/db-lock-investigation`. Written for a session running on the
machine that actually reproduces this, with the real logs.

**Read this first:** the root cause is identified but **not yet fixed**. The
commits on this branch fix three *amplifiers* — real bugs, each verified — but
the thing that holds SQLite's single writer for 15-22 seconds is still in the
tree. It is described in §3 with file:line. That is where to start.

---

## 1. The symptom

Three diagnostics from the same Windows machine, ~90 min apart. Every one:

- jobs queued, **nothing ran**, for about an hour;
- ComfyUI idle the whole time (`queue 0 running / 0 pending`);
- `sqlite3.OperationalError: database is locked` raised out of
  `gpu_window._renew` → `job_queue._set_system_state`;
- `POST /api/cluster/peer/heartbeat` → **503** (a peer at `100.112.54.26`).

What differed between them, which is what made the diagnosis move:

| # | Time | Distinguishing detail |
|---|---|---|
| 1 | 18:14-18:48 | repeated `GET /api/banks` 503s |
| 2 | 19:18-19:19 | two renewal failures **16 s apart**; two `/api/banks` 503s **17 ms apart** (concurrent, not retries) |
| 3 | 20:50-20:58 | **no `/api/banks` 503 at all**; `ComfyUI VRAM freed successfully` (a vision window opening); a huge bank being browsed (bank 77, image ids in the 82,000s) |

The 15-22 s spacing is the tell: `busy_timeout` is **15000 ms**
(`backend/app/__init__.py:117`), so a waiter that dies at ~15 s means somebody
genuinely held the write lock that long.

---

## 2. Check this first — it may explain "nothing ran" on its own

Every diagnostic says `klein_model=no` while `default=klein` and
`default family=flux2klein`. **If the queued jobs were Klein, they had no model
to render with, lock storm or not.** Also present:

```
WARNING app.services.krea_edit_helper: krea.base_model
'E:\models\diffusion_models\krea' not found under any krea folder
```

Rule these out before spending time on SQLite. They are unrelated to the lock
and much cheaper to check.

---

## 3. THE LOCK HOLDER — not yet fixed

### Why any of this bites

Two facts combine:

1. Flask-SQLAlchemy runs with **defaults** — `backend/app/extensions.py:4` is a
   bare `SQLAlchemy()`, and `backend/app/__init__.py:364-365` sets only the URI
   and `check_same_thread`. So **`autoflush=True`** and
   **`expire_on_commit=True`**.
2. Every bank pass runs its whole body inside **one app context / one session**
   (`backend/app/services/bank_jobs.py:71-74`; `bank_queue._worker_loop:143`).

After a `commit()` every ORM object is expired, so the next attribute read
(`row.relpath`, `bank.source_path`) issues a SELECT, which **autoflushes** the
rows dirtied since that commit → the UPDATE lands → **the write transaction
opens** — and stays open until the next explicit `commit()`.

### The specific offender

`_framing_job` (`backend/app/services/image_bank_service.py:4694-4706`) and
`_watermark_job` (`:3990-4010`), both:

```python
row.framing = framing
classified += 1
if classified % 25 == 0:
    db.session.commit()
```

driven by `vision_pool.map_vision`
(`backend/app/services/vision_pool.py:188-196`), which refills the pool from a
generator that runs **on the job thread** and touches expired rows
(`abs_image_path(bank, row)` at `:4669` / `:3957`).

Per iteration: autoflush opens the write transaction → yield → caller dirties
the row → **`future.result()` blocks on an Ollama vision call with the write
transaction still held** → autoflush again → …, 24 times before the `% 25`
commit.

`vision_pool.py:11-13` measures its own throughput: *24 images took 41.2 s
sequentially and 20.3 s with 4 concurrent calls.* So **≈20 s of continuously
held write lock**, released for microseconds, then immediately reopened. That
is the 15-22 s spacing in the logs, and it explains why the peer heartbeat is
the consistent casualty.

**Second, independent bug in the same loop:** the counters only advance on
**success**. An error, a missing file or an empty Ollama reply hits
`errors += 1` / `missing += 1` / `pass` and never increments `classified`
(`:4689-4699`); the watermark pass sets `row.watermark_state = 'error'` at
`:3985` — dirtying a row — without incrementing `checked`. **A degraded Ollama
therefore stretches one transaction without bound.**

### Suggested fix (not applied)

Never let a transaction span a `future.result()`. Commit on every result rather
than every 25, or commit immediately before re-entering the `map_vision` loop.
Fix the success-only counter separately — it is what makes the window unbounded.

### Other holders found, ranked

| # | Where | Why it holds |
|---|---|---|
| 2 | `_register_bank` `image_bank_service.py:360-372` | `flush()` in the loop, **one** `commit()` at the end — up to `BANK_MAX_FILES = 50000` rows plus one `os.path.getsize()` each in a single transaction. `refresh_bank` already fixed exactly this and documents it at `:621-626`; `_register_bank` never got the fix. `split_folder_into_banks:482-488` calls it once per subfolder. |
| 3 | `_bank_promote_job` `:5960-5983` | commit every 200, with a **full file read + write** per row inside |
| 4 | `_watermark_crop_job` `:4229-4248` | commit every 25, PIL decode/crop/re-encode inside |
| 5 | `_scan_job` `:1782-1808` | commit every 25, blocks on the decode pool inside; scales badly on an 82k bank |

### Why the peer heartbeat is always the one that 503s

`services/cluster.py:516-524` writes three columns and commits — no network, no
probe, genuinely fast. It is a **victim, not a cause**. But it is the one write
surface with **no `write_with_retry`**, unlike every bank curation write. Same
for `pull_next_job` (`:606`, `:612` — two commits per pull), `peer_job_heartbeat`
(`:651`), `complete_cluster_job` (`:688`). Wrapping those converts a lost
heartbeat into a delayed one; it does not fix a 20 s hold.

### Ruled out (don't re-investigate)

- **Thumbnail serving is clean.** `routes/bank.py:1065` → `ensure_thumb`
  (`image_bank_service.py:1629-1649`) writes **nothing** to the DB — no lazy row,
  no cached-path column. 82k concurrent thumb GETs cost connections and CPU, not
  the write lock (WAL readers don't block the writer). I suspected this; it isn't.
- `prune_job_artifacts` (`cluster.py:117-173`) — boot-only, no pending writes.
- `activity_log`, `dataset_activity`, `bank_jobs` — **all in-memory**, zero DB
  writes. Progress reporting contributes nothing.
- No write→network→commit ordering bug anywhere. The problem is uniformly
  write→network→*more network*→commit-at-N.
- `busy_timeout` is set in exactly one place and never overridden. (Stale comment
  at `cloud_training.py:345` still says 5000 — it's 15000.)

---

## 4. What this branch fixes (all verified)

Each was verified by **reverting the fix and watching the new test fail**.

**`67182709` — a remote backend froze this machine** (Wave 1, independent of the
lock storm). `process_one`'s admission check, `has_comfyui_work` and
`vision_keepalive.gpu_is_contended` each asked "is the GPU busy?" without
filtering on `worker_id`, while `backend_worker` writes `processing` /
`sent_to_comfy` into the same shared table. So a remote render blocked local
generation, blocked a **training launch**, and unloaded the local vision model.
Now all three share `job_queue.local_rows_only()`. `README.md:292` and `:912`
had promised this behaviour since backends shipped.

**`c15c405e` — the GPU-window heartbeat gave up on the first collision**
(`gpu_window.py`). It exited, stranding the in-process fence, so `process_one`
refused every job for the rest of the pass. Renewal now goes through
`write_with_retry` and the beat tolerates `_HEARTBEAT_MAX_MISSES` transient
failures — but still stops on the **first genuine ownership loss**, the only
terminal case. Those two were one indistinguishable log line and are now
separate messages.

**`3821bf72` — an expired flag read wrote to the database.**
`_get_system_state` deleted-and-committed on reading an EXPIRED row. Contended,
the delete fails, the row stays expired, every polling reader retries forever.
Measured: **21 delete attempts across 21 reads → 1.** Expired rows now read as
absent without writing; cleanup backs off 30 s per key on a lock error (a benign
`StaleDataError` race does not back off).

**`cf79373b` — reverted a mis-diagnosis.** A floor on the bank-list folder walk.
It broke `test_image_bank_refresh.py::test_bank_list_ignores_the_cooldown`,
which deliberately asserts files dropped seconds ago show up. The test was
right. The SPA replay is capped at 2 retries / 400-800 ms
(`fetchClient.js:58-59`) — bounded, not a loop — and diagnostic #3 showed no
`/api/banks` 503 at all.

---

## 5. How to find it on the real machine

1. **Drop `busy_timeout`** temporarily (`backend/app/__init__.py:117`) to ~500 ms.
   The holder then surfaces in seconds instead of being absorbed.
2. **Log long transactions** — a SQLAlchemy `before_cursor_execute` /
   `after_cursor_execute` pair recording any transaction open longer than ~2 s,
   with the statement and the thread name. This is the measurement that turns
   §3 from "identified by reading" into "confirmed here".
3. **Correlate against a running vision pass.** If §3 is right, the storm should
   start when a framing/watermark/caption pass starts and stop when it ends.
   `ComfyUI VRAM freed successfully` in diagnostic #3 marks a window opening.
4. Then apply the §3 fix and re-measure.

---

## 6. The trap, twice

Two "obvious" causes did not survive the next log:

- **`/api/banks` forced re-walk** — reverted here. Diagnostic #1 made it look
  central; #3 showed no `/api/banks` 503 at all.
- **The first heartbeat regression test passed against the unfixed code**,
  because the beat interval is `max(floor, ttl/3)` and with `flag_ttl=6` no beat
  ever fired inside the test window. It proved nothing until the interval was
  pinned directly.

So: **verify every new test by reverting the fix and watching it fail.** All
five kept tests on this branch were verified that way. A test that passes both
ways is worse than no test.

---

## 7. State

- Branch: `claude/db-lock-investigation`, 6 commits ahead of `origin/main`.
- `main` is untouched at `origin/main`.
- Backend suite: **66 failures**, identical to the pre-existing Linux
  environment baseline — zero new. (That floor is environmental; CI runs the
  backend on `windows-latest`.)
- Frontend: lint clean, `node --test` 1946/1946, local-only contract 8/8.
- Not done: no release cut, and §3 is **not fixed**.
