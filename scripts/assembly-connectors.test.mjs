import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(new URL('../apps/web/package.json',import.meta.url))
const { Vector3, Quaternion } = require('three')
const { GLTFLoader } = await import(pathToFileURL(require.resolve('three/examples/jsm/loaders/GLTFLoader.js')).href)
const catalog = JSON.parse(await readFile(new URL('../packages/geometry/src/official-connectors.json',import.meta.url),'utf8'))
const { PART_REGISTRY } = createRequire(new URL('../apps/api/package.json',import.meta.url))('@fwx/parts-schema/runtime-cjs')

test('all official connector frames match shipped GLBs and the actual Three loader', async () => {
  for (const part of PART_REGISTRY) {
    const data = await readFile(new URL(`../apps/web/public${part.modelPath}`,import.meta.url))
    assert.equal(catalog[part.id].sha256,createHash('sha256').update(data).digest('hex'),part.id)
    const json = JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString())
    // Node transforms are independent of texture/mesh decoding. Use the actual
    // loader's naming and hierarchy logic, without needing a browser image API.
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify({asset:json.asset,scenes:json.scenes,scene:json.scene,nodes:json.nodes.map(({mesh,skin,camera,...node})=>node)}),'')
    for (const expected of catalog[part.id].connectors) {
      let found = false
      gltf.scene.traverse(node => {
        const match = /^(?:conn_)?(socket|plug)_(.+)$/i.exec(node.name.trim())
        if (!match || `${match[1].toUpperCase()}_${match[2]}`!==expected.id) return
        found = true
        const p = node.getWorldPosition(new Vector3()), q = node.getWorldQuaternion(new Quaternion()).normalize()
        assert.ok(p.distanceTo(new Vector3(...expected.position))<1e-9,`${part.id}/${expected.id} position`)
        assert.ok(1-Math.abs(q.dot(new Quaternion(...expected.quaternion)))<1e-9,`${part.id}/${expected.id} rotation`)
      })
      assert.ok(found,`${part.id}/${expected.id} name`)
    }
  }
})
