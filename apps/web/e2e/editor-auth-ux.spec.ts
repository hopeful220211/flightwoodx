import { randomBytes } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { dragMillimetres, drawStarterRectangle, screenPoint } from './part-studio-helpers'

async function register(page: Page) {
  const username = `e2e_${randomBytes(6).toString('hex')}`
  const email = `${username}@example.test`
  const password = randomBytes(24).toString('base64url')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('邮箱', { exact: true }).fill(email)
  await page.getByRole('checkbox', { name: /我已阅读并同意/ }).check()
  try {
    try { await page.getByLabel('密码', { exact: true }).fill(password) } catch { throw new Error('Cannot fill isolated test credential') }
    const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/auth/register')
    await page.getByRole('button', { name: '创建账号', exact: true }).click()
    expect((await response).status()).toBe(201)
  } finally {
    if (await page.getByLabel('密码', { exact: true }).count()) await page.getByLabel('密码', { exact: true }).fill('').catch(() => {})
  }
  return { email, password }
}

test('anonymous start requires login, cancellation clears intent, real registration and login resume once', async ({ page, browser, baseURL }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const start = page.getByRole('button', { name: '开始设计', exact: true }).first()
  await start.click()
  const login = page.getByRole('dialog', { name: '登录', exact: true })
  await expect(login).toBeVisible()
  await expect(page).toHaveURL(baseURL! + '/')
  await login.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(login).toHaveCount(0)
  await page.reload()
  await expect(login).toHaveCount(0)
  await start.click()
  await login.getByRole('button', { name: '注册账号', exact: true }).click()
  const credentials = await register(page)
  await expect(page).toHaveURL(/\/design(?:\/[^/]+)?$/)
  await page.goBack()
  await expect(page).toHaveURL(baseURL! + '/')
  await expect(login).toHaveCount(0)
  const fresh = await browser.newContext({ baseURL })
  try {
    const other = await fresh.newPage()
    await other.goto('/design')
    const dialog = other.getByRole('dialog', { name: '登录', exact: true })
    await expect(dialog).toBeVisible()
    await expect(other).toHaveURL(baseURL! + '/')
    await dialog.getByLabel('邮箱', { exact: true }).fill(credentials.email)
    try { await dialog.getByLabel('密码', { exact: true }).fill(credentials.password) } catch { throw new Error('Cannot fill isolated login credential') }
    await dialog.getByRole('button', { name: '登录', exact: true }).click()
    await expect(other).toHaveURL(/\/design(?:\/[^/]+)?$/)
    await other.goBack()
    await expect(other).toHaveURL(baseURL! + '/')
    await expect(dialog).toHaveCount(0)
  } finally { await fresh.close() }
  expect(errors).toEqual([])
})

async function penShape(page: Page) {
  await page.getByRole('button', { name: '钢笔', exact: true }).click()
  const canvas = page.getByTestId('sketch-canvas')
  await dragMillimetres(page, canvas, [35, 45], [45, 35])
  await dragMillimetres(page, canvas, [80, 45], [90, 55])
  await dragMillimetres(page, canvas, [70, 80], [55, 85])
  await page.keyboard.press('Meta+z')
  await expect(page.getByText('2 / 128 个顶点', { exact: true })).toBeVisible()
  await page.keyboard.press('Meta+Shift+z')
  await expect(page.getByText('3 / 128 个顶点', { exact: true })).toBeVisible()
  const first = await screenPoint(canvas, 35, 45)
  await page.mouse.click(first.x, first.y)
  await expect(canvas.locator('[data-shape-id]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '选择', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
  return canvas
}

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`pen, smooth freehand, manual rounding and editor shortcuts at ${viewport.width}`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/part-studio')
    const canvas = await penShape(page)
    const source = canvas.locator('[data-shape-id]').first()
    const original = await source.locator('path').getAttribute('d')
    expect(original).toContain(' C ')
    await page.getByRole('button', { name: '编辑顶点', exact: true }).click()
    await expect(canvas.locator('[data-curve-handle]')).toHaveCount(6)
    await canvas.scrollIntoViewIfNeeded()
    const node = await canvas.locator('[data-vertex-index="0"] circle').boundingBox()
    await page.mouse.move(node!.x + node!.width / 2, node!.y + node!.height / 2)
    await page.mouse.down(); await page.mouse.move(node!.x + node!.width / 2 - 8, node!.y + node!.height / 2 + 4); await page.mouse.up()
    expect(await source.locator('path').getAttribute('d')).not.toBe(original)
    const afterNode = await source.locator('path').getAttribute('d')
    const control = await canvas.locator('[data-curve-handle="0-in"] circle').boundingBox()
    await page.mouse.move(control!.x + control!.width / 2, control!.y + control!.height / 2)
    await page.mouse.down(); await page.mouse.move(control!.x + control!.width / 2 - 5, control!.y + control!.height / 2 + 5); await page.mouse.up()
    expect(await source.locator('path').getAttribute('d')).not.toBe(afterNode)
    await canvas.focus()
    // Chromium on macOS uses Meta for native clipboard; Ctrl is verified on history too.
    await page.keyboard.press('Meta+c')
    await page.keyboard.press('Meta+v')
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
    await page.keyboard.press('Meta+z')
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(1)
    await page.keyboard.press('Control+y')
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
    await page.keyboard.press('Delete')
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(1)
    await page.getByRole('button', { name: '清空', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '清空画布', exact: true })
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(1)
    await page.getByRole('button', { name: '清空', exact: true }).click()
    await dialog.getByRole('button', { name: '确认清空', exact: true }).click()
    await drawStarterRectangle(page)
    const plain = await page.getByTestId('compiled-sketch').getAttribute('d')
    await page.getByRole('button', { name: '轮廓圆角', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: '开启轮廓圆角' })).not.toBeChecked()
    await page.getByRole('checkbox', { name: '开启轮廓圆角' }).check()
    await expect(page.getByTestId('compiled-sketch')).not.toHaveAttribute('d', plain!)
    await page.getByRole('checkbox', { name: '开启轮廓圆角' }).uncheck()
    await expect(page.getByTestId('compiled-sketch')).toHaveAttribute('d', plain!)
    await page.getByRole('button', { name: '关闭圆角设置' }).click()
    await page.getByRole('button', { name: '清空', exact: true }).click()
    await dialog.getByRole('button', { name: '确认清空', exact: true }).click()
    await page.getByRole('button', { name: '自由画', exact: true }).click()
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * Math.PI * 2
      const point = await screenPoint(canvas, 60.3 + Math.cos(a) * 20, 60.4 + Math.sin(a) * 20)
      await page.mouse.move(point.x, point.y)
      if (i === 0) await page.mouse.down()
    }
    await page.mouse.up()
    await page.getByRole('button', { name: '完成闭合', exact: true }).click()
    await expect(source.locator('path')).toHaveAttribute('d', / C /)
    await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const toolbar = await page.getByTestId('sketch-toolbar').boundingBox()
    const drawing = await canvas.boundingBox()
    expect(toolbar!.y, 'Drawing area and toolbar must not overlap').toBeGreaterThanOrEqual(drawing!.y + drawing!.height - 1)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({ path: `/tmp/fwx-editor-ux-${viewport.width}.png`, fullPage: true })
    expect(errors).toEqual([])
  })
}

test('curved rounded part saves real geometry, reloads and enters a saved assembly', async ({ page }) => {
  await page.goto('/register')
  await register(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/part-studio')
  await penShape(page)
  await page.getByRole('button', { name: '轮廓圆角', exact: true }).click()
  await page.getByRole('checkbox', { name: '开启轮廓圆角' }).check()
  await page.getByRole('button', { name: '关闭圆角设置' }).click()
  const name = `Curve ${randomBytes(4).toString('hex')}`
  await page.getByLabel('零件名称', { exact: true }).fill(name)
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/custom-parts')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(201)
  const geometry = response.request().postDataJSON().geometry
  expect(geometry.thicknessMm).toBe(2)
  expect(geometry.contour.match(/L/g).length).toBeGreaterThan(20)
  await page.reload()
  await page.getByRole('button', { name: `放入作品：${name}`, exact: true }).click()
  await page.getByLabel('新作品名称', { exact: true }).fill(name)
  await page.getByLabel('新作品拼装方式', { exact: true }).selectOption('free')
  await page.getByRole('button', { name: '确认放入', exact: true }).click()
  await expect(page).toHaveURL(/\/design\/design-/)
  await expect(page.getByText('已保存到账号', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByText('已保存到账号', { exact: true }).first()).toBeVisible()
})
