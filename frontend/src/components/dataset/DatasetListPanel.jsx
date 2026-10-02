import { useEffect, useState } from 'react';
import { familyBadge } from '../../utils/familyBadges';
import { AlertTriangle, Download, Image as ImageIcon, LayoutGrid, Lightbulb, Palette, PenLine, PersonStanding, Plus, Save, Smile, Trash2, User, X } from 'lucide-react';
import { datasetThumbUrl } from '../../utils/datasetThumbUrl';
import ShotIllustration from './ShotIllustration';
import TileSizeControl from '../shared/TileSizeControl';
import FullBackupControls from './FullBackupControls';
import { Button, Chip, Input, btnClass, btnShape, fieldClass } from '../common/Controls.jsx';
import Pagination from '../common/Pagination.jsx';
import { HelpBadge } from '../../help/HelpMode';
import { canCreateDataset } from './newDataset';
import { requestHelpTip } from '../../help/helpTips';
import { contributions } from '../../plugins/registry.js';
import { PluginPanel } from '../../plugins/PluginSlot.jsx';
import {
  datasetKind, datasetMatches, groupDatasets, kindsPresent,
  libraryPageFor, normalizeCollapsedMap, normalizePageSize, normalizeTileSize, paginate,
} from '../../utils/datasetLibrary';

// Fixed gradient palette for the dataset avatars — deterministic per name so a
// dataset keeps its color across sessions (Tailwind needs literal class names).
// Safelight: muted tonal pairs, not saturated two-hue gradients — distinct
// enough to tell datasets apart, quiet enough to never compete with a photo.
const AVATAR_GRADIENTS = [
  'from-[#4A4340] to-[#5C5450]',
  'from-[#3E4650] to-[#4E5763]',
  'from-[#464049] to-[#57505B]',
  'from-[#414A44] to-[#525C55]',
  'from-[#4E453F] to-[#605650]',
  'from-[#4B4244] to-[#5D5254]',
];

function gradientFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

/** Empty state keeps one clear creation path and a compact shot contact sheet. */
function EmptyState() {
  const shots = [
    { framing: 'face', label: '' },
    { framing: 'face', label: 'Visage 3/4 gauche' },
    { framing: 'bust', label: '' },
    { framing: 'face', label: 'Profil droite' },
    { framing: 'body', label: '' },
    { framing: 'back', label: '' },
  ];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-app/30 px-4 py-6 text-center">
        <div className="grid grid-cols-6 gap-1.5" aria-hidden="true">
          {shots.map((s, i) => (
            <ShotIllustration key={i} framing={s.framing} label={s.label}
              className={`w-9 h-9 ${i === 0 ? 'text-indigo-300' : 'text-content-subtle'}`} />
          ))}
        </div>
        <p className="text-content-muted text-sm font-medium">No datasets yet</p>
        <p className="max-w-xs text-content-subtle text-xs">
          Create a dataset, then import images or generate from a reference.
        </p>
    </div>
  );
}


// Display preferences — persisted globally (display settings, not dataset
// data; same pattern as datasetGridTileSize / the CloudRuns group folds).
// S = compact tiles, M = the historical photo grid, L = large previews.
const TILE_SIZE_KEY = 'datasetLibraryTileSize';
const PAGE_SIZE_KEY = 'datasetLibraryPageSize';
const COLLAPSED_KEY = 'datasetLibraryCollapsed_v1';
const PREVIEWS_VISIBLE_KEY = 'datasetLibraryPreviewsVisible';
const TILE_SIZE_TITLE = {
  S: 'Compact tiles — the most datasets on one screen',
  M: 'Medium tiles (default)',
  L: 'Large tiles — big reference previews',
};
const GRID_COLS = {
  S: 'grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  M: 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4',
  L: 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3',
};

// Kind filter chips — only rendered when at least two kinds coexist in the
// library. Transient on purpose: a persisted filter reads as lost datasets.
const KIND_CHIPS = {
  character: 'Character',
  concept: 'Concept',
  style: 'Style',
};
const KIND_ICONS = { character: User, concept: Lightbulb, style: Palette };

/** One-line status of a tile: how big, how far along. Text, not color-only. */
function tileStats(d) {
  const total = d.images_total ?? 0;
  const kept = d.images_kept ?? 0;
  const captioned = d.images_captioned ?? 0;
  if (!total) return 'empty';
  if (!kept) return `${total} img · none kept`;
  if (captioned >= kept) return `${kept} kept · ✓ captioned`;
  if (d.kind === 'style') return `${kept} kept · ${captioned}/${kept} required captions`;
  if (captioned > 0) return `${kept} kept · ${captioned}/${kept} captioned`;
  return `${kept} kept`;
}

/** window.prompt-based rename (same pattern as VariationCatalog's shot-preset
 *  rename) — a quick fix for a name typed carelessly at creation (e.g. a bare
 *  "1"), reachable right from the library tile instead of buried in the
 *  workspace's ⋯ More → Edit settings. */
function promptRename(onRename, d) {
  const name = window.prompt('Rename dataset:', d.name);
  if (name != null && name.trim() && name.trim() !== d.name) onRename(d.id, name.trim());
}

/** Photo-first tile: the reference face IS the identity — lead with it. */
function DatasetTile({ d, onOpen, onDelete, onRename, onExportZip, onExportBackup, showPreviews }) {
  const canExportZip = (d.images_kept ?? 0) > 0;
  return (
    <div className="library-card group relative overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-primary/40">
      <button type="button" onClick={() => onOpen(d.id)}
        aria-label={`Open the dataset ${d.name}`}
        className="block w-full text-left">
        <div className="relative aspect-[4/3] bg-app/60">
          {showPreviews && d.ref_filename ? (
            <img
              src={datasetThumbUrl(`/api/dataset/${d.id}/img/${encodeURIComponent(d.ref_filename)}`, 384)}
              alt="" loading="lazy" decoding="async" aria-hidden="true"
              className="h-full w-full object-cover" />
          ) : (
            <span className={`grid h-full w-full place-items-center bg-gradient-to-br ${gradientFor(d.name)} text-white text-2xl font-bold`}
              aria-hidden="true">
              {(d.name || '?').charAt(0).toUpperCase()}
            </span>
          )}
          {d.kind === 'concept' && (
            <span className="absolute left-1.5 top-1.5 rounded border border-fuchsia-400/40 bg-black/50 px-1.5 py-px text-2xs font-semibold uppercase text-fuchsia-300 backdrop-blur-sm inline-flex items-center gap-1">
              <Lightbulb aria-hidden="true" className="h-2.5 w-2.5" /> Concept
            </span>
          )}
          {d.kind === 'style' && (
            <span className="absolute left-1.5 top-1.5 rounded border border-cyan-400/40 bg-black/50 px-1.5 py-px text-2xs font-semibold uppercase text-cyan-300 backdrop-blur-sm inline-flex items-center gap-1">
              <Palette aria-hidden="true" className="h-2.5 w-2.5" /> Style
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5 p-2.5">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-sm font-semibold text-content">{d.name}</span>
            {(d.trained_families || []).map((f) => {
              const [lbl, cls] = familyBadge(f);
              return (
                <span key={f} className={`shrink-0 rounded border px-1.5 py-px text-2xs font-semibold uppercase ${cls}`}
                  title={`A ${lbl} LoRA has been trained from this dataset`}>
                  {lbl}
                </span>
              );
            })}
          </span>
          <span className={`truncate text-2xs ${d.kind === 'style' ? 'text-cyan-300' : 'font-mono text-indigo-300'}`}>
            {d.kind === 'style' ? 'always-on · no activation trigger' : (d.trigger_word || '—')}
          </span>
          <span className="text-2xs text-content-subtle">{tileStats(d)}</span>
        </div>
      </button>
      <div className="library-card__actions grid grid-cols-2 gap-1.5 border-t border-border px-2 py-2">
        <button type="button"
          onClick={() => onExportZip?.(d.id)}
          disabled={!canExportZip}
          title={canExportZip
            ? 'Download the kept images and captions as a training-ready ZIP'
            : 'Keep at least one image before exporting a training ZIP'}
          aria-label={`Export training ZIP for ${d.name}`}
          className="rounded-md border border-border bg-app/50 px-2 py-1 text-2xs font-semibold text-content-muted transition-colors hover:border-primary/40 hover:bg-surface-raised hover:text-content disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-app/50 disabled:hover:text-content-muted inline-flex items-center justify-center gap-1">
          <Download aria-hidden="true" className="h-3 w-3" /> ZIP
        </button>
        <button type="button"
          onClick={() => onExportBackup?.(d.id)}
          title="Download a portable backup with all images, captions and settings"
          aria-label={`Export portable backup for ${d.name}`}
          className="rounded-md border border-border bg-app/50 px-2 py-1 text-2xs font-semibold text-content-muted transition-colors hover:border-primary/40 hover:bg-surface-raised hover:text-content inline-flex items-center justify-center gap-1">
          <Save aria-hidden="true" className="h-3 w-3" /> Backup
        </button>
      </div>
      <div className="library-card__actions absolute right-1.5 top-1.5 flex gap-1">
        {onRename && (
          <button type="button" onClick={() => promptRename(onRename, d)}
            title="Rename this dataset" aria-label={`Rename the dataset ${d.name}`}
            className="grid h-6 w-6 place-items-center rounded-lg border border-border bg-black/50 text-xs text-content-subtle opacity-70 backdrop-blur-sm transition-opacity hover:bg-white/10 hover:text-content hover:opacity-100">
            <PenLine aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button type="button"
            onClick={() => {
              if (window.confirm(`Permanently delete the dataset "${d.name}" and all its images? This cannot be undone.`)) onDelete(d.id);
            }}
            title="Delete this dataset" aria-label={`Delete the dataset ${d.name}`}
            className="grid h-6 w-6 place-items-center rounded-lg border border-red-500/40 bg-black/50 text-xs text-red-300 opacity-70 backdrop-blur-sm transition-opacity hover:bg-red-500/25 hover:opacity-100">
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** The creation form — folded behind "New dataset" (auto-open on an empty
 *  library). Fields unchanged from the historical always-open card. */
function NewDatasetForm({ onCreate, onClose }) {
  const [media, setMedia] = useState('images');
  const creators = contributions('datasets.create', 'datasets');
  const creator = creators.find((item) => `${item.plugin}:${item.id}` === media);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  // Dataset kind: character (identity bound to the trigger) or concept (recurring action/effect
  // bound to the trigger, with raw import, inverse captions and no reference/face tools).
  const [kind, setKind] = useState('character');
  // The target model selected at creation sets the caption format immediately (SDXL = booru,
  // otherwise prose) and the menu group. It remains editable in the training panel. Default:
  // Z-Image, the app's default type.
  const [trainType, setTrainType] = useState('zimage');
  // Concept only: what the captioner must OMIT from every caption so the concept binds to the
  // trigger, the inverse of a character LoRA. Required for concepts.
  const [conceptDesc, setConceptDesc] = useState('');
  // Character only: face fidelity (default) or face + body. Body mode excludes body markings from
  // captions and targets more body shots.
  const [fidelity, setFidelity] = useState('face');
  const concept = kind === 'concept';
  // Style: the LoRA absorbs a global aesthetic, requiring content-only captions, no activation
  // trigger and no face fidelity.
  const style = kind === 'style';
  // The rule (and the reasoning that used to sit here) moved into
  // newDataset.js the moment ⬆ Promote gained a "🆕 A new dataset" door: two
  // copies of a rule that mirrors the server is two chances to stop mirroring
  // it. Same behaviour, now tested.
  const canCreate = canCreateDataset({ name, trigger, kind, conceptDesc });
  return (
    <div id="new-dataset-form" className="mx-auto flex w-full max-w-4xl flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-content font-semibold text-sm flex items-center gap-2">
          <Plus aria-hidden="true" className="h-4 w-4" /> New dataset
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close the new-dataset form"
            className="rounded px-1.5 text-content-subtle hover:text-content"><X aria-hidden="true" className="h-4 w-4" /></button>
        )}
      </div>
      {creators.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Dataset media">
          {[{ key: 'images', label: 'Images' }, ...creators.map((item) => ({
            key: `${item.plugin}:${item.id}`, label: item.label,
          }))].map((item) => (
            <button key={item.key} type="button" aria-pressed={media === item.key}
              onClick={() => setMedia(item.key)}
              className={`${btnShape()} flex-1 border font-semibold ${media === item.key
                ? 'border-primary/60 bg-primary/15 text-content'
                : 'border-border text-content-muted hover:bg-surface-raised'}`}>
              {item.label}
            </button>
          ))}
        </div>
      )}
      {creator ? (
        <PluginPanel panelKey={`datasets.create:${media}`} importer={creator.panel} onClose={onClose} />
      ) : (<>
      {/*
       * Kind: character (default) or concept. Concept adapts the rest: raw import preserves aspect
       * ratio, captions retain identity, and reference photos and the variation generator are
       * hidden.
       */}
      <div className="flex gap-1.5">
        {[['character', User, 'Character', 'A person/face — identity binds to the trigger'],
          ['concept', Lightbulb, 'Concept', 'A recurring act/effect — the concept binds to the trigger'],
          ['style', Palette, 'Style', 'An always-on aesthetic: load the LoRA and control its influence with the LoRA weight']].map(
          ([val, KindIcon, label, hint]) => (
            <button key={val} type="button" onClick={() => setKind(val)} title={hint}
              className={`${btnShape()} flex-1 border font-semibold ${
                kind === val
                  ? 'border-primary/60 bg-primary/15 text-content'
                  : 'border-border bg-app/40 text-content-muted hover:bg-surface-raised'}`}>
              <KindIcon aria-hidden="true" className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className={`flex flex-col gap-1 text-xs text-content-muted ${style ? 'sm:col-span-2' : ''}`}>
          {concept ? 'Concept name' : style ? 'Style name' : 'Character name'}
          <input id="new-dataset-name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={concept ? 'e.g. cim' : style ? 'e.g. ink-wash' : 'e.g. Emma'}
            className={fieldClass()} />
        </label>
        {!style && (
          <label className="flex flex-col gap-1 text-xs text-content-muted">
            Trigger word
            <input value={trigger} onChange={(e) => setTrigger(e.target.value)}
              placeholder={concept ? 'e.g. cim_act' : 'e.g. zchar_emma'}
              className={fieldClass()} />
            {/* Guard-rail: a plain short word ("emma", "girl") collides with the base
                model's existing vocabulary — the identity bleeds into that word
                everywhere. A unique token (prefix/underscore/digits) binds cleanly. */}
            {trigger.trim() && /^[a-z]{1,7}$/i.test(trigger.trim()) && (
              <span className="text-amber-300 text-2xs">
                <AlertTriangle aria-hidden="true" className="mr-0.5 inline h-3 w-3 align-[-1px]" />“{trigger.trim()}” looks like a common word — the base model already has a meaning
                for it. Prefer a unique token like <span className="font-mono">zchar_{trigger.trim().toLowerCase()}</span>.
              </span>
            )}
          </label>
        )}
      </div>
      {/*
       * The target model sets the DEFAULT caption format (SDXL = booru tags; anima = hybrid,
       * accepting either; otherwise prose) and the menu section. Editable later in the training
       * panel.
       */}
      <label className="flex flex-col gap-1 text-xs text-content-muted">
        Target model <span className="text-content-subtle normal-case">— sets the caption style &amp; groups the menu (changeable later)</span>
        <select value={trainType} onChange={(e) => setTrainType(e.target.value)}
          className={fieldClass()}>
          <option value="zimage">Z-Image (prose captions)</option>
          <option value="sdxl">SDXL (booru-tag captions)</option>
          <option value="krea">Krea 2 (prose captions)</option>
          <option value="flux">FLUX.1 (prose captions)</option>
          <option value="flux2klein">FLUX.2 Klein (prose captions)</option>
          <option value="anima">Anima (prose or booru tags)</option>
          <option value="qwenimage21">Qwen-Image 2.1 (prose captions)</option>
        </select>
      </label>
      {/*
       * Character fidelity: face only (default) or face + body. Body mode excludes permanent body
       * markings from captions so they bind to the trigger, and targets more bust/body shots.
       */}
      {!concept && !style && (
        <div className="flex flex-col gap-1 text-2xs text-content-muted">
          <span>Fidelity <span className="text-content-subtle normal-case">— what the LoRA must reproduce (changeable later)</span></span>
          <div className="flex gap-1.5">
            {[['face', Smile, 'Face', 'Identity = the face. Body shape may vary with the prompt.'],
              ['body', PersonStanding, 'Face + body', 'Total fidelity: body shape, tattoos and marks bind to the trigger too. Prefers full-frame imports and more bust/body shots.']].map(
              ([val, FidIcon, label, hint]) => (
                <button key={val} type="button" onClick={() => setFidelity(val)} title={hint}
                  className={`${btnShape()} flex-1 border font-semibold ${
                    fidelity === val
                      ? 'border-primary/60 bg-primary/15 text-content'
                      : 'border-border bg-app/40 text-content-muted hover:bg-surface-raised'}`}>
                  <FidIcon aria-hidden="true" className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
          </div>
        </div>
      )}
      {/*
       * Concept description: the recurring action OMITTED from captions. Fills {concept} in
       * caption/refinement/ban-list prompts. Describe the ACTION, not the subject.
       */}
      {concept && (
        <label className="flex flex-col gap-1 text-xs text-content-muted">
          What is the recurring concept? <span className="text-fuchsia-300">(required — it will be omitted from every caption)</span>
          <textarea value={conceptDesc} onChange={(e) => setConceptDesc(e.target.value)} rows={2}
            placeholder="Describe the recurring act/effect itself, not the people — e.g. “a tongue licking an ice-cream cone”"
            className="bg-app/60 border border-border rounded px-2 py-1.5 text-sm text-content resize-y" />
        </label>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-content-subtle text-2xs">
          {concept
            ? 'The trigger word is the token you type to summon this concept. Import raw images of it, then caption and train.'
            : style
              ? 'Always-on Style: import varied images, then caption every kept image with content only (subject, action, setting) while leaving the aesthetic unspoken. Combine it with a character LoRA by adjusting each LoRA weight.'
              : 'The trigger word is the unique token you will type in prompts to summon this character.'}
        </p>
        <button type="button"
          onClick={() => canCreate && onCreate(name.trim(), trigger.trim(), kind, conceptDesc.trim(), trainType,
            (concept || style) ? undefined : fidelity)}
          disabled={!canCreate}
          className={`ml-auto ${btnClass({ variant: 'primary' })}`}>
          Create
        </button>
      </div>
      </>)}
    </div>
  );
}

/** Shown in place of the empty state while the list has not been loaded. */
function ListStatusNotice({ status, onRetry }) {
  if (status === 'error') {
    return (
      <div role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-red-500/40 bg-red-500/5 px-4 py-5 text-center">
        <p className="text-sm text-content-muted">Could not load your datasets.</p>
        {onRetry && (
          <button type="button" onClick={onRetry}
            className="min-h-10 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-content hover:bg-surface-raised lg:min-h-0">
            Retry
          </button>
        )}
      </div>
    );
  }
  return (
    <p role="status"
      className="rounded-xl border border-dashed border-border bg-app/30 px-4 py-5 text-center text-sm text-content-muted">
      Loading datasets
    </p>
  );
}

export default function DatasetListPanel({
  datasets, listStatus = 'ready', onRetryList, onOpen, onCreate, onDelete, onRename, onRestore, onExportZip, onExportBackup, backup,
}) {
  // Library-first: the creation form stays folded behind "+ New dataset" so the
  // page opens on the collection — except on an empty library, where creating
  // is the only meaningful action.
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  // Kind chip filter — transient (see KIND_CHIPS): reset on every page load.
  const [kindFilter, setKindFilter] = useState('all');
  // Tile size + collapsed sections: persisted display preferences (same lazy
  // init + save effect as datasetGridTileSize / the CloudRuns group folds).
  const [tileSize, setTileSize] = useState(() => {
    try { return normalizeTileSize(localStorage.getItem(TILE_SIZE_KEY)); } catch { return 'M'; }
  });
  useEffect(() => {
    try { localStorage.setItem(TILE_SIZE_KEY, tileSize); } catch { /* ignore — private mode */ }
  }, [tileSize]);
  const [pageSize, setPageSize] = useState(() => {
    try { return normalizePageSize(localStorage.getItem(PAGE_SIZE_KEY)); } catch { return 24; }
  });
  useEffect(() => {
    try { localStorage.setItem(PAGE_SIZE_KEY, String(pageSize)); } catch { /* ignore — private mode */ }
  }, [pageSize]);
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] = useState({ query: '', kindFilter: 'all', tileSize });
  const viewPage = libraryPageFor(page, { query, kindFilter, tileSize }, appliedFilters);
  if (viewPage !== page
    || appliedFilters.query !== query
    || appliedFilters.kindFilter !== kindFilter
    || appliedFilters.tileSize !== tileSize) {
    setAppliedFilters({ query, kindFilter, tileSize });
    if (viewPage !== page) setPage(viewPage);
  }
  // Image requests are intentionally conditional below: when previews are
  // hidden, cards show their local initial fallback without mounting an <img>.
  const [showPreviews, setShowPreviews] = useState(() => {
    try { return localStorage.getItem(PREVIEWS_VISIBLE_KEY) !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(PREVIEWS_VISIBLE_KEY, showPreviews ? '1' : '0'); } catch { /* ignore — private mode */ }
  }, [showPreviews]);
  const [collapsed, setCollapsed] = useState(() => {
    try { return normalizeCollapsedMap(localStorage.getItem(COLLAPSED_KEY)); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed)); } catch { /* ignore — private mode */ }
  }, [collapsed]);
  const toggleSection = (family) => setCollapsed((m) => {
    const next = { ...m };
    if (next[family]) delete next[family];
    else next[family] = 1;
    return next;
  });
  const empty = datasets.length === 0;
  // An empty list that has not been LOADED (still loading, or the load failed)
  // is not an empty library: say so instead of "No datasets yet", and do not
  // push the creation form at someone whose datasets simply have not arrived.
  const pending = empty && listStatus !== 'ready';
  const soleForm = empty && !pending;
  const formOpen = creating || soleForm;
  // One-time tip: once the library is sizeable, point out tile sizing / folding /
  // filtering. Gated at ≥6 so it never fires for a first-time, near-empty library.
  useEffect(() => { if (datasets.length >= 6) requestHelpTip('library-browse'); }, [datasets.length]);
  const filtered = datasets.filter((d) => datasetMatches(d, query, kindFilter));
  const paged = paginate(filtered, viewPage, pageSize);
  const groups = groupDatasets(paged.items);
  const kinds = kindsPresent(datasets);
  // While a search/filter is active every section is forced open: a fold that
  // hides matches would read as lost datasets. Folding resumes when cleared.
  const filterActive = Boolean(query.trim()) || kindFilter !== 'all';
  return (
    <div className="flex flex-col gap-3">
      {/* Header: the page IS the library. Row 1 = title + primary actions;
          row 2 (below, non-empty library only) = search + filters + size. */}
      <div>
        {/*
         * relative z-30 creates a stacking context; otherwise the Backup menu panel's z-20 would
         * remain trapped below the tiles.
         */}
        <div className="relative z-30 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-content flex items-center gap-2">Datasets<HelpBadge topic="page-datasets" /></h1>
          {!empty && <span className="text-sm text-content-subtle">{datasets.length}</span>}
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              if (soleForm) document.getElementById('new-dataset-name')?.focus();
              else setCreating((v) => !v);
            }}
            aria-expanded={soleForm ? undefined : formOpen}
            aria-controls={soleForm ? undefined : 'new-dataset-form'}
          >
            {!soleForm && creating
              ? <><X aria-hidden="true" className="h-4 w-4" /> Close</>
              : <><Plus aria-hidden="true" className="h-4 w-4" /> New dataset</>}
          </Button>
          {/* Back up everything, its include-LoRAs option and Import backup
              all live in ONE Backup menu. New dataset stays out of it. */}
          <FullBackupControls backup={backup} onRestore={onRestore} />
          {!empty && (
            <>
              <Input
                type="search"
                size="md"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a dataset"
                aria-label="Find a dataset"
                className="min-w-[9rem] flex-1 sm:max-w-xs"
              />
              {kinds.length >= 2 && (
                <div role="group" aria-label="Filter by dataset kind" className="flex flex-wrap items-center gap-1">
                  {['all', ...kinds].map((k) => {
                    const KindIcon = KIND_ICONS[k];
                    return (
                      <Chip key={k} size="md" pressed={kindFilter === k} onClick={() => setKindFilter(k)}>
                        {k === 'all' ? 'All' : (
                          <span className="inline-flex items-center gap-1"><KindIcon aria-hidden="true" className="h-3 w-3" />{KIND_CHIPS[k]}</span>
                        )}
                      </Chip>
                    );
                  })}
                </div>
              )}
              <Chip
                size="md"
                pressed={showPreviews}
                onClick={() => setShowPreviews((visible) => !visible)}
                title={showPreviews ? 'Hide image previews' : 'Show image previews'}
              >
                {showPreviews
                  ? <ImageIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  : <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{showPreviews ? 'Hide previews' : 'Show previews'}</span>
                <span className="sr-only">Image previews {showPreviews ? 'shown' : 'hidden'}</span>
              </Chip>
              <TileSizeControl size={tileSize} onChange={setTileSize} titles={TILE_SIZE_TITLE} />
            </>
          )}
        </div>
      </div>

      {formOpen && (
        <NewDatasetForm onCreate={onCreate}
          onClose={soleForm ? null : () => setCreating(false)} />
      )}

      {pending ? (
        <ListStatusNotice status={listStatus} onRetry={onRetryList} />
      ) : empty ? (
        <EmptyState />
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-app/30 px-4 py-5 text-center text-sm text-content-muted">
          {query.trim()
            ? <>No dataset matches “{query.trim()}”{kindFilter !== 'all' ? ` in ${KIND_CHIPS[kindFilter]}` : ''}.</>
            : <>No {KIND_CHIPS[kindFilter]} dataset.</>}
        </p>
      ) : (
        <>
          {groups.map(({ family, label, emoji: GroupIcon, items }) => {
            const open = filterActive || !collapsed[family];
            return (
              <section key={family} className="flex flex-col gap-2">
                <h2>
                  <button type="button"
                    onClick={() => toggleSection(family)}
                    disabled={filterActive}
                    aria-expanded={open}
                    title={filterActive
                      ? 'Sections stay open while a search or filter is active'
                      : (open ? `Collapse the ${label} section` : `Expand the ${label} section`)}
                    className="flex w-full items-center gap-2 font-mono text-2xs font-semibold uppercase tracking-[0.18em] text-content-subtle transition-colors hover:text-content disabled:cursor-default disabled:hover:text-content-subtle">
                    <span aria-hidden="true"
                      className={`text-2xs transition-transform ${open ? 'rotate-90' : ''} ${filterActive ? 'opacity-40' : ''}`}>
                      ▶
                    </span>
                    <GroupIcon aria-hidden="true" className="h-3.5 w-3.5" /> {label}
                    <span className="font-normal normal-case tracking-normal">({items.length})</span>
                  </button>
                </h2>
                {open && (
                  <div className={GRID_COLS[tileSize]}>
                    {items.map((d) => (
                      <DatasetTile key={d.id} d={d} onOpen={onOpen} onDelete={onDelete} onRename={onRename}
                        onExportZip={onExportZip} onExportBackup={onExportBackup}
                        showPreviews={showPreviews} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <Pagination
            page={paged.page}
            pages={paged.pages}
            pageSize={paged.pageSize}
            total={paged.total}
            rangeStart={paged.rangeStart}
            rangeEnd={paged.rangeEnd}
            onPage={setPage}
            onPageSize={setPageSize}
            label="Datasets per page"
          />
        </>
      )}
    </div>
  );
}
