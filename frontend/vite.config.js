import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { createTailwindConfig } from './tailwind.config.js'
import { privatePluginBuild, resolvePluginBuildMode } from './scripts/privatePluginBuild.mjs'

/* Bundled plugins live in the repository's `bundled/` directory, outside this
 * Vite root, one folder per plugin with both halves (docs/specs/
 * 2026-09-04-plugin-system-design.md §3). `@bundled` is how the frontend
 * reaches them: `src/plugins/bundled.js` globs `@bundled/*\/frontend/index.js`
 * at build time. The dev server must be told it may serve files from there —
 * its default allow-list stops at this package.json, because `.git` is a file
 * in a worktree and Vite's workspace detection does not climb past it. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLED_DIR = path.join(REPO_ROOT, 'bundled')
const SDK_DIR = path.join(REPO_ROOT, 'sdk', 'frontend')
const SDK_PACKAGE = JSON.parse(readFileSync(path.join(SDK_DIR, 'package.json'), 'utf8'))
const FORK_PLUGINS = JSON.parse(readFileSync(path.join(REPO_ROOT, 'fork-plugins.json'), 'utf8')).enabled
const FORK_ENTRY = '\0lds-fork-plugins'

/* A bundled plugin's screens import `react`, `lucide-react`… like any core
 * file, but they sit outside this package, and Node's resolver walks up from
 * bundled/<id>/frontend/ and finds no node_modules at all. `resolve.dedupe`
 * pins every dependency of this package to THIS copy, wherever the import
 * comes from — which is also what a plugin may use: the core's dependencies,
 * and nothing it would have to bring itself. */
const PKG = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const SHARED_DEPENDENCIES = Object.keys(PKG.dependencies || {})

/* Where `npm run dev` sends /api.
 *
 * This used to be the literal string below, hard-coded — and 127.0.0.1:5050 is
 * where the app you actually USE is listening. So a dev server started to try a
 * UI change drove the real install: every POST, every delete, every training
 * launch landed in real data. It worked, which is exactly the problem — nothing
 * ever said which backend was being talked to.
 *
 * The default is unchanged, so the habit ("npm run dev", hit :5173) still works.
 * Point it somewhere else with LDS_DEV_API_TARGET, in the shell or in
 * frontend/.env.local:
 *
 *     LDS_DEV_API_TARGET=http://127.0.0.1:5051 npm run dev
 *
 * Prefixed LDS_ rather than VITE_ on purpose: VITE_* variables are inlined into
 * the CLIENT bundle, and this is a dev-server setting that has no business
 * shipping in built output. */
const DEFAULT_DEV_API_TARGET = 'http://127.0.0.1:5050'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['LDS_'])
  const target = process.env.LDS_DEV_API_TARGET || env.LDS_DEV_API_TARGET
    || DEFAULT_DEV_API_TARGET
  const distribution = resolvePluginBuildMode(env)
  const storeBuild = distribution === 'store'
  return {
    plugins: [privatePluginBuild({ distribution }), react(), {
      name: 'lds-plugin-build-mode',
      enforce: 'pre',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'plugin-build.json',
          source: JSON.stringify({ schema_version: 1, distribution,
            ...(distribution === 'fork' ? { plugins: FORK_PLUGINS } : {}) }) })
      },
      // Replacing the module before Vite transforms its glob means store builds
      // never traverse plugin sources, even when those folders are present.
      resolveId(source, importer) {
        if (distribution === 'fork' && importer?.replaceAll('\\', '/').endsWith('/src/main.jsx')
            && source === './plugins/bundled') return FORK_ENTRY
        if (!storeBuild && importer?.replaceAll('\\', '/').endsWith('/src/main.jsx')
            && source === './plugins/bundled') return path.join(REPO_ROOT, 'frontend/src/plugins/bundledDevelopment.js')
        if (source === '@lds/plugin-sdk' || source.startsWith('@lds/plugin-sdk/')) {
          const key = source === '@lds/plugin-sdk' ? '.' : `.${source.slice('@lds/plugin-sdk'.length)}`
          if (!SDK_PACKAGE.exports[key]) throw new Error(`Unknown public LDS SDK export: ${source}`)
          return path.join(SDK_DIR, SDK_PACKAGE.exports[key])
        }
        return null
      },
      load(id) {
        if (id !== FORK_ENTRY) return null
        const imports = FORK_PLUGINS.map((pid, index) =>
          `import descriptor${index} from '@bundled/${pid}/frontend/index.js';\n`
          + `import manifest${index} from '@bundled/${pid}/plugin.json';`).join('\n')
        const registrations = FORK_PLUGINS.map((_pid, index) =>
          `if (registerDescriptor(descriptor${index}, { external: false, guideOwnership: manifest${index}.guide_ownership, pluginName: manifest${index}.name })) ids.push(descriptor${index}.id);`).join('\n')
        return `${imports}\nimport { registerDescriptor } from ${JSON.stringify(path.join(REPO_ROOT, 'frontend/src/plugins/registry.js').replaceAll('\\', '/'))};\n`
          + `export function registerBundledPlugins() { const ids = []; ${registrations} return ids; }`
      },
    }],
    base: '/',
    // Resolve the mode once, then give Tailwind that exact value. Its own
    // config loader otherwise cannot see Vite's custom --mode .env selection.
    css: { postcss: { plugins: [tailwindcss(createTailwindConfig(distribution)), autoprefixer()] } },
    resolve: {
      alias: { '@bundled': BUNDLED_DIR },
      dedupe: SHARED_DEPENDENCIES,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Index chunk exceeds default 500 kB; warning goes to stderr and
      // PowerShell Stop + 2>&1 turns it into a blank Gates failure.
      chunkSizeWarningLimit: 2000,
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      fs: { allow: [path.resolve('.'), SDK_DIR, ...(storeBuild ? [] : [BUNDLED_DIR])] },
      proxy: {
        '/api': target,
      },
    },
  }
})
