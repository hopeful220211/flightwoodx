import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Undo2, Redo2, Trash2, Eraser, X, SlidersHorizontal } from 'lucide-react'
import { UserPartSchema, USER_PART_THICKNESS_MM, type UserPartDTO } from '@fwx/parts-schema'
import type { AnalyticsClientEventProperties } from '@fwx/shared'
import { useToast } from '../../components/common/Toast'
import { Modal } from '../../components/common/Modal'
import { Tooltip } from '../../components/common/Tooltip'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { createCustomPart, listCustomParts, deleteCustomPart } from '../../utils/api'
import { SketchCanvas, type SlotMode } from './canvas/SketchCanvas'
import { DimensionInput, ShapeParameters } from './canvas/SketchTools'
import { TOOL_ITEMS, controlClass, type SketchTool } from './canvas/sketchToolConfig'
import { compileSketch, type SketchShape } from './sketch/model'
import { editorHistory, initialDocument, REFERENCES, type SketchDocument } from './sketch/editorState'
import { ExtrudePreview } from './preview3d/ExtrudePreview'
import { buildUserPartDef } from './buildUserPartDef'
import { MyPartsStrip } from './MyPartsStrip'
import { PlaceCustomPartDialog } from './PlaceCustomPartDialog'
import { analyzeSketchJoints } from './sketch/jointGuides'
import { JointGuideDialog } from './JointGuideDialog'
import { SketchPreviewFeedback } from './SketchPreviewFeedback'
import { trackEvent } from '../analytics/client'
import { useDesignStore } from '../../stores/designStore'

/** All sketch coordinates are mm. The same compiled geometry drives preview
 * and persistence; display zoom and reference frames never rescale a part. */
export function PartStudioPage() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const originId = search.get('design')
  const origin = useDesignStore(s => originId ? s.getDesignById(originId) : undefined)
  const toast = useToast()
  const token = useAuthStore(s => s.token)
  const userId = useAuthStore(s => s.user?.id)
  const openLogin = useUIStore(s => s.openLoginModal)
  const [history, dispatch] = useReducer(editorHistory, undefined, () => {
    const reference = REFERENCES.find(r => r.category === search.get('category'))
    return { past: [], present: reference ? { ...initialDocument(), category: reference.category, reference: { width: reference.width, height: reference.height, shape: reference.category === 'mainboard' ? 'ellipse' as const : 'rectangle' as const } } : initialDocument(), future: [] }
  })
  const document = history.present
  const [tool, setTool] = useState<SketchTool>('rectangle')
  const [slotMode, setSlotMode] = useState<SlotMode>('cut')
  const [slotMenuOpen, setSlotMenuOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [snap, setSnap] = useState(true)
  const [pending, setPending] = useState(false)
  const sketchSectionRef = useRef<HTMLElement>(null)
  const [numericEdits, setNumericEdits] = useState<Record<string, boolean>>({})
  const onNumericEdit = useCallback((id: string, blocked: boolean) => setNumericEdits(previous => {
    if (!!previous[id] === blocked) return previous
    const next = { ...previous }
    if (blocked) next[id] = true
    else delete next[id]
    return next
  }), [])
  const numericBlocked = Object.keys(numericEdits).length > 0
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserPartDTO | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [placeTarget, setPlaceTarget] = useState<UserPartDTO | null>(null)
  const [inspectTarget, setInspectTarget] = useState<UserPartDTO | null>(null)
  const queryClient = useQueryClient()
  const selected = document.shapes.find(shape => shape.id === selectedId)
  const reference = REFERENCES.find(item => item.category === document.category)!
  const busy = saving || pending
  const commit = (next: SketchDocument) => {
    if (!saving && next !== document) dispatch({ type: 'commit', document: next })
  }
  const updateShapes = (shapes: SketchShape[]) => {
    if (!saving && JSON.stringify(shapes) !== JSON.stringify(document.shapes)) {
      trackEvent('design_edit_started', { area: 'sketch' }, { onceKey: 'edit:sketch' })
      for (const shape of shapes) {
        if (document.shapes.some(previous => previous.id === shape.id)) continue
        const shapeKind = shape.kind === 'rectangle' ? 'rect' : shape.kind === 'ellipse' ? 'circle' : tool === 'freehand' ? 'freehand' : 'polygon'
        const operation = shape.operation === 'add' ? 'add' : 'subtract'
        const jointKind = shape.joint?.kind === 'edge-slot' ? 'edge' : shape.joint?.kind === 'through-slot' ? 'internal' : 'none'
        trackEvent('sketch_shape_committed', { shapeKind, operation, jointKind }, { onceKey: `shape:${shapeKind}:${operation}:${jointKind}` })
      }
    }
    commit({ ...document, shapes })
  }
  const compiled = useMemo(() => compileSketch(document.shapes, document.reference, document.constrain), [document])
  const joints = useMemo(() => compiled.part ? analyzeSketchJoints(document.shapes, compiled.part, document.reference.width) : { guides: [], error: null }, [compiled.part, document.shapes, document.reference.width])
  const prepared = useMemo(() => {
    if (!compiled.part) return { def: null, error: compiled.error }
    try {
      return { def: buildUserPartDef({ name: '', category: document.category, points: compiled.part.contour.points, holes: compiled.part.holes?.map(hole => hole.points), closed: true, jointGuides: joints.error ? undefined : joints.guides }), error: joints.error }
    } catch (cause) {
      return { def: null, error: cause instanceof Error ? cause.message : '请检查轮廓' }
    }
  }, [compiled, document.category, joints])
  const problemShapeIds = !pending && !prepared.def ? compiled.issue?.shapeIds ?? [] : []
  const previewAvailable = Boolean(prepared.def)
  const previousPreviewReason = useRef<AnalyticsClientEventProperties<'sketch_preview_state_changed'>['reason'] | null>(null)
  useEffect(() => {
    if (pending) return
    if (!document.shapes.length) { previousPreviewReason.current = null; return }
    const reason = previewAvailable ? null : compiled.issue?.code ?? (prepared.error ? 'invalid-sketch' : null)
    if (reason === previousPreviewReason.current) return
    if (reason) trackEvent('sketch_preview_state_changed', { state: 'blocked', reason })
    else if (previousPreviewReason.current) trackEvent('sketch_preview_state_changed', { state: 'recovered', reason: previousPreviewReason.current })
    previousPreviewReason.current = reason
  }, [compiled.issue?.code, document.shapes.length, previewAvailable, pending, prepared.error])
  const focusSketch = (shapeId?: string) => {
    if (saving || numericBlocked) return
    if (shapeId && !pending && document.shapes.some(shape => shape.id === shapeId)) {
      setSelectedId(shapeId)
      setTool('select')
      setInspectorCollapsed(false)
      setSlotMenuOpen(false)
    }
    const canvas = sketchSectionRef.current?.querySelector<SVGSVGElement>('[data-testid="sketch-canvas"]')
    canvas?.scrollIntoView({ block: 'center', behavior: 'instant' })
    canvas?.focus({ preventScroll: true })
  }
  const changePurpose = (purpose: string) => {
    if (!selected || busy || numericBlocked) return
    const next = { ...selected }
    delete next.joint
    if (purpose === 'add' || purpose === 'cut') next.operation = purpose
    else {
      const axis = selected.width >= selected.height ? 'x' : 'y'
      next.operation = 'cut'; next.kind = 'rectangle'; next.radius = 0; delete next.points
      next.joint = { kind: purpose as 'edge-slot' | 'through-slot', axis, entry: purpose === 'edge-slot' ? 'start' : 'front' }
      if (axis === 'x') { next.y += (next.height - USER_PART_THICKNESS_MM) / 2; next.height = USER_PART_THICKNESS_MM; next.width = Math.max(USER_PART_THICKNESS_MM, next.width) }
      else { next.x += (next.width - USER_PART_THICKNESS_MM) / 2; next.width = USER_PART_THICKNESS_MM; next.height = Math.max(USER_PART_THICKNESS_MM, next.height) }
    }
    updateShapes(document.shapes.map(shape => shape.id === next.id ? next : shape))
  }

  const { data: myParts = [], refetch: refetchMyParts, isError: partsError } = useQuery({
    queryKey: ['custom-parts', userId],
    queryFn: async (): Promise<UserPartDTO[]> => {
      const res = await listCustomParts(1, 50)
      if (!res.success) throw new Error(res.error || '获取零件失败')
      return UserPartSchema.array().parse(res.data?.items ?? [])
    },
    enabled: !!token,
  })

  const removeSelected = () => { if (selected && !busy && !numericBlocked) { updateShapes(document.shapes.filter(shape => shape.id !== selected.id)); setSelectedId(null) } }

  const handleSave = async () => {
    if (!prepared.def || prepared.error || busy || numericBlocked) return
    if (!token) { toast.push('info', '请先登录，再将零件保存到账号'); openLogin(); return }
    setSaving(true)
    try {
      const res = await createCustomPart({ ...prepared.def, name: name.trim() || '未命名零件' })
      if (useAuthStore.getState().token !== token) return
      if (res.success && res.data) {
        toast.push('success', `已保存「${res.data.name}」到我的零件`)
        setName(''); setSelectedId(null); dispatch({ type: 'reset' })
        await refetchMyParts()
        await queryClient.invalidateQueries({ queryKey: ['custom-parts', userId] })
        if (origin) {
          useDesignStore.getState().setActiveDesignId(origin.id)
          setPlaceTarget(res.data)
        }
      } else { trackEvent('operation_failed', { operation: 'part_save', reason: res.status === 401 || res.status === 403 ? 'unauthorized' : res.status === 400 ? 'validation' : res.status && res.status >= 500 ? 'server' : 'unknown' }); toast.push('error', res.error || '保存失败，请重试') }
    } catch { trackEvent('operation_failed', { operation: 'part_save', reason: 'unknown' }); toast.push('error', '零件保存失败，当前轮廓仍保留，请重试') }
    finally { setSaving(false) }
  }

  const handleDelete = useCallback(async (id: string) => {
    if (deleting) return
    const requestToken = useAuthStore.getState().token
    setDeleting(true)
    try {
      const res = await deleteCustomPart(id)
      if (useAuthStore.getState().token !== requestToken) { setDeleteTarget(null); return }
      if (res.success) {
        setDeleteTarget(null); toast.push('success', '已删除')
        await refetchMyParts()
        await queryClient.invalidateQueries({ queryKey: ['custom-assembly-part', userId] })
      } else toast.push('error', res.error || '删除失败')
    } catch { toast.push('error', '删除失败，请重试') }
    finally { setDeleting(false) }
  }, [toast, refetchMyParts, deleting, queryClient, userId])

  const handleBack = () => { if (origin) navigate(`/design/${origin.id}`); else if (window.history.length > 1) navigate(-1); else navigate('/design') }
  const panelHeadingClass = 'flex h-16 min-w-0 shrink-0 items-center gap-2 border-b border-sky-100 bg-white px-3'
  const iconButtonClass = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sky-900 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-35'
  return <div className="part-studio-root min-h-[calc(100dvh-4rem)] text-slate-800" onKeyDown={event => {
    if (busy || numericBlocked || (event.target as HTMLElement).closest('input,select,textarea')) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }) }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); dispatch({ type: 'redo' }) }
  }}>
    {partsError && <div role="alert" className="flex items-center justify-between gap-3 bg-amber-50 px-5 py-3 text-sm text-amber-900">零件列表加载失败，画布内容仍保留。<button type="button" onClick={() => void refetchMyParts()} className={controlClass}>重试</button></div>}
    <h1 className="sr-only">零件绘制</h1>

    <fieldset aria-label="参考范围" disabled={busy} className="border-b border-sky-100 bg-white px-4 py-2 lg:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">参考类型<select aria-label="参考类型" value={document.category} onChange={event => {
          const next = REFERENCES.find(item => item.category === event.target.value)!
          commit({ ...document, category: next.category, reference: { width: next.width, height: next.height, shape: next.category === 'mainboard' ? 'ellipse' : 'rectangle' } })
        }} className={controlClass}>{REFERENCES.map(item => <option key={item.category} value={item.category}>{item.label}</option>)}</select></label>
        <label className="flex items-center gap-2 text-xs">参考形状<select aria-label="参考形状" value={document.reference.shape ?? 'rectangle'} onChange={event => commit({ ...document, reference: { ...document.reference, shape: event.target.value as 'rectangle' | 'ellipse' } })} className={controlClass}><option value="rectangle">矩形</option><option value="ellipse">圆形 / 椭圆</option></select></label>
        <DimensionInput label="参考宽" value={document.reference.width} onEditingChange={onNumericEdit} onChange={width => commit({ ...document, reference: { ...document.reference, width } })} />
        <DimensionInput label="参考高" value={document.reference.height} onEditingChange={onNumericEdit} onChange={height => commit({ ...document, reference: { ...document.reference, height } })} />
        <span className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">板厚 2 mm</span>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={document.constrain} onChange={event => commit({ ...document, constrain: event.target.checked })} />限制实体在参考范围内</label>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">参考 {reference.source}。修改范围不缩放图形。</p>
    </fieldset>

    <div className="grid min-w-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section ref={sketchSectionRef} className="min-w-0 border-b border-sky-100 lg:border-b-0 lg:border-r" aria-label="二维设计">
        <header data-testid="sketch-panel-heading" className={panelHeadingClass}>
          <button type="button" aria-label="返回" title="返回" onClick={handleBack} disabled={saving} className={iconButtonClass}><ArrowLeft size={18} /></button>
          <h2 className="shrink-0 text-sm font-semibold text-ink-900">二维设计</h2>
          <input aria-label="零件名称" disabled={saving} value={name} onChange={event => setName(event.target.value)} placeholder="零件名称" maxLength={40} className="ml-auto h-9 w-24 min-w-0 rounded-lg border border-sky-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-sky-300 sm:w-40" />
          <button type="button" onClick={() => void handleSave()} disabled={!prepared.def || !!prepared.error || busy || numericBlocked} title={numericBlocked ? '请先确认或修正尺寸输入' : prepared.error ?? (!prepared.def ? '请先完成有效的零件轮廓' : pending ? '请先完成或取消当前绘制' : '保存到我的零件')} className="min-h-10 shrink-0 rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{saving ? '保存中…' : '保存'}</button>
        </header>
        <SketchCanvas shapes={document.shapes} reference={document.reference} part={compiled.part} problemShapeIds={problemShapeIds} referenceInvalid={!pending && compiled.issue?.code === 'outside-reference'} jointGuides={joints.guides} tool={tool} slotMode={slotMode} selectedId={selectedId} snap={snap} disabled={saving || numericBlocked} onChange={updateShapes} onSelect={id => { if (!numericBlocked) { if (id !== selectedId) setInspectorCollapsed(false); setSelectedId(id); if (id) { setTool('select'); setSlotMenuOpen(false) } } }} onPendingChange={setPending} validateInsertion={shape => {
          const next = compileSketch([...document.shapes, shape], document.reference, document.constrain)
          if (!next.part) return '插接口不能切断木板，请缩短深度或换一个位置。'
          return analyzeSketchJoints([...document.shapes, shape], next.part, document.reference.width).error ? '这里无法形成完整插接口，请避开已有孔槽并保留槽底。' : null
        }}>
          {selected && !inspectorCollapsed && <section aria-label="图形属性" className="absolute right-3 top-3 z-10 w-[224px] max-w-[calc(100%-24px)] rounded-xl border border-sky-100 bg-white p-3 shadow-lg shadow-sky-950/10">
            <div className="mb-2 flex items-center justify-between gap-2"><h3 className="sr-only">图形属性</h3><select aria-label="形状用途" disabled={busy || numericBlocked} value={selected.joint?.kind ?? selected.operation} onChange={event => changePurpose(event.target.value)} className="h-9 rounded-lg border border-sky-200 bg-white px-2 text-xs text-sky-950"><option value="add">实体</option><option value="cut">普通切孔</option>{selected.kind === 'rectangle' && <><option value="edge-slot">边缘插槽</option><option value="through-slot">板内插槽</option></>}</select><span className="ml-auto text-xs text-slate-400">mm</span><button type="button" aria-label="取消选择" title="取消选择" disabled={busy || numericBlocked} onClick={event => { const canvas = event.currentTarget.closest('section[aria-label="二维设计"]')?.querySelector<SVGSVGElement>('svg[data-testid="sketch-canvas"]'); setSelectedId(null); canvas?.focus({ preventScroll: true }) }} className="-mr-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-sky-50 disabled:opacity-35"><X size={15} /></button></div>
            <fieldset disabled={busy}><ShapeParameters key={selected.id} shape={selected} onEditingChange={onNumericEdit} onChange={shape => updateShapes(document.shapes.map(item => item.id === shape.id ? shape : item))} /></fieldset>
          </section>}
          {slotMenuOpen && tool === 'slot' && !pending && !selected && <section aria-label="开孔方式" className="absolute bottom-[176px] left-3 z-20 w-60 max-w-[calc(100%-24px)] rounded-xl border border-red-100 bg-white p-2 shadow-lg min-[440px]:bottom-[128px]" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSlotMenuOpen(false); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('button[aria-label="孔 / 开口"]')?.focus() } }}>
            <div className="flex items-center justify-between px-2 text-xs text-slate-500">开孔方式<button type="button" aria-label="关闭开孔方式" onClick={() => setSlotMenuOpen(false)} className="h-9 w-9 rounded-lg hover:bg-red-50"><X size={15} /></button></div>
            {([{ key: 'cut', label: '普通切孔', detail: '宽、高自由调整；不定义拼接。' }, { key: 'edge-slot', label: '边缘插槽', detail: '槽宽 2 mm，从板边沿槽向内插入。' }, { key: 'through-slot', label: '板内插槽', detail: '槽宽 2 mm，接收另一块板的插片。' }] as const).map(mode => <button key={mode.key} type="button" aria-label={mode.label} aria-pressed={slotMode === mode.key} onClick={event => { setSlotMode(mode.key); setSlotMenuOpen(false); event.currentTarget.closest('section[aria-label="二维设计"]')?.querySelector<SVGSVGElement>('svg[data-testid="sketch-canvas"]')?.focus({ preventScroll: true }) }} className={`block min-h-12 w-full rounded-lg px-2 py-2 text-left ${slotMode === mode.key ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-red-50'}`}><span className="block text-sm font-medium">{mode.label}</span><span className="block text-xs">{mode.detail}</span></button>)}
          </section>}
          <div data-testid="sketch-toolbar" className="absolute bottom-3 left-1/2 z-10 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-sky-100 bg-white p-2 shadow-lg shadow-sky-950/10">
            <fieldset disabled={busy} className="grid min-w-0 max-w-full grid-cols-4 items-center justify-center gap-0.5 min-[440px]:flex min-[440px]:flex-wrap" role="group" aria-label="绘图工具">
              {TOOL_ITEMS.map(item => {
                const isCut = item.key === 'circle-hole' || item.key === 'slot' || item.key === 'insert-slot'
                const colors = isCut
                  ? `focus-visible:outline-red-500 ${tool === item.key ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'}`
                  : `focus-visible:outline-sky-500 ${tool === item.key ? 'bg-sky-500 text-white' : 'text-sky-900 hover:bg-sky-50'}`
                return <Tooltip key={item.key} content={item.key === 'slot' ? '矩形开孔' : item.label} placement="top"><button type="button" aria-label={item.label} aria-pressed={tool === item.key} aria-expanded={item.key === 'slot' ? slotMenuOpen : undefined} onClick={() => { if (numericBlocked) return; setTool(item.key); setSlotMenuOpen(item.key === 'slot'); if (item.key === 'slot') setSlotMode('cut'); if (item.key !== 'select') { setSelectedId(null); setInspectorCollapsed(false) } }} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 disabled:opacity-35 ${colors}`}><item.icon size={21} /><span className="sr-only">{item.label}</span></button></Tooltip>
              })}
            </fieldset>
            <div className="flex items-center gap-0.5 border-sky-100 px-1" role="group" aria-label="编辑操作">
              <Tooltip content="撤销" placement="top"><button type="button" aria-label="撤销" disabled={busy || numericBlocked || !history.past.length} onClick={() => dispatch({ type: 'undo' })} className={iconButtonClass}><Undo2 size={18} /></button></Tooltip>
              <Tooltip content="重做" placement="top"><button type="button" aria-label="重做" disabled={busy || numericBlocked || !history.future.length} onClick={() => dispatch({ type: 'redo' })} className={iconButtonClass}><Redo2 size={18} /></button></Tooltip>
              <Tooltip content="删除图形" placement="top"><button type="button" aria-label="删除图形" disabled={busy || numericBlocked || !selected} onClick={removeSelected} className={iconButtonClass}><Trash2 size={18} /></button></Tooltip>
              <Tooltip content="清空" placement="top"><button type="button" aria-label="清空" disabled={busy || numericBlocked || !document.shapes.length} onClick={() => { updateShapes([]); setSelectedId(null) }} className={iconButtonClass}><Eraser size={18} /></button></Tooltip>
              <Tooltip content={inspectorCollapsed ? '显示图形属性' : '收起图形属性'} placement="top"><button type="button" aria-label={inspectorCollapsed ? '显示图形属性' : '收起图形属性'} aria-expanded={!!selected && !inspectorCollapsed} disabled={busy || numericBlocked || !selected} onClick={() => setInspectorCollapsed(value => !value)} className={`${iconButtonClass} ${selected && !inspectorCollapsed ? 'bg-sky-50' : ''}`}><SlidersHorizontal size={18} /></button></Tooltip>
              <Tooltip content="对齐到 1 mm 网格" placement="top"><label className="ml-2 flex min-h-10 items-center gap-1.5 whitespace-nowrap text-xs text-slate-600"><input type="checkbox" disabled={busy} checked={snap} onChange={event => setSnap(event.target.checked)} />1 mm 吸附</label></Tooltip>
            </div>
          </div>
        </SketchCanvas>
        <div className={`min-h-12 px-4 py-3 text-xs leading-5 ${!pending && prepared.def && prepared.error ? 'bg-amber-50 text-amber-900' : 'text-slate-500'}`} role={!pending && !numericBlocked && prepared.def && prepared.error ? 'alert' : 'status'} aria-atomic="true">
          {pending ? '完成绘制或按 Esc 取消。' : numericBlocked ? '按 Enter 确认尺寸，或按 Esc 取消修改。' : prepared.def ? prepared.error ?? `零件范围 ${prepared.def.geometry.bboxMm.w} × ${prepared.def.geometry.bboxMm.h} mm · ${prepared.def.geometry.holes.length} 个内孔` : null}
          {selected?.joint && <p className="mt-1 text-[11px] leading-5 text-slate-600">{selected.joint.kind === 'through-slot' ? '将等长、2 mm 厚的插片从标记的板面插入。' : '蓝点为槽底对接点，箭头为插入方向；配对木片垂直交叉。'}</p>}
        </div>
      </section>
      <section className="flex min-w-0 flex-col" aria-label="木板三维预览">
        <header data-testid="preview-panel-heading" className={panelHeadingClass}><h2 className="text-sm font-semibold text-ink-900">木板三维预览</h2><span className="ml-auto text-xs text-slate-500">实时更新 · 板厚 2 mm</span></header>
        <div className="h-[clamp(680px,calc(100dvh-224px),1000px)] min-w-0 overflow-auto bg-sky-50/50">{prepared.def ? <ExtrudePreview geometry={prepared.def.geometry} /> : <SketchPreviewFeedback error={prepared.error} issue={compiled.issue} shapes={document.shapes} pending={pending} disabled={saving || numericBlocked} onEdit={focusSketch} />}</div>
      </section>
    </div>
    <MyPartsStrip parts={myParts} onDelete={id => setDeleteTarget(myParts.find(part => part.id === id) ?? null)} onUse={setPlaceTarget} onInspect={setInspectTarget} />
    <JointGuideDialog part={inspectTarget} onClose={() => setInspectTarget(null)} />
    {placeTarget && <PlaceCustomPartDialog part={placeTarget} onClose={() => setPlaceTarget(null)} />}
    <Modal open={!!deleteTarget} title="删除零件" onClose={() => { if (!deleting) setDeleteTarget(null) }}>
      <p className="text-sm text-slate-600">确定删除「{deleteTarget?.name}」吗？删除后无法恢复。引用它的作品将保留引用，但无法再显示该零件。</p>
      <div className="mt-5 flex justify-end gap-3"><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className={controlClass}>取消</button><button type="button" disabled={deleting} onClick={() => { if (deleteTarget) void handleDelete(deleteTarget.id) }} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">{deleting ? '删除中…' : '确认删除'}</button></div>
    </Modal>
  </div>
}
