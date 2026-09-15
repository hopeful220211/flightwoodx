import { Component, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Mesh, PerspectiveCamera, Vector3 } from 'three'
import type { UserPartGeometry } from '@fwx/parts-schema'
import { createWoodMaterial, waitForWoodTextures } from '../../../components/design/woodMaterial'
import { SceneLighting } from '../../../components/design/SceneLighting'
import { buildCustomGeometry } from '../customAssembly'
import { getPreviewFrame, type PreviewView } from './fitPreview'

const VIEWS: { id: PreviewView; label: string }[] = [
  { id: 'perspective', label: '立体' }, { id: 'top', label: '俯视' }, { id: 'side', label: '侧视' },
]

function PreviewScene({ mesh, view, reset }: { mesh: Mesh; view: PreviewView; reset: number }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const getRendererState = useThree(state => state.get)
  const size = useThree(state => state.size)
  const dimensions = useMemo(() => {
    mesh.geometry.computeBoundingBox()
    return mesh.geometry.boundingBox!.getSize(new Vector3()).toArray()
  }, [mesh])
  const frame = useMemo(() => getPreviewFrame(dimensions, size.width / Math.max(size.height, 1), view), [dimensions, size.width, size.height, view])
  useEffect(() => {
    const { camera, invalidate } = getRendererState()
    if (!(camera instanceof PerspectiveCamera)) return
    camera.position.fromArray(frame.position)
    camera.up.fromArray(frame.up)
    camera.near = frame.near
    camera.far = frame.far
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
    invalidate()
  }, [getRendererState, frame, reset])
  return <>
    <color attach="background" args={['#f7f9fa']} />
    <SceneLighting />
    <primitive object={mesh} />
    <gridHelper args={[frame.gridSize, frame.gridDivisions, '#a8b4be', '#e3e8ec']} position={[0, -dimensions[1] / 2 - 0.0002, 0]} />
    <OrbitControls ref={controls} enablePan={false} enableDamping={false} minDistance={frame.minDistance} maxDistance={frame.maxDistance} />
  </>
}

function PreviewFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex h-full min-h-[320px] items-center justify-center p-6"><div role="alert" className="max-w-xs rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-900"><p>{message}</p><button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white">重试预览</button></div></div>
}

function PreviewContent({ geometry, onRetry }: { geometry: UserPartGeometry; onRetry: () => void }) {
  const [view, setView] = useState<PreviewView>('perspective')
  const [reset, setReset] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const result = useMemo(() => {
    try {
      const mesh = new Mesh(buildCustomGeometry(geometry), createWoodMaterial())
      mesh.castShadow = true
      mesh.receiveShadow = true
      return { mesh, error: null }
    } catch (cause) {
      return { mesh: null, error: cause instanceof Error ? cause.message : '无法生成三维预览' }
    }
  }, [geometry])
  useEffect(() => {
    if (!result.mesh) return
    let active = true
    void waitForWoodTextures(result.mesh).then(() => {
      if (active) setReady(true)
    }).catch(() => {
      if (active) setError('木纹加载失败，请重试。二维轮廓仍保留。')
    })
    return () => {
      active = false
      result.mesh.geometry.dispose()
      result.mesh.material.dispose()
    }
  }, [result])
  if (!result.mesh || result.error) return <PreviewFailure message="当前轮廓无法生成三维预览，请检查二维轮廓。" onRetry={onRetry} />
  if (error) return <PreviewFailure message={error} onRetry={onRetry} />
  const gridStepMm = Math.max(geometry.bboxMm.w, geometry.bboxMm.h) > 500 ? 50 : 10
  return <div className="flex h-full min-h-[420px] w-full flex-col" data-testid="part-3d-preview" data-wood-ready={ready}>
    <div data-testid="part-3d-toolbar" className="flex shrink-0 flex-wrap items-start justify-between gap-2 px-3 pt-3">
      <div className="rounded-lg border border-sky-100 bg-white/95 px-3 py-2 text-xs leading-5 text-ink-700">
        <p className="font-semibold">{geometry.bboxMm.w} × {geometry.bboxMm.h} × {geometry.thicknessMm} mm</p>
        <p>木板厚度 2 mm · 网格 {gridStepMm} mm</p>
      </div>
      <div className="flex gap-1 rounded-lg border border-sky-100 bg-white/95 p-1" role="group" aria-label="三维视角">
        {VIEWS.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)} className={`min-h-11 rounded-md px-3 text-xs ${view === item.id ? 'bg-sky-100 font-semibold text-ink-900' : 'text-ink-600 hover:bg-sky-50'}`}>{item.label}</button>)}
        <button type="button" onClick={() => { setView('perspective'); setReset(value => value + 1) }} className="min-h-11 rounded-md px-3 text-xs text-ink-600 hover:bg-sky-50">复位</button>
      </div>
    </div>
    <div data-testid="part-3d-viewport" className="relative min-h-0 flex-1">
      <Canvas camera={{ position: [0.2, 0.2, 0.2], fov: 42, near: 0.00001, far: 10 }} style={{ width: '100%', height: '100%' }}>
        <PreviewScene mesh={result.mesh} view={view} reset={reset} />
      </Canvas>
    </div>
    <p data-testid="part-3d-hint" role={ready ? undefined : 'status'} className="shrink-0 px-3 py-2 text-xs text-ink-600">{ready ? '拖动旋转 · 滚轮缩放' : '正在加载木纹…'}</p>
  </div>
}

class PreviewBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) return <PreviewFailure message="三维预览加载失败。二维轮廓仍保留。" onRetry={this.props.onRetry} />
    return this.props.children
  }
}

export function ExtrudePreview({ geometry }: { geometry: UserPartGeometry | null }) {
  const [attempt, setAttempt] = useState(0)
  if (!geometry) return <p className="p-6 text-sm text-ink-600">完成二维轮廓后查看三维预览。</p>
  const onRetry = () => setAttempt(value => value + 1)
  return <PreviewBoundary key={`${JSON.stringify(geometry)}:${attempt}`} onRetry={onRetry}><PreviewContent geometry={geometry} onRetry={onRetry} /></PreviewBoundary>
}
