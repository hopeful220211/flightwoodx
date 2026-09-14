import { expect, test, type Page } from '@playwright/test'
import { drawStarterRectangle, drawStudioShape } from './part-studio-helpers'

const runtimeErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page, context }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.abort('blockedbyclient')
    return route.continue()
  })
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  test.info().annotations.push({ type: 'browser', description: 'Browser plugin not available; real installed Chrome, local isolated API.' })
})
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page)).toEqual([]))

test('workspace gives the canvas a stable large surface and aligned headings', async ({ page }) => {
  await page.goto('/register')
  await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
  await page.goto('/part-studio')
  await expect(page.getByTestId('sketch-canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: '添加图形', exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '选中图形', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '图形属性', exact: true })).toHaveCount(0)
  const left = page.getByTestId('sketch-panel-heading')
  const right = page.getByTestId('preview-panel-heading')
  const a = (await left.boundingBox())!
  const b = (await right.boundingBox())!
  expect(a.y).toBe(b.y)
  expect(a.height).toBe(b.height)
  expect(await left.locator('h2').evaluate(e => getComputedStyle(e).font)).toBe(await right.locator('h2').evaluate(e => getComputedStyle(e).font))
  const canvas = (await page.getByTestId('sketch-canvas').boundingBox())!
  expect(canvas.height).toBeGreaterThan(480)
  const tools = (await page.getByRole('group', { name: '绘图工具', exact: true }).boundingBox())!
  expect(tools.y).toBeGreaterThan(canvas.y + canvas.height - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

for (const width of [390, 768, 1440]) {
  test(`cutting tools use red states without moving the toolbar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 })
    await page.goto('/register')
    await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
    await page.goto('/part-studio')
    const toolbar = page.getByTestId('sketch-toolbar')
    const tools = page.getByRole('group', { name: '绘图工具', exact: true })
    const rectangle = tools.getByRole('button', { name: '矩形', exact: true })
    await expect(toolbar).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await toolbar.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)

    const colors = (name: string) => tools.getByRole('button', { name, exact: true }).evaluate(button => {
      const icon = button.querySelector('svg')!
      return {
        background: getComputedStyle(button).backgroundColor,
        icon: getComputedStyle(icon).color,
        stroke: getComputedStyle(icon).stroke,
      }
    })
    // Document coordinates exclude the scrolling needed to reach mobile tools.
    const layout = () => toolbar.evaluate(element => {
      const bounds = (node: Element) => {
        const box = node.getBoundingClientRect()
        return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height }
      }
      return {
        toolbar: bounds(element),
        buttons: [...element.querySelectorAll('button')].map(button => ({ name: button.getAttribute('aria-label'), ...bounds(button) })),
      }
    })
    const initialLayout = await layout()
    const red = 'rgb(220, 38, 38)'
    const white = 'rgb(255, 255, 255)'
    const blue = 'rgb(25, 62, 105)'
    const transparent = 'rgba(0, 0, 0, 0)'
    const selectedBlue = { background: 'rgb(43, 136, 219)', icon: white, stroke: white }
    await expect(rectangle).toHaveAttribute('aria-pressed', 'true')
    expect(await colors('矩形')).toEqual(selectedBlue)
    for (const name of ['选择', '圆形', '多边形', '自由画']) {
      expect(await colors(name)).toEqual({ background: transparent, icon: blue, stroke: blue })
    }
    for (const name of ['圆孔', '孔 / 开口']) {
      await expect(tools.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false')
      expect(await colors(name)).toEqual({ background: transparent, icon: red, stroke: red })
    }
    if (process.env.FWX_UI_CAPTURE_DIR) await toolbar.screenshot({ path: `${process.env.FWX_UI_CAPTURE_DIR}/tool-strip-${width}.png` })

    for (const name of ['圆孔', '孔 / 开口']) {
      const cut = tools.getByRole('button', { name, exact: true })
      await cut.hover()
      expect(await colors(name)).toEqual({ background: 'rgb(254, 242, 242)', icon: red, stroke: red })
      expect(await layout()).toEqual(initialLayout)
      await cut.click()
      await expect(cut).toHaveAttribute('aria-pressed', 'true')
      await expect(tools.locator('button[aria-pressed="true"]')).toHaveCount(1)
      expect(await colors(name)).toEqual({ background: red, icon: white, stroke: white })
      await expect(rectangle).toHaveAttribute('aria-pressed', 'false')
      expect(await colors('矩形')).toEqual({ background: transparent, icon: blue, stroke: blue })
      expect(await layout()).toEqual(initialLayout)
      if (name === '孔 / 开口' && process.env.FWX_UI_CAPTURE_DIR) {
        await toolbar.screenshot({ path: `${process.env.FWX_UI_CAPTURE_DIR}/toolbar-selected-${width}.png` })
      }

      await rectangle.hover()
      expect(await colors('矩形')).toEqual({ background: 'rgb(240, 247, 255)', icon: blue, stroke: blue })
      await rectangle.click()
      await expect(rectangle).toHaveAttribute('aria-pressed', 'true')
      await expect(cut).toHaveAttribute('aria-pressed', 'false')
      expect(await colors('矩形')).toEqual(selectedBlue)
      expect(await colors(name)).toEqual({ background: transparent, icon: red, stroke: red })
      expect(await layout()).toEqual(initialLayout)
    }
    await expect(page.getByTestId('sketch-canvas').locator('[data-shape-id]')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })

  test(`properties leave all eight initial resize anchors accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/register')
    await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
    await page.goto('/part-studio')
    const canvas = await drawStarterRectangle(page)
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const covered = await canvas.locator('[data-resize-handle]').evaluateAll(handles => handles.filter(handle => {
      const mark = handle.querySelector('[data-handle-mark]')!.getBoundingClientRect()
      const hit = document.elementFromPoint(mark.x + mark.width / 2, mark.y + mark.height / 2)
      return !hit?.closest('[data-resize-handle]')
    }).map(handle => handle.getAttribute('data-resize-handle')))
    expect(covered, 'Property panel must not cover initial resize anchors').toEqual([])
    const input = page.getByRole('spinbutton', { name: '宽（毫米）', exact: true })
    await input.fill('2500')
    await input.press('Enter')
    await expect(page.getByRole('button', { name: '收起图形属性', exact: true })).toBeDisabled()
    await expect(input).toHaveValue('2500')
    await input.press('Escape')
    // A shape near the inspector can still be edited by hiding properties,
    // without clearing the selection or changing the drawing transform.
    const initial = await canvas.evaluate(element => ({ height: element.getBoundingClientRect().height, top: element.getBoundingClientRect().top + scrollY }))
    await page.getByRole('checkbox', { name: '限制实体在参考范围内', exact: true }).uncheck()
    for (const [label, value] of [['宽', '20'], ['高', '20'], ['X', '100'], ['Y', '0']]) {
      const field = page.getByRole('spinbutton', { name: `${label}（毫米）`, exact: true })
      await field.fill(value!)
      await field.press('Enter')
    }
    await page.getByRole('button', { name: '收起图形属性', exact: true }).click()
    await expect(page.getByRole('region', { name: '图形属性', exact: true })).toHaveCount(0)
    await expect(canvas.locator('[data-resize-handle]')).toHaveCount(8)
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    expect(await canvas.locator('[data-resize-handle]').evaluateAll(handles => handles.every(handle => {
      const mark = handle.querySelector('[data-handle-mark]')!.getBoundingClientRect()
      return !!document.elementFromPoint(mark.x + mark.width / 2, mark.y + mark.height / 2)?.closest('[data-resize-handle]')
    }))).toBe(true)
    expect(await canvas.evaluate(element => ({ height: element.getBoundingClientRect().height, top: element.getBoundingClientRect().top + scrollY }))).toEqual(initial)
    await page.getByRole('button', { name: '显示图形属性', exact: true }).click()
    await expect(page.getByRole('region', { name: '图形属性', exact: true })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'X（毫米）', exact: true })).toHaveValue('100')
  })
  test(`inactive holes preserve the board and overlap alone cuts it at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 })
    await page.goto('/register')
    await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
    await page.goto('/part-studio')
    const canvas = await drawStarterRectangle(page)
    const original = await canvas.getByTestId('compiled-sketch').getAttribute('d')
    const preview = page.getByTestId('part-3d-preview')
    await expect(preview).toHaveAttribute('data-wood-ready', 'true')
    await drawStudioShape(page, '圆孔', [5, 55], [13, 63])
    await expect(preview).toHaveAttribute('data-wood-ready', 'true')
    await expect(canvas.getByTestId('compiled-sketch')).toHaveAttribute('d', original!)
    const position = page.getByRole('spinbutton', { name: 'X（毫米）', exact: true })
    // Exactly tangent: the circle ends at the board's left edge (35 mm).
    await position.fill('27')
    await position.press('Enter')
    await expect(canvas.getByTestId('compiled-sketch')).toHaveAttribute('d', original!)
    // Four millimetres of overlap creates an open notch, not a second solid.
    await position.fill('31')
    await position.press('Enter')
    await expect(canvas.getByTestId('compiled-sketch')).not.toHaveAttribute('d', original!)
    await expect(preview).toHaveAttribute('data-wood-ready', 'true')
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    // Fully inside creates an inner hole; moving out restores the same board.
    await position.fill('45')
    await position.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: '1 个内孔' })).toBeVisible()
    await position.fill('5')
    await position.press('Enter')
    await expect(canvas.getByTestId('compiled-sketch')).toHaveAttribute('d', original!)
    await expect(preview).toHaveAttribute('data-wood-ready', 'true')
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    const panel = page.getByRole('region', { name: '图形属性', exact: true })
    expect(await panel.evaluate(element => getComputedStyle(element).position)).toBe('absolute')
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)
    if (process.env.FWX_UI_CAPTURE_DIR) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.screenshot({ path: `${process.env.FWX_UI_CAPTURE_DIR}/workspace-${width}.png`, fullPage: true })
    }
  })
}
