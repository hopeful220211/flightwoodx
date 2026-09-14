import { expect, test } from '@playwright/test'
import { drawStarterRectangle, drawStudioShape, dragMillimetres, screenPoint } from './part-studio-helpers'

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`dedicated insertion interface at ${viewport.width}px`, async ({ page, context }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize(viewport)
    await page.goto('/register')
    await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
    await page.goto('/part-studio')
    const canvas = await drawStarterRectangle(page)
    const tools = page.getByRole('group', { name: '绘图工具', exact: true })
    const insert = tools.getByRole('button', { name: '插接口', exact: true })
    const ordinary = tools.getByRole('button', { name: '孔 / 开口', exact: true })
    expect(await insert.locator('svg').innerHTML()).not.toBe(await ordinary.locator('svg').innerHTML())
    await insert.click()
    await expect(page.getByRole('region', { name: '开孔方式', exact: true })).toHaveCount(0)
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const headingY = await page.getByTestId('sketch-panel-heading').evaluate(element => element.getBoundingClientRect().y + window.scrollY)
    // Real touch events on the tablet, pointer/mouse elsewhere.
    if (viewport.width === 768) {
      const cdp = await context.newCDPSession(page)
      const from = await screenPoint(canvas, 65, 45)
      const to = await screenPoint(canvas, 65, 60)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await cdp.detach()
    } else await dragMillimetres(page, canvas, [65, 45], [65, 60])
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
    await expect(tools.getByRole('button', { name: '选择', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('spinbutton', { name: '槽宽（毫米）', exact: true })).toHaveValue('2')
    await expect(page.getByRole('spinbutton', { name: '槽宽（毫米）', exact: true })).toBeDisabled()
    await expect(canvas.getByTestId('joint-bottom')).toHaveAttribute('cx', '65')
    await expect(canvas.getByTestId('joint-bottom')).toHaveAttribute('cy', '60')
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    for (const handle of await canvas.locator('[data-handle-hit]').all()) {
      expect(await handle.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return element.parentElement?.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
      }), 'Both insertion resize anchors must remain accessible with the inspector open').toBe(true)
    }
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    expect(await page.getByTestId('sketch-panel-heading').evaluate(element => element.getBoundingClientRect().y + window.scrollY)).toBe(headingY)
    await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
    for (const button of await tools.getByRole('button').all()) {
      const box = await button.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    if (process.env.FWX_UI_CAPTURE_DIR) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.screenshot({ path: `${process.env.FWX_UI_CAPTURE_DIR}/insert-interface-${viewport.width}.png`, fullPage: true })
    }
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(1)
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
    await insert.click()
    await dragMillimetres(page, canvas, [45, 45], [45, 30])
    await expect(canvas.locator('[data-shape-id]')).toHaveCount(2)
    await expect(page.getByText('请从板边向内拖动至少 2 mm，保留两侧和槽底。', { exact: true })).toBeVisible()
    await expect(page.getByTestId('part-3d-preview')).toHaveAttribute('data-wood-ready', 'true')
    await page.getByRole('button', { name: '清空', exact: true }).click()
    await drawStudioShape(page, '圆形', [35, 35], [95, 95])
    await drawStudioShape(page, '插接口', [80, 39.05], [80, 55])
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await expect(canvas.getByTestId('joint-bottom')).toHaveAttribute('cy', '55')
    expect(errors).toEqual([])
  })
}
