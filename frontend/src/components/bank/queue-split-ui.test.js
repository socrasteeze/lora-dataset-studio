import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dialog = fs.readFileSync(new URL('./LaunchAllDialog.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../../pages/BankPage.jsx', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('./BankQueuePanel.jsx', import.meta.url), 'utf8');

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
  assert.match(page, /postJson\('\/api\/bank-queue\/clear', \{ pending_only: true \}\)/); // clear waiting
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
  // The pressed button and the loose-files option exist and default to including loose.
  assert.match(page, /aria-pressed=\{splitMode\}/);
  assert.match(page, /aria-label="One bank per subfolder"/);
  assert.match(page, />\s*Subfolders\s*</);
  assert.match(page, /Enabled: create one bank for each top-level subfolder\. Select to disable\./);
  assert.match(page, /useState\(true\)/);            // includeLoose defaults on
  assert.match(page, /Include Loose Images/);
  const picker = page.indexOf('<FolderPickerField inline')
  const toggle = page.indexOf('aria-pressed={splitMode}')
  const create = page.indexOf('<Button type="submit"', toggle)
  assert.ok(picker >= 0 && picker < toggle && toggle < create,
    'Subfolders stays between Browse and Create in the creation row');
});

test('the bank list sort keeps its accessible name without a visible prefix', () => {
  assert.match(page, /<Select size="md" value=\{sort\}[\s\S]{0,120}aria-label="Sort the banks"/);
  assert.doesNotMatch(page, />\s*Sort\s*<Select/);
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
  assert.match(page, /⏳ Queue all \{queueAllCount\} bank\(s\)/);
  assert.match(page, /Banks run one at a time per machine; another machine runs its own queue alongside this one/);
  assert.doesNotMatch(page, /<span[^>]*>\s*One at a time on this machine/);
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
  // The panel moved out of BankPage.jsx into BankQueuePanel.jsx.
  assert.match(panel, /it\.device_label && \(/);
  assert.match(panel, /on \{it\.device_label\}/);
  assert.match(panel, /it\.state !== 'running' && it\.waiting_for/);
  assert.match(page, /<BankQueuePanel queue=\{queue\}/);
});

// --- Queue panel: Clear waiting / Stop running ------------------------------
test('the queue panel splits Clear all into Clear waiting and Stop running', () => {
  // One "Clear all" also cancelled the running pipeline, so tidying the line
  // stopped the bank mid-run. Each action now does one thing.
  assert.doesNotMatch(panel, />\s*Clear all\s*</);
  assert.match(panel, /\{waiting > 0 && \([\s\S]*?Clear waiting/);
  assert.match(panel, /\{running > 0 && \([\s\S]*?Stop running/);
  assert.match(page, /onClearWaiting=\{clearWaiting\} onStopRunning=\{stopRunning\}/);
});

test('both destructive queue actions, and the running row ✕, ask first', () => {
  // window.confirm is the app's confirm pattern (queue-all, remove bank).
  assert.match(page, /const ask = clearWaitingConfirm\(queue\)\s*if \(!ask \|\| !window\.confirm\(ask\)\) return/);
  assert.match(page, /const ask = stopRunningConfirm\(queue, nameOf\)\s*if \(!ask \|\| !window\.confirm\(ask\)\) return/);
  // The ✕ refetches first. A waiting row that started during the 2 s poll
  // asks the running-row question; a row that is still waiting asks nothing.
  assert.match(page, /live = await apiFetch\('\/api\/bank-queue'\)/);
  assert.match(page, /const ask = removeQueuedConfirm\(live, nameOf, id\)/);
  assert.match(page, /if \(ask && !window\.confirm\(ask\)\) return/);
  // Stop running uses the per-entry cancel, one per running entry (one per machine).
  assert.match(page, /for \(const it of runningItems\(queue\)\)[\s\S]{0,80}del\(`\/api\/bank-queue\/\$\{it\.bank_id\}`\)/);
});

test('hovering, focusing or pressing a queue row tints the WHOLE row', () => {
  // The ✕ sits at the far end of the row; the tint ties it to its bank.
  const row = panel.match(/const ROW = ([^\n]*\n[^\n]*\n[^\n]*)/);
  assert.ok(row, 'the row class constant was not found');
  for (const cls of ['group', 'hover:bg-surface-raised', 'focus-within:bg-surface-raised',
    'active:bg-surface-raised', 'has-[:active]:bg-surface-raised']) {
    assert.ok(row[1].includes(cls), `the row is missing ${cls}`);
  }
  assert.match(panel, /<li key=\{it\.bank_id\} className=\{ROW\}>/);
  assert.match(panel, /group-hover:text-content/);
});

test('queue buttons are finger-sized below lg and the ✕ names its bank', () => {
  assert.match(panel, /const ACTION = 'min-h-10 lg:min-h-0 /);
  assert.match(panel, /inline-flex min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 shrink-0/);
  assert.match(panel, /`Remove \$\{nameOf\(it\.bank_id\)\} from queue`/);
  assert.match(panel, /`Stop \$\{nameOf\(it\.bank_id\)\} and remove it from queue`/);
  // 360 px: the name and its chips wrap inside the row instead of pushing the ✕ off.
  assert.match(panel, /flex min-w-0 grow flex-wrap items-center/);
});
