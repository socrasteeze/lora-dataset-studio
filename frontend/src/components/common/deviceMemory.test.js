/* The remembered "Run on" choice is PER KIND.
 *
 * One key was shared by every picker, and the surfaces disagree about what is
 * eligible — a ComfyUI backend picked for Klein is not offerable for a bank
 * pass. That already cost a reconciliation effect (a dialog showing "this
 * machine" while posting a peer). It became untenable when the bank workspace
 * grew a second picker: a bank-pass one for the Analyze row alongside the
 * comfy one for the inpaint engine, on the same screen, overwriting each other.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

function withStorage(initial) {
  const store = new Map(Object.entries(initial || {}));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  return store;
}

test('two kinds remember two different machines', async () => {
  const store = withStorage();
  const { loadSavedDeviceId, saveDeviceId } = await import('./deviceMemory.js');
  saveDeviceId('peer-1', 'bank-pass');
  saveDeviceId('api:abc', 'comfy');
  assert.equal(loadSavedDeviceId('bank-pass'), 'peer-1');
  assert.equal(loadSavedDeviceId('comfy'), 'api:abc',
    'one picker overwrote the other — a Klein backend would decide where a bank pass ran');
  assert.equal(store.get('lds.cluster.device_id.bank-pass'), 'peer-1');
});

test('a choice made before the split is still honoured', async () => {
  // The old key holds a real decision. Dropping it would silently reset
  // everyone to "this machine" — a stored key is never renamed without one.
  withStorage({ 'lds.cluster.device_id': 'peer-9' });
  const { loadSavedDeviceId } = await import('./deviceMemory.js');
  assert.equal(loadSavedDeviceId('bank-pass'), 'peer-9');
  assert.equal(loadSavedDeviceId('comfy'), 'peer-9');
});

test('a kind with its own value ignores the legacy key', async () => {
  withStorage({ 'lds.cluster.device_id': 'peer-9',
    'lds.cluster.device_id.bank-pass': 'peer-2' });
  const { loadSavedDeviceId } = await import('./deviceMemory.js');
  assert.equal(loadSavedDeviceId('bank-pass'), 'peer-2');
});

test('nothing saved anywhere is this machine', async () => {
  withStorage();
  const { loadSavedDeviceId } = await import('./deviceMemory.js');
  assert.equal(loadSavedDeviceId('bank-pass'), 'local');
});
