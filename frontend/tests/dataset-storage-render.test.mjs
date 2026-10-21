import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, render } from './support/mountJsx.mjs';

const { MemoryRouter } = await import('react-router');

const { default: PromoteDialog } = await import('../src/components/bank/PromoteDialog.jsx');
const { default: DatasetListPanel } = await import('../src/components/dataset/DatasetListPanel.jsx');
const { default: StorageSection } = await import('../src/components/settings/StorageSection.jsx');

test('Bank promotion links to dataset storage without discarding the open form', () => {
  const html = render(PromoteDialog, {
    bankId: 1, bankName: 'Example', selectedIds: [], onClose() {}, onStarted() {},
  });
  assert.match(html, /href="#\/settings\/storage\?focus=dataset-images-root"/);
  assert.match(html, /target="_blank" rel="noreferrer"/);
  assert.match(html, /Dataset Location/);
});

test('manual creation exposes the same storage setting in a separate tab', () => {
  const html = render(() => createElement(MemoryRouter, null,
    createElement(DatasetListPanel, { datasets: [], onCreate() {} })));
  assert.match(html, /href="#\/settings\/storage\?focus=dataset-images-root"/);
  assert.match(html, /target="_blank" rel="noreferrer"/);
  assert.match(html, /Dataset Location/);
});

test('Storage renders a labeled path with Browse and explicit validation', () => {
  const html = render(StorageSection, {
    config: { paths: {} }, configDefaults: { paths: {} },
    setField() {}, saveConfigPatch() {},
  });
  assert.match(html, /for="dataset-images-root"/);
  assert.match(html, /id="dataset-images-root"/);
  assert.match(html, />Browse<|>\s*Browse\s*</);
  assert.match(html, /Check Folder/);
    assert.match(html, /category, abbreviated name and number/);
});
