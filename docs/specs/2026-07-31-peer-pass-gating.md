# Gating the Launch-all passes on the selected device

*2026-07-31*

## The defect

`LaunchAllDialog`'s readiness map decided whether a pass could run from
`const remote = deviceId && deviceId !== 'local'` — a truthy device id and
nothing else. So a peer reporting `bank_scoring: false` got ✨ Score **ticked for
the user**, the bank was staged across the network, and the pass died on the
first image as a mid-pipeline step error recorded in `pipeline_report`.

This was an over-correction of the opposite bug fixed hours earlier the same day:
🚩 Watermarks, 📐 Framing and 🏷️ Captions were gated on the LOCAL vision model
long after they learned to travel, so a hub with Ollama down badged them
"will skip" for work the peer would have run happily. Both versions answered the
question "can this pass run?" with something other than "what does the machine
that will run it say it has".

The data was already on the client and unused: `/api/cluster/devices` serialises
every peer's own capability blob (`cluster.list_devices`), but `DevicePicker`
handed its parent only the id string.

Backend side, `steps` were validated against the device **nowhere**.
`_remote_pass_device` answers one question — is this an `api:` backend id? — and
takes no steps at all. The only per-pass verification happened inside the running
job (`run_remote_pass(required_cap=…)`, and the implicit `'ollama'` in
`run_remote_vision`), i.e. after the bank had been staged.

## The rule

**The selected device decides.** If the chosen machine cannot run a pass, that
pass is greyed out, unticked and disabled; selecting *this machine* makes it
selectable again (not auto-re-ticked — the choice stays the user's).

That includes 🏷️ Captions. `_caption_job` can fall back to the hub when the peer
has no captioner, and it stays as a backstop for a capability lost between
enqueue and run — but it is no longer reachable from a fresh launch. With a peer
selected, captions run there or not at all.

**Only an explicit `false` refuses.** A peer that has never checked in reports
nothing; being unable to describe yourself is not the same as being unable to do
the work, and the hub would run that job happily. Unknown gets a note, not a wall.
This matches `_check_peer_capability`'s long-standing polarity (pinned by
`test_bank_remote_pass.py::test_hub_proceeds_when_the_peer_has_not_reported_yet`)
— and note `_peer_caption_kind` is fail-*closed* on the same input, which is
correct there because its fallback is local execution rather than a refusal.

## The map

Previously implicit, scattered across five call-site keyword arguments plus
`_peer_caption_kind`. Now explicit on both sides and pinned together by a drift
test:

| pass | required peer capability |
|---|---|
| `score` | `bank_scoring` |
| `faces` | `face_scoring` |
| `watermark` | `ollama` |
| `framing` | `ollama` |
| `caption` | `joycaption` **or** `ollama` |

`scan`, `auto_reject` and `semantic_dedup` are absent on purpose: they read the
hub's database and embeddings cache, never travel, and so cannot be blocked by a
device. `semantic_dedup` still follows Score's verdict (it consumes Score's
embeddings, which a remote run brings home) and declines itself when there are
none — the "stated prerequisite" case `pipelineVerdict.js` already renders as
*not* a fault.

## Where it lives

- `backend/app/services/bank_remote.py` — `PASS_PEER_CAPS`, `PASS_LABELS`,
  `peer_capabilities()`, `peer_refusal()`. `_check_peer_capability` now shares
  `peer_capabilities()` rather than re-reading the row.
- `backend/app/services/image_bank_service.py` — `refuse_steps_for_device()`,
  raising **`ValueError`** (not the `RuntimeError` `_check_peer_capability`
  raises): `ValueError` is what the routes turn into a 400 and what
  `enqueue_many`'s per-bank handler already catches. Called from the two existing
  validation seams, `start_pipeline` and `bank_queue.enqueue`, so Queue and
  Launch refuse identically.
- `frontend/src/components/bank/passDeviceGate.js` — `stepGate(key, {caps,
  visionReady, device})` → `{ok, blocked, reason, warn}`. `blocked` disables the
  checkbox; `ok: false` without `blocked` is the older, softer "will skip" state.
- `frontend/src/components/common/DevicePicker.jsx` — a new optional `onDevice`
  prop publishing the resolved device object. It fires from an effect, not from
  `onChange`, because the id is normally restored from `localStorage` and
  `onChange` never fires for that one — a restored peer being exactly the
  selection that must be gated.

## 2026-08-04: one function, not three

The map above was mirrored in JS and pinned by a test that string-parsed
`bank_remote.py`. That is gone. `bank_remote.device_pass_gate(device_id, step)`
is now the single answer, `/api/cluster/devices` ships each device's verdicts as
`device.passes`, and `passDeviceGate.stepGate` renders them.
`refuse_steps_for_device` calls the same function, so the dialog cannot offer a
pass the launch route refuses.

This is the sibling dataset-manager project's rule, ported:

> a picker that offers a machine the submit route would refuse is worse than no
> picker, because it turns a clear "you cannot" into a job that fails a minute
> later on someone else's screen.

**Unifying it found a real divergence.** `LOCAL_ONLY_STEPS` was checked inside
`start_pipeline` and nowhere else, so `bank_queue.enqueue` — which calls
`refuse_steps_for_device` and nothing more — accepted 🔖 Tags queued to a peer.
The section above claims the two paths "refuse identically". They did not. Both
go through the one gate now, and `test_pass_device_gate.py` pins it.

The two source-parsing tests were brittle in a way worth remembering as well: a
reformat, an inline comment or a `# noqa` inside either literal would have
broken them with no behaviour change at all.

## Known limits

- ~~The peer blob's `ollama` key means the **server answered**, not that the
  vision model is pulled.~~ **Fixed 2026-08-04**: `local_capabilities()` now
  requires `reachable` **and** `vision_model_ready`, both of which
  `capabilities.probe()` already computed. A peer with Ollama up and no model is
  refused at the picker instead of after the whole bank has been staged.
- `DevicePicker` persists to one global `lds.cluster.device_id` shared by three
  surfaces with two different `kind` filters. The reconciliation effect keeps an
  ineligible id from being posted, but the key is still shared.
- ~~The `(some passes)` suffix on an option says a peer is partial without
  saying which passes.~~ **Fixed 2026-08-04.** The argument for the vague label
  was that naming them in the `<option>` meant a second copy of the per-pass
  rule — true while the browser recomputed the verdict, and false once the
  server ships it. `devicePartialLabel` reads the served verdicts and names up
  to two passes, then counts. It also replaced a THIRD copy of the capability
  rule that lived in the option loop as a hand-listed
  `bank_scoring && face_scoring && ollama`, which no test pinned and which
  would not have noticed a newly gated pass.
