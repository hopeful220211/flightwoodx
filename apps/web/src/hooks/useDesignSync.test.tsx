// @vitest-environment jsdom
import { act, StrictMode, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDesignSync } from './useDesignSync'
import type { Design } from '../types/design'

const mocks = vi.hoisted(() => ({ track: vi.fn(), put: vi.fn(), auth: { token: 'account-token', user: { isGuest: false } } }))
vi.mock('../features/analytics/client', () => ({ trackEvent: mocks.track, getAnalyticsHeaders: () => ({}) }))
vi.mock('../utils/api', () => ({ putDroneDesign: mocks.put, getDroneDesigns: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: Object.assign((select: (state: unknown) => unknown) => select(mocks.auth), { getState: () => mocks.auth }) }))
let hook: ReturnType<typeof useDesignSync>
let root: Root
function Probe() { const current = useDesignSync(); useEffect(() => { hook = current }); return <span>{current.saveStatus}</span> }
const design = { id: 'draft-a', name: 'Review' } as Design
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.put.mockReset().mockResolvedValue({ success: true })
  mocks.track.mockClear()
  mocks.auth.user.isGuest = false
  mocks.auth.token = 'account-token'
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<StrictMode><Probe /></StrictMode>))
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals() })

it('can leave the saving state after StrictMode replays the mount effect', async () => {
  await act(async () => { await hook.saveNow(design) })
  expect(hook.saveStatus).toBe('saved')
  expect(mocks.track).not.toHaveBeenCalled()
})

it('reports a failed account save once with a fixed reason, not the error text', async () => {
  mocks.put.mockResolvedValue({ success: false, status: 503, error: 'private server response' })
  await act(async () => { await hook.saveNow(design) })
  expect(mocks.track).toHaveBeenCalledExactlyOnceWith('operation_failed', { operation: 'design_save', reason: 'server' })
})

it('distinguishes explicitly saved empty local drafts from nonempty works', async () => {
  mocks.auth.user.isGuest = true
  await act(async () => root.render(<StrictMode><Probe /></StrictMode>))
  await act(async () => { await hook.saveNow({ ...design, parts: [] }) })
  expect(mocks.track).toHaveBeenCalledExactlyOnceWith('local_design_saved', { designId: design.id, nonempty: false })
  expect(mocks.put).not.toHaveBeenCalled()
})

it('flushes an outstanding save when leaving the editor', async () => {
  await act(async () => hook.saveToServer(design))
  expect(mocks.put).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ localId: 'draft-a' }))
})

it('does not write a queued draft using a different account', async () => {
  await act(async () => hook.saveToServer(design))
  mocks.auth.token = 'other-account-token'
  await act(async () => root.unmount())
  expect(mocks.put).not.toHaveBeenCalled()
})

it('serializes snapshots of one design so an older response cannot overwrite the latest save', async () => {
  const actualApi = await vi.importActual<typeof import('../utils/api')>('../utils/api')
  mocks.put.mockImplementation(actualApi.putDroneDesign)
  localStorage.setItem('auth-storage', JSON.stringify({ state: { token: mocks.auth.token } }))
  let finishFirst!: (value: Response) => void
  const network = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
    .mockResolvedValue(Response.json({ design: { id: design.id } }))
  vi.stubGlobal('fetch', network)
  let first!: Promise<boolean>
  let latest!: Promise<boolean>
  await act(async () => {
    first = hook.saveNow({ ...design, name: 'Older' })
    latest = hook.saveNow({ ...design, name: 'Latest' })
  })
  expect(network).toHaveBeenCalledTimes(1)
  await act(async () => { finishFirst(Response.json({ design: { id: design.id } })); await Promise.all([first, latest]) })
  expect(JSON.parse(network.mock.calls[1][1].body).name).toBe('Latest')
  expect(hook.saveStatus).toBe('saved')
})

it('keeps the save queue across editor unmount and remount', async () => {
  const actualApi = await vi.importActual<typeof import('../utils/api')>('../utils/api')
  mocks.put.mockImplementation(actualApi.putDroneDesign)
  localStorage.setItem('auth-storage', JSON.stringify({ state: { token: mocks.auth.token } }))
  let finishFirst!: (value: Response) => void
  const network = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
    .mockResolvedValue(Response.json({ design: { id: design.id } }))
  vi.stubGlobal('fetch', network)
  let first!: Promise<boolean>
  await act(async () => { first = hook.saveNow({ ...design, name: 'Older' }) })
  await act(async () => root.unmount())
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<StrictMode><Probe /></StrictMode>))
  let latest!: Promise<boolean>
  await act(async () => { latest = hook.saveNow({ ...design, name: 'Latest' }) })
  expect(network).toHaveBeenCalledTimes(1)
  await act(async () => { finishFirst(Response.json({ design: { id: design.id } })); await Promise.all([first, latest]) })
  expect(network).toHaveBeenCalledTimes(2)
})
