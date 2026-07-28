import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dialog = fs.readFileSync(new URL('./LaunchAllDialog.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../../pages/BankPage.jsx', import.meta.url), 'utf8');

// --- Launch-all dialog: the new "Add to queue" action ------------------------
test('the launch dialog exposes an onQueue action alongside Run now', () => {
  assert.match(dialog, /function LaunchAllDialog\(\{[^}]*onQueue[^}]*\}/);
  // Both actions send the SAME config shape (built once).
  assert.match(dialog, /const config = \(\) =>/);
  // launch is async since the refusal-keeps-input wave (it posts with the dialog
  // open and only closes on success); queue is still the plain call. Both must
  // keep sending config() rather than re-building the body separately.
  assert.match(dialog, /attemptModalSubmit\(\(\) => onLaunch\(config\(\)\)/);
  assert.match(dialog, /const queue = \(\) => onQueue\(config\(\)\)/);
  // The button only renders when an onQueue handler is provided.
  assert.match(dialog, /\{onQueue &&[\s\S]*?Add to queue/);
});

// --- Banks page: cross-bank queue wiring ------------------------------------
test('the banks page enqueues, polls, cancels and clears the queue', () => {
  assert.match(page, /postJson\(`\/api\/bank\/\$\{id\}\/queue`/);          // add
  assert.match(page, /apiFetch\('\/api\/bank-queue'\)/);                    // poll snapshot
  assert.match(page, /del\(`\/api\/bank-queue\/\$\{id\}`\)/);               // cancel one
  assert.match(page, /postJson\('\/api\/bank-queue\/clear'/);              // clear all
  // The queue is polled on an interval while on the list page.
  assert.match(page, /setInterval\(refreshQueue, 2000\)/);
});

test('a queued/running bank is badged from the polled queue snapshot', () => {
  // Derived from the cheap /api/bank-queue poll, NOT from re-fetching /api/banks:
  // that route force-re-walks every source folder (upstream's folder sync), which
  // must stay a navigation-time action, never a 2 s poll. queue_state on the row
  // is only the first-paint fallback.
  assert.match(page, /const queueStateOf = \(bank\) =>/);
  assert.match(page, /queue\?\.items\?\.find\(\(i\) => i\.bank_id === bank\.id\)/);
  assert.match(page, /bank\.queue_state/);
  assert.match(page, /qs\.state === 'running'/);
  assert.match(page, /queued · #\$\{qs\.position\}/);
  // The bank cards are NOT on an interval; only the queue snapshot is.
  assert.doesNotMatch(page, /setInterval\(refresh,/);
});

test('run-now from the list posts the pipeline, add-to-queue posts the queue', () => {
  assert.match(page, /postJson\(`\/api\/bank\/\$\{id\}\/pipeline`, config\)/);
  assert.match(page, /onLaunch=\{runNow\} onQueue=\{enqueue\}/);
});

// --- Banks page: one-bank-per-subfolder split -------------------------------
test('split mode previews and creates one bank per subfolder', () => {
  assert.match(page, /postJson\('\/api\/bank\/split\/preview', \{ folder \}\)/);  // live preview
  assert.match(page, /postJson\('\/api\/bank\/split', \{ folder, include_loose: includeLoose \}\)/);
  // The toggle and the loose-files option exist and default to including loose.
  assert.match(page, /One bank per subfolder/);
  assert.match(page, /useState\(true\)/);            // includeLoose defaults on
  assert.match(page, /Also make a bank from loose root images/);
});

test('the split preview lists subfolders and flags skipped loose files', () => {
  assert.match(page, /preview\.subfolders\.map/);
  assert.match(page, /preview\.loose_root_count/);
  assert.match(page, /includeLoose \? '' : 'line-through/);
});
