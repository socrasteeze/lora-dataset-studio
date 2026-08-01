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
  // The preview body stays EXCLUSION-FREE on purpose (asserted above): that
  // effect is debounced on `folder`, so exclusions there would mean a re-POST
  // per checkbox and a race between what is ticked and what is drawn. They ride
  // the create call only.
  assert.match(page, /postJson\('\/api\/bank\/split',\s*\n?\s*\{ folder, include_loose: includeLoose, exclude: normalizeExcluded\(excluded\) \}\)/);
  // The toggle and the loose-files option exist and default to including loose.
  assert.match(page, /One bank per subfolder/);
  assert.match(page, /useState\(true\)/);            // includeLoose defaults on
  assert.match(page, /Also make a bank from loose root images/);
});

test('the split preview lists every folder, striking out the excluded ones', () => {
  // Excluded rows STAY on the list struck through — a row that silently
  // vanished is indistinguishable from one the walk never found.
  assert.match(page, /splitPlanNow\.rows\.map/);
  assert.match(page, /r\.excluded \? 'line-through opacity-60' : ''/);
  assert.match(page, /Will create \{splitPlanNow\.bankCount\} bank\(s\)/);
});

test('exclusions reset when the folder changes', () => {
  // Names ticked off the previous folder would silently exclude whatever
  // happens to share a name under the new one.
  assert.match(page, /useEffect\(\(\) => \{ setExcluded\(new Set\(\)\) \}, \[folder\]\)/);
});

test('the all-excluded case is warned about BEFORE the click, not surfaced as a 400', () => {
  // The server's no-subfolder fallback imports the PARENT, which would recurse
  // into everything just excluded — it refuses instead, and the UI says which
  // of the two outcomes applies first.
  assert.match(page, /const splitWarning = allExcludedWarning\(splitPlanNow/);
  assert.match(page, /\{splitWarning && \(/);
});

// --- Queue ALL banks ---------------------------------------------------------
test('queue-all posts the queue route, never one pipeline per bank', () => {
  // The whole ask: they must QUEUE, not run at the same time. One request, one
  // entry per bank, drained one at a time by the untouched worker gate.
  assert.match(page, /postJson\('\/api\/bank-queue\/all', config\)/);
  assert.match(page, /⏳ Queue all \{queueAllCount\} bank\(s\)…/);
  assert.match(page, /One at a time on this machine — a bank sent to another one runs alongside it/);
});

test('queue-all confirms first, and the toast comes from the SERVER counts', () => {
  assert.match(page, /window\.confirm\(confirm\)/);
  assert.match(page, /queueAllResult\(await postJson\('\/api\/bank-queue\/all'/);
});

test("the 'all' scope has no run-now — with twelve banks there is no honest one", () => {
  // Both dialog actions land on queueAll in that scope. LaunchAllDialog itself
  // is untouched (ModalRefusalKeepsInput.contract.test.js depends on it), and
  // the handler names runNow/enqueue are kept for the assertions above.
  assert.match(page, /const runNow = async \(config\) => \{\s*\n\s*if \(dialogScope\?\.kind === 'all'\) return queueAll\(config\)/);
  assert.match(page, /const enqueue = async \(config\) => \{\s*\n\s*if \(dialogScope\?\.kind === 'all'\) return queueAll\(config\)/);
  assert.match(page, /setDialogScope\(\{ kind: 'bank', bankId: b\.id \}\)/);
});

test('a run whose passes were skipped is visible from the LIST', () => {
  // It was only ever shown inside the workspace, so an overnight queue that
  // skipped every GPU pass looked exactly like a clean night from here.
  assert.match(page, /<PipelineVerdictNote report=\{b\.pipeline_report\} \/>/);
  assert.match(page, /pipelineBadge\(pipelineReportVerdict\(report\)\)/);
  assert.match(page, /if \(!badge\) return null/);   // a clean run stays silent
});

test('the drained queue reports its outcome ONCE, never on a poll', () => {
  // GET /api/banks force-re-walks every source folder; one refresh per drain is
  // fine, a poll is not (see the setInterval assertion above).
  assert.match(page, /queueOutcomeLine\(/);
  assert.doesNotMatch(page, /setInterval\(refresh,/);
});

test('the queue panel says WHERE each bank runs and why it is waiting', () => {
  // snapshot() published device_id and waiting_for all along and the panel
  // dropped both: twelve banks queued to a peer looked byte-identical to twelve
  // local ones, and a queue stalled on a stuck GPU flag looked simply dead.
  // With a lane per machine, two "running" rows are otherwise indistinguishable.
  assert.match(page, /it\.device_label && \(/);
  assert.match(page, /on \{it\.device_label\}/);
  assert.match(page, /it\.state !== 'running' && it\.waiting_for/);
});
