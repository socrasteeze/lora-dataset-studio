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
let activePage, activeErrors = []
let output = '', complete = false, failure = null
const outcomes = []
const recoveryOutcomes = []
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
    const recoveryContext = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024 })
    const recoveryPage = await recoveryContext.newPage()
    activePage = recoveryPage; activeErrors = []
    recoveryPage.on('pageerror', (error) => activeErrors.push(error.message))
    await recoveryPage.addInitScript((id) => localStorage.setItem('bankCurrentId', String(id)), ready.bank_id)
    await recoveryPage.route((requestUrl) => requestUrl.pathname === '/api/capabilities', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, json: { ...await response.json(), face_scoring: true } })
    })
    const marked = await recoveryContext.request.post(url+'/api/bank/'+ready.bank_id+'/folder-person',
      { data: { subfolder: '' } })
    assert.equal(marked.status(), 200)
    await recoveryPage.goto(url+'/#/bank')
    await recoveryPage.locator('[aria-controls="bank-passes-panel"]').click()
    await recoveryPage.getByRole('button', { name: /Group by person/ }).click()
    const grouping = recoveryPage.getByRole('dialog', { name: /Group by person/ })
    await grouping.getByText(/— 0 image\(s\)/).waitFor()
    const undoGroup = grouping.getByRole('button', { name: /Undo Group/ })
    const undoBounds = await undoGroup.boundingBox()
    assert.ok(undoBounds && undoBounds.height >= 39 && undoBounds.x >= 0 && undoBounds.x+undoBounds.width <= width+1)
    const cleared = recoveryPage.waitForResponse((response) => response.url().includes('/folder-person?') && response.request().method() === 'DELETE')
    await undoGroup.click()
    const clearResponse = await cleared
    assert.equal(clearResponse.status(), 200)
    assert.equal((await clearResponse.json()).cleared, 4)
    await grouping.getByText(/— 4 image\(s\)/).waitFor()
    assert.deepEqual((await (await recoveryContext.request.get(url+'/api/bank/'+ready.bank_id+'/folder-persons')).json()).assertions, [])
    recoveryOutcomes.push({ width, height, eligibleBefore: 0, eligibleAfter: 4, passed: true })
    await recoveryContext.close()
    for (const source of ['bank', 'dataset']) {
      for (const kind of ['anime', 'person']) {
        assert.ok((await fetch(url+'/test/reset-identities', { method: 'POST' })).ok)
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024 })
        const page = await context.newPage()
        const errors = []
        activePage = page; activeErrors = errors
        page.on('pageerror', (error) => errors.push(error.message))
        await page.addInitScript(({ source, ready }) => {
          localStorage.setItem(source === 'bank' ? 'bankCurrentId' : 'datasetCurrentId', String(ready[source+'_id']))
        }, { source, ready })
        await page.goto(url + (source === 'bank' ? '/#/bank' : '/#/datasets?section=images'))
        if (source === 'bank') await page.getByAltText('image-01.png', { exact: true }).click()
        else {
          const card = page.locator('.dataset-grid-item').first()
          if (width >= 1024) await card.hover()
          await card.getByRole('checkbox', { name: /Select .* for bulk actions/ }).check()
        }
        await page.locator('[data-identity-open]').click()
        const panel = page.getByRole('dialog', { name: 'Identities', exact: true })
        await panel.getByLabel('Kind', { exact: true }).selectOption(kind)
        await panel.getByRole('button', { name: 'Choose Subject', exact: true }).click()
        await page.getByRole('button', { name: 'Crop', exact: true }).click()
        await panel.getByLabel('Name', { exact: true }).fill('Aster '+source+' '+kind+' '+width)
        if (source === 'bank' && kind === 'anime' && width === 360) {
          page.once('dialog', (dialog) => dialog.accept())
          await page.reload()
          await page.getByAltText('image-01.png', { exact: true }).click()
          await page.locator('[data-identity-open]').click()
          await page.waitForFunction((expected) => document.querySelector('[role="dialog"] input[aria-label="Name"]')?.value === expected,
            'Aster '+source+' '+kind+' '+width)
          await panel.getByRole('button', { name: 'Choose Subject', exact: true }).click()
          await page.getByRole('button', { name: 'Crop', exact: true }).click()
        }
        if (kind === 'anime') await panel.getByLabel('One Character', { exact: true }).check()
        const assigned = page.waitForResponse((response) => response.url().endsWith('/assign') && response.request().method() === 'POST')
        await panel.getByRole('button', { name: 'Assign', exact: true }).click()
        const response = await assigned
        assert.equal(response.status(), 200, await response.text())
        assert.equal((await response.json()).learning.measured, 1)
        await panel.getByRole('button', { name: 'Remove Name', exact: true }).first().waitFor()
        if (source === 'bank' && kind === 'anime' && width === 360) {
          await panel.getByRole('button', { name: 'Close', exact: true }).click()
          await page.reload()
          await page.getByAltText('image-01.png', { exact: true }).click()
          await page.locator('[data-identity-open]').click()
          await panel.getByRole('button', { name: 'Remove Name', exact: true }).first().waitFor()
          await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some((button) => button.textContent === 'Undo' && !button.disabled))
        }
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
        await panel.getByRole('button', { name: 'Close', exact: true }).click()
        await panel.waitFor({ state: 'detached' })
        if (source === 'bank') {
          await page.getByAltText('image-01.png', { exact: true }).click()
          await page.getByAltText('image-02.png', { exact: true }).click()
        } else {
          const cards = page.locator('.dataset-grid-item')
          if (width >= 1024) await cards.nth(0).hover()
          await cards.nth(0).getByRole('checkbox', { name: /Select .* for bulk actions/ }).uncheck()
          if (width >= 1024) await cards.nth(1).hover()
          await cards.nth(1).getByRole('checkbox', { name: /Select .* for bulk actions/ }).check()
        }
        await page.locator('[data-identity-open]').click()
        await panel.getByLabel('Kind', { exact: true }).selectOption(kind)
        if (kind === 'anime') await panel.getByLabel('One Character', { exact: true }).check()
        await panel.getByRole('button', { name: 'Find Matches', exact: true }).click()
        await panel.getByRole('button', { name: 'Reject Match', exact: true }).first().waitFor()
        await panel.getByRole('button', { name: 'Reject Match', exact: true }).first().click()
        await panel.getByRole('button', { name: 'Undo', exact: true }).click()
        await panel.getByRole('button', { name: 'Find Matches', exact: true }).click()
        await panel.getByRole('button', { name: 'Confirm', exact: true }).first().waitFor()
        await panel.getByRole('button', { name: 'Confirm', exact: true }).first().click()
        if (kind === 'anime') {
          await panel.getByRole('button', { name: 'Suggest Names', exact: true }).click()
          await panel.getByRole('button', { name: 'aster demo · 0.92', exact: true }).waitFor()
        }
        await panel.getByRole('button', { name: 'Close', exact: true }).click()
        const identityResponse = await page.request.get(url+'/api/identities?kind='+kind)
        const identity = (await identityResponse.json()).identities[0]
        await page.getByLabel('Identity Filter', { exact: true }).selectOption(identity.id)
        if (source === 'dataset') {
          await page.waitForFunction(() => document.querySelectorAll('#ds-images-review input[type="checkbox"]').length === 2)
        } else {
          await page.waitForFunction(() => document.querySelectorAll('img[alt^="image-"]').length === 2)
        }
        assert.deepEqual(errors, [])
        outcomes.push({ width, height, touch: width < 1024, source, kind, passed: true })
        await context.close()
      }
    }
  }
  assert.deepEqual(await (await fetch(url+'/test/state')).json(), before)
  assert.equal(outcomes.length, 20)
  assert.equal(recoveryOutcomes.length, 5)
  complete = true
  console.log('Identity assignment, removal, Undo, matching and layout passed in 20 populated states.')
} catch (error) {
  failure = String(error.stack || error)
  throw error
} finally {
  fs.mkdirSync(receipt, { recursive: true })
  await writeFile(path.join(receipt, 'identities.json'), JSON.stringify({
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    expected: 20, outcomes, recoveryExpected: 5, recoveryOutcomes, skipped: [], complete, failure,
    diagnostic: failure && activePage && !activePage.isClosed() ? {
      url: activePage.url(), errors: activeErrors,
      headings: await activePage.getByRole('heading').allTextContents(),
      buttons: await activePage.getByRole('button').allTextContents(),
      imagePanel: await activePage.locator('body').evaluate(() => {
        const panel = document.querySelector('#gf-images')
        return { exists: !!panel, visible: !!panel?.getClientRects().length,
          cards: document.querySelectorAll('.dataset-grid-item').length,
          checkboxes: document.querySelectorAll('#gf-images input[type="checkbox"]').length }
      }),
    } : null,
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
