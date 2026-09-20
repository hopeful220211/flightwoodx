import type { UserPart } from '@fwx/parts-schema'
import { bbox, svgGeometryToPart2D, validateJointGuides } from './index'
import catalog from './official-connectors.json' with { type: 'json' }
import { edgeSlotQuaternion, type AssemblyConnector } from './assemblyTransforms'
export { connectAssembly, moveAssemblyTree, worldConnector, occupiedAssemblyConnectors, validateAssemblyConnections, repairLegacyAssemblyConnections } from './assemblyTransforms'
export type { AssemblyConnector, ConnectorResolver } from './assemblyTransforms'

export function officialConnectors(partId: string): AssemblyConnector[] {
  const entry = (catalog as unknown as Record<string, { boardNormal: [number,number,number]; connectors: AssemblyConnector[] }>)[partId]
  return entry?.connectors.map(c => ({...c,boardNormal:entry.boardNormal})) ?? []
}

/** Centered renderer coordinates: drawing mm -> local X/Z metres; board normal +Y. */
export function customConnectors(part: Pick<UserPart, 'geometry' | 'jointGuides'>): AssemblyConnector[] {
  const shape = svgGeometryToPart2D(part.geometry)
  if (!shape) throw new Error('零件轮廓无效')
  const check = validateJointGuides(shape, part.jointGuides ?? [])
  if (!check.ok) throw new Error(check.reason || '插接口与轮廓不符')
  const bounds = bbox(shape), cx = (bounds.min[0]+bounds.max[0])/2, cy = (bounds.min[1]+bounds.max[1])/2
  return (part.jointGuides ?? []).filter(g => g.kind === 'edge-slot').map(g => {
    const start = g.entry === 'start'
    const x = g.x + (g.axis === 'x' ? (start ? g.lengthMm : 0) : 1)
    const y = g.y + (g.axis === 'y' ? (start ? g.lengthMm : 0) : 1)
    return { id: `joint:${g.id}`, kind: 'edge-slot', position: [(x-cx)/1000,0,(y-cy)/1000], quaternion: edgeSlotQuaternion(g.axis,start) }
  })
}
