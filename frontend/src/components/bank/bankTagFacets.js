/** 🔖 WD14 tags -> tidy facet dropdowns (pure, no JSX, so `node --test` runs it).
 *
 * The tagger returns thousands of distinct booru tags across a bank. A flat
 * frequency list of that is technically complete and practically useless: the
 * question a triage session actually asks is "which hair colour", "what are they
 * wearing", "inside or outside" — a handful of small closed questions, not one
 * enormous open one.
 *
 * So the known tags are grouped into FACETS below, and everything else falls
 * through to an "All tags" list ranked by frequency. Nothing is hidden by this
 * grouping — that distinction matters, and the UI says so: a facet is a shortcut
 * to the common questions, never a filter on what the model found.
 *
 * The lists are deliberately partial and will always be. Booru vocabulary is
 * open-ended and a curated map that pretended to be exhaustive would quietly
 * drop the long tail into invisibility; instead the tail stays visible in All
 * tags, and adding a name here only promotes it into a dropdown.
 *
 * Tag NAMES are the tagger's own (lowercase, underscores). They are stored in
 * user databases, so they are matched, never rewritten — `label()` only changes
 * what is DISPLAYED.
 */

/** Facet id -> {label, tags}. Ids are used in component state only (not stored),
 *  but the tag names inside are the tagger's canonical ones and must not drift. */
export const TAG_FACETS = [
  {
    id: 'hair_color',
    label: '💇 Hair colour',
    tags: ['blonde_hair', 'brown_hair', 'black_hair', 'red_hair', 'white_hair',
      'silver_hair', 'grey_hair', 'blue_hair', 'green_hair', 'pink_hair',
      'purple_hair', 'orange_hair', 'multicolored_hair', 'two-tone_hair'],
  },
  {
    id: 'hair_length',
    label: '✂️ Hair length & style',
    tags: ['long_hair', 'short_hair', 'medium_hair', 'very_long_hair', 'ponytail',
      'twintails', 'braid', 'bun', 'curly_hair', 'wavy_hair', 'straight_hair',
      'bangs', 'bald', 'updo', 'messy_hair'],
  },
  {
    id: 'eye_color',
    label: '👁️ Eye colour',
    tags: ['blue_eyes', 'brown_eyes', 'green_eyes', 'red_eyes', 'purple_eyes',
      'yellow_eyes', 'grey_eyes', 'black_eyes', 'orange_eyes', 'pink_eyes',
      'heterochromia', 'closed_eyes'],
  },
  {
    id: 'top',
    label: '👕 Top',
    tags: ['shirt', 't-shirt', 'blouse', 'sweater', 'hoodie', 'jacket', 'coat',
      'tank_top', 'crop_top', 'vest', 'cardigan', 'suit', 'blazer', 'bikini_top',
      'sports_bra', 'topless'],
  },
  {
    id: 'bottom',
    label: '👖 Bottom & dress',
    tags: ['dress', 'skirt', 'pants', 'jeans', 'shorts', 'leggings', 'miniskirt',
      'long_skirt', 'overalls', 'swimsuit', 'bikini', 'kimono', 'uniform',
      'school_uniform'],
  },
  {
    id: 'clothing_color',
    label: '🎨 Clothing colour',
    tags: ['white_shirt', 'black_shirt', 'blue_shirt', 'red_shirt', 'green_shirt',
      'white_dress', 'black_dress', 'red_dress', 'blue_dress', 'pink_dress',
      'black_jacket', 'white_jacket', 'blue_jacket', 'black_skirt', 'white_skirt',
      'blue_skirt', 'black_pants', 'blue_pants', 'white_pants'],
  },
  {
    id: 'headwear',
    label: '🎩 Headwear & glasses',
    tags: ['hat', 'cap', 'baseball_cap', 'beanie', 'beret', 'helmet', 'headband',
      'hair_ribbon', 'hairclip', 'glasses', 'sunglasses', 'mask', 'earrings',
      'hood'],
  },
  {
    id: 'people',
    label: '👥 How many people',
    tags: ['solo', '1girl', '1boy', '2girls', '2boys', 'multiple_girls',
      'multiple_boys', 'group', 'couple', 'crowd', 'no_humans'],
  },
  {
    id: 'setting',
    label: '🏞️ Setting',
    tags: ['outdoors', 'indoors', 'nature', 'city', 'street', 'beach', 'forest',
      'mountain', 'sky', 'night', 'day', 'sunset', 'water', 'snow', 'rain',
      'bedroom', 'kitchen', 'office', 'simple_background', 'white_background',
      'transparent_background', 'studio'],
  },
  {
    id: 'pose',
    label: '🧍 Pose & view',
    tags: ['standing', 'sitting', 'lying', 'kneeling', 'walking', 'running',
      'jumping', 'looking_at_viewer', 'looking_away', 'looking_back',
      'from_side', 'from_behind', 'from_above', 'from_below', 'profile',
      'upper_body', 'full_body', 'portrait', 'close-up', 'smile', 'open_mouth'],
  },
];

/** Every tag any facet claims — the membership test for "does this fall through
 *  to All tags?". Built once; a name in two facets would be a bug, so the last
 *  facet listing it wins and the duplicate is visible in a test rather than
 *  silently doubling in two dropdowns. */
const FACET_OF = new Map();
for (const facet of TAG_FACETS) {
  for (const tag of facet.tags) FACET_OF.set(tag, facet.id);
}

/** The facet a tag belongs to, or null when it has none. */
export function facetOf(tag) {
  return FACET_OF.get(String(tag || '')) || null;
}

/** Display form of a tag name: underscores are how booru writes them, not how
 *  anyone reads them. The STORED name is never changed — this is presentation
 *  only, and every filter still travels as the canonical name. */
export function label(tag) {
  return String(tag || '').replace(/_/g, ' ');
}

/**
 * Group the bank's tag counts into facet dropdowns plus the leftovers.
 *
 * @param counts  [{name, count}] from GET /api/bank/<id>/tags/facets, any order.
 * @param opts.minCount  drop tags carried by fewer than this many images. A tag
 *        on one image out of nine thousand is noise in a dropdown; it is still
 *        reachable through All tags and the free-text field. Default 1 (keep
 *        everything) so the caller decides, not this module.
 * @returns {facets, other, total}
 *   facets: [{id, label, options: [{name, label, count}]}] — ONLY facets that
 *           actually have something in this bank, options most-common first.
 *   other:  the same option shape for every tag no facet claims, most common
 *           first. This is the honesty valve: the curated lists are partial and
 *           this is where the rest stays visible.
 *   total:  how many distinct tags were considered.
 */
export function groupTags(counts, { minCount = 1 } = {}) {
  const rows = (counts || [])
    .map((c) => ({ name: String(c?.name || ''), count: Number(c?.count) || 0 }))
    .filter((c) => c.name && c.count >= minCount);
  // Most common first, ties by name so the order is stable across polls — a
  // dropdown that reshuffles under the cursor while a pass runs is unusable.
  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const buckets = new Map(TAG_FACETS.map((f) => [f.id, []]));
  const other = [];
  for (const row of rows) {
    const option = { name: row.name, label: label(row.name), count: row.count };
    const id = FACET_OF.get(row.name);
    if (id) buckets.get(id).push(option);
    else other.push(option);
  }
  const facets = TAG_FACETS
    .filter((f) => buckets.get(f.id).length > 0)
    .map((f) => ({ id: f.id, label: f.label, options: buckets.get(f.id) }));
  return { facets, other, total: rows.length };
}

/**
 * The tag list to send as `?tags=` — the selected value of each facet plus any
 * free-text picks, deduped and canonical.
 *
 * @param selected  {facetId: tagName} — '' / null means "no filter on this one".
 * @param extra     additional tag names (the All-tags list, the free-text box).
 */
export function selectedTags(selected, extra = []) {
  const out = [];
  const add = (tag) => {
    const name = String(tag || '').trim().toLowerCase();
    if (name && !out.includes(name)) out.push(name);
  };
  for (const id of Object.keys(selected || {})) add(selected[id]);
  for (const tag of extra || []) add(tag);
  return out;
}

/** The query value for `?tags=`, or '' when nothing is picked (so the caller can
 *  omit the parameter entirely rather than send an empty filter). */
export function tagsParam(selected, extra = []) {
  return selectedTags(selected, extra).join(',');
}
