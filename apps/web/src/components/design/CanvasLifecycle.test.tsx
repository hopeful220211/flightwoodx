// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, type CanvasProps } from '@react-three/fiber'
import { afterEach, expect, it, vi } from 'vitest'

// jsdom has no layout or GPU. Keep Fiber's real async setup, reconciler and
// event manager; only provide a measured box and the renderer's GPU boundary.

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([true, false])('only starts a 3D scene while its canvas is mounted (removed: %s)', async removed => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let measure!: () => void
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 640, 480))
  vi.stubGlobal('ResizeObserver', class {
    callback: () => void
    constructor(callback: () => void) { this.callback = callback }
    observe() { measure = this.callback }
    unobserve() {}
    disconnect() {}
  })
  const errors: unknown[][] = []
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args))
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onCreated = vi.fn()
  let finish!: () => void
  const gl = vi.fn((options: { canvas: HTMLCanvasElement }) => new Promise(resolve => {
    finish = () => resolve({
      domElement: options.canvas, render() {}, setSize() {}, setPixelRatio() {},
      shadowMap: {}, xr: { addEventListener() {}, removeEventListener() {}, isPresenting: false },
    })
  })) as unknown as NonNullable<CanvasProps['gl']>
  await act(async () => root.render(<Canvas resize={{ debounce: 0 }} frameloop="never" gl={gl} onCreated={onCreated} />))
  await act(async () => measure())
  expect(finish).toBeTypeOf('function')
  if (removed) await act(async () => root.unmount())
  await act(async () => finish())
  expect(onCreated).toHaveBeenCalledTimes(removed ? 0 : 1)
  if (!removed) await act(async () => root.unmount())
  host.remove()
  expect(errors).toEqual([])
})
