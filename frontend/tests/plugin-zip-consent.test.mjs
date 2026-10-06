import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createElement, renderToStaticMarkup } from './support/mountJsx.mjs'

const { PluginInstallConsent } = await import('../src/pages/PluginsPage.jsx')

const consent = (over = {}) => ({
  manifest: { id: 'sample', name: 'Sample', version: '1.0.0', author: 'Ada', description: 'A tool' },
  install_dir: 'plugins/sample',
  can_install: false,
  compatibility_issues: [],
  ...over,
})

const html = (value) => renderToStaticMarkup(createElement(PluginInstallConsent, {
  consent: value,
  busy: false,
  onInstall: () => {},
  onCancel: () => {},
}))

const DEPENDENCY = 'sample requires captions. Install and enable that plugin first.'
const API = 'This plugin requires plugin API major 9; this app provides 1.'
const REFUSAL = 'This plugin cannot be installed in the current app configuration.'

function installButton(markup) {
  const tag = markup.match(/<button\b[^>]*>Install<\/button>/)
  assert.ok(tag, 'Install button missing')
  return tag[0]
}

function installIsDisabled(markup) {
  return /\sdisabled(?:=""|(?=[\s>]))/.test(installButton(markup))
}

test('compatibility issues are shown and Install stays disabled', () => {
  const markup = html(consent({
    compatibility_issues: [
      { code: 'dependency_unavailable', message: DEPENDENCY },
      { code: 'api_major', message: API },
    ],
  }))
  assert.match(markup, /sample requires captions\. Install and enable that plugin first\./)
  assert.match(markup, /This plugin requires plugin API major 9; this app provides 1\./)
  assert.equal(installIsDisabled(markup), true)
  assert.doesNotMatch(markup, /This plugin cannot be installed in the current app configuration\./)
})

test('a blocked install with no issue details shows the generic refusal', () => {
  const markup = html(consent())
  assert.match(markup, new RegExp(REFUSAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(installIsDisabled(markup), true)
})

test('an installable archive shows neither issue messages nor the generic refusal', () => {
  const markup = html(consent({ can_install: true, compatibility_issues: [] }))
  assert.doesNotMatch(markup, /sample requires captions/)
  assert.doesNotMatch(markup, /plugin API major/)
  assert.doesNotMatch(markup, /This plugin cannot be installed in the current app configuration\./)
  assert.equal(installIsDisabled(markup), false)
})

test('the Plugins page does not offer an archive install', () => {
  const page = readFileSync(new URL('../src/pages/PluginsPage.jsx', import.meta.url), 'utf8')
  assert.equal(page.includes('Install from a ZIP'), false)
  assert.equal(page.includes('accept=".ldsplugin,.zip'), false)
})
