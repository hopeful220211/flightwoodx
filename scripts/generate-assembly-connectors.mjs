// Generate trusted connector frames from shipped GLB nodes, not client data.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(resolve(root, 'apps/web/package.json'))
const { Matrix4, Vector3, Quaternion, PropertyBinding, Triangle } = require('three')
const source = await readFile(resolve(root,'packages/parts-schema/src/registry.ts'),'utf8')
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const { PART_REGISTRY } = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
const catalog = {}
for (const part of PART_REGISTRY) {
  const bytes = await readFile(resolve(root, 'apps/web/public', part.modelPath.slice(1)))
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  const connectors = [], meshes = [], names = new Set()
  let boardNormal
  const walk = (index, parent) => {
    const node = json.nodes[index]
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])))
    const world = parent.clone().multiply(local)
    if (node.mesh !== undefined) meshes.push({ mesh: json.meshes[node.mesh], world })
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION]
      const size = accessor.max.map((value, axis) => value - accessor.min[axis])
      const normal = new Vector3().setComponent(size.indexOf(Math.min(...size)),1).transformDirection(world)
      const principal = normal.toArray().findIndex(value => Math.abs(value) > .9)
      if (principal < 0) throw new Error(`Non-planar source frame: ${part.id}`)
      if (normal.getComponent(principal) < 0) normal.negate()
      if (boardNormal && normal.dot(new Vector3(...boardNormal)) < .99999) throw new Error(`Multiple board planes: ${part.id}`)
      boardNormal = normal.toArray()
    }
    const name = PropertyBinding.sanitizeNodeName(node.name ?? '').trim()
    const match = /^(?:conn_)?(socket|plug)_(.+)$/i.exec(name)
    if (match) {
      const id = `${match[1].toUpperCase()}_${match[2]}`
      if (names.has(id)) throw new Error(`Ambiguous connector: ${part.id}/${id}`)
      names.add(id)
      const p = new Vector3(), q = new Quaternion(), s = new Vector3()
      world.decompose(p, q, s)
      connectors.push({ id, kind: match[1].toLowerCase(), position: p.toArray(), quaternion: q.normalize().toArray() })
    }
    for (const child of node.children ?? []) walk(child, world)
  }
  for (const index of json.scenes[json.scene ?? 0].nodes ?? []) walk(index, new Matrix4())
  if (!boardNormal) throw new Error(`Missing board mesh: ${part.id}`)
  // A few authored empties have a bad roll; one has its Y along thickness.
  // For that undefined in-plane axis, recover the mouth direction from the
  // actual slot-bottom side face at the authored origin, never from part IDs.
  for (const c of connectors) {
    const normal = new Vector3(...boardNormal)
    if (Math.abs(new Vector3(0,1,0).applyQuaternion(new Quaternion(...c.quaternion)).dot(normal)) < .999) continue
    const bin = bytes.subarray(28+bytes.readUInt32LE(12))
    const read = (index, item, component = 0) => {
      const a = json.accessors[index], view = json.bufferViews[a.bufferView]
      const width = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1
      const stride = view.byteStride ?? width * (a.type === 'VEC3' ? 3 : 1)
      const offset = (view.byteOffset ?? 0)+(a.byteOffset ?? 0)+item*stride+component*width
      return a.componentType === 5126 ? bin.readFloatLE(offset) : width === 4 ? bin.readUInt32LE(offset) : width === 2 ? bin.readUInt16LE(offset) : bin.readUInt8(offset)
    }
    let closest = Infinity, mouth
    const origin = new Vector3(...c.position)
    for (const {mesh,world} of meshes) for (const p of mesh.primitives) {
      const count = json.accessors[p.indices ?? p.attributes.POSITION].count
      for (let i=0;i<count;i+=3) {
        const vertices = [0,1,2].map(k => {
          const index = p.indices === undefined ? i+k : read(p.indices,i+k)
          return new Vector3(...[0,1,2].map(axis => read(p.attributes.POSITION,index,axis))).applyMatrix4(world)
        })
        const triangle = new Triangle(...vertices), outward = triangle.getNormal(new Vector3())
        if (Math.abs(outward.dot(normal)) > .01) continue
        const distance = triangle.closestPointToPoint(origin,new Vector3()).distanceTo(origin)
        if (distance < closest) { closest=distance; mouth=outward.toArray() }
      }
    }
    if (!mouth || closest > .00001) throw new Error(`Cannot resolve slot-bottom face: ${part.id}/${c.id}`)
    c.mouthDirection = mouth
  }
  catalog[part.id] = { sha256: createHash('sha256').update(bytes).digest('hex'), boardNormal, connectors }
}
const result = JSON.stringify(catalog) + '\n'
const output = resolve(root, 'packages/geometry/src/official-connectors.json')
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== result) throw new Error('Connector metadata differs from shipped models; regenerate it.')
} else await writeFile(output, result)
console.log(`Verified connector metadata for ${Object.keys(catalog).length} models`)
