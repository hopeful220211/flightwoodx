import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { join } from 'node:path'
import { dragMillimetres, drawStarterRectangle, drawStudioShape, screenPoint } from './part-studio-helpers'

/** Real local UI/geometry/WebGL only. These guest checks never create accounts
 * or write custom parts; the isolated-API core flow covers saving and assembly. */
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

function observePage(page: Page) {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error'
      || message.text().includes('Texture marked for update but no image data found')) failures.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })
  page.on('requestfailed', request => {
    // Switching away from registration can cancel obsolete image requests.
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) {
      failures.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`)
    }
  })
  return failures
}

async function enterGuestStudio(page: Page) {
  await page.goto('/register')
  await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(await page.evaluate(() => {
    const stored = localStorage.getItem('auth-storage')
    const state = stored ? JSON.parse(stored).state : null
    return state?.user?.isGuest === true && state.token === null && state.isAuthenticated === true
  }), 'Use a real token-free guest session, not an injected login').toBe(true)
  await page.goto('/part-studio')
  await expect(page.getByRole('heading', { name: '二维设计', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
}

async function setDimension(page: Page, name: string, value: number) {
  const input = page.getByRole('spinbutton', { name: `${name}（毫米）`, exact: true })
  await input.fill(String(value))
  await input.press('Enter')
  await expect(input).toHaveValue(String(value))
  await expect(input).toHaveAttribute('aria-invalid', 'false')
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

async function expectWoodPreview(page: Page, width: number, height: number) {
  const preview = page.getByTestId('part-3d-preview')
  await expect(preview).toHaveAttribute('data-wood-ready', 'true')
  await expect(preview.getByText(`${width} × ${height} × 2 mm`, { exact: true })).toBeVisible()
  await expect(preview.getByText('木板厚度 2 mm · 网格 10 mm', { exact: true })).toBeVisible()
  await expect(preview.locator('canvas')).toBeVisible()
  const canvasSize = await preview.locator('canvas').evaluate(canvas => ({
    width: (canvas as HTMLCanvasElement).width,
    height: (canvas as HTMLCanvasElement).height,
  }))
  expect(canvasSize.width).toBeGreaterThan(0)
  expect(canvasSize.height).toBeGreaterThan(0)
  const toolbarBox = await preview.getByTestId('part-3d-toolbar').boundingBox()
  const canvasBox = await preview.locator('canvas').boundingBox()
  const hintBox = await preview.getByTestId('part-3d-hint').boundingBox()
  expect(toolbarBox).not.toBeNull()
  expect(canvasBox).not.toBeNull()
  expect(hintBox).not.toBeNull()
  expect(canvasBox!.y, 'Wrapping view controls must not cover the physical board').toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height - 1)
  expect(hintBox!.y, 'The rotation hint must remain below the fitted board viewport').toBeGreaterThanOrEqual(canvasBox!.y + canvasBox!.height - 1)
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  await expectNoOverflow(page)
  return preview
}

async function capture(page: Page, name: string, region?: Locator) {
  if (!process.env.FWX_UI_CAPTURE_DIR) return
  await page.evaluate(() => document.fonts.ready)
  const path = join(process.env.FWX_UI_CAPTURE_DIR, `${name}.png`)
  if (region) await region.screenshot({ path, animations: 'disabled' })
  else {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  }
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`part studio dimensions, real cutouts, 2mm wood and history at ${viewport.width}×${viewport.height}`, async ({ page, context }) => {
    const failures = observePage(page)
    await guardLocalNetwork(context)
    await page.setViewportSize(viewport)
    await enterGuestStudio(page)
    const save = page.getByRole('button', { name: '保存', exact: true })
    const shapes = page.getByTestId('sketch-canvas').locator('[data-shape-id]')
    const compiled = page.getByTestId('compiled-sketch')

    // Two-point dragging creates a precise rectangle without a closed stroke.
    await expect(page.getByRole('button', { name: '添加图形', exact: true })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: '选中图形', exact: true })).toHaveCount(0)
    await drawStarterRectangle(page)
    await expect(shapes).toHaveCount(1)
    await expect(page.getByRole('spinbutton', { name: '宽（毫米）', exact: true })).toHaveValue('60')
    await expect(page.getByRole('spinbutton', { name: '高（毫米）', exact: true })).toHaveValue('40')
    await expectWoodPreview(page, 60, 40)
    const widthInput = page.getByRole('spinbutton', { name: '宽（毫米）', exact: true })
    await widthInput.fill('2500')
    await widthInput.press('Enter')
    await expect(widthInput).toHaveAttribute('aria-invalid', 'true')
    await expect(save).toBeDisabled()
    await expect(shapes.first().locator('rect')).toHaveAttribute('width', '60')
    await widthInput.press('Escape')
    await expect(widthInput).toHaveValue('60')
    await expect(widthInput).toHaveAttribute('aria-invalid', 'false')
    await expectWoodPreview(page, 60, 40)
    await setDimension(page, '宽', 80)
    await setDimension(page, '高', 60)
    await setDimension(page, '圆角', 10)
    await expect(shapes.first().locator('rect')).toHaveAttribute('rx', '10')
    await expectWoodPreview(page, 80, 60)

    // A circular cut is an actual inner ring in the compiled SVG, not a red decal.
    await drawStudioShape(page, '圆孔', [61, 61], [69, 69])
    await expect(shapes).toHaveCount(2)
    await expect(page.getByRole('spinbutton', { name: '宽（毫米）', exact: true })).toHaveValue('8')
    await expect(page.getByRole('spinbutton', { name: '高（毫米）', exact: true })).toHaveValue('8')
    await expect(shapes.nth(1).locator('ellipse')).toHaveAttribute('rx', '4')
    await expect(page.getByText('零件范围 80 × 60 mm · 1 个内孔', { exact: true })).toBeVisible()
    expect((await compiled.getAttribute('d'))?.match(/M /g)).toHaveLength(2)
    const contourWithHole = await compiled.getAttribute('d')

    // A freely drawn 2mm cut crosses the outer edge, changing the outer contour
    // without creating a second enclosed hole.
    await drawStudioShape(page, '孔 / 开口', [74, 44], [76, 56])
    await expect(shapes).toHaveCount(3)
    await expect(page.getByRole('spinbutton', { name: '宽（毫米）', exact: true })).toHaveValue('2')
    await expect(page.getByRole('spinbutton', { name: '高（毫米）', exact: true })).toHaveValue('12')
    await expect(shapes.nth(2).locator('rect')).toHaveAttribute('width', '2')
    await expect(page.getByText('零件范围 80 × 60 mm · 1 个内孔', { exact: true })).toBeVisible()
    expect((await compiled.getAttribute('d'))?.match(/M /g)).toHaveLength(2)
    expect(await compiled.getAttribute('d')).not.toBe(contourWithHole)
    const finishedContour = await compiled.getAttribute('d')
    const preview = await expectWoodPreview(page, 80, 60)
    const views = preview.getByRole('group', { name: '三维视角', exact: true })
    for (const selected of ['俯视', '侧视', '立体']) {
      await views.getByRole('button', { name: selected, exact: true }).click()
      for (const name of ['立体', '俯视', '侧视']) {
        await expect(views.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', String(name === selected))
      }
      await expectWoodPreview(page, 80, 60)
      await capture(page, `part-studio-${viewport.width}-${selected}`, preview)
    }
    await views.getByRole('button', { name: '俯视', exact: true }).click()
    await views.getByRole('button', { name: '复位', exact: true }).click()
    await expect(views.getByRole('button', { name: '立体', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await capture(page, `part-studio-${viewport.width}`)

    // Reducing the reference must reject an oversized part, never rescale it.
    await setDimension(page, '参考宽', 40)
    await expect(page.getByRole('alert')).toContainText('图形超出参考范围')
    await expect(page.getByRole('alert')).toContainText('移回橙色参考框内，或增大参考尺寸。')
    await expect(save).toBeDisabled()
    await expect(page.getByTestId('part-3d-preview')).toHaveCount(0)
    await expect(shapes.first().locator('rect')).toHaveAttribute('width', '80')
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: '参考宽（毫米）', exact: true })).toHaveValue('130')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(compiled).toHaveAttribute('d', finishedContour!)
    await expectWoodPreview(page, 80, 60)

    await page.getByRole('button', { name: '清空', exact: true }).click()
    await expect(shapes).toHaveCount(0)
    await expect(save).toBeDisabled()
    await expect(page.getByTestId('part-3d-preview')).toHaveCount(0)
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(shapes).toHaveCount(3)
    await expect(compiled).toHaveAttribute('d', finishedContour!)
    await expectWoodPreview(page, 80, 60)
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(shapes).toHaveCount(0)
    await expect(save).toBeDisabled()
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expectWoodPreview(page, 80, 60)

    // A short rectangular reference still creates a circle, not an ellipse
    // silently squeezed along its height.
    await page.getByRole('button', { name: '清空', exact: true }).click()
    await page.getByRole('combobox', { name: '参考类型', exact: true }).selectOption('landing')
    await expect(page.getByRole('spinbutton', { name: '参考宽（毫米）', exact: true })).toHaveValue('80')
    await expect(page.getByRole('spinbutton', { name: '参考高（毫米）', exact: true })).toHaveValue('50')
    await drawStudioShape(page, '圆形', [20, 5], [60, 45])
    await expect(shapes).toHaveCount(1)
    await expect(shapes.first().locator('ellipse')).toHaveAttribute('rx', '20')
    await expect(shapes.first().locator('ellipse')).toHaveAttribute('ry', '20')
    await expectWoodPreview(page, 40, 40)
    await expectNoOverflow(page)
    expect(failures).toEqual([])
  })
}

test('real SVG drawing supports drag rectangles, explicit polygon closure, vertex editing and mirror', async ({ page, context }) => {
  const failures = observePage(page)
  await guardLocalNetwork(context)
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterGuestStudio(page)
  const canvas = page.getByTestId('sketch-canvas')
  const shapes = canvas.locator('[data-shape-id]')
  const tools = page.getByRole('group', { name: '绘图工具', exact: true })
  const save = page.getByRole('button', { name: '保存', exact: true })
  await dragMillimetres(page, canvas, [20, 20], [80, 60])
  await expect(shapes).toHaveCount(1)
  await expect(shapes.first().locator('rect')).toHaveAttribute('width', '60')
  await expect(shapes.first().locator('rect')).toHaveAttribute('height', '40')
  await expectWoodPreview(page, 60, 40)

  await tools.getByRole('button', { name: '多边形', exact: true }).click()
  await canvas.scrollIntoViewIfNeeded()
  for (const [x, y] of [[75, 35], [110, 35], [100, 65], [75, 55]]) {
    const point = await screenPoint(canvas, x, y)
    await page.mouse.click(point.x, point.y)
  }
  await expect(shapes).toHaveCount(1)
  await expect(save).toBeDisabled()
  await expect(page.getByRole('button', { name: '完成闭合', exact: true })).toBeEnabled()
  await canvas.press('Enter')
  await expect(shapes).toHaveCount(2)
  await expect(shapes.nth(1).locator('path')).toHaveAttribute('d', / Z$/)
  await expectWoodPreview(page, 90, 45)

  await tools.getByRole('button', { name: '选择', exact: true }).click()
  await page.getByRole('button', { name: '编辑顶点', exact: true }).click()
  await expect(canvas.locator('[data-vertex-index]')).toHaveCount(4)
  const originalPolygon = await shapes.nth(1).locator('path').getAttribute('d')
  await dragMillimetres(page, canvas, [75, 35], [70, 30])
  await expect(shapes.nth(1).locator('path')).not.toHaveAttribute('d', originalPolygon!)
  await expectWoodPreview(page, 90, 45)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(shapes.nth(1).locator('path')).toHaveAttribute('d', originalPolygon!)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(shapes.nth(1).locator('path')).not.toHaveAttribute('d', originalPolygon!)

  const beforeMirror = await page.getByTestId('compiled-sketch').getAttribute('d')
  await page.getByRole('checkbox', { name: '左右镜像', exact: true }).check()
  await expect(canvas.locator('g[transform="translate(130 0) scale(-1 1)"]')).toHaveCount(1)
  await expect(page.getByTestId('compiled-sketch')).not.toHaveAttribute('d', beforeMirror!)
  await expectWoodPreview(page, 90, 45)
  await expectNoOverflow(page)
  await capture(page, 'part-studio-svg-drawing')
  expect(failures).toEqual([])
})
