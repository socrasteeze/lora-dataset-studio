import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Self-hosted, bundled into dist (fork Divergence 12): a page load contacts no
// font CDN. Same families and weights index.html once fetched from Google Fonts.
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import { registerBundledPlugins } from './plugins/bundled'
import { loadPlugins } from './plugins/loadPlugins'
import { configureHostRuntime } from './plugins/runtimeHost.jsx'
import { hasUnsavedWork } from './hooks/useUnsavedWork.js'
import { hasNewFrontendBuild } from './utils/frontendBuild.js'

// Plugins first, then React: a plugin's nav entry, route or panel has to be
// in the registry BEFORE the first render, exactly like a bundled one —
// loadPlugins never rejects, so a plugin that fails to load costs a line on
// the Plugins page, never the app. Legacy entries join the same loader.
configureHostRuntime()
registerBundledPlugins()

if (!import.meta.env.DEV) {
  let lastBuildCheck = -Infinity

  async function checkFrontendBuild() {
    const now = Date.now()
    if (now - lastBuildCheck < 60_000) return
    lastBuildCheck = now

    try {
      const entry = document.querySelector('script[type="module"][src^="/assets/index-"]')?.getAttribute('src')
      if (!entry) return

      const response = await fetch('/', { cache: 'no-store' })
      if (response.ok && hasNewFrontendBuild(await response.text(), entry) && !hasUnsavedWork()) {
        window.location.reload()
      }
    } catch {
      // A failed update check must leave the current page usable.
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkFrontendBuild()
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void checkFrontendBuild()
  })
}

function mount() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

loadPlugins().then(mount, mount)
