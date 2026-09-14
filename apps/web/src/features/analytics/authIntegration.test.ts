// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), getMe: vi.fn() }))
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn(), resetAnalyticsIdentity: vi.fn() }))
vi.mock('../../utils/api', () => api)
vi.mock('../../stores/designStore', () => ({ clearDesignStore: vi.fn() }))
vi.mock('../../stores/programStore', () => ({ clearProgramStore: vi.fn() }))
vi.mock('./client', () => analytics)
import { useAuthStore } from '../../stores/authStore'

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks()
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
})

it('clears analytics before replacing the signed-in account and records no client auth success', async () => {
  useAuthStore.setState({ user: { id: 'old-user', username: 'old', role: 'student' }, token: 'old-token', isAuthenticated: true })
  let identityAtReset: string | undefined
  analytics.resetAnalyticsIdentity.mockImplementation(() => { identityAtReset = useAuthStore.getState().user?.id })
  api.login.mockResolvedValue({ success: true, data: { user: { id: 'new-user', username: 'new' }, token: 'new-token' } })
  await useAuthStore.getState().login('private@example.com', 'private-password')
  expect(identityAtReset).toBe('old-user')
  expect(analytics.resetAnalyticsIdentity).toHaveBeenCalledWith({ flushPending: true })
  expect(analytics.trackEvent.mock.calls).toEqual([['auth_started', { method: 'login' }]])
})

it('uses fixed failure categories without credentials or raw server error', async () => {
  api.login.mockResolvedValue({ success: false, status: 401, error: 'private details' })
  await useAuthStore.getState().login('private@example.com', 'private-password')
  expect(analytics.trackEvent).toHaveBeenLastCalledWith('operation_failed', { operation: 'auth', reason: 'unauthorized' })
  expect(JSON.stringify(analytics.trackEvent.mock.calls)).not.toContain('private')
})

it('clears analytics for logout and rejected restored credentials', async () => {
  useAuthStore.getState().logout()
  expect(analytics.resetAnalyticsIdentity).toHaveBeenCalledOnce()
  expect(analytics.resetAnalyticsIdentity).toHaveBeenLastCalledWith()
  useAuthStore.setState({ user: { id: 'old-user', username: 'old', role: 'student' }, token: 'expired', isAuthenticated: true })
  api.getMe.mockResolvedValue({ success: false, status: 401 })
  await useAuthStore.getState().restoreSession()
  expect(analytics.resetAnalyticsIdentity).toHaveBeenCalledTimes(2)
})
