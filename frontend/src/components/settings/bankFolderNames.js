// Folder names the Bank passes skip (bank_processing.excluded_folder_names).
// PURE JS so node --test can import it.

/** "Reference, scratch,,review" -> ['reference', 'scratch', 'review'] */
export function splitFolderNames(text) {
  const out = []
  for (const part of String(text ?? '').split(',')) {
    const name = part.trim().replace(/^[\/]+|[\/]+$/g, '').toLowerCase()
    if (name && !/[\/]/.test(name) && !out.includes(name)) out.push(name)
  }
  return out
}

/** The saved list, else the server default, always an array. */
export function folderNamesValue(saved, fallback) {
  const value = saved ?? fallback
  if (Array.isArray(value)) return value
  return typeof value === 'string' ? splitFolderNames(value) : []
}
