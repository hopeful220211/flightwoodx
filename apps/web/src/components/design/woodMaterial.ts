// src/components/design/woodMaterial.ts
// 木质零件统一外观：编辑器画布与缩略图预览共用，保证「编辑器里是木色、抓出来的封面也是木色」。
import * as THREE from 'three'
import { assetUrl } from '../../utils/assetUrl'

/**
 * 浅原木色（木质零件本体）：低饱和、偏白的暖木色，像浅色桦木/原木板。
 * 这个色会与木纹贴图相乘——刻意取接近白的暖灰白，让贴图本身的淡雅木纹透出来、
 * 不被高饱和橙压成深橙色。这是 3D 模型本色，不是 UI 土色，别改成蓝。
 */
export const WOOD_COLOR = new THREE.Color('#EADFCB')

/** 偏粗糙、零金属：木头不反光，让转折面靠受光差异产生明暗层次。 */
const WOOD_ROUGHNESS = 0.72
const WOOD_METALNESS = 0
const WOOD_BOARD_TEXTURE_URL = assetUrl('/textures/wood-board.webp')
// Keep the original PNG for browsers that cannot decode WebP and for rollback.
const WOOD_BOARD_FALLBACK_TEXTURE_URL = assetUrl('/textures/wood-board.png')
// 适度放大木纹（6 → 4）：纹路更大、更清楚一点点，仍保持自然淡雅、不变成深重花纹。
const WOOD_BOARD_TEXTURE_REPEAT = 4

let woodBoardTexture: THREE.Texture | null = null
const woodTextureLoads = new WeakMap<THREE.Texture, Promise<void>>()

function getWoodBoardTexture(): THREE.Texture | null {
  if (woodBoardTexture) return woodBoardTexture
  if (typeof window === 'undefined') return null

  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  // Editor meshes also use this resource without awaiting a snapshot. Keep the
  // rejection available to preview consumers without an unhandled rejection.
  void ready.catch(() => undefined)
  const texture = new THREE.TextureLoader().load(WOOD_BOARD_TEXTURE_URL, resolveReady, undefined, () => {
    // Keep the same texture object already attached to meshes. Replacing it
    // would leave those meshes waiting for a failed image even after fallback.
    new THREE.ImageLoader().load(WOOD_BOARD_FALLBACK_TEXTURE_URL, (image) => {
      texture.image = image
      texture.needsUpdate = true
      resolveReady()
    }, undefined, () => {
      if (woodBoardTexture === texture) woodBoardTexture = null
      rejectReady(new Error('木纹加载失败'))
    })
  })
  woodBoardTexture = texture
  woodTextureLoads.set(texture, ready)
  woodBoardTexture.colorSpace = THREE.SRGBColorSpace
  woodBoardTexture.wrapS = THREE.RepeatWrapping
  woodBoardTexture.wrapT = THREE.RepeatWrapping
  woodBoardTexture.repeat.set(WOOD_BOARD_TEXTURE_REPEAT, WOOD_BOARD_TEXTURE_REPEAT)
  woodBoardTexture.anisotropy = 8
  // TextureLoader marks the texture for upload after its image has loaded.
  // Marking it here would request an upload with image === null on every frame.

  return woodBoardTexture
}

/** Wait for the exact textures attached to this scene, including prior failures.
 * A retry creates a new texture; it must not make an older failed scene ready.
 * Cancelling one preview does not cancel this shared image request.
 */
export async function waitForWoodTextures(scene: THREE.Object3D): Promise<void> {
  const pending = new Set<Promise<void>>()
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.map) continue
      const ready = woodTextureLoads.get(material.map)
      if (ready) pending.add(ready)
    }
  })
  await Promise.all(pending)
}

/** Official GLBs and generated boards share this material, including texture readiness. */
export function createWoodMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial()
  configureWoodMaterial(material)
  return material
}

function configureWoodMaterial(material: THREE.MeshStandardMaterial): void {
  material.color.copy(WOOD_COLOR)
  material.map = getWoodBoardTexture()
  material.roughness = WOOD_ROUGHNESS
  material.metalness = WOOD_METALNESS
  material.envMapIntensity = 0.3
  material.userData.originalColor = material.color.clone()
  material.needsUpdate = true
}

/**
 * 克隆 GLB 场景，并把每个网格材质统一替换为暖木色 MeshStandard 外观。
 *
 * 关键：本项目多数零件 GLB 不自带材质，three 会套用规范默认材质（metalness = 1）。
 * 全金属材质在没有环境贴图时只反射环境（空 = 黑），会渲染成纯黑剪影——这正是
 * 作品卡缩略图发黑的根因。这里强制 metalness = 0 + 暖木色，从材质层根治黑团。
 *
 * 同时把 originalColor 存进 userData，供选中高亮逻辑还原颜色。
 */
export function prepareWoodScene(scene: THREE.Object3D): THREE.Object3D {
  const cloned = scene.clone(true)

  cloned.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return

    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const processed = materials.map((mat) => {
      // 默认材质是全局共享单例，必须先克隆再改，否则会污染其他零件。
      const m = mat.clone()

      if ('color' in m && m.color instanceof THREE.Color) {
        m.color.copy(WOOD_COLOR)
      }
      if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
        configureWoodMaterial(m)
      }
      if ('color' in m && m.color instanceof THREE.Color) {
        m.userData.originalColor = m.color.clone()
      }
      return m
    })

    child.material = Array.isArray(child.material) ? processed : processed[0]
  })

  return cloned
}
