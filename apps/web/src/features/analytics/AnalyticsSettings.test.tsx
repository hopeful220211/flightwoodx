// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { createAnalyticsClient } from './client'
import { AnalyticsSettings } from './AnalyticsSettings'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const roots: Root[] = []
const clients: ReturnType<typeof createAnalyticsClient>[] = []
afterEach(() => { act(() => roots.splice(0).forEach(root => root.unmount())); clients.splice(0).forEach(client => client.dispose()); document.body.innerHTML = ''; localStorage.clear() })

async function mount(enabled = true, mode: 'banner' | 'page' = 'banner', path = '/') {
  const calls: string[] = []
  const client = createAnalyticsClient({ baseUrl: '/api', storage: localStorage, getAuth: () => ({ token: null, accountId: null }), getPathname: () => '/',
    fetch: vi.fn(async (url, options) => {
      calls.push(`${options?.method || 'GET'} ${String(url)}`)
      if (String(url).endsWith('/config')) return Response.json({ enabled, noticeVersion: 1, retentionDays: 90, environment: 'test' })
      if (options?.method === 'DELETE') return new Response(null, { status: 200 })
      return Response.json({ receipt: 'consent-unique-capability', expiresAt: new Date(Date.now() + 86400000).toISOString() })
    }) as typeof fetch,
  })
  clients.push(client)
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container); roots.push(root)
  await act(async () => root.render(<StrictMode><MemoryRouter initialEntries={[path]}><AnalyticsSettings client={client} mode={mode} /></MemoryRouter></StrictMode>))
  return { client, container, calls }
}

it('hides all settings when server collection is disabled and StrictMode initializes once', async () => {
  const { container, calls } = await mount(false)
  expect(container.textContent).toBe('')
  expect(calls).toEqual(['GET /api/analytics/config'])
})

it('keeps acceptance disabled until age is affirmed and decline leaves normal navigation available', async () => {
  const { container, client } = await mount()
  const buttons = [...container.querySelectorAll('button')]
  const allow = buttons.find(button => button.textContent === '允许使用统计')!
  const decline = buttons.find(button => button.textContent === '不允许')!
  expect(allow.disabled).toBe(true)
  expect(container.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(false)
  expect(container.textContent).toContain('不影响绘制、保存和其他功能')
  expect(container.querySelector('[aria-modal="true"]')).toBeNull()
  await act(async () => decline.click())
  expect(client.getSnapshot().decision).toBe('declined')
  expect(container.textContent).toBe('')
})

it('allows explicit consent and offers withdrawal on the dedicated settings page', async () => {
  const { container, client, calls } = await mount(true, 'page', '/privacy/settings')
  await act(async () => container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '允许使用统计')!.click())
  expect(client.getSnapshot().decision).toBe('granted')
  expect(container.textContent).toContain('当前选择：允许使用统计')
  expect(container.textContent).toContain('保留 90 天')
  expect(container.textContent).toContain('记录存放在我们管理的服务器')
  expect(container.textContent).toContain('芬奇答奥（重庆）科技有限公司')
  expect(container.querySelector('a[href="/about#contact"]')?.textContent).toBe('联系我们')
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '撤回并删除统计记录')!.click())
  expect(client.getSnapshot().decision).toBe('declined')
  expect(calls.some(call => call.startsWith('DELETE '))).toBe(true)
  expect(container.textContent).toContain('已停止统计')
})

it('links the short banner to complete notices without a floating settings button', async () => {
  const { container } = await mount()
  expect(container.textContent).toContain('隐私与Cookie')
  expect(container.textContent).not.toContain('仅必要功能')
  expect(container.querySelector('a[href="/privacy/policy"]')).not.toBeNull()
  expect(container.querySelector('a[href="/privacy/cookies"]')).not.toBeNull()
  expect(container.querySelector('a[href="/privacy/data"]')).not.toBeNull()
  expect(container.querySelector('a[href="/privacy/children"]')).not.toBeNull()
  expect([...container.querySelectorAll('button')].map(button => button.textContent)).toEqual(['不允许', '允许使用统计'])
})

it('does not cover policy reading with an automatic banner or require login', async () => {
  const { container, client } = await mount(true, 'banner', '/privacy/policy')
  expect(container.textContent).toBe('')
  expect(client.getSnapshot().decision).toBe('unknown')
})

it('keeps settings explanatory when collection is disabled', async () => {
  const { container } = await mount(false, 'page', '/privacy/settings')
  expect(container.textContent).toContain('不会新增采集')
})

it('lets a past participant withdraw when the collector has been disabled', async () => {
  localStorage.setItem('fwx-analytics-consent-v1', JSON.stringify({ decision: 'granted', noticeVersion: 1, consent: {
    receipt: 'previous-valid-consent-capability', anonymousId: crypto.randomUUID(), accountId: null, expiresAt: new Date(Date.now() + 86400000).toISOString(),
  } }))
  const { container, calls } = await mount(false, 'page', '/privacy/settings')
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '撤回并删除统计记录')!.click())
  expect(calls).toContain('DELETE /api/analytics/consent')
  expect(container.textContent).toContain('历史统计记录已删除')
})
