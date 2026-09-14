// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../constants/storageKeys'
import ErrorBoundary from './ErrorBoundary'
import { trackEvent } from '../features/analytics/client'
vi.mock('../features/analytics/client', () => ({ trackEvent: vi.fn() }))

let root: Root
let container: HTMLDivElement
const renderError = new Error('Model request failed')

function BrokenChild(): never { throw renderError }

function storedValues(storage: Storage) {
  return Object.fromEntries(Object.keys(storage).sort().map(key => [key, storage.getItem(key)]))
}

beforeEach(() => {
  vi.mocked(trackEvent).mockClear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('auth-storage', JSON.stringify({ state: { token: 'test-session', user: { id: 'test-user' } } }))
  localStorage.setItem(STORAGE_KEYS.DESIGN_STORE, JSON.stringify({ state: { designs: [{ id: 'draft', name: '未保存作品' }] } }))
  localStorage.setItem(STORAGE_KEYS.PROGRAM_STORE, JSON.stringify({ state: { programs: { draft: '<xml>未保存程序</xml>' } } }))
  localStorage.setItem('unrelated-preference', 'keep-exactly')
  sessionStorage.setItem('temporary-draft', 'also-keep')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container, { onCaughtError: () => {} })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

it('renders healthy children without changing stored data', async () => {
  const before = storedValues(localStorage)
  await act(async () => root.render(<ErrorBoundary><p>作品编辑器</p></ErrorBoundary>))
  expect(container.textContent).toBe('作品编辑器')
  expect(storedValues(localStorage)).toEqual(before)
  expect(console.error).not.toHaveBeenCalled()
})

it('preserves all login and unsaved draft values when a child crashes', async () => {
  const localBefore = storedValues(localStorage)
  const sessionBefore = storedValues(sessionStorage)
  await act(async () => root.render(<ErrorBoundary><BrokenChild /></ErrorBoundary>))
  expect(container.querySelector('h1')?.textContent).toBe('应用出错了。')
  expect(storedValues(localStorage)).toEqual(localBefore)
  expect(storedValues(sessionStorage)).toEqual(sessionBefore)
  expect(console.error).toHaveBeenCalledExactlyOnceWith('Uncaught error:', renderError, expect.any(Object))
})

it('offers refresh without claiming to clear data or changing storage on retry', async () => {
  const localBefore = storedValues(localStorage)
  const sessionBefore = storedValues(sessionStorage)
  await act(async () => root.render(<ErrorBoundary><BrokenChild /></ErrorBoundary>))
  expect(container.textContent).not.toMatch(/已经清除|已清除/)
  expect(container.textContent).toContain('本地数据已保留')
  const reload = vi.fn()
  const originalWindow = window
  // Stub only browser navigation; the error boundary and real browser Storage remain in use.
  vi.stubGlobal('window', new Proxy(originalWindow, {
    get(target, property) {
      if (property === 'location') return { reload }
      return Reflect.get(target, property, target)
    },
  }))
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
  expect(reload).toHaveBeenCalledTimes(1)
  expect(storedValues(localStorage)).toEqual(localBefore)
  expect(storedValues(sessionStorage)).toEqual(sessionBefore)
})

it('reports only a fixed runtime category, never error text or component stack', async () => {
  await act(async () => root.render(<ErrorBoundary><BrokenChild /></ErrorBoundary>))
  expect(trackEvent).toHaveBeenCalledExactlyOnceWith('app_problem', { phase: 'runtime', reason: 'unknown' })
  expect(JSON.stringify(vi.mocked(trackEvent).mock.calls)).not.toContain(renderError.message)
})
