import { useCallback, useEffect, useRef, useState } from 'react';
import { readImportQueue, stageImportQueue, readImportFile, completeImportFile,
  discardImportQueue } from '../utils/importQueueStore.js';
import { inspectImportFiles } from '../utils/importFilePolicy.js';
import { planImportBatches, oversizedFilesMessage } from '../components/dataset/importBatches.js';
import { postForm } from '../api/fetchClient.js';

export function importQueueIdentityMatches(session, datasetId, instanceId) {
  return !!session && !!instanceId
    && String(session.datasetId) === String(datasetId)
    && session.instanceId === instanceId;
}

export async function uploadImportFile(datasetId, instanceId, crop, item, file) {
  const form = new FormData();
  form.append('files', file, item.name);
  form.append('crop', crop ? '1' : '0');
  form.append('import_key', item.key);
  form.append('dataset_instance_id', instanceId);
  const result = await postForm(`/api/dataset/${datasetId}/import`, form);
  if (!result?.ok) throw new Error(result?.error || 'Upload interrupted. Retry to continue.');
  return result;
}

export function useImportQueue(datasetId, { instanceId, refresh, toast }) {
  const [session, setSession] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [refused, setRefused] = useState([]);
  const active = useRef(null);
  const current = useRef(datasetId);
  const currentIdentity = useRef(instanceId);
  current.current = datasetId;
  currentIdentity.current = instanceId;

  useEffect(() => {
    let live = true;
    setSession(null); setError(''); setRefused([]); setRunning(false);
    if (datasetId && instanceId) readImportQueue(datasetId).then((saved) => {
      if (!live) return;
      setSession(saved);
      if (saved && !importQueueIdentityMatches(saved, datasetId, instanceId)) {
        setError('This saved upload belongs to a different dataset. Cancel it and select the files again.');
      }
    }).catch(() => { if (live) setError('Upload recovery storage is unavailable. Use a host folder or enable browser storage.'); });
    return () => { live = false; if (active.current) active.current.pause = true; };
  }, [datasetId, instanceId]);

  const run = useCallback(async (saved) => {
    if (active.current || !saved) return;
    if (!importQueueIdentityMatches(saved, datasetId, instanceId)) {
      setError('This saved upload belongs to a different dataset. Cancel it and select the files again.');
      return;
    }
    const task = { datasetId: saved.datasetId, pause: false };
    active.current = task;
    setRunning(true); setError('');
    try {
      let queue = await readImportQueue(saved.datasetId);
      while (queue?.id === saved.id && !task.pause) {
        const index = queue.items.findIndex((item) => !item.result);
        if (index < 0) break;
        const item = queue.items[index];
        const file = await readImportFile(item.key);
        if (!file) throw new Error('A queued file is missing from browser storage. Cancel the remaining queue and select those files again.');
        if (!importQueueIdentityMatches(queue, current.current, currentIdentity.current)) {
          throw new Error('This saved upload belongs to a different dataset. Cancel it and select the files again.');
        }
        const result = await uploadImportFile(
          queue.datasetId, queue.instanceId, queue.crop, item, file,
        );
        queue = await completeImportFile(queue.datasetId, queue.id, index, result);
        if (String(current.current) === saved.datasetId) setSession(queue);
        await refresh(saved.datasetId);
      }
    } catch (e) {
      if (String(current.current) === saved.datasetId) setError(`${e.message} Completed files are kept.`);
    } finally {
      active.current = null;
      if (String(current.current) === saved.datasetId) setRunning(false);
    }
  }, [datasetId, instanceId, refresh]);

  const start = useCallback(async (files, { crop = false, policy } = {}) => {
    if (active.current || !datasetId) return;
    if (!instanceId) {
      setError('Dataset identity is unavailable. Reload the dataset before importing.');
      return;
    }
    // Prevent a second picker/drop while originals are being persisted.
    const staging = { datasetId: String(datasetId), pause: false };
    active.current = staging; setRunning(true); setError(''); setRefused([]);
    let saved;
    try {
      const inspected = await inspectImportFiles(files);
      setRefused(inspected.refused);
      const { batches, oversized, limits } = planImportBatches(inspected.accepted, policy);
      if (oversized.length) toast.warning(oversizedFilesMessage(oversized, limits));
      const selected = batches.flat();
      if (!selected.length) return;
      saved = await stageImportQueue(datasetId, instanceId, selected, crop);
      if (String(current.current) === String(datasetId)) setSession(saved);
    } catch (e) {
      if (String(current.current) === String(datasetId)) setError(`Could not prepare a recoverable upload. Finish or cancel an existing queue, or free browser storage. ${e.message}`);
    } finally {
      active.current = null;
      if (String(current.current) === String(datasetId)) setRunning(false);
    }
    if (saved && !staging.pause) await run(saved);
  }, [datasetId, instanceId, run, toast]);

  const cancel = async () => {
    if (!session || running) return;
    try {
      await discardImportQueue(session.datasetId, session.id);
      setSession(null); setError('');
    } catch { setError('Could not remove the local queue. Retry when browser storage is available.'); }
  };
  return { session, running, error, refused, start,
    resume: () => run(session), pause: () => { if (active.current) active.current.pause = true; }, cancel };
}
