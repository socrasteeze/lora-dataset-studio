import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonPage, comparisonSelectionIds, COMPARISON_PAGE_SIZE, duplicateComparisonPaths, toggleComparisonSelection } from './groupComparison.js';

test('large groups are divided into bounded non-overlapping pages', () => {
  const ids = Array.from({ length: 2000 }, (_, index) => index + 1);
  const pages = [];
  for (let offset = 0; offset < ids.length; offset += COMPARISON_PAGE_SIZE) pages.push(comparisonPage(ids, offset));
  assert.ok(pages.every((page) => page.length <= 24));
  assert.deepEqual(pages.flat(), ids);
  assert.deepEqual(comparisonPage([], 0), []);
});

test('multiple keepers can be selected without altering the other candidates', () => {
  const initial = new Set();
  const first = toggleComparisonSelection(initial, 2);
  const second = toggleComparisonSelection(first, 5);
  assert.deepEqual([...second], [2, 5]);
  assert.equal(initial.size, 0);
  assert.deepEqual([...toggleComparisonSelection(second, 2)], [5]);
  assert.deepEqual([...second], [2, 5]);
});

test('manual additions survive a previous similarity ranking', () => {
  assert.deepEqual(comparisonSelectionIds(new Set([3, 1, 8]), [1, 2, 3]), [1, 3, 8]);
});

test('style, similarity, manual and collection comparisons have no duplicate resolution path', () => {
  for (const kind of ['style', 'similarity', 'selection', 'collection']) assert.equal(duplicateComparisonPaths(kind), null);
  assert.equal(duplicateComparisonPaths('exact').resolve, 'dups/resolve');
  assert.equal(duplicateComparisonPaths('semantic').distinct, 'semantic-dups/distinct');
});
