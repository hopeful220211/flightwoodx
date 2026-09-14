// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { UserPartSchema, type UserPart } from '@fwx/parts-schema'
import { useAuthStore } from '../../stores/authStore'
import { makeCustomInstance } from './customAssembly'

const query = vi.hoisted(() => ({ data: undefined as UserPart | undefined, isError: false, error: null as Error | null, isFetching: true, refetch: vi.fn() }))
vi.mock('./useCustomAssemblyPart', () => ({ useCustomAssemblyPart: () => query }))
vi.mock('@react-three/drei', () => ({ Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, useBounds: () => null }))
import { CustomAssemblyPart, CustomPartInspector } from './CustomAssemblyPart'

it('labels placement mode without adding unrelated warnings to the inspector', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<CustomPartInspector instance={{
    instanceId: 'inspector', partId: 'custom:test', category: 'joint', position: [0, 0, 0], rotation: [0, 0, 0],
  }} />)
  expect(container.textContent).toContain('自由摆放')
  expect(container.textContent).not.toMatch(/未验证|未连接|制造与飞行/)
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
  expect(container.querySelectorAll('input')).toHaveLength(3)
})

it('reports ready only after source revalidation and mesh mount, and reports later source failure', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const unexpectedErrors: unknown[][] = []
  // This DOM harness mounts R3F host tags without a GPU; only those expected
  // host-tag/attribute warnings are ignored, not component/runtime failures.
  const errors = vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (!/unrecognized|incorrect casing|does not recognize|non-boolean attribute/.test(String(args[0]))) unexpectedErrors.push(args)
  })
  const previousAuth = useAuthStore.getState()
  useAuthStore.setState({ token: 'source-owner-test-token', user: { id: 'owner-a', username: 'Owner', role: 'student' } })
  const part = UserPartSchema.parse({
    id: '507f1f77bcf86cd799439011', ownerId: 'owner-a', name: 'Source', category: 'deco',
    geometry: { contour: 'M0 0 L40 0 L40 20 L0 20 Z', holes: [], thicknessMm: 2, bboxMm: { w: 40, h: 20 } },
    manufacturability: { closed: true, minFeatureMm: 0, withinBoard: true, passed: false }, flightImpact: { massG: 1 },
    createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z',
  })
  const instance = { ...makeCustomInstance(part, 'owner-a'), instanceId: 'custom-preview-instance' }
  const onReadinessChange = vi.fn()
  const root = createRoot(document.createElement('div'))
  const render = () => root.render(<CustomAssemblyPart instance={instance} onReadinessChange={onReadinessChange} />)
  try {
    await act(async () => render())
    expect(onReadinessChange).toHaveBeenLastCalledWith(instance.instanceId, { status: 'loading' })
    query.data = part
    await act(async () => render())
    expect(onReadinessChange.mock.calls.some(([, state]) => state.status === 'ready')).toBe(false)
    query.isFetching = false
    await act(async () => render())
    expect(onReadinessChange).toHaveBeenLastCalledWith(instance.instanceId, { status: 'ready' })
    query.isError = true
    query.error = new Error('Source was deleted')
    await act(async () => render())
    expect(onReadinessChange).toHaveBeenLastCalledWith(instance.instanceId, { status: 'error', error: query.error })
    expect(unexpectedErrors).toEqual([])
  } finally {
    await act(async () => root.unmount())
    useAuthStore.setState(previousAuth)
    errors.mockRestore()
    vi.unstubAllGlobals()
  }
})
