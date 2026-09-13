// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { realAdminApi } from '../../../api/admin/realClient'
import { AdminOverviewPage } from './OverviewPage'
import { AdminAuditPage } from './AuditPage'
import { AdminLayout } from '../AdminLayout'

vi.mock('../../../api/admin/realClient', () => ({ realAdminApi: { getOverview: vi.fn(), listAudit: vi.fn() } }))
vi.mock('../../../api/admin', () => ({ getAdminApi: async () => realAdminApi }))
let container: HTMLDivElement
let root: Root
let client: QueryClient
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.resetAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); sessionStorage.clear(); vi.unstubAllGlobals() })
async function render(page: React.ReactNode) {
  await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}>{page}</QueryClientProvider></MemoryRouter>))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
}
function button(label: string) { return [...container.querySelectorAll('button')].find(value => value.textContent === label)! }

it('shows unavailable metrics and an honest empty audit state on the overview', async () => {
  vi.mocked(realAdminApi.getOverview).mockResolvedValue({ success: true, data: { users: { total: 1, students: 1, teachers: 0, admins: 0 }, courses: { total: null, published: null }, parts: { total: 0, pendingReview: null }, recentAudit: [] } })
  await render(<AdminOverviewPage />)
  expect(container.textContent).toContain('课程管理暂未开放')
  expect(container.textContent).toContain('零件审核暂未开放')
  expect(container.textContent).toContain('暂无已记录的后台操作')
  expect(container.querySelector('a[href="/admin/audit"]')).not.toBeNull()
})

it('provides retry after an overview failure', async () => {
  vi.mocked(realAdminApi.getOverview).mockResolvedValue({ success: false, error: { code: 'INTERNAL', message: '服务不可用' } })
  await render(<AdminOverviewPage />)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('服务不可用')
  await act(async () => button('重试').click())
  expect(realAdminApi.getOverview).toHaveBeenCalledTimes(2)
})

it('reads actual audit pages and supports an empty result without fake activity', async () => {
  vi.mocked(realAdminApi.listAudit).mockImplementation(async (query = {}) => ({ success: true, data: { items: query.page === 2 ? [] : [{ id: 'record', actor: 'system', action: 'users:role', target: 'user#1', at: '2026-09-07T00:00:00Z' }], total: 21, page: query.page || 1, pageSize: 20 } }))
  await render(<AdminAuditPage />)
  expect(container.textContent).toContain('users:role')
  await act(async () => button('下一页').click())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(realAdminApi.listAudit).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 })
  expect(container.textContent).toContain('暂无已记录的后台操作')
})

it('shows audit permission failure and a retry control', async () => {
  vi.mocked(realAdminApi.listAudit).mockResolvedValue({ success: false, error: { code: 'FORBIDDEN', message: '无访问权限' } })
  await render(<AdminAuditPage />)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('无访问权限')
  await act(async () => button('重试').click())
  expect(realAdminApi.listAudit).toHaveBeenCalledTimes(2)
})

it('provides an exit control in the mobile administration navigation', async () => {
  sessionStorage.setItem('adminAccessKey', 'unit-test-key')
  await render(<AdminLayout />)
  const mobile = container.querySelector('[aria-label="后台移动导航"]')
  const exit = [...mobile?.querySelectorAll('button') || []].find(value => value.textContent?.includes('退出后台'))
  expect(exit).toBeDefined()
  await act(async () => exit!.click())
  expect(sessionStorage.getItem('adminAccessKey')).toBeNull()
})
