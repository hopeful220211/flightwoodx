import { useCallback, useEffect, useMemo } from 'react'
import { Html, useBounds } from '@react-three/drei'
import type { DesignPartInstance, UserPart } from '@fwx/parts-schema'
import { useDesignStore } from '../../stores/designStore'
import { useAuthStore } from '../../stores/authStore'
import { buildCustomGeometry } from './customAssembly'
import { useCustomAssemblyPart } from './useCustomAssemblyPart'
import { createWoodMaterial } from '../../components/design/woodMaterial'

export type CustomPartReadiness = { status: 'loading' | 'ready' } | { status: 'error'; error: Error }
type ReadinessCallback = (instanceId: string, readiness: CustomPartReadiness) => void

function SourceMesh({ part, instance, interactive, onReady }: { part: UserPart; instance: DesignPartInstance; interactive: boolean; onReady?: () => void }) {
  const geometry = useMemo(() => buildCustomGeometry(part.geometry), [part.geometry])
  const selected = useDesignStore(state => state.selectedInstanceId === instance.instanceId)
  const material = useMemo(() => {
    const next = createWoodMaterial()
    next.emissive.set(selected && interactive ? '#FFB74D' : '#000000')
    next.emissiveIntensity = selected && interactive ? 0.35 : 0
    return next
  }, [selected, interactive])
  const bounds = useBounds()
  useEffect(() => () => geometry.dispose(), [geometry])
  // Keep the shared texture alive for other pieces and cover rendering.
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => { bounds?.refresh().clip().fit() }, [bounds, geometry])
  // Passive effects run after R3F has attached this real mesh to its group.
  useEffect(() => { onReady?.() }, [geometry, onReady])
  return <mesh geometry={geometry} material={material} castShadow receiveShadow onClick={interactive ? event => { event.stopPropagation(); useDesignStore.getState().setSelectedInstanceId(instance.instanceId) } : undefined} />
}

/** No GLB alias or invented sockets: render the authenticated source contour, or a visible failure. */
export function CustomAssemblyPart({ instance, interactive = false, onReadinessChange }: { instance: DesignPartInstance; interactive?: boolean; onReadinessChange?: ReadinessCallback }) {
  const query = useCustomAssemblyPart(instance)
  const token = useAuthStore(state => state.token)
  const available = !!token && !query.isError && !!query.data
  const ready = available && !query.isFetching
  const onReady = useCallback(() => onReadinessChange?.(instance.instanceId, { status: 'ready' }), [instance.instanceId, onReadinessChange])
  useEffect(() => {
    if (!onReadinessChange) return
    if (!token || query.isError) onReadinessChange(instance.instanceId, { status: 'error', error: !token ? new Error('登录原账号后才能读取自制零件') : query.error ?? new Error('自制零件加载失败') })
    else if (!ready) onReadinessChange(instance.instanceId, { status: 'loading' })
    return () => onReadinessChange(instance.instanceId, { status: 'loading' })
  }, [instance.instanceId, onReadinessChange, token, query.isError, query.error, ready])
  return <group position={instance.position} rotation={instance.rotation} scale={instance.scale}>
    {available ? <SourceMesh part={query.data!} instance={instance} interactive={interactive} onReady={ready && onReadinessChange ? onReady : undefined} /> : <Html center>
      <div role={query.isError || !token ? 'alert' : 'status'} className="w-52 rounded-lg border border-amber-300 bg-white p-3 text-xs text-amber-900 shadow">
        {!token ? '登录原账号后才能读取自制零件；来源引用仍保留' : query.isError ? `自制零件不可用：${query.error.message}` : '正在读取自制零件…'}
        {token && query.isError && <button type="button" className="mt-2 block underline" onClick={() => void query.refetch()}>重试读取零件</button>}
      </div>
    </Html>}
  </group>
}

export function CustomPartInspector({ instance }: { instance: DesignPartInstance }) {
  const query = useCustomAssemblyPart(instance)
  const usable = !query.isError && query.data
  const update = useDesignStore(state => state.updatePartInActiveDesign)
  return <div className="min-w-0 flex-1 text-xs">
    <button type="button" className="w-full truncate text-left text-sm font-bold" onClick={() => useDesignStore.getState().setSelectedInstanceId(instance.instanceId)}>{usable ? query.data!.name : '自制零件'}</button>
    <div className="text-slate-500">自由摆放</div>
    {usable ? <div>预估 {query.data!.flightImpact.massG} g · 来源版本 {instance.source?.version}</div> : <div role="alert">{query.isError ? query.error.message : '原零件尚未读取；引用保留'}<button type="button" onClick={() => void query.refetch()} className="ml-2 underline">重试</button></div>}
    <div className="mt-2 grid grid-cols-3 gap-1">
      {(['X', 'Y', 'Z'] as const).map((axis, index) => <label key={axis} className="min-w-0">{axis} (mm)<input aria-label={`自制零件 ${axis} 位置（毫米）`} className="w-full rounded border px-1 py-1" type="number" min={-1000} max={1000} step={1} value={+(instance.position[index] * 1000).toFixed(2)} onChange={event => {
        const value = event.currentTarget.valueAsNumber
        if (!Number.isFinite(value) || Math.abs(value) > 1000) return
        const position = [...instance.position] as [number, number, number]
        position[index] = value / 1000
        update(instance.instanceId, { position })
      }} /></label>)}
    </div>
  </div>
}
