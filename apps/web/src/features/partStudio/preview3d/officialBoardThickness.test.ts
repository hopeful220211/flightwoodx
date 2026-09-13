import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Box3, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { USER_PART_THICKNESS_MM } from '@fwx/parts-schema'

describe('official board geometry baseline', () => {
  it('keeps all 94 official parts at 2 mm after their actual node transforms', async () => {
    // Keep fixture roots literal so the repository's source-boundary gate can
    // verify that every read stays inside this application's public assets.
    const fixtures = [
      { category: 'mainboards', count: 16, folder: new URL('../../../../public/models/mainboards/', import.meta.url) },
      { category: 'landings', count: 39, folder: new URL('../../../../public/models/landings/', import.meta.url) },
      { category: 'guards', count: 28, folder: new URL('../../../../public/models/guards/', import.meta.url) },
      { category: 'joints', count: 11, folder: new URL('../../../../public/models/joints/', import.meta.url) },
    ]
    for (const { category, count, folder } of fixtures) {
      const files = (await readdir(folder)).filter(name => name.endsWith('.glb'))
      expect(files).toHaveLength(count)
      for (const name of files) {
        const bytes = await readFile(new URL(name, folder))
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        const gltf = await new GLTFLoader().parseAsync(buffer, '')
        gltf.scene.updateMatrixWorld(true)
        const bounds = new Box3()
        gltf.scene.traverse(object => { if (object instanceof Mesh) bounds.expandByObject(object) })
        const dimensions = bounds.getSize(new Vector3())
        expect(dimensions.y, `${category}/${name}: transformed thickness`).toBeCloseTo(USER_PART_THICKNESS_MM / 1000, 6)
        gltf.scene.traverse(object => {
          if (!(object instanceof Mesh)) return
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => material.dispose())
        })
      }
    }
  })
})
