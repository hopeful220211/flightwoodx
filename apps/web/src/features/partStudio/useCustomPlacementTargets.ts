import { useQueries } from '@tanstack/react-query'
import { Vector3 } from 'three'
import { useDesignStore } from '../../stores/designStore'
import { useAuthStore } from '../../stores/authStore'
import { loadAssemblySource } from './assemblySources'
import { customPlacementTargets } from './customPlacement'

/** Mouse highlights, touch highlights and drop candidates consume the same sources. */
export function useCustomPlacementTargets() {
  const design = useDesignStore(s => s.getActiveDesign())
  const dragging = useDesignStore(s => s.draggingPartId)
  const owner = useAuthStore(s => s.user?.id)
  const token = useAuthStore(s => s.token)
  const custom = design?.parts.filter(p => p.source) ?? []
  const queries = useQueries({ queries: custom.map(p => ({
    queryKey: ['assembly-connectors', owner, `${p.partId}/${p.source?.version}/${p.source?.updatedAt}`],
    enabled: !!dragging && !!token && !!owner,
    queryFn: () => loadAssemblySource(p), retry: false, staleTime: 0,
  })) })
  if (!design || !dragging || !token || !owner) return []
  return customPlacementTargets(design.parts, dragging, p => {
    const query = queries[custom.findIndex(c => c.instanceId === p.instanceId)]
    return query && !query.isError ? query.data?.connectors ?? [] : []
  }).map(c => ({...c, worldPosition:new Vector3(...c.position)}))
}
