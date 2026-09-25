// @vitest-environment jsdom
import { act, createElement, Fragment, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as THREE from 'three'
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest'

const renderer = vi.hoisted(() => ({
  state: {} as { gl: unknown; scene: unknown; camera: unknown },
  frames: [] as Array<() => void>,
}))
vi.mock('@react-three/fiber', () => ({
  Canvas: () => null,
  useThree: (selector?: (state: typeof renderer.state & { get: () => typeof renderer.state }) => unknown) => selector ? selector({ ...renderer.state, get: () => renderer.state }) : renderer.state,
  useFrame: (callback: () => void) => { renderer.frames.push(callback) },
}))
vi.mock('@react-three/drei', () => ({ useGLTF: vi.fn() }))

let root: Root
let container: HTMLDivElement
let canvas: HTMLCanvasElement
let render: ReturnType<typeof vi.fn>
let toBlob: MockInstance<HTMLCanvasElement['toBlob']>
let finishImageLoad: () => void
let failImageLoad: () => void
let Snapshot: ComponentType<{ trigger: number; onSnapshot: (blob: Blob) => void; onError?: (error: Error) => void; canCapture?: () => boolean }>

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  renderer.frames = []
  container = document.createElement('div')
  root = createRoot(container)
  canvas = document.createElement('canvas')
  render = vi.fn()
  toBlob = vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(new Blob(['cover'])))
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, onLoad, _onProgress, onError) => {
    const image = document.createElement('img')
    finishImageLoad = () => onLoad?.(image)
    failImageLoad = () => onError?.(new Error('Image request failed'))
    return image
  })
  const { prepareWoodScene } = await import('./woodMaterial')
  const scene = new THREE.Scene()
  scene.add(prepareWoodScene(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())))
  renderer.state = { gl: { render, domElement: canvas }, scene, camera: new THREE.PerspectiveCamera() }
  Snapshot = (await import('./DesignPreview3D')).SnapshotOnReady
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function renderFrames(count = 12) {
  await act(async () => {
    for (let frame = 0; frame < count; frame++) renderer.frames.forEach((callback) => callback())
  })
}

it('waits for a delayed wood image, renders the current scene, then captures once', async () => {
  const onSnapshot = vi.fn()
  await act(async () => root.render(createElement(Snapshot, { trigger: 6, onSnapshot })))
  await renderFrames()
  expect(toBlob).not.toHaveBeenCalled()
  expect(onSnapshot).not.toHaveBeenCalled()

  await act(async () => finishImageLoad())
  await renderFrames()
  expect(render).toHaveBeenCalledWith(renderer.state.scene, renderer.state.camera)
  expect(render.mock.invocationCallOrder[0]).toBeLessThan(toBlob.mock.invocationCallOrder[0])
  expect(toBlob).toHaveBeenCalledOnce()
  expect(onSnapshot).toHaveBeenCalledOnce()
})

it('reports a failed wood image without capturing or uploading an empty texture', async () => {
  const onSnapshot = vi.fn()
  const onError = vi.fn()
  await act(async () => root.render(createElement(Snapshot, { trigger: 6, onSnapshot, onError })))
  await act(async () => failImageLoad()) // WebP
  await act(async () => failImageLoad()) // PNG fallback
  await renderFrames()
  expect(toBlob).not.toHaveBeenCalled()
  expect(onSnapshot).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith(expect.any(Error))
})

it('captures after the PNG fallback loads when WebP is unavailable', async () => {
  const onSnapshot = vi.fn()
  const onError = vi.fn()
  await act(async () => root.render(createElement(Snapshot, { trigger: 6, onSnapshot, onError })))
  await act(async () => failImageLoad())
  await renderFrames()
  expect(onSnapshot).not.toHaveBeenCalled()

  await act(async () => finishImageLoad())
  await renderFrames()
  expect(onSnapshot).toHaveBeenCalledOnce()
  expect(onError).not.toHaveBeenCalled()
})

it('does not render or capture after unmount while the shared image is pending', async () => {
  const onSnapshot = vi.fn()
  await act(async () => root.render(createElement(Snapshot, { trigger: 6, onSnapshot })))
  await act(async () => root.render(null))
  await act(async () => finishImageLoad())
  expect(render).not.toHaveBeenCalled()
  expect(toBlob).not.toHaveBeenCalled()
  expect(onSnapshot).not.toHaveBeenCalled()
})

it('does not publish a late canvas Blob after unmount', async () => {
  let finishBlob: BlobCallback | undefined
  toBlob.mockImplementation((callback) => { finishBlob = callback })
  const onSnapshot = vi.fn()
  await act(async () => root.render(createElement(Snapshot, { trigger: 6, onSnapshot })))
  await act(async () => finishImageLoad())
  await renderFrames()
  expect(toBlob).toHaveBeenCalledOnce()
  await act(async () => root.render(null))
  await act(async () => finishBlob!(new Blob(['late cover'])))
  expect(onSnapshot).not.toHaveBeenCalled()
})

it('lets another preview finish when a sibling waiting on the same texture unmounts', async () => {
  const first = vi.fn()
  const second = vi.fn()
  await act(async () => root.render(createElement(Fragment, null,
    createElement(Snapshot, { key: 'first', trigger: 6, onSnapshot: first }),
    createElement(Snapshot, { key: 'second', trigger: 6, onSnapshot: second }),
  )))
  await act(async () => root.render(createElement(Fragment, null,
    createElement(Snapshot, { key: 'second', trigger: 6, onSnapshot: second }),
  )))
  await act(async () => finishImageLoad())
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledOnce()
  expect(THREE.ImageLoader.prototype.load).toHaveBeenCalledOnce()
})

it('reports a failed canvas encoding without publishing a cover', async () => {
  toBlob.mockImplementation((callback) => callback(null))
  const onSnapshot = vi.fn()
  const onError = vi.fn()
  await act(async () => root.render(createElement(Snapshot, { trigger: 6, onSnapshot, onError })))
  await act(async () => finishImageLoad())
  expect(onSnapshot).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith(expect.any(Error))
})

it('does not capture when a custom source starts revalidating before the wood image finishes', async () => {
  let currentSourceReady = true
  const onSnapshot = vi.fn()
  await act(async () => root.render(createElement(Snapshot, { trigger: 6, onSnapshot, canCapture: () => currentSourceReady })))
  currentSourceReady = false
  await act(async () => finishImageLoad())
  expect(render).not.toHaveBeenCalled()
  expect(onSnapshot).not.toHaveBeenCalled()
})

it('rejects a late cover callback after the authenticated account changes', async () => {
  const { useAuthStore } = await import('../../stores/authStore')
  let finishBlob: BlobCallback | undefined
  toBlob.mockImplementation((callback) => { finishBlob = callback })
  const onSnapshot = vi.fn()
  await act(async () => root.render(createElement(Snapshot, { trigger: 6, onSnapshot })))
  await act(async () => finishImageLoad())
  expect(toBlob).toHaveBeenCalledOnce()
  await act(async () => {
    useAuthStore.setState({ user: { id: 'another-account', username: 'Other', role: 'student' }, token: 'new-test-session' })
    finishBlob!(new Blob(['old account cover']))
  })
  expect(onSnapshot).not.toHaveBeenCalled()
})

it('fits a 40 mm custom part without clipping it at the original 0.1 m near plane', async () => {
  const { FitToMeshes } = await import('./DesignPreview3D')
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.002, 0.02), new THREE.MeshStandardMaterial()))
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  renderer.state.camera = camera
  await act(async () => root.render(createElement(FitToMeshes, { groupRef: { current: group }, trigger: 1 })))
  expect(camera.near).toBeGreaterThan(0)
  expect(camera.near).toBeLessThan(camera.position.length() - 0.04)
  expect(camera.far).toBeGreaterThan(camera.position.length() + 0.04)
})
