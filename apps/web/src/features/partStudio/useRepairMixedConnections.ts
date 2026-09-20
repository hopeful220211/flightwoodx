import { useEffect, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { officialConnectors, repairLegacyAssemblyConnections } from '@fwx/geometry'
import { useAuthStore } from '../../stores/authStore'
import { useDesignStore } from '../../stores/designStore'
import { loadAssemblySource } from './assemblySources'

export function useRepairMixedConnections() {
  const design = useDesignStore(s=>s.getActiveDesign())
  const owner = useAuthStore(s=>s.user?.id)
  const token = useAuthStore(s=>s.token)
  const custom = useMemo(()=>{
    const connected = new Set(design?.parts.flatMap(p=>p.attachedTo ? [p.instanceId,p.attachedTo.parentInstanceId] : []))
    return design?.parts.filter(p=>p.source && connected.has(p.instanceId)) ?? []
  },[design?.parts])
  const queries = useQueries({queries:custom.map(p=>({
    queryKey:['assembly-connectors',owner,`${p.partId}/${p.source?.version}/${p.source?.updatedAt}`],
    queryFn:()=>loadAssemblySource(p),enabled:!!token && !!owner,retry:false,staleTime:0,
  }))})
  useEffect(()=>{
    if (!design || !token || !owner || !custom.length || queries.some(q=>q.isFetching || q.isError || !q.data)) return
    if (useDesignStore.getState().getActiveDesign() !== design || useAuthStore.getState().token !== token) return
    const repaired = repairLegacyAssemblyConnections(design.parts,p=>p.source ? queries[custom.findIndex(c=>c.instanceId===p.instanceId)]?.data?.connectors ?? [] : officialConnectors(p.partId))
    if (repaired !== design.parts) useDesignStore.setState(s=>({designs:s.designs.map(d=>d.id===design.id ? {...d,parts:repaired,updatedAt:new Date().toISOString()} : d)}))
  },[design,token,owner,custom,queries])
}
