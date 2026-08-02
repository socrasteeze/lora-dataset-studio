/* 🔖 Tag pass — the wiring that the pure modules cannot cover.
 *
 * Source-level contract assertions, the same shape as the other *-ui tests here.
 * Each one pins a decision that is invisible in a rendered screenshot and would
 * regress silently:
 *   • the pass posts NO device — it is local-only, so offering one asks for a 400;
 *   • the facet vocabulary is fetched on the tagged COUNT, not on the 2 s poll;
 *   • the tag filter reaches fetchAllIds, so "Select all in filter" and ▶ Review
 *     stay scoped to what the user is looking at;
 *   • the Setup tile shows the server's own ✗ reason.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspace = fs.readFileSync(
  new URL('./BankWorkspace.jsx', import.meta.url), 'utf8');
const setup = fs.readFileSync(
  new URL('../../pages/SetupPage.jsx', import.meta.url), 'utf8');

test('the tag pass posts no device — it only runs here', () => {
  assert.match(workspace, /startTags\s*=\s*\(\)\s*=>\s*act\(\(\)\s*=>\s*postJson\(`\/api\/bank\/\$\{bankId\}\/tags`,\s*\{\}\)/);
  // …unlike its neighbours, which pass on().
  assert.match(workspace, /startFraming[\s\S]{0,120}?on\(\)/);
});

test('the facet vocabulary is fetched on the tagged count, not on the payload poll', () => {
  // The bank payload is polled every 2 s while a pass runs. Tallying tags across
  // 9 000 rows on that tick would be paid over and over for an answer that only
  // moves when the pass advances.
  assert.match(workspace, /tags\/facets/);
  assert.match(workspace, /\}, \[bankId, taggedCount\]\)/);
});

test('the tag filter is part of filterParams, so it reaches Select-all and Review', () => {
  // filterParams feeds BOTH the grid page and fetchAllIds. A filter that only
  // reached the grid would make "Select all in filter" hand back rows the user
  // cannot see — the bug the dups chip shipped once.
  assert.match(workspace, /if \(f\.tags\?\.length\) params\.tags = f\.tags\.join\(','\)/);
});

test('an active tag filter counts as "filtered" in the N-shown readout', () => {
  const m = workspace.match(/const isFiltered = !!\([\s\S]{0,260}?\)\n/);
  assert.ok(m, 'found the isFiltered expression');
  assert.match(m[0], /filter\.tags\?\.length/);
});

test('picking a facet value replaces that facet, not appends to it', () => {
  // Appending would turn "blonde, no wait, brown" into a filter for images that
  // are both — which match nothing and look like a broken grid.
  assert.match(workspace,
    /setFacetTag[\s\S]{0,300}?filter\.tags\.filter\(\(t\) => !facet\.options\.some/);
});

test('the Setup tile explains WHICH half of the install is missing', () => {
  // ✗ here means either "no onnxruntime" or "no model download", fixed in
  // different places — a bare "Not installed" would misdirect half the users.
  assert.match(setup, /detailKey: 'wd14_detail'/);
  assert.match(setup, /caps\[c\.detailKey\]/);
});

test('the tag pass wears its own glyph, not the caption one', () => {
  // This app uses emoji AS controls, so two passes sharing 🏷️ is a real
  // collision; 🏷️ Caption is the older, documented owner of that glyph.
  assert.match(workspace, /tags: '🔖 Tags'/);
  assert.match(workspace, /caption: '🏷️ Caption'/);
});
