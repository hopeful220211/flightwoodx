import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Eye,
  Save,
  Upload,
  Box,
  Search,
  X,
  Info,
  ChevronRight,
  List,
  SlidersHorizontal,
  Compass,
  Share2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { EmptyState } from '../../components/common/EmptyState'
import { Modal } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import { useDesignStore } from '../../stores/designStore'
import type { Part } from '../../types/design'
import { cn } from '../../utils/cn'
import { downloadTextFile } from '../../utils/download'
import { partsData } from '../../data/parts'
import { ThreeCanvas } from '../../components/design/ThreeCanvas'
import { DraggablePartCard } from './components/DraggablePartCard'
import { DragPreview } from '../../components/design/DragPreview'
import { PartPreview3D } from '../../components/design/PartPreview3D'
import { getCachedPartConnectors, prefetchAndExtractConnectors } from '../../hooks/usePartConnectors'
import type { CameraView } from '../../components/design/CameraController'
import { Canvas } from '@react-three/fiber'
import { Bounds, OrbitControls, Html } from '@react-three/drei'
import { Suspense } from 'react'
import { AssembledDrone } from '../../components/design/AssembledDrone'
import { SceneLighting } from '../../components/design/SceneLighting'
import { useDesignSync } from '../../hooks/useDesignSync'
import { useAuthStore } from '../../stores/authStore'
import { CustomPartsLibrary } from '../../features/partStudio/CustomPartsLibrary'
import { CustomPartInspector } from '../../features/partStudio/CustomAssemblyPart'

export function DesignPage() {
  const toast = useToast()
  const { saveToServer, saveNow, saveStatus } = useDesignSync()
  const token = useAuthStore(state => state.token)
  const threeMountRef = useRef<HTMLDivElement | null>(null)

  const activeDesignId = useDesignStore((s) => s.activeDesignId)
  const activeDesign = useDesignStore((s) => s.getActiveDesign())
  const createDesign = useDesignStore((s) => s.createDesign)
  const setActiveDesignId = useDesignStore((s) => s.setActiveDesignId)
  const addPartSmart = useDesignStore((s) => s.addPartSmart)
  const removePartFromActiveDesign = useDesignStore((s) => s.removePartFromActiveDesign)
  const setDraggingPartId = useDesignStore((s) => s.setDraggingPartId)

  const [category, setCategory] = useState<string>('mainboard')
  const [query, setQuery] = useState('')
  const [partDetail, setPartDetail] = useState<Part | null>(null)
  const [previewHintOpen, setPreviewHintOpen] = useState(false)
  const [isPartsLibraryOpen, setIsPartsLibraryOpen] = useState(() => window.innerWidth >= 1024)
  const [isInspectorOpen, setIsInspectorOpen] = useState(() => window.innerWidth >= 1024)
  const [cameraView, setCameraView] = useState<CameraView | null>(null)

  // 拖拽预览状态
  const [dragPreview, setDragPreview] = useState<{
    part: Part | null
    position: { x: number; y: number }
  }>({ part: null, position: { x: 0, y: 0 } })

  useEffect(() => {
    if (!activeDesignId) {
      const id = createDesign('我的第一架无人机', 'free')
      setActiveDesignId(id)
    }
  }, [activeDesignId, createDesign, setActiveDesignId])

  useEffect(() => { if (activeDesign) saveToServer(activeDesign) }, [activeDesign, saveToServer])
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 1023px)')
    const onResize = () => { if (narrow.matches) setIsPartsLibraryOpen(false) }
    narrow.addEventListener('change', onResize)
    return () => narrow.removeEventListener('change', onResize)
  }, [])

  // 触控拖拽状态
  const [isTouchDragging, setIsTouchDragging] = useState(false)

  // 全局拖拽事件处理（鼠标）
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (dragPreview.part) {
        setDragPreview((prev) => ({
          ...prev,
          position: { x: e.clientX, y: e.clientY },
        }))
      }
    }

    const handleDragEnd = () => {
      setDragPreview({ part: null, position: { x: 0, y: 0 } })
      setDraggingPartId(null)
    }

    const handleDrop = () => {
      setDragPreview({ part: null, position: { x: 0, y: 0 } })
      setDraggingPartId(null)
    }

    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragend', handleDragEnd)
    document.addEventListener('drop', handleDrop)

    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragend', handleDragEnd)
      document.removeEventListener('drop', handleDrop)
    }
  }, [dragPreview.part, setDraggingPartId])

  // 全局触控拖拽事件处理
  useEffect(() => {
    if (!isTouchDragging) return

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault() // 防止页面滚动
      const touch = e.touches[0]
      if (touch && dragPreview.part) {
        setDragPreview((prev) => ({
          ...prev,
          position: { x: touch.clientX, y: touch.clientY },
        }))
        // 触发自定义事件，让 ThreeCanvas 处理连接点高亮
        window.dispatchEvent(new CustomEvent('touchDragMove', {
          detail: { x: touch.clientX, y: touch.clientY, partId: dragPreview.part.id }
        }))
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      // 触发放置事件
      const touch = e.changedTouches[0]
      if (touch && dragPreview.part) {
        window.dispatchEvent(new CustomEvent('touchDragEnd', {
          detail: { x: touch.clientX, y: touch.clientY, partId: dragPreview.part.id }
        }))
      }
      setDragPreview({ part: null, position: { x: 0, y: 0 } })
      setDraggingPartId(null)
      setIsTouchDragging(false)
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)
    document.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [isTouchDragging, dragPreview.part, setDraggingPartId])

  // 开始拖拽时设置预览（鼠标）
  const handleDragStart = useCallback((part: Part, e: React.DragEvent) => {
    void prefetchAndExtractConnectors(part.modelUrl)
    setDragPreview({
      part,
      position: { x: e.clientX, y: e.clientY },
    })
    // 设置正在拖拽的零件ID（用于显示可用连接点）
    setDraggingPartId(part.id)
    // 隐藏默认的拖拽图像
    const emptyImg = new Image()
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    e.dataTransfer.setDragImage(emptyImg, 0, 0)
  }, [setDraggingPartId])

  // 开始触控拖拽
  const handleTouchDragStart = useCallback((part: Part, x: number, y: number) => {
    void prefetchAndExtractConnectors(part.modelUrl)
    setDragPreview({
      part,
      position: { x, y },
    })
    setDraggingPartId(part.id)
    setIsTouchDragging(true)
  }, [setDraggingPartId])

  const parts = useMemo(() => partsData, [])
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const usedParts = useMemo(() => activeDesign?.parts ?? [], [activeDesign?.parts])
  const usedCount = usedParts.length
  const hasCustomParts = usedParts.some(part => part.source)

  const totalWeight = useMemo(() => {
    let sum = 0
    for (const inst of usedParts) {
      const p = partById.get(inst.partId)
      if (p) sum += p.weight
    }
    return sum
  }, [partById, usedParts])

  const filteredParts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return parts
      .filter((p) => p.category === category)
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
  }, [category, parts, query])

  const onAddPart = async (partId: string) => {
    const added = await addPartSmart(partId)
    toast.push(added ? 'success' : 'error', added ? '已添加零件' : '未找到可用连接点，零件未添加')
  }

  const checks = useMemo(() => {
    if (usedCount === 0) return [{ level: 'warning', text: '尚未添加零件，请从零件库选择。' }]
    const issues: Array<{ level: 'warning' | 'error' | 'info'; text: string }> = []
    if (!usedParts.some((p) => (partById.get(p.partId)?.category ?? 'other') === 'mainboard'))
      issues.push({ level: 'error', text: usedParts.some(part => part.source && part.category === 'mainboard') ? '未安装官方主板；自制主机身尚未验证连接。' : '缺少主板：建议至少选择一个主板零件。' })
    if (usedParts.some(part => part.source)) issues.push({ level: 'warning', text: '自制零件仅自由摆放，尚未连接；未验证制造、结构或飞行。' })
    if (issues.length === 0) issues.push({ level: 'info', text: '基础装配检查通过：可以继续检查连接与左右对称。' })
    return issues
  }, [partById, usedCount, usedParts])

  const categoryItems = [
    { value: 'mainboard', label: '主板' },
    { value: 'landing', label: '机臂' },
    { value: 'guard', label: '保护罩' },
    { value: 'joint', label: '连接件' },
    { value: 'custom', label: '自制零件' },
  ] as const

  const onExport = () => {
    const json = JSON.stringify(activeDesign ?? null, null, 2)
    downloadTextFile(`design_${activeDesign?.id ?? 'draft'}.json`, json)
    toast.push('success', '已导出设计文件（JSON）')
  }

  const onSave = async () => {
    if (!activeDesign) return
    const saved = await saveNow(activeDesign)
    toast.push(saved ? 'success' : 'error', saved ? token ? '已保存到账号' : '已保存到本机草稿' : '账号保存失败，本机草稿保留，请重试保存')
  }

  const categoryIcon: Record<string, React.ReactNode> = {
    hub: <Box size={18} />,
    body: <Compass size={18} />,
    arm: <Share2 size={18} />,
    joint: <SlidersHorizontal size={18} />,
    decoration: <ChevronRight size={18} />,
    landing: <List size={18} />,
  }

  const renderPartThumb = (p: Part) => (
    <div key={p.id} className="relative">
      <DraggablePartCard
        part={p}
        onClick={() => setPartDetail(p)}
        onDragStart={(e) => handleDragStart(p, e)}
        onTouchDragStart={handleTouchDragStart}
      />
      <button
        type="button"
        className="absolute bottom-1 right-1 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-800 shadow-sm ring-1 ring-black/5 backdrop-blur hover:bg-white dark:bg-slate-950/80 dark:text-slate-100 dark:ring-white/10"
        aria-label={`零件详情：${p.name}`}
        onClick={() => setPartDetail(p)}
      >
        <Info size={16} />
      </button>
    </div>
  )

  // 旧的“已使用零件”渲染函数已被新版浮动面板内联实现

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-gradient-to-br from-sky-50 to-sky-100 dark:from-slate-950 dark:to-slate-900">
      {/* 3D 画布区域：最大化，铺满父容器 */}
      <div
        ref={threeMountRef}
        className="absolute inset-0 flex items-center justify-center bg-slate-50/60 dark:bg-slate-950/60"
      >
        <ThreeCanvas cameraView={cameraView} onCameraViewChanged={() => setCameraView(null)} />
        {/* ActionMenu 需要在 Canvas 内部，通过 HTML overlay 渲染 */}
      </div>

      {/* 顶部：标题与操作栏（浮动） */}
      <div className="absolute left-1/2 top-4 z-40 w-[min(900px,calc(100vw-2rem))] -translate-x-1/2">
        <Card hoverable={false}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold text-ink-900 dark:text-white">{activeDesign?.name ?? '我的第一架无人机'}</div>
              <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                已使用 {usedCount} 个零件 · {hasCustomParts ? `官方件预估 ${totalWeight}g（不含自制件）` : `预估重量 ${totalWeight}g`}
                <span className="ml-2" role={saveStatus === 'error' ? 'alert' : 'status'}>{saveStatus === 'error' ? '账号保存失败，请重试' : saveStatus === 'saving' ? '正在保存…' : token ? '已保存到账号' : '本机草稿'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" leftIcon={<Save size={16} />} onClick={onSave}>
                保存
              </Button>
              <Button size="sm" variant="outline" leftIcon={<Upload size={16} />} onClick={onExport}>
                导出
              </Button>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Eye size={16} />}
                onClick={() => setPreviewHintOpen(true)}
              >
                预览
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* 左下角：视角控制器 */}
      <div className="absolute bottom-4 left-4 z-40 flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'rounded-lg bg-white/70 backdrop-blur dark:bg-slate-950/60',
            cameraView === 'front' && 'bg-sky-100 dark:bg-slate-800'
          )}
          onClick={() => setCameraView('front')}
        >
          正视图
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'rounded-lg bg-white/70 backdrop-blur dark:bg-slate-950/60',
            cameraView === 'top' && 'bg-sky-100 dark:bg-slate-800'
          )}
          onClick={() => setCameraView('top')}
        >
          俯视图
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'rounded-lg bg-white/70 backdrop-blur dark:bg-slate-950/60',
            cameraView === 'side' && 'bg-sky-100 dark:bg-slate-800'
          )}
          onClick={() => setCameraView('side')}
        >
          侧视图
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg bg-white/70 backdrop-blur dark:bg-slate-950/60"
          onClick={() => setCameraView('reset')}
        >
          重置
        </Button>
      </div>

      {/* 左侧：零件库浮动面板（可收起） */}
      <div className={cn('absolute left-4 top-44 sm:top-28 bottom-16 z-40 transition-transform duration-300', isPartsLibraryOpen ? 'w-[min(320px,calc(100vw-2rem))]' : 'w-12')}>
        {isPartsLibraryOpen ? (
          <Card hoverable={false} className="max-h-full overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-extrabold">零件库</div>
              <button
                type="button"
                className="touch-target inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sky-50 dark:hover:bg-slate-900"
                aria-label="收起零件库"
                onClick={() => setIsPartsLibraryOpen(false)}
              >
                <PanelLeftClose size={18} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {categoryItems.map((it) => {
                const active = category === it.value
                return (
                  <button
                    key={it.value}
                    type="button"
                    className={cn(
                      'touch-target inline-flex items-center justify-center rounded-lg transition',
                      'h-11 w-full justify-start gap-2 px-3',
                      active
                        ? 'bg-sky-100 text-ink-900 dark:bg-slate-800 dark:text-white'
                        : 'hover:bg-sky-50 text-slate-700 dark:text-slate-200 dark:hover:bg-slate-900',
                    )}
                    onClick={() => setCategory(it.value)}
                  >
                    <span className="inline-flex">{categoryIcon[it.value]}</span>
                    <span className="text-sm font-semibold">{it.label}</span>
                  </button>
                )
              })}
            </div>

            {category !== 'custom' && <div className="mt-3 flex items-center gap-2 rounded-lg border border-black/10 bg-white/70 px-3 py-2 backdrop-blur dark:border-white/10 dark:bg-slate-950/40">
              <Search size={16} className="text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索零件…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              {query ? (
                <button
                  type="button"
                  className="touch-target inline-flex items-center justify-center rounded-lg hover:bg-sky-50 dark:hover:bg-slate-900"
                  aria-label="清除搜索"
                  onClick={() => setQuery('')}
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>}

            <div className="mt-3 overflow-x-hidden pr-1">
              {category === 'custom' ? <CustomPartsLibrary /> :
              <div className="grid grid-cols-2 gap-4 justify-items-center">
                {filteredParts.length ? (
                  filteredParts.map(renderPartThumb)
                ) : (
                  <div className="col-span-2">
                    <EmptyState icon={<Box size={18} />} title="没有找到零件" description="请修改搜索词或切换分类。" />
                  </div>
                )}
              </div>}
            </div>
          </Card>
        ) : (
          <button
            type="button"
            className="flex h-20 w-12 items-center justify-center rounded-lg bg-white/70 shadow-sm backdrop-blur hover:bg-white/90 dark:bg-slate-950/60 dark:hover:bg-slate-950/80"
            aria-label="展开零件库"
            onClick={() => { setIsPartsLibraryOpen(true); if (window.innerWidth < 1024) setIsInspectorOpen(false) }}
          >
            <PanelLeftOpen size={20} />
          </button>
        )}
      </div>

      {/* 右侧：检查浮动面板（可收起） */}
      <div className={cn('absolute right-4 top-44 sm:top-28 bottom-16 z-40 transition-transform duration-300', isInspectorOpen ? 'w-[min(288px,calc(100vw-2rem))]' : 'w-12')}>
        {isInspectorOpen ? (
          <Card hoverable={false} className="max-h-full overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-extrabold">检查</div>
              <button
                type="button"
                className="touch-target inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sky-50 dark:hover:bg-slate-900"
                aria-label="收起检查面板"
                onClick={() => setIsInspectorOpen(false)}
              >
                <PanelRightClose size={18} />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="rounded-lg bg-white/60 p-3 text-sm dark:bg-slate-950/40">
                <div className="text-sm font-extrabold">设计检查</div>
                <div className="mt-2 space-y-2">
                  {checks.map((c, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm',
                        c.level === 'error'
                          ? 'border-error/30 bg-error/5'
                          : c.level === 'warning'
                            ? 'border-warning/30 bg-warning/5'
                            : 'border-sky-400/30 bg-sky-50/60 dark:bg-sky-900/20',
                      )}
                    >
                      {c.text}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-white/60 p-3 text-sm dark:bg-slate-950/40">
                <div className="text-sm font-extrabold">已使用零件</div>
                <div className="mt-2 space-y-1">
                  {usedParts.length ? (
                    usedParts.map((inst) => {
                      const part = partById.get(inst.partId)
                      const connectorCount = part ? getCachedPartConnectors(part.modelUrl).length : 0
                      return (
                        <div
                          key={inst.instanceId}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-sky-50 dark:hover:bg-slate-900"
                        >
                          {inst.source ? <CustomPartInspector instance={inst} /> : <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold">{part?.name ?? '未知零件'}</div>
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <span>{part?.weight ?? 0}g</span>
                              <span>·</span>
                              <span>{connectorCount} 个连接点</span>
                            </div>
                          </div>}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full"
                            onClick={() => removePartFromActiveDesign(inst.instanceId)}
                            aria-label="删除"
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-sm text-slate-600 dark:text-slate-300">暂无</div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <button
            type="button"
            className="flex h-20 w-12 items-center justify-center rounded-lg bg-white/70 shadow-sm backdrop-blur hover:bg-white/90 dark:bg-slate-950/60 dark:hover:bg-slate-950/80"
            aria-label="展开检查面板"
            onClick={() => { setIsInspectorOpen(true); if (window.innerWidth < 1024) setIsPartsLibraryOpen(false) }}
          >
            <PanelRightOpen size={20} />
          </button>
        )}
      </div>


      {/* 零件详情弹窗（点击缩略图/详情按钮触发） */}
      <Modal open={partDetail !== null} onClose={() => setPartDetail(null)} title={partDetail?.name ?? ''}>
        {partDetail ? (
          <div className="space-y-3">
            {/* 3D 预览 */}
            <div className="aspect-video w-full rounded-lg bg-slate-50/60 ring-1 ring-black/5 dark:bg-slate-950/60 dark:ring-white/10 overflow-hidden">
              <div className="h-full w-full">
                <PartPreview3D modelUrl={partDetail.modelUrl} autoRotate />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-sky-50 p-3 dark:bg-slate-900">
                <div className="text-xs text-slate-600 dark:text-slate-300">重量</div>
                <div className="mt-1 font-extrabold">{partDetail.weight} g</div>
              </div>
              <div className="rounded-lg bg-sky-50 p-3 dark:bg-slate-900">
                <div className="text-xs text-slate-600 dark:text-slate-300">连接点</div>
                <div className="mt-1 font-extrabold">{getCachedPartConnectors(partDetail.modelUrl).length} 个</div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setPartDetail(null)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  onAddPart(partDetail.id)
                  setPartDetail(null)
                }}
              >
                添加到设计
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={previewHintOpen} onClose={() => setPreviewHintOpen(false)} title="预览">
        <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
          {hasCustomParts && <p>自制零件仅自由摆放，未连接，未验证制造与飞行。</p>}
          <div className="h-80 rounded bg-slate-50"><Canvas aria-label="自由作品三维预览" camera={{ position: [0.3, 0.3, 0.4], near: 0.001 }}><SceneLighting /><OrbitControls makeDefault /><Suspense fallback={<Html center>正在加载零件…</Html>}><Bounds fit clip observe margin={1.5}><AssembledDrone parts={usedParts} autoRotate={false} /></Bounds></Suspense></Canvas></div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setPreviewHintOpen(false)}>
              我知道了
            </Button>
          </div>
        </div>
      </Modal>

      {/* 拖拽预览 */}
      {dragPreview.part && (
        <DragPreview
          modelUrl={dragPreview.part.modelUrl}
          position={dragPreview.position}
        />
      )}
    </div>
  )
}
