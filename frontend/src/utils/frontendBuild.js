const ENTRY_PATH = /^\/assets\/index-[\w-]+\.js$/
const ENTRY_SCRIPT = /<script(?=\s)(?=[^>]*\stype\s*=\s*(?:"module"|'module'))[^>]*?\ssrc\s*=\s*(["'])(\/assets\/index-[\w-]+\.js)\1[^>]*>/i

export function hasNewFrontendBuild(html, currentEntry) {
  const nextEntry = html.match(ENTRY_SCRIPT)?.[2]
  return Boolean(nextEntry && ENTRY_PATH.test(currentEntry) && nextEntry !== currentEntry)
}
