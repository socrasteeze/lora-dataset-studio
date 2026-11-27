/**
 * ▶ Review — the Bank's fast-triage lightbox.
 *
 * One full-size image at a time with ✓ Keep / ✕ Reject / ⏭ Skip; every button
 * (and its keyboard shortcut) decides AND moves on, so a 3 000-image dump is
 * worked through without ever going back to the grid. "Random order"
 * shuffles what's left instead of walking the folder sequentially — on a dump
 * that means a representative sample straight away rather than 200 near-
 * identical frames in a row.
 *
 * All of the ordering logic (snapshot, shuffle, skip, end of pool) lives in the
 * JSX-free `bankReview.js` so `node --test` covers it. This file is the shell:
 * rendering, keyboard, and the one-POST-per-decision network lane.
 *
 * Decisions are sent IMMEDIATELY, one image per POST: closing after 50 calls
 * loses nothing. A POST that fails does NOT advance — the image stays under the
 * cursor with the error visible, so a decision is never silently dropped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag as FlagIcon, PartyPopper, Shuffle } from 'lucide-react';
import { useToast } from '../common/Toast'
import PluginSlot from '../../plugins/PluginSlot.jsx'
import { contributionKey, createLayerTracker } from '../../plugins/layerTracker.js'
import { apiFetch, postJson } from '../../api/fetchClient'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import {
  createSession, currentId, isFinished, progress, back, decide, skip, setShuffle,
} from './bankReview.js'
import {
  DETAIL_CAVEAT, PROVENANCE_FLAG_LABEL, detailSummary, originHint, originLabel,
} from './bankProvenance.js'
import BankWatermarkMaskDialog from './BankWatermarkMaskDialog'
import CropModal from '../dataset/CropModal.jsx'
import SourceAttribution from '../dataset/SourceAttribution'
import { canEditMask, maskButtonLabel } from './bankWatermarkMask.js'
import { dupStateSuffix } from './bankDupBadge.js'
import { cropOutcomeMessage, imageVersionQuery } from './bankEdits.js'
import { ownsTypedKeys, reviewKeyAction } from '../shared/reviewShortcuts.js'
import { useReviewImagePreload } from '../shared/useReviewImagePreload.js'
import ShortcutKey from '../shared/ShortcutKey'
import BankEditComparison from './BankEditComparison.jsx'

// How many upcoming images we pull metadata for in one go (the decision helpers
// below the image). The grid page only holds the ids it rendered.
const META_WINDOW = 40
const EDIT_BUTTON = 'inline-flex min-h-11 min-w-0 items-center justify-center whitespace-nowrap rounded-lg border px-1 py-2 text-xs leading-tight disabled:opacity-50 sm:text-sm lg:min-h-9'
const EDIT_TONE = 'border-white/25 text-white hover:bg-white/10'

const FLAG_TEXT = {
  blur: 'Blurry', noise: 'Noisy', uniform: 'Flat', small: 'Small',
  unreadable: 'Unreadable', low_aesthetic: 'Low aesthetic', nsfw: 'NSFW',
  watermark: 'Watermark', ...PROVENANCE_FLAG_LABEL,
}

// Origin chip colours, one per state. 'unknown' is deliberately the quiet grey
// of a non-answer rather than a warning colour: it is an absence of evidence.
const ORIGIN_CLASS = {
  ai: 'bg-violet-500/25 text-violet-100',
  camera: 'bg-emerald-500/25 text-emerald-100',
  unknown: 'bg-white/10 text-white/60',
}

function Facts({ img }) {
  if (!img) return <span className="text-xs text-white/40">Reading image details</span>
  const chip = (key, text, cls, title) => (
    <span key={key} title={title}
      className={`rounded px-1.5 py-px text-2xs font-medium ${cls}`}>{text}</span>
  )
  const detail = detailSummary(img)
  const origin = originLabel(img)
  const hint = originHint(img)
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <span className="max-w-[22rem] truncate text-xs text-white/70" title={img.name}>{img.name}</span>
      <SourceAttribution metadata={img.source_metadata}
        className="text-2xs text-white/70" />
      {chip('res', `${img.width || '?'}×${img.height || '?'}`, 'bg-white/10 text-white/80')}
      {detail && chip('detail', detail.soft ? `~${detail.real} px real` : 'full detail',
        detail.soft ? 'bg-amber-500/20 text-amber-100' : 'bg-white/10 text-white/60',
        detail.soft ? `${detail.text}. ${DETAIL_CAVEAT}` : DETAIL_CAVEAT)}
      {origin && chip('origin', `${origin.icon} ${origin.label}`, ORIGIN_CLASS[origin.state],
        `${origin.detail}${hint ? ` ${hint}` : ''}`)}
      {img.aesthetic_score != null
        && chip('aes', `${img.aesthetic_score.toFixed(1)}`, 'bg-white/10 text-amber-200')}
      {img.nsfw_score != null
        && chip('nsfw', `${Math.round(img.nsfw_score * 100)}%`, 'bg-white/10 text-rose-200')}
      {img.blur_score != null
        && chip('sharp', `sharpness ${Math.round(img.blur_score)}`, 'bg-white/10 text-white/70')}
      {img.face_cluster != null && chip('face', `#${img.face_cluster}`, 'bg-white/10 text-sky-200')}
      {img.framing && chip('framing', `${img.framing}`, 'bg-white/10 text-teal-200')}
      {/* 🎨 the medium, with the margin BEHIND it in the tooltip: a verdict shown
          without its confidence is how a guess turns into a fact. 'unsure' is
          shown too — here, where the user is looking at the picture and can
          settle it, it is the most useful thing the classifier can say. */}
      {img.medium && chip('medium', `${img.medium}`,
        img.medium === 'unsure' ? 'bg-white/10 text-white/50' : 'bg-white/10 text-lime-200',
        img.medium_margin != null
          ? `Zero-shot CLIP over the Score embedding — confidence gap ${img.medium_margin.toFixed(3)}.`
          : null)}
      {img.face_yaw != null && chip('yaw',
        `⤢ ${Math.round(Math.abs(img.face_yaw))}°`, 'bg-white/10 text-cyan-200',
        'How far the head is turned, measured by the Faces pass.')}
      {/* Kept even once the group is resolved, unlike the grid tile — there is
          room here to SAY "resolved" rather than leave a bare id implying the
          image is still an undecided duplicate. */}
      {img.dup_group != null
        && chip('dup', `≈ dup #${img.dup_group}${dupStateSuffix(img, 'dup')}`,
          img.dup_unresolved === true
            ? 'bg-white/10 text-fuchsia-200' : 'bg-white/5 text-fuchsia-200/60')}
      {img.semantic_dup_group != null
        && chip('sdup', `✂ same shot #${img.semantic_dup_group}${dupStateSuffix(img, 'sdup')}`,
          img.semantic_dup_unresolved === true
            ? 'bg-white/10 text-orange-200' : 'bg-white/5 text-orange-200/60')}
      {(img.flags || []).map((f) => chip(f, FLAG_TEXT[f] || f, 'bg-amber-500/20 text-amber-200'))}
      {img.status === 'keep' && chip('st', '✓ already kept', 'bg-emerald-500/25 text-emerald-200')}
      {img.status === 'reject' && chip('st', '✕ already rejected', 'bg-rose-500/25 text-rose-200')}
      {img.promoted_dataset_id != null && chip('pr', '⬆ promoted to a dataset', 'bg-indigo-500/25 text-indigo-200')}
      {img.promoted_bank_id != null && chip('prb', '⬆ promoted to another bank', 'bg-indigo-500/25 text-indigo-200')}
    </div>
  )
}

export default function BankReviewLightbox({
  bankId, ids, startId = null, seedImages = [], onDecided, onRotated, onEdited, onClose,
  collectionId = null, sourceWriteBlock = null,
}) {
  const [session, setSession] = useState(() => createSession(ids, { startId }))
  const [meta, setMeta] = useState(() => {
    const m = {}
    for (const img of seedImages || []) m[img.id] = img
    return m
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()
  // 🚩 Which image's watermark mask is open, if any. Review is where a flagged
  // image is actually LOOKED at, so it is where a wrong detection box gets
  // fixed — until now that was only possible inside a dataset (Qeeyana, Reddit).
  const [maskId, setMaskId] = useState(null)
  // A layer a plugin's verb opened (lightbox.action): the keys stand down
  // under it like under the mask and crop dialogs. Tracked per contribution
  // (plugins/layerTracker.js): one verb's "closed" must not erase another's
  // open picker.
  const [pluginLayer, setPluginLayer] = useState(false)
  const pluginLayersRef = useRef(null)
  if (!pluginLayersRef.current) pluginLayersRef.current = createLayerTracker(setPluginLayer)
  /* ✂ Which image's crop editor is open. Review is the ONLY place the Bank shows
     an image big enough to draw a box on, so it is where the crop lives —
     the grid tile deliberately keeps its three hit targets and no more, which is
     the same reason the quarter-turn is a bulk action there and a button here. */
  const [cropId, setCropId] = useState(null)
  const [compareKey, setCompareKey] = useState(null)
  const dialogRef = useRef(null)
  const requested = useRef(new Set())
  const decisionInFlight = useRef(false)

  // Hand the trap over while the mask or crop editor is open — two live traps
  // fight over the focus and the editor's own controls become unreachable.
  useFocusTrap(dialogRef, maskId == null && cropId == null)

  const id = currentId(session)
  const done = isFinished(session)
  const p = progress(session)
  const img = id == null ? null : meta[id]
  const canRestore = img?.watermark_state === 'cleaned'
  const restoreBlock = img?.watermark_clean_in_place ? sourceWriteBlock : null
  const editKey = `${id}:${img?.edit_generation || 0}:${img?.edit_sequence || 0}`
  const comparing = compareKey === editKey && img?.edit_history_count > 0
  useReviewImagePreload(session.order.slice(Math.max(0, session.pos - 1), session.pos + 3)
    .filter((target) => meta[target])
    .map((target) => `/api/bank/${bankId}/file/${target}${imageVersionQuery(meta[target])}`))

  // Pull metadata for the current image and the ones just behind it, in one
  // request. Ids already asked for are never re-asked (an image deleted from the
  // bank simply stays without facts instead of looping).
  useEffect(() => {
    if (id == null) return
    const window = session.order.slice(session.pos, session.pos + META_WINDOW)
      .filter((x) => meta[x] === undefined && !requested.current.has(x))
    if (!window.length) return
    window.forEach((x) => requested.current.add(x))
    apiFetch(`/api/bank/${bankId}/images?ids=${window.join(',')}&limit=${window.length}${collectionId != null ? `&collection_id=${collectionId}` : ''}`)
      .then((d) => setMeta((prev) => {
        const next = { ...prev }
        for (const row of d.images || []) next[row.id] = row
        return next
      }))
      .catch(() => { /* facts are an aid, not a gate — the image still shows */ })
  }, [bankId, collectionId, id, session.order, session.pos, meta])

  const sendDecision = useCallback(async (status) => {
    const target = currentId(session)
    if (target == null || busy || decisionInFlight.current) return
    decisionInFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await postJson(`/api/bank/${bankId}/images/status`, {
        ids: [target], status, ...(collectionId != null ? { collection_id: collectionId } : {}),
      })
      if (result?.ok === false) throw new Error(result.error || 'Could not save this decision.')
      setMeta((prev) => (prev[target] ? { ...prev, [target]: { ...prev[target], status } } : prev))
      setSession((s) => decide(s, status, target))
      onDecided?.(target, status)
    } catch (e) {
      // Stay on this image: a lost decision is worse than a stalled one.
      setError(`Image ${target}: ${e?.message || 'Could not save this decision.'} Go back if you moved on.`)
    } finally {
      decisionInFlight.current = false
      setBusy(false)
    }
  }, [bankId, busy, collectionId, onDecided, session])

  // 🔄 Quarter turn of the image under the cursor (idea by 1Tomber, GitHub #17).
  // It does NOT advance — a sideways photo is fixed and then judged, which is the
  // whole point of noticing it here. The user's own file is never rewritten: the
  // angle is stored and the app rebuilds its view from the pristine source.
  const rotateCurrent = useCallback(async (degrees) => {
    const target = currentId(session)
    if (target == null || busy) return
    setBusy(true)
    setError(null)
    try {
      const d = await postJson(`/api/bank/${bankId}/rotate`, { ids: [target], degrees })
      const angle = d?.rotations?.[target] ?? d?.rotations?.[String(target)] ?? 0
      // A quarter turn transposes the frame; a half turn does not.
      const quarter = Math.abs(degrees) % 180 !== 0
      setMeta((prev) => (prev[target]
        ? { ...prev,
            [target]: { ...prev[target],
              rotation: angle,
              width: quarter ? prev[target].height : prev[target].width,
              height: quarter ? prev[target].width : prev[target].height } }
        : prev))
      onRotated?.(target, angle)
    } catch (e) {
      setError(e?.message || 'Could not rotate that image — it was NOT changed.')
    } finally {
      setBusy(false)
    }
  }, [bankId, busy, onRotated, session])

  /* ✂ Cut the image under the cursor down to the box just drawn, and ↩ throw
     that edit away. Both are asked for by nofaceman on Discord: the Bank has the
     filtering and the curation, so reframing a shot used to mean a round trip
     through a Dataset and an export into a NEW bank.

     Like the quarter turn, they DECIDE NOTHING and do not advance — a badly
     framed image is fixed and then judged, which is the whole reason you noticed
     it here. And like the quarter turn, your own file is never rewritten: the
     result is a copy the app keeps, and ↩ Revert deletes it.

     The box arrives in the NATURAL pixels of the image the editor loaded, which
     is the very image `/file/` resolves — cleaned and turned included. That is
     what the server crops, so what you drew is what you get. */
  const applyEdit = useCallback((target, state) => {
    if (!state) return
    setMeta((prev) => (prev[target]
      ? { ...prev,
          [target]: { ...prev[target],
            edit_method: state.edit_method ?? null,
            edit_generation: state.edit_generation ?? 0,
            edit_history_count: state.edit_history_count ?? 0,
            edit_sequence: state.edit_sequence ?? 0,
            rotation: state.rotation ?? 0,
            width: state.width ?? prev[target].width,
            height: state.height ?? prev[target].height } }
      : prev))
    onEdited?.(target, state)
  }, [onEdited])

  const cropCurrent = useCallback(async (box) => {
    const target = cropId
    if (target == null || busy) return false
    setBusy(true)
    setError(null)
    try {
      const d = await postJson(`/api/bank/${bankId}/image/${target}/crop`, box)
      applyEdit(target, d)
      toast.success(cropOutcomeMessage(d))
      setCropId(null)
    } catch (e) {
      setError(e?.message || 'Could not crop that image — it was NOT changed.')
      throw e
    } finally {
      setBusy(false)
    }
  }, [applyEdit, bankId, busy, cropId, toast])

  const undoCurrent = useCallback(async () => {
    const target = currentId(session)
    if (target == null || busy) return
    setBusy(true)
    setError(null)
    try {
      const d = await postJson(`/api/bank/${bankId}/edits/undo`, { image_ids: [target] })
      const state = d?.images?.find((row) => row.id === target)
      if (!state) throw new Error('The previous version is unavailable. Nothing was changed.')
      applyEdit(target, state)
      setCompareKey(null)
      toast.success('Last edit undone.')
    } catch (e) {
      setError(e?.message || 'Could not undo the last edit.')
    } finally {
      setBusy(false)
    }
  }, [applyEdit, bankId, busy, session, toast])

  const revertCurrent = useCallback(async () => {
    const target = currentId(session)
    if (target == null || busy) return
    if (!window.confirm('Revert all edits on this image?')) return
    setBusy(true)
    setError(null)
    try {
      const d = await postJson(`/api/bank/${bankId}/edits/revert`, { image_ids: [target] })
      // The route answers with the state of every row it touched, so the image
      // under the cursor is re-rendered from the ledger rather than from a guess
      // about what reverting should have produced.
      applyEdit(target, (d?.images || []).find((r) => r.id === target)
        || { edit_method: null, edit_generation: 0 })
      toast.success('Edits reverted.')
    } catch (e) {
      setError(e?.message || 'Could not revert that image — it was NOT changed.')
    } finally {
      setBusy(false)
    }
  }, [applyEdit, bankId, busy, session, toast])

  const restoreOriginal = useCallback(async () => {
    if (!canRestore || busy) return
    if (restoreBlock) {
      setError(restoreBlock)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await postJson(`/api/bank/${bankId}/watermark/undo`, { image_ids: [id] })
      if (!result.restored) throw new Error('The original could not be restored.')
      requested.current.delete(id)
      setMeta((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setCompareKey(null)
      toast.success('Original restored.')
    } catch (e) {
      setError(e?.message || 'Could not restore the original.')
    } finally {
      setBusy(false)
    }
  }, [bankId, busy, canRestore, id, restoreBlock, toast])

  // Moving forward without judging IS a skip: it stays undecided in the DB and
  // is not proposed again in this session (S and ⏭ are the same).
  const doSkip = useCallback(() => { setError(null); setSession((s) => skip(s)) }, [])
  const goBack = useCallback(() => { setError(null); setSession((s) => back(s)) }, [])
  const toggleShuffle = useCallback(() => setSession((s) => setShuffle(s, !s.shuffle)), [])

  useEffect(() => {
    const onKey = (e) => {
      // An open editor owns the keyboard: every letter here is one keystroke
      // away from a decision on the image being edited.
      if (maskId != null || cropId != null) return
      if (pluginLayer) return
      // Letters and culling arrows come from the SHARED grammar (components/shared/
      // reviewShortcuts.js) — the same one the dataset lightbox reads, so the
      // two review surfaces cannot drift apart one refactor at a time. The keys
      // below are the Bank's own and are read off the same event.
      const action = reviewKeyAction(e, { decisionArrows: true })
      if (action === 'close') { onClose(); return }
      if (action === 'keep') { e.preventDefault(); sendDecision('keep'); return }
      if (action === 'reject' && canRestore && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        restoreOriginal()
        return
      }
      if (action === 'reject') { e.preventDefault(); sendDecision('reject'); return }
      if (action === 'skip') { e.preventDefault(); doSkip(); return }
      if (action === 'back') { e.preventDefault(); goBack(); return }
      if (e.metaKey || e.ctrlKey || e.altKey || ownsTypedKeys(e.target)) return
      // [ and ] turn the image without deciding anything. Deliberately NOT
      // letters: every free letter here is one keystroke away from a decision.
      if (e.key === '[') { e.preventDefault(); rotateCurrent(-90) }
      else if (e.key === ']') { e.preventDefault(); rotateCurrent(90) }
      // M edits the watermark mask of the flagged image under the cursor.
      else if (e.key?.toLowerCase() === 'm' && canEditMask(img)) { e.preventDefault(); setMaskId(id) }
      // C opens the crop editor. A letter, like M and for the same reason: it
      // opens an EDITOR rather than deciding anything, so the "every free letter
      // is one keystroke from a decision" rule is not what is at stake.
      else if (e.key?.toLowerCase() === 'c' && id != null) { e.preventDefault(); setCropId(id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sendDecision, doSkip, goBack, rotateCurrent, maskId, cropId, img, id,
    pluginLayer, canRestore, restoreOriginal])

  // The key cap itself is shared with the dataset lightbox (ShortcutKey.jsx):
  // same letters, same look, one place.
  const shortcut = (label) => <ShortcutKey>{label}</ShortcutKey>

  const summary = useMemo(() => {
    const bits = [`${p.kept} kept`, `${p.rejected} rejected`]
    if (p.skipped) bits.push(`${p.skipped} skipped`)
    return bits.join(' · ')
  }, [p.kept, p.rejected, p.skipped])

  const popup = (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Review the bank image by image"
      data-probe-chrome="review" data-probe-layer
      className="bank-review-shell fixed inset-x-0 top-0 z-[9996] flex flex-col bg-black/95">
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span className="font-semibold text-white">▶ Review</span>
        <span className="tabular-nums text-white/80">
          {done ? `${p.total} / ${p.total}` : `${p.position} / ${p.total}`}
        </span>
        <span className="text-white/50">{summary}</span>
        <label className="flex items-center gap-1.5 text-xs text-white/80">
          <input type="checkbox" checked={session.shuffle} onChange={toggleShuffle} />
          <Shuffle aria-hidden="true" className="h-3.5 w-3.5" /> Random order
        </label>
        <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close review"
          className="ml-auto h-10 w-10 lg:h-9 lg:w-9 rounded-full bg-white/10 text-xl leading-none text-white hover:bg-white/20">✕</button>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-2xl font-bold text-white"><PartyPopper aria-hidden="true" className="mr-2 inline h-6 w-6 align-[-3px]" />All {p.total.toLocaleString()} image{p.total === 1 ? '' : 's'} reviewed</p>
          <p className="text-sm text-white/70">
            {p.kept} kept · {p.rejected} rejected
            {p.skipped ? ` · ${p.skipped} skipped (still undecided)` : ''}
          </p>
          {busy && <p role="status" className="text-sm text-white/60">Saving</p>}
          {error && <p role="alert" className="text-sm text-rose-300">{error} Go back to retry.</p>}
          <div className="grid grid-flow-col auto-cols-fr gap-2">
            {p.total > 0 && (
              <button type="button" onClick={goBack}
                className={`${EDIT_BUTTON} ${EDIT_TONE}`}>
                ↓ Back
              </button>
            )}
            <button type="button" onClick={onClose}
              className={`${EDIT_BUTTON} border-transparent bg-gradient-primary font-semibold text-gray-950`}>
              Back to Grid
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-3">
          {/* key= forces a fresh <img> per image so a slow load never shows the
              previous shot under the new one's buttons. */}
          {/* ?r=/?e= bust the browser cache after a turn or an edit — the bytes at
              this URL change while the URL itself does not. */}
          {comparing ? <BankEditComparison key={editKey} bankId={bankId} image={img} /> : <img key={id} src={`/api/bank/${bankId}/file/${id}${imageVersionQuery(img)}`}
            alt={img?.name || `Bank image ${id}`}
            className="max-h-full max-w-full select-none object-contain" />}
        </div>
      )}

      {!done && (
        <div className="bank-review-controls min-h-0 overflow-y-auto overscroll-contain space-y-2 bg-black/60 px-4 pt-2.5">
          {error ? <p role="alert" className="text-center text-xs text-rose-300">{error} Try again.</p>
            : busy && <p role="status" className="text-center text-xs text-white/60">Saving</p>}
          <Facts img={img} />
          {canRestore && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={restoreOriginal} disabled={busy || !!restoreBlock}
                aria-keyshortcuts="R" title={restoreBlock || 'Restore original (R)'}
                className={`${EDIT_BUTTON} ${EDIT_TONE} px-3`}>
                ↩ Restore original{shortcut('R')}
              </button>
              {restoreBlock && <span className="self-center text-xs text-amber-200">{restoreBlock}</span>}
            </div>
          )}
          {canEditMask(img) && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setMaskId(id)} disabled={busy}
                title="Edit watermark mask (M)"
                className={`${EDIT_BUTTON} gap-1 border-amber-400/40 bg-amber-500/10 px-3 text-amber-100 hover:bg-amber-500/20`}>
                <FlagIcon className="h-4 w-4" />{maskButtonLabel(img)}{shortcut('M')}
              </button>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            <button type="button" onClick={goBack} disabled={session.pos === 0}
              title="Previous image (↓)"
              aria-keyshortcuts="ArrowDown"
              className={`${EDIT_BUTTON} ${EDIT_TONE}`}>
              Back{shortcut('↓')}
            </button>
            <button type="button" onClick={() => rotateCurrent(-90)} disabled={busy}
              aria-label="Rotate this image 90 degrees left"
              title="Rotate 90° left ([)"
              className={`${EDIT_BUTTON} ${EDIT_TONE}`}>
              <span aria-hidden="true">↺</span><span className="sr-only">Rotate left</span>
            </button>
            <button type="button" onClick={() => rotateCurrent(90)} disabled={busy}
              aria-label="Rotate this image 90 degrees right"
              title="Rotate 90° right (])"
              className={`${EDIT_BUTTON} ${EDIT_TONE}`}>
              <span aria-hidden="true">↻</span><span className="sr-only">Rotate right</span>
            </button>
            <button type="button" onClick={() => setCropId(id)} disabled={busy || id == null}
              title="Crop (C)" aria-keyshortcuts="C"
              className={`${EDIT_BUTTON} border-sky-400/60 bg-sky-500/20 font-semibold text-sky-100 hover:bg-sky-500/30`}>
              ✂ Crop{shortcut('C')}
            </button>
          </div>
          {img?.edit_method && (
            <div className="grid grid-flow-col auto-cols-fr gap-2">
              {img.edit_history_count > 0 && <>
                <button type="button" onClick={undoCurrent} disabled={busy}
                  title="Undo last edit"
                  className={`${EDIT_BUTTON} ${EDIT_TONE}`}>
                  ↩ Undo
                </button>
                <button type="button" onClick={() => setCompareKey(comparing ? null : editKey)}
                  disabled={busy} aria-pressed={!!comparing}
                  title={comparing ? 'Close comparison' : 'Compare with prior version'}
                  className={`${EDIT_BUTTON} ${EDIT_TONE} aria-pressed:bg-white/20`}>
                  {comparing ? 'Close' : 'Compare'}
                </button>
              </>}
              <button type="button" onClick={revertCurrent} disabled={busy}
                title="Revert all edits"
                className={`${EDIT_BUTTON} ${EDIT_TONE}`}>
                Revert
              </button>
            </div>
          )}
          <div className="grid grid-flow-col auto-cols-fr gap-2 empty:hidden">
            <PluginSlot slot="lightbox.action" surface="bank" img={img} bankId={bankId}
              disabled={busy}
              itemProps={(item) => ({ onLayer: pluginLayersRef.current.onLayerFor(contributionKey(item)) })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => sendDecision('reject')} disabled={busy}
              title={canRestore ? 'Reject (←)' : 'Reject (R or ←)'}
              aria-keyshortcuts={canRestore ? 'ArrowLeft' : 'R ArrowLeft'}
              className={`review-decision-button ${EDIT_BUTTON} border-rose-400/60 bg-rose-500/20 font-semibold text-rose-100 hover:bg-rose-500/30`}>
              ✕ Reject{shortcut(canRestore ? '←' : 'R')}
            </button>
            <button type="button" onClick={doSkip}
              title="Skip (S)" aria-keyshortcuts="S"
              className={`review-decision-button ${EDIT_BUTTON} ${EDIT_TONE} font-semibold`}>
              ⏭ Skip{shortcut('S')}
            </button>
            <button type="button" onClick={() => sendDecision('keep')} disabled={busy}
              title="Keep (K or →)"
              aria-keyshortcuts="K ArrowRight"
              className={`review-decision-button ${EDIT_BUTTON} border-emerald-400/60 bg-emerald-500/20 font-semibold text-emerald-100 hover:bg-emerald-500/30`}>
              ✓ Keep{shortcut('K')}
            </button>
          </div>
        </div>
      )}

      {maskId != null && meta[maskId] && (
        <BankWatermarkMaskDialog bankId={bankId} image={meta[maskId]}
          onSaved={(next) => setMeta((prev) => ({ ...prev, [next.id]: next }))}
          onClose={() => setMaskId(null)} />
      )}

      {/* The preview and the crop use the same resolved source. */}
      {cropId != null && (
        <CropModal usePreview imageUrl={`/api/bank/${bankId}/file/${cropId}${imageVersionQuery(meta[cropId])}`}
          onCancel={() => setCropId(null)} onConfirm={cropCurrent} />
      )}
    </div>
  )
  // Page spacing must not offset a dialog that already fills the viewport.
  return typeof document === 'undefined' ? popup : createPortal(popup, document.body)
}
