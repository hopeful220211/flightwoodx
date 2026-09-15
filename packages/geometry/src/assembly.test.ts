import { describe, expect, it } from 'vitest'
import { customConnectors, connectAssembly, validateAssemblyConnections, moveAssemblyTree, worldConnector } from './assembly'
import { svgGeometryToPart2D } from './index'
import type { DesignPartInstance, UserPart } from '@fwx/parts-schema'

const source = { id: 'a'.repeat(24), ownerId: 'b'.repeat(24), version: 1, updatedAt: '2026-09-15T00:00:00.000Z',
  geometry: { type: 'svg', contour: 'M0 0 L20 0 L20 20 L0 20 L0 11 L10 11 L10 9 L0 9 Z', holes: [], thicknessMm: 2, bboxMm: { w: 20, h: 20 } },
  jointGuides: [{ id: 'edge-1', kind: 'edge-slot', x: 0, y: 9, lengthMm: 10, axis: 'x', entry: 'start' }],
} as unknown as UserPart
const instance = (id: string): DesignPartInstance => ({ instanceId: id, partId: `custom_${source.id}`, category: 'guard', source: { kind: 'custom', id: source.id, version: 1, updatedAt: source.updatedAt }, position: [0,0,0], rotation: [0,0,0] })
const frames = () => customConnectors(source)

describe('edge-slot assembly', () => {
  it('joins every horizontal/vertical entry combination with perpendicular board normals', () => {
    const points = svgGeometryToPart2D(source.geometry)!.contour.points
    const variants = [
      { axis:'x',entry:'start',x:0,y:9, transform:([x,y]:number[])=>[x!,y!] },
      { axis:'x',entry:'end',x:10,y:9, transform:([x,y]:number[])=>[20-x!,y!] },
      { axis:'y',entry:'start',x:9,y:0, transform:([x,y]:number[])=>[y!,x!] },
      { axis:'y',entry:'end',x:9,y:10, transform:([x,y]:number[])=>[y!,20-x!] },
    ] as const
    const normal = (p: DesignPartInstance) => {
      const [x,y,z,w] = worldConnector(p,{id:'normal',kind:'edge-slot',position:[0,0,0],quaternion:[0,0,0,1]}).quaternion
      return [2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)]
    }
    for (const one of variants) for (const two of variants) {
      const frames = [one,two].map(v => customConnectors({...source,geometry:{...source.geometry,contour:v.transform ? points.map((p,i)=>`${i?'L':'M'}${v.transform(p).join(' ')}`).join(' ')+' Z' : ''},jointGuides:[{...source.jointGuides![0]!,axis:v.axis,entry:v.entry,x:v.x,y:v.y}]}))
      const resolver = (p: DesignPartInstance) => frames[p.instanceId === 'a' ? 0 : 1]!
      const parts = connectAssembly([instance('a'),instance('b')],'b','joint:edge-1','a','joint:edge-1',resolver)
      const a = normal(parts[0]!), b = normal(parts[1]!)
      expect(a.reduce((n,v,i)=>n+v*b[i]!,0)).toBeCloseTo(0,8)
      expect(validateAssemblyConnections(parts,resolver)).toBeNull()
    }
  })
  it('uses the actual centered slot bottom and ignores ordinary/through holes', () => {
    expect(frames()).toHaveLength(1)
    expect(frames()[0]!.position).toEqual([0,0,0])
    expect(customConnectors({ ...source, jointGuides: [] })).toEqual([])
    expect(() => customConnectors({ ...source, jointGuides: [{ ...source.jointGuides![0]!, x: 30 }] })).toThrow()
  })
  it('coincides bottoms, stands perpendicular, preserves a rotated parent and validates', () => {
    const parent = { ...instance('parent'), position: [0.1,0.2,0.3] as [number,number,number], rotation: [0.3,0.6,0.1] as [number,number,number] }
    const parts = connectAssembly([parent, instance('child')], 'child', 'joint:edge-1', 'parent', 'joint:edge-1', frames)
    const a = worldConnector(parts[0]!, frames()[0]!), b = worldConnector(parts[1]!, frames()[0]!)
    a.position.forEach((n,i) => expect(n).toBeCloseTo(b.position[i]!, 8))
    expect(validateAssemblyConnections(parts, frames)).toBeNull()
    const moved = moveAssemblyTree(parts, 'parent', { position: [0.2,0.3,0.4], rotation: [0.2,0.4,0.5] })
    expect(validateAssemblyConnections(moved, frames)).toBeNull()
  })
  it('rejects missing or occupied endpoints, cycles, non-unit scale and forged transforms', () => {
    const parts = connectAssembly([instance('a'), instance('b'), instance('c')], 'b', 'joint:edge-1', 'a', 'joint:edge-1', frames)
    expect(() => connectAssembly(parts, 'c', 'joint:edge-1', 'a', 'joint:edge-1', frames)).toThrow(/占用/)
    expect(() => connectAssembly(parts, 'a', 'joint:edge-1', 'b', 'joint:edge-1', frames)).toThrow()
    expect(() => connectAssembly([instance('a'), instance('b')], 'b', 'missing', 'a', 'joint:edge-1', frames)).toThrow(/插接口/)
    expect(() => connectAssembly([instance('a'), {...instance('b'),scale:[2,1,1]}], 'b', 'joint:edge-1', 'a', 'joint:edge-1', frames)).toThrow(/尺寸/)
    expect(validateAssemblyConnections(parts.map(p => p.instanceId === 'b' ? {...p,position:[9,0,0]} : p), frames)).toMatch(/对齐/)
  })
})
