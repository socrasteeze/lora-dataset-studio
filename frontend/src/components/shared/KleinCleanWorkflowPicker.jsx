import { useEffect, useState } from 'react';
import { apiFetch, putJson } from '../../api/fetchClient';
import { Select } from '../common/Controls.jsx';

export default function KleinCleanWorkflowPicker({ selected, onSelected, onSaved, disabled }) {
  const [workflows, setWorkflows] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch('/api/settings/klein-clean-workflows', { background: true })
      .then((data) => {
        if (!active) return;
        setWorkflows(data.workflows);
        onSelected(data.selected);
      })
      .catch(() => { if (active) setError('Could not load workflows. Reopen Watermarks to retry.'); });
    return () => { active = false; };
  }, [onSelected]);

  const save = async (path) => {
    setSaving(true);
    setError('');
    try {
      await putJson('/api/settings', { config: { watermark_clean: { custom_workflow: path } } });
      onSelected(path);
      onSaved();
    } catch {
      setError('Could not save the workflow. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-medium text-content">Klein Workflow</span>
        <Select className="w-full min-w-0 truncate" value={selected ?? ''}
          disabled={disabled || saving || workflows === null}
          onChange={(e) => save(e.target.value)}>
          <option value="">Built-in</option>
          {selected && !workflows?.some((workflow) => workflow.path === selected) && (
            <option value={selected} disabled>{selected.split(/[\\/]/).at(-1)}</option>
          )}
          {workflows?.map(({ path, label, valid, reason }) => (
            <option key={path} value={path} disabled={!valid}>
              {valid ? label : `${label} (${reason})`}
            </option>
          ))}
        </Select>
      </label>
      {error && <p role="status" className="mt-1 text-xs text-amber-300">{error}</p>}
    </div>
  );
}
