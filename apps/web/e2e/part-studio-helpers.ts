import { expect, type Locator, type Page } from '@playwright/test'

/** Use the rendered SVG transform for every pointer location. Screen pixels
 * depend on responsive layout and scrolling; they are never guessed here. */
export async function screenPoint(canvas: Locator, x: number, y: number) {
  return canvas.evaluate((element, point) => {
    const matrix = (element as SVGSVGElement).getScreenCTM()
    if (!matrix) throw new Error('SVG screen transform is unavailable')
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  }, { x, y })
}

export async function dragMillimetres(page: Page, canvas: Locator, from: [number, number], to: [number, number]) {
  await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const start = await screenPoint(canvas, ...from)
  const end = await screenPoint(canvas, ...to)
  expect(await canvas.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), start), 'A floating toolbar or properties panel must not intercept the drawing start').toBe(true)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

export async function drawStudioShape(page: Page, tool: string, from: [number, number], to: [number, number]) {
  await page.getByRole('group', { name: '绘图工具', exact: true }).getByRole('button', { name: tool, exact: true }).click()
  if (tool === '孔 / 开口') await page.getByRole('button', { name: '普通切孔', exact: true }).click()
  const canvas = page.getByTestId('sketch-canvas')
  const count = await canvas.locator('[data-shape-id]').count()
  await dragMillimetres(page, canvas, from, to)
  await expect(canvas.locator('[data-shape-id]')).toHaveCount(count + 1)
  await expect(page.getByRole('group', { name: '绘图工具', exact: true }).getByRole('button', { name: '选择', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas.getByTestId('selection-outline')).toBeVisible()
  return canvas
}

export async function drawStarterRectangle(page: Page) {
  return drawStudioShape(page, '矩形', [35, 45], [95, 85])
}

export async function deselectStudioShape(page: Page) {
  await page.getByRole('group', { name: '绘图工具', exact: true }).getByRole('button', { name: '选择', exact: true }).click()
  const canvas = page.getByTestId('sketch-canvas')
  await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const empty = await screenPoint(canvas, 5, 5)
  await page.mouse.click(empty.x, empty.y)
  await expect(page.locator('[aria-label="图形属性"]')).toHaveCount(0)
}
