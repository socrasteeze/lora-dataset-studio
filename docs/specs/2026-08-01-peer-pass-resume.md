# A pass run on another machine is not paid for twice

Shipped 2026-08-01 (`6ec8cefb`, `d3a39b87`, `8a3bf8b6`). Written after the fact,
because the design decisions here are the kind that get re-litigated by whoever
touches this next — and two of them look wrong until you know why they are not.

## What was actually broken

Four independent holes, found while answering "does a peer pass cache anything".
Evidence in each case came from the artifacts on disk, not from reading code.

1. **A peer faces pass corrupted the hub's cache.** `_install_cache` wrote a
   fixed `paths/states/embs/sigs` schema. That is the score cache's shape minus
   its scores, and not the faces cache's shape at all —
   `face_embed_infer._load_cache` also reads `dets` and `bfracs`. The installed
   file raised, logged *"cache unreadable, recomputing"*, returned `{}` — and it
   had already OVERWRITTEN the good local cache. On this fork's own data at the
   time: bank 11 (local run) carried `bfracs/dets/embs/paths/states`; banks 10,
   12, 13, 14 and 15 (peer runs) carried `embs/paths/sigs/states`.
2. **Stop discarded work the peer had already handed back.** 73 orphaned `.npz`
   files under `data/cluster_artifacts/` were the receipts.
3. **The hub never sent its cache**, so a peer started empty every time.
4. **Every image was uploaded every time**, including ones already embedded.

And, found while fixing the above: **every vision pass on a peer was returning
nothing at all.** The peer writes `vision_result.json` as `{"items": […]}`; the
hub read `data["results"]`, found nothing, and every row came back as "the peer
never answered" — which each caller correctly treats as leave-this-row-alone. So
framing, watermark scans and Ollama captions ran on the peer, reported success,
and changed zero rows. Invisible because every test of `run_remote_vision` stubs
the function itself.

## The decisions that look wrong

**Signatures are BLANKED in the cache we ship to a peer.** The obvious move is to
send the hub's signatures. It defeats the entire feature: the peer's copies are
the same bytes with different mtimes, so every entry reads as stale there and is
recomputed. An empty sig is the case `_is_stale` already documents as never
stale. Freshness is still enforced — by the hub, against its own files, before an
entry is shipped at all. A test pins that an edited image is still re-sent.

**The cache is re-keyed to artifact names, not hub paths.** The peer compares
`p not in cache` against the names it downloaded. Hub paths match nothing there.
`_install_cache` performs the exact inverse on the way home.

**`_install_cache` copies every array it receives** and rewrites only `paths`.
It must not assume a schema: that assumption is bug 1. `sigs` is recomputed only
when the source had a `sigs` array, so a faces cache does not acquire one and
stop matching what its own script writes.

**Stop waits on the ARTIFACT, never the job row.** `cancel_cluster_job` sets the
row to `cancelled` immediately and `complete_cluster_job` returns early on a
terminal row, so the status can never reach `completed` after a Stop — polling it
would burn the whole grace, every time. `peer_worker` uploads the result JSON
*last*, after `out/`, which makes its arrival the "all of it is home" marker.

**A subset of images may only be sent WITH the cache.** Faces clustering runs
over every embedding the script can see; a peer sent the new images and no cache
would return different person groups, silently. `_ship_cache` therefore returns
the file and the covered set *together*, and the stage list is derived from that
set alone. This is structural, not a comment — the two cannot drift apart.

**The pass's own row selection is untouched.** ✨ Score computes style clusters
exactly as faces computes people, so a `aesthetic_score IS NULL` filter inside
the pass would change the grouping. The only per-image skip that is safe is the
cache, because it does not change what the pass sees. The DB predicate is a
queueing decision only — see `2026-08-01-pass-coverage-hardening.md`.

## Not repairable

Caches already corrupted by bug 1 are missing arrays that were never uploaded.
Those banks pay one more full pass. Said in the What's-new entry rather than left
for the user to discover as "the resume feature does not work".

## Verification

`backend/tests/test_bank_remote_resume.py` drives the REAL cache readers out of
`backend/infer/` rather than reimplementing them — the whole of bug 1 was a
second copy of a schema drifting from the first. Every test was checked against
the specific wrong implementation it guards: the lossy install schema, raising
on Stop instead of waiting, not shipping the cache, shipping hub sigs, skipping
the freshness check, and the vision result key.

The round trip itself is only provable on two real machines: after a successful
peer faces pass, `data/banks/<id>/face_cache.npz` must carry `dets` and
`bfracs`, and a second run must stage far fewer images.

## Still open

There is **no version handshake between a Primary and its peers**. A peer on
older code is survivable — the result parser is tolerant, and the vision reader
falls back to the older key — but nothing detects or reports a mixed-version
cluster.
