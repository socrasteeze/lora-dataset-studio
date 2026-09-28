// Pending originals live only in this browser's IndexedDB. Completed files
// are released immediately; cancelling removes the remaining local copies.
let connection;
async function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('lds-dataset-imports', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('sessions', { keyPath: 'datasetId' });
      request.result.createObjectStore('files');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}

async function transact(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sessions', 'files'], mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Local upload storage failed.'));
    tx.onerror = () => {}; // The abort reports the final failure.
    action(tx.objectStore('sessions'), tx.objectStore('files'), (value) => { result = value; }, tx);
  });
}

export function readImportQueue(datasetId) {
  return transact('readonly', (sessions, files, done) => {
    sessions.get(String(datasetId)).onsuccess = (e) => done(e.target.result || null);
  });
}

export function stageImportQueue(datasetId, instanceId, selected, crop) {
  // getRandomValues also works on a protected LAN's plain HTTP origin.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (value) => value.toString(16).padStart(2, '0')).join('');
  const session = { datasetId: String(datasetId), instanceId, id, crop, state: 'paused',
    items: selected.map((file, index) => ({ key: `${id}_${index}`, name: file.name, size: file.size, result: null })) };
  return transact('readwrite', (sessions, files, done, tx) => {
    sessions.get(session.datasetId).onsuccess = (event) => {
      const old = event.target.result;
      if (old && old.items.some((item) => !item.result)) { tx.abort(); return; }
      sessions.put(session);
      selected.forEach((file, index) => files.put(file, session.items[index].key));
      done(session);
    };
  });
}

export function readImportFile(key) {
  return transact('readonly', (sessions, files, done) => {
    files.get(key).onsuccess = (e) => done(e.target.result || null);
  });
}

export function completeImportFile(datasetId, id, index, result) {
  return transact('readwrite', (sessions, files, done) => {
    sessions.get(String(datasetId)).onsuccess = (event) => {
      const current = event.target.result;
      if (!current || current.id !== id) { done(null); return; }
      current.items[index].result = result;
      files.delete(current.items[index].key);
      current.state = current.items.every((item) => item.result) ? 'complete' : 'paused';
      sessions.put(current);
      done(current);
    };
  });
}

export function discardImportQueue(datasetId, id) {
  return transact('readwrite', (sessions, files) => {
    sessions.get(String(datasetId)).onsuccess = (event) => {
      const current = event.target.result;
      if (!current || current.id !== id) return;
      current.items.forEach((item) => files.delete(item.key));
      sessions.delete(String(datasetId));
    };
  });
}
