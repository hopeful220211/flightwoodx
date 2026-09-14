import { expect, test, type Locator, type Page } from '@playwright/test'
import { dragMillimetres, drawStarterRectangle, screenPoint } from './part-studio-helpers'

const errorsByPage = new WeakMap<Page, string[]>()
test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.abort('blockedbyclient')
    return route.continue()
  })
  const errors: string[] = []
  errorsByPage.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`) })
  page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`) })
})
test.afterEach(async ({ page }) => expect(errorsByPage.get(page)).toEqual([]))

async function chooseTool(page: Page, name: string, mode?: string) {
  const tools = page.getByRole('group', { name: '绘图工具', exact: true })
  await tools.getByRole('button', { name, exact: true }).click()
  if (mode) await page.getByRole('region', { name: '开孔方式', exact: true }).getByRole('button', { name: mode, exact: true }).click()
  await expect(tools.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
}

async function expectNewestSelected(page: Page, canvas: Locator, count: number) {
  const shapes = canvas.locator('[data-shape-id]')
  const tools = page.getByRole('group', { name: '绘图工具', exact: true })
  await expect(shapes).toHaveCount(count)
  await expect(tools.getByRole('button', { name: '选择', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(tools.locator('button[aria-pressed="true"]')).toHaveCount(1)
  await expect(page.getByRole('region', { name: '开孔方式', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '图形属性', exact: true })).toBeVisible()
  const outline = canvas.getByTestId('selection-outline')
  await expect(outline).toBeVisible()
  const bounds = await shapes.last().evaluate(element => {
    const box = (element as SVGGraphicsElement).getBBox()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  })
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Number(await outline.getAttribute(key)), `Selection ${key} must match the newly created shape`).toBeCloseTo(bounds[key], 4)
  }
}

async function clickCanvasPoint(page: Page, canvas: Locator, x: number, y: number) {
  const point = await screenPoint(canvas, x, y)
  expect(await canvas.evaluate((element, p) => element.contains(document.elementFromPoint(p.x, p.y)), point)).toBe(true)
  await page.mouse.click(point.x, point.y)
}

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`completed shapes immediately return to selection at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/register')
    await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/part-studio')
    await page.evaluate(() => document.fonts.ready)
    const canvas = await drawStarterRectangle(page)
    const shapes = canvas.locator('[data-shape-id]')
    const tool = (name: string) => page.getByRole('group', { name: '绘图工具', exact: true }).getByRole('button', { name, exact: true })
    await expectNewestSelected(page, canvas, 1)
    if (viewport.width === 1440 && process.env.FWX_UI_CAPTURE_DIR) {
      await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.screenshot({ path: `${process.env.FWX_UI_CAPTURE_DIR}/fwx-auto-select-1440.png`, fullPage: true })
    }
    let count = 1

    const drawingCases: { name: string; mode?: string; from: [number, number]; to: [number, number] }[] = [
      { name: '矩形', from: [40, 50], to: [70, 70] },
      { name: '圆形', from: [45, 50], to: [65, 70] },
      { name: '圆孔', from: [48, 55], to: [54, 61] },
      { name: '孔 / 开口', mode: '普通切孔', from: [58, 65], to: [70, 69] },
      { name: '孔 / 开口', mode: '边缘插槽', from: [80, 40], to: [80, 55] },
      { name: '孔 / 开口', mode: '板内插槽', from: [74, 75], to: [86, 75] },
    ]
    for (const item of drawingCases) {
      await chooseTool(page, item.name, item.mode)
      await dragMillimetres(page, canvas, item.from, item.to)
      await expectNewestSelected(page, canvas, ++count)
      await expect(canvas).toBeFocused()
    }

    // Enter must create one shape only, then act as a selection command on
    // subsequent key presses rather than leaving a drawing tool armed.
    for (const item of drawingCases) {
      await chooseTool(page, item.name, item.mode)
      await canvas.press('Enter')
      await expectNewestSelected(page, canvas, ++count)
      await canvas.press('Enter')
      await expect(shapes).toHaveCount(count)
    }

    // Partial polygons, cancelled gestures and zero-area attempts are not
    // completed shapes and must keep the chosen drawing tool available.
    await chooseTool(page, '多边形')
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await clickCanvasPoint(page, canvas, 45, 55)
    await clickCanvasPoint(page, canvas, 75, 55)
    await expect(shapes).toHaveCount(count)
    await expect(tool('多边形')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '完成闭合', exact: true })).toBeDisabled()
    await canvas.press('Escape')
    await expect(page.getByRole('button', { name: '完成闭合', exact: true })).toHaveCount(0)
    await expect(tool('多边形')).toHaveAttribute('aria-pressed', 'true')
    await expect(shapes).toHaveCount(count)

    await chooseTool(page, '矩形')
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await clickCanvasPoint(page, canvas, 45, 55)
    await expect(shapes).toHaveCount(count)
    await expect(tool('矩形')).toHaveAttribute('aria-pressed', 'true')
    const start = await screenPoint(canvas, 45, 55)
    const end = await screenPoint(canvas, 75, 70)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 4 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(shapes).toHaveCount(count)
    await expect(tool('矩形')).toHaveAttribute('aria-pressed', 'true')

    for (const name of ['多边形', '自由画']) {
      await chooseTool(page, name)
      await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
      const points: [number, number][] = [[45, 55], [75, 55], [60, 75]]
      if (name === '多边形') {
        for (const [x, y] of points) await clickCanvasPoint(page, canvas, x, y)
      } else {
        const first = await screenPoint(canvas, ...points[0]!)
        await page.mouse.move(first.x, first.y)
        await page.mouse.down()
        for (const point of points.slice(1)) {
          const screen = await screenPoint(canvas, ...point)
          await page.mouse.move(screen.x, screen.y, { steps: 8 })
        }
        await page.mouse.up()
      }
      await expect(shapes).toHaveCount(count)
      await expect(tool(name)).toHaveAttribute('aria-pressed', 'true')
      if (name === '多边形') await canvas.press('Enter')
      else await page.getByRole('button', { name: '完成闭合', exact: true }).click()
      await expectNewestSelected(page, canvas, ++count)
      await expect(page.getByRole('button', { name: '完成闭合', exact: true })).toHaveCount(0)
      await expect(canvas).toBeFocused()
      const before = Number(await canvas.getByTestId('selection-outline').getAttribute('x'))
      await page.keyboard.press('ArrowRight')
      await expect(canvas.getByTestId('selection-outline')).toHaveAttribute('x', String(before + 1))
      await expect(shapes).toHaveCount(count)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}
