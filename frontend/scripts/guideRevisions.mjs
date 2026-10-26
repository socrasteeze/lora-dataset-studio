import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const CORE = {
  'getting-started': 'docs/guide/getting-started.md',
  'using-the-app': 'docs/guide/using-the-app.md',
  'dataset-guide': 'docs/DATASET_GUIDE.md',
  'settings-reference': 'docs/guide/settings-reference.md',
  troubleshooting: 'docs/guide/troubleshooting.md',
  'getting-help': 'docs/guide/getting-help.md',
}

/** Content revision dates come from Git, never the time of a build. */
export function guideRevisions(root, pluginIds) {
  const id = '\0virtual:guide-revisions'
  return {
    name: 'lds-guide-revisions',
    resolveId(source) { if (source === 'virtual:guide-revisions') return id },
    load(source) {
      if (source !== id) return null
      const files = { ...CORE }
      for (const plugin of pluginIds) {
        const file = `bundled/${plugin}/frontend/guide.js`
        if (existsSync(path.join(root, file))) files[`plugin:${plugin}`] = file
      }
      const revisions = {}
      for (const [key, file] of Object.entries(files)) {
        this.addWatchFile(path.join(root, file))
        const options = { cwd: root, encoding: 'utf8', windowsHide: true }
        const history = spawnSync('git', ['log', '-1', '--format=%cs', '--', file], options)
        const status = spawnSync('git', ['status', '--porcelain', '--', file], options)
        const date = history.status === 0 ? history.stdout.trim() : ''
        revisions[key] = {
          date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
          modified: status.status === 0 && !!status.stdout.trim(),
        }
      }
      return `export default ${JSON.stringify(revisions)}`
    },
  }
}
