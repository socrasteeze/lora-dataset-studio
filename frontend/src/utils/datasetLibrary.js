/**
 * Pure logic for the Datasets library page (DatasetListPanel): family grouping,
 * search + kind filtering, and validation of the persisted display preferences.
 * Extracted from the component so it runs under node --test without a DOM.
 */

// The library is split in exactly TWO sections: datasets a LoRA has actually
// been trained from, and the rest. Per-family sectioning (tried 2026-07-17)
// fragmented the page into 1-3 tile groups while the per-tile family badges
// already carry that information — the badges do the job, the sections only
// answer "is this dataset trained work or still raw material?". Grouping reads
// d.trained_families (real runs), NEVER the mutable d.train_type scalar: that
// one is just the training panel's current pick and gets rewritten on a mere
// dropdown change. First value = the section's collapse key.
import { CircleDashed, GraduationCap } from 'lucide-react';
export const TRAINED = ['trained', 'Trained', GraduationCap];
export const NOT_TRAINED = ['not-trained', 'Not trained yet', CircleDashed];

// Tile size: 'S' compact tiles, 'M' the historical photo grid, 'L' large
// previews. Same 3-step segmented idiom as the workspace image grid.
const LIBRARY_TILE_SIZES = ['S', 'M', 'L'];
export const LIBRARY_PAGE_SIZES = [24, 48, 96];

/** Clamp a stored tile-size preference to a valid value (default 'M'). */
export function normalizeTileSize(v) {
  return LIBRARY_TILE_SIZES.includes(v) ? v : 'M';
}

/** Page size is one of 24, 48, or 96. Anything else is the first page size. */
export function normalizePageSize(value) {
  const n = Number(value);
  return LIBRARY_PAGE_SIZES.includes(n) ? n : LIBRARY_PAGE_SIZES[0];
}

/** Page 1 when the search, kind chip, tile size, sort, or filter changed.
 *  Otherwise the page the caller already has. A key the caller does not pass
 *  is undefined on both sides and does not reset the page. */
export function libraryPageFor(page, next, prev) {
  if (!prev
    || next.query !== prev.query
    || next.kindFilter !== prev.kindFilter
    || next.tileSize !== prev.tileSize
    || next.sort !== prev.sort
    || next.filter !== prev.filter) {
    return 1;
  }
  const n = Number(page);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Slice a filtered list. `start` is 0-based and `rangeStart` is the first
 *  item number the pager shows (0 when the list is empty). */
export function paginate(items, page, pageSize) {
  const list = Array.isArray(items) ? items : [];
  const size = normalizePageSize(pageSize);
  const pages = Math.max(1, Math.ceil(list.length / size) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (current - 1) * size;
  const end = Math.min(start + size, list.length);
  return {
    page: current,
    pages,
    pageSize: size,
    start,
    end,
    total: list.length,
    items: list.slice(start, end),
    rangeStart: list.length ? start + 1 : 0,
    rangeEnd: end,
  };
}

/** Parse the persisted {family: 1} collapsed-sections map; any malformed or
 *  non-object payload (old format, manual edit) degrades to "all open". */
export function normalizeCollapsedMap(raw) {
  try {
    const m = JSON.parse(raw || '{}');
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch {
    return {};
  }
}

/** A dataset's kind with the server default applied ('' → character). */
export function datasetKind(d) {
  return ((d?.kind || '').toLowerCase()) || 'character';
}

/** Search (name or trigger word, case-insensitive) + kind chip filter.
 *  kind 'all' disables the chip filter; query '' matches everything. */
export function datasetMatches(d, query = '', kind = 'all') {
  if (kind !== 'all' && datasetKind(d) !== kind) return false;
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return (d.name || '').toLowerCase().includes(q)
    || (d.trigger_word || '').toLowerCase().includes(q);
}

/** Kinds present in the library, in canonical order — the kind filter chips
 *  only render when at least two coexist (a single-kind library needs none). */
export function kindsPresent(datasets = []) {
  const present = new Set(datasets.map(datasetKind));
  return ['character', 'concept', 'style'].filter((k) => present.has(k));
}

/** True when at least one LoRA has actually been trained from this dataset
 *  (any family — the per-tile badges say which ones). */
export function isTrained(d) {
  return Array.isArray(d?.trained_families) && d.trained_families.length > 0;
}

/** Group datasets into ordered non-empty sections [{family, label, emoji,
 *  items}]: "Trained" first, "Not trained yet" last. Each dataset lands in
 *  exactly one section, so the header counts sum to the library size and
 *  changing train_type never moves a tile. Section shape is unchanged from the
 *  per-family era, so collapse keys / force-open / S-M-L grids apply as-is. */
export function groupDatasets(datasets = []) {
  const buckets = new Map([[TRAINED[0], []], [NOT_TRAINED[0], []]]);
  for (const d of datasets) {
    buckets.get(isTrained(d) ? TRAINED[0] : NOT_TRAINED[0]).push(d);
  }
  return [TRAINED, NOT_TRAINED]
    .filter(([family]) => buckets.get(family).length > 0)
    .map(([family, label, emoji]) => ({ family, label, emoji, items: buckets.get(family) }));
}
