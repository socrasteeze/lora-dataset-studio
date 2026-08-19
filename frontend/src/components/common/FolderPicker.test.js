import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const picker = fs.readFileSync(new URL('./FolderPicker.jsx', import.meta.url), 'utf8');
const bank = fs.readFileSync(new URL('../../pages/BankPage.jsx', import.meta.url), 'utf8');
const dsWorkspace = fs.readFileSync(
  new URL('../dataset/DatasetWorkspace.jsx', import.meta.url), 'utf8');

test('the field opens the in-app folder browser, not the desktop explorer', () => {
  const field = picker.slice(picker.indexOf('export default function FolderPickerField'));
  assert.match(field, /setBrowsing\(true\)/);
  assert.match(field, /<FolderBrowserModal/);
  assert.match(field, /📂 Browse/);
  assert.doesNotMatch(field, /📂 Browse…/);
  // Native pick-folder stays exported for other callers; the field itself
  // must not post it or the Create-bank Browse button opens Explorer.
  assert.doesNotMatch(field, /pickNativeFolder/);
  assert.match(picker, /\/api\/system\/list-folders/);
});

test('pickNativeFolder never throws on the expected no-desktop case', () => {
  // A network/endpoint failure degrades to available:false so a remaining
  // caller (dataset folder-import) can still fall back rather than error.
  assert.match(picker, /catch\s*\{\s*return \{ available: false/);
});

test('the path field stays editable (pasting a path still works)', () => {
  assert.match(picker, /onChange=\{\(e\) => onChange\(e\.target\.value\)\}/);
});

test('the in-app browser lists folders only and never writes', () => {
  // "Use this folder" is disabled at the drive roots (must descend into a dir),
  // and while the pick it already sent is in flight (ModalRefusalKeepsInput).
  assert.match(picker, /disabled=\{busy \|\| atRoot \|\| loading\}/);
  // Only the GET listing + the native POST are called — no mutating folder call.
  assert.doesNotMatch(picker, /\/api\/system\/(create|delete|write)/);
});

test('the Image bank uses the shared field for its folder input', () => {
  assert.match(bank, /import FolderPickerField from '\.\.\/components\/common\/FolderPicker'/);
  assert.match(bank, /<FolderPickerField[^>]*value=\{folder\}/s);
  // The bare <input id="bank-folder"> is gone (replaced by the field).
  assert.doesNotMatch(bank, /<input id="bank-folder"/);
});

test('dataset folder-import is native-first with the browser fallback', () => {
  assert.match(dsWorkspace,
    /import \{ pickNativeFolder, FolderBrowserModal \} from '\.\.\/common\/FolderPicker'/);
  assert.match(dsWorkspace, /await pickNativeFolder\(\)/);
  assert.match(dsWorkspace, /setFolderBrowseOpen\(true\)/);
  assert.match(dsWorkspace, /<FolderBrowserModal/);
  // the old blocking window.prompt path is gone
  assert.doesNotMatch(dsWorkspace, /window\.prompt\(\s*\n?\s*'Path of the dataset folder/);
});
