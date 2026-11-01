export const QUICK_SET_DEFAULTS = {
  engine: 'qwen21',
  turbo: true,
  targetCount: 30,
}

export function validateQuickSet({ files, trigger, name }) {
  const errors = []
  const count = files?.length || 0
  if (count < 1 || count > 2) errors.push('Use 1 or 2 images.')
  if (!String(trigger || '').trim()) errors.push('Enter a trigger word.')
  if (!String(name || '').trim()) errors.push('Enter a name.')
  return errors
}
