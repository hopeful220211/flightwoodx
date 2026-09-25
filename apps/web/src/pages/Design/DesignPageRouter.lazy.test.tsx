// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DesignPageRouter } from './DesignPageRouter'
import { useDesignStore } from '../../stores/designStore'

const mocks = vi.hoisted(() => {
  let resolveGuided!: () => void
  let resolveFree!: () => void
  return {
    guidedImports: 0,
    freeImports: 0,
    guidedReady: new Promise<void>(resolve => { resolveGuided = resolve }),
    freeReady: new Promise<void>(resolve => { resolveFree = resolve }),
    resolveGuided: () => resolveGuided(),
    resolveFree: () => resolveFree(),
    loadFromServer: vi.fn(),
    snapshot: { decision: 'denied' as const },
  }
})

vi.mock('../../hooks/useDesignSync', () => ({ useDesignSync: () => ({ loadFromServer: mocks.loadFromServer }) }))
vi.mock('../../features/analytics/client', () => ({
  getAnalyticsClient: () => ({ subscribe: () => () => {}, getSnapshot: () => mocks.snapshot }),
  trackEvent: vi.fn(),
}))
vi.mock('./GuidedDesignPage', async () => {
  mocks.guidedImports += 1
  await mocks.guidedReady
  return { GuidedDesignPage: () => <div>guided editor ready</div> }
})
vi.mock('./DesignPage', async () => {
  mocks.freeImports += 1
  await mocks.freeReady
  return { DesignPage: () => <div>free editor ready</div> }
})

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  useDesignStore.setState({ designs: [], activeDesignId: null, deletedIds: [] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  mocks.resolveGuided()
  mocks.resolveFree()
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('loads only the selected editor after welcome, with a visible pending state', async () => {
  await act(async () => root.render(<MemoryRouter><DesignPageRouter /></MemoryRouter>))
  expect(container.textContent).toContain('开始新设计')
  expect(mocks.guidedImports).toBe(0)
  expect(mocks.freeImports).toBe(0)

  await act(async () => {
    const store = useDesignStore.getState()
    store.setActiveDesignId(store.createDesign('Guided work', 'guided'))
  })
  expect(mocks.guidedImports).toBe(1)
  expect(mocks.freeImports).toBe(0)
  expect(container.querySelector('[role="status"]')?.textContent).toContain('正在加载设计工具')
  await act(async () => mocks.resolveGuided())
  expect(container.textContent).toContain('guided editor ready')

  await act(async () => {
    const store = useDesignStore.getState()
    store.setActiveDesignId(store.createDesign('Free work', 'free'))
  })
  expect(mocks.freeImports).toBe(1)
  expect(container.querySelector('[role="status"]')?.textContent).toContain('正在加载设计工具')
  await act(async () => mocks.resolveFree())
  expect(container.textContent).toContain('free editor ready')
})
