import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, CheckCircle2, Copy, Download, Drama, Eraser, Filter, FolderOpen, Globe, Loader2, Package, PenLine, PersonStanding, RefreshCw, Save, Scissors, Search, Settings, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import CompositionBar from './CompositionBar';
import CoveragePanel from './CoveragePanel';
import ClassifyFramingButton from './ClassifyFramingButton';
import ReferencePanel from './ReferencePanel';
import TrainingPanel from './TrainingPanel';
import PreflightModal from './PreflightModal';
import { createPortal } from 'react-dom';
import { fmt } from '../../utils/studioFormat';
import ImportDropzone from './ImportDropzone';
import PluginSlot, { hasContributions } from '../../plugins/PluginSlot.jsx';
import BankImportPanel from './BankImportPanel';
import ImageSourcesPanel from '../shared/ImageSourcesPanel';
import DatasetFolderNote from './DatasetFolderNote';
import { isDatasetImportBlocked, isStopGenerationBlocked } from './activityGates.js';
import { holdsLocalGpu } from '../../utils/activityLanes.js';
import { IMPROVE_DERIVATION } from './improveCandidates.js';
import { faceAnalysisState, faceAnalysisLabel } from './faceScoringGate.js';
import DatasetGrid from './DatasetGrid';
import { IdentityFilter, IdentityUndo } from '../shared/IdentityTools.jsx';
import { apiFetch as identityFetch } from '../../api/fetchClient.js';
import { Button, Chip, Select } from '../common/Controls.jsx';
import QuickSetDialog from './QuickSetDialog.jsx';
import { datasetBusyReason } from './datasetBusyReason.js';
import KleinModelSetting from '../shared/KleinModelSetting';
import KleinCleanOptions from '../shared/KleinCleanOptions';
import KleinCompareDialog from '../shared/KleinCompareDialog';
import SmallImageRescueReview from './SmallImageRescueReview';
import CaptionToolsBar from './CaptionToolsBar';
import CaptionOptionsPopover from './CaptionOptionsPopover';
import { datasetLabSurface } from './captionLabSurface';
import { datasetThumbUrl } from '../../utils/datasetThumbUrl.js';
import { recaptionConfirmation } from './captionCategory';
import { defaultEditEngine } from './referenceEdit';
import { localEngineUnavailableReason, hasComfyui } from '../../utils/localEngineReason.js';
import { kleinCleanTitle } from '../../utils/watermarkCleanEngine.js';
import { captionEnginesSummary } from '../../utils/captionEngines.js';
// …and the per-image half of the same question, for the captions listed in full here.
import { captionOriginInfo } from '../../utils/captionOrigin.js';
import { extraRefCropSource } from './extraRefs';
import DatasetSettingsModal from './DatasetSettingsModal';
import DatasetToBankDialog from './DatasetToBankDialog';
import TextScanDialog from './TextScanDialog';
import WatermarkScanDialog from './WatermarkScanDialog';
import WatermarkReviewLightbox, { buildWatermarkRecap } from './WatermarkReviewLightbox';
// Lazily loaded: each renders behind a condition (a click opens it) or a
// hidden section, so its code leaves the DatasetPage entry chunk - which
// sat alone above vite's 500 kB warning. WatermarkReviewLightbox stays
// static: its buildWatermarkRecap named export is used at runtime here,
// and a static import would pin the module into this chunk anyway.
const VariationCatalog = lazy(() => import('./VariationCatalog'));
const CropModal = lazy(() => import('./CropModal'));
const ReferenceEditModal = lazy(() => import('./ReferenceEditModal'));
const DatasetLightbox = lazy(() => import('./DatasetLightbox'));
// 🧪 The Caption Lab, reached from the Captions section: the picker names an
// image, the caption editor opens straight on its Lab tab. Only the PICKER is really
// deferred by this — CaptionEditorDialog is already in this page's static graph
// (DatasetGrid -> DatasetGridItem imports it), so its lazy() here buys no split and is
// kept only so both mount the same way behind the one <Suspense> below.
const CaptionLabPicker = lazy(() => import('./CaptionLabPicker'));
const CaptionEditorDialog = lazy(() => import('./CaptionEditorDialog'));
import {
  summarizeFlagged, rejectableFlagged, rejectFlaggedConfirmText, flaggedSourceNote,
} from './watermarkFlagged.js';
import { useToast } from '../common/Toast';
import { copyText } from '../../utils/copyText';
import { FolderBrowserModal } from '../common/FolderPicker';
import { SEGMENT_CLASS, SEGMENT_GROUP_CLASS, btnClass, btnShape, controlHeight, fieldClass } from '../common/controls';
import ImportQueuePanel from './ImportQueuePanel';
import { useCapabilities } from '../../context/CapabilitiesContext';
import InstallRunner from '../setup/InstallRunner';
import GuidedChecklist from './GuidedChecklist';
import NextStepCard from './NextStepCard';
import TrainingReadiness from './TrainingReadiness';
import useGuidedFlow from '../../hooks/useGuidedFlow';
import { filterImages, normalizeTag } from '../../utils/tagFilter';
import {
  GRID_STATUS_FILTERS, DEFAULT_GRID_STATUS_FILTER,
  filterImagesByStatus, gridStatusFilterCounts, normalizeGridStatusFilter,
} from '../../utils/gridStatusFilter';
import {
  DEFAULT_DATASET_SORT, datasetSortOptions, normalizeDatasetSort, sortDatasetImages,
} from '../../utils/gridSort';
import {
  buildSmallImageRescuePairs,
  filterSmallImageRescueGrid,
  isSmallImageRescueRow,
} from '../../utils/smallImageRescue';
import { describeDerivedComparison } from '../../utils/derivedCompare';
import { WORKSPACE_SECTIONS, SECTION_FOR_TARGET } from './workspaceSections';
import { apiFetch, postJson, putJson } from '../../api/fetchClient';
import { datasetToBankRequest, datasetToBankUrl } from './datasetToBank';
import { HelpBadge } from '../../help/HelpMode';
import SettingsLink from '../common/SettingsLink';
import { requestHelpTip } from '../../help/helpTips';
import { openCollapsedAncestors } from '../../help/revealTarget';
import { activeLocalLlm } from '../../utils/localLlm';
import {
  PANEL_STATUS,
  getWorkspacePanel,
  getWorkspacePanelStatus,
  getWorkspacePanels,
  resolveWorkspaceLocation,
  withWorkspaceLocation,
} from './workspaceNavigation';

const EMPTY_IMAGES = Object.freeze([]);

// Grid decision filter (All / Undecided / Kept / Rejected / Improve candidates):
// a VIEW preference, not dataset data, so it is persisted globally — same lazy-init
// + effect pattern as `datasetGridTileSize` (DatasetGrid.jsx) / `cloudRunsRecentCollapsed`.
// Because it SURVIVES a reload, the filtered-view banner above the grid is not
// cosmetic: it is the only thing that stops a persisted filter from reading as
// "my images are gone" when the workspace is reopened.
const GRID_STATUS_FILTER_KEY = 'datasetGridStatusFilter';
// Grid ordering (default / face similarity ↓ / ↑) — same persisted-view-preference
// pattern. The KEY and the stored ids are stable handles: never rename either.
const GRID_SORT_KEY = 'datasetGridSort';

// Shared style for secondary actions in the header's More menu.
const MENU_ITEM = 'min-h-10 lg:min-h-0 w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-sm text-content hover:bg-surface-raised disabled:opacity-40';

function SectionHeading({ id, title, badge }) {
  return (
    <div id={id} tabIndex={-1}>
      <h2 className="m-0 flex items-center gap-2 text-content text-base font-semibold lg:text-xl">{title}{badge}</h2>
    </div>
  );
}

/*
 * Sidebar count badge: amber means action needed (triage, watermarks, leaks), pulsing indigo means
 * generation in progress, neutral means information. Never color alone: sr-only text spells out
 * the meaning.
 */
function NavBadge({ badge }) {
  if (!badge) return null;
  const cls = badge.tone === 'amber' ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
    : badge.tone === 'indigo' ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200'
    : 'border-border bg-surface-raised text-content-subtle';
  return (
    <span
      className={`ml-auto shrink-0 rounded-full border px-1.5 py-px text-2xs font-semibold tabular-nums ${cls} ${badge.pulse ? 'animate-pulse' : ''}`}>
      <span aria-hidden>{badge.n}</span>
      <span className="sr-only">. {badge.srLabel}</span>
    </span>
  );
}

/* Decision filter above the grid — isolate what still needs a ✓/✕, what was kept
   or rejected, or the Klein improvement candidates, without hunting through the
   whole set. It narrows the list the grid receives, so auto-triage, "select all"
   and every bulk action then operate on exactly what is on screen. Composes with
   the caption tag filter (both apply). */
function GridStatusFilter({ value, counts, onChange, children }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" role="group"
      aria-label="Filter and sort images">
      {GRID_STATUS_FILTERS.map((f) => {
        const on = f.id === value;
        return (
          <Chip key={f.id} size="sm" pressed={on} title={f.title}
            onClick={() => onChange(f.id)} className="tabular-nums">
            {f.label} ({counts[f.id] ?? 0})
          </Chip>
        );
      })}
      {children}
    </div>
  );
}

/* Two ways to arrange the grid, and they answer different questions.
   MEASURED (face similarity to the reference — asked for by nofaceman, Discord)
   ranks the whole grid best-to-worst; CATEGORICAL (shot type — asked for by
   .samexit, Discord) does not rank anything, it puts every face shot in one run,
   every bust in the next, so near-identical images can be compared side by side
   instead of scattered through the arrival order. Nothing else is offered: the
   aesthetic/sharpness scores live on bank images, which have their own sort.
   Sorting NARROWS nothing: it composes with both grid filters, and since the
   grid derives its tiles AND its "select all" from the same list, the selection
   follows the order on screen. Images a pass never reached go last, both ways;
   an entry whose pass has not run is greyed out naming that pass, rather than
   silently reordering nothing. min-w-0 keeps the select within its grid cell. */
function GridSortSelect({ value, images, onChange }) {
  return (
      <Select size="sm" value={value} onChange={(e) => onChange(e.target.value)}
        aria-label="Sort the grid"
        title="Sort images. Unscored images go last."
        className="w-full min-w-0">
        {datasetSortOptions(images).map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled} title={o.title}>
            {o.label}
          </option>
        ))}
      </Select>
  );
}

/* Loud banner sitting directly above the grid whenever a tag filter is active,
   so the user can NEVER mistake a filtered view for "images disappeared". Shows
   every active exclusion (⊘) / inclusion (◉ only) as a removable chip, the live
   "showing N of M" count, and a one-click "clear all". Session-only state lives
   in the parent workspace (transient view, not persisted). */
function GridFilterBar({
  excludes, includes, statusLabel, coverageLabel, shown, total,
  onRemoveExclude, onRemoveInclude, onRemoveStatus, onRemoveCoverage, onClearAll,
}) {
  return (
    <div role="status" data-probe-chrome="filter-bar"
      className="flex items-center gap-2 flex-wrap rounded-lg border-2 border-amber-400/50 bg-amber-400/10 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-amber-200 text-sm font-semibold shrink-0"><Filter aria-hidden="true" className="h-4 w-4" /> Filtered view</span>
      <span className="text-content-muted text-xs tabular-nums shrink-0">
        showing {shown} of {total}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {statusLabel && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/15 pl-2 pr-1 py-0.5 text-2xs text-amber-100">
            <span aria-hidden>◧</span> {statusLabel} only
            <button type="button" onClick={onRemoveStatus}
              aria-label="Show images with any decision again"
              className="min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 lg:w-4 lg:h-4 grid place-items-center rounded-full hover:bg-amber-500/30"><X aria-hidden="true" className="h-3 w-3" /></button>
          </span>
        )}
        {coverageLabel && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 pl-2 pr-1 py-0.5 text-2xs text-emerald-100">
            <Search aria-hidden="true" className="h-3 w-3" /> {coverageLabel}
            <button type="button" onClick={onRemoveCoverage}
              aria-label="Stop showing only the images from that coverage chip"
              className="min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 lg:w-4 lg:h-4 grid place-items-center rounded-full hover:bg-emerald-500/30"><X aria-hidden="true" className="h-3 w-3" /></button>
          </span>
        )}
        {excludes.map((t) => (
          <span key={`x-${t}`}
            className="inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/15 pl-2 pr-1 py-0.5 text-2xs text-rose-200">
            <span aria-hidden>⊘</span> {t}
            <button type="button" onClick={() => onRemoveExclude(t)}
              aria-label={`Stop hiding images tagged ${t}`}
              className="min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 lg:w-4 lg:h-4 grid place-items-center rounded-full hover:bg-rose-500/30"><X aria-hidden="true" className="h-3 w-3" /></button>
          </span>
        ))}
        {includes.map((t) => (
          <span key={`i-${t}`}
            className="inline-flex items-center gap-1 rounded-full border border-indigo-400/50 bg-indigo-500/15 pl-2 pr-1 py-0.5 text-2xs text-indigo-200">
            <span aria-hidden>◉</span> only {t}
            <button type="button" onClick={() => onRemoveInclude(t)}
              aria-label={`Stop isolating images tagged ${t}`}
              className="min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 lg:w-4 lg:h-4 grid place-items-center rounded-full hover:bg-indigo-500/30"><X aria-hidden="true" className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <button type="button" onClick={onClearAll}
        className="ml-auto shrink-0 text-content-muted underline hover:text-content text-xs">
        clear all
      </button>
    </div>
  );
}

export default function DatasetWorkspace({ ds, onBack }) {
  const [identityFilter, setIdentityFilter] = useState('');
  const [identityIds, setIdentityIds] = useState(null);
  const [identityError, setIdentityError] = useState('');
  const [identityVersion, setIdentityVersion] = useState(0);
  const [quickSet, setQuickSet] = useState(false);
  const identityDatasetId = ds.data?.id;
  const identityScope = ds.data?.instance_id;
  const identityRevision = ds.data?.identity_revision;
  const identityFilterScope = useRef('');
  const identityImageKey = (ds.data?.images || []).map((image) => image.id).join(',');
  useEffect(() => {
    if (!identityFilter || !identityDatasetId) {
      identityFilterScope.current = ''; setIdentityIds(null); setIdentityError(''); return;
    }
    const controller = new AbortController();
    const key = identityDatasetId + ':' + identityScope + ':' + identityFilter;
    if (identityFilterScope.current !== key) setIdentityIds([]);
    identityFilterScope.current = key;
    identityFetch('/api/identity/dataset/' + identityDatasetId + '/filter/' + identityFilter,
      { signal: controller.signal })
      .then((data) => { setIdentityIds(data.image_ids); setIdentityError(''); })
      .catch((error) => { if (!controller.signal.aborted) { setIdentityIds([]); setIdentityError(error.message); } });
    return () => controller.abort();
  }, [identityFilter, identityDatasetId, identityScope, identityRevision, identityImageKey, identityVersion]);
  const navigate = useNavigate();
  const toast = useToast();
  const { caps, loading: capsLoading, refresh: refreshCaps } = useCapabilities();
  // 📷 With the other hooks, above the loading return — rules-of-hooks.
  const d = ds.data;
  // 🎭 Analyze faces: state + tooltip derived from the SERVER's verdict
  // (`face_scoring_blocked`, a sentence or null) — see faceScoringGate.js. The UI
  // never decides on its own which subjects InsightFace can read.
  const faceAnalysis = faceAnalysisState({
    blockedReason: d?.face_scoring_blocked,
    hasRef: !!d?.ref_filename,
    busy: ds.busy,
    // InsightFace/antelopev2 are an optional extra: without them the button used
    // to look alive and only failed on click. Now it names the gap and links Setup.
    capable: !!caps?.face_scoring,
    capsLoading,
  });
  const [cropImg, setCropImg] = useState(null);
  // 🔍 The coverage chip the user clicked, or null. Session-only like the tag
  // filters: it is a way of LOOKING at the set, not a property of it, and one
  // that would be actively misleading to restore days later against a dataset
  // whose captions have since been rewritten. {key, label, ids}.
  const [coverageFilter, setCoverageFilter] = useState(null);
  const [captionOptionsOpen, setCaptionOptionsOpen] = useState(false);
  // Frozen snapshot of the flagged queue when review mode opens (null = closed).
  const [reviewQueue, setReviewQueue] = useState(null);
  // What the last "Reject all flagged" actually did, in the SERVER's number, and
  // the way back. The undo exists (Show ▸ Rejected → ✓ Keep) but it only exists
  // for the user if it is named at the moment it becomes useful.
  const [rejectFlaggedNote, setRejectFlaggedNote] = useState('');
  const zipInput = useRef(null);   // hidden input for "Import dataset (ZIP)"
  const [refCrop, setRefCrop] = useState(false);
  const [refEdit, setRefEdit] = useState(false);
  // Filename of the extra reference being cropped (extras have no numeric id).
  const [extraRefCrop, setExtraRefCrop] = useState(null);
  const [viewImg, setViewImg] = useState(null);
  const [gridBulkBusy, setGridBulkBusy] = useState(false);
  const [gridSelection, setGridSelection] = useState({ datasetId: null, ids: [] });
  const onGridSelectionChange = useCallback((datasetId, ids) => {
    setGridSelection((previous) => previous.datasetId === datasetId
      && previous.ids.length === ids.length && previous.ids.every((id, index) => id === ids[index])
      ? previous : { datasetId, ids });
  }, []);
  useEffect(() => {
    if (gridBulkBusy) setViewImg(null);
  }, [gridBulkBusy]);
  useEffect(() => { setGridBulkBusy(false); }, [d?.id]);
  const [captionMode, setCaptionMode] = useState(null);   // null selects the automatic default for train_type.
  const [showLeaks, setShowLeaks] = useState(false);       // Expanded list of captions with leaks.
  const [captionToolsOpen, setCaptionToolsOpen] = useState(false);
  /* 🧪 Caption Lab, opened from the Captions section: which image to bench
     (picker), then the image it named. The bench itself is the existing caption
     editor on its Lab tab — this adds an ENTRY POINT, not a second bench. */
  const [labPickerOpen, setLabPickerOpen] = useState(false);
  const [labImage, setLabImage] = useState(null);
  const [installInpaintOpen, setInstallInpaintOpen] = useState(false);  // LaMa installation panel
  const [watermarkMethod, setWatermarkMethod] = useState('lama');  // Batch inpainting engine: lama | klein
  const [kleinCompareOpen, setKleinCompareOpen] = useState(false); // Compare models before the batch.
  const [kleinCompareState, setKleinCompareState] = useState({ choices: [], stored: null });
  /* What 🧽 Clean aims at: every flagged page ('all'), only the 🔤 text-flagged
     ones ('text'), or only the 🚩 watermark-flagged ones ('watermark'). The
     split is BY PAGE — a page carrying both counts as text (its zones share one
     channel, so one page is never split between two runs). Bank parity: its
     panel offers the same three, in the same words. */
  const [watermarkTarget, setWatermarkTarget] = useState('all');
  // 🔤 Find text launch window (full parity with the bank's). Hook up here
  // with its siblings — the counts it prices live next to watermarkDetected,
  // past the early returns.
  const [textScanOpen, setTextScanOpen] = useState(false);
  // 🚩 Find watermarks launch window — same standard as 🔤 (sample, threshold,
  // results in the window). The button used to fire straight from the click.
  const [wmScanOpen, setWmScanOpen] = useState(false);
  const [savingAllowCrop, setSavingAllowCrop] = useState(false);  // write-through of the auto-crop pref
  const [checkpointCount, setCheckpointCount] = useState(0);
  const [checkpointHost, setCheckpointHost] = useState(null);
  const [trainingNavigation, setTrainingNavigation] = useState({ ready: false, queueCount: 0 });
  // Continue anyway: acknowledgment from the readiness badge bypasses the quality safeguard,
  // unlocks Train and reaches launch as allow_not_ready. The server remains authoritative.
  const [notReadyAck, setNotReadyAck] = useState(false);
  const [duplicateReview, setDuplicateReview] = useState(null);
  const [duplicateReviewVersion, setDuplicateReviewVersion] = useState(0);
  useEffect(() => { setDuplicateReview(null); setDuplicateReviewVersion(0); }, [ds.currentId]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importToBankOpen, setImportToBankOpen] = useState(false);
  const [folderBrowseOpen, setFolderBrowseOpen] = useState(false);
  // Grid tag-filter (session-only): tags whose images are hidden (exclude) or the
  // ONLY tags allowed through (include). Both are normalized (trim+lowercase).
  const [excludeTags, setExcludeTags] = useState([]);
  const [includeTags, setIncludeTags] = useState([]);
  // Grid decision filter — PERSISTED (see GRID_STATUS_FILTER_KEY), unlike the
  // session-only tag filter: isolating the undecided pile is a working mode you
  // keep across reloads, not a one-off lookup.
  const [statusFilter, setStatusFilter] = useState(() => {
    try { return normalizeGridStatusFilter(localStorage.getItem(GRID_STATUS_FILTER_KEY)); }
    catch { return DEFAULT_GRID_STATUS_FILTER; }
  });
  useEffect(() => {
    try { localStorage.setItem(GRID_STATUS_FILTER_KEY, statusFilter); }
    catch { /* ignore — private mode */ }
  }, [statusFilter]);
  // Grid sort — PERSISTED like the decision filter: "show me the least-alike
  // first" is a working mode you keep across reloads, not a one-off lookup. The
  // stored value is normalised on read, so an id from an older build (or a
  // hand-edited localStorage) degrades to the default order instead of freezing
  // the grid on a sort nothing implements.
  const [gridSort, setGridSort] = useState(() => {
    try { return normalizeDatasetSort(localStorage.getItem(GRID_SORT_KEY)); }
    catch { return DEFAULT_DATASET_SORT; }
  });
  useEffect(() => {
    try { localStorage.setItem(GRID_SORT_KEY, gridSort); }
    catch { /* ignore — private mode */ }
  }, [gridSort]);
  const [searchParams, setSearchParams] = useSearchParams();
  // "Allow auto-crop" is a persisted preference (Settings ▸ Watermark inpainting). The
  // batch Clean bar shows the SAME setting and writes it through here, so there's one
  // source of truth: Clean then reads it server-side. Best-effort — a failed save leaves
  // the toggle where it was and tells the user, never silently diverging from Settings.
  const allowAutoCrop = caps.watermark_allow_crop !== false;
  const setWatermarkAllowCrop = useCallback(async (value) => {
    setSavingAllowCrop(true);
    try {
      await putJson('/api/settings', { config: { watermark: { allow_crop: Boolean(value) } } });
      await refreshCaps(true);
    } catch {
      toast.error('Could not save the auto-crop preference');
    } finally {
      setSavingAllowCrop(false);
    }
  }, [refreshCaps, toast]);
  const navImages = d?.images || EMPTY_IMAGES;
  // A section that exists to host a plugin slot (Scrape) is listed only while a
  // plugin fills it: with the plugin disabled or absent the rail shows no empty
  // destination, the "Scrape images from the web" shortcut goes with it, its
  // help tip stays quiet, and a stored ?section=scrape normalizes to the default
  // section instead of an empty page. The registry is fixed after boot.
  const { hasScrape, visibleSections, hiddenSectionIds } = useMemo(() => {
    const visible = WORKSPACE_SECTIONS.filter((s) => !s.slot || hasContributions(s.slot, 'dataset'));
    return {
      hasScrape: hasContributions('sources.panel', 'dataset'),
      visibleSections: visible,
      hiddenSectionIds: WORKSPACE_SECTIONS.filter((s) => !visible.includes(s)).map((s) => s.id),
    };
  }, []);
  const navContext = useMemo(() => ({
    kind: d?.kind || 'character',
    hiddenSections: hiddenSectionIds,
    hasSelectableImages: filterSmallImageRescueGrid(navImages)
      .some((image) => Boolean(image.filename)),
    hasKeptImages: navImages.some((image) => image.status === 'keep'),
    hasCaptionedKept: navImages.some(
      (image) => image.status === 'keep' && Boolean((image.caption || '').trim()),
    ),
    hasLeakMetadata: Boolean(d?.caption_leak),
    watermarkDetected: navImages.filter((image) => image.watermark_state === 'detected').length,
    watermarkRejectable: rejectableFlagged(navImages).length,
    smallImageRescue: buildSmallImageRescuePairs(navImages).filter((pair) => !pair.resolved).length,
    unused: navImages.filter((image) => (image.status === 'reject' || image.status === 'failed')
      && !isSmallImageRescueRow(image)).length,
    // The capabilities themselves, for the rows plugins contribute: their
    // `when(context)` reads the capability THEY own (a publisher's token…).
    caps,
    trainingVisible: Boolean(caps.training_visible),
    trainingStatusReady: !caps.training_visible || trainingNavigation.ready,
    trainingQueueCount: trainingNavigation.queueCount,
    studioVisible: Boolean(caps.studio_visible),
  }), [d, navImages, caps, trainingNavigation, hiddenSectionIds]);
  const workspaceLocation = resolveWorkspaceLocation(searchParams, navContext);
  const section = workspaceLocation.section;
  const panel = workspaceLocation.panel;
  const mobileRailRef = useRef(null);

  const writeWorkspaceLocation = useCallback((sectionId, panelId = null, replace = false) => {
    setSearchParams(
      (previous) => withWorkspaceLocation(previous, sectionId, panelId),
      { replace },
    );
  }, [setSearchParams]);

  const focusRequestedRef = useRef(false);
  const [landingRequest, setLandingRequest] = useState(0);

  const setSection = useCallback((sectionId) => {
    focusRequestedRef.current = false;
    writeWorkspaceLocation(sectionId, null, false);
  }, [writeWorkspaceLocation]);

  const navigateToPanel = useCallback((sectionId, panelId) => {
    if (getWorkspacePanelStatus(sectionId, panelId, navContext) !== PANEL_STATUS.AVAILABLE) return;
    focusRequestedRef.current = true;
    setLandingRequest((value) => value + 1);
    writeWorkspaceLocation(sectionId, panelId, false);
  }, [navContext, writeWorkspaceLocation]);

  const clearActivePanel = useCallback(() => {
    focusRequestedRef.current = false;
    writeWorkspaceLocation(section, null, true);
  }, [section, writeWorkspaceLocation]);

  useEffect(() => {
    if (!d || workspaceLocation.pending || !workspaceLocation.needsNormalization) return;
    setSearchParams(
      (previous) => withWorkspaceLocation(previous, workspaceLocation.section, workspaceLocation.panel),
      { replace: true },
    );
  }, [d, workspaceLocation.pending, workspaceLocation.needsNormalization,
      workspaceLocation.section, workspaceLocation.panel, setSearchParams]);

  useEffect(() => {
    const destination = panel ? getWorkspacePanel(section, panel) : null;
    if (destination?.reveal === 'caption-leak') setShowLeaks(true);
    if (destination?.reveal === 'caption-tools') setCaptionToolsOpen(true);
  }, [section, panel]);

  const onRevealOpenChange = useCallback((panelId, nextOpen, setter) => {
    setter(nextOpen);
    if (!nextOpen && panel === panelId) clearActivePanel();
  }, [panel, clearActivePanel]);
  // Hooks must run unconditionally on every render — deriveSteps() null-guards `d`,
  // so this is safe to call before the loading early-return below.
  const { steps, nextStep } = useGuidedFlow(d, caps, checkpointCount);
  // Filters are per-dataset & transient — drop them when switching datasets so they
  // never leak from one dataset to the next.
  useEffect(() => { setExcludeTags([]); setIncludeTags([]); }, [d?.id]);

  // The landing effect below keys on the dataset IDENTITY (id), never the polled
  // `d` object. While a generation runs, useDataset re-fetches every 4 s and hands
  // back a brand-new object each time; depending on `d` would re-run the landing
  // and re-fire scrollIntoView on every poll, yanking the view back to the active
  // panel's anchor (`ds-add-reference` when the Reference panel is selected). The
  // id is stable across polls, still flips on null→loaded and on a dataset switch,
  // and the effect's own MutationObserver/rAF/timeout already handle a target that
  // appears slightly after the data does.
  const datasetId = d?.id ?? null;

  useEffect(() => {
    if (datasetId == null || !panel || workspaceLocation.pending) return undefined;
    const destination = getWorkspacePanel(section, panel);
    if (!destination) return undefined;
    const revealReady = destination.reveal === 'caption-leak'
      ? showLeaks
      : destination.reveal === 'caption-tools'
        ? captionToolsOpen
        : true;
    if (!revealReady) return undefined;
    let finished = false;
    let observer;
    let timer;
    let frame;

    const land = () => {
      if (finished) return true;
      const target = document.getElementById(destination.targetId);
      if (!target) return false;
      // A panel can live inside a collapsed disclosure (the "More ways out"
      // <details> in Import & export). Chromium still reports a client rect for
      // that subtree, so the landing below would happily scroll+ring something
      // the user cannot see. Open the disclosures on the way up first, starting
      // at the PARENT: a target that IS a <details> (Advanced options,
      // Checkpoints) is React-controlled and stays driven by its own state,
      // which the reveal guard right after this waits for.
      openCollapsedAncestors(target.parentElement);
      if (target.getClientRects().length === 0) return false;
      if ((destination.reveal === 'training-advanced'
          || destination.reveal === 'training-checkpoints') && !target.open) return false;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.remove('gf-highlight');
      void target.offsetWidth;
      target.classList.add('gf-highlight');
      window.setTimeout(() => target.classList.remove('gf-highlight'), 1500);
      if (focusRequestedRef.current) {
        const focusableSelector = [
          'button:not([disabled])', 'a[href]', 'input:not([disabled])',
          'select:not([disabled])', 'textarea:not([disabled])', 'summary',
          '[tabindex]:not([tabindex="-1"])',
        ].join(', ');
        const preferred = destination.focusSelector
          ? target.querySelector(destination.focusSelector)
          : target.querySelector('[data-workspace-focus]');
        const fallback = target.matches(focusableSelector)
          ? target
          : target.querySelector(focusableSelector);
        let focusTarget = preferred?.matches?.(':not(:disabled)') ? preferred : fallback;
        if (!focusTarget) {
          const nativeControl = target.matches('button, input, select, textarea');
          if (!nativeControl) {
            if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
            focusTarget = target;
          } else {
            focusTarget = document.getElementById(`ds-section-${section}-heading`);
          }
        }
        focusTarget?.focus({ preventScroll: true });
        focusRequestedRef.current = false;
      }
      finished = true;
      observer?.disconnect();
      if (timer) window.clearTimeout(timer);
      return true;
    };

    if (!land()) {
      observer = new MutationObserver(land);
      observer.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'open'],
      });
      frame = requestAnimationFrame(() => {
        frame = undefined;
        land();
      });
      timer = window.setTimeout(() => {
        if (finished) return;
        observer.disconnect();
        const shouldFocus = focusRequestedRef.current;
        focusRequestedRef.current = false;
        writeWorkspaceLocation(section, null, true);
        if (shouldFocus) {
          document.getElementById(`ds-section-${section}-heading`)?.focus({ preventScroll: true });
        }
      }, 2000);
    }

    return () => {
      finished = true;
      observer?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, [datasetId, section, panel, workspaceLocation.pending, landingRequest,
      showLeaks, captionToolsOpen, writeWorkspaceLocation]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const rail = mobileRailRef.current;
      if (!rail?.clientWidth) return;
      const parentChip = rail.querySelector(`[data-mobile-section="${section}"]`);
      const childChip = panel
        ? rail.querySelector(`[data-mobile-panel="${panel}"]`)
        : null;
      const chip = childChip || parentChip;
      if (!chip) return;
      const { left, right } = chip.getBoundingClientRect();
      const bounds = rail.getBoundingClientRect();
      if (left < bounds.left) rail.scrollLeft += left - bounds.left;
      else if (right > bounds.right) rail.scrollLeft += right - bounds.right;
    });
    return () => cancelAnimationFrame(frame);
  }, [datasetId, section, panel]);

  // One-time contextual tips (best-effort; shown once ever, independent of Help
  // mode). Each fires when the user first reaches the relevant surface.
  // MUST live above the `!d` early return: hooks after a conditional return
  // change the hook count between the Loading render and the loaded one
  // (React #310 crash — caught by runtime verification).
  const leakingCount = ((d && d.images) || []).filter((i) => i.leak).length;
  useEffect(() => { if (leakingCount >= 1) requestHelpTip('leak-panel-visible'); }, [leakingCount]);
  useEffect(() => { if (settingsOpen) requestHelpTip('dataset-settings-open'); }, [settingsOpen]);

  // ⏹ Stop generation: the cancel happens server-side WITHIN the request (the
  // in-flight rows are dropped before it answers), so a local flag covering the
  // round-trip is the honest feedback — without it the click looked like a no-op
  // and users re-clicked, believing Stop was broken. The ✨ improve batch keeps
  // its own longer-lived server `cancelling` (its worker unwinds asynchronously).
  // Above the early return for the same hook-count reason as the tips above.
  const [stoppingGeneration, setStoppingGeneration] = useState(false);
  const stopGeneration = useCallback(async () => {
    setStoppingGeneration(true);
    // finally, not "on success": a failed cancel must give the button back.
    try { await ds.cancelPending(); } finally { setStoppingGeneration(false); }
  }, [ds]);

  if (!d) return <p className="text-content-subtle text-sm">Loading</p>;

  const images = d.images || [];
  const rescuePairs = buildSmallImageRescuePairs(images);
  const unresolvedRescuePairs = rescuePairs.filter((pair) => !pair.resolved);
  // An unresolved pair is intentionally absent from the generic grid/bulk
  // controls: only the atomic side-by-side resolver may decide it. Once resolved,
  // the chosen keep + rejected counterpart return to the regular dataset view.
  const unresolvedRescueIds = new Set(unresolvedRescuePairs.flatMap(
    (pair) => [pair.original.id, pair.candidate.id],
  ));
  const rescueGridImages = filterSmallImageRescueGrid(images);
  const rescueReviewCount = unresolvedRescuePairs.length;
  // Concept and Style hide character-only reference, generation and face tools.
  // All kinds share import, curation, caption and completion guidance.
  const isConcept = d.kind === 'concept';
  const isStyle = d.kind === 'style';
  const isConceptual = isConcept || isStyle;
  // Leak checks depend on KIND: characters flag identity, concepts flag captions naming the
  // concept that must bind to the trigger, and styles never flag subject descriptions because
  // those ARE the content. isConceptual only controls layout. Body fidelity also excludes body
  // markings from captions, targets more bust/body shots and defaults to full-frame import.
  const bodyFid = d.fidelity === 'body';
  // The kept pile itself, not only its size: it is what a caption pass reads, and
  // what the 🧪 Caption Lab picker offers as benchable subjects.
  const keptImages = images.filter((i) => i.status === 'keep');
  const kept = keptImages.length;
  const unused = images.filter((i) => (i.status === 'reject' || i.status === 'failed')
    && !isSmallImageRescueRow(i)).length;
  const keptUncaptioned = images.filter((i) => i.status === 'keep' && !i.caption).length;
  const keptCaptioned = kept - keptUncaptioned;
  // Hand-written captions ('asserted'): a forced 🔄 Re-caption spares them, so the
  // confirm and the button must count only what the pass will actually rewrite.
  const keptAsserted = images.filter((i) => i.status === 'keep' && i.caption
    && i.caption_origin === 'asserted').length;
  const recaptionable = keptCaptioned - keptAsserted;
  // Captions that still leak identity/concept — the Identity-leak panel lists them for
  // in-place edit AND targeted 🔄 Re-caption (per row + a "Re-caption all leaking" header).
  const leakingImages = images.filter((i) => i.leak);
  // Overlaid watermarks still awaiting removal → drives the "🧽 Clean (N)" button.
  const watermarkDetected = images.filter((i) => i.watermark_state === 'detected').length;
  // …and how many of those are 🔤 text-flagged pages — the "What to clean"
  // selector prices its three choices from this split, and only appears when
  // there IS a split (with no text page the three choices collapse into one).
  const textFlaggedDetected = images.filter(
    (i) => i.watermark_state === 'detected' && i.text_state === 'detected').length;
  const cleanTargetCount = watermarkTarget === 'text' ? textFlaggedDetected
    : watermarkTarget === 'watermark' ? watermarkDetected - textFlaggedDetected
    : watermarkDetected;
  // 🔤 window pricing: the kept pile the pass actually reads — dismissed rows
  // are the machine's no-go, already-answered rows only re-enter through the
  // redo line.
  const keptForText = images.filter(
    (i) => i.status === 'keep' && i.watermark_state !== 'dismissed');
  const textToRead = keptForText.filter(
    (i) => !i.text_state || i.text_state === 'error').length;
  // …and what that pile is really made of: what a bulk reject would move, what it
  // would refuse to touch, which detector judged, and how many carry no position.
  const flagged = summarizeFlagged(images);
  const flaggedNote = flaggedSourceNote(flagged);
  // Caption style defaults to AUTO: booru tags for booru-native SDXL, prose otherwise, unless
  // overridden by the picker. Anima is HYBRID: both forms are native. Prose is only a starting
  // point; choosing booru is valid and triggers no launch safeguard.
  const effCaptionMode = captionMode || (['sdxl', 'anima'].includes(d.train_type) ? 'booru' : 'prose');
  // ── Grid tag-filter (session-only) ──────────────────────────────────────────
  // A tag is toggled in its list and mutually excluded from the other (a tag can't
  // be both hidden and isolated). Match mode follows the caption style so booru
  // captions match a whole tag, prose captions a whole word (see utils/tagFilter).
  const toggleTag = (setSelf, setOther) => (raw) => {
    const t = normalizeTag(raw);
    if (!t) return;
    setOther((prev) => prev.filter((x) => x !== t));
    setSelf((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };
  const toggleExclude = toggleTag(setExcludeTags, setIncludeTags);
  const toggleInclude = toggleTag(setIncludeTags, setExcludeTags);
  const clearFilters = () => {
    setIdentityFilter('');
    setExcludeTags([]); setIncludeTags([]); setStatusFilter(DEFAULT_GRID_STATUS_FILTER);
    setCoverageFilter(null);
  };
  const tagFiltersActive = excludeTags.length > 0 || includeTags.length > 0;
  const statusFilterActive = statusFilter !== DEFAULT_GRID_STATUS_FILTER;
  const filtersActive = tagFiltersActive || statusFilterActive || !!coverageFilter || !!identityFilter;
  const statusFilterLabel = GRID_STATUS_FILTERS.find((f) => f.id === statusFilter)?.label || '';
  const statusFilterOpts = { unresolvedRescueIds };
  const identitySet = new Set(identityIds || []);
  const identityPool = identityFilter ? rescueGridImages.filter((image) => identitySet.has(image.id)) : rescueGridImages;
  const statusCounts = gridStatusFilterCounts(identityPool, statusFilterOpts);
  // The list actually rendered by the grid. Filtering here means select-all,
  // auto-triage and every bulk action operate ONLY on the visible images. The
  // Caption-tools counts keep using the full `images` list (global, never lies).
  // Decision filter first, tag filter on top — the two compose, order-independent.
  // The sort runs LAST and only reorders: membership is entirely the filters'
  // business, so "shown / total" and every bulk action keep meaning what they say.
  const filteredGridImages = filterImages(
    filterImagesByStatus(identityPool, statusFilter, statusFilterOpts),
    { excludes: excludeTags, includes: includeTags, mode: effCaptionMode },
  );
  // 🔍 A coverage chip narrows to the exact images that bucket counted. It is an
  // id list rather than a re-run of the lexicon in the browser: the panel and the
  // grid then cannot disagree about what "profile 3" means, and the app keeps ONE
  // place where a caption is read for variety (services/caption_coverage.py).
  // Third filter, same rank as the other two — so it also narrows what select-all
  // and every bulk action see, which is the point of picking a bucket.
  const coverageIds = coverageFilter ? new Set(coverageFilter.ids) : null;
  const gridImages = sortDatasetImages(coverageIds
    ? filteredGridImages.filter((i) => coverageIds.has(i.id))
    : filteredGridImages, gridSort);
  // (Divergence 1) upstream's `summarizeGeneration`/`refusalHeadline` tally is NOT
  // taken with the chip filter it shipped beside: generationOutcome.js is the
  // removed cloud engines' refusal notice, and is deleted on this fork.
  const pending = images.filter((i) => i.status === 'pending' && !i.filename
    && !unresolvedRescueIds.has(i.id)).length;
  // The same rows minus the ✨ improve candidates. `pending` counts everything in
  // flight, which is right for the progress banner ("3 generating…"); it is wrong
  // for the ⚡ Generate double-click guard, which asks "is a GENERATION batch
  // already running?". While the button was greyed during an improve batch the
  // question never came up — now that it is clickable, which is the whole point
  // of #44, the first click of the nominal path met a dialog announcing a batch
  // that did not exist.
  const pendingGenerations = images.filter((i) => i.status === 'pending' && !i.filename
    && i.derivation_kind !== IMPROVE_DERIVATION
    && !unresolvedRescueIds.has(i.id)).length;
  const triage = images.filter((i) => i.status === 'pending' && i.filename
    && !unresolvedRescueIds.has(i.id)).length;   // generated/imported, awaiting ✓/✕

  const toggleLeakReview = () => {
    onRevealOpenChange('leak-review', !showLeaks, setShowLeaks);
  };

  /*
   * Jump to a gf-* anchor (checklist, NextStep, preflight Fix link): select its sidebar section
   * first, then scroll and flash once VISIBLE. Inactive sections stay mounted with display:none,
   * so getClientRects() is empty until the switch paints.
   */
  const jumpTo = (step) => {
    setSection(SECTION_FOR_TARGET[step.targetId] || 'images');
    let tries = 0;
    const attempt = () => {
      const el = document.getElementById(step.targetId);
      if (el) openCollapsedAncestors(el.parentElement);
      if (!el || el.getClientRects().length === 0) {
        if (tries++ < 20) requestAnimationFrame(attempt);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const b = el.querySelector('button:not([disabled])'); if (b) b.focus({ preventScroll: true });
      // Flash the landed-on block (gf-highlight, index.css) so the eye finds it.
      // remove + reflow restarts the animation when the same step is clicked twice.
      el.classList.remove('gf-highlight');
      void el.offsetWidth;
      el.classList.add('gf-highlight');
      window.setTimeout(() => el.classList.remove('gf-highlight'), 1500);
    };
    requestAnimationFrame(attempt);
  };
  const nextAction = () => {
    if (!nextStep) return;
    if (nextStep.id === 'caption') { ds.caption(effCaptionMode); return; }
    if (nextStep.id === 'finish' && !caps.training_visible) { exportZipGuarded(); return; }
    if (nextStep.id === 'studio') { navigate(`/studio?dataset=${d.id}`); return; }
    jumpTo(nextStep);
  };
  const nextActionLabel = !nextStep ? '' : {
    reference: 'Set Reference', generate: 'Add Images', curate: 'Review Images',
    caption: 'Caption Images',
    finish: caps.training_visible ? 'Open Training' : `Export ZIP (${kept})`,
    studio: 'Open Studio',
  }[nextStep.id];
  // Keep the inspected image in sync with poll refreshes (label/status updates).
  const viewImgLive = viewImg ? {
    ...(images.find((i) => i.id === viewImg.id) || viewImg),
    _rescueReviewPreview: !!viewImg._rescueReviewPreview,
  } : null;
  const viewImgImproving = viewImgLive ? images.some((image) => (
    image.derivation_kind === 'klein_image_improve'
      && image.parent_image_id === viewImgLive.id
      && image.status === 'pending'
  )) : false;
  const viewImgImprovementReady = viewImgLive ? images.some((image) => (
    image.derivation_kind === 'klein_image_improve'
      && image.parent_image_id === viewImgLive.id
      && image.status === 'pending'
      && !!image.filename
  )) : false;
  // A candidate (manual improve, small-image rescue) can be judged NEXT TO the
  // original it was made from. Resolved here because the parent is another row
  // of the same payload, which the lightbox never receives.
  const viewImgComparison = viewImgLive
    ? describeDerivedComparison(viewImgLive, images)
    : null;
  const canImproveViewImg = !!viewImgLive
    && !viewImgLive._rescueReviewPreview
    && !isSmallImageRescueRow(viewImgLive)
    && viewImgLive.derivation_kind !== 'klein_image_improve';

  // Import to bank — the reverse of promoting bank images into a dataset. Both
  // choices retain Dataset-owned metadata; the default restores compatible
  // final-file technical analysis, while Start fresh skips only prior reuse.
  // Either way the images are COPIED into a bank-owned folder, never shared.
  const importToBank = async ({ name, preserveAnalysis }) => {
    const result = await postJson(datasetToBankUrl(),
      datasetToBankRequest(d.id, name, preserveAnalysis));
    if (!result?.ok) throw new Error(result?.error || 'Could not create the bank');
    toast.success(`Copying ${kept} images to the Bank.`);
    // The bank page picks its open bank from localStorage (it has no :id route),
    // so preselect the new one before navigating rather than landing on the list.
    try { localStorage.setItem('bankCurrentId', String(result.id)); } catch { /* ignore */ }
    setImportToBankOpen(false);
    navigate('/bank');
  };

  // Export ZIP — shared by the header CTA and the Import & export row.
  // Guard-rails: untriaged images are silently EXCLUDED from the zip. Missing
  // captions are a REFUSAL YOU CAN OVERRIDE, never a wall: a Style set with no
  // captions used to be a hard toast.error with no way past it, which blocked a
  // legitimate need — getting the bare images out to caption them in another
  // tool (reported by Qeeyana on Reddit). The reason for the guard-rail is now
  // said out loud, cancelling still walks you to the captions, and the way back
  // in is named so the trip has an end.
  const exportZipGuarded = () => {
    if (triage && !window.confirm(`${triage} image(s) still await triage (✓/✕) and will NOT be in the ZIP. Export anyway?`)) return;
    if (isStyle && keptUncaptioned) {
      const ok = window.confirm(
        `${keptUncaptioned} kept image(s) have no caption.\n\n`
        + 'The ZIP will contain empty caption files. To add captions elsewhere, re-import through Import ZIP.\n\n'
        + 'Export anyway?');
      if (!ok) { jumpTo({ targetId: 'gf-captions' }); return; }
      ds.exportZip();
      return;
    }
    if (keptUncaptioned && !window.confirm(`${keptUncaptioned} kept image(s) without a caption (trigger only). Export anyway?`)) return;
    ds.exportZip();
  };
  // Use the same host-drive browser on desktop and mobile. A native dialog
  // would open on the server, beyond the reach of a remote user.
  const importFolderPrompt = () => setFolderBrowseOpen(true);

  // Amber "in progress" banner text. Captioning keeps its richer live count (derived
  // from the images themselves). Otherwise, when a server-side batch is running
  // (restored from ds.activity after a reload too), name it and show done/total —
  // e.g. "Scanning for watermarks… 12/64". CPU passes (face analysis, watermark
  // clean) don't pause ComfyUI, so their note omits that claim.
  const act = ds.activity;
  const activityCount = act?.total > 0 ? `${act.done || 0}/${act.total}` : '';
  // Stage details must not hide the counter. Some workers include it already.
  const detailHasCount = activityCount && new RegExp(
    `\\b${act.done || 0}\\s*/\\s*${act.total}\\b`,
  ).test(act.detail || '');
  const activityDetail = act?.detail
    ? `${act.detail}${activityCount && !detailHasCount ? ` · ${activityCount}` : ''}`
    : '';
  const importBusy = isDatasetImportBlocked({ localBusy: ds.localBusy, activity: act });
  // Which activities actually hold ComfyUI, and therefore fight the import's
  // auto head-crop for the exclusive GPU vision window. This used to name
  // 'generate' by hand; when the import gate above widened to the whole queue
  // lane, an import started during an ✨ improve batch opened, ran, and died on
  // a 503 "GPU busy" at the crop. `holdsLocalGpu` now answers for every
  // queue-lane kind, and fails safe as local on an unknown engine.
  const visionImportBusy = holdsLocalGpu(act);
  const activityBanner = ds.captioning
    ? `${activityDetail || `Captioning: ${keptCaptioned}/${kept}`} ComfyUI is paused.`
    : (() => {
        if (act) {
          const prog = act.total ? ` ${act.done}/${act.total}` : '';
          // Passes that DON'T claim "ComfyUI is paused": the CPU ones, plus
          // 'generate' (the Klein case is obvious from the tiles appearing).
          // 'analyze_faces' is CPU by default and then claims nothing — but it
          // has a GPU lane (face_scoring.device), and THAT one really does hold
          // the exclusive window. The pass advertises its engine so this line
          // never has to guess.
          const cpu = (act.kind === 'analyze_faces' && act.engine !== 'cuda')
            || (act.kind === 'watermark_clean' && !String(act.detail || '').includes('GPU'))
            || act.kind === 'generate'
            // Same reasoning as 'generate': the improve batch feeds ComfyUI, and
            // the candidates appearing in the grid say so better than a claim.
            || act.kind === 'improve'
            // Upstream's comment says edit_reference is an API call with no GPU
            // use — not true here (Divergence 1c: it renders on Klein/Krea 2
            // Edit through ComfyUI). Kept in this list anyway, for the SAME
            // reason 'generate' is just above: the modal it runs inside already
            // shows the render happening, so a text claim on top is redundant
            // rather than wrong.
            || act.kind === 'edit_reference'
            // Dataset → Bank is a reserved filesystem copy. It blocks edits to
            // keep one coherent source generation, but does not touch the GPU.
            || act.kind === 'bank_export'
            || act.kind === 'bank_import'
            || act.kind === 'source_import'
            || act.kind === 'training_export'
            || act.kind === 'backup';
          const label = {
            watermark_detect: `Scanning for watermarks${prog}`,
            watermark_clean: `Cleaning watermarks${prog}`,
            text_detect: `Reading burned-in text${prog}`,
            caption: `Captioning${prog}`,
            recaption: `Re-captioning${prog}`,
            analyze_faces: `Analyzing faces${prog}`,
            classify: `Classifying framing${prog}`,
            generate: `Generating variations${prog}`,
            improve: `Queuing improvements${prog}`,
            edit_reference: 'Editing reference',
            bank_export: `Copying into a Bank${prog}`,
            bank_import: `Copying images from a Bank${prog}`,
            source_import: `Importing source images${prog}`,
            training_export: 'Freezing the Dataset for training',
            backup: `Creating portable backup${prog}`,
          }[act.kind];
          if (label) {
            // Copy/freeze details are stable phase names, while done/total lives
            // beside them. Prefer the count-aware labels so progress stays visible.
            const detailed = ['bank_export', 'bank_import', 'training_export']
              .includes(act.kind) ? label : (activityDetail || label);
            return `${detailed}${cpu ? '' : ' ComfyUI is paused during the pass.'}`;
          }
        }
        return 'GPU processing in progress (analysis / cropping / captioning) ComfyUI is paused during the pass.';
      })();

  // Sidebar badges: amber for user action, pulsing indigo during generation, neutral for pending
  // information. The caption engine line is empty if this session has no pass, the backend
  // returned no counts, or the run belongs to ANOTHER dataset. The ID check prevents showing
  // another dataset's pass after switching.
  const lastCaptionEngines = ds.lastCaptionRun && ds.lastCaptionRun.datasetId === d.id
    ? captionEnginesSummary(ds.lastCaptionRun.engines) : '';

  const navBadges = {
    images: triage > 0
      ? { n: triage, tone: 'amber', srLabel: `${triage} image(s) awaiting keep/reject` } : null,
    add: pending > 0
      ? { n: pending, tone: 'indigo', pulse: true, srLabel: `${pending} generation(s) in progress` } : null,
    curation: watermarkDetected + rescueReviewCount > 0
      ? {
          n: watermarkDetected + rescueReviewCount,
          tone: 'amber',
          srLabel: `${watermarkDetected} watermark(s) and ${rescueReviewCount} Klein rescue pair(s) to review`,
        } : null,
    captions: (!isStyle && (d.caption_leak?.leaking ?? 0) > 0)
      ? { n: d.caption_leak.leaking, tone: 'amber', srLabel: `${d.caption_leak.leaking} caption(s) leaking` }
      : keptUncaptioned > 0
        ? { n: keptUncaptioned, tone: 'subtle', srLabel: `${keptUncaptioned} kept image(s) without a caption` } : null,
    export: null,
    training: null,
  };

  const activePanels = getWorkspacePanels(section, navContext);

  const panelNavItem = (sectionId, destination, chip = false) => {
    const isActive = sectionId === section && destination.id === panel;
    const className = chip
      ? `min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
          isActive
            ? 'border-indigo-400/60 bg-indigo-500/15 text-indigo-100'
            : 'border-border text-content-subtle hover:text-content'}`
      : `relative w-full rounded-md py-1.5 pl-8 pr-3 text-left text-xs lg:text-sm ${
          isActive
            ? 'bg-indigo-500/10 text-indigo-200'
            : 'text-content-muted hover:bg-surface hover:text-content'}`;
    return (
      <button type="button"
        onClick={() => navigateToPanel(sectionId, destination.id)}
        aria-current={isActive ? 'location' : undefined}
        data-mobile-panel={chip ? destination.id : undefined}
        className={className}>
        {!chip && isActive && (
          <span aria-hidden className="absolute bottom-1.5 left-4 top-1.5 w-px rounded bg-indigo-400" />
        )}
        {destination.title}
      </button>
    );
  };

  // Sidebar item: a desktop vertical rail item (chip=false) or horizontal mobile chip (chip=true),
  // using the Settings sidebar's classes.
  const navItem = (s, chip) => {
    const isActive = s.id === section;
    const base = chip
      ? `flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
          isActive ? 'border-border-strong bg-surface-raised text-content' : 'border-border text-content-muted hover:text-content'}`
      : `relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium lg:text-base ${
          isActive ? 'bg-surface-raised text-content' : 'text-content-muted hover:bg-surface hover:text-content'}`;
    return (
      <button type="button" onClick={() => setSection(s.id)}
        aria-current={isActive ? 'page' : undefined}
        aria-expanded={isActive}
        aria-controls={isActive && (!chip || activePanels.length > 0)
          ? `${chip ? 'dataset-mobile-panels' : 'dataset-nav-panels'}-${s.id}`
          : undefined}
        data-mobile-section={chip ? s.id : undefined}
        className={base}>
        {!chip && isActive && (
          <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded bg-gradient-primary" />
        )}
        <s.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>{s.title}</span>
        <NavBadge badge={navBadges[s.id]} />
        {!chip && <span aria-hidden className="text-content-subtle text-2xs">{isActive ? '▾' : '▸'}</span>}
      </button>
    );
  };

  const sectionMeta = Object.fromEntries(WORKSPACE_SECTIONS.map((s) => [s.id, s]));
  const heading = (id) => {
    const s = sectionMeta[id];
    return <SectionHeading id={`ds-section-${id}-heading`} title={s.title}
      badge={<HelpBadge topic={`workspace-${id}`} />} />;
  };
  // Inactive sections stay mounted but hidden with display:none, preserving polls and internal
  // state. TrainingPanel's 10-second poll ADVANCES the server training queue and must keep running
  // while viewing the grid. Grid selection, expanded panels and the variation catalog also survive
  // switches.
  const sectionCls = (id) => (section === id ? 'flex flex-col gap-3' : 'hidden');

  // Discreet entry point kept in "Add images" after the scraper moved to its own
  // 🕸 Scrape destination — preserves the build-flow's discoverability without the
  // long accordion. Navigates to the Scrape section and focuses its gallery-URL input.
  const scrapeLink = hasScrape && (
    <button type="button" onClick={() => navigateToPanel('scrape', 'scan')}
      className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-content-muted hover:text-content hover:bg-surface-raised transition-colors">
      <Globe aria-hidden="true" className="h-4 w-4" />
      <span className="text-sm font-medium">Scrape images from the web</span>
      <span aria-hidden className="ml-auto text-content-subtle">→</span>
    </button>
  );

  // Third source next to the dropzone and the scraper: a bank or another dataset,
  // image by image (or a bank's whole kept set). The server does the copying
  // (normalize + dedup vs THIS dataset); the panel refreshes us at the end.
  const bankImport = (
    <div className="min-w-0 space-y-3">
    <ImageSourcesPanel datasetId={d.id} datasetName={d.name} disabled={importBusy} onImported={() => ds.refresh()} />
    <BankImportPanel datasetId={d.id} disabled={importBusy}
      onImported={() => ds.refresh()} />
    </div>
  );

  return (
    <div className="flex flex-col gap-2 lg:gap-3">
      {/*
       * Header: dataset identity and ONE primary action, Export ZIP. Secondary configuration
       * actions (settings, fidelity) live in More. Data actions (backup, merge import, publish)
       * live in the sidebar's Import & export section.
       */}
      {/*
       * relative z-30: the header is a flex item; without its own stacking context, the More
       * menu's z-20 would remain trapped below later siblings.
       */}
      <div data-probe-chrome="header" className="relative z-30 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        {/* One control height across the header: back, trigger chip, Export, More. */}
        <div className="flex min-w-0 items-center gap-2 sm:max-w-[50%]">
          <button type="button" onClick={onBack}
            className={`${btnShape({ noShrink: true })} border border-border bg-surface text-content-muted hover:text-content hover:bg-surface-raised`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Datasets
          </button>
          <h1 className="min-w-0 break-words text-xl font-semibold text-content">{d.name}</h1>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:ml-auto sm:min-w-[22rem] sm:flex-1 sm:flex-row sm:items-center">
          {isStyle ? (
            <span title="This Style LoRA is always active when loaded; adjust its LoRA weight to control the effect."
              className={`${controlHeight()} min-w-0 max-w-full inline-flex items-center gap-1 px-2 rounded-md border border-cyan-400/40 bg-cyan-500/10 text-cyan-200 text-2xs sm:flex-1 lg:max-w-sm`}>
              always-on style · no trigger
            </span>
          ) : (
            <button type="button"
              onClick={async () => { const res = await copyText(d.trigger_word || ''); if (!res.ok) toast.error(`Could not copy trigger: ${res.reason}.`); }}
              title="Copy the trigger word (to put in your prompts)"
              className={`${controlHeight()} min-w-0 max-w-full inline-flex items-center gap-1 px-2 rounded-md border border-indigo-400/40 bg-indigo-500/10 text-2xs lg:text-sm sm:flex-1 lg:max-w-sm`}>
              <span className="shrink-0 text-content-subtle">trigger:</span>
              <code title={d.trigger_word || undefined} className="min-w-0 truncate text-indigo-300 font-semibold">{d.trigger_word || 'Unset'}</code>
              <Copy aria-hidden="true" className="h-3 w-3 shrink-0 text-content-subtle" />
            </button>
          )}
          <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:shrink-0 sm:items-center">
            <button type="button" disabled={!kept} onClick={exportZipGuarded}
              className={btnClass({ variant: 'primary' })}>
              <Download aria-hidden="true" className="h-4 w-4" />Export ZIP ({kept})
            </button>
            {/*
             * display:flex removes the native summary marker; items stay mounted because details
             * only hides their display.
             */}
            <details className="relative">
              <summary
                title="Dataset actions"
                className={`${btnShape()} w-full border border-border bg-surface text-content-muted hover:text-content hover:bg-surface-raised cursor-pointer select-none sm:w-auto`}>
                ⋯ More
              </summary>
              <div data-probe-chrome="more-menu" data-probe-panel="more-menu"
                className="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg border border-border bg-surface-overlay shadow-xl p-1.5 flex flex-col gap-0.5">
                <button type="button" onClick={() => setSettingsOpen(true)}
                  title={isStyle ? 'Edit the Style dataset name and review its always-on behavior.' : 'Edit the dataset name, trigger word, and (for concept datasets) the concept description that drives the caption avoid-list.'}
                  className={MENU_ITEM}>
                  <Settings aria-hidden="true" className="h-4 w-4" /> Edit settings
                </button>
                {!isConceptual && (
                  <button type="button" disabled={ds.busy}
                    onClick={() => ds.setDatasetFidelity?.(bodyFid ? 'face' : 'body')}
                    title={bodyFid
                      ? 'Body fidelity ON: captions also omit tattoos/scars/marks (they bind to the trigger), composition targets more bust/body shots, imports keep the full frame by default. Click to go back to face-only.'
                      : 'Face-only fidelity (default): the LoRA learns the face; body shape follows the prompt. Click for FULL-BODY fidelity (body shape & marks bind to the trigger too).'}
                    className={`${MENU_ITEM} ${bodyFid ? 'text-emerald-300' : ''}`}>
                    <PersonStanding aria-hidden="true" className="h-4 w-4" /> Body fidelity
                    <span className={`ml-auto text-2xs ${bodyFid ? 'text-emerald-300 font-semibold' : 'text-content-subtle'}`}>
                      {bodyFid ? '✓ on' : 'off'}
                    </span>
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Where the images actually are. Shown here, at the top, because the
          question "where is this on disk?" is asked before anything else — and
          because the answer used to be findable only by hand, which is how a
          dataset folder ended up pasted into a bank. */}
      <DatasetFolderNote path={d.storage_path} />

      {/* Two-column workspace: the persistent section sidebar on the left (with the
          guided Progress checklist below it for character datasets), the ACTIVE
          section's content on the right. On mobile the sidebar folds into a
          horizontal chip rail — same responsive pattern as the Settings page. */}
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-4 lg:items-start">
        <aside>
          {/* Mobile: horizontal chip rail.

              `relative` is NOT decoration — without it the whole page renders
              at ~73% on a phone. `overflow-x-auto` clips a descendant only when
              the scroller is also its containing block, and a static box never
              is. The NavBadge counts carry an `.sr-only` label, which Tailwind
              implements as `position: absolute` with no offsets: it therefore
              resolves against the document, keeps its static position out at
              the far end of a rail 1123 px wide, and escapes the clip. The
              document then measures ~598 px against a 440 px viewport, mobile
              Safari shrinks the page to fit, and every bar on screen — header
              included — draws at 73% of the screen with dead space beside it.
              Nothing overflows visibly, because the escapee is a 1 px box no
              one can see. */}
          <nav ref={mobileRailRef} aria-label="Dataset sections" data-probe-chrome="sections"
            className="relative min-w-0 max-w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
            <ul className="m-0 flex w-max list-none flex-nowrap gap-2 p-0">
              {visibleSections.map((s) => <li key={s.id} className="shrink-0">{navItem(s, true)}</li>)}
              {activePanels.length > 0 && (
                <li className="shrink-0">
                  <ul id={`dataset-mobile-panels-${section}`} aria-label={`${sectionMeta[section].title} destinations`}
                    className="m-0 flex list-none flex-nowrap gap-2 p-0">
                    {activePanels.map((destination) => (
                      <li key={destination.id} className="shrink-0">{panelNavItem(section, destination, true)}</li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          </nav>
          <details className="lg:hidden">
            <summary className="min-h-11 cursor-pointer py-3 text-sm text-content-muted">Dataset Progress</summary>
            <GuidedChecklist steps={steps} currentId={nextStep ? nextStep.id : null} onJump={jumpTo} />
          </details>
          {/* Desktop: sticky rail + guided progress below it */}
          <div data-probe-panel="sections-rail" className="hidden lg:sticky lg:top-20 lg:flex lg:flex-col lg:gap-2">
            <nav aria-label="Dataset sections">
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {visibleSections.map((s) => {
                  const isActive = s.id === section;
                  const destinations = isActive ? getWorkspacePanels(s.id, navContext) : [];
                  return (
                    <li key={s.id}>
                      {navItem(s, false)}
                      {isActive && (
                        <ul id={`dataset-nav-panels-${s.id}`}
                          className="m-0 ml-4 flex list-none flex-col gap-0.5 border-l border-border py-1 pl-1 p-0">
                          {destinations.map((destination) => (
                            <li key={destination.id}>{panelNavItem(s.id, destination, false)}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
            <GuidedChecklist steps={steps} currentId={nextStep ? nextStep.id : null} onJump={jumpTo} />
          </div>
        </aside>

        <div className="flex flex-col gap-2 min-w-0 mt-1 lg:mt-0 lg:gap-3">
          {/*
           * GLOBAL banners remain visible in every section: a GPU pass or generation batch
           * concerns the whole screen.
           */}
          <NextStepCard step={nextStep} busy={ds.busy}
            totalImages={images.length} onAction={nextAction} actionLabel={nextActionLabel} />

          <ImportQueuePanel queue={ds.importQueue} />
          {ds.busy && !ds.importQueue?.running && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2">
              <span className="inline-block w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" aria-hidden />
              <span className="text-content text-sm">{activityBanner}</span>
              {(act?.kind === 'caption' || act?.kind === 'recaption') && (
                <button type="button" onClick={ds.cancelCaption} disabled={!!act?.cancelling}
                  title="Stops after this image. Saved captions stay."
                  className="ml-auto shrink-0 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                  {act?.cancelling ? 'Stopping' : '⏹ Stop'}
                </button>
              )}
              {/* Same seam, same promise, for the watermark scan: it was the one
                  long dataset pass with no way out but closing the tab. */}
              {act?.kind === 'watermark_detect' && (
                <button id="ds-watermark-scan-stop" type="button"
                  onClick={ds.cancelWatermarkScan} disabled={!!act?.cancelling}
                  title="Stops after this image. Saved marks stay."
                  className="ml-auto shrink-0 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                  {act?.cancelling ? 'Stopping' : '⏹ Stop'}
                </button>
              )}
              {/* …and for the 🔤 text scan, which reads whole banks of pages. */}
              {act?.kind === 'text_detect' && (
                <button id="ds-text-scan-stop" type="button"
                  onClick={ds.cancelTextScan} disabled={!!act?.cancelling}
                  title="Stops after this image. Saved zones stay."
                  className="ml-auto shrink-0 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                  {act?.cancelling ? 'Stopping' : '⏹ Stop'}
                </button>
              )}
            </div>
          )}

          {/* Stop is also the batch's Stop: a server-side ✨ improve run keeps feeding
              the queue, so the banner must stay reachable even between two waves
              (a moment when nothing is in flight). */}
          {(pending > 0 || act?.kind === 'improve') && (
            <div className="flex items-center gap-3 rounded-lg border-2 border-indigo-400/60 bg-indigo-500/15 px-3 py-2.5">
              <span className="animate-pulse text-xl" aria-hidden>⏳</span>
              <div className="flex flex-col">
                <span className="text-content text-sm font-semibold">
                  {act?.kind === 'improve' && act.total
                    ? `${act.done}/${act.total} queued · ${pending} generating`
                    : `${pending} generation(s) in progress`}
                </span>
              </div>
              <button type="button" onClick={stopGeneration}
                disabled={isStopGenerationBlocked({
                  busy: ds.busy, activity: act, cancelling: stoppingGeneration })}
                title="Cancels every generation still in flight (and stops a running improvement batch); finished images stay."
                className="ml-auto shrink-0 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold disabled:opacity-40">
                {stoppingGeneration || (act?.cancelling && act?.kind === 'improve')
                  ? 'Stopping' : '⏹ Stop generation'}
              </button>
            </div>
          )}

          {/* ============ Images — la grille : triage ✓/✕, filtres, tri auto. */}
          <div className={sectionCls('images')}>
            {heading('images')}
            <p className="m-0 text-content-subtle text-xs tabular-nums">
              {rescueGridImages.length} image(s) · {kept} kept
              {triage > 0 ? <> · <span className="text-amber-300">{triage} awaiting ✓/✕</span></> : ''}
              {rescueReviewCount > 0
                ? <> · <span className="text-indigo-300">{rescueReviewCount} Klein rescue pair(s) in Curation</span></>
                : ''}
              {kept > 0 ? ` · ${keptCaptioned}/${kept} captioned` : ''}
              {watermarkDetected > 0 ? ` · ${watermarkDetected} watermark(s) flagged` : ''}
            </p>
            <div id="gf-images" className="scroll-mt-20 flex flex-col gap-2">
              <div className="grid min-w-0 grid-cols-1 items-start gap-2 lg:grid-cols-2">
                <IdentityFilter source="dataset" scopeId={d.id} value={identityFilter}
                  onChange={setIdentityFilter} version={identityVersion + ':' + identityRevision} />
                <IdentityUndo key={d.instance_id} source="dataset" scopeId={d.id} version={identityVersion + ':' + identityRevision} busy={ds.busy}
                  onChanged={() => setIdentityVersion((value) => value + 1)} />
              </div>
              {identityError && <div role="alert" className="text-sm text-danger">
                <p>{identityError}</p>
                <button type="button" className="min-h-10 rounded-md border border-border px-3 py-2 text-sm"
                  onClick={() => setIdentityVersion((value) => value + 1)}>Retry Filter</button>
              </div>}
              {rescueGridImages.length > 0 && (
                <div data-probe-chrome="grid-toolbar" className="grid min-w-0 gap-2">
                  <GridStatusFilter value={statusFilter} counts={statusCounts}
                    onChange={setStatusFilter}>
                    <GridSortSelect value={gridSort} images={rescueGridImages}
                      onChange={setGridSort} />
                  </GridStatusFilter>
                  <div className="flex gap-2 empty:hidden">
                    <HelpBadge topic="action-grid-status-filter" />
                    <HelpBadge topic="action-grid-sort" />
                  </div>
                </div>
              )}
              {filtersActive && (
                <GridFilterBar excludes={excludeTags} includes={includeTags}
                  statusLabel={statusFilterActive ? statusFilterLabel : ''}
                  coverageLabel={coverageFilter ? coverageFilter.label : ''}
                  shown={gridImages.length} total={rescueGridImages.length}
                  onRemoveExclude={toggleExclude} onRemoveInclude={toggleInclude}
                  onRemoveStatus={() => setStatusFilter(DEFAULT_GRID_STATUS_FILTER)}
                  onRemoveCoverage={() => setCoverageFilter(null)}
                  onClearAll={clearFilters} />
              )}
              {filtersActive && gridImages.length === 0 ? (
                // Filtered down to nothing: say so plainly (the grid's own "no images"
                // empty-state would read as "everything's gone", which would be a lie).
                <p className="rounded-lg border border-border bg-surface px-3 py-4 text-center text-content-subtle text-sm">
                  No matches.{' '}
                  <button type="button" onClick={clearFilters} className="underline hover:text-content">Clear filters</button>
                </p>
              ) : (
                <DatasetGrid images={gridImages} datasetId={d.id} datasetInstanceId={d.instance_id} onStatus={ds.setStatus} onCaption={ds.setCaption}
                  onCrop={setCropImg} onDelete={ds.deleteImage}
                  onMirror={ds.mirrorImage} mirroringIds={ds.mirroringIds}
                  onScoreFace={ds.scoreFace} scoringFaceIds={ds.scoringFaceIds}
                  onRegenerate={(id, loraStrength, prompt, opts) => ds.regenerate(id, loraStrength, prompt, opts)}
                  onReimprove={ds.reimproveImage} onView={setViewImg}
                  /* ⟨ / ⟩ cross page boundaries, so the page underneath follows:
                     closing the lightbox must not leave you on a page that no
                     longer holds the image you were looking at. */
                  viewingImageId={viewImg?.id ?? null}
                  onBatch={ds.batchImages} onAddTag={ds.addTagToImages} busy={ds.busy}
                  improveBusy={ds.improveBusy} generateBusy={ds.generationBusy} curationBusy={ds.curationBusy}
                  onBulkBusyChange={setGridBulkBusy}
                  onSelectionChange={onGridSelectionChange}
                  onIdentityChanged={() => setIdentityVersion((value) => value + 1)}
                  onImproveBatch={ds.improveBatch} activity={act}
                          subjectType={d.subject_type || 'human'}
                  eligibilityImages={images}
                  nonces={ds.nonces} faceThresholds={d.face_thresholds} datasetKind={d.kind || 'character'}
                  faceScoringBlocked={d.face_scoring_blocked}
                  dualCaptions={Boolean(d.dual_captions)} />
              )}
            </div>
          </div>

          {/*
           * Add images: all kinds share the import path. Character generation
           * stays available in its own disclosure below the existing-image sources.
           */}
          <div className={sectionCls('add')}>
            {heading('add')}
            <div id="ds-add-import" tabIndex={-1} className="scroll-mt-20">
              <ImportDropzone key={d.id} onImport={(f, o) => ds.importFiles(f, o)}
                busy={importBusy} visionBusy={visionImportBusy} cropOption={!isConceptual} />
              <Button size="md" className="mt-2 min-h-10 w-full sm:w-auto" onClick={() => setQuickSet(true)}>
                Quick Set
              </Button>
            </div>
            {quickSet && (
              <QuickSetDialog onClose={() => setQuickSet(false)} onOpen={ds.open}
                suggestedTrigger={d.trigger_word || ''} />
            )}
            {bankImport}
            {scrapeLink}
            {!isConceptual && (
              <details className="rounded-lg border border-border p-3" open={!!d.ref_filename}>
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-content">Generate Images</summary>
                <div id="gf-reference" className="scroll-mt-20">
                  <div id="ds-add-reference" tabIndex={-1} className="scroll-mt-20 flex flex-col gap-1">
                    <ReferencePanel refFilename={d.ref_filename} datasetId={d.id} onSetRef={ds.setRef}
                      onCropRef={() => setRefCrop(true)} onEditRef={() => setRefEdit(true)} busy={ds.busy} importBusy={importBusy} visionBusy={visionImportBusy} nonce={ds.refNonce}
                      extraRefs={d.ref_extra_filenames || []}
                      onAddExtraRef={ds.addExtraRef} onRemoveExtraRef={ds.removeExtraRef}
                      onCropExtraRef={(fn) => setExtraRefCrop(fn)}
                      subjectType={d.subject_type || 'human'}
                      referenceEdit={d.reference_edit} />
                  </div>
                </div>

                <div id="gf-generate" className="scroll-mt-20 flex flex-col gap-2">
                  <CompositionBar composition={d.composition} upscaled={d.composition_upscaled} bodyFidelity={bodyFid} />
                  {/* The bar above counts shot types against a target and can go
                      fully green on a set that is the same pose, one outfit, one
                      light — none of which it counts. This is that second
                      question, read from the captions already written. */}
                  {/* A chip is a place to go, not only a number: clicking one
                      narrows the grid to exactly the images it counted and jumps
                      to it — the panel lives in Add images, the grid in Images,
                      and a filter applied to a screen you cannot see would look
                      like nothing happened. */}
                  <CoveragePanel datasetId={d.id} refreshKey={images.length}
                    onPick={(pick) => { setCoverageFilter(pick); setSection('images'); }} />
                  {/* Images imported WITHOUT head-crop have no shot type, so they count
                      for nothing in the bar above (the default on body-fidelity datasets:
                      a whole drag-and-drop import can leave it at 0). A crop clears the
                      stored shot type for the same reason — those pixels changed. The
                      vision pass that fills them in lives right here, under the bar
                      that shows the gap. */}
                  <ClassifyFramingButton key={d.id} images={images}
                    selectedIds={gridSelection.datasetId === d.id ? gridSelection.ids : []}
                    ollama={activeLocalLlm(caps)} capsLoading={capsLoading}
                    busy={ds.busy || gridBulkBusy} activity={act} onClassify={(n, options) => ds.classify(n, options)}
                    onStop={ds.stopClassify} />
                  <div id="ds-add-generate" tabIndex={-1} className="scroll-mt-20">
                    <Suspense fallback={null}>
                    <VariationCatalog key={`vc-${d.id}-${bodyFid}`} datasetId={d.id} busy={ds.generationBusy}
                      generating={act && act.kind === 'generate' ? act : null}
                      onGenerate={(...args) => {
                        // Guard-rail: a batch is already in flight — launching another one
                        // on top is usually an accidental double-click, not a plan.
                        if (pendingGenerations > 0 && !window.confirm(
                          `A generation batch is already running (${pendingGenerations} in flight).\n\nLaunch another one anyway?`)) return;
                        ds.generate(...args);
                      }}
                      hasRef={!!d.ref_filename} composition={d.composition} images={images}
                      bodyFidelity={bodyFid}
                      promptSuffix={d.prompt_suffix || ''}
                      promptSuffixes={d.prompt_suffixes || null}
                      onSaveSuffixes={(patch) => ds.updateSettings(patch, { quiet: true })}
                      subjectType={d.subject_type || 'human'}
                      onSaveSubjectType={(st) => ds.updateSettings({ subject_type: st }, { quiet: true })} />
                    </Suspense>
                  </div>
                </div>
              </details>
            )}
          </div>

          {/* ============ 🕸 Scrape — its own destination, filled by whatever plugin
               contributes a `sources.panel` for datasets (the bundled scrape plugin:
               scan a gallery URL → pick thumbnails → import full-frame, then crop each
               tile manually, ✂ on the card). Not rendered at all without one. */}
          {hasScrape && (
            <div className={sectionCls('scrape')}>
              {heading('scrape')}
              <div id="ds-scrape-scan" tabIndex={-1} className="scroll-mt-20">
                <PluginSlot slot="sources.panel" surface="dataset" key={`scraper-${d.id}`}
                  datasetId={d.id} onImport={ds.scrapeImport} busy={importBusy} />
              </div>
            </div>
          )}

          {/*
           * Curation: quality passes on kept images, including face likeness, watermark
           * find/clean/review, and purge.
           */}
          <div className={sectionCls('curation')}>
            {heading('curation')}
            <div id="gf-curation" className="scroll-mt-20 flex flex-col gap-2">
              <SmallImageRescueReview images={images} datasetId={d.id}
                onResolve={ds.resolveSmallImageRescue}
                onPreview={(image) => setViewImg({ ...image, _rescueReviewPreview: true })}
                nonces={ds.nonces} />
              <div className="lds-section flex items-center gap-2 flex-wrap py-2">
                {!isConceptual && (
                  <button id="ds-curation-face-analysis" type="button" data-workspace-focus
                    onClick={ds.analyzeFaces} disabled={faceAnalysis.disabled}
                    title={faceAnalysis.title}
                    className={`${btnClass()} w-full scroll-mt-20 sm:w-auto`}>
                    <Drama aria-hidden="true" className="h-4 w-4" />
                    {ds.analyzing
                      ? `Analyzing${act?.kind === 'analyze_faces' && act.total ? ` ${act.done}/${act.total}` : ''}`
                      : faceAnalysisLabel(d.face_scoring_scope)}
                  </button>
                )}
                {/* A greyed button whose reason lives in a tooltip is invisible on a
                    phone (no hover) — the pass must SAY why it can't run, in place.
                    When the reason is a missing install, the sentence is also the
                    way OUT: a link to the Setup step that installs it. */}
                {!isConceptual && faceAnalysis.blocked && (
                  <p className="m-0 basis-full text-sky-300/90 text-2xs">
                    ℹ {faceAnalysis.reason}
                    {faceAnalysis.setupRoute && (
                      <>{' '}<a href={faceAnalysis.setupRoute} className="underline">Open Setup</a></>
                    )}
                  </p>
                )}
                <div id="ds-curation-watermarks" tabIndex={-1}
                  className="grid w-full min-w-0 grid-cols-2 items-start gap-2 scroll-mt-20 sm:grid-cols-3">
                {/* Watermark auto-correction (V1): find overlaid site logos/URLs/usernames on
                    the kept images, then Clean them (border → crop, small off-center → LaMa
                    inpaint, on-subject → manual review). Applies to any dataset kind. */}
                <div className="col-span-full grid w-full grid-cols-2 gap-2">
                <button type="button" data-workspace-focus onClick={() => setWmScanOpen(true)}
                  disabled={ds.busy}
                  title="Find and mark watermarks."
                  className={btnClass()}>
                  <Eraser aria-hidden="true" className="h-4 w-4" />
                  {ds.watermarking
                    ? `Scanning${act?.kind === 'watermark_detect' && act.total ? ` ${act.done}/${act.total}` : ''}`
                    : 'Find Watermarks'}
                </button>
                {kleinCompareOpen && (
                  <KleinCompareDialog
                    choices={kleinCompareState.choices}
                    stored={kleinCompareState.stored}
                    compareUrl={`/api/dataset/${d.id}/watermarks/klein-compare`}
                    adoptLabel="Use for this dataset"
                    onAdopt={async (model) => {
                      // The dataset's ONE authority for the Klein model — the
                      // batch clean already honours it, so adopting IS arming.
                      await postJson(`/api/dataset/${d.id}/klein-model`, { klein_model: model }).catch(() => null);
                      setKleinCompareOpen(false);
                      setKleinCompareState((st) => ({ ...st, stored: model }));
                    }}
                    onClose={() => setKleinCompareOpen(false)}
                  />
                )}
                {wmScanOpen && (
                  <WatermarkScanDialog
                    onClose={() => setWmScanOpen(false)}
                    onLaunch={(opts) => ds.findWatermarks(opts)}
                    kept={images.filter((i) => i.status === 'keep' && i.filename).length}
                    dismissed={images.filter(
                      (i) => i.status === 'keep' && i.watermark_state === 'dismissed').length}
                    threshold={caps.watermark_detect_threshold}
                    caps={caps}
                    live={ds.busy}
                    datasetId={d.id} />
                )}
                {/* 🔤 The other detection feeding the same funnel: burned-in text
                    (speech bubbles, subtitles, captions, sound effects) read by
                    the RapidOCR engine the video lane ships — CPU only. Zones
                    land in the same mask channel, so the same Clean repaints
                    them. Greyed with the install route when the extra is out. */}
                <button type="button" data-workspace-focus onClick={() => setTextScanOpen(true)}
                  disabled={ds.busy || !caps.video_text}
                  title={caps.video_text
                    ? 'Find and mark text.'
                    : 'Reads burned-in text on the kept images. Install "Burned-in text" from Setup first.'}
                  className={btnClass()}>
                  🔤 {ds.textScanning
                    ? `Reading${act?.kind === 'text_detect' && act.total ? ` ${act.done}/${act.total}` : ''}`
                    : 'Find Text'}
                </button>
                </div>
                {textScanOpen && (
                  <TextScanDialog
                    onClose={() => setTextScanOpen(false)}
                    onLaunch={(opts) => ds.findText(opts)}
                    toRead={textToRead}
                    rereadable={keptForText.length}
                    sensitivity={caps.text_scan_score_min}
                    live={ds.busy}
                    /* The window polls this dataset's /text/preview itself —
                       reading the payload here only refreshed when the run
                       returned, leaving the strip empty for the whole scan. */
                    datasetId={d.id} />
                )}
                <div className="col-span-full empty:hidden"><HelpBadge topic="action-watermark-clean" /></div>
                {watermarkDetected > 0 && (
                  <>
                  {/* Clean engine: LaMa (fast, non-generative, repaints the marked
                      zones only) vs Klein (Flux.2 re-renders the WHOLE photo with the
                      instruction to remove the marks — reaches what a box cannot, at
                      the price of a regenerated image and with no guarantee on a
                      distinct logo; GPU + slower). The sentence is shared
                      with the bank panel and the review lightbox (utils/
                      watermarkCleanEngine) because all three offer the same engine.
                      Klein is greyed until ComfyUI + the Klein models are ready
                      (caps.watermark_klein). */}
                  <div role="group" aria-label="Watermark inpaint method"
                    className={SEGMENT_GROUP_CLASS}>
                    <button type="button" aria-pressed={watermarkMethod === 'lama'}
                      onClick={() => setWatermarkMethod('lama')} disabled={ds.busy}
                      title="Repaint small marks with LaMa."
                      className={SEGMENT_CLASS}>
                      LaMa
                    </button>
                    <button type="button" aria-pressed={watermarkMethod === 'klein'}
                      onClick={() => setWatermarkMethod('klein')} disabled={ds.busy || !caps.watermark_klein}
                      title={caps.watermark_klein
                        ? kleinCleanTitle(caps)
                        : (localEngineUnavailableReason('klein', caps)
                          || 'Klein inpaint needs ComfyUI running + the Klein models installed (Setup ▸ ComfyUI).')}
                      className={SEGMENT_CLASS}>
                      Klein
                    </button>
                  </div>
                  {/* 🔤/🚩 WHAT to clean — only offered once Find text flagged
                      something (no text page = the three choices collapse into
                      one, a dead dial). Same three choices, same words as the
                      bank panel. */}
                  {textFlaggedDetected > 0 && (
                    <div role="group" aria-label="What to clean"
                      className={`${SEGMENT_GROUP_CLASS} col-span-full`}>
                      <button type="button" aria-pressed={watermarkTarget === 'all'}
                        onClick={() => setWatermarkTarget('all')} disabled={ds.busy}
                        title="Clean text and watermarks."
                        className={SEGMENT_CLASS}>
                        Both
                      </button>
                      <button type="button" aria-pressed={watermarkTarget === 'text'}
                        onClick={() => setWatermarkTarget('text')} disabled={ds.busy}
                        title="Clean pages flagged for text."
                        className={SEGMENT_CLASS}>
                        🔤 Text
                      </button>
                      <button type="button" aria-pressed={watermarkTarget === 'watermark'}
                        onClick={() => setWatermarkTarget('watermark')} disabled={ds.busy}
                        title="Only pages 🚩 flagged with no text flag on them."
                        className={SEGMENT_CLASS}>
                        🚩 Marks
                      </button>
                    </div>
                  )}
                  {/* A clean OVERWRITES the image, so the model that repaints it is
                      the one lane whose swap can never be spotted afterwards. It is
                      the dataset's model, like improve and generation — named here,
                      changeable here. basis-full: its own row rather than a squeezed
                      column at 400 px. */}
                  {watermarkMethod === 'klein' && !caps.watermark_clean_custom && (
                    <div className="col-span-full grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <KleinModelSetting datasetId={d.id} className="min-w-0 flex-1" />
                      {/* ⚖ The judging half: try the candidates on ONE flagged image
                          (same zones, same seed) before the batch overwrites all of
                          them — the same intermediate-window shape as detection. */}
                      {cleanTargetCount > 0 && (
                        <button type="button"
                          onClick={async () => {
                            // Same endpoint as the picker beside it — one scanner,
                            // one truth about what is on disk.
                            const resp = await apiFetch(`/api/dataset/${d.id}/klein-model`).catch(() => null);
                            setKleinCompareState({
                              choices: resp?.choices || [], stored: resp?.stored ? resp.resolved : null,
                            });
                            setKleinCompareOpen(true);
                          }}
                          disabled={ds.busy}
                          title="Compare models on one flagged image."
                          className={btnClass()}>
                          ⚖ Compare Models
                        </button>
                      )}
                    </div>
                  )}
                  {/* WHAT the clean will actually do, and the three dials that change
                      it: the prompt Klein is sent, the size the photo travels at, and
                      whether the file keeps its dimensions. Stored, so the bank panel
                      reads the same values — the shared feature rule (CLAUDE.md)
                      applied to the dials, not just to the pass. `refreshCaps` re-reads
                      the resolved values so the engine tooltip above quotes the prompt
                      that was just typed. */}
                  {watermarkMethod === 'klein' && (
                    <KleinCleanOptions caps={caps} disabled={ds.busy} className="col-span-full"
                      onChanged={() => refreshCaps(true, { background: true })} />
                  )}
                  {/* Allow auto-crop: the SAME persisted preference as Settings ▸ Watermark
                      inpainting (write-through). Off → a border mark is repainted (LaMa/
                      Klein) instead of cropped; the per-image review can still override it. */}
                  <button type="button" role="switch" aria-checked={allowAutoCrop}
                    onClick={() => setWatermarkAllowCrop(!allowAutoCrop)}
                    disabled={ds.busy || savingAllowCrop}
                      title={allowAutoCrop ? 'Crop border marks.' : 'Repaint border marks.'}
                    className={`${btnShape()} border font-semibold ${allowAutoCrop
                      ? 'border-border bg-surface text-content-subtle hover:text-content'
                      : 'border-amber-400/50 bg-amber-500/10 text-amber-200'}`}>
                    <Scissors aria-hidden="true" className="h-3.5 w-3.5" />{allowAutoCrop ? "Auto-crop on" : "Auto-crop off"}
                  </button>
                  <button type="button"
                    onClick={() => { requestHelpTip('watermark-batch-clean'); ds.cleanWatermarks(watermarkMethod, watermarkTarget); }}
                    disabled={ds.busy || savingAllowCrop || cleanTargetCount === 0}
                    title={watermarkMethod === 'klein' ? 'Re-render flagged images.' : 'Clean flagged marks.'}
                    className={`${btnShape()} bg-amber-500/15 border border-amber-400/40 text-amber-200 font-semibold`}>
                    <Eraser aria-hidden="true" className="h-4 w-4" />Clean ({cleanTargetCount})
                  </button>
                  </>
                )}
                {/* Per-image control: step through the flagged images full-screen, see each
                    detected box, and Clean / dismiss (false positive) / reject one by one.
                    The auto-detect has false positives, so this hands the final call to the
                    user (crucial after the "64/75 flagged" real-dataset run). */}
                {watermarkDetected > 0 && (
                  <button id="ds-curation-review-flagged" type="button" data-workspace-focus
                    disabled={ds.busy}
                    onClick={() => setReviewQueue(images.filter((i) => i.watermark_state === 'detected'))}
                    title="Review flagged images."
                    className={`${btnClass()} scroll-mt-20`}>
                    <Search aria-hidden="true" className="h-4 w-4" />Review ({watermarkDetected})
                  </button>
                )}
                {/* The shortcut past that review, because it was asked for — and
                    it says what it costs. The count is `flagged.rejectable`, NOT
                    watermarkDetected: a small-image rescue row in the batch makes
                    the SERVER refuse the whole request (400, zero rejected) and a
                    'failed' row is skipped, so promising the bigger number would
                    be the bank's "5 930 → 0" defect all over again. Red-tinted
                    like 🧹 Purge, never the primary colour: this is the shortcut,
                    the per-image review is still the recommended path. */}
                {flagged.rejectable > 0 && (
                  <button id="ds-curation-reject-flagged" type="button" data-workspace-focus
                    disabled={ds.busy}
                    onClick={async () => {
                      if (!window.confirm(rejectFlaggedConfirmText(flagged))) return;
                      const affected = await ds.batchImages(flagged.rejectableIds, 'reject');
                      // The server's number, not ours — it is the one that counts
                      // rows it actually wrote (see batch_image_action).
                      setRejectFlaggedNote(affected
                        ? `${affected} rejected. To undo, select Rejected, then Keep.`
                        : '');
                    }}
                    title="Reject flagged images. Files stay on disk."
                    className={`${btnShape()} bg-red-500/10 border border-red-500/30 text-red-300 scroll-mt-20`}>
                    <X aria-hidden="true" className="h-4 w-4" />Reject ({flagged.rejectable})
                  </button>
                )}
                {/* Two numbers that differ must never be shown as one. */}
                {flagged.rejectable > 0 && flagged.heldBack > 0 && (
                  <p className="m-0 col-span-full text-content-subtle text-xs">
                    {flagged.rejectable} of {flagged.flagged} flagged images can be rejected.
                  </p>
                )}
                {rejectFlaggedNote && (
                  <p className="m-0 col-span-full text-emerald-300/90 text-xs">
                    {rejectFlaggedNote}
                  </p>
                )}
                {/* Who judged, and how many carry no position. Silent on the
                    ordinary run (one source, every flag located). */}
                {flaggedNote && (
                  <p className="m-0 col-span-full text-content-subtle text-xs">
                    ℹ {flaggedNote}
                  </p>
                )}
                {/* The ONLY way to re-judge images ruled false positives. Without
                    it, changing the detector leaves a residue of verdicts from the
                    old one that nothing can ever touch again — a setting that
                    visibly changes nothing. Shown only when there IS a residue, so
                    the row does not grow on the ordinary dataset. */}
                {flagged.dismissed > 0 && (
                  <button type="button" disabled={ds.busy}
                    onClick={() => ds.findWatermarks({ includeDismissed: true })}
                    title="Scan again, including dismissed marks."
                    className={`${btnShape()} bg-surface border border-dashed border-border text-content-subtle hover:text-content`}>
                    ⟲ Rescan ({flagged.dismissed})
                  </button>
                )}
                {/* Watermark inpainting (LaMa) needs one extra ML package (simple-lama-
                    inpainting). Show a scoped installer RIGHT HERE — where the lack is
                    met — instead of sending the user back to Setup's whole ML-extras
                    step. Toggles a panel below (InstallRunner does the polling +
                    progress + manual-command fallback); on success caps re-fetch and
                    this affordance disappears. */}
                {!caps.watermark_inpaint && (
                  <button type="button" onClick={() => setInstallInpaintOpen((v) => !v)}
                    aria-expanded={installInpaintOpen}
                    title="Install LaMa for inpainting."
                    className={`${btnShape()} border border-dashed border-amber-400/50 bg-amber-500/5 text-amber-200/90 hover:bg-amber-500/10`}>
                    <Download aria-hidden="true" className="h-4 w-4" /> Install LaMa
                    <span aria-hidden className="text-content-subtle text-xs">{installInpaintOpen ? '▴' : '▾'}</span>
                  </button>
                )}
                </div>
              </div>

              {/* Scoped watermark-inpainting installer. Reuses the Setup InstallRunner
                  (same polling / live progress / manual-command fallback). onDone
                  force-refreshes capabilities → watermark_inpaint flips true without a
                  restart or the 600 s probe TTL (the backend drops the import cache on
                  success), and the affordance above unmounts on its own. */}
              {installInpaintOpen && !caps.watermark_inpaint && (
                <div className="rounded-lg border border-amber-400/40 bg-amber-500/5 p-3 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <Eraser aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-300" />
                    <div className="flex flex-col">
                      <span className="text-amber-200 text-sm font-semibold">Install watermark inpainting (LaMa)</span>
                    </div>
                    <button type="button" onClick={() => setInstallInpaintOpen(false)}
                      className="ml-auto shrink-0 text-content-subtle hover:text-content text-sm"
                      aria-label="Close the inpainting installer"><X aria-hidden="true" className="h-4 w-4" /></button>
                  </div>
                  <InstallRunner action="watermark_inpaint" buttonLabel="Download & install"
                    onDone={() => refreshCaps(true)} />
                </div>
              )}

              {/*
               * Permanently remove rejected/failed images. Formerly in More, this curation action
               * belongs with the other curation tools.
               */}
              {unused > 0 && (
                <div id="ds-curation-rejected-cleanup" tabIndex={-1}
                  className="lds-section flex items-center gap-2 flex-wrap py-2 scroll-mt-20">
                  <button type="button" data-workspace-focus disabled={ds.busy}
                    onClick={() => {
                      if (window.confirm(`Permanently delete the ${unused} rejected/failed image(s) (files included)?`)) ds.purgeUnused();
                    }}
                    title="Permanently delete rejected and failed images"
                    className={`${btnShape()} w-full border border-red-500/30 bg-red-500/10 text-red-300 sm:w-auto`}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />Purge Unused ({unused})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ============ ✍ Captions — générer/regénérer les captions, surveiller
               les fuites (identité/concept), outils de masse (find/replace, tags). */}
          <div className={sectionCls('captions')}>
            {heading('captions')}
            <div id="gf-captions" className="scroll-mt-20 flex flex-col gap-2">
              {/* WHO wrote the captions of the pass that just ran. The default engine
                  setting is "Auto", which silently chains JoyCaption and the Ollama
                  vision model — two different writing styles — and the result used to
                  be reported as a bare count. Shown HERE, under the buttons that
                  produced it, not only in Settings. Wraps freely: it must stay
                  readable at 400px. In-session only; it disappears on reload. */}
              {lastCaptionEngines && (
                <p className="break-words rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-content-muted">
                  <PenLine aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Last pass: {ds.lastCaptionRun.captioned} captions · {lastCaptionEngines}
                </p>
              )}
              <div id="ds-captions-generate" tabIndex={-1}
                className="lds-section flex flex-col gap-2 py-2 scroll-mt-20">
                <div className={`grid grid-cols-2 gap-2 ${isConceptual ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
                {!isConceptual && (
                  <select value={effCaptionMode} onChange={(e) => setCaptionMode(e.target.value)} disabled={ds.busy}
                    aria-label="Caption style"
                    className={`${fieldClass()} min-w-0`}>
                    <option value="prose">Prose</option>
                    <option value="booru">Booru tags</option>
                  </select>
                )}
                <button type="button" data-workspace-focus
                  onClick={() => ds.caption(effCaptionMode)} disabled={ds.busy}
                  className={btnClass({ variant: 'primary' })}>
                  <Sparkles aria-hidden="true" className="h-4 w-4" />
                  {ds.captioning ? `${keptCaptioned}/${kept} captioned` : 'Caption kept'}
                </button>
                <button type="button" disabled={ds.busy || !recaptionable}
                  onClick={() => {
                    if (window.confirm(recaptionConfirmation(d.kind || 'character', recaptionable, keptAsserted))) ds.recaption(effCaptionMode);
                  }}
                  title={keptCaptioned && !recaptionable
                    ? 'Edit or clear handwritten captions in Images.'
                    : isConcept
                    ? 'Omit the concept.'
                    : isStyle
                      ? 'Omit the style.'
                      : 'Omit identity traits.'}
                  className={btnClass()}>
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />Re-caption
                </button>
                <button type="button" data-workspace-focus
                  onClick={() => setCaptionOptionsOpen(true)} disabled={ds.busy}
                  className={`${btnClass()} ${isConceptual ? 'col-span-2 sm:col-span-1' : ''}`}>
                  <Settings aria-hidden="true" className="h-4 w-4" />Options
                </button>
                </div>
                <div className="flex gap-2 empty:hidden">
                  <HelpBadge topic="action-caption-generate" />
                  <HelpBadge topic="action-caption-options" />
                </div>
                {/* Caption-leak badge — KIND-aware. character: identity words
                    (hair/face/skin); concept: the caption NAMING the concept (must bind to
                    the trigger, not the words); style: not applicable (the subjects'
                    description IS the content). BOTH count states are clickable → the same
                    explainer panel; the count is spelled out ("N checked") so a green 0
                    reads as a REAL result, not a scan that never ran. */}
                {isStyle ? (
                  <span className={`text-xs ${keptUncaptioned ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {keptUncaptioned
                      ? `${keptUncaptioned} captions missing`
                      : `${keptCaptioned}/${kept} content-only captions · no trigger`}
                  </span>
                ) : d.caption_leak && (
                  d.caption_leak.captioned > 0 ? (
                    <button id="ds-captions-leak-review" type="button" data-workspace-focus
                      onClick={toggleLeakReview}
                      aria-expanded={showLeaks}
                      title="Review leaks"
                      className={`${controlHeight()} inline-flex items-center self-start whitespace-nowrap text-xs underline decoration-dashed scroll-mt-20 ${
                        d.caption_leak.leaking === 0
                          ? 'text-emerald-400 decoration-emerald-400/40'
                          : 'text-amber-400 decoration-amber-400/50'}`}>
                      {d.caption_leak.leaking === 0
                        ? `0 ${isConcept ? 'concept' : 'identity'} leaks · ${d.caption_leak.captioned} captions checked`
                        : `${d.caption_leak.leaking}/${d.caption_leak.captioned} captions leak ${isConcept ? 'the concept' : 'identity'}`}
                      {' '}{showLeaks ? '▴' : '▾'}
                    </button>
                  ) : kept > 0 ? (
                    <button id="ds-captions-leak-review" type="button" data-workspace-focus
                      onClick={toggleLeakReview}
                      aria-expanded={showLeaks}
                      title="Review leaks"
                      className={`${controlHeight()} inline-flex items-center self-start whitespace-nowrap text-content-subtle text-xs underline decoration-dashed decoration-border scroll-mt-20`}>
                      {isConcept ? 'concept' : 'identity'}-leak scan: no captions yet {showLeaks ? '▴' : '▾'}
                    </button>
                  ) : null
                )}
              </div>

              {/* Caption-leak explainer + triage. Opened from the badge in EITHER state:
                  it says what a leak is (kind-specific: identity vs the concept itself),
                  WHAT was checked (so a green 0 is a real result, not a check that never
                  ran), why 0 is normal — and, when there ARE leaks, the offending captions
                  editable IN PLACE (saves on blur, like the grid). Style sets have no leak
                  concept, so the panel only opens for character/concept. */}
              {showLeaks && !isStyle && (
                <div className="lds-section py-3 flex flex-col gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <Drama aria-hidden="true" className="h-5 w-5 shrink-0 text-content-muted" />
                    <div className="flex flex-col gap-1">
                      <span className="text-content font-semibold text-sm">{isConcept ? 'Concept-leak check' : 'Identity-leak check'}</span>
                    </div>
                    <button type="button" onClick={toggleLeakReview}
                      className="ml-auto shrink-0 text-content-subtle hover:text-content text-sm" aria-label="Close"><X aria-hidden="true" className="h-4 w-4" /></button>
                  </div>

                  {/* What was checked — the numbers behind the badge. */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-content-subtle tabular-nums">
                    <span><strong className="text-content-muted">{d.caption_leak?.captioned ?? 0}</strong> captions checked</span>
                    <span className={d.caption_leak?.leaking ? 'text-amber-300' : 'text-emerald-400'}>
                      <strong>{d.caption_leak?.leaking ?? 0}</strong> leaking
                    </span>
                  </div>

                  {/* Words the detector watches. Concept: derived from the description
                      (its words + their basic lexical field); character: the fixed regex. */}
                  <div className="flex flex-col gap-1">
                    <span className="text-content-subtle">Words watched for:</span>
                    {isConcept ? (
                      <span className="text-content-muted">{d.concept_desc || 'Concept description'}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {(d.caption_leak?.watched?.length
                          ? d.caption_leak.watched
                          : ['hair', 'eye colour', 'skin · complexion · freckles',
                             'jawline · eyebrows · facial features', 'face shape',
                             ...(bodyFid ? ['tattoos · scars · piercings (body fidelity)'] : [])]
                        ).map((c) => (
                          <span key={c} className="rounded-full bg-surface border border-border px-2 py-0.5 text-content-muted text-2xs">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {d.caption_leak?.captioned === 0 ? (
                    <p className="m-0 text-content-subtle">No captions to check.</p>
                  ) : d.caption_leak?.leaking === 0 ? (
                    <p className="m-0 text-emerald-400/90">
                      <CheckCircle2 aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />No leaks found.
                    </p>
                  ) : (
                    <div className="rounded-lg border border-amber-400/40 bg-amber-500/5 p-2.5 flex flex-col gap-2">
                      {/* Targeted re-caption is scoped, so it stays disabled only while a
                          full batch/other vision pass is running (ds.captioning) or another
                          targeted row is in flight — the offending row shows its own spinner. */}
                      {(() => {
                        const recaptionLocked = ds.busy || ds.captioning || ds.recaptioningIds.size > 0;
                        return (
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <span className="text-amber-300 text-xs font-semibold">
                              {isConcept
                                ? <>Concept leaks ({d.caption_leak?.leaking})</>
                                : <>Identity leaks ({d.caption_leak?.leaking})</>}
                              <HelpBadge topic="action-recaption-targeted" className="ml-1" />
                            </span>
                            {leakingImages.length > 1 && (
                              <button type="button"
                                disabled={recaptionLocked}
                                onClick={() => ds.recaptionImages(leakingImages.map((i) => i.id), effCaptionMode)}
                                title={isConcept
                                  ? 'Re-generate every leaking caption while keeping the concept unspoken'
                                  : 'Re-generate every leaking caption without describing identity (face/hair)'}
                                className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-200 text-xs font-semibold border border-amber-400/40 hover:bg-amber-500/25 disabled:opacity-40">
                                <RefreshCw aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Re-caption all ({leakingImages.length})
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      {leakingImages.map((img) => {
                        const rowBusy = ds.recaptioningIds.has(img.id);
                        const recaptionLocked = ds.busy || ds.captioning || ds.recaptioningIds.size > 0;
                        return (
                          <div key={img.id} className="flex gap-2 items-start">
                            <img src={`/api/dataset/${d.id}/img/${encodeURIComponent(img.filename)}`}
                              alt={img.variation_label || 'dataset image'} loading="lazy"
                              className="w-14 h-14 rounded-lg object-cover shrink-0 bg-black" />
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <textarea defaultValue={img.caption || ''} rows={2}
                                key={`${img.id}:${img.caption || ''}`}
                                onBlur={(e) => {
                                  if (e.target.value !== (img.caption || '')) ds.setCaption(img.id, e.target.value);
                                }}
                                aria-label={`Caption of image ${img.id}`}
                                className="w-full bg-app/60 border border-amber-400/30 rounded px-2 py-1 text-2xs text-content resize-y" />
                              {/* WHO WROTE THE LEAKING SENTENCE. This list is read
                                  caption by caption to decide what to redo, and the
                                  'auto' backend chains two engines inside one run —
                                  so "which engine keeps leaking" is answerable here
                                  and was not. Silent when the author was never
                                  recorded (that is not "a model wrote it"). */}
                              {captionOriginInfo(img.caption_origin).known && (
                                <span className="text-2xs text-content-subtle"
                                  title={captionOriginInfo(img.caption_origin).title}>
                                  {captionOriginInfo(img.caption_origin).short}
                                </span>
                              )}
                              <button type="button"
                                disabled={recaptionLocked}
                                onClick={() => ds.recaptionImages([img.id], effCaptionMode)}
                                title={isConcept
                                  ? 'Re-generate this caption while keeping the concept unspoken'
                                  : 'Re-generate this caption without describing identity (face/hair)'}
                                className="self-start px-2 py-0.5 rounded-lg bg-surface text-content text-2xs border border-border hover:bg-surface-raised disabled:opacity-40">
                                {rowBusy
                                  ? <><Loader2 aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px] animate-spin" />Re-captioning</>
                                  : <><RefreshCw aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Re-caption</>}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {leakingImages.length === 0 && (
                        <p className="m-0 text-emerald-400 text-xs"><CheckCircle2 aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />No leaks left.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 🧪 Caption Lab — the bench, in the section whose whole subject it is.
                  It shipped reachable ONLY from a tile in Images (⤢ → the 🧪 tab), while
                  THIS section's help topic already advertised 'caption lab', 'joycaption',
                  'vocabulary' and routed them to ?section=captions — the app promised a
                  screen that had no way in. The bench runs on one image, so the button
                  opens a picker rather than guessing which one. */}
              <div id="ds-captions-lab" tabIndex={-1}
                className="lds-section flex items-center gap-2 flex-wrap py-2 scroll-mt-20">
                <button type="button" data-workspace-focus
                  onClick={() => setLabPickerOpen(true)} disabled={ds.busy || kept === 0}
                  aria-label="Open the Caption Lab"
                  title={kept ? 'Compare caption settings.' : 'Keep an image first.'}
                  className={btnClass()}>
                  🧪 Caption Lab
                </button>
                <HelpBadge topic="action-caption-lab" />
              </div>

              <div id="ds-captions-tools" tabIndex={-1} className="scroll-mt-20">
                <CaptionToolsBar key={d.id} images={images} kind={d.kind || 'character'} mode={effCaptionMode}
                  triggerWord={d.trigger_word || ''}
                  excludes={excludeTags} includes={includeTags}
                  onExclude={toggleExclude} onInclude={toggleInclude}
                  onReplace={ds.replaceCaptions}
                  onWriteFiles={ds.writeCaptionFiles} onOpenFolder={ds.openDatasetFolder}
                  busy={ds.busy}
                  open={captionToolsOpen}
                  onOpenChange={(open) => onRevealOpenChange('tools', open, setCaptionToolsOpen)} />
              </div>
              {filtersActive && (
                <p className="m-0 text-content-subtle text-2xs">
                  <Filter aria-hidden="true" className="mr-1 inline h-3 w-3 align-[-1px]" />Filtered view in{' '}
                  <button type="button" onClick={() => setSection('images')}
                    className="underline hover:text-content">Images</button>
                  {' '}(showing {gridImages.length} of {rescueGridImages.length}).
                </p>
              )}
            </div>
          </div>

          {/*
           * Import & export: merge an existing dataset or export this one as a training ZIP,
           * portable backup or HF Hub upload.
           */}
          <div className={sectionCls('export')}>
            {heading('export')}
            <div id="gf-export" className="scroll-mt-20 flex flex-col gap-2">
              <div id="ds-export-import" tabIndex={-1}
                className="lds-section grid grid-cols-2 gap-2 py-2 scroll-mt-20">
                <button type="button" data-workspace-focus
                  onClick={() => zipInput.current?.click()} disabled={importBusy}
                  title="Merge ZIP images and captions."
                  className={btnClass()}>
                  <Package aria-hidden="true" className="h-4 w-4" />Import ZIP
                </button>
                <button type="button" disabled={importBusy} onClick={importFolderPrompt}
                  title="Merge folder images and captions."
                  className={btnClass()}>
                  <FolderOpen aria-hidden="true" className="h-4 w-4" />Import Folder
                </button>
              </div>
              <input ref={zipInput} type="file" accept=".zip,application/zip" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) ds.importDatasetZip(f);
                  e.target.value = '';
                }} />

              <div className="lds-section flex flex-col gap-2 py-2">
                <div id="ds-export-training-zip" tabIndex={-1}
                  className="flex items-center gap-2 flex-wrap scroll-mt-20">
                  <button type="button" data-workspace-focus={kept ? '' : undefined}
                    disabled={!kept} onClick={exportZipGuarded}
                    className={btnClass({ variant: 'primary' })}>
                    <Download aria-hidden="true" className="h-4 w-4" />Export ZIP ({kept})
                  </button>
                </div>
                {/* One primary way out (the training ZIP) stays in the open; the
                    other three are occasional, so they live behind one disclosure
                    instead of four buttons competing for the same glance. A
                    <details> and not a floating menu: the workspace landing
                    (openCollapsedAncestors in `land`) opens collapsed ancestors on
                    jump, so the sidebar links to Import to bank / Backup / a
                    plugin's row keep working. Do NOT make this a controlled
                    <details> without teaching `land` about it. */}
                <details className="lds-section">
                  <summary className="flex min-h-10 items-center gap-2 px-2.5 py-1.5 text-xs text-content-muted hover:text-content cursor-pointer select-none lg:min-h-0">
                    More ways out
                  </summary>
                  <div className="grid grid-cols-2 gap-2 px-2.5 pb-2.5 pt-1">
                    <div id="ds-export-to-bank" tabIndex={-1}
                      className="min-w-0 scroll-mt-20">
                      <button type="button" data-workspace-focus disabled={!kept}
                        onClick={() => setImportToBankOpen(true)}
                        title="Copy kept images to a Bank."
                        className={`${btnClass()} w-full`}>
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />Import to Bank
                      </button>
                    </div>
                    <div id="ds-export-backup" tabIndex={-1}
                      className="min-w-0 scroll-mt-20">
                      <button type="button" data-workspace-focus onClick={ds.exportBackup}
                        title="Back up images and settings."
                        className={`${btnClass()} w-full`}>
                        <Save aria-hidden="true" className="h-4 w-4" />Backup
                      </button>
                    </div>
                    {/* The plugins' ways out (a publisher's row): each draws
                        its own row under its own predicate, its dialog with it. */}
                    <PluginSlot slot="export.action" surface="dataset" dataset={d} kept={kept}
                      context={navContext} />
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* ============ 🎓 Training — readiness, launch, progress and options. */}
          <div className={sectionCls('training')}>
            {heading('training')}
            <div id="gf-training" className="scroll-mt-20 flex flex-col gap-2">
              <div id="ds-training-launch" tabIndex={-1}
                className="flex flex-col gap-2 scroll-mt-20">
                {/*
                 * Readiness badge mirrors preflight. Limit refreshKey to relevant counters to
                 * avoid refetching on every dataset poll.
                 */}
                {caps.training_visible && (
                  <TrainingReadiness key={d.id} datasetId={d.id} trainType={d.train_type} variant={d.train_variant}
                    refreshKey={`${kept}|${keptCaptioned}|${pending}|${triage}|${d.caption_leak?.leaking ?? ''}|${duplicateReviewVersion}`}
                    onJump={(targetId) => jumpTo({ targetId })}
                    onReviewDuplicates={(report) => setDuplicateReview({ datasetId: d.id,
                      report: { dup_pairs: report.dup_pairs || [] } })}
                    onOverrideChange={setNotReadyAck} />
                )}
                {duplicateReview?.datasetId === d.id && createPortal(
                  <PreflightModal reviewOnly report={duplicateReview.report} datasetId={d.id} ds={ds}
                    onDecision={() => setDuplicateReviewVersion((value) => value + 1)}
                    onResolve={() => { setDuplicateReview(null); setDuplicateReviewVersion((value) => value + 1); }} />, document.body)}
                <TrainingPanel ds={ds} keptCount={kept} kind={d.kind} allowNotReady={notReadyAck}
                  onDuplicateDecision={() => setDuplicateReviewVersion((value) => value + 1)}
                  sectionVisible={section === 'training'}
                  onCheckpointsChange={setCheckpointCount}
                  checkpointHost={checkpointHost}
                  navigationPanel={section === 'training' && panel === 'advanced' ? panel : null}
                  onNavigationStateChange={setTrainingNavigation}
                  onPanelOpenChange={(panelId, open) => {
                    if (!open && section === 'training' && panel === panelId) clearActivePanel();
                  }} />
              </div>
            </div>
          </div>

          {/* The TrainingPanel stays mounted exactly once; its checkpoint manager
              portals into this first-class stage so the queue poller is not duplicated. */}
          <div className={sectionCls('checkpoints')}>
            {heading('checkpoints')}
            <div id="gf-checkpoints" className="scroll-mt-20 flex flex-col gap-2">
              <div id="ds-checkpoints-manager" ref={setCheckpointHost} tabIndex={-1}
                className="scroll-mt-20" />
            </div>
          </div>

          {/* ============ 🎛️ Studio — final stage and dedicated-page launcher. */}
          <div className={sectionCls('studio')}>
            {heading('studio')}
            <div id="gf-studio" className="scroll-mt-20 flex flex-col gap-2">
              {caps.studio_visible ? (
                <button id="ds-studio-launcher" type="button" data-workspace-focus
                  onClick={() => navigate(`/studio?dataset=${d.id}`)}
                  className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2.5 text-left hover:bg-purple-500/10 transition-colors scroll-mt-20">
                  <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                  <span className="text-content font-semibold text-sm">LoRA testing studio</span>
                  {d.best_settings && (
                    <span className="text-amber-300 text-2xs" title="Saved winning settings">
                      ★ {fmt(d.best_settings.strength)}
                    </span>
                  )}
                  <span className="ml-auto px-3 py-1.5 rounded-lg bg-gradient-primary text-gray-950 text-xs font-semibold">
                    ⤢ Open Studio
                  </span>
                </button>
              ) : (
                <p className="m-0 rounded-lg border border-border bg-surface px-3 py-2 text-content-muted text-sm">
                  Connect ComfyUI to use the LoRA testing Studio.{' '}
                  <SettingsLink section="local-tools" focus="comfyui-api-url">Configure ComfyUI address</SettingsLink>
                </p>
              )}
              <div><HelpBadge topic="action-studio-open" /></div>
            </div>
          </div>
        </div>{/* /right column */}
      </div>{/* /workspace grid */}

      {/* Every dialog below renders behind a click; the lazy ones load
          their chunk on that first click, a frame nobody can see. */}
      <Suspense fallback={null}>
      {cropImg && cropImg.filename && (
        <CropModal usePreview imageUrl={`/api/dataset/${d.id}/img/${encodeURIComponent(cropImg.filename)}${
          ds.nonces?.[cropImg.id] ? `?v=${ds.nonces[cropImg.id]}` : ''}`}
          onCancel={() => setCropImg(null)}
          onConfirm={async (box) => { await ds.crop(cropImg.id, box); setCropImg(null); }} />
      )}
      {refCrop && d.ref_filename && (
        // Feed the crop editor the full-frame ORIGINAL (when kept) so the box can widen
        // back out — not just tighten the already-cropped square. Legacy datasets with
        // no stored original fall back to the cropped ref (can only tighten, as before).
        <CropModal usePreview imageUrl={`/api/dataset/${d.id}/img/${encodeURIComponent(d.ref_original_filename || d.ref_filename)}`}
          // 1:1 is the historical default; the editor itself still offers its ratio
          // buttons when a different manual crop is wanted.
          defaultAspect={1}
          onCancel={() => setRefCrop(false)}
          onConfirm={async (box) => { await ds.cropRef(box); setRefCrop(false); }}
          onReset={d.ref_original_filename
            ? async () => { await ds.recropRefAuto(); setRefCrop(false); }
            : undefined} />
      )}
      {refEdit && d.ref_filename && (
        <ReferenceEditModal datasetId={d.id} refFilename={d.ref_filename} nonce={ds.refNonce}
          // The engines are free but not universal: the modal is handed the SAME
          // capabilities the generation panel reads, so it can offer them when this
          // ComfyUI can run them, explain the one missing action when it nearly
          // can, and drop them entirely on an install that has no ComfyUI.
          defaultEngine={defaultEditEngine(window.localStorage,
            (e) => !localEngineUnavailableReason(e, caps))}
          comfyuiConfigured={hasComfyui(caps)}
          engineAvailable={caps.engines || {}}
          engineReason={(e) => localEngineUnavailableReason(e, caps)}
          datasetExtraCount={(d.ref_extra_filenames || []).length}
          liveActivity={ds.activity} referenceEdit={d.reference_edit}
          onEdit={ds.editReference} onRetry={ds.retryReferenceEdit}
          canRetry={ds.canRetryReferenceEdit}
          onKeep={ds.keepEditedReference} onDiscard={ds.discardEditedReference}
          onClose={() => setRefEdit(false)} />
      )}
      {extraRefCrop && extraRefCropSource(d.ref_extra_filenames, d.ref_extra_crop_sources, extraRefCrop) && (
        // Same editor as the primary reference, fed the extra's full-frame ORIGINAL
        // when one is kept. No ratio preset: extras are bust/body shots kept in their
        // own aspect, and nothing downstream needs a square. No "Reset to auto" —
        // extras are deliberately imported without the head-crop vision pass.
        <CropModal usePreview imageUrl={`/api/dataset/${d.id}/img/${encodeURIComponent(
          extraRefCropSource(d.ref_extra_filenames, d.ref_extra_crop_sources, extraRefCrop))}${
          ds.refNonce ? `?v=${ds.refNonce}` : ''}`}
          onCancel={() => setExtraRefCrop(null)}
          onConfirm={async (box) => { await ds.cropExtraRef(extraRefCrop, box); setExtraRefCrop(null); }} />
      )}
      {viewImgLive && (
        <DatasetLightbox img={viewImgLive} datasetId={d.id}
          nonce={(ds.nonces && ds.nonces[viewImgLive.id]) || 0}
          compare={viewImgComparison}
          parentNonce={(ds.nonces && viewImgComparison?.parent
            && ds.nonces[viewImgComparison.parent.id]) || 0}
          // The SECOND comparison — against the dataset's reference photo — is
          // decided inside the lightbox: unlike the derived parent it is not a
          // row of the payload, just this dataset's own filename, and it is
          // served by the very same /img/<name> endpoint. `refNonce` is the
          // reference's own cache buster (a crop or a re-upload bumps it).
          refFilename={d.ref_filename || ''}
          refNonce={ds.refNonce || 0}
          imageNonces={ds.nonces}
          onClose={() => setViewImg(null)}
          onMirror={viewImgLive._rescueReviewPreview ? undefined : ds.mirrorImage}
          onRotate={viewImgLive._rescueReviewPreview ? undefined : ds.rotateImage}
          mirrorBusy={Boolean(ds.mirroringIds?.has(viewImgLive.id))}
          // The lightbox hands back WHICH engine was pressed; a single-✨
          // surface passes none and the improve.engine setting decides.
          onImprove={canImproveViewImg
            ? ((imageId, engine) => ds.improveImage(imageId, { engine }))
            : undefined}
          /* ⟨ / ⟩ walk `gridImages` — the filtered, sorted list the grid shows,
             the SAME array it is handed below. Not `images` (the raw payload):
             ⟩ would then land on a picture the current filters hide, behind an
             overlay that gives no way to notice. The rescue-review preview
             opens on a Curation pair, not on a position in that list, so it
             gets no arrows rather than arrows into someone else's sequence. */
          images={viewImgLive._rescueReviewPreview ? null : gridImages}
          onNavigate={viewImgLive._rescueReviewPreview ? null : setViewImg}
          /* ✓ Keep / ✕ Reject from inside the lightbox — the SAME write the
             grid tile makes, so a verdict taken while looking at the picture
             full size is the very same fact as one taken on the thumbnail.
             The rescue-review preview gets none: that pair is resolved in
             Curation, and a status written behind its back would decide half
             of a decision it owns. */
          onStatus={viewImgLive._rescueReviewPreview ? null : ds.setStatus}
          /* 🚩 Mark a watermark — the answer to a detector MISS, opened from the
             image the user is looking at rather than from the flagged queue they
             are precisely NOT in. It reuses the review overlay on a one-image
             queue: same editor, same Clean/Dismiss afterwards, nothing forked.
             The rescue-review preview is excluded like every other write. */
          onMarkWatermark={viewImgLive._rescueReviewPreview
            ? undefined
            : ((image) => { setViewImg(null); setReviewQueue([image]); })}
          /* ✦ Repair acts HERE now, without the detour through the watermark
             review. Same call the review screen makes, so both surfaces share
             one lane, one undo and one set of refusals. */
          onRepair={viewImgLive._rescueReviewPreview
            ? undefined
            : ((id, prompt, boxes, mask) => ds.repairImageRegion(id, prompt, boxes, mask))}
          onUndoRepair={viewImgLive._rescueReviewPreview
            ? undefined
            : ((id) => ds.undoImageRepair(id))}
          improvePending={viewImgImproving}
          improveReady={viewImgImprovementReady}
          busy={ds.busy || gridBulkBusy}
          improveBusy={ds.improveBusy || gridBulkBusy}
          curationBusy={ds.curationBusy || gridBulkBusy}
          // The refused writes in there name the pass that holds them, exactly
          // like the tiles behind the lightbox.
          busyReason={(ds.busy || gridBulkBusy) ? datasetBusyReason(ds.busy ? act : null) : null}
          kleinAvailable={Boolean(caps.engines?.klein)}
          subjectType={d.subject_type || 'human'}
          onCrop={viewImgLive._rescueReviewPreview
            ? undefined
            : (img) => { setViewImg(null); setCropImg(img); }} />
      )}
      {settingsOpen && (
        <DatasetSettingsModal d={d} busy={ds.busy}
          onSave={ds.updateSettings} onClose={() => setSettingsOpen(false)} />
      )}
      {importToBankOpen && (
        <DatasetToBankDialog datasetName={d.name} keptCount={kept}
          onClose={() => setImportToBankOpen(false)} onStart={importToBank} />
      )}
      {folderBrowseOpen && (
        <FolderBrowserModal
          onPick={(p) => ds.importDatasetFolder(p, { silent: true })}
          onClose={() => setFolderBrowseOpen(false)} />
      )}
      {captionOptionsOpen && (
        <CaptionOptionsPopover datasetId={d.id} trainType={d.train_type} kind={d.kind}
          onClose={() => setCaptionOptionsOpen(false)} />
      )}
      {reviewQueue && reviewQueue.length > 0 && (
        <WatermarkReviewLightbox
          datasetId={d.id}
          queue={reviewQueue}
          caps={caps}
          nonces={ds.nonces}
          onSaveRegions={(id, regions) => ds.saveWatermarkRegions(id, regions)}
          onClean={(id, method, allowCrop) => ds.cleanWatermarkImages([id], method, allowCrop)}
          onRestore={(id) => ds.restoreWatermarkImage(id)}
          onDismiss={(id) => ds.dismissWatermarks([id])}
          onReject={(id) => ds.setStatus(id, 'reject')}
          onRepair={(id, prompt, boxes, mask) => ds.repairImageRegion(id, prompt, boxes, mask)}
          onUndoRepair={(id) => ds.undoImageRepair(id)}
          onClose={(recap) => {
            setReviewQueue(null);
            const summary = recap || buildWatermarkRecap({});
            if (summary) toast.success(`Review complete: ${summary}`);
          }} />
      )}
      {/* 🧪 Caption Lab, entered from the Captions section: pick the subject, then
          the existing editor opens on its Lab tab. ‹ Another image inside the dialog
          comes back HERE rather than closing — benching is a comparison across rows,
          not a single shot. */}
      {labPickerOpen && (
        <CaptionLabPicker images={keptImages}
          /* The THUMB, not the original. /img/ serves the full bytes — several MB per
             row, decoded whole to paint a ~200 px cell — and this picker offers the
             entire kept pile. datasetThumbUrl is the app's one rewrite for exactly
             this, used by every other tile grid. */
          thumbUrl={(img) => datasetThumbUrl(`/api/dataset/${d.id}/img/${encodeURIComponent(img.filename)}`, 256)}
          emptyNote="No kept images."
          onClose={() => setLabPickerOpen(false)}
          onPick={(img) => { setLabPickerOpen(false); setLabImage(img); }} />
      )}
      {labImage && (
        <CaptionEditorDialog initialMode="lab"
          initialCaption={labImage.caption || ''}
          initialShortCaption={labImage.caption_short || ''}
          showShort={Boolean(d.dual_captions)}
          imageUrl={`/api/dataset/${d.id}/img/${encodeURIComponent(labImage.filename)}`}
          imageLabel={labImage.filename}
          labSurface={datasetLabSurface({ instanceId: d.instance_id, datasetId: d.id, imageId: labImage.id, filename: labImage.filename })}
          captionOrigin={labImage.caption_origin} shortCaptionOrigin={labImage.caption_short_origin}
          onPickAnotherImage={() => { setLabImage(null); setLabPickerOpen(true); }}
          onClose={() => setLabImage(null)}
          /* Same contract as the tile's editor: awaited, and the refusal handed BACK
             so the dialog can draw it next to the text instead of closing on top of
             an unsaved caption. `silent` because the dialog says it itself. */
          onSave={async (nextCaption, nextShort) => {
            const changed = nextCaption !== (labImage.caption || '')
              || (nextShort !== undefined && nextShort !== (labImage.caption_short || ''));
            if (!changed) return { ok: true };
            return ds.setCaption(labImage.id, nextCaption, nextShort, { silent: true });
          }} />
      )}
      </Suspense>
    </div>
  );
}
