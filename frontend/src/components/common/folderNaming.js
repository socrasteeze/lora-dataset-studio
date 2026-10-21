export const FOLDER_CATEGORIES = [
  ['character', 'Character (CHAR)'],
  ['style', 'Style (STYL)'],
  ['miscellaneous', 'Miscellaneous (MISC)'],
]

export function categoryForKind(kind) {
  return kind === 'style' ? 'style' : kind === 'concept' ? 'miscellaneous' : 'character'
}

export function folderPreview(name, category, app) {
  const prefix = { character: 'CHAR', style: 'STYL', miscellaneous: 'MISC' }[category]
  const ascii = String(name || '').normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toUpperCase()
  const words = ascii.match(/[A-Z0-9]+/g) || []
  const suffix = `_${app}####`
  const description = words.map((word) => word.slice(0, 4)).join('-') || 'DATA'
  return `${prefix}-${description.slice(0, 64 - 5 - suffix.length).replace(/-+$/, '')}${suffix}`
}

export function folderPathPreview(root, name, category, app) {
  const separator = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${folderPreview(name, category, app)}`
}
