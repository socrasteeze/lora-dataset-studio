# Hand-off: pass coverage, identity-pass reuse, honest remote failures

> **Status on merge (2026-08-01). Parts 1 and 2 are DONE; Part 3 is the open
> work.** This was written from a static read of an earlier `main`, and the
> present tense below is now wrong for two of its three parts. Read it as a
> record of the reasoning, not of the current code.
>
> * **Part 1 — identity-pass reuse: shipped** in `d3a39b87`. The root cause was
>   worse than described: `_install_cache` wrote a fixed
>   `paths/states/embs/sigs` schema, so a returned faces cache was missing
>   `dets`/`bfracs`, unreadable by `face_embed_infer._load_cache` — and it
>   OVERWROTE the good local cache. The hub now ships its cache to the peer and
>   stops uploading the images it covers, and Stop waits for the peer to hand
>   back what it finished.
> * **Part 2 — honest remote failures: shipped** in `6ec8cefb`. The fabricated
>   `rc=0` is gone, and the actual cause was the peer parsing its whole stdout
>   buffer as JSON while InsightFace printed a banner ahead of the result.
> * **Part 3 — pass coverage and "queue only what's missing": NOT started.**
>   Everything from `## Part 3` down still stands.
>
> **One divergence worth knowing before implementing anything here.** Part 1
> proposed an id-keyed cache with `sigs` and a version inside
> `face_embed_infer.py`. That script was NOT changed. The hub re-keys the cache
> to artifact names on the way out and blanks the signatures — the case
> `_is_stale` already documents as never-stale — enforcing freshness itself,
> against its own files, before an entry is shipped. Same outcome, without
> editing a dedicated-interpreter script that cannot be run from the Flask venv.
>
> Not repairable by any of the above: caches already corrupted by the old
> installer are missing arrays that were never uploaded. Those banks pay one
> more full pass.

Written from a static read of `main`; line numbers may drift. Claims marked
**[VERIFY]** are inferences that someone with the running app and real peer logs
should confirm before implementing.

## Why

Three related problems, all surfaced by re-running passes across a hub + peer
setup.

1. **Wasted identity work.** The priority passes are the ones that establish
   *image identity* — duplicates, face detection, person grouping. Today a
   faces run dispatched to a peer cannot reuse any prior embedding work, so
   every re-run pays full GPU cost. The root cause is a bug, not a design
   choice.
2. **`👥 Group by person` fails with `RuntimeError: face pass produced no
   output (rc=0)`** on peer runs. The `rc=0` in that message is fabricated, so
   the error tells the user — and any diagnostician — nothing true.
3. **"Queue all banks" is blind to what has already been done.** It queues the
   same step list at every eligible bank regardless of prior work, and its
   eligibility rule excludes exactly the banks worth re-targeting.

Intended outcome: re-running a pass costs only the work that is genuinely
missing; a failed remote pass says what actually failed; and queue-all can be
pointed at "everything that hasn't had a face pass yet" without re-running the
banks that have.

---

## Part 1 — Identity-pass reuse

### What is actually broken

The per-image skip for the faces pass **already exists** and is already in the
right place. `backend/infer/face_embed_infer.py:157` does
`todo = [p for p in images if p not in cache]` — it receives the full image
list, embeds only the uncached ones, then clusters over *everything*. That is
precisely the correct split, because clustering is global (see below).

It never pays off, for three separate reasons:

1. **The remote round-trip silently discards the cache.**
   `bank_remote.py::_install_cache` (~:401-443) writes back only
   `paths / states / embs / sigs`, but the face-cache reader requires `dets`
   and `bfracs` too (`face_embed_infer.py:69-70`). A returned face cache is
   therefore unreadable and is silently recomputed from scratch. **Every peer
   faces run re-embeds the entire bank, every time.** This single bug is
   probably most of the wasted cost.
2. **The cache key is a machine-local absolute path.** Even with #1 fixed, a
   cache built on the hub is keyed by hub paths and is useless to a peer, and
   vice versa.
3. **The face cache has no freshness signature.** The score cache carries a
   `sigs` array of `f'{size}:{mtime_ns}'`
   (`image_bank_service.py:~2036-2045`); the face cache has none, so an edited
   image is never re-embedded.

### Fix

**1a. Re-key both caches on `bank_image.id`, not on a filesystem path.**
`bank_image.id` is the durable identity: `sync_bank_folder`
(`image_bank_service.py:~550-632`) is documented as *strictly additive* — rows
are never deleted, so ids survive re-scans. Remote staging already carries the
id in the artifact name (`_artifact_name`, `bank_remote.py:12-14`), so the id
is available on both sides.

Store alongside each entry a `sig` of `f'{size}:{mtime_ns}'` (the same shape
the score cache already uses) and treat a changed sig as a cache miss.

Keep the npz-in-the-bank-dir shape (`_face_cache_path` :194,
`_score_cache_path` :198) — no new DB columns. The payload is ~1 KB/image and
does not belong in the row table.

**1b. Fix `_install_cache` to carry the full face-cache schema** (`dets`,
`bfracs`) so a peer's work survives the trip home. Add a test that round-trips
a face cache through `_install_cache` and asserts the result is *readable* by
the reader in `face_embed_infer.py` — the current failure is silent, so only an
end-to-end readback test catches it.

**1c. Add a cache-version key** to both npz files. Re-keying invalidates every
existing cache; a version stamp makes that a clean one-time recompute rather
than a mysterious mismatch.

### What must NOT be skipped

Both of the other priority passes are **bank-global reductions**, and skipping
them per-image would produce wrong answers:

- **Person clustering** (`face_embed_infer.py::_cluster` :95-133) is union-find
  over the whole requested set, and cluster ids are ranked by cluster size
  (:128-132). Adding one image can merge components and **renumber every person
  in the bank**. `image_bank_service.py:~3690` already says so: *"One job for
  the whole pass — chunking would break the person clustering."*
- **Duplicates**, both stages, fully rebuild: `rebuild_dup_groups`
  (:~1895-1957) nulls `dup_group` bank-wide before reassigning; the semantic
  stage's own docstring says *"A re-run fully recomputes."*

The rule is: **skip the per-image embedding, always re-run the reduction.**
Once 1a/1b land, the reduction is cheap — it reads embeddings from cache and
does no GPU work.

**Do not** add a `face_state IS NOT NULL` filter to `_faces_job`'s pool query.
It would narrow the set handed to the clustering step and silently corrupt
person assignments. The pool query stays as it is; the cache does the skipping.

---

## Part 2 — Honest remote-pass failures

### The error path today

`image_bank_service.py::_faces_job`:

```python
# ~:3706  remote branch
stderr_tail, returncode = [], 0          # hard-coded, NOT the peer's rc
...
# ~:3736-3739
if not data.get('ok'):
    tail = data.get('error') or (stderr_tail[-1] if stderr_tail else '')
    raise RuntimeError(tail or f'face pass produced no output (rc={returncode})')
```

`rc=0` is a local placeholder. For any remote run the reported return code is
**always 0 and always meaningless**. Reaching this branch at all means the
`ClusterJob` completed successfully yet the uploaded `infer_result.json` had
neither `ok` nor `error` — a state `face_embed_infer.py` says cannot happen
(`main()` prints exactly one JSON line carrying `ok` on all six exit paths).

### Fix, at three layers

**2a. Stop the peer from reporting success with no output.**
`peer_worker.py:~609-612` does
`result_obj = json.loads(stdout) if stdout.strip() else {}` and then completes
the job as `'completed'`. An empty or unparseable stdout on `rc==0` is a
contract violation, not a result — complete the job with an **error** naming
the rc, the stdout byte count, and the stderr tail. This converts a silent
mystery into a specific failure at the only place that still has the evidence.

Also parse **the last non-empty stdout line**, not the whole buffer: a stray
`print()` or dependency banner on stdout currently breaks `json.loads` and
lands in the same silent `{}`. **[VERIFY]** against real peer logs which of the
two it actually was.

**2b. Validate the artifact when the hub reads it.**
`bank_remote.py::_read_result` (~:377-384) returns whatever it finds. Have it
raise a specific error when the artifact is missing, zero-length, unparseable,
or lacks both `ok` and `error` — naming the `job_id` and the byte count. That
distinguishes "peer never wrote it", "upload truncated", and "peer wrote
nonsense", which the current message cannot.

**2c. Carry the peer's real rc and stderr tail home.** Put them in the result
artifact on the peer side and surface them in the hub-side message, replacing
the hard-coded `returncode = 0`. If a real rc is genuinely unavailable, the
message must say so rather than print a fake one.

**2d. Tests.** `backend/tests/test_bank_remote_pass.py` already covers
missing-capability refusal, wrong-interpreter routing, and named
`ModuleNotFoundError`. Add: peer completes with empty stdout; artifact present
but zero-length; artifact parses but has no `ok`/`error`; stdout with a leading
non-JSON line. Each must produce a distinct, specific message — and none may
contain a fabricated `rc=`.

---

## Part 3 — Pass coverage and "queue only what's missing"

### 3a. One canonical coverage predicate

Add a single table in `image_bank_service.py` mapping each pipeline step to its
"this image still needs the pass" predicate, evaluated over
`status != 'reject'`:

| step | pending predicate | exists today? |
|---|---|---|
| `scan` | `quality_state IS NULL` | yes — `_scan_pool` :~1769-1793 |
| `score` | `aesthetic_score IS NULL` | **no filter today** |
| `faces` | `face_state IS NULL` | cache-level only (Part 1) |
| `watermark` | `watermark_state IS NULL` | yes — `_watermark_scan_query` :~4046 |
| `framing` | `framing IS NULL` | yes — :~4991 |
| `caption` | `caption` empty | yes — :~5232 |
| `semantic_dedup` | bank-global — see below | n/a |
| `auto_reject` | always runs (DB-only, cheap) | n/a |

`face_state` is the right marker and needs no new schema: it is `NULL` only if
the pass never ran, and `'no_face'` when the pass ran and found nothing
(`models.py:313-317`). `face_cluster` is **not** a valid marker — it is `NULL`
both for "unclustered" and "never processed".

For `semantic_dedup`, "pending" means the bank has embedded rows with no
`semantic_dup_group`, or rows added since the last run. **[VERIFY]** there is a
cheap way to express this; if not, treat it as always-pending and say so in the
UI rather than guessing.

This one table then serves **both** features: it is the per-image skip filter
inside a pass *and* the bank-level coverage rollup for queue-all. Adding the
missing `score` filter is a direct win on its own.

### 3b. Expose coverage

New `bank_pass_coverage(bank_ids)` returning, per bank per step,
`{pending, done, complete}`. **Must be one aggregate query across all banks**,
not N banks × 8 passes of `COUNT(*)` — the bank list renders this. **[VERIFY]**
the query plan against a realistically sized DB; this is the main perf risk in
the whole spec.

Surface it on `GET /api/banks` so the bank list can show per-pass badges
("👥 done · ✨ 240 pending"), so coverage is visible without queueing anything.
Arguably the most valuable single deliverable here.

### 3c. Fix queue-all eligibility

`banks_needing_triage` (`image_bank_service.py:~1429-1446`) currently makes a
bank eligible iff it has undecided images (`total - (keep + reject) > 0`).
**A fully triaged bank that has never had a face pass is invisible to queue-all
today** — which is exactly the case worth fixing. Eligibility must become: *has
pending work for at least one selected step*, computed from 3a.

### 3d. Narrow steps per bank

`bank_queue.enqueue_many` (`bank_queue.py:189-223`) gains `skip_completed`
(default on). For each bank, narrow the sanitized step list to steps with
`pending > 0`; if nothing remains, skip that bank with reason
`'all selected passes already done'` — reusing the existing per-bank
skip-reason channel, which already reports `already queued` and per-bank
`ValueError`s.

### 3e. The hub-only vs peer conflict

`PASS_PEER_CAPS` (`bank_remote.py:~88-94`) is already the canonical
pass → capability map. Peer-capable: `score` (`bank_scoring`), `faces`
(`face_scoring`), `watermark`/`framing` (`ollama`), `caption`
(`joycaption`|`ollama`). Hub-only: `scan`, `auto_reject`, `semantic_dedup`.

`refuse_steps_for_device` currently raises `ValueError`, which drops the whole
bank from the batch. Keep that refusal — silently dropping a requested pass
would be worse — but make it visible **before** enqueueing.

Add a **dry-run preview** (`POST .../queue/all?preview=1` or an equivalent
read-only call) that returns exactly what would happen, and show it in
`LaunchAllDialog` above the confirm button:

```
12 banks eligible
  👥 Group by person   8 banks   (4 already complete)
  ✨ Score             3 banks
  ✂ Crops & variants   — hub-only, skipped: you picked peer-2
```

Per `CLAUDE.md` ("every limit stays visible"), dropped hub-only steps must be
named, not quietly omitted.

**Deliberately out of scope for v1:** splitting one bank's run across two
machines (identity passes on a peer, hub-only passes locally). `enqueue`
enforces one live entry per bank (`BankAlreadyQueued`, `_find` :127-132) and
lanes are per-device (`_lane_of` :226-233), so a split needs queue-engine
surgery. v1 answer: run the batch at the peer, then run a second batch locally
for the hub-only remainder — which the preview makes obvious. Note the limit in
the UI copy.

---

## Files

- `backend/app/services/image_bank_service.py` — coverage predicate table,
  `bank_pass_coverage`, `score` pending filter, `banks_needing_triage`
  eligibility, `_faces_job` remote error path.
- `backend/app/services/bank_remote.py` — `_install_cache` schema fix,
  `_read_result` validation.
- `backend/app/services/peer_worker.py` — `_run_infer` empty/unparseable stdout
  → error; last-line JSON parse.
- `backend/infer/face_embed_infer.py` — id-keyed cache + `sigs` + version.
- `backend/app/services/bank_queue.py` — `enqueue_many(skip_completed=…)`.
- `backend/app/routes/bank.py` — coverage on the bank list; queue-all preview.
- `frontend/src/pages/BankPage.jsx`,
  `frontend/src/components/bank/LaunchAllDialog.jsx`,
  `frontend/src/components/bank/bankQueueAll.js` — preview UI, per-pass badges.

## Verification

1. `cd backend && python -m pytest` — green before commit.
2. `cd frontend && node --test` and `npm run lint` (ESLint `no-undef`).
3. **Cache round-trip:** run faces on a peer, confirm the returned face cache is
   readable on the hub, then re-run and confirm the second run embeds ~0 images
   while still re-clustering the full bank.
4. **Cluster integrity:** with a partially cached bank, assert person cluster
   ids match what a from-scratch run produces on the same image set.
5. **Failure honesty:** force each of the four Part-2 failure modes and confirm
   four distinct messages, none containing a fabricated `rc=`.
6. **Coverage:** a bank with every pass done reports `complete` for each and is
   skipped by queue-all with the right reason; a fully triaged but never
   face-passed bank *is* eligible (3c).
7. Shipping checklist per `CLAUDE.md`: What's-new entries for the user-visible
   parts (coverage badges, queue-only-missing, honest remote errors),
   help-registry topics for any new setting/control,
   `docs/guide/settings-reference.md` if a setting changes, README only if
   capability changes, and a separate `build(frontend):` dist commit at the end
   of the wave.

## Sequencing

Part 2 first (small, isolated, and it makes Part 1's failures legible), then
Part 1 (the real cost win), then Part 3 (largest surface, depends on 3a).
Parts 1 and 2 are independently shippable.

## State

Parts 1 and 2 are implemented and on `main` — see the status block at the top of
this file for what actually shipped and where it diverged from the proposal.
Part 3 is untouched: it is the largest surface here and the only part still
worth reading as a plan rather than as history.

Sequencing above is therefore spent. The remaining order is 3a (the coverage
predicate table) → 3b (the aggregate query, whose plan is the one real
performance risk) → 3c/3d → the UI.
