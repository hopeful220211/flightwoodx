import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test'
import { DroneDesignSnapshotSchema } from '@fwx/parts-schema'
import { drawStarterRectangle } from './part-studio-helpers'

/** New private local account and designs only. Fault injection is confined to
 * this test's save request; successful writes still reach the isolated API. */
async function localOnly(context: BrowserContext) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) await route.abort('blockedbyclient')
    else await route.continue()
  })
}

function observe(page: Page, expectedFailure: () => boolean) {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !(expectedFailure() && message.text().includes('503'))) failures.push(message.text())
    if (message.text().includes('Texture marked for update but no image data found')) failures.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 400 && !(expectedFailure() && response.status() === 503 && isDesignSave(response))) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })
  page.on('requestfailed', request => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(`${request.failure()?.errorText} ${new URL(request.url()).pathname}`)
  })
  return failures
}

function isDesignSave(response: Response) {
  return new URL(response.url()).pathname === '/api/drone-designs' && response.request().method() === 'PUT'
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
    expect(response.ok(), `The isolated API must create the dedicated test account (HTTP ${response.status()})`).toBe(true)
    await expect(page).toHaveURL(/\/dashboard$/)
  } finally {
    if (await page.getByLabel('密码', { exact: true }).count()) await page.getByLabel('密码', { exact: true }).fill('').catch(() => {})
  }
  return '自制主机身'
}

async function readDesign(page: Page) {
  const raw = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('drone_app_design_store')!).state
    return state.designs.find((design: { id: string }) => design.id === state.activeDesignId)
  })
  return DroneDesignSnapshotSchema.parse(raw)
}

async function capture(page: Page, prefix: string, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page content must fit the viewport').toBe(true)
  await page.evaluate(() => document.fonts.ready)
  if (process.env.FWX_UI_CAPTURE_DIR) await page.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `${prefix}-${width}.png`), animations: 'disabled' })
}

async function captureSection(page: Page, section: Locator, prefix: string, width: number) {
  // Visit every reveal block so a tall mobile section is not captured before
  // its below-the-fold content has entered the viewport and loaded its images.
  for (const block of await section.locator('div[style*="opacity:"]').all()) {
    await block.scrollIntoViewIfNeeded()
    await expect(block).toHaveCSS('opacity', '1')
  }
  for (const image of await section.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect(image).toBeVisible()
    await image.evaluate(async element => { await (element as HTMLImageElement).decode() })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page content must fit the viewport').toBe(true)
  await page.evaluate(() => document.fonts.ready)
  // Align captures below the existing fixed navigation after visiting the last
  // image; the screenshot should not put that bar across the section's content.
  await section.evaluate(element => {
    const header = document.querySelector('header')
    const inset = header && getComputedStyle(header).position === 'fixed' ? header.getBoundingClientRect().bottom : 0
    window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - inset, behavior: 'instant' })
  })
  if (process.env.FWX_UI_CAPTURE_DIR) await section.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `${prefix}-${width}.png`), animations: 'disabled' })
}

async function expectWoodPreview(canvas: Locator) {
  // A visible canvas can still be its blank loading frame. Check the rendered
  // wood and wait for the fit-to-model camera animation to settle before capture.
  let previousRatio = Number.NaN
  let stableFrames = 0
  await expect.poll(async () => {
    const { data, info } = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let woodPixels = 0
    for (let index = 0; index < data.length; index += info.channels) {
      const [red, green, blue] = [data[index]!, data[index + 1]!, data[index + 2]!]
      if (red > 80 && green > 45 && red > blue + 15) woodPixels += 1
    }
    const ratio = woodPixels / (info.width * info.height)
    stableFrames = ratio > 0.005 && Math.abs(ratio - previousRatio) < 0.0001 ? stableFrames + 1 : 0
    previousRatio = ratio
    return stableFrames
  }, { message: 'The preview must display the wooden part with a settled camera', intervals: [100, 200, 400] }).toBeGreaterThanOrEqual(3)
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`concise product copy and actionable design feedback at ${viewport.width}×${viewport.height}`, async ({ page, context }) => {
    await localOnly(context)
    let forcedSaveFailure = false
    const failures = observe(page, () => forcedSaveFailure)
    await page.setViewportSize(viewport)

    await page.goto('/')
    const features = page.locator('section').filter({ has: page.getByRole('heading', { name: '平台功能', exact: true }) })
    await features.scrollIntoViewIfNeeded()
    await expect(features).toContainText('在模拟环境中查看运行过程并调整程序。')
    await expect(features).not.toContainText(/未验证|不代表|需要验证/)
    await captureSection(page, features, 'concise-home', viewport.width)

    await page.goto('/about')
    const company = page.getByRole('region', { name: '公司介绍', exact: true })
    await company.scrollIntoViewIfNeeded()
    await expect(company).toContainText('线下内容包括木质结构拼装与无人机课程。')
    await expect(page.locator('main')).not.toContainText(/不能替代实机|不代表|未验证|需要验证/)
    await capture(page, 'concise-about', viewport.width)

    const name = await register(page)
    await page.goto('/part-studio')
    await drawStarterRectangle(page)
    await page.getByLabel('零件名称', { exact: true }).fill(name)
    const creating = page.waitForResponse(response => new URL(response.url()).pathname === '/api/custom-parts' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    expect((await creating).status()).toBe(201)
    await page.getByRole('button', { name: `放入自由拼装：${name}`, exact: true }).click()
    const placeDialog = page.getByRole('dialog', { name: '放入自由拼装', exact: true })
    await expect(placeDialog).toContainText('放入后可调整位置和旋转。自制零件暂不支持自动连接。')
    await expect(placeDialog).not.toContainText(/未验证|不代表|尚未连接/)
    await page.getByLabel('自由作品名称', { exact: true }).fill(`${name} 作品`)
    await placeDialog.getByRole('button', { name: '确认放入', exact: true }).click()
    await expect(page).toHaveURL(/\/design\/design-[^/]+$/)
    await expect(page.getByText('已保存到账号', { exact: true }).first()).toBeVisible()
    const original = await readDesign(page)
    expect(original.parts).toHaveLength(1)
    expect(original.parts[0]!.source?.kind).toBe('custom')
    expect(original.parts[0]!.attachedTo).toBeNull()

    const expandParts = page.getByRole('button', { name: '展开零件列表', exact: true })
    if (await expandParts.count()) await expandParts.click()
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await expect(page.getByLabel('自制零件 X 位置（毫米）')).toBeVisible()
    await expect(page.getByText('自由摆放', { exact: true })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/设计检查|未安装官方主板|请先添加主板，再连接官方零件|未验证|不代表|尚未验证/)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: /已保存「.*」到我的零件|零件已放入自由作品并保存/ })).toHaveCount(0)
    await capture(page, 'concise-design', viewport.width)
    await page.getByRole('button', { name: '收起零件列表', exact: true }).click()
    await expect(expandParts).toBeVisible()
    await expect(page.getByLabel('自制零件 X 位置（毫米）')).toHaveCount(0)
    await expandParts.click()
    await expect(page.getByLabel('自制零件 X 位置（毫米）')).toBeVisible()
    expect((await readDesign(page)).parts).toEqual(original.parts)

    await page.getByRole('button', { name: '预览', exact: true }).click()
    const preview = page.getByRole('dialog', { name: '预览', exact: true })
    await expect(preview.locator('canvas')).toBeVisible()
    await expectWoodPreview(preview.locator('canvas'))
    await expect(preview).not.toContainText(/未验证|不代表|尚未连接|自由摆放/)
    await capture(page, 'concise-design-preview', viewport.width)
    await preview.getByRole('button', { name: '关闭预览', exact: true }).click()

    // Removing generic warnings must not hide an actual failed account save.
    forcedSaveFailure = true
    await page.route('**/api/drone-designs', async route => {
      if (route.request().method() === 'PUT') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试：账号保存暂时失败' }) })
      else await route.continue()
    })
    const rejecting = page.waitForResponse(response => isDesignSave(response) && response.status() === 503)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    expect((await rejecting).status()).toBe(503)
    await expect(page.getByText('账号保存失败，请重试', { exact: true })).toBeVisible()
    expect((await readDesign(page)).parts).toEqual(original.parts)
    await capture(page, 'concise-design-save-error', viewport.width)
    await page.unroute('**/api/drone-designs')
    forcedSaveFailure = false
    const saving = page.waitForResponse(isDesignSave)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    expect((await saving).ok()).toBe(true)
    await expect(page.getByText('已保存到账号', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('账号保存失败，请重试', { exact: true })).toHaveCount(0)

    await page.goto(`/simulator/${original.id}`)
    await expect(page.getByText('视觉仿真 · 查看程序运行过程', { exact: true })).toBeVisible()
    await expect(page.getByText('当前作品还没有可运行的程序，请返回积木编程添加或修正积木。', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '运行', exact: true })).toBeDisabled()
    await expect(page.getByRole('link', { name: '返回积木编程', exact: true })).toHaveAttribute('href', `/code/${original.id}`)
    await expect(page.locator('body')).not.toContainText(/未验证|不代表|不验证|仅自由摆放/)
    await capture(page, 'concise-simulator', viewport.width)

    // App.tsx registers /design/export-preview/:designId. Create an ordinary
    // guided work through the UI, and first verify its actual missing-part error.
    await page.goto('/dashboard')
    await page.getByRole('button', { name: '新建作品', exact: true }).first().click()
    await page.getByLabel('无人机名字', { exact: true }).fill('官方零件设计')
    await page.getByRole('button', { name: '开始搭建', exact: true }).click()
    await expect(page).toHaveURL(/\/design\/design-[^/]+$/)
    const officialId = new URL(page.url()).pathname.split('/').at(-1)!
    await page.goto(`/design/export-preview/${officialId}`)
    const report = page.locator('section').filter({ has: page.getByRole('heading', { name: '设计检查', exact: true }) })
    await report.scrollIntoViewIfNeeded()
    await expect(report.getByText('缺少主板', { exact: true })).toBeVisible()
    await expect(report.getByText('返回第 1 步选择主板', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '请先处理检查错误', exact: true })).toBeDisabled()
    await expect(report).not.toContainText(/总分|综合得分|不代表|尚未验证|需要验证|实机飞行/)
    await expect(report.locator('details')).toHaveJSProperty('open', false)
    await expect(report.locator('summary')).toHaveText('查看 11 项其他检查结果')
    await expect(report.getByText('未添加起落架', { exact: true })).toBeHidden()
    await captureSection(page, report, 'concise-export-error', viewport.width)

    await page.getByRole('button', { name: '返回继续修改', exact: true }).click()
    const savingOfficial = page.waitForResponse(response => isDesignSave(response)
      && response.request().postDataJSON().localId === officialId
      && response.request().postDataJSON().designData?.parts.length === 1)
    await page.getByRole('button', { name: '添加主板件01', exact: true }).click()
    await expect.poll(async () => (await readDesign(page)).parts.length).toBe(1)
    // GuidedDesignPage automatically saves each edit; the manual draft button
    // appears only in its final step, not while choosing this mainboard.
    expect((await savingOfficial).ok()).toBe(true)
    await page.goto(`/design/export-preview/${officialId}`)
    await report.scrollIntoViewIfNeeded()
    await expect(report.getByText('2 项正常', { exact: true })).toBeVisible()
    await expect(report.getByText('缺少主板', { exact: true })).toHaveCount(0)
    await expect(report.getByText('未添加起落架', { exact: true })).toBeHidden()
    await expect(report).not.toContainText(/总分|综合得分|不代表|尚未验证|需要验证|实机飞行/)
    const otherResults = report.locator('details')
    await expect(otherResults).toHaveJSProperty('open', false)
    await expect(otherResults.locator('summary')).toHaveText('查看 12 项其他检查结果')
    await expect(report.getByText('主板 1 个', { exact: true })).toBeHidden()
    await otherResults.locator('summary').click()
    await expect(otherResults).toHaveJSProperty('open', true)
    await expect(report.getByText('未添加起落架', { exact: true })).toBeVisible()
    await expect(report.getByText('主板 1 个', { exact: true })).toBeVisible()
    await expect(report.getByText('零件连接可追溯到主板', { exact: true })).toBeVisible()
    await otherResults.locator('summary').click()
    await expect(otherResults).toHaveJSProperty('open', false)
    const exportDescription = page.getByText('本次不含切割图', { exact: false })
    await exportDescription.scrollIntoViewIfNeeded()
    await expect(exportDescription).toBeVisible()
    await expect(page.getByRole('button', { name: '导出设计记录', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await captureSection(page, report, 'concise-export', viewport.width)
    expect(failures).toEqual([])
  })
}
