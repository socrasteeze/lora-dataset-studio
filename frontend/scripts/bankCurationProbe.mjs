/** Cloud-only real UI/API checks with synthetic, isolated images. No captures. */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { findHeadlessShell } from './responsiveProbe.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runtime = await mkdtemp(path.join(tmpdir(), 'lds-curation-'))
const receiptDirectory = execFileSync('git', ['rev-parse', '--git-path', 'lds-gates-validation'],
  { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
const receipts = path.resolve(root, receiptDirectory)
const outcomes = []
let server
let browser
let serverUrl
let output = ''
let emptySelectionPassed = false
let complete = false
let failure = null
let responsive = null

try {
  const socket = createServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  serverUrl = `http://127.0.0.1:${port}`
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  server = spawn(python, [path.join(root, 'backend/tests/bank_curation_server.py'), runtime, String(port)],
    { cwd: root, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } })
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })
  let ready
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(output)
    try {
      const response = await fetch(`${serverUrl}/test/ready`)
      if (response.ok) { ready = await response.json(); break }
    } catch { /* The isolated server is not ready yet. */ }
    await delay(500)
  }
  assert.ok(ready, 'Synthetic curation server did not start')
  const executablePath = findHeadlessShell(fs, path)
  assert.ok(executablePath, 'The cloud Chromium headless shell is required')
  browser = await chromium.launch({ executablePath })
  const before = await (await fetch(`${serverUrl}/test/state`)).json()
  for (const [width, height] of [[360, 800], [412, 915], [844, 390], [768, 1024], [1280, 800]]) {
    for (const kind of ['character', 'concept', 'style']) {
      for (const mode of ['diverse', 'balanced', 'similar']) {
        const context = await browser.newContext({ viewport: { width, height } })
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.addInitScript((id) => localStorage.setItem('bankCurrentId', String(id)), ready.bank_id)
        await page.goto(`${serverUrl}/#/bank`)
        await page.getByAltText('image-01.png', { exact: true }).click()
        await page.getByAltText('image-02.png', { exact: true }).click()
        const curate = page.locator('[aria-controls="bank-curate"]')
        if (await curate.getAttribute('aria-expanded') !== 'true') await curate.click()
        await page.getByRole('button', { name: { diverse: 'Pick diverse', balanced: '⚖️ Balanced pick',
          similar: 'Similar to selected' }[mode], exact: true }).click()
        const panel = page.locator(`[data-probe-panel="curate-${mode}"]`)
        await panel.getByText('Selection Policy', { exact: true }).first().click()
        await panel.getByLabel('LoRA Kind', { exact: true }).selectOption(kind)
        await panel.getByRole('button', { name: 'Use References', exact: true }).click()
        await panel.getByRole('button', { name: 'Pin Selected', exact: true }).click()
        await panel.getByLabel('Minimum Similarity', { exact: true }).fill('0.2')
        await panel.getByLabel('Image Count', { exact: true }).fill('8')
        if (mode === 'balanced') await panel.getByText('Target Weights', { exact: true }).click()
        const geometry = await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const controls = [...element.querySelectorAll('input:not([type="checkbox"]):not([type="range"]), button, select, summary')]
            .filter((node) => node.getClientRects().length).map((node) => {
              const box = node.getBoundingClientRect()
              return { left: box.left, right: box.right, height: box.height,
                clipped: node.scrollWidth > node.clientWidth + 2 }
            })
          return { left: rect.left, right: rect.right, height: rect.height, controls }
        })
        assert.ok(geometry.left >= -1 && geometry.right <= width + 1,
          `Policy panel overflow at ${width}x${height} ${kind}/${mode}`)
        assert.ok(geometry.height <= height * 0.75 + 2, 'Policy panel must remain scrollable within the viewport')
        assert.ok(geometry.controls.every((control) => control.left >= -1 && control.right <= width + 1),
          'Policy controls must fit horizontally')
        assert.ok(geometry.controls.every((control) => !control.clipped), 'Policy controls must not truncate')
        if (width < 1024) assert.ok(geometry.controls.every((control) => control.height >= 39),
          'Policy controls must retain 40px touch targets')
        const responseWait = page.waitForResponse((response) => response.url().endsWith(`/select-${mode}`))
        await panel.getByRole('button', { name: 'Select 8 Images', exact: true }).click()
        const response = await responseWait
        assert.equal(response.status(), 200)
        const requested = response.request().postDataJSON()
        const result = await response.json()
        assert.equal(requested.selection.kind, kind)
        assert.equal(requested.selection.reference_ids.length, 2)
        assert.equal(result.selection_only, true)
        assert.equal(result.selected, 8)
        assert.equal(result.results.filter((row) => row.reason === 'pinned').length, 2)
        await page.getByRole('region', { name: 'Selection Report' }).waitFor()
        await page.waitForFunction((expected) => document.querySelectorAll('img[alt^="image-"]').length === expected, result.selected)
        assert.deepEqual(errors, [])
        outcomes.push({ width, height, kind, mode, selected: result.selected, passed: true })
        await context.close()
      }
    }
  }
  const responsiveOutput = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/responsiveProbe.mjs', '--url', `${serverUrl}/#/bank`,
      '--states', 'curate-diverse,curate-balanced,curate-similar', '--json'],
    { cwd: path.join(root, 'frontend'), windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => {
      try { responsive = JSON.parse(stdout) } catch { /* Preserve a failed probe's text below. */ }
      if (code === 0) resolve(responsive)
      else reject(new Error(`Responsive probe failed: ${stdout}\n${stderr}`))
    })
  })
  assert.equal(responsiveOutput.measured, 15, 'All three selectors must render at all five sizes')
  assert.deepEqual(responsiveOutput.skipped, [], 'Skipped curation states are not passes')
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } })
  const page = await context.newPage()
  await page.addInitScript((id) => localStorage.setItem('bankCurrentId', String(id)), ready.bank_id)
  await page.goto(`${serverUrl}/#/bank`)
  await page.getByAltText('image-01.png', { exact: true }).waitFor()
  await fetch(`${serverUrl}/test/unreadable`, { method: 'POST' })
  const curate = page.locator('[aria-controls="bank-curate"]')
  if (await curate.getAttribute('aria-expanded') !== 'true') await curate.click()
  await page.getByRole('button', { name: 'Pick diverse', exact: true }).click()
  await page.locator('[data-probe-panel="curate-diverse"]').getByRole('button', { name: 'Select 60 Images', exact: true }).click()
  await page.getByRole('region', { name: 'Selection Report' }).getByText('0 of 60 selected for character.', { exact: false }).waitFor()
  assert.equal(await page.locator('img[alt^="image-"]').count(), 0, 'An empty result must not fall back to the full bank')
  emptySelectionPassed = true
  await context.close()
  const after = await (await fetch(`${serverUrl}/test/state`)).json()
  assert.deepEqual(after, before, 'Selections must not change status or source bytes')
  complete = true
  console.log(`Curation controls passed in ${outcomes.length} populated viewport/kind/selector states; empty selection passed.`)
} catch (error) {
  failure = String(error.stack || error)
  throw error
} finally {
  fs.mkdirSync(receipts, { recursive: true })
  await writeFile(path.join(receipts, 'curation.json'), JSON.stringify({
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    outcomes, expectedStates: 45, emptySelectionPassed, responsive, failure, complete,
  }, null, 2))
  await browser?.close()
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { await fetch(`${serverUrl}/test/shutdown`, { method: 'POST', signal: AbortSignal.timeout(5000) }) }
    catch { /* Startup can fail before the fixture endpoint exists. */ }
    if (!await Promise.race([exited.then(() => true), delay(10000, false, { ref: false })])) {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true })
      else server.kill()
      await exited
    }
  }
  assert.ok(path.resolve(runtime).startsWith(path.resolve(tmpdir()) + path.sep)
    && path.basename(runtime).startsWith('lds-curation-'))
  await rm(runtime, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
