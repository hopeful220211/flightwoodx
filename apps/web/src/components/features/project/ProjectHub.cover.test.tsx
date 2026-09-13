// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Design } from '../../../types/design'
import { useAuthStore } from '../../../stores/authStore'
import { ToastProvider } from '../../common/Toast'
import type { ProjectHubData } from './useProjectHub'
import { ProjectHub } from './ProjectHub'

type Snapshot = (blob: Blob) => Promise<void>
const mocks = vi.hoisted(() => ({
  hub: null as ProjectHubData | null,
  listeners: new Set<() => void>(),
  snapshot: undefined as Snapshot | undefined,
  upload: vi.fn(),
}))
vi.mock('./useProjectHub', async () => {
  const { useSyncExternalStore } = await import('react')
  return { useProjectHub: () => useSyncExternalStore(callback => {
    mocks.listeners.add(callback)
    return () => { mocks.listeners.delete(callback) }
  }, () => mocks.hub) }
})
// Control delayed renderer callbacks without needing WebGL; exercise the real upload guard.
vi.mock('../../design/DesignPreview3D', () => ({ DesignPreview3D: ({ onSnapshot }: { onSnapshot?: Snapshot }) => {
  mocks.snapshot = onSnapshot
  return null
} }))
vi.mock('../../simulator/FlightPreview3D', () => ({ FlightPreview3D: () => null }))
vi.mock('../../../utils/api', async importOriginal => ({
  ...await importOriginal<typeof import('../../../utils/api')>(),
  uploadProjectCover: mocks.upload,
}))

let root: Root
let container: HTMLDivElement
let queryClient: QueryClient
let router: ReturnType<typeof createMemoryRouter>
const blob = new Blob(['test-cover'], { type: 'image/webp' })

function design(id = 'design-a', x = 0): Design {
  return {
    schemaVersion: 1, id, name: id, updatedAt: '2026-09-07T00:00:00.000Z',
    buildMode: 'free', currentStep: 'HUB', stepReached: 0,
    parts: [{ instanceId: 'part-a', partId: 'core_hub_01', category: 'mainboard', position: [x, 0, 0], rotation: [0, 0, 0] }],
  }
}

function hub(overrides: Partial<ProjectHubData> = {}): ProjectHubData {
  return {
    projectId: 'project-a', name: '项目甲', source: 'server', loggedIn: true,
    degraded: false, design: design(), designBound: true, program: null,
    programBound: false, status: 'ready', refetch: vi.fn(), ...overrides,
  }
}

async function renderHub(next: ProjectHubData = hub()) {
  await act(async () => {
    mocks.hub = next
    mocks.listeners.forEach(notify => notify())
    root.render(
      <StrictMode><QueryClientProvider client={queryClient}><ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider></QueryClientProvider></StrictMode>,
    )
  })
  return mocks.snapshot!
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.snapshot = undefined
  mocks.upload.mockReset().mockResolvedValue({ success: true, data: { coverUrl: '/uploads/cover.webp' } })
  localStorage.clear()
  useAuthStore.setState({ token: 'token-a', user: { id: 'owner-a', username: 'owner-a', role: 'student' }, isAuthenticated: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  router = createMemoryRouter([{ path: '/projects/:id', element: <ProjectHub /> }], { initialEntries: ['/projects/project-a'] })
})

afterEach(async () => {
  await act(async () => root.unmount())
  queryClient.clear()
  container.remove()
  vi.unstubAllGlobals()
})

it.each([
  { label: 'unbound local fallback', designBound: false },
  { label: 'local-only draft', source: 'local-draft' as const, designBound: false },
  { label: 'failed binding lookup', degraded: true },
  { label: 'different project metadata', projectId: 'project-b' },
])('does not upload $label', async overrides => {
  const snapshot = await renderHub(hub(overrides))
  if (snapshot) await act(async () => snapshot(blob))
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('uploads a valid bound design once and preserves duplicate suppression', async () => {
  const snapshot = await renderHub()
  await act(async () => { await snapshot(blob); await snapshot(blob) })
  expect(mocks.upload).toHaveBeenCalledExactlyOnceWith('project-a', blob)
})

it('describes program execution as simulation and states unavailable actions', async () => {
  await renderHub(hub({ program: {
    name: '模拟程序',
    commandProgram: {
      version: '1.0', metadata: { name: '模拟程序', author: '学生', createdAt: '2026-09-13T00:00:00Z' }, commands: [],
    },
  } }))
  expect(container.textContent).toContain('运行模拟')
  expect(container.textContent).toContain('查看当前程序的模拟运行过程，不代表实机飞行结果。')
  expect(container.textContent).toContain('历史查看、分支与版本恢复暂未开放')
  expect(container.textContent).not.toContain('让它飞起来')
})

it.each([
  { label: 'unbind', designBound: false },
  { label: 'rebind', design: design('design-b') },
  { label: 'same-count edit', design: design('design-a', 0.1) },
])('rejects an old snapshot after $label', async overrides => {
  const staleSnapshot = await renderHub()
  await renderHub(hub(overrides))
  await act(async () => staleSnapshot(blob))
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('rejects a snapshot after navigation to another project', async () => {
  const staleSnapshot = await renderHub()
  mocks.hub = hub({ projectId: 'project-b', design: design('design-b') })
  await act(async () => router.navigate('/projects/project-b'))
  await act(async () => staleSnapshot(blob))
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('rejects a snapshot after the page unmounts', async () => {
  const staleSnapshot = await renderHub()
  await act(async () => root.unmount())
  await act(async () => staleSnapshot(blob))
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('rejects a previous account snapshot', async () => {
  const staleSnapshot = await renderHub()
  await act(async () => useAuthStore.setState({ token: 'token-b', user: { id: 'owner-b', username: 'owner-b', role: 'student' } }))
  await act(async () => staleSnapshot(blob))
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('uploads a changed same-count snapshot after the earlier snapshot succeeds', async () => {
  const first = await renderHub()
  await act(async () => first(blob))
  const latest = await renderHub(hub({ design: design('design-a', 0.1) }))
  await act(async () => latest(blob))
  expect(mocks.upload).toHaveBeenCalledTimes(2)
})

it('serializes uploads and rechecks the binding before a queued upload starts', async () => {
  let finishFirst!: (value: { success: boolean }) => void
  mocks.upload.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
  const first = await renderHub()
  let firstUpload!: Promise<void>
  await act(async () => { firstUpload = first(blob) })
  expect(mocks.upload).toHaveBeenCalledTimes(1)
  const next = await renderHub(hub({ design: design('design-b') }))
  let nextUpload!: Promise<void>
  await act(async () => { nextUpload = next(blob) })
  expect(mocks.upload).toHaveBeenCalledTimes(1)
  await renderHub(hub({ designBound: false }))
  await act(async () => { finishFirst({ success: true }); await Promise.all([firstUpload, nextUpload]) })
  expect(mocks.upload).toHaveBeenCalledTimes(1)
})

it('allows retry after a current upload failure', async () => {
  mocks.upload.mockResolvedValueOnce({ success: false, error: '暂时失败' })
  const snapshot = await renderHub()
  await act(async () => { await snapshot(blob); await snapshot(blob) })
  expect(mocks.upload).toHaveBeenCalledTimes(2)
})

it('saves the latest queued snapshot after an obsolete upload finishes without clearing its deduplication', async () => {
  let finishFirst!: (value: { success: boolean }) => void
  mocks.upload.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
  const invalidations = vi.spyOn(queryClient, 'invalidateQueries')
  const first = await renderHub()
  let firstUpload!: Promise<void>
  await act(async () => { firstUpload = first(blob) })
  const latest = await renderHub(hub({ design: design('design-a', 0.2) }))
  let latestUpload!: Promise<void>
  await act(async () => { latestUpload = latest(blob) })
  expect(mocks.upload).toHaveBeenCalledTimes(1)
  await act(async () => { finishFirst({ success: true }); await Promise.all([firstUpload, latestUpload]) })
  expect(mocks.upload).toHaveBeenCalledTimes(2)
  expect(invalidations).toHaveBeenCalledTimes(1)
  await act(async () => latest(blob))
  expect(mocks.upload).toHaveBeenCalledTimes(2)
  invalidations.mockRestore()
})
