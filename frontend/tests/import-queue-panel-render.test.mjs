import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from './support/mountJsx.mjs';

const { default: ImportQueuePanel } = await import('../src/components/dataset/ImportQueuePanel.jsx');
const noop = () => {};
function queue(overrides = {}) {
  return { running: false, error: '', refused: [], resume: noop, pause: noop, cancel: noop,
    session: { items: [
      { key: 'one', name: 'one.png', result: { imported: 1, small: 1 } },
      { key: 'two', name: 'two.png', result: { duplicates: 1 } },
      { key: 'three', name: 'broken.png', result: { failed: 1 } },
      { key: 'four', name: 'pending.png', result: null },
    ] }, ...overrides };
}

test('partial progress retains failures by filename and duplicate/small-image warnings', () => {
  const html = render(ImportQueuePanel, { queue: queue() });
  assert.match(html, /3\/4 processed/);
  assert.match(html, /1 imported/);
  assert.match(html, /1 duplicates skipped/);
  assert.match(html, /broken.png/);
  assert.match(html, /small image/);
  assert.match(html, />Resume<\/button>/);
  assert.match(html, />Cancel Remaining<\/button>/);
});

test('an active request offers pause but cannot discard its recovery record', () => {
  const html = render(ImportQueuePanel, { queue: queue({ running: true }) });
  assert.match(html, />Pause After File<\/button>/);
  assert.match(html, /<button[^>]+disabled=""[^>]*>Cancel Remaining<\/button>/);
  assert.doesNotMatch(html, />Resume<\/button>/);
});

test('a stale queue reports the refusal without hiding its cancel action', () => {
  const html = render(ImportQueuePanel, { queue: queue({ error: 'This queue belongs to a previous dataset.' }) });
  assert.match(html, /role="alert"/);
  assert.match(html, /previous dataset/);
  assert.match(html, />Cancel Remaining<\/button>/);
});
