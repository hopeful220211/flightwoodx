import { expect, test, type Locator, type Page } from '@playwright/test'
import { join } from 'node:path'

const pageFailures = new WeakMap<Page, string[]>()
test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.abort('blockedbyclient')
    return route.continue()
  })
  const failures: string[] = []
  pageFailures.set(page, failures)
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`) })
  page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`) })
  test.info().annotations.push({ type: 'browser', description: 'Browser plugin not available; real installed Chrome and local isolated API.' })
})
test.afterEach(async ({ page }) => { expect(pageFailures.get(page)).toEqual([]) })

async function enterStudio(page: Page) {
  await page.goto('/register')
  await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/part-studio')
  await expect(page.getByRole('heading', { name: '零件绘制', exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function point(canvas: Locator, x: number, y: number) {
  return canvas.evaluate((element, p) => {
    const matrix = (element as SVGSVGElement).getScreenCTM()!
    const screen = new DOMPoint(p.x, p.y).matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  }, { x, y })
}

async function positions(page: Page) {
  return page.evaluate(() => ({
    scroll: scrollY,
    canvas: document.querySelector('[data-testid="sketch-canvas"]')!.getBoundingClientRect().top,
    tools: document.querySelector('[aria-label="绘图工具"]')!.getBoundingClientRect().top,
  }))
}

for (const width of [390, 768, 1440]) {
  test(`selection preserves toolbar and canvas position at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : width === 390 ? 844 : 900 })
    await enterStudio(page)
    await page.getByRole('button', { name: '添加图形', exact: true }).click()
    const canvas = page.getByTestId('sketch-canvas')
    await page.getByRole('combobox', { name: '选中图形', exact: true }).selectOption('')
    await canvas.scrollIntoViewIfNeeded()
    const before = await positions(page)
    const original = await canvas.locator('[data-shape-id] rect').evaluate(rect => ['x', 'y', 'width', 'height'].map(name => rect.getAttribute(name)))
    const center = await point(canvas, 65, 65)
    await page.mouse.click(center.x, center.y)
    await expect(page.getByRole('combobox', { name: '选中图形', exact: true })).not.toHaveValue('')
    const after = await positions(page)
    expect(await canvas.locator('[data-shape-id] rect').evaluate(rect => ['x', 'y', 'width', 'height'].map(name => rect.getAttribute(name))), 'Clicking selects without moving or resizing geometry').toEqual(original)
    if (process.env.FWX_UI_CAPTURE_DIR) {
      await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
      // Full-page screenshots otherwise paint the fixed navbar at the current
      // scroll offset in the stitched image rather than at the document top.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `selection-${width}.png`), fullPage: true })
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), after.scroll)
    }
    const selectedStyle = await canvas.locator('[data-shape-id]').evaluate(element => {
      const style = getComputedStyle(element)
      return { outline: style.outlineStyle, boxShadow: style.boxShadow }
    })
    expect(selectedStyle).toEqual({ outline: 'none', boxShadow: 'none' })
    await expect(canvas.locator('[data-resize-handle]')).toHaveCount(8)
    await expect(page.getByRole('button', { name: '删除图形', exact: true })).toBeEnabled()
    for (const key of ['scroll', 'tools', 'canvas'] as const) {
      expect(Math.abs(after[key] - before[key]), `${key} must not shift on selection`).toBeLessThanOrEqual(1)
    }
    const empty = await point(canvas, 5, 5)
    await page.mouse.click(empty.x, empty.y)
    await expect(page.getByRole('combobox', { name: '选中图形', exact: true })).toHaveValue('')
    const cleared = await positions(page)
    for (const key of ['scroll', 'tools', 'canvas'] as const) expect(Math.abs(cleared[key] - after[key])).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: '删除图形', exact: true })).toBeDisabled()
  })

  test(`mouse anchors resize accurately with one-step history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : width === 390 ? 844 : 900 })
    await enterStudio(page)
    await page.getByRole('button', { name: '添加图形', exact: true }).click()
    const canvas = page.getByTestId('sketch-canvas')
    const shape = canvas.locator('[data-shape-id] rect')
    const drag = async (handle: string, x: number, y: number, cancel = false) => {
      await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
      const box = (await canvas.locator(`[data-resize-handle="${handle}"]`).boundingBox())!
      const end = await point(canvas, x, y)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(end.x, end.y, { steps: 8 })
      if (cancel) await page.keyboard.press('Escape')
      await page.mouse.up()
    }
    await expect(canvas.locator('[data-resize-handle]')).toHaveCount(8)
    await drag('se', 105, 95)
    await expect(shape).toHaveAttribute('x', '35')
    await expect(shape).toHaveAttribute('y', '45')
    await expect(shape).toHaveAttribute('width', '70')
    await expect(shape).toHaveAttribute('height', '50')
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(shape).toHaveAttribute('width', '60')
    await expect(shape).toHaveAttribute('height', '40')
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(shape).toHaveAttribute('width', '70')
    await expect(shape).toHaveAttribute('height', '50')
    await drag('e', 115, 70)
    await expect(shape).toHaveAttribute('width', '80')
    await expect(shape).toHaveAttribute('height', '50')
    await drag('se', 125, 105, true)
    await expect(shape).toHaveAttribute('width', '80')
    await expect(shape).toHaveAttribute('height', '50')
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(shape).toHaveAttribute('width', '70')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}

test.describe('tablet touch input', () => {
  test.use({ hasTouch: true })
  test('touch drag resizes, touch cancellation preserves the original geometry', async ({ page, context }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await enterStudio(page)
    await page.getByRole('button', { name: '添加图形', exact: true }).click()
    const canvas = page.getByTestId('sketch-canvas')
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
    const client = await context.newCDPSession(page)
    const touchDrag = async (to: [number, number], cancel = false) => {
      const box = (await canvas.locator('[data-resize-handle="se"]').boundingBox())!
      // An offset touch still hits the enlarged target without covering it.
      const start = { x: box.x + box.width / 2 + 8, y: box.y + box.height / 2 }
      const end = await point(canvas, ...to)
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 0 }] })
      for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8, id: 0 }] })
      }
      await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
    }
    const original = await canvas.locator('[data-shape-id] rect').getAttribute('width')
    await touchDrag([110, 95])
    const shape = canvas.locator('[data-shape-id] rect')
    await expect(shape).not.toHaveAttribute('width', original!)
    await expect(shape).toHaveAttribute('x', '35')
    await expect(shape).toHaveAttribute('y', '45')
    const resized = await shape.getAttribute('width')
    await touchDrag([120, 105], true)
    await expect(shape).toHaveAttribute('width', resized!)
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(shape).toHaveAttribute('width', original!)
    await expect(shape).toHaveAttribute('height', '40')
    // Small cutouts have overlapping touch targets. Hit the visible right
    // handle and then the centre: neither may select a different anchor.
    await page.getByRole('group', { name: '绘图工具', exact: true }).getByRole('button', { name: '圆孔', exact: true }).click()
    await page.getByRole('button', { name: '添加图形', exact: true }).click()
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
    const nativeDrag = async (from: [number, number], to: [number, number]) => {
      const begin = await point(canvas, ...from)
      const finish = await point(canvas, ...to)
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...begin, id: 0 }] })
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...finish, id: 0 }] })
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    const hole = canvas.locator('[data-shape-id] ellipse')
    await nativeDrag([69, 65], [71, 65])
    await expect(hole).toHaveAttribute('rx', '5')
    await expect(hole).toHaveAttribute('ry', '4')
    await expect(hole).toHaveAttribute('cx', '66')
    await expect(hole).toHaveAttribute('cy', '65')
    await nativeDrag([66, 65], [67, 66])
    await expect(hole).toHaveAttribute('rx', '5')
    await expect(hole).toHaveAttribute('ry', '4')
    await expect(hole).toHaveAttribute('cx', '67')
    await expect(hole).toHaveAttribute('cy', '66')
    await client.detach()
  })
})

test('numeric input commits before dragging and invalid edits survive a canvas click', async ({ page }) => {
  await enterStudio(page)
  await page.getByRole('button', { name: '添加图形', exact: true }).click()
  const canvas = page.getByTestId('sketch-canvas')
  const shape = canvas.locator('[data-shape-id] rect')
  const width = page.getByRole('spinbutton', { name: '宽（毫米）', exact: true })
  await width.fill('80')
  await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const start = await point(canvas, 65, 65)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const end = await point(canvas, 70, 70)
  await page.mouse.move(end.x, end.y, { steps: 6 })
  await page.mouse.up()
  await expect(shape).toHaveAttribute('width', '80')
  await expect(shape).toHaveAttribute('x', '40')
  await expect(shape).toHaveAttribute('y', '50')
  await width.fill('2500')
  await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const empty = await point(canvas, 5, 5)
  await page.mouse.click(empty.x, empty.y)
  await expect(width).toHaveValue('2500')
  await expect(width).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await expect(shape).toHaveAttribute('width', '80')
  await width.press('Escape')
  const reference = page.getByRole('spinbutton', { name: '参考宽（毫米）', exact: true })
  await reference.fill('120')
  await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const center = await point(canvas, 65, 65)
  await page.mouse.click(center.x, center.y)
  await expect(reference).toHaveValue('120')
  await expect(shape).toHaveAttribute('x', '40')
  await expect(shape).toHaveAttribute('y', '50')
  await expect(shape).toHaveAttribute('width', '80')
})

test('drawing viewport stays fixed when polygon closure controls appear', async ({ page }) => {
  await enterStudio(page)
  await page.getByRole('group', { name: '绘图工具', exact: true }).getByRole('button', { name: '多边形', exact: true }).click()
  const canvas = page.getByTestId('sketch-canvas')
  await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const before = (await canvas.boundingBox())!
  const p = await point(canvas, 20, 20)
  await page.mouse.click(p.x, p.y)
  await expect(page.getByRole('button', { name: '完成闭合', exact: true })).toBeVisible()
  const after = (await canvas.boundingBox())!
  expect(Math.abs(after.height - before.height), 'Starting a polygon must not change SVG coordinates').toBeLessThanOrEqual(1)
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
})

test('keyboard users can see focus, select a shape and move it precisely', async ({ page }) => {
  await enterStudio(page)
  await page.getByRole('button', { name: '添加图形', exact: true }).click()
  await page.getByRole('combobox', { name: '选中图形', exact: true }).selectOption('')
  const canvas = page.getByTestId('sketch-canvas')
  await canvas.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const empty = await point(canvas, 5, 5)
  await page.mouse.click(empty.x, empty.y)
  await page.keyboard.press('Tab')
  await expect(canvas.locator('[data-shape-id]')).toBeFocused()
  await expect(page.getByTestId('shape-focus-outline')).toBeVisible()
  await expect(page.getByTestId('shape-focus-outline')).toHaveAttribute('vector-effect', 'non-scaling-stroke')
  await page.keyboard.press('Enter')
  await expect(canvas).toBeFocused()
  await expect(page.getByTestId('selection-outline')).toHaveAttribute('stroke-width', '1')
  await page.keyboard.press('ArrowRight')
  await expect(canvas.locator('[data-shape-id] rect')).toHaveAttribute('x', '36')
  await expect(canvas.locator('[data-shape-id] rect')).toHaveAttribute('width', '60')
})
