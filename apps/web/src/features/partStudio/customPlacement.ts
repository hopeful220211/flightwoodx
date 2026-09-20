import { officialConnectors, occupiedAssemblyConnectors, worldConnector, type ConnectorResolver } from '@fwx/geometry'
import type { DesignPartInstance } from '@fwx/parts-schema'

/** Only actual, owner-resolved edge slots can participate in mixed placement. */
export function customPlacementTargets(parts: DesignPartInstance[], partId: string, resolve: ConnectorResolver) {
  const own = officialConnectors(partId)
  const connector = own.find(c => c.kind === 'plug') ?? own[0]
  if (!connector) return []
  const occupied = occupiedAssemblyConnectors(parts)
  return parts.filter(p => p.source && (!p.scale || p.scale.every(n => Math.abs(n - 1) < 1e-8))).flatMap(p =>
    resolve(p).filter(c => c.kind === 'edge-slot' && !occupied.has(`${p.instanceId}/${c.id}`)).map(c => ({
      instanceId: p.instanceId, socketId: c.id, plugId: connector.id,
      position: worldConnector(p, c).position,
    })))
}
