// @vitest-environment jsdom
import * as THREE from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let finishImageLoad: (() => void) | undefined
let failImageLoad: (() => void) | undefined
let image: HTMLImageElement

beforeEach(() => {
  vi.resetModules()
  image = document.createElement('img')
  // Only replace the network/image boundary. TextureLoader still creates the
  // real texture and marks it for upload when its image callback completes.
  vi.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation((_url, onLoad, _onProgress, onError) => {
    finishImageLoad = () => onLoad?.(image)
    failImageLoad = () => onError?.(new Error('Image request failed'))
    return image
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  finishImageLoad = undefined
  failImageLoad = undefined
})

function sourceMesh() {
  return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
}

it('does not request GPU upload while the wood image is still loading', async () => {
  const { prepareWoodScene } = await import('./woodMaterial')
  const prepared = prepareWoodScene(sourceMesh()) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  const texture = prepared.material.map!

  expect(texture).toBeInstanceOf(THREE.Texture)
  expect(texture.image).toBeNull()
  // WebGLTextures warns each render when version > 0 but image is null.
  expect(texture.version).toBe(0)
  expect(texture.source.version).toBe(0)
})

it('marks the completed image for upload with the existing wood appearance settings', async () => {
  const { prepareWoodScene } = await import('./woodMaterial')
  const prepared = prepareWoodScene(sourceMesh()) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  const texture = prepared.material.map!
  finishImageLoad!()

  expect(texture.image).toBe(image)
  expect(texture.version).toBe(1)
  expect(texture.source.version).toBe(1)
  expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(texture.wrapS).toBe(THREE.RepeatWrapping)
  expect(texture.wrapT).toBe(THREE.RepeatWrapping)
  expect(texture.repeat.toArray()).toEqual([4, 4])
  expect(texture.anisotropy).toBe(8)
})

it('shares the loading texture without mutating the original GLB materials', async () => {
  const { prepareWoodScene, WOOD_COLOR } = await import('./woodMaterial')
  const source = sourceMesh()
  const originalColor = source.material.color.clone()
  const first = prepareWoodScene(source) as typeof source
  const second = prepareWoodScene(source) as typeof source

  expect(first.material).not.toBe(source.material)
  expect(second.material).not.toBe(first.material)
  expect(first.material.map).toBe(second.material.map)
  expect(source.material.map).toBeNull()
  expect(source.material.color.equals(originalColor)).toBe(true)
  expect(first.material.color.equals(WOOD_COLOR)).toBe(true)
  expect(first.material.roughness).toBe(0.72)
  expect(first.material.metalness).toBe(0)
  finishImageLoad!()
  expect(first.material.map!.image).toBe(image)
  expect(second.material.map!.image).toBe(image)
})

it('retries with a new texture without making an older failed scene ready', async () => {
  const { prepareWoodScene, waitForWoodTextures } = await import('./woodMaterial')
  const failedScene = prepareWoodScene(sourceMesh()) as ReturnType<typeof sourceMesh>
  const failedReady = waitForWoodTextures(failedScene)
  const failedAssertion = expect(failedReady).rejects.toThrow('木纹加载失败')
  failImageLoad!()
  await failedAssertion

  const retriedScene = prepareWoodScene(sourceMesh()) as ReturnType<typeof sourceMesh>
  expect(retriedScene.material.map).not.toBe(failedScene.material.map)
  const retriedReady = waitForWoodTextures(retriedScene)
  finishImageLoad!()
  await expect(retriedReady).resolves.toBeUndefined()
  await expect(waitForWoodTextures(failedScene)).rejects.toThrow('木纹加载失败')
  expect(THREE.ImageLoader.prototype.load).toHaveBeenCalledTimes(2)
})

it('gives generated pieces the exact same wood material and texture as official pieces', async () => {
  const { createWoodMaterial, prepareWoodScene, waitForWoodTextures } = await import('./woodMaterial')
  const official = prepareWoodScene(sourceMesh()) as ReturnType<typeof sourceMesh>
  const material = createWoodMaterial()
  const generated = new THREE.Mesh(new THREE.BoxGeometry(), material)
  expect(material.map).toBe(official.material.map)
  expect(material.color.equals(official.material.color)).toBe(true)
  expect(material.roughness).toBe(official.material.roughness)
  expect(material.metalness).toBe(official.material.metalness)
  expect(material.envMapIntensity).toBe(official.material.envMapIntensity)
  const ready = waitForWoodTextures(generated)
  finishImageLoad!()
  await expect(ready).resolves.toBeUndefined()
  material.dispose()
  expect(official.material.map!.image).toBe(image)
})
