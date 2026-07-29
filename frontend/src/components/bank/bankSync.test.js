import test from 'node:test';
import assert from 'node:assert/strict';
import { bankListSyncToast, folderSyncNote, folderSyncToast, forgetMissingConfirm } from './bankSync.js';

const clean = { added: 0, missing: 0, unavailable: false, error: null };

test('folderSyncToast: nothing added -> silent', () => {
  assert.equal(folderSyncToast(clean), null);
  assert.equal(folderSyncToast(null), null);
  assert.equal(folderSyncToast(undefined), null);
});

test('folderSyncToast: new files are announced (the counters must never move mutely)', () => {
  const t = folderSyncToast({ ...clean, added: 42 });
  assert.equal(t.type, 'success');
  assert.match(t.text, /42 new image\(s\)/);
});

test('folderSyncToast: a refusal (max files) surfaces as an error', () => {
  const t = folderSyncToast({ ...clean, error: 'the folder now holds more than 50000 images — the new files were not added' });
  assert.equal(t.type, 'error');
  assert.match(t.text, /were not added/);
});

test('bankListSyncToast: aggregates one line for the whole list', () => {
  assert.equal(bankListSyncToast([{ folder_sync: clean }, {}]), null);
  const one = bankListSyncToast([{ folder_sync: { ...clean, added: 3 } }, { folder_sync: clean }]);
  assert.match(one.text, /^3 new image\(s\) found in the folder/);
  const many = bankListSyncToast([
    { folder_sync: { ...clean, added: 3 } },
    { folder_sync: { ...clean, added: 4 } },
  ]);
  assert.match(many.text, /7 new image\(s\) found across 2 banks/);
});

test('folderSyncNote: in sync -> no note', () => {
  assert.equal(folderSyncNote(clean), null);
  assert.equal(folderSyncNote(null), null);
});

test('folderSyncNote: missing files are reported as KEPT, never deleted', () => {
  const n = folderSyncNote({ ...clean, missing: 7 });
  assert.equal(n.tone, 'warn');
  assert.match(n.text, /7 image\(s\)/);
  assert.match(n.text, /kept/);
});

test('folderSyncNote: an unavailable folder says the bank is intact', () => {
  const n = folderSyncNote({ ...clean, unavailable: true, missing: 0 });
  assert.equal(n.tone, 'error');
  assert.match(n.text, /unavailable/);
  assert.match(n.text, /keeps every image and decision/);
});

test('folderSyncNote: both off-sync states offer to repoint the bank', () => {
  // A folder that moved is the usual cause of BOTH shapes, and repointing is
  // the fix — the note is where the user is already looking, so it carries the
  // affordance instead of leaving them to hunt for it.
  for (const sync of [{ ...clean, unavailable: true }, { ...clean, missing: 7 }]) {
    const n = folderSyncNote(sync);
    assert.equal(n.canRelocate, true);
    assert.match(n.text, /new location/);
  }
  assert.equal(folderSyncNote(clean), null);
});

test('folderSyncNote: unavailable wins over a stale missing count', () => {
  assert.match(folderSyncNote({ ...clean, unavailable: true, missing: 900 }).text,
    /unavailable/);
});

/* ── accepting the loss, so the count can finally clear ────────────────────── */

test('missing files offer the ACCEPT route alongside the relocate one', () => {
  // The count never came down before: the walk is additive on purpose, so a file
  // deleted by hand was reported forever with nothing the user could do.
  const n = folderSyncNote({ missing: 4 });
  assert.equal(n.canForget, true);
  assert.equal(n.missing, 4);
  assert.match(n.text, /deleted them on purpose/);
  assert.equal(n.canRelocate, true, 'the moved-folder fix stays the first offer');
});

test('an UNAVAILABLE folder is never offered the accept — every row looks missing', () => {
  // The sharpest edge in the feature: with the drive unplugged, accepting would
  // delete the whole triage. The server refuses it too; this hides the button.
  const n = folderSyncNote({ unavailable: true });
  assert.equal(n.canForget, undefined);
  assert.equal(n.canRelocate, true);
});

test('the confirm names what is lost AND what is not touched', () => {
  const c = forgetMissingConfirm(4);
  assert.match(c, /Remove 4 missing/);
  assert.match(c, /decisions and scores are lost/);
  assert.match(c, /Nothing on disk is touched/);
  assert.match(c, /Move folder/, 'the non-destructive alternative is named');
});
