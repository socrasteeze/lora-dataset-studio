import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('./DatasetListPanel.jsx', import.meta.url), 'utf8');

test('the dataset library toolbar uses a frosted sticky layer below the app header', () => {
  const toolbar = panel.match(/<div className="([^"]+)">\s*<h1 className="sr-only">Datasets<\/h1>/);
  assert.ok(toolbar, 'find the toolbar containing the Datasets heading');
  const classes = toolbar[1].split(/\s+/);

  assert.ok(classes.includes('sticky'));
  assert.ok(classes.includes('top-[var(--app-header-h)]'));
  assert.ok(classes.includes('z-30'));
  // The background owns the blur so the toolbar cannot rebase fixed dialogs.
  assert.ok(classes.includes('before:bg-surface-overlay/85'));
  assert.ok(classes.includes('before:backdrop-blur-md'));
  assert.ok(!classes.some((name) => name.startsWith('backdrop-')));
});
