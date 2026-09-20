import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
const require = createRequire(new URL('../apps/web/package.json',import.meta.url))
const { Vector3, Quaternion } = require('three')
const { GLTFLoader } = await import(pathToFileURL(require.resolve('three/examples/jsm/loaders/GLTFLoader.js')).href)
const catalog = JSON.parse(await readFile(new URL('../packages/geometry/src/official-connectors.json',import.meta.url),'utf8'))
// Root tests run before API pretest builds. Read the authoritative registry
// directly so a clean checkout needs no previously generated CJS files.
const source = await readFile(new URL('../packages/parts-schema/src/registry.ts',import.meta.url),'utf8')
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const { PART_REGISTRY } = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))

test('mesh-derived board normals and recovered slot directions stay reproducible', () => {
  execFileSync(process.execPath,[new URL('./generate-assembly-connectors.mjs',import.meta.url).pathname,'--check'],{stdio:'pipe'})
})

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
