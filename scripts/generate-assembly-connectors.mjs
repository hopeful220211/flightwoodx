// Generate trusted connector frames from shipped GLB nodes, not client data.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(resolve(root, 'apps/web/package.json'))
const { Matrix4, Vector3, Quaternion, PropertyBinding } = require('three')
const source = await readFile(resolve(root,'packages/parts-schema/src/registry.ts'),'utf8')
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const { PART_REGISTRY } = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
const catalog = {}
for (const part of PART_REGISTRY) {
  const bytes = await readFile(resolve(root, 'apps/web/public', part.modelPath.slice(1)))
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  const connectors = [], names = new Set()
  const walk = (index, parent) => {
    const node = json.nodes[index]
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])))
    const world = parent.clone().multiply(local)
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
  catalog[part.id] = { sha256: createHash('sha256').update(bytes).digest('hex'), connectors }
}
const result = JSON.stringify(catalog) + '\n'
const output = resolve(root, 'packages/geometry/src/official-connectors.json')
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== result) throw new Error('Connector metadata differs from shipped models; regenerate it.')
} else await writeFile(output, result)
console.log(`Verified connector metadata for ${Object.keys(catalog).length} models`)
