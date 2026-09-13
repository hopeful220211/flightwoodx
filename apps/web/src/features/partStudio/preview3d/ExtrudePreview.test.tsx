// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { UserPartGeometry } from '@fwx/parts-schema'

const state = vi.hoisted(() => ({ camera: null as THREE.PerspectiveCamera | null, invalidate: vi.fn() }))
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="mock-gpu">{children}</div>,
  useThree: (selector: (value: unknown) => unknown) => selector({ get: () => ({ camera: state.camera, invalidate: state.invalidate }), size: { width: 640, height: 480 } }),
}))
vi.mock('@react-three/drei', () => ({ OrbitControls: () => null }))
import { ExtrudePreview } from './ExtrudePreview'

let root: Root
let container: HTMLDivElement
let finish: (() => void) | undefined
let fail: (() => void) | undefined
let unexpectedErrors: unknown[][]
const geometry: UserPartGeometry = { contour: 'M0 0L80 0L80 40L0 40Z', holes: [], thicknessMm: 2, bboxMm: { w: 80, h: 40 } }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  unexpectedErrors = []
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (!/unrecognized|incorrect casing|does not recognize|non-boolean attribute/.test(String(args[0]))) unexpectedErrors.push(args)
  })
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, onLoad, _progress, onError) => {
    const image = document.createElement('img')
    finish = () => onLoad?.(image)
    fail = () => onError?.(new Error('test image network failure'))
    return image
  })
  state.camera = new THREE.PerspectiveCamera(42, 640 / 480)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  // Reject a still-shared test texture so the next test starts a fresh request.
  await act(async () => { fail?.(); root.unmount() })
  container.remove()
  expect(unexpectedErrors).toEqual([])
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('shows physical dimensions and switches real camera poses without changing the board', async () => {
  await act(async () => root.render(<ExtrudePreview geometry={geometry} />))
  expect(container.textContent).toContain('80 × 40 × 2 mm')
  expect(container.textContent).toContain('木板厚度 2 mm')
  expect(container.querySelector('[data-wood-ready="false"]')).not.toBeNull()
  await act(async () => finish!())
  expect(container.querySelector('[data-wood-ready="true"]')).not.toBeNull()
  const buttons = [...container.querySelectorAll('button')]
  const initial = state.camera!.position.clone()
  await act(async () => buttons.find(button => button.textContent === '俯视')!.click())
  expect(state.camera!.position.x).toBe(0)
  expect(state.camera!.position.z).toBe(0)
  expect(state.camera!.position.y).toBeGreaterThan(0)
  await act(async () => buttons.find(button => button.textContent === '侧视')!.click())
  expect(state.camera!.position.y).toBe(0)
  state.camera!.position.set(1, 2, 3)
  await act(async () => buttons.find(button => button.textContent === '复位')!.click())
  expect(state.camera!.position.toArray()).toEqual(initial.toArray())
  expect(container.textContent).toContain('80 × 40 × 2 mm')
})

it('keeps the outline available after a wood image failure and retries with a new request', async () => {
  await act(async () => root.render(<ExtrudePreview geometry={geometry} />))
  await act(async () => fail!())
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('二维轮廓仍保留')
  expect(container.querySelector('[data-testid="mock-gpu"]')).toBeNull()
  await act(async () => container.querySelector('button')!.click())
  expect(THREE.ImageLoader.prototype.load).toHaveBeenCalledTimes(2)
  await act(async () => finish!())
  expect(container.querySelector('[data-wood-ready="true"]')).not.toBeNull()
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.textContent).toContain('80 × 40 × 2 mm')
})

it('keeps wrapping controls and the rotation hint outside the camera viewport', async () => {
  await act(async () => root.render(<ExtrudePreview geometry={geometry} />))
  await act(async () => finish!())
  const toolbar = container.querySelector('[data-testid="part-3d-toolbar"]')
  const viewport = container.querySelector('[data-testid="part-3d-viewport"]')
  const hint = container.querySelector('[data-testid="part-3d-hint"]')
  expect(toolbar).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(hint).not.toBeNull()
  expect(toolbar!.nextElementSibling).toBe(viewport)
  expect(viewport!.nextElementSibling).toBe(hint)
  expect(viewport!.querySelector('[data-testid="mock-gpu"]')).not.toBeNull()
  for (const element of [toolbar, hint]) expect(element!.classList.contains('absolute')).toBe(false)
})

it('does not mount a 3D scene for empty or invalid geometry', async () => {
  await act(async () => root.render(<ExtrudePreview geometry={null} />))
  expect(container.querySelector('[data-testid="mock-gpu"]')).toBeNull()
  await act(async () => root.render(<ExtrudePreview geometry={{ ...geometry, thicknessMm: 20 as 2 }} />))
  expect(container.querySelector('[data-testid="mock-gpu"]')).toBeNull()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('检查二维轮廓')
})
