/** Cloud-only populated identity checks. Synthetic images; no screenshots. */
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
const runtime = await mkdtemp(path.join(tmpdir(), 'lds-identities-'))
const receipt = path.resolve(root, execFileSync('git', ['rev-parse', '--git-path', 'lds-gates-validation'],
  { cwd: root, encoding: 'utf8', windowsHide: true }).trim())
let server, browser, url
let output = '', complete = false, failure = null
const outcomes = []
try {
  const socket = createServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  url = 'http://127.0.0.1:' + port
  server = spawn(path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    [path.join(root, 'backend/tests/identity_learning_server.py'), runtime, String(port)],
    { cwd: root, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', OMP_NUM_THREADS: '1' } })
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })
  let ready
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null) throw new Error(output)
    try { const response = await fetch(url+'/test/ready'); if (response.ok) { ready = await response.json(); break } }
    catch { /* Fixture readiness is bounded below. */ }
    await delay(500)
  }
  assert.ok(ready, 'Identity fixture must start')
  browser = await chromium.launch({ executablePath: findHeadlessShell(fs, path) })
  const before = await (await fetch(url+'/test/state')).json()
  for (const [width, height] of [[360, 800], [412, 915], [844, 390], [768, 1024], [1280, 800]]) {
    for (const source of ['bank', 'dataset']) {
      for (const kind of ['anime', 'person']) {
        const context = await browser.newContext({ viewport: { width, height } })
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.addInitScript(({ source, ready }) => {
          localStorage.setItem(source === 'bank' ? 'bankCurrentId' : 'datasetCurrentId', String(ready[source+'_id']))
        }, { source, ready })
        await page.goto(url + (source === 'bank' ? '/#/bank' : '/#/datasets?section=images'))
        if (source === 'bank') await page.getByAltText('image-01.png', { exact: true }).click()
        else await page.getByRole('checkbox', { name: /Select .* for bulk actions/ }).first().check()
        await page.locator('[data-identity-open]').click()
        const panel = page.getByRole('dialog', { name: 'Identities', exact: true })
        await panel.getByLabel('Kind', { exact: true }).selectOption(kind)
        await panel.getByLabel('Name', { exact: true }).fill('Aster '+source+' '+kind+' '+width)
        if (kind === 'anime') await panel.getByLabel('One Character', { exact: true }).check()
        const assigned = page.waitForResponse((response) => response.url().endsWith('/assign') && response.request().method() === 'POST')
        await panel.getByRole('button', { name: 'Assign', exact: true }).click()
        const response = await assigned
        assert.equal(response.status(), 200, await response.text())
        assert.equal((await response.json()).learning.measured, 1)
        await panel.getByRole('button', { name: 'Remove Name', exact: true }).first().waitFor()
        const geometry = await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const controls = [...element.querySelectorAll('button, select, input:not([type="checkbox"]):not([type="file"])')]
            .filter((node) => node.getClientRects().length).map((node) => {
              const box = node.getBoundingClientRect()
              return { left: box.left, right: box.right, height: box.height, clipped: node.scrollWidth > node.clientWidth + 2 }
            })
          return { left: rect.left, right: rect.right, controls }
        })
        assert.ok(geometry.left >= 0 && geometry.right <= width+1)
        assert.ok(geometry.controls.every((control) => control.left >= -1 && control.right <= width+1))
        assert.ok(geometry.controls.every((control) => control.height >= 39 && !control.clipped), 'Controls need readable labels and 40px targets')
        const removal = page.waitForResponse((r) => r.url().endsWith('/decision'))
        await panel.getByRole('button', { name: 'Remove Name', exact: true }).first().click()
        assert.equal((await removal).status(), 200)
        await panel.getByRole('button', { name: 'Undo', exact: true }).click()
        await panel.getByRole('button', { name: 'Remove Name', exact: true }).first().waitFor()
        await panel.getByRole('button', { name: 'Find Matches', exact: true }).click()
        await panel.getByRole('button', { name: 'Close', exact: true }).waitFor({ state: 'visible' })
        await page.waitForFunction(() => !document.querySelector('[role="dialog"] button')?.disabled)
        await panel.getByRole('button', { name: 'Close', exact: true }).click()
        await panel.waitFor({ state: 'detached' })
        assert.deepEqual(errors, [])
        outcomes.push({ width, height, source, kind, passed: true })
        await context.close()
      }
    }
  }
  assert.deepEqual(await (await fetch(url+'/test/state')).json(), before)
  assert.equal(outcomes.length, 20)
  complete = true
  console.log('Identity assignment, removal, Undo, matching and layout passed in 20 populated states.')
} catch (error) {
  failure = String(error.stack || error)
  throw error
} finally {
  fs.mkdirSync(receipt, { recursive: true })
  await writeFile(path.join(receipt, 'identities.json'), JSON.stringify({
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    expected: 20, outcomes, skipped: [], complete, failure,
  }, null, 2))
  await browser?.close()
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { await fetch(url+'/test/shutdown', { method: 'POST', signal: AbortSignal.timeout(5000) }) } catch { /* Startup may fail. */ }
    if (!await Promise.race([exited.then(() => true), delay(10000, false, { ref: false })])) {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true })
      else server.kill()
      await exited
    }
  }
  const resolved = path.resolve(runtime)
  assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep) && path.basename(resolved).startsWith('lds-identities-'))
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
