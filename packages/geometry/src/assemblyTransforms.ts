import type { DesignPartInstance } from '@fwx/parts-schema'

type V = [number, number, number]
type Q = [number, number, number, number]
export interface AssemblyConnector { id: string; kind: 'socket' | 'plug' | 'edge-slot'; position: V; quaternion: Q }
export type ConnectorResolver = (part: DesignPartInstance) => AssemblyConnector[]
const add = (a: V, b: V): V => [a[0]+b[0], a[1]+b[1], a[2]+b[2]]
const sub = (a: V, b: V): V => [a[0]-b[0], a[1]-b[1], a[2]-b[2]]
const inv = (q: Q): Q => [-q[0],-q[1],-q[2],q[3]]
const mul = (a: Q,b: Q): Q => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]
const rotate = (v: V,q: Q): V => mul(mul(q,[...v,0]),inv(q)).slice(0,3) as V
const fromEuler = ([x,y,z]: V): Q => mul(mul([Math.sin(x/2),0,0,Math.cos(x/2)],[0,Math.sin(y/2),0,Math.cos(y/2)]),[0,0,Math.sin(z/2),Math.cos(z/2)])
const toEuler = (q: Q): V => {
  const [x,y,z,w] = q, m13 = 2*(x*z+y*w)
  return [Math.abs(m13)<0.9999999 ? Math.atan2(2*(x*w-y*z),1-2*(x*x+y*y)) : Math.atan2(2*(y*z+x*w),1-2*(x*x+z*z)), Math.asin(Math.max(-1,Math.min(1,m13))), Math.abs(m13)<0.9999999 ? Math.atan2(2*(z*w-x*y),1-2*(y*y+z*z)) : 0]
}
const unit = (p: DesignPartInstance) => !p.scale || p.scale.every(n => Math.abs(n-1)<1e-8)

export function worldConnector(part: DesignPartInstance, c: AssemblyConnector) {
  const q = fromEuler(part.rotation)
  return { position: add(part.position, rotate(c.position,q)), quaternion: mul(q,c.quaternion) }
}

function snap(parent: DesignPartInstance, target: AssemblyConnector, own: AssemblyConnector) {
  const world = worldConnector(parent,target)
  const q = mul(mul(mul(world.quaternion,fromEuler([0,-Math.PI/2,0])),fromEuler([Math.PI,0,0])),inv(own.quaternion))
  return { position: sub(world.position,rotate(own.position,q)), rotation: toEuler(q) }
}

export function occupiedAssemblyConnectors(parts: readonly DesignPartInstance[]): Set<string> {
  const used = new Set<string>()
  for (const p of parts) if (p.attachedTo) {
    used.add(`${p.attachedTo.parentInstanceId}/${p.attachedTo.parentConnectorId}`)
    if (p.activeConnectorId) used.add(`${p.instanceId}/${p.activeConnectorId}`)
  }
  return used
}

/** Rigidly move a root and every descendant, retaining every existing joint. */
export function moveAssemblyTree(parts: DesignPartInstance[], id: string, pose: { position: V; rotation: V }): DesignPartInstance[] {
  const root = parts.find(p => p.instanceId === id)
  if (!root) throw new Error('零件不存在')
  const ids = new Set([id])
  for (let i=0;i<parts.length;i++) for (const p of parts) if (p.attachedTo && ids.has(p.attachedTo.parentInstanceId)) ids.add(p.instanceId)
  const delta = mul(fromEuler(pose.rotation),inv(fromEuler(root.rotation)))
  return parts.map(p => !ids.has(p.instanceId) ? p : ({ ...p, position: add(pose.position,rotate(sub(p.position,root.position),delta)), rotation: toEuler(mul(delta,fromEuler(p.rotation))) }))
}

export function connectAssembly(parts: DesignPartInstance[], childId: string, ownId: string, parentId: string, targetId: string, resolve: ConnectorResolver): DesignPartInstance[] {
  const child = parts.find(p => p.instanceId === childId), parent = parts.find(p => p.instanceId === parentId)
  if (!child || !parent || childId === parentId) throw new Error('请选择两个不同零件')
  if (child.attachedTo) throw new Error('请先断开当前连接')
  let ancestor: DesignPartInstance | undefined = parent
  const visited = new Set<string>()
  while (ancestor) {
    if (ancestor.instanceId === childId || visited.has(ancestor.instanceId)) throw new Error('不能连接到自己的下级零件')
    visited.add(ancestor.instanceId)
    ancestor = parts.find(p => p.instanceId === ancestor?.attachedTo?.parentInstanceId)
  }
  if (!unit(child) || !unit(parent)) throw new Error('连接前请恢复零件原始尺寸')
  const own = resolve(child).find(c => c.id === ownId), target = resolve(parent).find(c => c.id === targetId)
  if (!own || !target) throw new Error('插接口不存在，请重新选择')
  const used = occupiedAssemblyConnectors(parts)
  if (used.has(`${childId}/${ownId}`) || used.has(`${parentId}/${targetId}`)) throw new Error('插接口已被占用')
  if (!child.source && !parent.source && own.kind === 'socket' && target.kind === 'socket') throw new Error('请选择匹配的插接口')
  return moveAssemblyTree(parts, childId, snap(parent,target,own)).map(p => p.instanceId !== childId ? p : ({ ...p, activeConnectorId: ownId, attachedTo: { parentInstanceId: parentId, parentConnectorId: targetId } }))
}

/** Re-check new custom connections against owner-resolved source geometry on both client and API. */
export function validateAssemblyConnections(parts: DesignPartInstance[], resolve: ConnectorResolver): string | null {
  const used = new Set<string>()
  for (const child of parts) {
    if (!child.attachedTo) continue
    const parent = parts.find(p => p.instanceId === child.attachedTo!.parentInstanceId)
    if (!parent) return '连接的零件不存在'
    for (const key of [`${parent.instanceId}/${child.attachedTo.parentConnectorId}`, `${child.instanceId}/${child.activeConnectorId}`]) {
      if (used.has(key)) return '插接口已被占用'
      used.add(key)
    }
    // Preserve legacy official poses, including their user-controlled rotation.
    if (!child.source && !parent.source) continue
    if (!unit(child) || !unit(parent)) return '连接零件必须保持原始尺寸'
    const own = resolve(child).find(c => c.id === child.activeConnectorId)
    const target = resolve(parent).find(c => c.id === child.attachedTo!.parentConnectorId)
    if (!own || !target) return '插接口不存在或原零件已修改'
    const expected = snap(parent,target,own)
    const actualQ = fromEuler(child.rotation), expectedQ = fromEuler(expected.rotation)
    const dot = actualQ.reduce((n,v,i) => n + v*expectedQ[i]!,0)
    if (Math.hypot(...sub(expected.position,child.position)) > 0.00001 || 1-Math.abs(dot)>0.00001) return '插接口未对齐，请重新连接'
  }
  return null
}

export function edgeSlotQuaternion(axis: 'x' | 'y', start: boolean): Q {
  const yaw = axis === 'x' ? (start ? Math.PI/2 : -Math.PI/2) : (start ? 0 : Math.PI)
  return mul(fromEuler([0,yaw,0]),fromEuler([-Math.PI/2,0,0]))
}
