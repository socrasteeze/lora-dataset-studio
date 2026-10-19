/** Cloud-only Bank Queue geometry and control checks with invented API data. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const viewports = [[360, 800], [412, 915], [640, 800], [844, 390], [768, 1024],
  [1024, 768], [1280, 800], [1440, 900]]

async function measure(panel, width) {
  const geometry = await panel.evaluate((element) => {
    const parent = element.getBoundingClientRect()
    const rect = (node) => {
      const box = node.getBoundingClientRect()
      return { x: box.x - parent.x, y: box.y - parent.y, width: box.width,
        height: box.height, clipped: node.scrollWidth > node.clientWidth + 1 }
    }
    return { left: parent.left, right: parent.right, rows: [...element.querySelectorAll('[data-queue-row]')].map((row) => ({
      id: Number(row.dataset.bankId), box: rect(row),
      cells: Object.fromEntries([...row.querySelectorAll('[data-queue-cell]')].map((cell) => [cell.dataset.queueCell, rect(cell)])),
    })), controls: [...element.querySelectorAll('button')].filter((node) => node.getClientRects().length).map(rect) }
  })
  assert.ok(geometry.left >= -1 && geometry.right <= width + 1, 'Queue panel must fit the viewport')
  const first = geometry.rows[0].cells
  for (const { id, cells, box } of geometry.rows) {
    for (const column of ['job', 'status', 'control']) {
      assert.ok(Math.abs(cells[column].x - first[column].x) <= 1,
        `${width}px: ${column} in row ${id} starts at ${cells[column].x}; expected ${first[column].x}`)
    }
    for (const [field, cell] of Object.entries(cells)) {
      assert.ok(!cell.clipped, `${width}px: ${field} in row ${id} must retain its full text`)
      assert.ok(cell.x >= box.x - 1 && cell.x + cell.width <= box.x + box.width + 1,
        `${width}px: ${field} in row ${id} must stay inside the row`)
    }
    assert.ok(cells.name.width >= 80, 'Bank names need readable space')
    assert.ok(cells.job.x + cells.job.width <= cells.status.x + 1, 'Job and status must not overlap')
    if (width < 640) assert.ok(cells.job.y >= cells.name.y + cells.name.height - 1, 'Phone jobs must sit below the bank name')
  }
  if (width < 1024) assert.ok(geometry.controls.every((control) => control.width >= 39 && control.height >= 39),
    'Queue controls need 40px touch targets')
  return geometry
}

async function redactedCapture(panel, destination, python, root) {
  const boxes = await panel.evaluate((element) => {
    const parent = element.getBoundingClientRect()
    return [...element.querySelectorAll('[data-queue-cell="name"], [data-queue-private]')].map((node) => {
      const box = node.getBoundingClientRect()
      return [Math.floor(box.left - parent.left), Math.floor(box.top - parent.top),
        Math.ceil(box.right - parent.left), Math.ceil(box.bottom - parent.top)]
    })
  })
  try {
    const pixels = await panel.screenshot()
    execFileSync(python, ['-c', [
      'import io, json, sys', 'from PIL import Image',
      'with Image.open(io.BytesIO(sys.stdin.buffer.read())) as original: image = original.convert("RGB")',
      'clean = Image.new("RGB", image.size); clean.paste(image)',
      'for box in json.loads(sys.argv[2]):',
      ' tile = clean.crop(box)',
      ' tile = tile.resize((max(1, tile.width//12), max(1, tile.height//12)), Image.Resampling.BILINEAR).resize(tile.size, Image.Resampling.NEAREST)',
      ' clean.paste(tile, box)', 'clean.save(sys.argv[1], format="PNG")',
    ].join('\n'), destination, JSON.stringify(boxes)], { cwd: root, windowsHide: true, input: pixels })
  } catch (error) {
    await rm(destination, { force: true })
    throw error
  }
}

export async function checkBankQueueAlignment({ browser, url, root, receipts, python }) {
  const outcomes = []
  const expected = viewports.length * 5
  let complete = false
  let failure = null
  const base = await (await fetch(`${url}/api/banks`)).json()
  assert.ok(base.banks?.length, 'The isolated Bank fixture must be populated')
  const banks = Array.from({ length: 22 }, (_, index) => ({ ...base.banks[0], id: index + 1, preview_ids: [],
    name: index % 3 === 0 ? `Example ${index + 1}` : index % 3 === 1
      ? `Example ${index + 1} with a longer descriptive name` : `Example${index + 1}${'LongName'.repeat(10)}` }))
  await mkdir(receipts, { recursive: true })
  try {
    for (const [width, height] of viewports) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024 })
      try {
        const page = await context.newPage()
        const errors = []
        const mutations = []
        const queue = {
          items: banks.slice(0, 20).map((bank, index) => ({ bank_id: bank.id, position: index + 1,
            state: index === 0 ? 'running' : index === 19 ? 'failed' : 'pending',
            operation: ['pipeline', 'caption', 'bank_promote', 'folder-check'][index % 4],
            ...(index === 4 ? { device_label: 'Example Worker', waiting_for: 'Another job holds the device.' } : {}),
            ...(index === 19 ? { error: 'Prepare the missing model in Setup before this job starts.' } : {}),
          })),
          active_jobs: [{ bank_id: 21, kind: 'score', started_at: 1, direct: true, device_label: 'Example Worker' },
            { bank_id: 22, kind: 'caption', started_at: 2, direct: true }],
        }
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('dialog', (dialog) => dialog.accept())
        await page.route('**/api/banks**', (route) => route.fulfill({ json: { ...base, banks } }))
        await page.route('**/api/bank-queue**', async (route) => {
          const request = route.request()
          const pathname = new URL(request.url()).pathname
          if (request.method() !== 'GET') {
            mutations.push(`${request.method()} ${pathname}`)
            const id = Number(pathname.match(/\/([0-9]+)(?:\/retry)?$/)?.[1])
            if (request.method() === 'DELETE') queue.items = queue.items.filter((item) => item.bank_id !== id)
            else {
              assert.equal(pathname, '/api/bank-queue/20/retry')
              Object.assign(queue.items.find((item) => item.bank_id === id), { state: 'pending', error: null })
            }
            queue.items.forEach((item, index) => { item.position = index + 1 })
          }
          await route.fulfill({ json: request.method() === 'GET' ? queue : { ok: true } })
        })
        await page.route('**/api/bank/21/cancel', async (route) => {
          assert.equal(route.request().method(), 'POST')
          mutations.push('POST /api/bank/21/cancel')
          queue.active_jobs = queue.active_jobs.filter((job) => job.bank_id !== 21)
          await route.fulfill({ json: { ok: true } })
        })
        await page.goto(`${url}/#/bank`)
        const panel = page.locator('[data-bank-queue]')
        await panel.locator('[data-queue-row]').nth(21).waitFor()
        await page.waitForFunction((name) => document.querySelector('[data-queue-row="queued"][data-bank-id="3"] [data-queue-cell="name"]')?.textContent === name, banks[2].name)
        await page.evaluate(async () => { await document.fonts.ready })
        await redactedCapture(panel, path.join(receipts, `queue-${width}.png`), python, root)
        const before = await measure(panel, width)
        assert.equal(before.rows.length, 22)
        outcomes.push({ width, height, state: 'initial', geometry: before, passed: true })
        const waiting = panel.locator('[data-queue-row="queued"][data-bank-id="2"]')
        await waiting.hover()
        await waiting.locator('button').focus()
        const focused = await measure(panel, width)
        assert.deepEqual(focused.rows, before.rows, 'Hover and focus must not move queue cells')
        outcomes.push({ width, height, state: 'hover-focus', passed: true })
        await waiting.locator('button').click()
        await waiting.waitFor({ state: 'detached' })
        outcomes.push({ width, height, state: 'remove', geometry: await measure(panel, width), passed: true })
        const failed = panel.locator('[data-queue-row="queued"][data-bank-id="20"]')
        await failed.getByRole('button', { name: /^Retry / }).click()
        await page.waitForFunction(() => document.querySelector('[data-queue-row="queued"][data-bank-id="20"] [data-queue-cell="status"]')?.textContent === 'Waiting')
        outcomes.push({ width, height, state: 'retry', geometry: await measure(panel, width), passed: true })
        const direct = panel.locator('[data-queue-row="active"][data-bank-id="21"]')
        await direct.getByRole('button', { name: /^Stop / }).click()
        await direct.waitFor({ state: 'detached' })
        outcomes.push({ width, height, state: 'stop', geometry: await measure(panel, width), passed: true })
        assert.deepEqual(mutations, ['DELETE /api/bank-queue/2', 'POST /api/bank-queue/20/retry', 'POST /api/bank/21/cancel'])
        assert.deepEqual(errors, [], 'The populated queue must render without errors')
      } finally { await context.close() }
    }
    assert.equal(outcomes.length, expected)
    const realQueue = await (await fetch(`${url}/api/bank-queue`)).json()
    assert.equal(realQueue.items.length + realQueue.active_jobs.length, 0, 'The probe must never enqueue real jobs')
    complete = true
    return outcomes
  } catch (error) {
    failure = error.message
    throw error
  } finally {
    await writeFile(path.join(receipts, 'queue-alignment.json'), JSON.stringify({
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
      expected, outcomes, complete, failure,
    }, null, 2))
  }
}
