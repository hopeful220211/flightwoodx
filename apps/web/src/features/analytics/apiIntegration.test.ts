// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./client', () => ({ getAnalyticsHeaders: () => ({ 'X-FWX-Analytics-Consent': 'consent-capability', 'X-FWX-Analytics-Session': 'session-id' }) }))
import { apiFetch } from '../../utils/api'
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

it('adds consent and session only to non-admin business writes, not URLs or bodies', async () => {
  const transport = vi.fn(async () => Response.json({ success: true }))
  vi.stubGlobal('fetch', transport)
  await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'private@example.com' }) })
  await apiFetch('/designs')
  await apiFetch('/admin/users', { method: 'POST' })
  const calls = transport.mock.calls as unknown as [string, RequestInit][]
  expect(calls[0][1].headers).toMatchObject({ 'X-FWX-Analytics-Consent': 'consent-capability', 'X-FWX-Analytics-Session': 'session-id' })
  expect(calls[0][0]).not.toContain('consent')
  expect(calls[0][1].body).not.toContain('consent')
  expect(calls[1][1].headers).not.toHaveProperty('X-FWX-Analytics-Consent')
  expect(calls[2][1].headers).not.toHaveProperty('X-FWX-Analytics-Consent')
})
