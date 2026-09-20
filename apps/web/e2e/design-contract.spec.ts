import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { policies } from '../src/pages/Privacy/policies'

const sizes = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]
const fixtureAuthor = { id: 'design-author', username: '版式检查的长名称创作者', followerCount: 12, followingCount: 3, isFollowedByMe: false }
const cards = Array.from({ length: 4 }, (_, i) => ({ id: `design-post-${i}`, title: `版式检查作品 ${i + 1}`, description: '检查文字、间距和对齐。', author: fixtureAuthor, authorId: fixtureAuthor.id, projectId: 'design-project', likeCount: 10 - i, favoriteCount: 1, likedByMe: false, createdAt: '2026-09-20T00:00:00Z' }))
const collection = { id: 'design-collection', name: '版式检查收藏', description: '用于检查详情和列表布局。', ownerId: fixtureAuthor.id, itemCount: 4, isPublic: true, createdAt: '2026-09-20T00:00:00Z', items: cards }

async function layout(page: Page, key: string, width: number) {
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.getByText('页面出现了点问题', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '应用出错了。', exact: true })).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${key} must not overflow`).toBe(true)
  const text = await page.locator('h1:visible,h2:visible,input.site-form-control:visible,select.site-form-control:visible').evaluateAll(nodes => nodes.map(node => ({ font: getComputedStyle(node).fontFamily, rect: node.getBoundingClientRect().toJSON() })))
  for (const item of text) {
    expect(item.font.includes('Open Sans') || item.font.includes('Montserrat'), `${key} font`).toBe(true)
    expect(item.rect.width, `${key} collapsed text/field`).toBeGreaterThan(0)
  }
  if (process.env.FWX_UI_CAPTURE_DIR) await page.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `design-${key}-${width}.png`), fullPage: true, animations: 'disabled' })
}

for (const viewport of sizes) {
  test(`all page families and editor modes retain layout at ${viewport.width}`, async ({ page, context, request }) => {
    test.setTimeout(120_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Public content fixtures exercise populated layouts without publishing posts.
    // Authentication, forms, designs and editor requests use the real isolated API.
    await context.route(/^https?:\/\/[^/]+\/api\/community\//, async route => {
      const path = new URL(route.request().url()).pathname
      const list = { items: cards, total: 4, page: 1, pageSize: 20 }
      let json: unknown = list
      if (/\/posts\/design-post-\d$/.test(path)) json = { post: { ...cards[0], project: null, design: null, forkFrom: null } }
      else if (path.endsWith('/comments')) json = { items: [], total: 0, page: 1, pageSize: 20 }
      else if (path.includes('/users/')) json = { author: fixtureAuthor, posts: list }
      else if (path.endsWith('/collections/design-collection')) json = { collection }
      else if (path.endsWith('/collections')) json = { items: [collection] }
      await route.fulfill({ json })
    })
    for (const path of ['/', '/about', '/privacy', '/terms', ...policies.map(p => `/privacy/${p.slug}`), '/privacy/settings', '/privacy/missing', '/register', '/community', '/community/leaderboard', '/community/design-post-0', '/u/design-author', '/collections/design-collection', '/not-a-real-page']) {
      await page.goto(path)
      await expect(page.locator('h1:visible,h2:visible').first()).toBeVisible()
      if (path.includes('design-post')) await expect(page.getByRole('heading', { name: cards[0].title }).first()).toBeVisible()
      if (path === '/u/design-author') await expect(page.getByRole('heading', { name: fixtureAuthor.username })).toBeVisible()
      await layout(page, path.replace(/[^a-z0-9]+/gi, '-') || 'home', viewport.width)
    }
    for (const path of ['/auth', '/login']) {
      await page.goto(path)
      await expect(page.getByRole('dialog', { name: '登录', exact: true })).toBeVisible()
      await layout(page, path.slice(1), viewport.width)
    }
    const suffix = randomBytes(6).toString('hex')
    const response = await request.post('/api/auth/register', { data: { username: `e2e_${suffix}`, email: `${suffix}@example.test`, password: randomBytes(24).toString('base64url') } })
    expect(response.status()).toBe(201)
    const auth = await response.json()
    await context.addInitScript(({ user, token }) => localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token, isAuthenticated: true }, version: 0 })), auth)
    for (const path of ['/dashboard', '/projects', '/collections', '/feed', '/me', '/profile']) {
      await page.goto(path)
      await expect(page.locator('h1:visible,h2:visible').first()).toBeVisible()
      await layout(page, path.slice(1), viewport.width)
    }
    // The retained project hub uses server Project ids, not local drone-design ids.
    const projectResponse = await request.post('/api/projects', { headers: { Authorization: `Bearer ${auth.token}` }, data: { name: 'E2E 项目详情' } })
    expect(projectResponse.status()).toBe(201)
    const { project } = await projectResponse.json()
    await page.goto(`/projects/${project.id || project._id}`)
    await expect(page.getByRole('heading', { name: 'E2E 项目详情', exact: true })).toBeVisible()
    await layout(page, 'project-hub', viewport.width)
    await page.getByRole('button', { name: '项目设置', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '项目设置', exact: true })).toBeVisible()
    await layout(page, 'project-settings', viewport.width)
    await page.getByRole('button', { name: '删除项目', exact: true }).click()
    await layout(page, 'project-delete-confirmation', viewport.width)
    await page.getByRole('button', { name: '关闭模态框', exact: true }).click()
    for (const mode of ['按步骤拼装', '自由拼装']) {
      await page.goto('/dashboard')
      await page.getByRole('button', { name: '新建作品', exact: true }).first().click()
      await page.getByRole('textbox', { name: '无人机名字', exact: true }).fill(`E2E ${mode}`)
      await page.getByRole('radio', { name: new RegExp(mode) }).check()
      await layout(page, `new-${mode === '自由拼装' ? 'free' : 'guided'}`, viewport.width)
      await page.getByRole('button', { name: '开始搭建', exact: true }).click()
      await expect(page).toHaveURL(/\/design\/design-/)
      await expect(page.getByRole('navigation', { name: '作品编辑模式' })).toBeVisible()
      const id = new URL(page.url()).pathname.split('/').at(-1)!
      await layout(page, mode === '自由拼装' ? 'free' : 'guided', viewport.width)
      if (mode === '按步骤拼装') for (const path of [`/code/${id}`, `/simulator/${id}`, `/fly/${id}`, `/design/export-preview/${id}`, `/design/ar-flight/${id}`]) {
        await page.goto(path)
        if (path.startsWith('/code/')) await expect(page.locator('.coding-blockly-shell .blocklySvg')).toBeVisible()
        else await expect(page.locator('h1:visible,h2:visible,canvas:visible').first()).toBeVisible()
        await layout(page, path.split('/').slice(0, -1).join('-'), viewport.width)
      }
    }
    await page.goto('/part-studio')
    await expect(page.getByTestId('sketch-toolbar')).toBeVisible()
    await layout(page, 'part-studio', viewport.width)
    expect(errors).toEqual([])
  })

  test(`administration layout fixtures at ${viewport.width}`, async ({ page, context }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Isolated browser fixtures only; not an admin permission/server acceptance test.
    const user = { id: 'design-admin', username: '版式管理员', email: 'layout@example.test', role: 'admin' }
    await context.addInitScript(user => {
      localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token: 'layout-fixture', isAuthenticated: true }, version: 0 }))
      sessionStorage.setItem('adminAccessKey', 'layout-fixture')
    }, user)
    await context.route(/^https?:\/\/[^/]+\/api\//, async route => {
      const path = new URL(route.request().url()).pathname
      let json: unknown = { data: { items: [], total: 0, page: 1, pageSize: 20 } }
      if (path === '/api/auth/me') json = { user }
      if (path === '/api/admin/overview') json = { data: { users: { total: 0, students: 0, teachers: 0, admins: 0 }, courses: { total: null, published: null }, parts: { total: 94, pendingReview: null }, recentAudit: [] } }
      await route.fulfill({ json })
    })
    for (const path of ['/admin', '/admin/users', '/admin/courses', '/admin/parts', '/admin/audit']) {
      await page.goto(path)
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.locator('h1')).toHaveCSS('font-size', viewport.width < 768 ? '28px' : '32px')
      await layout(page, path.replaceAll('/', '-'), viewport.width)
    }
    await page.getByRole('button', { name: '退出后台', exact: true }).filter({ visible: true }).click()
    await expect(page.getByLabel('管理密码', { exact: true })).toBeVisible()
    await layout(page, 'admin-gate', viewport.width)
    expect(errors).toEqual([])
  })
}
