import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { expect, test, type BrowserContext, type Page, type Response } from '@playwright/test'
import { UserPartDefSchema, UserPartSchema, type UserPartDTO } from '@fwx/parts-schema'
import { svgGeometryToPart2D, validateJointGuides } from '@fwx/geometry'
import { dragMillimetres, drawStarterRectangle, drawStudioShape } from './part-studio-helpers'

/** Dedicated local test account only. One injected failed POST is followed by
 * real API/database writes and read-back. No production URL, external request,
 * copied work cache, or deletion of existing user data is permitted here.
 */
async function localOnly(context: BrowserContext) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) await route.abort('blockedbyclient')
    else await route.continue()
  })
}

function observe(page: Page, expectedFailure: () => boolean = () => false) {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !(expectedFailure() && message.text().includes('503'))) failures.push(message.text())
    if (message.text().includes('Texture marked for update but no image data found')) failures.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 400 && !(expectedFailure() && response.status() === 503 && isCustomPart(response, 'POST'))) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })
  page.on('requestfailed', request => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(`${request.failure()?.errorText} ${new URL(request.url()).pathname}`)
  })
  return failures
}

function isCustomPart(response: Response, method: string) {
  return new URL(response.url()).pathname === '/api/custom-parts' && response.request().method() === method
}

async function register(page: Page) {
  const username = `e2e_${randomBytes(6).toString('hex')}`
  const password = randomBytes(24).toString('base64url')
  await page.goto('/register')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('邮箱', { exact: true }).fill(`${username}@example.test`)
  try {
    try { await page.getByLabel('密码', { exact: true }).fill(password) }
    catch { throw new Error('Could not fill the isolated registration password field.') }
    const registering = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '创建账号', exact: true }).click()
    const response = await registering
    expect(response.ok(), 'The isolated API must create the dedicated test account').toBe(true)
    await expect(page).toHaveURL(/\/dashboard$/)
  } finally {
    if (await page.getByLabel('密码', { exact: true }).count()) await page.getByLabel('密码', { exact: true }).fill('').catch(() => {})
  }
  return `Joint ${username}`
}

async function drawJoint(page: Page, kind: '板内插槽' | '边缘插槽', from: [number, number], to: [number, number]) {
  const tools = page.getByRole('group', { name: '绘图工具', exact: true })
  if (kind === '边缘插槽') await tools.getByRole('button', { name: '插接口', exact: true }).click()
  else {
    await tools.getByRole('button', { name: '孔 / 开口', exact: true }).click()
    await page.getByRole('region', { name: '开孔方式', exact: true }).getByRole('button', { name: kind, exact: true }).click()
  }
  const canvas = page.getByTestId('sketch-canvas')
  const count = await canvas.locator('[data-shape-id]').count()
  await dragMillimetres(page, canvas, from, to)
  await expect(canvas.locator('[data-shape-id]')).toHaveCount(count + 1)
  await tools.getByRole('button', { name: '选择', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: '槽宽（毫米）', exact: true })).toHaveValue('2')
  await expect(page.getByRole('spinbutton', { name: '槽宽（毫米）', exact: true })).toBeDisabled()
}

function verifySaved(part: UserPartDTO, name: string) {
  expect(part.name).toBe(name)
  expect(part.category).toBe('mainboard')
  expect(part.geometry).toMatchObject({ thicknessMm: 2, bboxMm: { w: 60, h: 40 } })
  expect(part.geometry.holes).toHaveLength(2)
  expect(part.sockets).toEqual([])
  expect(part.manufacturability.passed).toBe(false)
  expect(part.jointGuides?.map(({ kind, x, y, lengthMm, axis, entry }) => ({ kind, x, y, lengthMm, axis, entry }))).toEqual([
    { kind: 'through-slot', x: 9, y: 10, lengthMm: 10, axis: 'y', entry: 'front' },
    { kind: 'through-slot', x: 19, y: 10, lengthMm: 10, axis: 'y', entry: 'back' },
    { kind: 'edge-slot', x: 39, y: 0, lengthMm: 10, axis: 'y', entry: 'start' },
  ])
  const geometry = svgGeometryToPart2D(part.geometry)
  expect(validateJointGuides(geometry, part.jointGuides!).ok, 'Stored annotations must match the actual translated hole/notch geometry').toBe(true)
}

async function inspectSaved(page: Page, part: UserPartDTO, captureWidth?: number) {
  await page.getByRole('button', { name: `查看插槽：${part.name}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '插槽位置与方向', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('listitem')).toHaveCount(3)
  const direction = dialog.getByTestId('joint-direction')
  await expect(direction).toHaveCount(3)
  for (const label of ['从正面插入', '从背面插入', '从上向下插入']) await expect(dialog.locator(`[data-testid="joint-direction"][aria-label="${label}"]`)).toHaveCount(1)
  await expect(dialog.getByLabel('已保存插槽位置图', { exact: true }).locator('path').first()).toHaveAttribute('d', [part.geometry.contour, ...part.geometry.holes].join(' '))
  await expect(dialog.getByText('X 9 / Y 10 mm · 槽长 10 mm · 槽宽 2 mm', { exact: true })).toBeVisible()
  await expect(dialog.getByText('X 19 / Y 10 mm · 槽长 10 mm · 槽宽 2 mm', { exact: true })).toBeVisible()
  await expect(dialog.getByText('X 39 / Y 0 mm · 开口深度 10 mm · 槽宽 2 mm', { exact: true })).toBeVisible()
  const edgeEntry = dialog.getByText('3. 边缘插槽 · 从上向下插入', { exact: true })
  await expect(edgeEntry).toBeVisible()
  if (captureWidth !== undefined) {
    await page.evaluate(() => document.fonts.ready)
    await edgeEntry.scrollIntoViewIfNeeded()
    await expect(edgeEntry).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The restored page must not overflow horizontally').toBe(true)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Saved slot contents must fit inside the modal width').toBe(true)
    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(captureWidth + 1)
    if (process.env.FWX_UI_CAPTURE_DIR) await page.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `joint-saved-${captureWidth}.png`), animations: 'disabled' })
  }
  await dialog.getByRole('button', { name: '关闭模态框', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  if (captureWidth !== undefined) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Closing the modal must preserve the page width').toBe(true)
}

test('curved-edge insertion preserves its bottom in the real API and database', async ({ page, context }) => {
  await localOnly(context)
  const failures = observe(page)
  const name = await register(page)
  await page.goto('/part-studio')
  await drawStudioShape(page, '圆形', [35, 35], [95, 95])
  await drawStudioShape(page, '插接口', [80, 39.05], [80, 55])
  await page.getByLabel('零件名称', { exact: true }).fill(name)
  const writing = page.waitForResponse(response => isCustomPart(response, 'POST'))
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const response = await writing
  expect(response.status()).toBe(201)
  const created = UserPartSchema.parse((await response.json()).data)
  expect(created.jointGuides).toHaveLength(1)
  const guide = created.jointGuides![0]!
  expect(guide).toMatchObject({ kind: 'edge-slot', axis: 'y', entry: 'start' })
  expect(guide.y + guide.lengthMm).toBeCloseTo(20, 2)
  expect(validateJointGuides(svgGeometryToPart2D(created.geometry), created.jointGuides!).ok).toBe(true)
  // Finish the save-triggered list refresh before observing the reload request.
  await expect(page.getByRole('button', { name: `查看插槽：${name}`, exact: true })).toBeVisible()
  const reading = page.waitForResponse(response => isCustomPart(response, 'GET')).then(response => response.json())
  await page.reload()
  const restored = UserPartSchema.array().parse((await reading).data.items).find(item => item.id === created.id)!
  expect(restored.geometry).toEqual(created.geometry)
  expect(restored.jointGuides).toEqual(created.jointGuides)
  expect(failures).toEqual([])
})

test('joint slots: real save retry preserves geometry, direction and account-only restoration', async ({ page, context, browser, baseURL }) => {
  await localOnly(context)
  let forcedFailure = false
  let posts = 0
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/custom-parts' && request.method() === 'POST') posts++ })
  const failures = observe(page, () => forcedFailure)
  const name = await register(page)
  await page.goto('/part-studio')
  await drawStarterRectangle(page)
  await drawJoint(page, '板内插槽', [45, 55], [45, 65])
  await expect(page.getByLabel('插入方向', { exact: true })).toHaveValue('front')
  await drawJoint(page, '板内插槽', [55, 55], [55, 65])
  await page.getByLabel('插入方向', { exact: true }).selectOption('back')
  await drawJoint(page, '边缘插槽', [75, 45], [75, 55])
  const canvas = page.getByTestId('sketch-canvas')
  const compiled = page.getByTestId('compiled-sketch')
  const finalContour = await compiled.getAttribute('d')
  await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
  const save = page.getByRole('button', { name: '保存', exact: true })
  await expect(save).toBeEnabled()

  // An explicit but inactive joint blocks save without blanking valid wood.
  await drawJoint(page, '板内插槽', [105, 55], [105, 65])
  await expect(save).toBeDisabled()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(compiled).toHaveAttribute('d', finalContour!)
  await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
  expect(posts).toBe(0)
  await page.getByRole('button', { name: '删除图形', exact: true }).click()
  await expect(canvas.locator('[data-shape-id]')).toHaveCount(4)
  await expect(save).toBeEnabled()
  await page.getByLabel('零件名称', { exact: true }).fill(name)

  forcedFailure = true
  await page.route('**/api/custom-parts', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试：插槽保存暂时失败' }) })
    else await route.continue()
  })
  const rejectedPromise = page.waitForResponse(response => isCustomPart(response, 'POST'))
  await save.click()
  const rejected = await rejectedPromise
  expect(rejected.status()).toBe(503)
  await expect(page.getByText('测试：插槽保存暂时失败', { exact: true })).toBeVisible()
  await expect(page.getByLabel('零件名称', { exact: true })).toHaveValue(name)
  await expect(canvas.locator('[data-shape-id]')).toHaveCount(4)
  await expect(compiled).toHaveAttribute('d', finalContour!)
  await expect(save).toBeEnabled()
  await page.unroute('**/api/custom-parts')
  forcedFailure = false
  const createdPromise = page.waitForResponse(response => isCustomPart(response, 'POST'))
  await save.click()
  const createdResponse = await createdPromise
  expect(createdResponse.status()).toBe(201)
  const sent = UserPartDefSchema.parse(createdResponse.request().postDataJSON())
  expect(sent).toEqual(UserPartDefSchema.parse(rejected.request().postDataJSON()))
  const created = UserPartSchema.parse((await createdResponse.json()).data)
  verifySaved(created, name)
  expect(created.geometry).toEqual(sent.geometry)
  expect(created.jointGuides).toEqual(sent.jointGuides)
  expect(posts).toBe(2)
  await expect(canvas.locator('[data-shape-id]')).toHaveCount(0)
  await inspectSaved(page, created)

  const reloading = page.waitForResponse(response => isCustomPart(response, 'GET'))
  await page.reload()
  const loadedResponse = await reloading
  expect(loadedResponse.ok()).toBe(true)
  const loaded = UserPartSchema.array().parse((await loadedResponse.json()).data.items).find(part => part.id === created.id)
  expect(loaded?.geometry).toEqual(created.geometry)
  expect(loaded?.jointGuides).toEqual(created.jointGuides)
  await inspectSaved(page, created)

  const auth = await page.evaluate(() => localStorage.getItem('auth-storage'))
  if (!auth || !baseURL) throw new Error('The dedicated test session is unavailable.')
  const restored = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'auth-storage', value: auth }] }] } })
  await localOnly(restored)
  try {
    const reopened = await restored.newPage()
    const restoredFailures = observe(reopened)
    const reading = reopened.waitForResponse(response => isCustomPart(response, 'GET'))
    await reopened.goto('/part-studio')
    const freshResponse = await reading
    expect(freshResponse.ok()).toBe(true)
    const fresh = UserPartSchema.array().parse((await freshResponse.json()).data.items).find(part => part.id === created.id)
    expect(fresh).toBeDefined()
    verifySaved(fresh!, name)
    expect(fresh!.geometry).toEqual(created.geometry)
    expect(fresh!.jointGuides).toEqual(created.jointGuides)
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      await reopened.setViewportSize(viewport)
      await inspectSaved(reopened, fresh!, viewport.width)
    }
    expect(restoredFailures).toEqual([])
  } finally { await restored.close() }
  expect(failures).toEqual([])
})
