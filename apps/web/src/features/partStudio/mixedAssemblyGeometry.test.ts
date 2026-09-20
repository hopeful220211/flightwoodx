import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Box3, DoubleSide, Euler, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { PART_REGISTRY, type DesignPartInstance, type UserPart } from '@fwx/parts-schema'
import { connectAssembly, customConnectors, officialConnectors, worldConnector, repairLegacyAssemblyConnections, validateAssemblyConnections } from '@fwx/geometry'
import { buildCustomGeometry } from './customAssembly'
import { computePerpendicularSnap, quaternionToEuler } from '../../components/design/snap'

const custom = {
  geometry:{type:'svg',contour:'M0 0 L60 0 L60 40 L0 40 L0 21 L20 21 L20 19 L0 19 Z',holes:[],thicknessMm:2,bboxMm:{w:60,h:40}},
  jointGuides:[{id:'left',kind:'edge-slot',x:0,y:19,lengthMm:20,axis:'x',entry:'start'}],
} as Pick<UserPart,'geometry'|'jointGuides'>
const userInstance: DesignPartInstance = {instanceId:'custom',partId:'custom_'+'a'.repeat(24),category:'mainboard',position:[.1,.2,.3],rotation:[.3,.5,.7],source:{kind:'custom',id:'a'.repeat(24),version:1,updatedAt:'2026-09-20T00:00:00.000Z'}}
const q = (p: DesignPartInstance) => new Quaternion().setFromEuler(new Euler(...p.rotation))

async function meshScene(path: string) {
  const bytes = readFileSync(join(fileURLToPath(new URL('../../../public/', import.meta.url)),path))
  const length = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.subarray(20,20+length).toString())
  // Decode shipped mesh positions/normals and hierarchy; textures are irrelevant
  // to mechanical alignment and require a browser image API.
  delete json.images; delete json.textures; delete json.materials
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material
  const encoded = Buffer.from(JSON.stringify(json)), padded = Math.ceil(encoded.length/4)*4
  const glb = Buffer.alloc(20+padded+bytes.length-20-length, 32)
  bytes.copy(glb,0,0,20); glb.writeUInt32LE(glb.length,8); glb.writeUInt32LE(padded,12)
  encoded.copy(glb,20); bytes.copy(glb,20+padded,20+length)
  return (await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength), '')).scene
}

describe('mixed assembly against actual rendered geometry', () => {
  it('repairs recognized old coplanar mixed joints without inventing connections or moving unrelated parts', () => {
    const target = customConnectors(custom)[0]!, own = officialConnectors('arm_37').find(c=>c.id==='PLUG_3')!
    const world = worldConnector(userInstance,target)
    const old = computePerpendicularSnap({socketWorldPosition:new Vector3(...world.position),socketWorldQuaternion:new Quaternion(...world.quaternion),plugLocalPosition:new Vector3(...own.position),plugLocalQuaternion:new Quaternion(...own.quaternion)})
    const child: DesignPartInstance = {instanceId:'old',partId:'arm_37',category:'landing',position:old.position.toArray(),rotation:quaternionToEuler(old.quaternion),activeConnectorId:own.id,attachedTo:{parentInstanceId:'custom',parentConnectorId:target.id}}
    const independent: DesignPartInstance = {...child,instanceId:'loose',attachedTo:null}
    const resolve = (p: DesignPartInstance) => p.source ? [target] : officialConnectors(p.partId)
    const parts = [userInstance,child,independent]
    expect(validateAssemblyConnections(parts,resolve)).toMatch(/对齐/)
    const repaired = repairLegacyAssemblyConnections(parts,resolve)
    expect(validateAssemblyConnections(repaired,resolve)).toBeNull()
    expect(repaired[2]).toBe(independent)
    expect(repairLegacyAssemblyConnections(repaired,resolve)).toBe(repaired)
    const moved = parts.map(p=>p.instanceId==='old'?{...p,position:[9,9,9] as [number,number,number]}:p)
    expect(repairLegacyAssemblyConnections(moved,resolve)).toBe(moved)
  })
  it('locates the custom slot bottom on the rendered cut, not just its marker', () => {
    const geometry = buildCustomGeometry(custom.geometry)
    const material = new MeshBasicMaterial({side:DoubleSide})
    const mesh = new Mesh(geometry,material)
    const bottom = new Vector3(...customConnectors(custom)[0]!.position)
    const hits = (x: number) => new Raycaster(bottom.clone().add(new Vector3(x,.01,0)),new Vector3(0,-1,0)).intersectObject(mesh).length
    expect(hits(-.0005)).toBe(0)
    expect(hits(.0005)).toBeGreaterThan(0)
    geometry.dispose();material.dispose()
  })
  it('keeps actual boards perpendicular and slot origins coincident in both directions for every official connector', async () => {
    const frames = customConnectors(custom)
    for (const entry of PART_REGISTRY) {
      const scene = await meshScene(entry.modelPath)
      const size = new Box3().setFromObject(scene).getSize(new Vector3())
      const axis = size.toArray().indexOf(Math.min(...size.toArray()))
      const normal = new Vector3().setComponent(axis,1)
      expect(size.getComponent(axis), entry.id).toBeCloseTo(.002,5)
      const official: DesignPartInstance = {instanceId:'official',partId:entry.id,category:entry.category,position:[.2,.1,-.1],rotation:[.4,-.2,.6]}
      const resolve = (p: DesignPartInstance) => p.source ? frames : officialConnectors(p.partId)
      for (const c of officialConnectors(entry.id)) for (const reverse of [false,true]) {
        const result = connectAssembly([userInstance,official],reverse?'custom':'official',reverse?frames[0]!.id:c.id,reverse?'official':'custom',reverse?c.id:frames[0]!.id,resolve)
        const a = result[0]!, b = result[1]!
        const wc = worldConnector(a,frames[0]!), wo = worldConnector(b,c)
        expect(new Vector3(...wc.position).distanceTo(new Vector3(...wo.position)),`${entry.id}/${c.id}`).toBeLessThan(1e-8)
        expect(Math.abs(new Vector3(0,1,0).applyQuaternion(q(a)).dot(normal.clone().applyQuaternion(q(b)))),entry.id).toBeLessThan(1e-5)
        expect(new Vector3(0,-1,0).applyQuaternion(new Quaternion(...wc.quaternion)).dot(new Vector3(0,-1,0).applyQuaternion(new Quaternion(...wo.quaternion))),entry.id).toBeCloseTo(-1,6)
      }
      scene.traverse(node => {if (node instanceof Mesh) {node.geometry.dispose(); const mats = Array.isArray(node.material)?node.material:[node.material];mats.forEach(m=>m.dispose())}})
    }
  })
})
