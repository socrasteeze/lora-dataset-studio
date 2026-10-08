import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAG_FACETS, facetMenuState, facetOf, groupTags, label, selectedTags, tagsParam,
  toggleWd14Tag, wd14TagsParam,
} from './bankTagFacets.js';

const counts = (pairs) => pairs.map(([name, count]) => ({ name, count }));

test('a tag belongs to at most one facet', () => {
  // Two facets claiming one tag would double it in the UI and make the "does
  // this fall through to All tags?" test depend on declaration order.
  const seen = new Map();
  for (const facet of TAG_FACETS) {
    for (const tag of facet.tags) {
      assert.equal(seen.has(tag), false,
        `${tag} is claimed by both ${seen.get(tag)} and ${facet.id}`);
      seen.set(tag, facet.id);
    }
  }
});

test('facet ids and labels are unique', () => {
  assert.equal(new Set(TAG_FACETS.map((f) => f.id)).size, TAG_FACETS.length);
  assert.equal(new Set(TAG_FACETS.map((f) => f.label)).size, TAG_FACETS.length);
});

test('groupTags: known tags land in their facet, unknown ones stay visible', () => {
  const { facets, other } = groupTags(counts([
    ['blonde_hair', 30], ['shirt', 12], ['a_tag_nobody_curated', 5],
  ]));
  const byId = Object.fromEntries(facets.map((f) => [f.id, f.options.map((o) => o.name)]));
  assert.deepEqual(byId.hair_color, ['blonde_hair']);
  assert.deepEqual(byId.top, ['shirt']);
  // The honesty valve: the curated lists are partial, so nothing is dropped.
  assert.deepEqual(other.map((o) => o.name), ['a_tag_nobody_curated']);
});

test('groupTags: only facets with something in THIS bank are offered', () => {
  const { facets } = groupTags(counts([['blonde_hair', 3]]));
  assert.deepEqual(facets.map((f) => f.id), ['hair_color']);
});

test('groupTags: options are most-common first, ties broken by name', () => {
  const { facets } = groupTags(counts([
    ['black_hair', 5], ['blonde_hair', 40], ['brown_hair', 5],
  ]));
  assert.deepEqual(facets[0].options.map((o) => o.name),
    ['blonde_hair', 'black_hair', 'brown_hair']);
});

test('groupTags: the order is stable, so a dropdown cannot reshuffle mid-poll', () => {
  const rows = counts([['black_hair', 5], ['brown_hair', 5], ['blonde_hair', 5]]);
  const first = groupTags(rows).facets[0].options.map((o) => o.name);
  const again = groupTags([...rows].reverse()).facets[0].options.map((o) => o.name);
  assert.deepEqual(first, again);
});

test('groupTags: minCount trims the long tail without inventing a cap', () => {
  const rows = counts([['blonde_hair', 40], ['brown_hair', 1]]);
  assert.equal(groupTags(rows).facets[0].options.length, 2);          // default keeps all
  assert.equal(groupTags(rows, { minCount: 5 }).facets[0].options.length, 1);
});

test('groupTags: junk in does not throw', () => {
  assert.deepEqual(groupTags(null), { facets: [], other: [], total: 0 });
  assert.deepEqual(groupTags([{ name: '', count: 9 }, { count: 3 }, null]).total, 0);
});

test('label() only changes what is DISPLAYED', () => {
  assert.equal(label('blonde_hair'), 'blonde hair');
  // …and the stored/queried name is untouched by the grouping.
  const { facets } = groupTags(counts([['blonde_hair', 1]]));
  assert.equal(facets[0].options[0].name, 'blonde_hair');
  assert.equal(facets[0].options[0].label, 'blonde hair');
});

test('facetOf: unknown tags have no facet', () => {
  assert.equal(facetOf('blonde_hair'), 'hair_color');
  assert.equal(facetOf('something_else'), null);
  assert.equal(facetOf(null), null);
});

test('selectedTags: empty picks are dropped, values are canonical and deduped', () => {
  assert.deepEqual(
    selectedTags({ hair_color: 'Blonde_Hair', top: '', eye_color: null }, [' shirt ', 'shirt']),
    ['blonde_hair', 'shirt']);
  assert.deepEqual(selectedTags({}, []), []);
  assert.deepEqual(selectedTags(null), []);
});

test('tagsParam: nothing picked is an empty string, so the caller can omit it', () => {
  assert.equal(tagsParam({ hair_color: '' }), '');
  assert.equal(tagsParam({ hair_color: 'blonde_hair', top: 'shirt' }), 'blonde_hair,shirt');
});

test('wd14TagsParam ORs one facet and ANDs different facets', () => {
  assert.equal(wd14TagsParam([]), '');
  assert.equal(wd14TagsParam(null), '');
  // Hair is declared before Top, so the group order does not follow the clicks.
  assert.equal(wd14TagsParam(['shirt', 'blonde_hair']), 'blonde_hair,shirt');
  // Inside one facet the click order is the OR order.
  assert.equal(wd14TagsParam(['brown_hair', 'blonde_hair']), 'brown_hair|blonde_hair');
  assert.equal(
    wd14TagsParam(['shirt', 'brown_hair', 'blonde_hair']),
    'brown_hair|blonde_hair,shirt');
  // A tag no facet claims stays its own AND term.
  assert.equal(wd14TagsParam(['blonde_hair', 'A_Custom']), 'blonde_hair,a_custom');
  assert.equal(wd14TagsParam(['blonde_hair', 'Blonde_Hair']), 'blonde_hair');
});

test('toggleWd14Tag adds a second value in the same facet and removes on the next click', () => {
  assert.deepEqual(toggleWd14Tag(['blonde_hair'], 'brown_hair'), ['blonde_hair', 'brown_hair']);
  assert.deepEqual(toggleWd14Tag(['blonde_hair', 'brown_hair'], 'blonde_hair'), ['brown_hair']);
  assert.deepEqual(toggleWd14Tag(['shirt'], 'blonde_hair'), ['shirt', 'blonde_hair']);
});

test('facetMenuState counts picks in menu order', () => {
  const facet = groupTags(counts([
    ['brown_hair', 2], ['blonde_hair', 9],
  ])).facets[0];
  assert.deepEqual(facetMenuState(facet, []), { count: 0, title: '' });
  assert.deepEqual(facetMenuState(facet, ['brown_hair', 'blonde_hair']), {
    count: 2, title: 'blonde hair, brown hair',
  });
});
