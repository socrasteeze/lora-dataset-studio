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
import { bankFilterCount } from './bankFilterSummary.js';

const workspace = fs.readFileSync(
  new URL('./BankWorkspace.jsx', import.meta.url), 'utf8');
const setup = fs.readFileSync(
  new URL('../../pages/SetupPage.jsx', import.meta.url), 'utf8');
// The ML install tiles (including WD14's) moved out of SetupPage.jsx and into
// this data module — mlInstallCards.test.js pins every strip hint to a card
// here, and SetupPage.jsx now only renders the ML_INSTALL_CARDS import.
const mlCards = fs.readFileSync(
  new URL('../../components/setup/mlInstallCards.js', import.meta.url), 'utf8');

test('the tag pass posts no device — it only runs here', () => {
  assert.match(workspace, /startTags\s*=\s*\(\)\s*=>\s*act\(\(\)\s*=>\s*postJson\(`\/api\/bank\/\$\{bankId\}\/tags`,\s*\{\}\)/);
  // …unlike its neighbours (🖼 Framing among them), which no longer have their
  // own launcher at all — they go through the dialog's generic passBody(),
  // and that builder spreads on() FIRST, so every dialog-launched pass gets
  // device threading without asking for it individually.
  assert.match(workspace, /const passBody[\s\S]{0,600}?\.\.\.on\(\)/);
  // …and confirm 🖼 Framing actually takes that generic path rather than a
  // special case. Stated as the INVARIANT — the dispatch ends in a generic
  // `runPass(passOpen, run)` and 'framing' is not singled out above it —
  // rather than as one exact ternary chain. The chain grows a branch whenever
  // a pass gains its own launch controls (🔤 Find text added the third), and a
  // regex pinned to the old shape goes red on that addition while saying
  // nothing about the property it exists to guard.
  const dispatch =
    /onLaunch=\{\(run\) => \(([\s\S]{0,800}?): runPass\(passOpen, run\)\)+\}/.exec(workspace);
  assert.ok(dispatch, 'the pass dialog no longer falls through to runPass(passOpen, run)');
  assert.doesNotMatch(dispatch[1], /passOpen === 'framing'/);
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
  // cannot see — the bug the dups chip shipped once. Its own key (wd14_tags),
  // separate from the 🏷️ caption-chip `tags` param upstream added in the same wave.
  assert.match(workspace, /if \(f\.wd14Tags\?\.length\) params\.wd14_tags = f\.wd14Tags\.join\(','\)/);
});

test('an active tag filter counts as "filtered" in the N-shown readout', () => {
  // isFiltered is now derived from bankFilterSummary.js (one source shared
  // with the folded panel's header), rather than a hand-written boolean —
  // assert the wiring AND the behaviour, so a facet can't quietly drop out
  // of the count the way filter.wd14Tags never did the way filter.exclude and
  // filter.origin once did.
  assert.match(workspace, /const isFiltered = bankFilterCount\(filter, \{ labels: filterLabels \}\) > 0/);
  assert.equal(bankFilterCount({ wd14Tags: ['blonde_hair'] }), 1);
});

test('picking a facet value replaces that facet, not appends to it', () => {
  // Appending would turn "blonde, no wait, brown" into a filter for images that
  // are both — which match nothing and look like a broken grid.
  assert.match(workspace,
    /setFacetTag[\s\S]{0,300}?filter\.wd14Tags\.filter\(\(t\) => !facet\.options\.some/);
});

test('the Setup tile explains WHICH half of the install is missing', () => {
  // ✗ here means either "no onnxruntime" or "no model download", fixed in
  // different places — a bare "Not installed" would misdirect half the users.
  // The card's OWN detailKey lives in mlInstallCards.js; SetupPage.jsx renders
  // it generically for every card that has one.
  assert.match(mlCards, /detailKey: 'wd14_detail'/);
  assert.match(setup, /caps\[c\.detailKey\]/);
});

test('the tag pass keeps its own glyph, and no other step wears it', () => {
  // The collision this used to guard was 🏷️: Caption owned that glyph and the
  // tag pass had to take a different one. Upstream's icon sweep (2026-08-25)
  // took the glyphs off ITS passes and gave them lucide icons, so Caption is
  // now plain text — but 🔖 Tags is fork-only, has no icon assigned, and is
  // spelled that way in wd14Gate, bankPassCoverage and their tests. So the rule
  // that survives is the narrower one: 🔖 belongs to the tag pass alone, and
  // stripping it here would leave the button and this readout disagreeing.
  // STEP_SHORT moved out of BankWorkspace and into bankFacets.js with the Encre
  // redesign; the glyph rule travels with the map, not with the file.
  const facets = fs.readFileSync(new URL('./bankFacets.js', import.meta.url), 'utf8');
  assert.match(facets, /tags: '🔖 Tags'/);
  const stepShort = facets.slice(facets.indexOf('export const STEP_SHORT'));
  const owners = [...stepShort.matchAll(/(\w+): '🔖[^']*'/g)].map((m) => m[1]);
  assert.deepEqual(owners, ['tags']);
});
