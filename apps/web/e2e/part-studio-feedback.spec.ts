import { expect, test, type Locator, type Page } from '@playwright/test'
import { drawStarterRectangle, drawStudioShape, screenPoint } from './part-studio-helpers'

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

function previewFeedback(page: Page) {
  return page.getByRole('region', { name: '预览提示', exact: true })
}

async function expectProblem(page: Page, title: string) {
  const feedback = previewFeedback(page)
  await expect(feedback).toBeVisible()
  await expect(feedback).toHaveAttribute('data-state', 'error')
  await expect(feedback.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(feedback.getByRole('button')).toHaveCount(1)
  expect((await feedback.textContent())!.length).toBeLessThan(100)
  await expect(feedback.locator('p')).toHaveCount(1)
  expect((await feedback.boundingBox())!.height).toBeLessThan(220)
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(page.getByTestId('part-3d-preview')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await expect(page.getByRole('region', { name: '木板三维预览', exact: true }).getByRole('region', { name: '预览提示', exact: true })).toBeVisible()
  expect(await feedback.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return [...element.querySelectorAll('h3,p,button')].every(child => {
      const rect = child.getBoundingClientRect()
      return rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom
    })
  }), 'The reason, recovery instructions and buttons must fit inside the preview panel').toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  return feedback
}

async function expectReady(page: Page) {
  await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
  await expect(previewFeedback(page)).toHaveCount(0)
  await expect(page.getByTestId('sketch-canvas').locator('[data-problem-shape-id]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
}

async function editDimension(page: Page, name: string, value: string) {
  const input = page.getByRole('spinbutton', { name: `${name}（毫米）`, exact: true })
  await input.fill(value)
  await input.press('Enter')
  await expect(input).toHaveValue(value)
}

async function clearDrawing(page: Page, canvas: Locator) {
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await page.getByRole('button', { name: '确认清空', exact: true }).click()
  await expect(canvas.locator('[data-shape-id]')).toHaveCount(0)
  await expect(previewFeedback(page)).toHaveCount(0)
}

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`preview explains invalid geometry and recovers after editing at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/register')
    await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/part-studio')
    const canvas = page.getByTestId('sketch-canvas')
    await expect(canvas).toBeVisible()
    await page.evaluate(() => document.fonts.ready)

    await test.step('empty and unfinished drawing give neutral guidance, not an error', async () => {
      const feedback = previewFeedback(page)
      await expect(feedback).toHaveCount(0)
      await expect(canvas.locator('[data-problem-shape-id]')).toHaveCount(0)
      await page.getByRole('group', { name: '绘图工具', exact: true }).getByRole('button', { name: '多边形', exact: true }).click()
      await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
      const point = await screenPoint(canvas, 45, 55)
      expect(await canvas.evaluate((element, p) => element.contains(document.elementFromPoint(p.x, p.y)), point)).toBe(true)
      await page.mouse.click(point.x, point.y)
      await expect(feedback).toHaveCount(0)
      await expect(canvas.locator('[data-problem-shape-id]')).toHaveCount(0)
      await canvas.press('Escape')
      await expect(feedback).toHaveCount(0)
    })

    await test.step('disconnected solids explain the missing preview and overlap restores it', async () => {
      await drawStudioShape(page, '矩形', [35, 45], [75, 85])
      await expectReady(page)
      const height = await canvas.evaluate(element => element.getBoundingClientRect().height)
      await drawStudioShape(page, '矩形', [90, 55], [110, 75])
      const feedback = await expectProblem(page, '图形没有连成一块')
      await expect(feedback).toContainText(/切孔/)
      await expect(feedback).toContainText(/重叠|连接/)
      expect(await canvas.evaluate(element => element.getBoundingClientRect().height)).toBe(height)
      await feedback.getByRole('button', { name: '返回二维修改', exact: true }).click()
      await expect(canvas).toBeFocused()
      await editDimension(page, 'X', '65')
      await expectReady(page)
      await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
    })

    await test.step('reference overflow identifies a source and returns focus without deleting work', async () => {
      await editDimension(page, '参考宽', '70')
      const feedback = await expectProblem(page, '图形超出参考范围')
      await expect(feedback).toContainText(/参考/)
      const source = canvas.locator('[data-shape-id]').first()
      const sourceId = await source.getAttribute('data-shape-id')
      const problemMark = canvas.locator(`[data-problem-shape-id="${sourceId}"]`)
      await expect(problemMark).toHaveCount(1)
      await expect(problemMark).toHaveAttribute('stroke', '#b45309')
      await expect(feedback.getByRole('button', { name: '选择图形 1', exact: true })).toBeVisible()
      await feedback.scrollIntoViewIfNeeded()
      if (process.env.FWX_UI_CAPTURE_DIR) {
        await page.screenshot({ path: `${process.env.FWX_UI_CAPTURE_DIR}/concise-feedback-viewport-${viewport.width}.png` })
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
        await page.screenshot({ path: `${process.env.FWX_UI_CAPTURE_DIR}/concise-feedback-${viewport.width}.png`, fullPage: true })
      }
      await feedback.getByRole('button', { name: '选择图形 1', exact: true }).click()
      await expect(canvas).toBeFocused()
      await expect(page.getByRole('group', { name: '绘图工具', exact: true }).getByRole('button', { name: '选择', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('spinbutton', { name: 'X（毫米）', exact: true })).toHaveValue('35')
      await expect(canvas.getByTestId('selection-outline')).toBeVisible()
      await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
      await page.getByRole('button', { name: '撤销', exact: true }).click()
      await expect(page.getByRole('spinbutton', { name: '参考宽（毫米）', exact: true })).toHaveValue('130')
      await expectReady(page)
    })

    await test.step('a hole alone explains that a wooden solid must be drawn first', async () => {
      await clearDrawing(page, canvas)
      await drawStudioShape(page, '圆孔', [50, 55], [60, 65])
      const feedback = await expectProblem(page, '还没有木板实体')
      await expect(feedback).toContainText(/矩形|圆形|实体/)
      await expect(canvas.locator('[data-shape-id]')).toHaveCount(1)
    })

    await test.step('a complete cut explains removal and undo restores the same board', async () => {
      await clearDrawing(page, canvas)
      await drawStarterRectangle(page)
      await expectReady(page)
      const before = await canvas.getByTestId('compiled-sketch').getAttribute('d')
      await drawStudioShape(page, '孔 / 开口', [30, 40], [100, 90])
      const feedback = await expectProblem(page, '木板已被全部切除')
      await expect(feedback).toContainText(/缩小|移动|删除/)
      await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
      await page.getByRole('button', { name: '撤销', exact: true }).click()
      await expectReady(page)
      await expect(canvas.getByTestId('compiled-sketch')).toHaveAttribute('d', before!)
    })

    await test.step('a cut dividing one solid into two is explained, while an outside hole is ignored', async () => {
      await drawStudioShape(page, '孔 / 开口', [63, 40], [67, 90])
      const feedback = await expectProblem(page, '图形没有连成一块')
      await expect(feedback).toContainText(/切孔/)
      await page.getByRole('button', { name: '撤销', exact: true }).click()
      await expectReady(page)
      const before = await canvas.getByTestId('compiled-sketch').getAttribute('d')
      await drawStudioShape(page, '圆孔', [5, 55], [13, 63])
      await expectReady(page)
      await expect(canvas.getByTestId('compiled-sketch')).toHaveAttribute('d', before!)
      await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
    })
  })
}
