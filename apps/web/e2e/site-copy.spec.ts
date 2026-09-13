import { expect, test } from '@playwright/test'
import { join } from 'node:path'

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`plain homepage copy and shared login work at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const failures: string[] = []
    page.on('pageerror', error => failures.push(error.message))
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
    page.on('response', response => {
      if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
    })
    page.on('requestfailed', request => {
      if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(new URL(request.url()).pathname)
    })
    try {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await expect(page).toHaveTitle('FlightWoodX - 木质无人机设计平台')
      await expect(page.locator('#home-hero')).toContainText('翼想飞木无人机搭建平台')
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      await expect(page.locator('main h2')).toHaveText([
        '平台功能', '设计工作台', '使用步骤', '学生、教师和学校', '用户评价', '创建设计作品',
      ])

      const features = page.locator('section').filter({ has: page.getByRole('heading', { name: '平台功能', exact: true }) })
      await features.scrollIntoViewIfNeeded()
      await expect(features.getByRole('heading', { level: 3 })).toHaveText(['自主设计', '木质拼接', '飞行测试'])
      await expect(features).toContainText('模拟结果不代表实机飞行表现')
      await expect.poll(() => features.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
      if (process.env.FWX_UI_CAPTURE_DIR) {
        await features.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `features-${viewport.width}.png`), animations: 'disabled' })
      }

      const roles = page.locator('section').filter({ has: page.getByRole('heading', { name: '学生、教师和学校', exact: true }) })
      await roles.scrollIntoViewIfNeeded()
      await expect(roles).toContainText('当前均使用同一登录入口')
      for (const role of ['学生', '教师', '学校']) {
        await roles.getByRole('button').filter({ has: page.getByRole('heading', { name: role, exact: true }) }).click()
        const login = page.getByRole('dialog', { name: '登录', exact: true })
        await expect(login).toBeVisible()
        await expect(login).toContainText('登录后可查看和编辑账号中保存的作品')
        await login.getByRole('button', { name: '关闭', exact: true }).click()
        await expect(login).toHaveCount(0)
      }

      const feedback = page.getByRole('region', { name: '用户评价', exact: true })
      await feedback.scrollIntoViewIfNeeded()
      await feedback.hover()
      const people = [
        ['小宇', '五年级学生'], ['周女士', '小学四年级学生家长'],
        ['小雨', '三年级学生'], ['林先生', '初中一年级学生父亲，IT 行业'],
        ['陈老师', '市级重点小学科学教师，12 年教龄'],
      ]
      for (const [index, [name, identity]] of people.entries()) {
        const indicator = feedback.getByRole('button', { name: `查看第 ${index + 1} 条反馈`, exact: true })
        await indicator.click()
        await expect(indicator).toHaveAttribute('aria-current', 'true')
        await expect(feedback.getByText(name, { exact: true })).toBeVisible()
        await expect(feedback.getByText(identity, { exact: true })).toBeVisible()
        await expect(feedback.locator('blockquote')).toBeVisible()
        expect((await feedback.locator('blockquote').textContent())!.length).toBeGreaterThan(60)
      }
      await feedback.getByRole('button', { name: '下一条', exact: true }).click()
      await expect(feedback.getByText('小宇', { exact: true })).toBeVisible()
      const previous = feedback.getByRole('button', { name: '上一条', exact: true })
      await previous.focus()
      await page.keyboard.press('Enter')
      await expect(feedback.getByText('陈老师', { exact: true })).toBeVisible()
      if (process.env.FWX_UI_CAPTURE_DIR) {
        await feedback.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `testimonials-${viewport.width}.png`), animations: 'disabled' })
      }
      for (const control of await feedback.getByRole('button').all()) {
        const bounds = (await control.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
      }
      await feedback.getByRole('button', { name: '查看使用步骤', exact: true }).click()
      await expect(page.getByRole('heading', { name: '使用步骤', exact: true })).toBeInViewport()
      await roles.scrollIntoViewIfNeeded()
      if (process.env.FWX_UI_CAPTURE_DIR) {
        await roles.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `roles-${viewport.width}.png`), animations: 'disabled' })
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      expect(failures).toEqual([])
    } finally {
      if (failures.length) await test.info().attach('browser-failures', {
        body: Buffer.from(JSON.stringify(failures)), contentType: 'application/json',
      })
    }
  })

  test(`drawing toolbar labels stay on one line at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/part-studio')
    // The dimensioned studio updates 3D automatically; its real shape toolbar
    // replaces the former one-stroke/preview-button control strip.
    const toolbar = page.getByRole('group', { name: '绘图工具', exact: true })
    await expect(toolbar).toBeVisible()
    await toolbar.scrollIntoViewIfNeeded()
    await expect(toolbar.getByRole('button')).toHaveCount(7)
    await expect(page.getByText('板厚 2 mm', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '预览 3D →', exact: true })).toHaveCount(0)
    const toolbarBounds = (await toolbar.boundingBox())!
    expect(toolbarBounds.x).toBeGreaterThanOrEqual(8)
    expect(toolbarBounds.x + toolbarBounds.width).toBeLessThanOrEqual(viewport.width - 8)
    for (const button of await toolbar.getByRole('button').all()) {
      expect((await button.boundingBox())!.height, 'Keep complete operation labels on one line').toBeLessThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}
