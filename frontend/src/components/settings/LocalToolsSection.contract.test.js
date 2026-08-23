import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./LocalToolsSection.jsx', import.meta.url), 'utf8')
const primitives = readFileSync(
  new URL('./primitives.jsx', import.meta.url), 'utf8')
const settingsPage = readFileSync(
  new URL('../../pages/SettingsPage.jsx', import.meta.url), 'utf8')
// DIVERGENCE 4 — upstream spans TrainingPanel.jsx + CloudLaunchDialog.jsx here,
// because slice 1 moved the cloud dialog's token notices out of the panel. This
// fork does not carry that module (it is the rented-GPU launch dialog), so the
// panel alone is still the whole surface this contract is about.
const trainingPanel = readFileSync(
  new URL('../dataset/TrainingPanel.jsx', import.meta.url), 'utf8')

function handleSaveSource() {
  const start = settingsPage.indexOf('  const handleSave = async () => {')
  const end = settingsPage.indexOf('\n  // Dirty =', start)
  assert.ok(
    start >= 0 && end > start,
    'SettingsPage handleSave is present and bounded by the dirty-state section',
  )
  return settingsPage.slice(start, end)
}


test('classic Hugging Face token links directly to read-token creation', () => {
  const classicTokenGuide = source.match(
    /<a\b[^>]*>\s*Create a read token on Hugging Face ↗\s*<\/a>/)
  assert.ok(classicTokenGuide, 'the classic Hugging Face token guide link is present')
  assert.match(classicTokenGuide[0], /href="https:\/\/huggingface\.co\/settings\/tokens\/new\?tokenType=read"/)
  assert.match(classicTokenGuide[0], /target="_blank"/)
  assert.match(classicTokenGuide[0], /rel="noreferrer"/)
})





test('HF validation results expose success, warning, and error without relying on color', () => {
  assert.match(primitives, /result\.severity === 'warning' \|\| result\.code === 'broad_access'/)
  assert.match(primitives, /success: \{ glyph: '\\u2713'.*text-emerald-400/)
  assert.match(primitives, /warning: \{ glyph: '\\u26A0'.*text-amber-400/)
  assert.match(primitives, /error: \{ glyph: '\\u2717'.*text-rose-400/)
  assert.match(primitives, /role=\{level === 'error' \? 'alert' : 'status'\}/)
  assert.match(primitives, /<span className="sr-only">\{presentation\.label\}: <\/span>\{detail\}/)
})

/* Divergence 4: upstream ships a dedicated HF_CLOUD_TOKEN secret field, with a
   PUT-time validation round-trip, for delivering a full-model Krea 2 run's
   weights off a rented pod. There is no such lane here, so the field is removed
   rather than left as an input that validates against a route the user can never
   reach. These assertions replace upstream's four, which pinned it in place —
   it reached the SERVED BUNDLE on this sync and only a diff of dist against the
   pre-merge bundle caught it. */
test('there is no cloud full-model token field or validation round-trip', () => {
  assert.doesNotMatch(source, /HF_CLOUD_TOKEN/)
  assert.doesNotMatch(source, /hf_cloud/)
  assert.doesNotMatch(settingsPage, /HF_CLOUD_TOKEN|submittedCloudToken/)
})

/* Divergence 4: upstream's full-model lane delivers its weights to Hugging Face
   from a rented pod, and this contract pins the HF_CLOUD_TOKEN guidance beside it.
   Neither exists here, so the honest assertion is the ABSENCE of that copy — and
   it fails loudly if a future sync brings the token panel back. */
test('there is no cloud full-model token panel to describe', () => {
  assert.doesNotMatch(trainingPanel, /HF_CLOUD_TOKEN/)
  assert.doesNotMatch(trainingPanel, /fine-grained token is recommended/)
})
test('focus=HF_CLOUD_TOKEN lands on the secret input id', () => {
  assert.match(primitives, /id=\{f\.key\}/)
  assert.match(primitives, /htmlFor=\{f\.key\}/)
  assert.match(primitives, /type="password"/)
  assert.match(primitives, /\{f\.testTarget && <TestResult result=\{testResults\[f\.testTarget\]\} \/>\}/)
  assert.match(primitives, /onResult\(await postJson\(\`\/api\/settings\/test\/\$\{target\}\`, \{\}\)\)/)
})
