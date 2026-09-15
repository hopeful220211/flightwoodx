import { Html } from '@react-three/drei'
import { customConnectors, officialConnectors, occupiedAssemblyConnectors, type AssemblyConnector } from '@fwx/geometry'
import type { DesignPartInstance } from '@fwx/parts-schema'
import { useMemo } from 'react'
import { useDesignStore } from '../../stores/designStore'
import { useCustomAssemblyPart } from './useCustomAssemblyPart'

export function AssemblyConnectorMarkers() {
  const selected = useDesignStore(s => s.selectedInstanceId)
  const part = useDesignStore(s => s.getActiveDesign()?.parts.find(p => p.instanceId === selected))
  if (!part) return null
  return part.source ? <CustomMarkers part={part} /> : <Markers part={part} connectors={officialConnectors(part.partId)} />
}
function CustomMarkers({ part }: { part: DesignPartInstance }) {
  const query = useCustomAssemblyPart(part)
  const connectors = useMemo(() => {
    try { return query.data && !query.isError ? customConnectors(query.data) : [] } catch { return [] }
  }, [query.data, query.isError])
  return <Markers part={part} connectors={connectors} />
}
function Markers({ part, connectors }: { part: DesignPartInstance; connectors: AssemblyConnector[] }) {
  const parts = useDesignStore(s => s.getActiveDesign()?.parts)
  const used = occupiedAssemblyConnectors(parts ?? [])
  return <group position={part.position} rotation={part.rotation} scale={part.scale}>
    {connectors.map((c,i) => <Html key={c.id} position={c.position} center style={{ pointerEvents: 'none' }} zIndexRange={[30,20]}>
      <span title={`插接口 ${i+1}${used.has(`${part.instanceId}/${c.id}`) ? ' · 已占用' : ''}`} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${used.has(`${part.instanceId}/${c.id}`) ? 'bg-slate-500' : 'bg-sky-600'}`}>{i+1}</span>
    </Html>)}
  </group>
}
