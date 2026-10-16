// react-frontend/src/components/bank/useCurationLanes.js
// The bank's four curation lanes — 🎨 diverse, ⚖️ balanced, 🎯 similar and
// 🔤 text search — as ONE hook, because that is their real coupling:
// curateOpen is shared by all four, the typicality guard by two, and the
// engine-switch flow resets three of their states (the setters ride back
// in the return for exactly that). Moved VERBATIM from BankWorkspace.jsx
// (2026-08-24, hook series wave 7).
import { useEffect, useRef, useState } from 'react';
import { apiFetch, postJson } from '../../api/fetchClient';
import { BALANCE_DEFAULT_AXIS } from './bankBalance.js';
import {
  semanticEnginePatchBody, semanticPayloadMatches,
} from './bankSemanticEngine.js';
import { PUSH_DOWN_DEFAULT_STRENGTH, summarize } from './bankTextSearch.js';
import { curationSummary, emptyCurationPolicy, policyForKind, selectionContextKey,
  selectionRequest } from './curationPolicy.js';

export function useCurationLanes({
  bankId, filter, filterParams, selected, toast, showCuratedSelection,
  semanticState, semanticEngineRef, textStatusRequestRef,
}) {
  // Curation popovers ('diverse' | 'similar' | null) and their target counts.
  const [curateOpen, setCurateOpen] = useState(null)
  const [diverseN, setDiverseN] = useState(60)
  // Typicality guard for 🎨 Pick diverse. Pure farthest-point sampling maximises
  // the distance to what is already picked — mathematically the criterion that
  // prefers ISOLATED images, so the first picks used to be the memes and the
  // stray photos of someone else. 0 = the historical behaviour, on purpose still
  // reachable; 0.5 = the default (see BANK_TYPICALITY_DEFAULT rationale in the
  // service docstring).
  const [diverseTypicality, setDiverseTypicality] = useState(0.5)
  const [diverseBusy, setDiverseBusy] = useState(false)
  // ⚖️ Balanced pick — the OTHER question ("does my set cover the framings?").
  // Axis ids are persisted keys, never renamed (see bankBalance.js).
  const [balanceN, setBalanceN] = useState(60)
  const [balanceAxis, setBalanceAxis] = useState(BALANCE_DEFAULT_AXIS)
  const [balanceBusy, setBalanceBusy] = useState(false)
  const [balanceResult, setBalanceResult] = useState(null)
  const [similarN, setSimilarN] = useState(60)
  const [similarBusy, setSimilarBusy] = useState(false)
  // The last 🎯 run's reference and how far down its ranking we went — what
  // "Add N more" extends. Kept HERE (not derived from the selection) because
  // after a run the selection holds N images and the one-reference gate would
  // otherwise lock the panel shut exactly when the user wants the next batch.
  const [similarLast, setSimilarLast] = useState(null)
  const [similarAddN, setSimilarAddN] = useState(30)
  // 🔤 Text search. `textStatus` is the BEFORE-the-click truth (available? model
  // already warm? would it download?), `textResult` the AFTER-the-click one that
  // keeps the ranking legible once the grid has switched to it.
  const [textQuery, setTextQuery] = useState('')
  const [textN, setTextN] = useState(60)
  // 🔤 what to push DOWN the ranking. Not a filter — see bankTextSearch.js.
  const [textExclude, setTextExclude] = useState('')
  const [textExcludeW, setTextExcludeW] = useState(PUSH_DOWN_DEFAULT_STRENGTH)
  const [textStatus, setTextStatus] = useState(null)
  const [textPending, setTextPending] = useState(false)
  const [textResult, setTextResult] = useState(null)
  const [curationMetadata, setCurationMetadata] = useState(null)
  const [curationPolicy, setCurationPolicy] = useState(emptyCurationPolicy)
  const [selectionResult, setSelectionResult] = useState(null)
  const selectionRunRef = useRef(0)
  const contextKey = selectionContextKey({ bankId, filter, engine: semanticState.engine,
    modelKey: semanticState.modelKey, policy: curationPolicy })
  const selectionContextRef = useRef(contextKey)
  selectionContextRef.current = contextKey

  useEffect(() => {
    let active = true
    setCurationMetadata(null)
    setCurationPolicy(emptyCurationPolicy())
    setSelectionResult(null)
    apiFetch('/api/bank/curation-options').then((metadata) => {
      if (!active) return
      setCurationMetadata(metadata)
      setCurationPolicy((previous) => policyForKind(previous, previous.kind, metadata))
    }).catch(() => { if (active) toast.error('Selection settings did not load. Reopen the Bank to retry.') })
    return () => { active = false; selectionRunRef.current += 1 }
  }, [bankId, toast])

  useEffect(() => {
    setCurationPolicy((previous) => ({ ...previous, min_similarity: '' }))
  }, [semanticState.engine, semanticState.modelKey])
  useEffect(() => { setSimilarLast(null); setSelectionResult(null) }, [contextKey])

  const updateCurationPolicy = (next) => {
    const value = next.resetKind ? policyForKind(curationPolicy, next.kind, curationMetadata) : next
    setCurationPolicy(value)
    setBalanceAxis(value.axis)
    setBalanceResult(null)
  }

  const captureSelection = () => ({ key: contextKey, run: ++selectionRunRef.current })
  const selectionCurrent = (request) => request.key === selectionContextRef.current
    && request.run === selectionRunRef.current

  const pickDiverse = async () => {
    const request = captureSelection()
    const requestEngine = semanticState.engine
    const requestModelKey = semanticState.modelKey
    setCurateOpen(null)
    setDiverseBusy(true)
    try {
      const d = await postJson(`/api/bank/${bankId}/select-diverse`,
        { n: diverseN, typicality: diverseTypicality,
          selection: selectionRequest(curationPolicy), ...filterParams(filter) })
      if (!selectionCurrent(request) || semanticEngineRef.current !== requestEngine
          || !semanticPayloadMatches(d, requestEngine, requestModelKey)) return
      setSelectionResult(d)
      if (!d.image_ids?.length) {
        toast.info('No images met the selection policy. Review the report or change the constraints.')
      }
      showCuratedSelection(d.image_ids)
      if (d.image_ids?.length) toast.info(curationSummary(d))
    } catch (e) {
      toast.error(e?.message || 'Diversity sampling failed.')
    } finally {
      setDiverseBusy(false)
    }
  }

  // ⚖️ Balanced pick — spread over the framings instead of taking the top of one
  // ranking. Same embeddings and same typicality guard as 🎨 Pick diverse, applied
  // INSIDE each bucket. The result is only useful if the user can see its shape,
  // so the distribution is kept on screen (numbers, aria-live) after the click.
  const pickBalanced = async () => {
    const request = captureSelection()
    const requestEngine = semanticState.engine
    const requestModelKey = semanticState.modelKey
    setCurateOpen(null)
    setBalanceBusy(true)
    try {
      const d = await postJson(`/api/bank/${bankId}/select-balanced`,
        { n: balanceN, axis: balanceAxis, typicality: diverseTypicality,
          selection: selectionRequest(curationPolicy),
          ...filterParams(filter) })
      if (!selectionCurrent(request) || semanticEngineRef.current !== requestEngine
          || !semanticPayloadMatches(d, requestEngine, requestModelKey)) return
      setSelectionResult(d)
      if (!d.image_ids?.length) {
        toast.info('No images met the selection policy. Review the report or change the constraints.')
      }
      setBalanceResult(d)
      showCuratedSelection(d.image_ids)
      if (d.image_ids?.length) toast.info(curationSummary(d))
    } catch (e) {
      // A missing pass is the DEFAULT state of a fresh bank, not a failure: the
      // backend names the pass, so show that sentence rather than "failed".
      toast.error(e?.message || 'Balanced selection failed.')
    } finally {
      setBalanceBusy(false)
    }
  }

  const findSimilar = async () => {
    const request = captureSelection()
    const requestEngine = semanticState.engine
    const requestModelKey = semanticState.modelKey
    setCurateOpen(null)
    const ref = [...selected][0]
    const referenceIds = curationPolicy.reference_ids.length ? curationPolicy.reference_ids : ref == null ? [] : [ref]
    if (!referenceIds.length) return
    const policy = selectionRequest({ ...curationPolicy, reference_ids: referenceIds })
    setSimilarBusy(true)
    try {
      const d = await postJson(`/api/bank/${bankId}/select-similar`,
        { ref_id: referenceIds[0], n: similarN, selection: policy, ...filterParams(filter) })
      if (!selectionCurrent(request) || semanticEngineRef.current !== requestEngine
          || !semanticPayloadMatches(d, requestEngine, requestModelKey)) return
      setSelectionResult(d)
      if (!d.image_ids?.length) {
        toast.info('No images met the selection policy. Review the report or change the constraints.')
      }
      // Pins lead. The remainder follows relevance with the technical-quality
      // preference. The receipt exposes raw similarity separately.
      showCuratedSelection(d.image_ids)
      setSimilarLast({ refId: referenceIds[0], taken: d.image_ids.length, policy, contextKey })
      if (d.image_ids?.length) toast.info(curationSummary(d))
    } catch (e) {
      toast.error(e?.message || 'Similarity search failed.')
    } finally {
      setSimilarBusy(false)
    }
  }

  // 🎯 "Add N more" — the next closest from the LAST run's ranking, without
  // hunting the reference down again: after a run the selection holds N
  // images, and the one-reference gate would otherwise force unselect-all →
  // find the reference → reselect → retype a bigger N. The ranking is
  // deterministic, so asking for taken+N and showing the whole lot IS "the
  // same ranking, extended" — which also means an image hand-unselected in
  // between comes back; the wording on the panel says so out loud.
  const addMoreSimilar = async () => {
    if (!similarLast || similarLast.contextKey !== contextKey) return
    const request = captureSelection()
    const requestEngine = semanticState.engine
    const requestModelKey = semanticState.modelKey
    setCurateOpen(null)
    setSimilarBusy(true)
    try {
      const want = Math.min(2000, similarLast.taken + similarAddN)
      const d = await postJson(`/api/bank/${bankId}/select-similar`,
        { ref_id: similarLast.refId, n: want, selection: similarLast.policy, ...filterParams(filter) })
      if (!selectionCurrent(request) || semanticEngineRef.current !== requestEngine
          || !semanticPayloadMatches(d, requestEngine, requestModelKey)) return
      setSelectionResult(d)
      if (!d.image_ids?.length) {
        toast.info('No images met the selection policy. Review the report or change the constraints.')
      }
      const gained = d.image_ids.length - similarLast.taken
      showCuratedSelection(d.image_ids)
      setSimilarLast({ ...similarLast, taken: d.image_ids.length })
      toast.info(gained > 0
        ? `Added ${gained} more — ${d.image_ids.length} selected, closest first (of ${d.pool}).`
        : `Nothing left to add — the ranking already covers every match in this filter (${d.image_ids.length} of ${d.pool}).`)
    } catch (e) {
      toast.error(e?.message || 'Similarity search failed.')
    } finally {
      setSimilarBusy(false)
    }
  }

  // A remembered ranking is meaningless across banks (the reference id belongs
  // to one bank) and across engines (a different index ranks differently).
  useEffect(() => { setSimilarLast(null) }, [bankId])
  useEffect(() => { setSimilarLast(null) }, [semanticState.engine])

  // 🔤 Text search — same engine as 🎯 Similar, with the reference vector coming
  // from words instead of a picture. Opening the panel asks the backend what it
  // is about to cost (model warm? weights present?) so a slow FIRST search is
  // announced before the click rather than felt as a freeze after it.
  const openTextSearch = async () => {
    const next = curateOpen === 'text' ? null : 'text'
    setCurateOpen(next)
    if (next !== 'text') {
      textStatusRequestRef.current += 1
      releaseTextEncoder()
      return
    }
    const requestId = ++textStatusRequestRef.current
    const expectedEngine = semanticState.engine
    if (semanticState.text) setTextStatus(semanticState.text)
    try {
      const status = await apiFetch('/api/bank/text-search/status'
        + `?engine=${encodeURIComponent(expectedEngine)}`)
      if (requestId === textStatusRequestRef.current
          && expectedEngine === semanticEngineRef.current
          && semanticPayloadMatches(status, expectedEngine)) setTextStatus(status)
    } catch {
      // The Bank payload already carries an engine-aware status. Keep it when
      // the optional warm/cold probe cannot be read.
      if (!semanticState.text) setTextStatus(null)
    }
  }

  // Hand the selected text encoder's memory back as soon as the panel closes.
  // Best effort by design — the backend idle timer remains the guarantee for a
  // tab that simply vanished.
  const releaseTextEncoder = (engine = semanticState.engine) => {
    postJson('/api/bank/text-search/release', semanticEnginePatchBody(engine)).catch(() => {})
  }

  // Leaving the Bank entirely is the same signal as closing the panel: give the
  // memory back. The backend idle timer still covers a browser that just died.
  useEffect(() => () => {
    postJson('/api/bank/text-search/release',
      semanticEnginePatchBody(semanticEngineRef.current)).catch(() => {})
  }, [semanticEngineRef])   // A ref is stable: this still runs only on unmount.

  const runTextSearch = async () => {
    const q = textQuery.trim()
    if (!q) return
    const requestEngine = semanticState.engine
    const requestModelKey = semanticState.modelKey
    setTextPending(true)
    try {
      const d = await postJson(`/api/bank/${bankId}/search-text`,
        { query: q, n: textN, push_down: textExclude.trim() || null,
          push_down_weight: textExcludeW, ...filterParams(filter) })
      if (semanticEngineRef.current !== requestEngine
          || !semanticPayloadMatches(d, requestEngine, requestModelKey)) return
      setTextResult(d)
      setCurateOpen(null)
      if (!d.image_ids?.length) {
        // NOT a silent empty grid: say why nothing could be ranked.
        toast.info(summarize(d, semanticState.engine))
        return
      }
      showCuratedSelection(d.image_ids)
      // Refresh the warm flag so the panel now promises "instant" truthfully.
      apiFetch('/api/bank/text-search/status'
        + `?engine=${encodeURIComponent(semanticState.engine)}`)
        .then(setTextStatus).catch(() => {})
    } catch (e) {
      // 503 = this install cannot do it at all; 400 = do something first. Both
      // arrive as a message written for a human — show it as-is.
      toast.error(e?.message || 'Text search failed.')
    } finally {
      setTextPending(false)
    }
  }
  return {
    curationMetadata, curationPolicy, updateCurationPolicy, selectionResult, setSelectionResult,
    curateOpen, setCurateOpen, diverseN, setDiverseN, diverseTypicality,
    setDiverseTypicality, diverseBusy, balanceN, setBalanceN, balanceAxis,
    setBalanceAxis, balanceBusy, balanceResult, setBalanceResult, similarN,
    setSimilarN, similarBusy, similarLast, similarAddN, setSimilarAddN,
    addMoreSimilar, textQuery, setTextQuery, textN, setTextN,
    textExclude, setTextExclude, textExcludeW, setTextExcludeW, textStatus,
    setTextStatus, textPending, textResult, setTextResult, pickDiverse,
    pickBalanced, findSimilar, openTextSearch, releaseTextEncoder,
    runTextSearch,
  };
}
