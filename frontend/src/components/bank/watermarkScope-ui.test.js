// Reads the image Bank TREE, not one file: the Encre redesign split the
// workspace into a top bar, a filter rail, a passes panel and the grid, and a
// wiring assertion must survive a move (see bankTreeSource.js).
import { bankTreeSource } from './bankTreeSource.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BANK_PASSES, passScopeRows } from './bankPasses.js';

const panel = fs.readFileSync(new URL('./BankWatermarkPanel.jsx', import.meta.url), 'utf8');
const picker = fs.readFileSync(new URL('../common/DevicePicker.jsx', import.meta.url), 'utf8');
const workspace = bankTreeSource();

test('level 1 delegates Find to the workspace launch dialog', () => {
  const findCardStart = panel.indexOf('<LevelCard index={1} title="Find Watermarks"');
  const cropCardStart = panel.indexOf('<LevelCard index={2}', findCardStart);
  assert.ok(findCardStart >= 0, 'the Level 1 Find card is missing');
  assert.ok(cropCardStart > findCardStart, 'the Level 1 card boundary is missing');

  const findCard = panel.slice(findCardStart, cropCardStart);
  assert.match(findCard, /onRun=\{onFind\}/,
    'Level 1 must call the onFind callback instead of launching a request itself');
  assert.doesNotMatch(findCard, /\brun\s*\(/,
    'Level 1 must not use the panel POST helper');
  assert.doesNotMatch(findCard, /\/api\/bank\/\$\{bankId\}\/watermark(?:[`'"?])/,
    'Level 1 must not post directly to the watermark endpoint');

  const panelCallStart = workspace.indexOf('<BankWatermarkPanel');
  const panelCallEnd = workspace.indexOf('/>', panelCallStart);
  assert.ok(panelCallStart >= 0 && panelCallEnd > panelCallStart,
    'the workspace watermark panel is missing');
  const panelCall = workspace.slice(panelCallStart, panelCallEnd);
  assert.match(panelCall, /onFind=\{\(\) => onPassOpen\('watermark'\)\}/,
    'the passes panel must open the shared watermark PassDialog');
  // through the workspace's own opener, so there is still ONE pass router.
  assert.match(workspace, /onPassOpen=\{setPassOpen\}/);
  assert.match(workspace, /\{passOpen && \(\s*<PassDialog passId=\{passOpen\}/,
    'passOpen must render the shared PassDialog');
});

test('Clean selected posts the checked IDs with the Level 3 engine and device', () => {
  assert.match(workspace, /onClick=\{cleanSelected\}\s+disabled=\{!selected\.size/);
  assert.match(workspace, /const cleanSelected = \(\) => \{[\s\S]*?postJson\(`\/api\/bank\/\$\{bankId\}\/watermark\/inpaint`, \{\s*clean_selected: true,\s*image_ids: \[\.\.\.selected\],\s*method: watermarkMethod,\s*device_id: watermarkDevice,/);
  assert.match(workspace, /method=\{watermarkMethod\} onMethodChange=\{onWatermarkMethod\}/);
  assert.match(workspace, /deviceId=\{watermarkDevice\} onDeviceChange=\{onWatermarkDevice\}/);
  assert.doesNotMatch(panel, /clean_selected/);
});

test('Clean selected confirms count, engine, replacement, and undo before posting', () => {
  const handler = workspace.slice(workspace.indexOf('const cleanSelected ='),
    workspace.indexOf('const importCaptionSidecars ='));
  assert.match(handler, /watermarkMethod === 'klein' \? 'Klein' : 'LaMa'/);
  assert.match(handler, /const count = selected\.size\.toLocaleString\(\)/);
  assert.match(handler, /if \(!window\.confirm\(`Clean \$\{count\}[^\n]+\$\{engine\}[^\n]*\n[^\n]*replaces source files in the Bank folder in place[^\n]*\.orig copy for Undo\.'\)\) return\s*return act\(\(\) => postJson/);
});

test('Watermarks uses equal-width single-line actions and aligned device pickers', () => {
  assert.match(panel, /grid grid-cols-2 gap-2/);
  assert.match(panel, /min-h-10 w-full whitespace-nowrap/);
  assert.match(panel, /<DevicePicker[^>]+contextLabel="Level 1 Scan"/);
  assert.match(panel, /<DevicePicker[^>]+contextLabel="Level 3 Inpaint"/);
  assert.doesNotMatch(panel, />Level [13] (Scan|Inpaint)</);
  assert.match(picker, /if \(devices == null\) return null[\s\S]*if \(!always && peers\.length === 0\) return null[\s\S]*grid-cols-\[6\.5rem_auto_minmax\(0,1fr\)\][\s\S]*\{contextLabel && <span/);
  assert.doesNotMatch(panel, /blurb=|already handled here|your original files are never modified|sourceNote/);
});

test('disabled actions and bin-only actions show their reason under the button', () => {
  assert.match(panel, /const message = state\.reason \|\| state\.note/);
  assert.match(panel, /<\/button>\s*\{message && <p[^>]*>\{message\}<\/p>\}/);
});

test('the watermark pass offers selection, all five scopes, and rescan', () => {
  const spec = BANK_PASSES.watermark;
  assert.ok(spec, 'the watermark pass spec is missing');
  assert.equal(spec.selection, true);
  assert.equal(spec.scopes, true);
  assert.deepEqual(passScopeRows('watermark').map(({ id }) => id),
    ['', 'keep', 'pending', 'reject', 'all']);
  assert.deepEqual(spec.redo && { key: spec.redo.key, label: spec.redo.label }, {
    key: 'rescan',
    label: 'Also re-check images that were already scanned',
  });
});

test('the watermark dialog reads the detector capability exposed by the backend', () => {
  const dialogStart = workspace.indexOf('<PassDialog passId={passOpen}');
  const dialogEnd = workspace.indexOf('>', dialogStart);
  assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, 'the shared PassDialog is missing');
  const dialogCall = workspace.slice(dialogStart, dialogEnd);
  assert.match(dialogCall, /detectorReady=\{!!caps\.watermark_detect\}/);
  assert.doesNotMatch(dialogCall, /watermark_detector/);
});
