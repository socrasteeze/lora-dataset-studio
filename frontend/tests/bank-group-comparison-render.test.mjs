import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from './support/mountJsx.mjs';
const { default: BankGroupComparison } = await import('../src/components/bank/BankGroupComparison.jsx');
const { default: BankCollectionsDialog } = await import('../src/components/bank/BankCollectionsDialog.jsx');
const workspace = readFileSync(new URL('../src/components/bank/BankWorkspace.jsx', import.meta.url), 'utf8');

test('large group comparison renders a bounded page with explicit framing and decisions', () => {
  const html = render(BankGroupComparison, { bankId: 1,
    group: { ids: Array.from({ length: 1000 }, (_, index) => index + 1), kind: 'style', title: 'Demo' },
    onClose() {}, onSaveCollection() {} });
  assert.equal((html.match(/<article\b/g) || []).length, 24);
  assert.match(html, /Different framings are not aligned/);
  assert.match(html, /Undecide/);
  assert.match(html, /✓ Keep/);
  assert.doesNotMatch(html, />Resolve Copies</);
  assert.doesNotMatch(html, /\/file\//);
});

test('duplicate comparison exposes explicit resolve and distinct controls', () => {
  const html = render(BankGroupComparison, { bankId: 1,
    group: { ids: [1, 2, 3], kind: 'exact', groupId: 1 }, onClose() {}, onSaveCollection() {} });
  assert.match(html, />Resolve Copies</);
  assert.match(html, />Mark Distinct</);
  assert.match(html, /Mark Distinct changes no image decisions/);
});

test('empty comparison and collection loading do not throw and retain clear controls', () => {
  const html = render(BankGroupComparison, { bankId: 1, group: { ids: [], kind: 'collection' }, onClose() {}, onSaveCollection() {} });
  assert.match(html, /This group has no members/);
  const collections = render(BankCollectionsDialog, { bankId: 1, initialIds: [], onClose() {}, onOpenGrid() {}, onCompare() {} });
  assert.match(collections, /Collections store membership only/);
  assert.match(collections, /New collection name/);
  assert.match(collections, /maxLength="128"|maxlength="128"/);
});

test('all Bank entry points are wired and collection dialogs own comparison keys', () => {
  assert.match(workspace, /onCompareGroup=\{/);
  assert.match(workspace, /onSaveCollection=\{/);
  assert.match(workspace, /suspended=\{collectionsOpen\}/);
  assert.match(workspace, /collection_id = String\(f\.collectionId\)/);
  assert.match(workspace, /collectionId: collection\.id, kind: 'collection'/);
});
