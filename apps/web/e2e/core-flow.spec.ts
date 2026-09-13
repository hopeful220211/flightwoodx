import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Locator, Page, Response } from '@playwright/test'
import { DroneDesignSnapshotSchema, PART_REGISTRY } from '@fwx/parts-schema'
import type { DroneDesignSnapshot } from '@fwx/parts-schema'

/**
 * Requires a running local Web app and its isolated API/database; no production writes.
 * The custom-part case injects one failed response to exercise retry; successful
 * saves and restores use the real local API/database.
 * Each user-flow test creates a unique e2e_* account. Retain or discard the whole test
 * database after the run; these tests never delete an existing account or unrelated work.
 * Credentials only live in memory. Tracing/video are disabled in playwright.config.ts.
 */
async function guardLocalNetwork(context: BrowserContext) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol)
      && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
}

function observeBrowser(page: Page, expectedFailure?: (response: Response) => boolean) {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (message.text().includes('Texture marked for update but no image data found')) failures.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 400 && !expectedFailure?.(response)) {
      failures.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`)
    }
  })
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText ?? 'request failed'
    // A navigation may cancel an obsolete image or data request normally.
    if (!failure.includes('ERR_ABORTED')) failures.push(`${failure} ${new URL(request.url()).pathname}`)
  })
  return failures
}

async function registerDedicatedAccount(page: Page) {
  const suffix = randomBytes(6).toString('hex')
  const username = `e2e_${suffix}`
  const password = randomBytes(24).toString('base64url')
  await page.goto('/register')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('邮箱', { exact: true }).fill(`${username}@example.test`)
  try {
    // Do not include a generated password in an error or an attachment.
    try {
      await page.getByLabel('密码', { exact: true }).fill(password)
    } catch {
      throw new Error('Could not fill the test registration password field.')
    }
    const registered = page.waitForResponse(response =>
      new URL(response.url()).pathname.endsWith('/api/auth/register')
      && response.request().method() === 'POST')
    await page.getByRole('button', { name: '创建账号', exact: true }).click()
    const response = await registered
    expect(response.ok(), `The isolated API registration returned status ${response.status()}`).toBe(true)
    await expect(page).toHaveURL(/\/dashboard$/)
  } finally {
    // Clear the field before failure artifacts are collected if registration fails.
    if (await page.getByLabel('密码', { exact: true }).count()) {
      await page.getByLabel('密码', { exact: true }).fill('').catch(() => {})
    }
  }
  return `E2E ${suffix}`
}

async function readDesign(page: Page): Promise<DroneDesignSnapshot | null> {
  const raw = await page.evaluate(() => {
    const persisted = localStorage.getItem('drone_app_design_store')
    if (!persisted) return null
    const state = JSON.parse(persisted).state
    return state.designs.find((design: { id: string }) => design.id === state.activeDesignId) ?? null
  })
  return raw ? DroneDesignSnapshotSchema.parse(raw) : null
}

async function verifyWarmCover(page: Page, name: string) {
  const uploaded = page.waitForResponse(response => /^\/api\/drone-designs\/[^/]+\/cover$/.test(new URL(response.url()).pathname)
    && response.request().method() === 'POST').catch(() => null)
  await page.goto('/dashboard')
  const preview = page.getByRole('img', { name: `${name} 预览`, exact: true })
  await expect(preview).toBeVisible()
  // Read the image itself: a screenshot also includes the warm-coloured draft badge,
  // which could incorrectly make a completely empty preview pass this check.
  const pixels = await preview.evaluate(async element => {
    const image = element as HTMLImageElement
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not read the generated preview image.')
    context.drawImage(image, 0, 0)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  const { data, info } = await sharp(Buffer.from(pixels, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let warmPixels = 0
  for (let index = 0; index < data.length; index += info.channels) {
    const [red, green, blue] = [data[index]!, data[index + 1]!, data[index + 2]!]
    if (red > 80 && green > 45 && red > blue + 15) warmPixels += 1
  }
  expect(warmPixels / (info.width * info.height), 'The saved preview must contain visible wood, not only a background or black silhouette').toBeGreaterThan(0.005)
  const upload = await uploaded
  expect(upload?.status(), 'The actual generated cover must also reach the account API').toBe(200)
  if (!upload) throw new Error('The generated cover was not uploaded.')
  const stored = new URL((await upload.json()).coverUrl as string, page.url())
  expect(stored.origin, 'The stored cover must remain on the isolated origin').toBe(new URL(page.url()).origin)
  const retrieved = await page.request.get(stored.href, { maxRedirects: 0 })
  expect(retrieved.status()).toBe(200)
  expect(await retrieved.body(), 'Reading the saved cover must return the uploaded image bytes').toEqual(upload.request().postDataBuffer())
  await retrieved.dispose()
}

async function buildAndSave(page: Page, name: string) {
  await page.getByRole('button', { name: '新建作品', exact: true }).first().click()
  await page.getByLabel('无人机名字', { exact: true }).fill(name)
  await page.getByRole('button', { name: '开始搭建', exact: true }).click()
  await expect(page).toHaveURL(/\/design\/design-[^/]+$/)
  const designId = new URL(page.url()).pathname.split('/').at(-1)!
  await expect(page.getByTitle('点一下改名字', { exact: true })).toHaveText(name)

  await page.getByRole('button', { name: '添加主板件01', exact: true }).click()
  await page.getByRole('button', { name: '下一步 →', exact: true }).click()
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '添加起落架01', exact: true }).click()
  }
  await page.getByRole('button', { name: '下一步 →', exact: true }).click()
  await page.getByRole('button', { name: '添加保护板01', exact: true }).click()
  await page.getByRole('button', { name: '下一步 →', exact: true }).click()
  await page.getByRole('button', { name: '下一步 →', exact: true }).click()

  const saveResponse = page.waitForResponse(response => {
    if (!new URL(response.url()).pathname.endsWith('/api/drone-designs')
      || response.request().method() !== 'PUT') return false
    // An earlier autosave may still be in flight; await this completed snapshot.
    const submitted = response.request().postDataJSON()
    return submitted.localId === designId && submitted.designData?.currentStep === 'REVIEW'
      && submitted.designData?.parts.length === 6
  })
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  const response = await saveResponse
  expect(response.ok(), 'The real API must accept the design save').toBe(true)
  const body = await response.json()
  const saved = DroneDesignSnapshotSchema.parse(body.design.designData)
  expect(saved.id).toBe(designId)
  expect(body.design.name).toBe(name)
  expect(saved.name).toBe(name)
  expect(saved.parts).toHaveLength(6)
  expect(new Set(saved.parts.map(part => part.instanceId)).size).toBe(6)
  expect(saved.parts.filter(part => part.category === 'mainboard')).toHaveLength(1)
  expect(saved.parts.filter(part => part.category === 'landing')).toHaveLength(4)
  expect(saved.parts.filter(part => part.category === 'guard')).toHaveLength(1)
  expect(saved.parts.map(part => part.partId).sort()).toEqual([
    'arm_01', 'arm_01', 'arm_01', 'arm_01', 'core_hub_01', 'joint_01',
  ])
  for (const part of saved.parts.filter(part => part.category !== 'mainboard')) {
    expect(part.attachedTo?.parentInstanceId, 'Every added child must have an existing parent').toBeTruthy()
    expect(saved.parts.some(parent => parent.instanceId === part.attachedTo?.parentInstanceId)).toBe(true)
  }

  await page.reload()
  await expect(page.getByRole('button', { name: '继续积木编程', exact: true })).toBeVisible()
  await expect.poll(async () => (await readDesign(page))?.parts.length).toBe(6)
  await expect(page.getByTitle('点一下改名字', { exact: true })).toHaveText(name)
  expect((await readDesign(page))?.name).toBe(name)
  expect((await readDesign(page))?.currentStep).toBe('REVIEW')
  return designId
}

async function saveExampleProgram(page: Page) {
  await page.getByRole('button', { name: '继续积木编程', exact: true }).click()
  await expect(page).toHaveURL(/\/code\/design-[^/]+$/)
  await page.getByRole('button', { name: '从示例开始', exact: true }).click()
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已与账号同步', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '从示例开始', exact: true })).toHaveCount(0)
}

async function runSimulation(page: Page) {
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page).toHaveURL(/\/simulator\/design-[^/]+$/)
  await expect(page.getByText('视觉仿真 · 用于检查指令流程，不代表真实飞行结果', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /模拟运行完成/ })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('heading', { name: /运行失败|模拟中发生碰撞/ })).toHaveCount(0)
}

async function expectInsideViewport(page: Page, locator: Locator) {
  const bounds = await locator.boundingBox()
  const viewport = page.viewportSize()!
  expect(bounds, 'The control must be visible').not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1)
}

test.beforeEach(async ({ context }) => {
  await guardLocalNetwork(context)
})

test('desktop: register, assemble, save, restore on another device, program, and simulate', async ({ page, browser, baseURL }) => {
  const failures = observeBrowser(page)
  const name = await registerDedicatedAccount(page)
  const designId = await buildAndSave(page, name)
  const renamedName = '正式浏览器六件验收'
  await page.getByTitle('点一下改名字', { exact: true }).click()
  const nameInput = page.getByLabel('无人机名字', { exact: true })
  await nameInput.fill(renamedName)
  const renamedResponse = page.waitForResponse(response => {
    if (!new URL(response.url()).pathname.endsWith('/api/drone-designs')
      || response.request().method() !== 'PUT') return false
    const submitted = response.request().postDataJSON()
    return submitted.localId === designId && submitted.name === renamedName
      && submitted.designData?.name === renamedName
  })
  await nameInput.press('Enter')
  await expect(page.getByTitle('点一下改名字', { exact: true })).toHaveText(renamedName)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  const renameResponse = await renamedResponse
  expect(renameResponse.ok(), 'The real API must persist the Chinese rename').toBe(true)
  const renamed = (await renameResponse.json()).design
  expect(renamed.name).toBe(renamedName)
  expect(DroneDesignSnapshotSchema.parse(renamed.designData).name).toBe(renamedName)
  await page.reload()
  await expect(page.getByTitle('点一下改名字', { exact: true })).toHaveText(renamedName)
  expect((await readDesign(page))?.name).toBe(renamedName)
  await saveExampleProgram(page)

  // Copy only the authenticated session into a new browser context. No design/program
  // localStorage is transferred, so restoration must use the real API records.
  const auth = await page.evaluate(() => localStorage.getItem('auth-storage'))
  if (!auth || !baseURL) throw new Error('The test account session was not persisted.')
  const restoredContext = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'auth-storage', value: auth }] }] },
  })
  await guardLocalNetwork(restoredContext)
  const restoredPage = await restoredContext.newPage()
  const restoredFailures = observeBrowser(restoredPage)
  try {
    await restoredPage.goto(`/design/${designId}`)
    await expect.poll(async () => (await readDesign(restoredPage))?.parts.length).toBe(6)
    await expect(restoredPage.getByTitle('点一下改名字', { exact: true })).toHaveText(renamedName)
    expect((await readDesign(restoredPage))?.name).toBe(renamedName)
    await restoredPage.getByRole('button', { name: '继续积木编程', exact: true }).click()
    await expect(restoredPage.getByRole('button', { name: '运行', exact: true })).toBeEnabled()
    await expect(restoredPage.getByRole('button', { name: '从示例开始', exact: true })).toHaveCount(0)
    await runSimulation(restoredPage)
    await verifyWarmCover(restoredPage, renamedName)
    expect(restoredFailures).toEqual([])
  } finally {
    await restoredContext.close()
  }
  expect(failures).toEqual([])
})

test.describe('mobile 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('independent account: complete the existing flow with visible controls', async ({ page }) => {
    const failures = observeBrowser(page)
    const name = await registerDedicatedAccount(page)
    await buildAndSave(page, name)
    await expectInsideViewport(page, page.getByRole('button', { name: '继续积木编程', exact: true }))
    await expectInsideViewport(page, page.locator('[aria-current="step"]'))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await saveExampleProgram(page)
    await expectInsideViewport(page, page.getByRole('button', { name: '运行', exact: true }))
    await runSimulation(page)
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: '本机学习记录', exact: true })).toBeVisible()
    await expectInsideViewport(page, page.getByRole('button', { name: '编辑', exact: true }))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(failures).toEqual([])
  })
})

test('read-only: every registered official model and thumbnail is served as a valid binary asset', async ({ request, baseURL }) => {
  if (!baseURL) throw new Error('The local test origin is required.')
  const origin = new URL(baseURL).origin
  expect(PART_REGISTRY.length, 'The registry must contain official parts').toBeGreaterThan(0)

  for (const part of PART_REGISTRY) {
    await test.step(`${part.partNumber}: model and thumbnail`, async () => {
      const assets = [
        { kind: 'glb', path: part.modelPath },
        { kind: 'png', path: `/thumbnails/${part.thumbnailFile}` },
      ] as const

      for (const asset of assets) {
        const url = new URL(asset.path, baseURL)
        // API requests do not pass through the browser's route guard. Validate before
        // issuing any GET and never follow redirects to a potentially external host.
        expect(url.origin, `${part.partNumber} must use same-origin assets`).toBe(origin)
        expect(url.username || url.password, 'Asset URLs must not contain credentials').toBe('')
        const response = await request.get(url.href, { maxRedirects: 0 })
        try {
          expect(response.status(), asset.path).toBe(200)
          expect(response.headers()['content-type'] ?? '', asset.path).not.toContain('text/html')
          const body = await response.body()

          if (asset.kind === 'glb') {
            expect(body.length, asset.path).toBeGreaterThanOrEqual(12)
            expect(body.subarray(0, 4).toString('ascii'), asset.path).toBe('glTF')
            expect(body.readUInt32LE(4), `${asset.path}: GLB version`).toBe(2)
            expect(body.readUInt32LE(8), `${asset.path}: declared binary length`).toBe(body.length)
          } else {
            expect(body.length, asset.path).toBeGreaterThanOrEqual(24)
            expect(body.subarray(0, 8).toString('hex'), asset.path).toBe('89504e470d0a1a0a')
            expect(body.subarray(12, 16).toString('ascii'), `${asset.path}: PNG header`).toBe('IHDR')
            expect(body.readUInt32BE(16), `${asset.path}: width`).toBeGreaterThan(0)
            expect(body.readUInt32BE(20), `${asset.path}: height`).toBeGreaterThan(0)
          }
        } finally {
          await response.dispose()
        }
      }
    })
  }
})

test('custom part: draw, place without invented connectors, save, restore, and retain broken references', async ({ page, browser, baseURL }, testInfo) => {
  let deletedSourcePath: string | null = null
  let forceSaveFailure = false
  // Both open contexts may revalidate on focus after the test deliberately deletes its source.
  const expectedDeletedSource = (response: Response) => (response.status() === 404 && new URL(response.url()).pathname === deletedSourcePath)
    || (forceSaveFailure && response.status() === 503 && new URL(response.url()).pathname === '/api/custom-parts' && response.request().method() === 'POST')
  const errors = observeBrowser(page, expectedDeletedSource)
  const name = await registerDedicatedAccount(page)
  await page.goto('/part-studio')
  await expect(page.getByLabel('参考类型', { exact: true })).toHaveValue('mainboard')
  await page.getByRole('button', { name: '添加图形', exact: true }).click()
  await page.getByRole('button', { name: '圆孔', exact: true }).click()
  await page.getByRole('button', { name: '添加图形', exact: true }).click()
  await page.getByLabel('零件名称', { exact: true }).fill(name)
  await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
  // Simulate only the failed write; the subsequent retry reaches the real
  // isolated API. The editable sketch, dimensions and name must survive.
  forceSaveFailure = true
  await page.route('**/api/custom-parts', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试：暂时无法保存' }) })
    else await route.continue()
  })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('测试：暂时无法保存', { exact: true })).toBeVisible()
  await expect(page.getByLabel('零件名称', { exact: true })).toHaveValue(name)
  await expect(page.getByTestId('sketch-canvas').locator('[data-shape-id]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  await page.unroute('**/api/custom-parts')
  forceSaveFailure = false
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/custom-parts' && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const created = await creation
  expect(created.status()).toBe(201)
  const geometryPayload = created.request().postDataJSON()
  expect(geometryPayload.geometry).toMatchObject({ thicknessMm: 2, bboxMm: { w: 60, h: 40 } })
  expect(geometryPayload.geometry.holes).toHaveLength(1)
  expect(geometryPayload.category).toBe('mainboard')
  await page.getByRole('button', { name: `放入自由拼装：${name}`, exact: true }).click()
  await page.getByLabel('自由作品名称', { exact: true }).fill(`${name} free`)
  await page.getByRole('button', { name: '确认放入', exact: true }).click()
  await expect(page).toHaveURL(/\/design\/design-[^/]+$/)
  await expect(page.getByText('已保存到账号', { exact: true }).first()).toBeVisible()
  const original = (await readDesign(page))!
  expect(original.buildMode).toBe('free')
  expect(original.parts).toHaveLength(1)
  const source = original.parts[0]!.source!
  expect(source.kind).toBe('custom')
  expect(original.parts[0]!.attachedTo).toBeNull()
  expect(original.parts[0]).not.toHaveProperty('activeConnectorId')
  expect(original.parts[0]).not.toHaveProperty('geometry')

  // An all-custom work used to produce a blank cover because its source was skipped.
  // Verify actual pixels before adding official parts, which could hide that failure.
  await verifyWarmCover(page, `${name} free`)
  await page.goto(`/design/${original.id}`)
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()

  await page.getByRole('button', { name: '零件详情：主板件01', exact: true }).click()
  await page.getByRole('button', { name: '添加到设计', exact: true }).click()
  await expect.poll(async () => (await readDesign(page))?.parts.length).toBe(2)
  await page.getByRole('button', { name: '机臂', exact: true }).click()
  await page.getByRole('button', { name: '零件详情：起落架01', exact: true }).click()
  await page.getByRole('button', { name: '添加到设计', exact: true }).click()
  await expect.poll(async () => (await readDesign(page))?.parts.length).toBe(3)
  const mixed = (await readDesign(page))!
  expect(mixed.parts.find(part => part.partId === 'arm_01')!.attachedTo?.parentInstanceId).toBe(mixed.parts.find(part => part.partId === 'core_hub_01')!.instanceId)
  expect(mixed.parts[0]!.attachedTo).toBeNull()

  await page.getByLabel('自制零件 X 位置（毫米）').fill('25')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已保存到账号', { exact: true }).first()).toBeVisible()
  const auth = await page.evaluate(() => localStorage.getItem('auth-storage'))
  if (!auth || !baseURL) throw new Error('The test session is unavailable.')
  const restored = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'auth-storage', value: auth }] }] } })
  await guardLocalNetwork(restored)
  try {
    const reopened = await restored.newPage()
    const restoredErrors = observeBrowser(reopened, expectedDeletedSource)
    await verifyWarmCover(reopened, `${name} free`)
    await reopened.goto(`/design/${original.id}`)
    await expect(reopened.getByLabel('自制零件 X 位置（毫米）')).toHaveValue('25')
    expect((await readDesign(reopened))!.parts[0]!.source).toEqual(source)
    await expect(reopened.getByRole('button', { name, exact: true })).toBeVisible()
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      await reopened.setViewportSize(viewport)
      await expect(reopened.getByRole('button', { name: '展开零件库', exact: true })).toBeVisible()
      await expectInsideViewport(reopened, reopened.getByLabel('自制零件 X 位置（毫米）'))
      await expectInsideViewport(reopened, reopened.getByRole('button', { name: '保存', exact: true }))
      await reopened.getByRole('button', { name: '保存', exact: true }).click()
      await expect(reopened.getByText('已保存到账号', { exact: true }).first()).toBeVisible()
      expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await reopened.screenshot({ path: testInfo.outputPath(`custom-free-${viewport.width}.png`) })
    }
    const downloading = reopened.waitForEvent('download')
    await reopened.getByRole('button', { name: '导出', exact: true }).click()
    const downloaded = await (await downloading).path()
    if (!downloaded) throw new Error('The design JSON download failed.')
    const exported = DroneDesignSnapshotSchema.parse(JSON.parse(await readFile(downloaded, 'utf8')))
    expect(exported.parts[0]!.source).toEqual(source)
    expect(exported.parts[0]!.position[0]).toBe(0.025)
    await reopened.getByRole('button', { name: '预览', exact: true }).click()
    await expect(reopened.getByRole('dialog', { name: '预览', exact: true })).toBeVisible()
    await expect(reopened.getByText('自制零件仅自由摆放，未连接，未验证制造与飞行。', { exact: true })).toBeVisible()
    await reopened.getByRole('button', { name: '我知道了', exact: true }).click()
    await reopened.goto(`/code/${original.id}`)
    await reopened.getByRole('button', { name: '从示例开始', exact: true }).click()
    await reopened.getByRole('button', { name: '保存', exact: true }).click()
    await expect(reopened.getByText('已与账号同步', { exact: true })).toBeVisible()
    await runSimulation(reopened)

    // Mutate only this dedicated test user's new source, never unrelated records.
    const authorization = { Authorization: `Bearer ${JSON.parse(auth).state.token as string}` }
    const detail = await restored.request.get(`/api/custom-parts/${source.id}`, { headers: authorization, maxRedirects: 0 })
    expect(detail.status()).toBe(200)
    const originalSource = (await detail.json()).data
    const otherContext = await browser.newContext({ baseURL, serviceWorkers: 'block' })
    await guardLocalNetwork(otherContext)
    try {
      const otherPage = await otherContext.newPage()
      await registerDedicatedAccount(otherPage)
      const foreignToken = await otherPage.evaluate(() => JSON.parse(localStorage.getItem('auth-storage')!).state.token as string)
      const denied = await otherContext.request.get(`/api/custom-parts/${source.id}`, { headers: { Authorization: `Bearer ${foreignToken}` }, maxRedirects: 0 })
      expect(denied.status(), 'Other accounts cannot resolve a private source').toBe(404)
    } finally { await otherContext.close() }
    const update = await restored.request.put(`/api/custom-parts/${source.id}`, { headers: authorization, maxRedirects: 0, data: { ...originalSource, name: `${name} changed` } })
    expect(update.status()).toBe(200)
    await reopened.goto(`/design/${original.id}`)
    await expect(reopened.getByText(/原零件已修改/).first()).toBeVisible()
    expect((await readDesign(reopened))!.parts[0]!.source).toEqual(source)
    deletedSourcePath = `/api/custom-parts/${source.id}`
    const deleted = await restored.request.delete(deletedSourcePath, { headers: authorization, maxRedirects: 0 })
    expect(deleted.status()).toBe(200)
    await reopened.reload()
    await expect(reopened.getByText(/自制零件不可用/).first()).toBeVisible()
    expect((await readDesign(reopened))!.parts).toHaveLength(3)
    await reopened.getByRole('button', { name: '保存', exact: true }).click()
    await expect(reopened.getByText('已保存到账号', { exact: true }).first()).toBeVisible()
    expect(restoredErrors).toEqual([])
    expect(errors).toEqual([])
  } finally { await restored.close() }
})
